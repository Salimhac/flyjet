import React, { useState, useEffect } from 'react';
import {
  Wallet as WalletIcon,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { UserProfile, Wallet } from '../../../types';
import { LiveMatchAuditLogDTO } from '../types';
import { formatCentsToKes, kesToCents } from '../money';

interface LiveMatchesWalletPageProps {
  user: UserProfile | null;
  wallet: Wallet | null;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onOpenAuth: () => void;
}

export const LiveMatchesWalletPage: React.FC<LiveMatchesWalletPageProps> = ({
  user,
  wallet,
  onOpenDeposit,
  onOpenWithdraw,
  onOpenAuth,
}) => {
  const [auditLogs, setAuditLogs] = useState<LiveMatchAuditLogDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const balanceCents = kesToCents(wallet?.balanceKes ?? 0);

  const fetchLedger = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/live-matches/wallet?userId=${encodeURIComponent(user.id)}`, {
        headers: { 'x-user-id': user.id },
      });
      if (res.ok) {
        const d = await res.json();
        setAuditLogs(d.auditLogs || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [user?.id, wallet?.balanceKes]);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[#0b1220] border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[#22c55e] text-xs font-mono font-bold">
            <WalletIcon className="w-4 h-4" />
            <span>UNIFIED M-PESA / PAYSTACK SPORTSBOOK WALLET</span>
          </div>
          <h1 className="text-lg sm:text-xl font-extrabold text-white">
            Football Sportsbook Wallet &amp; Audit Ledger
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl">
            Your Pre-Match (&ldquo;Bet Early&rdquo;) and Live In-Play football bets share your main KES wallet
            with zero duplicate balances. Minimum stake is{' '}
            <strong className="text-white">10.00 KES (1,000 integer cents)</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 flex-1 md:flex-initial">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">
              Available Balance
            </span>
            <span className="text-lg sm:text-xl font-black font-mono text-[#22c55e] tabular-nums">
              {formatCentsToKes(balanceCents, { prefix: true })}
            </span>
            <span className="text-[10px] font-mono text-slate-500 block">
              ({balanceCents.toLocaleString()} integer KES cents)
            </span>
          </div>

          <button
            type="button"
            onClick={user ? onOpenDeposit : onOpenAuth}
            className="px-4 py-3 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>DEPOSIT KES</span>
          </button>

          <button
            type="button"
            onClick={user ? onOpenWithdraw : onOpenAuth}
            className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowUpRight className="w-4 h-4 text-[#22c55e]" />
            <span>WITHDRAW</span>
          </button>
        </div>
      </div>

      {/* Rules Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#0b1220] border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Minimum Football Bet</div>
          <div className="text-base font-extrabold font-mono text-white mt-0.5">
            10.00 KES (1,000 cents)
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Enforced server-side and client-side for both Single and Multi-Bet (Accumulator) football tickets.
          </p>
        </div>

        <div className="bg-[#0b1220] border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Bet Early &amp; Cashout</div>
          <div className="text-base font-extrabold font-mono text-amber-400 mt-0.5">
            Pre-Match &amp; Live Cashout
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Cancel pre-match tickets before kickoff for a 100% refund or use Live Cashout during the 90 minutes.
          </p>
        </div>

        <div className="bg-[#0b1220] border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Max Ticket Payout</div>
          <div className="text-base font-extrabold font-mono text-white mt-0.5">
            500,000.00 KES
          </div>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e]" />
            <span>Includes up to +15% Multi-Bet Win Boost</span>
          </p>
        </div>
      </div>

      {/* Append-Only Audit Log */}
      <div className="bg-[#0b1220] border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#22c55e]" />
            <h2 className="text-sm font-bold text-white">
              Append-Only Sportsbook Audit Ledger (`lm_audit_logs`)
            </h2>
          </div>
          <button
            type="button"
            onClick={fetchLedger}
            className="text-xs font-mono text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#22c55e]' : ''}`} />
            <span>Sync</span>
          </button>
        </div>

        {!user ? (
          <div className="text-center py-8 text-xs font-mono text-slate-400">
            Sign in to inspect your personal football betting ledger and audit trail.
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="text-center py-8 text-xs font-mono text-slate-500">
            No football bet movements recorded yet in this session.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                  <th className="py-2 pr-3">TIMESTAMP</th>
                  <th className="py-2 px-3">EVENT</th>
                  <th className="py-2 px-3">AMOUNT</th>
                  <th className="py-2 px-3">BALANCE BEFORE</th>
                  <th className="py-2 px-3">BALANCE AFTER</th>
                  <th className="py-2 pl-3 text-right">TICKET / REF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/40">
                    <td className="py-2 pr-3 text-slate-400">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="py-2 px-3 font-bold text-white">{log.eventType}</td>
                    <td
                      className={`py-2 px-3 font-bold tabular-nums ${
                        log.eventType === 'BET_DEBIT' ? 'text-amber-400' : 'text-[#22c55e]'
                      }`}
                    >
                      {formatCentsToKes(log.amountCents)}
                    </td>
                    <td className="py-2 px-3 text-slate-300 tabular-nums">
                      {log.balanceBeforeCents !== null
                        ? formatCentsToKes(log.balanceBeforeCents)
                        : '—'}
                    </td>
                    <td className="py-2 px-3 text-white font-bold tabular-nums">
                      {log.balanceAfterCents !== null
                        ? formatCentsToKes(log.balanceAfterCents)
                        : '—'}
                    </td>
                    <td className="py-2 pl-3 text-right text-slate-500">
                      {(log.idempotencyKey || log.id).slice(0, 22)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
