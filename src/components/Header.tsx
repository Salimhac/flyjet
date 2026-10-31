import React from 'react';
import { UserProfile, Wallet } from '../types';
import { Plus, User, LogOut, FileText, ArrowUpRight, History } from 'lucide-react';

interface HeaderProps {
  user: UserProfile | null;
  wallet: Wallet | null;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onOpenAuth: () => void;
  onOpenTerms: () => void;
  onOpenTransactions: () => void;
  onSignOut: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  wallet,
  onOpenDeposit,
  onOpenWithdraw,
  onOpenAuth,
  onOpenTerms,
  onOpenTransactions,
  onSignOut,
  activeTab,
  setActiveTab,
}) => {
  const formattedBalance = (wallet?.balanceKes ?? 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <header className="sticky top-0 z-40 bg-[#0c121d]/95 backdrop-blur-md border-b border-slate-800/80 px-2.5 sm:px-4 md:px-6 py-2">
      <div className="max-w-7xl mx-auto flex flex-col gap-2">
        {/* Main Top Row */}
        <div className="flex items-center justify-between gap-2 sm:gap-6">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('game')}
              className="flex items-center gap-1.5 sm:gap-2 group text-left cursor-pointer focus:outline-none"
            >
              <div className="leading-tight">
                <span className="text-xs sm:text-base md:text-lg font-extrabold tracking-tight text-white whitespace-nowrap">
                  FLYJET <span className="text-emerald-400">AVIATOR</span>
                </span>
                <div className="hidden sm:flex text-[10px] text-slate-400 font-mono tracking-wider items-center gap-1.5">
                  <span>KENYA </span>
                </div>
              </div>
            </button>
          </div>

          {/* Zone 2: Navigation Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-400">
            <button
              onClick={() => setActiveTab('game')}
              className={`whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'game' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
              }`}
            >
              Aviator
            </button>
            <button
              onClick={() => setActiveTab('ligibigi')}
              className={`whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'ligibigi'
                  ? 'text-[#39b54a] font-semibold'
                  : 'hover:text-slate-200'
              }`}
            >
              <span>LigiBigi</span>
            </button>
            <button
              onClick={() => setActiveTab('penalty-shootout')}
              className={`whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'penalty-shootout'
                  ? 'text-[#39b54a] font-semibold'
                  : 'hover:text-slate-200'
              }`}
            >
              <span>Penalty Shootout</span>
            </button>
            {user && (
              <button
                onClick={onOpenTransactions}
                className="hover:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
              >
                Transactions
              </button>
            )}
            <button
              onClick={onOpenTerms}
              className="hover:text-slate-200 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1"
            >
              <FileText className="w-4 h-4 text-slate-400" />
              <span>Terms</span>
            </button>
          </nav>

          {/* Zone 3: Wallet & Account Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {user ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Wallet Balance Display */}
                <div className="flex flex-col items-end px-2.5 sm:px-3 py-1 bg-slate-900/90 rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider leading-none mb-0.5">
                    Balance
                  </span>
                  <span className="text-xs sm:text-sm md:text-base font-bold font-mono tabular-nums text-emerald-400 sm:text-white leading-tight whitespace-nowrap">
                    KES {formattedBalance}
                  </span>
                </div>

                {/* Desktop/Tablet Deposit & Withdraw Buttons */}
                <button
                  onClick={onOpenDeposit}
                  className="hidden sm:flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm px-3 sm:px-3.5 py-2 rounded-lg transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>DEPOSIT</span>
                </button>

                <button
                  onClick={onOpenWithdraw}
                  className="hidden sm:flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-100 font-bold text-xs sm:text-sm px-3 py-2 rounded-lg transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  <ArrowUpRight className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
                  <span>WITHDRAW</span>
                </button>

                {/* Mobile & Tablet Transactions History Button */}
                <button
                  onClick={onOpenTransactions}
                  title="Wallet Transactions"
                  aria-label="Wallet Transactions"
                  className="md:hidden w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
                >
                  <History className="w-4 h-4 text-emerald-400" />
                </button>

                {/* User Sign Out */}
                <button
                  onClick={onSignOut}
                  title={`Signed in as ${user.fullName} (${user.phone}) - Click to Sign Out`}
                  aria-label="Sign Out"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-800/90 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/40 flex items-center justify-center text-slate-300 hover:text-rose-400 transition-colors cursor-pointer shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 sm:gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-lg transition-colors cursor-pointer whitespace-nowrap shadow"
              >
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>LOGIN / REGISTER</span>
              </button>
            )}
          </div>
        </div>

        {/* Dedicated Mobile Deposit & Withdraw Bar (Always 100% visible on mobile screens when signed in) */}
        {user && (
          <div className="grid grid-cols-2 gap-2 sm:hidden pt-0.5">
            <button
              type="button"
              onClick={onOpenDeposit}
              className="flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-extrabold text-xs py-2 px-3 rounded-lg shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>DEPOSIT (M-PESA)</span>
            </button>

            <button
              type="button"
              onClick={onOpenWithdraw}
              className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-98 border border-emerald-500/40 text-white font-extrabold text-xs py-2 px-3 rounded-lg shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              <ArrowUpRight className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
              <span>WITHDRAW FUNDS</span>
            </button>
          </div>
        )}

        {/* MOBILE GAME NAV */}
        <div className="grid grid-cols-3 md:hidden items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('game')}
            className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer truncate ${
              activeTab === 'game'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-900 border border-slate-800 text-slate-300'
            }`}
          >
            Aviator
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ligibigi')}
            className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer truncate ${
              activeTab === 'ligibigi'
                ? 'bg-[#39b54a] text-white'
                : 'bg-slate-900 border border-slate-800 text-slate-300'
            }`}
          >
            LigiBigi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('penalty-shootout')}
            className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer truncate ${
              activeTab === 'penalty-shootout'
                ? 'bg-[#39b54a] text-white'
                : 'bg-slate-900 border border-slate-800 text-slate-300'
            }`}
          >
            Penalty Shootout
          </button>
        </div>
      </div>
    </header>
  );
};
