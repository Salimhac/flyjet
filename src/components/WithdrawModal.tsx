import React, { useEffect, useState } from 'react';
import { UserProfile, Wallet } from '../types';
import { processWithdrawal } from '../lib/engineService';
import { X, Smartphone, AlertCircle, CheckCircle2, ArrowUpRight } from 'lucide-react';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  wallet: Wallet | null;
  onWithdrawSuccess: (newBalanceKes: number, message: string) => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  user,
  wallet,
  onWithdrawSuccess,
}) => {
  const [amountInput, setAmountInput] = useState<string>('');
  const amountKes = Number(amountInput) || 0;
  const [channel, setChannel] = useState<'mpesa' | 'airtel'>('mpesa');
  const [phone, setPhone] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAmountInput('');
      setPhone('');
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentBalance = wallet?.balanceKes ?? 0;
  const quickAmounts = [300, 500, 1000, 2000, 3000, 5000];

  // Tax computation: 10 KES for 300 KES withdrawal
  const taxKes =
    amountKes > 0
      ? amountKes === 300
        ? 10
        : Math.max(10, Math.round((amountKes / 300) * 10))
      : 0;
  const netPayoutKes = Math.max(0, amountKes - taxKes);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('Please sign in to withdraw.');
      return;
    }

    if (!phone.trim()) {
      setError('Please enter a recipient mobile number.');
      return;
    }

    if (amountKes < 300) {
      setError('Minimum withdrawal is 300 KES.');
      return;
    }

    if (currentBalance < amountKes) {
      setError(`Insufficient balance. Your current balance is KES ${currentBalance.toFixed(2)}.`);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const result = await processWithdrawal({
        userId: user.id,
        amountKes,
        phone: phone.trim(),
        channel,
        currentBalanceKes: currentBalance,
      });

      setSuccessMsg(result.message);
      onWithdrawSuccess(result.newBalanceKes, result.message);
    } catch (err: any) {
      setError(err.message || 'An error occurred during withdrawal.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-sm animate-fade-in flex items-center justify-center p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleWithdraw}
        autoComplete="off"
        className="relative w-full max-w-lg bg-[#0e1626] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] max-h-[92dvh] my-auto"
      >
        {/* Header */}
        <div className="bg-[#121c30] px-3.5 sm:px-6 py-3 sm:py-3.5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base md:text-lg font-extrabold text-white truncate">
                Withdraw Funds (M-Pesa / Airtel)
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 font-mono truncate">
                Available: <strong className="text-emerald-400">KES {currentBalance.toFixed(2)}</strong>
              </p>
            </div>
          </div>
          {/* Back (X) button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-800/90 hover:bg-rose-500/20 active:bg-rose-500/30 text-slate-300 hover:text-rose-400 border border-slate-700/80 hover:border-rose-500/40 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto overscroll-contain flex-1 min-h-0 flex flex-col gap-3 sm:gap-4">
          {error && (
            <div className="p-2.5 sm:p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2 shrink-0">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 sm:p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-start gap-2 shrink-0">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <div>
                <p className="font-semibold">{successMsg}</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Processed instantly to your mobile account.
                </p>
              </div>
            </div>
          )}

          {/* Select Mobile Money Channel (M-Pesa or Airtel Money only) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 sm:mb-2">
              Payout Channel (M-Pesa & Airtel Money Only)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setChannel('mpesa')}
                className={`p-2.5 sm:p-3 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  channel === 'mpesa'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                <span className="text-xs font-bold">M-Pesa B2C</span>
                <span className="text-[10px] text-slate-400 font-mono">Instant Payout</span>
              </button>

              <button
                type="button"
                onClick={() => setChannel('airtel')}
                className={`p-2.5 sm:p-3 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  channel === 'airtel'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400" />
                <span className="text-xs font-bold">Airtel Money</span>
                <span className="text-[10px] text-slate-400 font-mono">Mobile Payout</span>
              </button>
            </div>
          </div>

          {/* Recipient Phone Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Recipient Mobile Number ({channel === 'airtel' ? 'Airtel' : 'M-Pesa'})
            </label>
            <input
              type="tel"
              required
              autoComplete="off"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder=""
              className="w-full px-3 py-2 sm:py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Amount input & Quick Chips */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">
                Withdrawal Amount (KES)
              </label>
              <span className="text-[11px] font-mono text-emerald-400 font-bold">
                Min: 300 KES
              </span>
            </div>

            <div className="relative mb-2">
              <span className="absolute left-3 top-2 sm:top-2.5 text-xs font-bold text-slate-500 font-mono">
                KES
              </span>
              <input
                type="number"
                min="300"
                step="10"
                autoComplete="off"
                placeholder=""
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="w-full pl-12 pr-4 py-2 sm:py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-base font-bold text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {quickAmounts.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAmountInput(String(amt))}
                  className={`py-1.5 text-xs font-mono font-semibold rounded-lg border transition-all cursor-pointer ${
                    amountKes === amt
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {amt}
                </button>
              ))}
            </div>
          </div>

          {/* Tax Breakdown Card */}
          <div className="bg-slate-950 p-3 sm:p-3.5 rounded-xl border border-slate-800/90 flex flex-col gap-1.5 sm:gap-2 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>Gross Withdrawal:</span>
              <span className="font-mono text-white">KES {(Number(amountKes) || 0).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400 gap-2">
              <span className="flex flex-wrap items-center gap-1">
                <span>Excise Tax:</span>
                <span className="text-[10px] text-amber-400 font-semibold">(10 KES / 300 KES)</span>
              </span>
              <span className="font-mono text-amber-400 font-bold shrink-0">
                -KES {taxKes.toFixed(2)}
              </span>
            </div>
            <div className="pt-1.5 sm:pt-2 border-t border-slate-800 flex items-center justify-between font-bold text-xs sm:text-sm">
              <span className="text-emerald-400">Net Dispatched to Phone:</span>
              <span className="font-mono text-emerald-400 tabular-nums shrink-0">
                KES {netPayoutKes.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Pinned Action Footer */}
        <div className="bg-[#121c30] p-3.5 sm:p-4 border-t border-slate-800 shrink-0 flex flex-col gap-2">
          <button
            type="submit"
            disabled={isLoading || amountKes < 300 || currentBalance < amountKes}
            className="w-full py-3 sm:py-3.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black rounded-xl text-sm sm:text-base transition-all shadow-md active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <ArrowUpRight className="w-5 h-5 stroke-[2.5]" />
            <span>
              {isLoading
                ? 'Processing Payout...'
                : `WITHDRAW KES ${netPayoutKes.toFixed(2)} NET`}
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-1 text-center text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel & Return to Game
          </button>
        </div>
      </form>
    </div>
  );
};
