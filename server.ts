import express, { Request, Response, NextFunction } from "express";
import { createClient, User } from "@supabase/supabase-js";
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const SUPABASE_URL = required("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = required("SUPABASE_ANON_KEY");
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || "";

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// -----------------------------------------------------------------------------
// CORS — allow the Netlify frontend to call this backend
// Registered before body parsers and routes so OPTIONS preflight and CORS
// headers apply to every request (including the Paystack webhook).
// -----------------------------------------------------------------------------
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.length === 0)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use("/api/paystack/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));

type AuthRequest = Request & { user?: User };
type RoundRow = {
  id: string;
  nonce: number;
  server_seed: string;
  server_seed_hash: string;
  client_seed: string;
  crash_multiplier: number;
  status: "waiting" | "in_flight" | "crashed";
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};

const CLIENT_SEED = process.env.GAME_CLIENT_SEED || "flyjet-kenya-v1";
const TICK_MS = 100;
const WAIT_SECONDS = 5;
const ENGINE_OWNER_ID = crypto.randomUUID();
const ENGINE_LEASE_SECONDS = 15;
const ENGINE_RENEW_MS = 5000;

let engineLeaseOwned = false;
let engineTimer: NodeJS.Timeout | undefined;
let leaseTimer: NodeJS.Timeout | undefined;

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeKenyanPhone(input: unknown): string | null {
  let phone = String(input || "").trim().replace(/[\s()-]/g, "");

  if (phone.startsWith("07") || phone.startsWith("01")) {
    phone = "+254" + phone.slice(1);
  } else if (phone.startsWith("2547") || phone.startsWith("2541")) {
    phone = "+" + phone;
  }

  return /^\+254[17]\d{8}$/.test(phone) ? phone : null;
}

function isPaystackSecretValid(): boolean {
  return /^sk_(test|live)_[A-Za-z0-9]{20,}$/.test(PAYSTACK_SECRET_KEY);
}

/**
 * Deterministic crash formula:
 * - SHA-256(serverSeed:clientSeed:nonce)
 * - First 52 bits are used as the random integer.
 * - 1/33 of rounds are instant crashes at 1.00x.
 *
 * Keep this formula identical in all verification tools.
 */
function calculateCrashMultiplier(
  serverSeed: string,
  clientSeed: string,
  nonce: number
): number {
  const hash = crypto
    .createHash("sha256")
    .update(`${serverSeed}:${clientSeed}:${nonce}`)
    .digest("hex");

  const e = 2 ** 52;
  const n = Number(BigInt(`0x${hash.slice(0, 13)}`) % BigInt(e));

  if (n % 33 === 0) return 1;

  const multiplier = Math.floor((100 * e) / (e - n)) / 100;
  return Math.max(1, Math.min(1000, multiplier));
}

function multiplierAtElapsedSeconds(elapsedSeconds: number): number {
  const elapsed = Math.max(0, elapsedSeconds);
  return Number(
    (1 + 0.058 * Math.pow(elapsed * 1.65, 1.72)).toFixed(2)
  );
}

async function rpc<T = any>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return res.status(401).json({ error: "Bearer access token required." });
    }

    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: "Invalid or expired session." });
    }

    req.user = data.user;
    next();
  } catch {
    return res.status(401).json({ error: "Authentication failed." });
  }
}

function userId(req: AuthRequest): string {
  if (!req.user) throw new Error("Authenticated user missing.");
  return req.user.id;
}

async function getWallet(uid: string) {
  const { data, error } = await db
    .from("wallets")
    .select("user_id,balance_kes,updated_at")
    .eq("user_id", uid)
    .single();

  if (error) throw error;

  return {
    userId: data.user_id,
    balanceKes: Number(data.balance_kes),
    updatedAt: data.updated_at
  };
}

async function getProfile(uid: string) {
  const { data, error } = await db
    .from("profiles")
    .select("id,email,full_name,phone,date_of_birth,is_verified_adult,created_at")
    .eq("id", uid)
    .single();

  if (error) throw error;
  return data;
}

function publicUser(profile: any) {
  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    isVerifiedAdult: profile.is_verified_adult
  };
}

// -----------------------------------------------------------------------------
// AUTHENTICATION
// -----------------------------------------------------------------------------

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, fullName, phone, dateOfBirth, termsAccepted } =
      req.body || {};

    if (!email || !password || !fullName || !phone || !dateOfBirth) {
      return res.status(400).json({ error: "All registration fields are required." });
    }

    if (String(password).length < 10) {
      return res.status(400).json({ error: "Use a password of at least 10 characters." });
    }

    if (termsAccepted !== true) {
      return res.status(400).json({ error: "You must accept the Terms & Conditions." });
    }

    const dob = new Date(`${dateOfBirth}T00:00:00Z`);
    if (!Number.isFinite(dob.getTime()) || dob > new Date()) {
      return res.status(400).json({ error: "A valid date of birth is required." });
    }

    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 18);
    if (dob > cutoff) {
      return res.status(403).json({ error: "Registration is restricted to adults aged 18 or older." });
    }

    const normalizedPhone = normalizeKenyanPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: "Enter a valid Kenyan phone number." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const { data, error } = await authClient.auth.signUp({
      email: normalizedEmail,
      password: String(password),
      options: {
        data: {
          full_name: String(fullName).trim(),
          phone: normalizedPhone,
          date_of_birth: dateOfBirth
        }
      }
    });

    if (error) return res.status(400).json({ error: error.message });
    if (!data.user) return res.status(400).json({ error: "Registration could not be completed." });

    // The auth trigger creates the profile and wallet.
    // This records the DOB and contact details, but does not claim independent
    // identity/age verification.
    const { error: updateError } = await db
      .from("profiles")
      .update({
        email: normalizedEmail,
        full_name: String(fullName).trim(),
        phone: normalizedPhone,
        date_of_birth: dateOfBirth
      })
      .eq("id", data.user.id);

    if (updateError) throw updateError;

    const profile = await getProfile(data.user.id);
    const wallet = await getWallet(data.user.id);

    return res.status(201).json({
      success: true,
      requiresEmailConfirmation: !data.session,
      user: publicUser(profile),
      wallet,
      session: data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at
          }
        : null
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Registration failed." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const { data, error } = await authClient.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password: String(password)
    });

    if (error || !data.user || !data.session) {
      return res.status(401).json({ error: error?.message || "Invalid login." });
    }

    const [profile, wallet] = await Promise.all([
      getProfile(data.user.id),
      getWallet(data.user.id)
    ]);

    return res.json({
      success: true,
      user: publicUser(profile),
      wallet,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Login failed." });
  }
});

app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = userId(req);
    const [profile, wallet] = await Promise.all([getProfile(uid), getWallet(uid)]);
    return res.json({ user: publicUser(profile), wallet });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/auth/logout", requireAuth, (_req, res) => {
  res.json({ success: true, message: "Clear the access and refresh tokens in the client." });
});

// -----------------------------------------------------------------------------
// PAYSTACK
// -----------------------------------------------------------------------------

app.get("/api/paystack/config", (_req, res) => {
  res.json({
    publicKey: PAYSTACK_PUBLIC_KEY,
    hasLiveSecret: /^sk_live_/.test(PAYSTACK_SECRET_KEY),
    keyMode: PAYSTACK_SECRET_KEY.startsWith("sk_live_")
      ? "live"
      : PAYSTACK_SECRET_KEY.startsWith("sk_test_")
        ? "test"
        : "missing",
    currency: "KES",
    minDepositKes: 50,
    channels: ["mobile_money"]
  });
});

async function initializePaystackDeposit(
  uid: string,
  amountKes: number,
  phone: string,
  channel: string,
  email: string
) {
  const reference = `FLYJET-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const amountSubunits = Math.round(amountKes * 100);

  const { error } = await db.from("payment_events").insert({
    user_id: uid,
    reference,
    amount_kes: amountKes,
    channel,
    phone,
    status: "pending"
  });

  if (error) throw error;
  return { reference, amountSubunits, email, phone, channel };
}

class PaymentPendingError extends Error {}
class PaymentRejectedError extends Error {}

async function verifyAndCredit(uid: string, reference: string, expectedAmount?: number) {
  if (!isPaystackSecretValid()) throw new Error("Paystack is not configured.");

  const { data: paymentEvent, error: eventError } = await db
    .from("payment_events")
    .select("user_id,amount_kes,channel,phone,status")
    .eq("reference", reference)
    .maybeSingle();

  if (eventError) throw eventError;
  if (!paymentEvent || paymentEvent.user_id !== uid) {
    throw new PaymentRejectedError("Payment reference does not belong to this account.");
  }

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
  );

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || !payload.status) {
    throw new Error(payload.message || "Paystack verification service failed.");
  }

  const data = payload.data;
  if (data?.status === "pending" || data?.status === "ongoing" || data?.status === "processing") {
    throw new PaymentPendingError("Payment is still awaiting confirmation.");
  }

  if (data?.status !== "success") {
    throw new PaymentRejectedError("Paystack has not confirmed this payment.");
  }

  const amount = Number(data.amount) / 100;
  if (
    data.currency !== "KES" ||
    amount < 50 ||
    money(amount) !== money(Number(paymentEvent.amount_kes)) ||
    (expectedAmount !== undefined && money(expectedAmount) !== money(amount))
  ) {
    throw new PaymentRejectedError("Verified payment amount or currency does not match.");
  }

  if (data.metadata?.user_id !== uid) {
    throw new PaymentRejectedError("Payment does not belong to this account.");
  }

  const metadataChannel = data.metadata?.channel || paymentEvent.channel;
  const metadataPhone = data.metadata?.phone || paymentEvent.phone;

  if (
    metadataChannel !== paymentEvent.channel ||
    metadataPhone !== paymentEvent.phone
  ) {
    throw new PaymentRejectedError("Payment metadata does not match the pending payment.");
  }

  return await rpc("credit_wallet_deposit", {
    p_user_id: uid,
    p_amount_kes: amount,
    p_paystack_reference: reference,
    p_channel: paymentEvent.channel,
    p_phone: paymentEvent.phone
  });
}

app.post("/api/paystack/stk-push", requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = userId(req);
    const amount = Number(req.body.amountKes);

    if (!Number.isFinite(amount) || amount < 50 || amount > 1000000) {
      return res.status(400).json({ error: "Deposit must be between KES 50 and 1,000,000." });
    }

    const phone = normalizeKenyanPhone(req.body.phone);
    if (!phone) return res.status(400).json({ error: "Invalid Kenyan mobile number." });

    const channel = req.body.channel === "airtel" ? "airtel" : "mpesa";
    if (!isPaystackSecretValid()) {
      return res.status(503).json({ error: "Paystack secret key is not configured." });
    }

    const profile = await getProfile(uid);
    const init = await initializePaystackDeposit(uid, amount, phone, channel, profile.email);

    const response = await fetch("https://api.paystack.co/charge", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: profile.email,
        amount: init.amountSubunits,
        currency: "KES",
        reference: init.reference,
        mobile_money: {
          phone,
          provider: channel === "airtel" ? "atl" : "mpesa"
        },
        metadata: { user_id: uid, phone, channel }
      })
    });

    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || !payload.status || !payload.data) {
      await db.from("payment_events")
        .update({ status: "failed", provider_response: payload })
        .eq("reference", init.reference);

      return res.status(502).json({
        error: payload.message || "Paystack charge could not be started."
      });
    }

    await db.from("payment_events")
      .update({ provider_response: payload.data })
      .eq("reference", init.reference);

    if (payload.data.status === "success") {
      const creditResult: any = await verifyAndCredit(uid, init.reference, amount);
      const wallet = await getWallet(uid);

      return res.json({
        success: true,
        status: "success",
        mode: "live_stk_completed",
        reference: init.reference,
        amountKes: amount,
        amountSubunits: init.amountSubunits,
        creditResult,
        newBalanceKes: wallet.balanceKes,
        publicKey: PAYSTACK_PUBLIC_KEY
      });
    }

    return res.status(202).json({
      success: true,
      status: payload.data.status || "pending",
      mode: "live_stk_pending",
      reference: init.reference,
      amountKes: amount,
      amountSubunits: init.amountSubunits,
      publicKey: PAYSTACK_PUBLIC_KEY,
      displayText: payload.data.display_text || "Approve the payment on your phone."
    });
  } catch (e: any) {
    return res.status(502).json({ error: e.message || "Paystack request failed." });
  }
});

app.post("/api/paystack/initialize", requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = userId(req);
    const amount = Number(req.body.amountKes);

    if (!Number.isFinite(amount) || amount < 50 || amount > 1000000) {
      return res.status(400).json({ error: "Invalid deposit amount." });
    }

    if (!isPaystackSecretValid()) {
      return res.status(503).json({ error: "Paystack secret key is not configured." });
    }

    const profile = await getProfile(uid);
    const phone = normalizeKenyanPhone(req.body.phone) || profile.phone;
    if (!phone) return res.status(400).json({ error: "A valid phone number is required." });

    const channel = req.body.channel === "airtel" ? "airtel" : "mpesa";
    const init = await initializePaystackDeposit(uid, amount, phone, channel, profile.email);

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: profile.email,
        amount: init.amountSubunits,
        currency: "KES",
        reference: init.reference,
        channels: ["mobile_money"],
        metadata: { user_id: uid, phone, channel }
      })
    });

    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || !payload.status || !payload.data) {
      await db.from("payment_events")
        .update({ status: "failed", provider_response: payload })
        .eq("reference", init.reference);

      return res.status(502).json({
        error: payload.message || "Could not initialize payment."
      });
    }

    await db.from("payment_events")
      .update({ provider_response: payload.data })
      .eq("reference", init.reference);

    return res.json({
      success: true,
      reference: init.reference,
      authorizationUrl: payload.data.authorization_url,
      accessCode: payload.data.access_code,
      amountKes: amount,
      amountSubunits: init.amountSubunits,
      currency: "KES",
      publicKey: PAYSTACK_PUBLIC_KEY
    });
  } catch (e: any) {
    return res.status(502).json({ error: e.message || "Payment initialization failed." });
  }
});

app.post("/api/paystack/verify", requireAuth, async (req: AuthRequest, res) => {
  const uid = userId(req);
  const reference = String(req.body.reference || "").trim();

  if (!reference) return res.status(400).json({ error: "Paystack reference is required." });

  try {
    const creditResult: any = await verifyAndCredit(uid, reference);
    const wallet = await getWallet(uid);

    return res.json({
      success: true,
      status: "success",
      reference,
      creditResult,
      newBalanceKes: wallet.balanceKes,
      gatewayResponse: "Payment verified successfully."
    });
  } catch (e: any) {
    if (e instanceof PaymentPendingError) {
      return res.status(202).json({
        success: false,
        status: "pending",
        message: e.message
      });
    }

    if (e instanceof PaymentRejectedError) {
      return res.status(400).json({ success: false, status: "failed", error: e.message });
    }

    console.error("Paystack verification error:", e.message);
    return res.status(502).json({ success: false, status: "error", error: "Unable to verify payment right now." });
  }
});

app.post("/api/paystack/webhook", async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || !PAYSTACK_SECRET_KEY) {
      return res.status(400).json({ error: "Webhook configuration error." });
    }

    const signature = String(req.headers["x-paystack-signature"] || "");
    const expected = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(req.body).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: "Invalid webhook signature." });
    }

    const payload = JSON.parse(req.body.toString("utf8"));
    if (payload.event !== "charge.success") {
      return res.status(200).json({ received: true });
    }

    const reference = String(payload.data?.reference || "");
    const uid = String(payload.data?.metadata?.user_id || "");
    if (!reference || !uid) {
      return res.status(400).json({ error: "Missing payment metadata." });
    }

    await verifyAndCredit(uid, reference);
    return res.status(200).json({ received: true });
  } catch (e: any) {
    console.error("Paystack webhook:", e.message);
    return res.status(500).json({ error: "Webhook processing failed; Paystack may retry." });
  }
});

// -----------------------------------------------------------------------------
// GAME ENGINE — SUPABASE IS THE SOURCE OF TRUTH
// -----------------------------------------------------------------------------

async function getActiveRound(): Promise<RoundRow | null> {
  const { data, error } = await db
    .from("game_rounds")
    .select("*")
    .in("status", ["waiting", "in_flight"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as RoundRow | null;
}

async function getHistory(limit = 25) {
  const { data, error } = await db
    .from("game_rounds")
    .select("id,crash_multiplier,server_seed,server_seed_hash,client_seed,nonce,ended_at")
    .eq("status", "crashed")
    .order("ended_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []).map((round: any) => ({
    id: round.id,
    multiplier: Number(round.crash_multiplier),
    serverSeed: round.server_seed,
    serverSeedHash: round.server_seed_hash,
    clientSeed: round.client_seed,
    nonce: Number(round.nonce),
    endedAt: round.ended_at
  }));
}

async function getGameState() {
  const [round, history] = await Promise.all([getActiveRound(), getHistory(25)]);

  let countdown = 0;
  let multiplier = 1;

  if (round?.status === "waiting") {
    const endAt = new Date(round.created_at).getTime() + WAIT_SECONDS * 1000;
    countdown = Math.max(0, Number(((endAt - Date.now()) / 1000).toFixed(1)));
  } else if (round?.status === "in_flight" && round.started_at) {
    const elapsed = (Date.now() - new Date(round.started_at).getTime()) / 1000;
    multiplier = multiplierAtElapsedSeconds(elapsed);
  }

  return {
    currentRound: round
      ? {
          id: round.id,
          status: round.status,
          serverSeedHash: round.server_seed_hash,
          clientSeed: round.client_seed,
          nonce: Number(round.nonce)
        }
      : null,
    currentMultiplier: multiplier,
    countdown,
    history
  };
}

async function createRoundIfNeeded() {
  const existing = await getActiveRound();
  if (existing) return existing;

  // Avoid creating a new round immediately after a crash.
  const { data: latest, error: latestError } = await db
    .from("game_rounds")
    .select("ended_at")
    .eq("status", "crashed")
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;

  if (
    latest?.ended_at &&
    Date.now() - new Date(latest.ended_at).getTime() < 1500
  ) {
    return null;
  }

  const nonce = Number(await rpc("next_flyjet_nonce", {}));
  if (!Number.isSafeInteger(nonce) || nonce < 1) {
    throw new Error("Nonce sequence returned an invalid value.");
  }

  const serverSeed = crypto.randomBytes(32).toString("hex");
  const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
  const crashMultiplier = calculateCrashMultiplier(serverSeed, CLIENT_SEED, nonce);

  const { data, error } = await db
    .from("game_rounds")
    .insert({
      nonce,
      server_seed: serverSeed,
      server_seed_hash: serverSeedHash,
      client_seed: CLIENT_SEED,
      crash_multiplier: crashMultiplier,
      status: "waiting"
    })
    .select("*")
    .single();

  if (error) {
    // A competing process may have inserted the active round first.
    if (error.code === "23505") return await getActiveRound();
    throw error;
  }

  return data as RoundRow;
}

async function settleCashout(bet: any, multiplier: number) {
  try {
    const result: any = await rpc("cashout_bet", {
      p_bet_id: bet.id,
      p_multiplier: multiplier
    });

    return {
      userId: bet.user_id,
      roundId: bet.round_id,
      panelIndex: bet.panel_index,
      winAmountKes: Number(result.win_amount_kes),
      multiplier: Number(result.multiplier ?? multiplier),
      newBalanceKes: Number(result.new_balance_kes)
    };
  } catch (e: any) {
    // The database function is authoritative; a rejected cashout is not
    // marked successful in application memory.
    console.error("Automatic cashout rejected:", e.message);
    return null;
  }
}

async function engineTick() {
  if (!engineLeaseOwned) return;

  const round = await createRoundIfNeeded();
  if (!round) return;

  if (round.status === "waiting") {
    const launchAt = new Date(round.created_at).getTime() + WAIT_SECONDS * 1000;
    if (Date.now() >= launchAt) {
      const { error } = await db
        .from("game_rounds")
        .update({ status: "in_flight", started_at: new Date().toISOString() })
        .eq("id", round.id)
        .eq("status", "waiting");

      if (error) throw error;
    }
    return;
  }

  if (round.status !== "in_flight" || !round.started_at) return;

  const elapsed = (Date.now() - new Date(round.started_at).getTime()) / 1000;
  const multiplier = multiplierAtElapsedSeconds(elapsed);
  const crashAt = Number(round.crash_multiplier);

  const { data: bets, error: betsError } = await db
    .from("bets")
    .select("id,user_id,round_id,panel_index,auto_cashout_multiplier")
    .eq("round_id", round.id)
    .eq("status", "placed");

  if (betsError) throw betsError;

  for (const bet of bets || []) {
    const auto = Number(bet.auto_cashout_multiplier);
    if (
      bet.auto_cashout_multiplier !== null &&
      Number.isFinite(auto) &&
      auto < crashAt &&
      multiplier >= auto
    ) {
      await settleCashout(bet, auto);
    }
  }

  if (multiplier >= crashAt) {
    // Conditional update ensures only the still-active round is crashed.
    const { data: crashed, error: crashError } = await db
      .from("game_rounds")
      .update({ status: "crashed", ended_at: new Date().toISOString() })
      .eq("id", round.id)
      .eq("status", "in_flight")
      .select("id")
      .maybeSingle();

    if (crashError) throw crashError;

    if (crashed) {
      const { error: betError } = await db
        .from("bets")
        .update({ status: "crashed", settled_at: new Date().toISOString() })
        .eq("round_id", round.id)
        .eq("status", "placed");

      if (betError) throw betError;
    }
  }
}

function parseLockResult(data: any): boolean {
  if (typeof data === "boolean") return data;
  if (typeof data === "string") return data.toLowerCase() === "true";
  if (typeof data === "number") return data === 1;
  if (Array.isArray(data)) return data.some(parseLockResult);

  if (data && typeof data === "object") {
    for (const key of ["acquired", "success", "locked", "is_owner", "result"]) {
      if (key in data) return parseLockResult(data[key]);
    }
  }
  return false;
}

async function renewEngineLease() {
  try {
    const result = await rpc<any>("acquire_flyjet_engine_lock", {
      p_owner_id: ENGINE_OWNER_ID,
      p_lease_seconds: ENGINE_LEASE_SECONDS
    });

    engineLeaseOwned = parseLockResult(result);
  } catch (e: any) {
    engineLeaseOwned = false;
    console.error("Engine lease renewal failed; engine paused:", e.message);
  }
}

async function startEngine() {
  await renewEngineLease();

  leaseTimer = setInterval(() => {
    void renewEngineLease();
  }, ENGINE_RENEW_MS);

  engineTimer = setInterval(() => {
    if (engineLeaseOwned) {
      void engineTick().catch(e => console.error("Game engine tick failed:", e.message));
    }
  }, TICK_MS);

  console.log(`[FlyJet] Engine coordinator started. Lease owner: ${ENGINE_OWNER_ID}`);
}

// -----------------------------------------------------------------------------
// DATABASE-BACKED SSE AND STATE
// -----------------------------------------------------------------------------

function writeSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

app.get("/api/game/events", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let closed = false;
  let previous: any = null;

  const sendState = async () => {
    if (closed) return;

    try {
      const state = await getGameState();

      if (!previous) {
        writeSse(res, "init", state);
      } else {
        const before = previous.currentRound;
        const after = state.currentRound;

        if (before?.id !== after?.id && after?.status === "waiting") {
          writeSse(res, "round_waiting", {
            roundId: after.id,
            serverSeedHash: after.serverSeedHash,
            countdown: state.countdown
          });
        } else if (before?.id === after?.id && before?.status === "waiting" && after?.status === "in_flight") {
          writeSse(res, "round_started", after);
        } else if (before?.id === after?.id && before?.status === "in_flight" && after?.status === "crashed") {
          writeSse(res, "round_crashed", state.history[0]);
        }

        writeSse(res, "multiplier_tick", {
          status: after?.status || "waiting",
          roundId: after?.id,
          multiplier: state.currentMultiplier,
          countdown: state.countdown
        });
      }

      previous = state;
    } catch {
      writeSse(res, "server_error", { error: "Unable to read game state." });
    }
  };

  await sendState();
  const poll = setInterval(() => void sendState(), 250);

  req.on("close", () => {
    closed = true;
    clearInterval(poll);
  });
});


app.get("/api/game/state", async (_req, res) => {
  try {
    return res.json(await getGameState());
  } catch (e: any) {
    return res.status(503).json({ error: "Game state is temporarily unavailable." });
  }
});

// -----------------------------------------------------------------------------
// BETTING
// -----------------------------------------------------------------------------

app.post("/api/bet/place", requireAuth, async (req: AuthRequest, res) => {
  try {
    const roundId = String(req.body.roundId || "");
    const stake = Number(req.body.stakeKes);
    const panelIndex = Number(req.body.panelIndex ?? 0);
    const auto = req.body.autoCashoutMultiplier == null || req.body.autoCashoutMultiplier === ""
      ? null
      : Number(req.body.autoCashoutMultiplier);

    if (!roundId) return res.status(400).json({ error: "A valid game round is required." });
    if (!Number.isFinite(stake) || stake < 10 || stake > 100000) {
      return res.status(400).json({ error: "Bet must be between KES 10 and 100,000." });
    }
    if (!Number.isInteger(panelIndex) || panelIndex < 0 || panelIndex > 1) {
      return res.status(400).json({ error: "Invalid bet panel." });
    }
    if (auto !== null && (!Number.isFinite(auto) || auto < 1.01 || auto > 1000)) {
      return res.status(400).json({ error: "Invalid auto-cashout multiplier." });
    }

    const round = await getActiveRound();
    if (!round || round.id !== roundId || round.status !== "waiting") {
      return res.status(409).json({ error: "Bets can only be placed during the waiting period." });
    }

    const result: any = await rpc("place_bet", {
      p_user_id: userId(req),
      p_round_id: roundId,
      p_panel_index: panelIndex,
      p_stake_kes: money(stake),
      p_auto_cashout_multiplier: auto
    });

    return res.json({
      success: true,
      bet: result.bet,
      remainingBalanceKes: Number(result.new_balance_kes)
    });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

app.post("/api/bet/cashout", requireAuth, async (req: AuthRequest, res) => {
  try {
    const panelIndex = Number(req.body.panelIndex ?? 0);
    if (!Number.isInteger(panelIndex) || panelIndex < 0 || panelIndex > 1) {
      return res.status(400).json({ error: "Invalid bet panel." });
    }

    const round = await getActiveRound();
    if (!round || round.status !== "in_flight") {
      return res.status(409).json({ error: "The flight is not active." });
    }

    const { data: bet, error } = await db
      .from("bets")
      .select("*")
      .eq("user_id", userId(req))
      .eq("round_id", round.id)
      .eq("panel_index", panelIndex)
      .eq("status", "placed")
      .maybeSingle();

    if (error) throw error;
    if (!bet) return res.status(404).json({ error: "No active bet found." });

    const elapsed = (Date.now() - new Date(round.started_at!).getTime()) / 1000;
    const requestedMultiplier = multiplierAtElapsedSeconds(elapsed);

    const result: any = await rpc("cashout_bet", {
      p_bet_id: bet.id,
      p_multiplier: requestedMultiplier
    });

    return res.json({
      success: true,
      bet: {
        ...bet,
        status: "cashed_out",
        cashout_multiplier: Number(result.multiplier ?? requestedMultiplier)
      },
      winAmountKes: Number(result.win_amount_kes),
      newBalanceKes: Number(result.new_balance_kes),
      multiplier: Number(result.multiplier ?? requestedMultiplier)
    });
  } catch (e: any) {
    return res.status(409).json({ error: e.message });
  }
});

app.post("/api/bet/cancel", requireAuth, async (req: AuthRequest, res) => {
  try {
    const panelIndex = Number(req.body.panelIndex ?? 0);
    if (!Number.isInteger(panelIndex) || panelIndex < 0 || panelIndex > 1) {
      return res.status(400).json({ error: "Invalid bet panel." });
    }

    const round = await getActiveRound();
    if (!round || round.status !== "waiting") {
      return res.status(409).json({ error: "Cannot cancel after takeoff." });
    }

    const result: any = await rpc("cancel_bet", {
      p_user_id: userId(req),
      p_round_id: round.id,
      p_panel_index: panelIndex
    });

    return res.json({
      success: true,
      refundedKes: Number(result.refunded_kes),
      newBalanceKes: Number(result.new_balance_kes)
    });
  } catch (e: any) {
    return res.status(409).json({ error: e.message });
  }
});

// -----------------------------------------------------------------------------
// WITHDRAWALS AND TRANSACTIONS
// -----------------------------------------------------------------------------

app.post("/api/wallet/withdraw", requireAuth, async (req: AuthRequest, res) => {
  try {
    const amount = Number(req.body.amountKes);
    const channel = req.body.channel;
    const phone = normalizeKenyanPhone(req.body.phone);

    if (!Number.isFinite(amount) || amount < 300 || amount > 1000000) {
      return res.status(400).json({ error: "Minimum withdrawal is KES 300." });
    }
    if (channel !== "mpesa" && channel !== "airtel") {
      return res.status(400).json({ error: "Choose M-Pesa or Airtel Money." });
    }
    if (!phone) return res.status(400).json({ error: "Invalid Kenyan payout phone number." });

    const result: any = await rpc("request_withdrawal", {
      p_user_id: userId(req),
      p_amount_kes: money(amount),
      p_phone: phone,
      p_channel: channel
    });

    return res.status(202).json({
      success: true,
      status: "pending",
      message: "Withdrawal request recorded for review. Funds have not yet been sent.",
      reference: result.reference,
      grossAmountKes: amount,
      newBalanceKes: Number(result.new_balance_kes)
    });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

app.get("/api/wallet/transactions", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { data, error } = await db
      .from("transactions")
      .select("id,user_id,type,amount_kes,reference,status,created_at,metadata")
      .eq("user_id", userId(req))
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    return res.json({
      transactions: (data || []).map((t: any) => ({
        id: t.id,
        userId: t.user_id,
        type: t.type,
        amountKes: Number(t.amount_kes),
        paystackReference: t.reference,
        status: t.status,
        createdAt: t.created_at,
        meta: t.metadata
      }))
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// -----------------------------------------------------------------------------
// PROVABLY FAIR VERIFICATION
// -----------------------------------------------------------------------------

app.post("/api/provably-fair/verify", (req, res) => {
  const { serverSeed, clientSeed, nonce } = req.body || {};
  const parsedNonce = Number(nonce);

  if (
    typeof serverSeed !== "string" ||
    !serverSeed ||
    typeof clientSeed !== "string" ||
    !clientSeed ||
    !Number.isSafeInteger(parsedNonce) ||
    parsedNonce < 1
  ) {
    return res.status(400).json({
      error: "serverSeed, clientSeed and a valid nonce are required."
    });
  }

  return res.json({
    serverSeed,
    serverSeedHash: crypto.createHash("sha256").update(serverSeed).digest("hex"),
    clientSeed,
    nonce: parsedNonce,
    multiplier: calculateCrashMultiplier(serverSeed, clientSeed, parsedNonce)
  });
});

// -----------------------------------------------------------------------------
// STARTUP AND SHUTDOWN
// -----------------------------------------------------------------------------

async function bootstrap() {
  await startEngine();

  const server = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[FlyJet] Listening on port ${PORT}`);
  });

  const shutdown = async () => {
    if (engineTimer) clearInterval(engineTimer);
    if (leaseTimer) clearInterval(leaseTimer);

    try {
      await rpc("release_flyjet_engine_lock", {
        p_owner_id: ENGINE_OWNER_ID
      });
    } catch (e: any) {
      console.error("Engine lock release failed:", e.message);
    }

    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch(e => {
  console.error("Fatal startup error:", e);
  process.exit(1);
});