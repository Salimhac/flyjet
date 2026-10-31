// Supabase Edge Function: Paystack Webhook Handler (Kenya KES)
// Serves /paystack/webhook with timing-safe HMAC-SHA512 signature verification

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabase } from '../../../src/lib/supabase.ts';

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Timing-safe buffer comparison to prevent timing attacks
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let c = 0;
  for (let i = 0; i < a.byteLength; i++) {
    c |= a[i] ^ b[i];
  }
  return c === 0;
}

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

serve(async (req: Request) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 1. Read raw body BEFORE any JSON parsing
  const rawBody = await req.text();

  // 2. Read x-paystack-signature header
  const signature = req.headers.get("x-paystack-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing signature header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!PAYSTACK_SECRET_KEY) {
    console.error("PAYSTACK_SECRET_KEY not configured");
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Compute HMAC-SHA512 of raw body using Paystack secret key
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(PAYSTACK_SECRET_KEY),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody)
  );

  const expectedBytes = new Uint8Array(signatureBuffer);
  const providedBytes = hexToBytes(signature);

  // 4. Timing-safe equality check
  const isValid = timingSafeEqual(expectedBytes, providedBytes);

  if (!isValid) {
    console.warn("Invalid Paystack webhook signature rejected");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 5. Parse verified JSON payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return new Response(JSON.stringify({ error: "Malformed JSON payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const event = payload.event;
  const data = payload.data;

  // Process only confirmed successful charges
  if (event === "charge.success" && data) {
    const reference = data.reference;
    // Paystack sends amount in minor currency units (cents/kobo). Divide by 100 for KES.
    const amountKes = data.amount / 100;
    const currency = data.currency;

    if (currency && currency.toUpperCase() !== "KES") {
      console.warn(`Unexpected currency ${currency}; expected KES`);
    }

    // Extract user ID from metadata or customer email lookup
    const userId = data.metadata?.user_id;

    if (!userId) {
      console.error("Missing user_id in charge metadata");
      return new Response(JSON.stringify({ error: "Missing user_id metadata" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Call atomic Supabase RPC function (SECURITY DEFINER)
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "credit_wallet_deposit",
      {
        p_user_id: userId,
        p_amount_kes: amountKes,
        p_paystack_reference: reference,
      }
    );

    if (rpcError) {
      console.error("Failed to credit wallet atomically:", rpcError);
      return new Response(JSON.stringify({ error: "Database crediting failed", details: rpcError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Successfully credited ${amountKes} KES to user ${userId} for ref ${reference}`);
    return new Response(
      JSON.stringify({ success: true, result: rpcResult }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Acknowledge other event types without processing
  return new Response(JSON.stringify({ status: "ignored_event" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
