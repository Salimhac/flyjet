import {
  ActiveBet,
  GameRound,
  PastRound,
  Transaction,
  UserProfile,
  Wallet,
} from "../types";
import { supabase } from "./supabase";

// -----------------------------------------------------------------------------
// API HELPERS
// -----------------------------------------------------------------------------

type ApiResponse<T = any> = {
  ok: boolean;
  status: number;
  data: T;
};

async function safeApiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw new Error(sessionError.message);

  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  let data: any = {};

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const responseText = await response.text();
    if (responseText) data = { error: responseText };
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function requireApiSuccess<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await safeApiFetch<T>(url, options);

  if (!response.ok) {
    const errorData = response.data as {
      error?: string;
      message?: string;
    } | null;

    throw new Error(
      errorData?.error ||
        errorData?.message ||
        `Request failed with status ${response.status}.`
    );
  }

  return response.data;
}

async function requireAuthenticatedUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Your session has expired. Please log in again.");
  }

  return user;
}

// -----------------------------------------------------------------------------
// RESPONSE MAPPERS
// -----------------------------------------------------------------------------

function mapWallet(row: any): Wallet {
  if (!row) throw new Error("Wallet data is missing.");

  return {
    userId: row.userId ?? row.user_id,
    balanceKes: Number(row.balanceKes ?? row.balance_kes ?? 0),
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

function mapTransaction(row: any): Transaction {
  return {
    id: row.id,
    userId: row.user_id ?? row.userId,
    type: row.type,
    amountKes: Number(row.amount_kes ?? row.amountKes ?? 0),
    paystackReference: row.reference ?? row.paystackReference ?? "",
    status: row.status,
    createdAt: row.created_at ?? row.createdAt,
    meta: row.metadata ?? row.meta ?? undefined,
  };
}

function mapBet(row: any): ActiveBet {
  if (!row) throw new Error("Bet data is missing.");

  return {
    betId: row.betId ?? row.id ?? row.bet_id,
    userId: row.userId ?? row.user_id,
    roundId: row.roundId ?? row.round_id,
    panelIndex: Number(row.panelIndex ?? row.panel_index),
    stakeKes: Number(row.stakeKes ?? row.stake_kes),
    autoCashoutMultiplier:
      row.autoCashoutMultiplier ?? row.auto_cashout_multiplier ?? null,
    status: row.status,
    cashoutMultiplier:
      row.cashoutMultiplier ?? row.cashout_multiplier ?? undefined,
    winAmountKes:
      row.winAmountKes != null
        ? Number(row.winAmountKes)
        : row.win_amount_kes != null
          ? Number(row.win_amount_kes)
          : undefined,
    placedAt: row.placedAt ?? row.created_at ?? row.placed_at,
  };
}

// -----------------------------------------------------------------------------
// VALIDATION
// -----------------------------------------------------------------------------

export function normalizeKenyanPhone(phone: string): string {
  let cleaned = phone.trim().replace(/[\s\-()]/g, "");

  if (cleaned.startsWith("07") || cleaned.startsWith("01")) {
    cleaned = "+254" + cleaned.substring(1);
  } else if (
    cleaned.startsWith("2547") ||
    cleaned.startsWith("2541")
  ) {
    cleaned = "+" + cleaned;
  }

  return cleaned;
}

export function validateAdultAge(
  dateOfBirth: string
): { valid: boolean; age: number; error?: string } {
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);

  if (Number.isNaN(birthDate.getTime())) {
    return {
      valid: false,
      age: 0,
      error: "Invalid date of birth provided.",
    };
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();

  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  if (age < 18) {
    return {
      valid: false,
      age,
      error: "You must be at least 18 years old.",
    };
  }

  return { valid: true, age };
}

// -----------------------------------------------------------------------------
// AUTHENTICATION
// -----------------------------------------------------------------------------

export async function registerAccount(params: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  termsAccepted: boolean;
}): Promise<{
  user: UserProfile;
  wallet: Wallet;
  requiresEmailConfirmation: boolean;
}> {
  const {
    email,
    password,
    fullName,
    phone,
    dateOfBirth,
    termsAccepted,
  } = params;

  if (
    !email.trim() ||
    !password ||
    !fullName.trim() ||
    !phone.trim() ||
    !dateOfBirth
  ) {
    throw new Error("All fields are mandatory.");
  }

  if (password.length < 10) {
    throw new Error("Password must contain at least 10 characters.");
  }

  if (!termsAccepted) {
    throw new Error("You must accept the Terms & Conditions.");
  }

  const ageCheck = validateAdultAge(dateOfBirth);
  if (!ageCheck.valid) throw new Error(ageCheck.error);

  const normalizedPhone = normalizeKenyanPhone(phone);
  if (!/^\+254[17]\d{8}$/.test(normalizedPhone)) {
    throw new Error("Enter a valid Kenyan mobile number.");
  }

  const data = await requireApiSuccess<any>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
      phone: normalizedPhone,
      dateOfBirth,
      termsAccepted: true,
    }),
  });

  if (data.session?.access_token && data.session?.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    if (error) {
      throw new Error(
        `Account created, but session setup failed: ${error.message}`
      );
    }
  }

  return {
    user: data.user,
    wallet: mapWallet(data.wallet),
    requiresEmailConfirmation: Boolean(data.requiresEmailConfirmation),
  };
}

export async function loginAccount(
  email: string,
  password: string
): Promise<{ user: UserProfile; wallet: Wallet }> {
  if (!email.trim() || !password) {
    throw new Error("Email and password are required.");
  }

  const data = await requireApiSuccess<any>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  if (!data.session?.access_token || !data.session?.refresh_token) {
    throw new Error("Supabase did not return a valid login session.");
  }

  const { error } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  if (error) {
    throw new Error(`Could not establish your session: ${error.message}`);
  }

  return {
    user: data.user,
    wallet: mapWallet(data.wallet),
  };
}

export async function syncUserSession(
  _userId?: string
): Promise<{ user: UserProfile; wallet: Wallet } | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) return null;

  const response = await safeApiFetch<any>("/api/auth/me", {
    method: "GET",
  });

  if (response.status === 401) {
    await supabase.auth.signOut();
    return null;
  }

  if (!response.ok) {
    throw new Error(
      response.data?.error || "Unable to load your account."
    );
  }

  return {
    user: response.data.user,
    wallet: mapWallet(response.data.wallet),
  };
}

export async function logoutAccount(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

// -----------------------------------------------------------------------------
// PAYSTACK CONFIGURATION AND DEPOSITS
// -----------------------------------------------------------------------------

export function isRealPaystackPublicKey(
  key: string | undefined
): boolean {
  if (!key) return false;
  return /^pk_(live|test)_[A-Za-z0-9]{20,}$/.test(key.trim());
}

export function getEnvPaystackPublicKey(): string {
  const key = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";
  return isRealPaystackPublicKey(key) ? key.trim() : "";
}

export async function fetchPaystackConfig(): Promise<{
  publicKey: string;
  hasLiveSecret: boolean;
  keyMode: "live" | "test" | "missing";
}> {
  const data = await requireApiSuccess<any>("/api/paystack/config", {
    method: "GET",
  });

  const publicKey = isRealPaystackPublicKey(data.publicKey)
    ? data.publicKey.trim()
    : getEnvPaystackPublicKey();

  return {
    publicKey,
    hasLiveSecret: Boolean(data.hasLiveSecret),
    keyMode: data.keyMode || "missing",
  };
}

export async function initiatePaystackStkPush(params: {
  userId: string;
  email: string;
  amountKes: number;
  phone: string;
  channel: "mpesa" | "airtel";
}): Promise<{
  mode: "live_stk_completed" | "live_stk_pending";
  status: string;
  domain?: string;
  reference: string;
  amountKes: number;
  amountSubunits: number;
  phone: string;
  channel: "mpesa" | "airtel";
  publicKey: string;
  displayText: string;
  newBalanceKes?: number;
}> {
  const { userId, email, amountKes, phone, channel } = params;

  const authUser = await requireAuthenticatedUser();
  if (authUser.id !== userId) {
    throw new Error("Invalid deposit account.");
  }

  if (!Number.isFinite(amountKes) || amountKes < 50 || amountKes > 1000000) {
    throw new Error("Deposit must be between 50 and 1,000,000 KES.");
  }

  const normalizedPhone = normalizeKenyanPhone(phone);
  if (!/^\+254[17]\d{8}$/.test(normalizedPhone)) {
    throw new Error("Enter a valid Kenyan mobile number.");
  }

  const data = await requireApiSuccess<any>("/api/paystack/stk-push", {
    method: "POST",
    body: JSON.stringify({
      email,
      amountKes,
      phone: normalizedPhone,
      channel,
    }),
  });

  const completed = data.status === "success";

  return {
    mode: completed ? "live_stk_completed" : "live_stk_pending",
    status: data.status || "pending",
    domain: data.domain,
    reference: data.reference,
    amountKes: Number(data.amountKes ?? amountKes),
    amountSubunits: Number(
      data.amountSubunits ?? Math.round(amountKes * 100)
    ),
    phone: normalizedPhone,
    channel,
    publicKey: isRealPaystackPublicKey(data.publicKey)
      ? data.publicKey
      : getEnvPaystackPublicKey(),
    displayText:
      data.displayText ||
      (completed
        ? "Payment confirmed."
        : `Payment request sent to ${normalizedPhone}. Approve it on your phone.`),
    newBalanceKes:
      data.newBalanceKes != null
        ? Number(data.newBalanceKes)
        : data.creditResult?.new_balance_kes != null
          ? Number(data.creditResult.new_balance_kes)
          : undefined,
  };
}

export async function verifyAndCreditPaystackDeposit(params: {
  userId: string;
  reference: string;
  amountKes: number;
  phone: string;
  channel: "mpesa" | "airtel";
}): Promise<{
  status: "success" | "pending";
  reference: string;
  newBalanceKes: number;
  gatewayResponse: string;
}> {
  const { userId, reference } = params;

  const authUser = await requireAuthenticatedUser();
  if (authUser.id !== userId) {
    throw new Error("Invalid deposit account.");
  }

  if (!reference.trim()) {
    throw new Error("Payment reference is required.");
  }

  const response = await safeApiFetch<any>("/api/paystack/verify", {
    method: "POST",
    body: JSON.stringify({ reference }),
  });

  if (response.status === 202 || response.data?.status === "pending") {
    return {
      status: "pending",
      reference,
      newBalanceKes: 0,
      gatewayResponse:
        response.data?.message || "Waiting for payment confirmation.",
    };
  }

  if (!response.ok) {
    throw new Error(
      response.data?.error || "Paystack transaction verification failed."
    );
  }

  return {
    status: "success",
    reference: response.data.reference || reference,
    newBalanceKes: Number(
      response.data.newBalanceKes ??
        response.data.wallet?.balanceKes ??
        0
    ),
    gatewayResponse:
      response.data.gatewayResponse || "Payment verified successfully.",
  };
}

// -----------------------------------------------------------------------------
// WITHDRAWALS
// -----------------------------------------------------------------------------

export async function processWithdrawal(params: {
  userId: string;
  amountKes: number;
  phone: string;
  channel: "mpesa" | "airtel";
  currentBalanceKes: number;
}): Promise<{
  reference: string;
  newBalanceKes: number;
  message: string;
}> {
  const { userId, amountKes, phone, channel } = params;

  const authUser = await requireAuthenticatedUser();
  if (authUser.id !== userId) {
    throw new Error("Invalid withdrawal account.");
  }

  if (!Number.isFinite(amountKes) || amountKes < 300 || amountKes > 1000000) {
    throw new Error("Minimum withdrawal is 300 KES.");
  }

  const normalizedPhone = normalizeKenyanPhone(phone);
  if (!/^\+254[17]\d{8}$/.test(normalizedPhone)) {
    throw new Error("Enter a valid Kenyan mobile number.");
  }

  const data = await requireApiSuccess<any>("/api/wallet/withdraw", {
    method: "POST",
    body: JSON.stringify({
      amountKes,
      phone: normalizedPhone,
      channel,
    }),
  });

  return {
    reference: data.reference,
    newBalanceKes: Number(data.newBalanceKes),
    message: data.message || "Your withdrawal request has been submitted.",
  };
}

// -----------------------------------------------------------------------------
// TRANSACTIONS
// -----------------------------------------------------------------------------

export async function fetchUserTransactions(
  userId: string
): Promise<Transaction[]> {
  const authUser = await requireAuthenticatedUser();

  if (authUser.id !== userId) {
    throw new Error("You cannot access another user's transactions.");
  }

  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id,user_id,type,amount_kes,reference,status,created_at,metadata"
    )
    .eq("user_id", authUser.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Unable to load transactions: ${error.message}`);
  }

  return (data || []).map(mapTransaction);
}

// -----------------------------------------------------------------------------
// BETTING OPERATIONS
// The backend and database RPCs are authoritative for all bet outcomes.
// -----------------------------------------------------------------------------

export async function placeBetRequest(params: {
  userId: string;
  roundId: string;
  stakeKes: number;
  panelIndex: number;
  autoCashoutMultiplier: number | null;
  currentBalanceKes: number;
}): Promise<{
  bet: ActiveBet;
  remainingBalanceKes: number;
}> {
  const {
    userId,
    roundId,
    stakeKes,
    panelIndex,
    autoCashoutMultiplier,
  } = params;

  const authUser = await requireAuthenticatedUser();
  if (authUser.id !== userId) {
    throw new Error("Invalid betting account.");
  }

  if (!Number.isFinite(stakeKes) || stakeKes < 10 || stakeKes > 100000) {
    throw new Error("Bet must be between 10 and 100,000 KES.");
  }

  if (!roundId) throw new Error("A valid game round is required.");

  if (!Number.isInteger(panelIndex) || panelIndex < 0 || panelIndex > 1) {
    throw new Error("Invalid bet panel.");
  }

  const data = await requireApiSuccess<any>("/api/bet/place", {
    method: "POST",
    body: JSON.stringify({
      roundId,
      stakeKes,
      panelIndex,
      autoCashoutMultiplier,
    }),
  });

  return {
    bet: mapBet(data.bet),
    remainingBalanceKes: Number(data.remainingBalanceKes),
  };
}

export async function cashOutBetRequest(params: {
  userId: string;
  panelIndex: number;
  bet: ActiveBet;
  currentMultiplier: number;
  currentBalanceKes: number;
}): Promise<{
  winAmountKes: number;
  newBalanceKes: number;
  multiplier: number;
}> {
  const { userId, panelIndex } = params;

  const authUser = await requireAuthenticatedUser();
  if (authUser.id !== userId) {
    throw new Error("Invalid betting account.");
  }

  const data = await requireApiSuccess<any>("/api/bet/cashout", {
    method: "POST",
    body: JSON.stringify({ panelIndex }),
  });

  return {
    winAmountKes: Number(data.winAmountKes),
    newBalanceKes: Number(data.newBalanceKes),
    multiplier: Number(data.multiplier),
  };
}

export async function cancelBetRequest(params: {
  userId: string;
  panelIndex: number;
  bet: ActiveBet;
  currentBalanceKes: number;
}): Promise<{ newBalanceKes: number }> {
  const { userId, panelIndex } = params;

  const authUser = await requireAuthenticatedUser();
  if (authUser.id !== userId) {
    throw new Error("Invalid betting account.");
  }

  const data = await requireApiSuccess<any>("/api/bet/cancel", {
    method: "POST",
    body: JSON.stringify({ panelIndex }),
  });

  return {
    newBalanceKes: Number(data.newBalanceKes),
  };
}

// -----------------------------------------------------------------------------
// SERVER-ONLY GAME DATA
//
// These functions intentionally do not fabricate rounds, seeds or outcomes.
// Real game rounds must be loaded from /api/game/state and server events.
// -----------------------------------------------------------------------------

export const INITIAL_PAST_MULTIPLIERS: number[] = [];

export function createInitialHistory(): PastRound[] {
  return [];
}

/**
 * Kept temporarily to avoid breaking imports elsewhere.
 * It deliberately refuses to generate fake real-money outcomes.
 */
export function generateDeterministicCrashMultiplier(_nonce: number): number {
  throw new Error(
    "Client-side crash generation is disabled. Use the server's provably-fair verification endpoint."
  );
}

/**
 * Kept temporarily to avoid breaking imports elsewhere.
 * Real rounds must always be created and supplied by the server.
 */
export function createClientRound(
  _nonce: number
): GameRound & { crashMultiplier: number; serverSeed: string } {
  throw new Error(
    "Client-side round creation is disabled. Load the active round from /api/game/state."
  );
}