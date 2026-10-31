import React from 'react';
import { X, ShieldAlert, Scale, AlertTriangle, CreditCard, Lock } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-sm animate-fade-in flex items-center justify-center p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl bg-[#0e1626] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] max-h-[92dvh] my-auto flex flex-col">
        {/* Header */}
        <div className="bg-[#121c30] px-3.5 sm:px-6 py-3 sm:py-3.5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base md:text-lg font-extrabold text-white truncate">
                Terms & Conditions
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-800/90 hover:bg-rose-500/20 active:bg-rose-500/30 text-slate-300 hover:text-rose-400 border border-slate-700/80 hover:border-rose-500/40 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Responsible Gaming Notice Bar */}
        <div className="bg-amber-950/30 border-b border-amber-900/30 px-3.5 sm:px-6 py-2.5 flex items-center justify-between text-xs text-amber-200 shrink-0">
          <div className="flex items-center gap-2">
            <span>Betting is addictive. Play Responsibly</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 font-bold text-emerald-400 shrink-0">
            </div>
        </div>

        {/* Legal Text (Scrollable) */}
        <div className="p-3.5 sm:p-6 overflow-y-auto overscroll-contain flex-1 min-h-0 space-y-5 text-xs text-slate-300 leading-relaxed">
          {/* Section 1: Real-Money Risk Disclosure */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>1. Real-Money Risk Disclosure</span>
            </h3>
            <p>
              FlyJet Aviator is a high-speed crash game involving real money (Kenyan Shillings, KES). Players must understand that capital is at risk. Crash points can occur at 1.00x (immediate crash upon takeoff). Past flight multipliers do not predict or influence future outcomes. Never wager money you cannot afford to lose.
            </p>
          </section>

          {/* Section 2: Deposit & Withdrawal Terms */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>2. Deposits, Withdrawals & Payout Terms</span>
            </h3>
            <p>
              All deposits and withdrawals are processed exclusively in Kenyan Shillings (KES) via Safaricom M-Pesa and Airtel Money. The minimum deposit is 50 KES.
            </p>
            <p>
              Withdrawals have a minimum threshold of 300 KES. A statutory excise tax of 10 KES applies to each 300 KES withdrawal, with net funds dispatched immediately to your verified mobile money account.
            </p>
          </section>

          {/* Section 3: Completed Rounds No-Refund Policy */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>3. No-Refund Policy on Completed Rounds</span>
            </h3>
            <p>
              When a player clicks "Place Bet" during the countdown, the stake is immediately deducted from their wallet inside an atomic database transaction. Once the round launches into flight, bets cannot be cancelled or refunded. If the aircraft crashes before the player successfully executes a cashout, the stake is surrendered.
            </p>
          </section>


          {/* Section 5: Limitation of Liability */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white">
              4. Limitation of Liability & Server Authority
            </h3>
            <p>
              The server maintains the sole authoritative state of all game rounds, multiplier ticks, and crash events. In the event of client-side device disconnect, local network latency, or browser crashes during flight, bets with active Auto-Cashout targets will be settled server-side; un-cashed bets will be governed by the server-authoritative crash point.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="bg-[#121c30] px-3.5 sm:px-6 py-3 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[10px] sm:text-[11px] text-slate-400">
            Last Updated: October 2026
          </span>
          <button
            onClick={onClose}
            className="px-3 sm:px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-[11px] sm:text-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            I UNDERSTAND & AGREE
          </button>
        </div>
      </div>
    </div>
  );
};