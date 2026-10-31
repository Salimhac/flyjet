import React, { useState } from 'react';
import {
  History,
  Zap,
  Clock,
  Flame,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Ticket,
  ExternalLink,
} from 'lucide-react';
import { UserProfile } from '../../../types';
import { LiveMatchTicketDTO } from '../types';
import { formatCentsToKes } from '../money';

interface LiveMatchesHistoryPageProps {
  user: UserProfile | null;
  tickets: LiveMatchTicketDTO[];
  onRefreshTickets: () => void;
  onWalletUpdate: (newBalanceKes: number) => void;
  onNavigate: (path: string) => void;
  onOpenAuth: () => void;
}

export const LiveMatchesHistoryPage: React.FC<LiveMatchesHistoryPageProps> = ({
  user,
  tickets,
  onRefreshTickets,
  onWalletUpdate,
  onNavigate,
  onOpenAuth,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [timingFilter, setTimingFilter] = useState<'ALL' | 'EARLY' | 'LIVE'>('ALL');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!user) {
    return (
      <div className="bg-[#121824] border border-slate-800 rounded-xl p-8 text-center max-w-lg mx-auto my-6">
        <History className="w-10 h-10 text-[#22c55e] mx-auto mb-3" />
        <h2 className="text-base font-extrabold text-white mb-1">
          Sign In to View Your Football Tickets &amp; Early Cashouts
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Track your Pre-Match (&ldquo;Bet Early&rdquo;) and Live In-Play football bets, monitor live scores, and cash out anytime.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="px-5 py-2.5 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] text-slate-950 font-extrabold text-xs uppercase tracking-wider cursor-pointer"
        >
          Login / Register
        </button>
      </div>
    );
  }

  const filteredTickets = tickets.filter((t) => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    if (timingFilter === 'EARLY' && !t.hasEarlyBetLegs) return false;
    if (timingFilter === 'LIVE' && !t.hasLiveLegs) return false;
    return true;
  });

  const totalStakedCents = tickets.reduce((acc, t) => acc + t.stakeCents, 0);
  const totalReturnedCents = tickets.reduce((acc, t) => acc + t.payoutCents, 0);
  const openCount = tickets.filter((t) => t.status === 'OPEN').length;

  const handleCashOut = async (ticket: LiveMatchTicketDTO) => {
    setProcessingId(ticket.id);
    setBanner(null);
    const idempotencyKey = `hist_co_${ticket.id}_${Date.now()}`;

    try {
      const res = await fetch('/api/live-matches/bet/cashout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          userId: user.id,
          ticketId: ticket.id,
          idempotencyKey,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setBanner({ type: 'error', text: json.error || 'Cashout failed.' });
        return;
      }
      if (typeof json.balanceKes === 'number') {
        onWalletUpdate(json.balanceKes);
      }
      onRefreshTickets();
      setBanner({
        type: 'success',
        text: `Cashed out ${formatCentsToKes(json.cashoutCents)} on ticket ${ticket.ticketCode}!`,
      });
    } catch {
      setBanner({ type: 'error', text: 'Network error while cashing out.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelPreMatch = async (ticket: LiveMatchTicketDTO) => {
    setProcessingId(ticket.id);
    setBanner(null);
    try {
      const res = await fetch('/api/live-matches/bet/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({
          userId: user.id,
          ticketId: ticket.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setBanner({ type: 'error', text: json.error || 'Could not cancel pre-match ticket.' });
        return;
      }
      if (typeof json.balanceKes === 'number') {
        onWalletUpdate(json.balanceKes);
      }
      onRefreshTickets();
      setBanner({
        type: 'success',
        text: `Cancelled pre-match ticket ${ticket.ticketCode} and refunded ${formatCentsToKes(
          ticket.stakeCents
        )}!`,
      });
    } catch {
      setBanner({ type: 'error', text: 'Network error.' });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#121824] border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] font-bold uppercase text-slate-400">Total Tickets</span>
          <div className="font-mono font-extrabold text-lg text-white mt-0.5 tabular-nums">
            {tickets.length}
          </div>
        </div>
        <div className="bg-[#121824] border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] font-bold uppercase text-amber-400">
            Active / Cashout Ready
          </span>
          <div className="font-mono font-extrabold text-lg text-amber-300 mt-0.5 tabular-nums">
            {openCount}
          </div>
        </div>
        <div className="bg-[#121824] border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] font-bold uppercase text-slate-400">Total Staked</span>
          <div className="font-mono font-extrabold text-lg text-white mt-0.5 tabular-nums">
            {formatCentsToKes(totalStakedCents)}
          </div>
        </div>
        <div className="bg-[#121824] border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] font-bold uppercase text-emerald-400">
            Total Payouts &amp; Cashouts
          </span>
          <div className="font-mono font-extrabold text-lg text-[#22c55e] mt-0.5 tabular-nums">
            {formatCentsToKes(totalReturnedCents)}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#121824] border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'ALL', label: 'All Tickets' },
            { id: 'OPEN', label: `Open / Cashout (${openCount})` },
            { id: 'WON', label: 'Won' },
            { id: 'CASHED_OUT', label: 'Cashed Out' },
            { id: 'LOST', label: 'Lost' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-[#22c55e] text-slate-950'
                  : 'bg-[#0b0f19] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {[
            { id: 'ALL' as const, label: 'All Bets' },
            { id: 'EARLY' as const, label: 'Bet Early (Pre-Match)' },
            { id: 'LIVE' as const, label: 'Live In-Play' },
          ].map((tm) => (
            <button
              key={tm.id}
              type="button"
              onClick={() => setTimingFilter(tm.id)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                timingFilter === tm.id
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-[#0b0f19] text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {tm.label}
            </button>
          ))}
        </div>
      </div>

      {banner && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            banner.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tickets List */}
      {filteredTickets.length === 0 ? (
        <div className="bg-[#121824] border border-slate-800 rounded-xl p-10 text-center">
          <Ticket className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-300">No Football Tickets Found</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Head to the Football Lobby to place a Pre-Match (&ldquo;Bet Early&rdquo;) or Live In-Play bet from 10.00 KES.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('/live-matches')}
            className="px-4 py-2 rounded-lg bg-[#22c55e] text-slate-950 font-extrabold text-xs uppercase tracking-wider cursor-pointer"
          >
            Browse Football Matches
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredTickets.map((tkt) => {
            const allUpcoming = tkt.legs.every((l) => l.currentStatus === 'UPCOMING');
            return (
              <div
                key={tkt.id}
                className="bg-[#121824] border border-slate-800 rounded-xl overflow-hidden"
              >
                {/* Ticket Top Header */}
                <div className="bg-[#0b0f19] px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-xs sm:text-sm text-white">
                      {tkt.ticketCode}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-bold text-[10px] uppercase">
                      {tkt.type} ({tkt.legs.length} {tkt.legs.length === 1 ? 'Leg' : 'Legs'})
                    </span>
                    {tkt.hasEarlyBetLegs && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold text-[10px]">
                        <Clock className="w-3 h-3" />
                        BET EARLY
                      </span>
                    )}
                    {tkt.hasLiveLegs && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-bold text-[10px]">
                        <Flame className="w-3 h-3" />
                        LIVE IN-PLAY
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-400">
                      {new Date(tkt.placedAt).toLocaleTimeString()}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded font-mono font-extrabold text-xs uppercase ${
                        tkt.status === 'WON'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : tkt.status === 'CASHED_OUT'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : tkt.status === 'LOST'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      }`}
                    >
                      {tkt.status}
                    </span>
                  </div>
                </div>

                {/* Ticket Legs Table */}
                <div className="p-3.5 divide-y divide-slate-800/70">
                  {tkt.legs.map((leg) => (
                    <div
                      key={leg.id}
                      className="py-2 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onNavigate(`/live-matches/${leg.matchId}`)}
                            className="font-bold text-white hover:text-[#22c55e] flex items-center gap-1 cursor-pointer"
                          >
                            <span>
                              {leg.homeTeam} vs {leg.awayTeam}
                            </span>
                            <ExternalLink className="w-3 h-3 text-slate-500" />
                          </button>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                            {leg.isEarlyBet ? 'Placed Pre-Match' : `Placed Live (${leg.scoreAtPlacement})`}
                          </span>
                        </div>
                        <span className="text-slate-400">
                          {leg.marketName}:{' '}
                          <strong className="text-[#22c55e]">{leg.outcomeLabel}</strong> @{' '}
                          <strong className="font-mono text-amber-300">
                            {leg.lockedOdds.toFixed(2)}
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <span className="font-mono text-xs text-slate-300 bg-[#0b0f19] px-2.5 py-1 rounded border border-slate-800">
                          {leg.currentStatus === 'UPCOMING'
                            ? 'Pre-Match'
                            : `${leg.currentHomeScore} - ${leg.currentAwayScore} (${
                                leg.currentStatus === 'FT' ? 'FT' : `${leg.currentMinute}'`
                              })`}
                        </span>

                        <span
                          className={`inline-flex items-center gap-1 font-mono font-bold text-xs ${
                            leg.legStatus === 'WON'
                              ? 'text-emerald-400'
                              : leg.legStatus === 'LOST'
                              ? 'text-rose-400'
                              : 'text-amber-300'
                          }`}
                        >
                          {leg.legStatus === 'WON' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {leg.legStatus === 'LOST' && <XCircle className="w-3.5 h-3.5" />}
                          {leg.legStatus}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Ticket Footer: Stake, Placed Odds, Total Payout & Instant Cashout CTA */}
                <div className="bg-[#0b0f19] px-4 py-3 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div>
                      <span className="text-slate-500">Stake: </span>
                      <strong className="font-mono text-white tabular-nums">
                        {formatCentsToKes(tkt.stakeCents)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Total Odds: </span>
                      <strong className="font-mono text-amber-400 tabular-nums">
                        {tkt.totalOdds.toFixed(2)}x
                      </strong>
                    </div>
                    {tkt.multiBoostPercent > 0 && (
                      <div>
                        <span className="text-slate-500">Multi Boost: </span>
                        <strong className="font-mono text-amber-300 tabular-nums">
                          +{tkt.multiBoostPercent}%
                        </strong>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-500">Total Payout: </span>
                      <strong className="font-mono text-[#22c55e] tabular-nums">
                        {formatCentsToKes(tkt.potentialPayoutCents)}
                      </strong>
                    </div>
                    {tkt.status === 'CASHED_OUT' && tkt.cashedOutAmountCents && (
                      <div>
                        <span className="text-slate-500">Cashed Out: </span>
                        <strong className="font-mono text-amber-300 tabular-nums">
                          {formatCentsToKes(tkt.cashedOutAmountCents)}
                        </strong>
                      </div>
                    )}
                  </div>


                  {tkt.status === 'OPEN' && (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {tkt.cashoutOfferCents && tkt.cashoutOfferCents > 0 && (
                        <button
                          type="button"
                          disabled={processingId === tkt.id}
                          onClick={() => handleCashOut(tkt)}
                          className="flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer tabular-nums"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>
                            {processingId === tkt.id
                              ? 'Cashing Out...'
                              : `Cash Out ${formatCentsToKes(tkt.cashoutOfferCents)}`}
                          </span>
                        </button>
                      )}

                      {allUpcoming && (
                        <button
                          type="button"
                          disabled={processingId === tkt.id}
                          onClick={() => handleCancelPreMatch(tkt)}
                          className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Cancel (100% Refund)</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
