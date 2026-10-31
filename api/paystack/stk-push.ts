import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const PAYSTACK_SECRET_KEY = (process.env.PAYSTACK_SECRET_KEY || '').trim();
const PAYSTACK_PUBLIC_KEY = (
  process.env.VITE_PAYSTACK_PUBLIC_KEY ||
  process.env.PAYSTACK_PUBLIC_KEY ||
  ''
).trim();

function isRealPaystackSecretKey(key: string): boolean {
  return /^sk_(live|test)_[a-zA-Z0-9]{20,}$/.test(key);
}

function isRealPaystackPublicKey(key: string): boolean {
  return /^pk_(live|test)_[a-zA-Z0-9]{20,}$/.test(key);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, email, amountKes, phone, channel = 'mpesa' } = req.body || {};
  const amount = Number(amountKes);

  if (!userId || isNaN(amount) || amount < 50) {
    return res.status(400).json({ error: 'Minimum deposit is 50 KES.' });
  }

  let normalizedPhone = String(phone || '').trim().replace(/[\s\-]/g, '');
  if (normalizedPhone.startsWith('07') || normalizedPhone.startsWith('01')) {
    normalizedPhone = '+254' + normalizedPhone.substring(1);
  } else if (normalizedPhone.startsWith('2547') || normalizedPhone.startsWith('2541')) {
    normalizedPhone = '+' + normalizedPhone;
  }

  if (!/^\+254[17][0-9]{8}$/.test(normalizedPhone)) {
    return res.status(400).json({
      error: 'Invalid Kenyan phone number. Use 07XXXXXXXX or +2547XXXXXXXX.',
    });
  }

  if (!isRealPaystackSecretKey(PAYSTACK_SECRET_KEY)) {
    return res.status(400).json({
      error:
        'PAYSTACK_SECRET_KEY is not configured or invalid on the server. Add your Paystack Live Secret Key (sk_live_...) in your environment variables to trigger real M-Pesa STK pushes.',
    });
  }

  const reference = `FLYJET-STK-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const customerEmail = email || 'player@flyjet.co.ke';
  const amountSubunits = Math.round(amount * 100);
  const provider = channel === 'airtel' ? 'atl' : 'mpesa';
  const keyMode = PAYSTACK_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test';

  try {
    const chargeRes = await fetch('https://api.paystack.co/charge', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: customerEmail,
        amount: String(amountSubunits),
        currency: 'KES',
        reference,
        mobile_money: {
          phone: normalizedPhone,
          provider,
        },
        metadata: {
          user_id: userId,
          phone: normalizedPhone,
          channel,
        },
      }),
    });

    const chargeJson: any = await chargeRes.json();

    if (!chargeRes.ok || !chargeJson.status || !chargeJson.data) {
      const rawMessage =
        chargeJson?.data?.message ||
        chargeJson?.message ||
        'Unable to trigger M-Pesa STK Push via Paystack.';

      if (
        keyMode === 'test' &&
        rawMessage.toLowerCase().includes('test mobile money number')
      ) {
        return res.status(400).json({
          error:
            'Your PAYSTACK_SECRET_KEY is currently set to a TEST key (sk_test_...). Paystack Test Mode blocks real Kenyan phone numbers and cannot send a real M-Pesa PIN popup to your handset. Please replace sk_test_... with your Paystack LIVE Secret Key (sk_live_...) from your Paystack Dashboard (Settings → API Keys & Webhooks) to receive the real M-Pesa STK Push on your phone.',
          keyMode: 'test',
        });
      }

      return res.status(400).json({
        error: `Paystack M-Pesa STK Error: ${rawMessage}`,
        keyMode,
      });
    }

    const chargeStatus = chargeJson.data.status;
    const chargeRef = chargeJson.data.reference || reference;

    if (chargeStatus === 'failed') {
      const failMsg =
        chargeJson.data.message ||
        chargeJson.data.gateway_response ||
        'M-Pesa STK Push charge was declined by Paystack.';
      return res.status(400).json({
        error: failMsg,
        keyMode,
      });
    }

    if (chargeStatus === 'success') {
      let newBalanceKes = amount;
      if (supabase) {
        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc('credit_wallet_deposit', {
            p_user_id: userId,
            p_amount_kes: amount,
            p_paystack_reference: chargeRef,
            p_channel: channel,
          });
          if (!rpcErr && rpcData && typeof rpcData.new_balance_kes === 'number') {
            newBalanceKes = Number(rpcData.new_balance_kes);
          }
        } catch {
          // ignore
        }
      }

      return res.status(200).json({
        success: true,
        mode: 'live_stk_completed',
        status: 'success',
        domain: chargeJson.data.domain || keyMode,
        reference: chargeRef,
        amountKes: amount,
        phone: normalizedPhone,
        channel,
        creditResult: {
          status: 'credited',
          reference: chargeRef,
          creditedAmountKes: amount,
          newBalanceKes,
        },
      });
    }

    return res.status(200).json({
      success: true,
      mode: 'live_stk_pending',
      status: chargeStatus,
      domain: chargeJson.data.domain || keyMode,
      reference: chargeRef,
      amountKes: amount,
      amountSubunits,
      phone: normalizedPhone,
      channel,
      publicKey: isRealPaystackPublicKey(PAYSTACK_PUBLIC_KEY) ? PAYSTACK_PUBLIC_KEY : '',
      displayText:
        chargeJson.data.display_text ||
        `STK Push sent to ${normalizedPhone}. Please check your phone and enter your ${
          channel === 'airtel' ? 'Airtel Money' : 'M-Pesa'
        } PIN to complete the payment.`,
    });
  } catch (err: any) {
    return res.status(502).json({
      error: `Failed to reach Paystack Charge API: ${err?.message || 'Network error'}`,
    });
  }
}
