const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_PUBLIC_KEY =
  process.env.VITE_PAYSTACK_PUBLIC_KEY || process.env.PAYSTACK_PUBLIC_KEY || '';

function isRealPaystackSecretKey(key: string): boolean {
  return /^sk_(live|test)_[a-zA-Z0-9]{20,}$/.test((key || '').trim());
}

function isRealPaystackPublicKey(key: string): boolean {
  return /^pk_(live|test)_[a-zA-Z0-9]{20,}$/.test((key || '').trim());
}

export default function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const trimmedSecret = PAYSTACK_SECRET_KEY.trim();
  const hasSecret = isRealPaystackSecretKey(trimmedSecret);
  const keyMode = !hasSecret
    ? 'missing'
    : trimmedSecret.startsWith('sk_live_')
    ? 'live'
    : 'test';

  return res.status(200).json({
    publicKey: isRealPaystackPublicKey(PAYSTACK_PUBLIC_KEY) ? PAYSTACK_PUBLIC_KEY.trim() : '',
    hasLiveSecret: hasSecret,
    keyMode,
    currency: 'KES',
    minDepositKes: 50,
    channels: ['mobile_money'],
  });
}
