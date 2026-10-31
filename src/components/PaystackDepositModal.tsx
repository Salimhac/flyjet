import React, { useEffect, useRef, useState } from 'react';
import { UserProfile, Wallet } from '../types';
import {
  initiatePaystackStkPush,
  normalizeKenyanPhone,
  verifyAndCreditPaystackDeposit,
} from '../lib/engineService';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  CreditCard,
  Loader2,
  PhoneCall,
} from 'lucide-react';

interface PaystackDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  wallet: Wallet | null;
  onDepositSuccess: (newBalanceKes: number, reference: string) => void;
}

export const PaystackDepositModal: React.FC<PaystackDepositModalProps> = ({
  isOpen,
  onClose,
  user,
  wallet,
  onDepositSuccess,
}) => {
  const [amountInput, setAmountInput] = useState<string>('');
  const amountKes = Number(amountInput) || 0;
  const [channel, setChannel] = useState<'mpesa' | 'airtel'>('mpesa');
  const [phone, setPhone] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditRef, setAuditRef] = useState<string | null>(null);

  const [activeStkSession, setActiveStkSession] = useState<{
    reference: string;
    amountKes: number;
    phone: string;
    channel: 'mpesa' | 'airtel';
    displayText: string;
  } | null>(null);

  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    setAmountInput('');
    setPhone('');
    setError(null);
    setStatusMessage(null);
    setAuditRef(null);
    setActiveStkSession(null);
  }, [isOpen]);

  // Poll Paystack verification endpoint automatically while waiting for user to enter M-Pesa PIN on their phone
  useEffect(() => {
    if (!activeStkSession || !user) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const res = await verifyAndCreditPaystackDeposit({
          userId: user.id,
          reference: activeStkSession.reference,
          amountKes: activeStkSession.amountKes,
          phone: activeStkSession.phone,
          channel: activeStkSession.channel,
        });
        if (res.status === 'success') {
          window.clearInterval(timer);
          setActiveStkSession(null);
          setAuditRef(res.reference);
          setStatusMessage(
            `✓ M-Pesa STK Push Confirmed (${res.gatewayResponse}). Credited KES ${activeStkSession.amountKes.toFixed(2)}!`
          );
          onDepositSuccess(res.newBalanceKes, res.reference);
        }
      } catch (err: any) {
        if (
          err?.message &&
          (err.message.toLowerCase().includes('cancelled') ||
            err.message.toLowerCase().includes('declined') ||
            err.message.toLowerCase().includes('failed'))
        ) {
          window.clearInterval(timer);
          setActiveStkSession(null);
          setError(err.message);
        }
      }
    }, 3000);

    pollTimerRef.current = timer;
    return () => window.clearInterval(timer);
  }, [activeStkSession, user, onDepositSuccess]);

  if (!isOpen) return null;

  const quickAmounts = [50, 100, 250, 500, 1000, 2000];

  const handleCheckPaymentStatus = async () => {
    if (!user || !activeStkSession) return;

    setIsLoading(true);
    setError(null);

    try {
      const verified = await verifyAndCreditPaystackDeposit({
        userId: user.id,
        reference: activeStkSession.reference,
        amountKes: activeStkSession.amountKes,
        phone: activeStkSession.phone,
        channel: activeStkSession.channel,
      });

      if (verified.status === 'pending') {
        setStatusMessage(
          'Still waiting for M-Pesa PIN confirmation from your phone. Please complete the prompt on your handset.'
        );
        setIsLoading(false);
        return;
      }

      const completedAmount = activeStkSession.amountKes;
      setActiveStkSession(null);
      setAuditRef(verified.reference);
      setStatusMessage(
        `✓ ${
          activeStkSession.channel === 'airtel' ? 'Airtel Money' : 'M-Pesa'
        } Payment Confirmed! KES ${completedAmount.toFixed(2)} credited to your wallet.`
      );
      onDepositSuccess(verified.newBalanceKes, verified.reference);
    } catch (err: any) {
      setError(err.message || 'Failed to verify STK push payment.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendStkPush = async () => {
    if (!user) {
      setError('Please login or register first to deposit funds.');
      return;
    }
    if (!amountKes || isNaN(amountKes) || amountKes < 50) {
      setError('Minimum deposit is 50 KES.');
      return;
    }

    const rawPhone = phone.trim();
    const normalizedPhone = normalizeKenyanPhone(rawPhone);
    if (!/^\+254[17][0-9]{8}$/.test(normalizedPhone)) {
      setError('Please enter a valid Kenyan mobile number.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusMessage(
      `Triggering real ${
        channel === 'airtel' ? 'Airtel Money' : 'Safaricom M-Pesa'
      } STK Push to ${normalizedPhone}...`
    );
    setAuditRef(null);

    try {
      const stkData = await initiatePaystackStkPush({
        userId: user.id,
        email: user.email || 'player@flyjet.co.ke',
        amountKes,
        phone: normalizedPhone,
        channel,
      });

      // If Paystack Direct Charge completed immediately (e.g. Paystack test number 0710000000)
      if (stkData.mode === 'live_stk_completed' && typeof stkData.newBalanceKes === 'number') {
        setAuditRef(stkData.reference);
        setStatusMessage(
          `✓ M-Pesa Charge Approved! Credited KES ${amountKes.toFixed(2)} to your wallet.`
        );
        onDepositSuccess(stkData.newBalanceKes, stkData.reference);
        setIsLoading(false);
        return;
      }

      // Live STK Push sent to user's physical handset — wait for them to enter PIN on their phone
      setActiveStkSession({
        reference: stkData.reference,
        amountKes,
        phone: normalizedPhone,
        channel,
        displayText: stkData.displayText,
      });
      setStatusMessage(null);
    } catch (err: any) {
      setError(err.message || 'Could not initiate M-Pesa STK Push.');
      setStatusMessage(null);
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
      <div className="relative w-full max-w-lg bg-[#0e1626] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] max-h-[92dvh] my-auto">
        {/* Header */}
        <div className="bg-[#121c30] px-3.5 sm:px-6 py-3 sm:py-3.5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base md:text-lg font-extrabold text-white truncate">
                Deposit Funds
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 flex items-center gap-1.5 font-mono truncate">
                <span>KES</span>
                <span>·</span>
                <span>Balance: KES {(wallet?.balanceKes ?? 0).toFixed(2)}</span>
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

        {/* Scrollable Form Content */}
        <div className="p-3.5 sm:p-6 overflow-y-auto overscroll-contain flex-1 min-h-0 flex flex-col gap-3.5 sm:gap-4">

          {error && (
            <div className="p-2.5 sm:p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {statusMessage && (
            <div className="p-2.5 sm:p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <div>
                <p className="font-semibold">{statusMessage}</p>
                {auditRef && (
                  <p className="font-mono text-[10px] text-slate-400 mt-1">Ref: {auditRef}</p>
                )}
              </div>
            </div>
          )}

          {/* Handset Awaiting PIN Confirmation View */}
          {activeStkSession ? (
            <div className="p-3.5 sm:p-5 rounded-2xl bg-[#0a1914] border-2 border-emerald-500 shadow-2xl flex flex-col gap-3.5 sm:gap-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3 gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                    <PhoneCall className="w-4 h-4 animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wide truncate">
                      Check Your Phone ({activeStkSession.phone})
                    </h3>
                    <p className="text-[11px] font-mono text-emerald-400 truncate">
                      {activeStkSession.channel === 'airtel'
                        ? 'Airtel Money STK Push Sent'
                        : 'Safaricom M-Pesa STK Push Sent'}
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-mono font-black text-xs shrink-0">
                  KES {activeStkSession.amountKes.toFixed(2)}
                </span>
              </div>

              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 sm:p-3.5 text-xs text-slate-200 space-y-2 font-mono">
                <p className="text-emerald-300 font-sans font-semibold text-xs leading-relaxed">
                  {activeStkSession.displayText}
                </p>
                <div className="pt-2 border-t border-slate-800/80 flex justify-between text-[11px] gap-2">
                  <span className="text-slate-400">Handset Number:</span>
                  <span className="text-white font-bold">{activeStkSession.phone}</span>
                </div>
                <div className="flex justify-between text-[11px] gap-2">
                  <span className="text-slate-400 shrink-0">Paystack Ref:</span>
                  <span className="text-emerald-400 truncate">{activeStkSession.reference}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-3">
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-emerald-400" />
                <span>
                  Waiting for you to enter your M-Pesa PIN on your phone... Your balance will update automatically once confirmed.
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleCheckPaymentStatus}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Checking Paystack Status...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                      <span>I HAVE ENTERED MY M-PESA PIN</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setActiveStkSession(null);
                    setStatusMessage(null);
                  }}
                  className="px-4 py-2.5 sm:py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Payment Method Channels (M-Pesa and Airtel Money only) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 sm:mb-2">
                  Select Mobile Money Channel
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
                    <span className="text-xs font-bold">M-Pesa STK</span>
                    <span className="text-[10px] text-slate-400 font-mono">PIN Prompt on Phone</span>
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
                    <span className="text-[10px] text-slate-400 font-mono">PIN Prompt on Phone</span>
                  </button>
                </div>
              </div>

              {/* Kenyan Phone Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Kenyan Mobile Number ({channel === 'airtel' ? 'Airtel' : 'M-Pesa'})
                </label>
                <input
                  type="tel"
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
                    Deposit Amount (KES)
                  </label>
                  <span className="text-[11px] font-mono text-emerald-400 font-bold">
                    Min: 50 KES
                  </span>
                </div>
                <div className="relative mb-2">
                  <span className="absolute left-3 top-2 sm:top-2.5 text-xs font-bold text-slate-500 font-mono">
                    KES
                  </span>
                  <input
                    type="number"
                    min="50"
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
            </>
          )}
        </div>

        {/* Pinned Action Footer */}
        {!activeStkSession && (
          <div className="bg-[#121c30] p-3.5 sm:p-4 border-t border-slate-800 shrink-0 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSendStkPush}
              disabled={isLoading || amountKes < 50}
              className="w-full py-3 sm:py-3.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs sm:text-sm transition-all shadow-md active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Sending STK Push to Phone...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
                  <span>
                    SEND {channel === 'airtel' ? 'AIRTEL' : 'M-PESA'} STK PUSH — KES{' '}
                    {(Number(amountKes) || 0).toFixed(2)}
                  </span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-1 text-center text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel & Return to Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
