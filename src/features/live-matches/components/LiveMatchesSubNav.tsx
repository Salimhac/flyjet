import React from 'react';
import {
  Trophy,
  Activity,
  History,
  Wallet as WalletIcon,
  ShieldCheck,
  Ticket,
} from 'lucide-react';
import { ConnectionState } from '../useLiveMatchesSocket';
import { formatCentsToKes, kesToCents } from '../money';

export type LiveMatchesRoutePage = 'lobby' | 'arena' | 'history' | 'wallet' | 'rules';

interface LiveMatchesSubNavProps {
  activePage: LiveMatchesRoutePage;
  activeRoundOrRoomId: string;
  onNavigate: (path: string) => void;
  connectionState: ConnectionState;
  latencyMs: number;
  walletBalanceKes: number;
  onOpenDeposit: () => void;
  betSlipCount?: number;
  totalOdds?: number;
  totalPayoutCents?: number;
  openTicketsCount?: number;
}

export const LiveMatchesSubNav: React.FC<LiveMatchesSubNavProps> = ({
  activePage,
  activeRoundOrRoomId,
  onNavigate,
  walletBalanceKes,
  onOpenDeposit,
  betSlipCount = 0,
  totalOdds = 0,
  totalPayoutCents = 0,
  openTicketsCount = 0,
}) => {
  const balanceCents = kesToCents(walletBalanceKes);

  const navItems: Array<{
    id: LiveMatchesRoutePage;
    label: string;
    path: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: 'lobby',
      label: 'Football Lobby',
      path: '/live-matches',
      icon: <Trophy className="w-3.5 h-3.5" />,
      badge: betSlipCount > 0 ? betSlipCount : undefined,
    },
    {
      id: 'arena',
      label: 'Match Center',
      path: `/live-matches/${activeRoundOrRoomId || 'm_fkf_gor_afc'}`,
      icon: <Activity className="w-3.5 h-3.5" />,
    },
    {
      id: 'history',
      label: 'My Bets & Cashout',
      path: '/live-matches/history',
      icon: <History className="w-3.5 h-3.5" />,
      badge: openTicketsCount > 0 ? openTicketsCount : undefined,
    },
    {
      id: 'wallet',
      label: 'Match Wallet',
      path: '/live-matches/wallet',
      icon: <WalletIcon className="w-3.5 h-3.5" />,
    },
    {
      id: 'rules',
      label: 'Rules & Fairness',
      path: '/live-matches/rules',
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
    },
  ];

  const handleScrollToSlip = () => {
    const el = document.getElementById('betika-betslip-panel');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      onNavigate('/live-matches');
    }
  };

  return (
    <div className="bg-[#0b1220] border border-slate-800/90 rounded-xl p-2 sm:p-2.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
      {/* Sub-Navigation Links */}
      <nav
        aria-label="Football Navigation"
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar"
      >
        {navItems.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.path)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#22c55e] text-slate-950 shadow-sm'
                  : 'bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-extrabold ${
                    isActive
                      ? 'bg-slate-950 text-[#22c55e]'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Right Status Strip: Selected Games Total Payout Pill + Min Bet Rule Badge + Quick Wallet */}
      <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 sm:gap-2.5 border-t md:border-t-0 border-slate-800/80 pt-2 md:pt-0">
        {betSlipCount > 0 && (
          <button
            type="button"
            onClick={handleScrollToSlip}
            className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-950/70 hover:bg-emerald-900/70 border border-[#22c55e]/50 text-[11px] font-mono transition-colors cursor-pointer"
          >
            <span className="text-slate-300 font-bold">
              {betSlipCount} {betSlipCount === 1 ? 'GAME' : 'GAMES'}
            </span>
            <span className="text-amber-300 font-bold tabular-nums">
              @{totalOdds.toFixed(2)}x
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-[#22c55e] font-extrabold tabular-nums">
              TOTAL PAYOUT: {formatCentsToKes(totalPayoutCents)}
            </span>
          </button>
        )}

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-bold">
          <Ticket className="w-3 h-3 text-amber-400" />
          <span>MIN BET: 10.00 KES</span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300">
          <span className="text-slate-500">WALLET:</span>
          <span className="text-white font-bold tabular-nums">
            {formatCentsToKes(balanceCents)}
          </span>
          <button
            type="button"
            onClick={onOpenDeposit}
            className="ml-1 text-[#22c55e] hover:text-emerald-300 underline font-sans font-bold cursor-pointer"
          >
            Deposit
          </button>
        </div>
      </div>
    </div>
  );
};

