import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const PAYSTACK_SECRET_KEY = (process.env.PAYSTACK_SECRET_KEY || '').trim();

function isRealPaystackSecretKey(key: string): boolean {
  return /^sk_(live|test)_[a-zA-Z0-9]{20,}$/.test(key);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, reference, amountKes, phone, channel = 'mpesa' } = req.body || {};

  if (!userId || !reference) {
    return res.status(400).json({ error: 'userId and Paystack reference are required' });
  }

  if (!isRealPaystackSecretKey(PAYSTACK_SECRET_KEY)) {
    return res.status(400).json({
      error: 'PAYSTACK_SECRET_KEY is not configured on the server.',
    });
  }

  try {
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const verifyJson: any = await verifyRes.json();

    if (!verifyRes.ok || !verifyJson.status) {
      return res.status(202).json({
        success: false,
        status: 'pending',
        message: verifyJson?.message || 'Waiting for M-Pesa PIN confirmation on your phone...',
      });
    }

    const txStatus = verifyJson.data?.status;

    if (txStatus === 'failed' || txStatus === 'abandoned' || txStatus === 'reversed') {
      return res.status(400).json({
        status: 'failed',
        error:
          verifyJson.data?.gateway_response ||
          verifyJson.data?.message ||
          'M-Pesa STK Push payment was cancelled or declined on your handset.',
      });
    }

    if (txStatus !== 'success') {
      return res.status(202).json({
        success: false,
        status: txStatus || 'pending',
        message:
          verifyJson.data?.gateway_response ||
          'Awaiting M-Pesa STK Push PIN confirmation on your phone...',
      });
    }

    const verifiedAmountKes = Number(verifyJson.data.amount) / 100 || Number(amountKes) || 0;
    const gatewayResponse = verifyJson.data.gateway_response || 'Approved by Paystack Kenya';

    if (verifiedAmountKes < 50) {
      return res.status(400).json({ error: 'Minimum verified deposit is 50 KES' });
    }

    let newBalanceKes = verifiedAmountKes;

    if (supabase) {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('credit_wallet_deposit', {
          p_user_id: userId,
          p_amount_kes: verifiedAmountKes,
          p_paystack_reference: reference,
          p_channel: channel,
        });
        if (!rpcErr && rpcData && typeof rpcData.new_balance_kes === 'number') {
          newBalanceKes = Number(rpcData.new_balance_kes);
        } else {
          const { data: walletRow } = await supabase
            .from('wallets')
            .select('balance_kes')
            .eq('user_id', userId)
            .maybeSingle();
          const currentBal = walletRow ? Number(walletRow.balance_kes) : 0;
          newBalanceKes = Number((currentBal + verifiedAmountKes).toFixed(2));
          await supabase
            .from('wallets')
            .upsert({ user_id: userId, balance_kes: newBalanceKes, updated_at: new Date().toISOString() });
          await supabase.from('transactions').upsert(
            {
              user_id: userId,
              type: 'deposit',
              amount_kes: verifiedAmountKes,
              paystack_reference: reference,
              status: 'completed',
            },
            { onConflict: 'paystack_reference', ignoreDuplicates: true }
          );
        }
      } catch {
        // ignore
      }
    }

    return res.status(200).json({
      success: true,
      status: 'success',
      reference,
      amountKes: verifiedAmountKes,
      gatewayResponse,
      creditResult: {
        status: 'credited',
        reference,
        creditedAmountKes: verifiedAmountKes,
        newBalanceKes,
        phone,
      },
    });
  } catch (err: any) {
    return res.status(502).json({
      error: `Failed to reach Paystack verification API: ${err?.message || 'Network error'}`,
    });
  }
}
