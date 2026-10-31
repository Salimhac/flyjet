import React, { useState } from 'react';
import {
  Ticket,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Zap,
  Clock,
  Flame,
  Wallet as WalletIcon,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { UserProfile, Wallet } from '../../../types';
import { BetSlipItem } from '../useLiveMatchesSocket';
import { LiveMatchTicketDTO } from '../types';
import {
  LM_MAX_STAKE_CENTS,
  LM_MIN_STAKE_CENTS,
  computeCombinedOdds,
  computeTicketPayoutBreakdown,
  formatCentsToKes,
  kesToCents,
  parseAndValidateKesInput,
  parsePreviewStakeCents,
  validateAutoCashout,
} from '../money';
import {
  getInitialFallbackMatches,
  placeBetClientFallback,
  settleClientTicketFallback,
} from '../clientFootballEngine';

interface BetikaBetSlipProps {
  betSlip: BetSlipItem[];
  stakeInput?: string;
  onStakeChange?: (val: string) => void;
  onRemoveSelection: (selectionId: string) => void;
  onClearSlip: () => void;
  userTickets: LiveMatchTicketDTO[];
  onRefreshTickets: () => void;
  user: UserProfile | null;
  wallet: Wallet | null;
  onWalletUpdate: (newBalanceKes: number) => void;
  onOpenAuth: () => void;
  onOpenDeposit: () => void;
  onNavigateMatch?: (matchId: string) => void;
  onNavigateHistory?: () => void;
}

const QUICK_STAKES_KES = [10, 20, 50, 100, 250, 500, 1000];

export const BetikaBetSlip: React.FC<BetikaBetSlipProps> = ({
  betSlip,
  stakeInput: externalStakeInput,
  onStakeChange,
  onRemoveSelection,
  onClearSlip,
  userTickets,
  onRefreshTickets,
  user,
  wallet,
  onWalletUpdate,
  onOpenAuth,
  onOpenDeposit,
  onNavigateMatch,
  onNavigateHistory,
}) => {
  const [activeTab, setActiveTab] = useState<'slip' | 'cashout'>('slip');
  const [internalStakeInput, setInternalStakeInput] = useState<string>('50');
  const stakeInput = externalStakeInput !== undefined ? externalStakeInput : internalStakeInput;
  const setStakeInput = (val: string) => {
    if (onStakeChange) {
      onStakeChange(val);
    } else {
      setInternalStakeInput(val);
    }
  };
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState<boolean>(false);
  const [autoCashoutInput, setAutoCashoutInput] = useState<string>('1.80');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [cashingOutId, setCashingOutId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    ticketCode?: string;
  } | null>(null);

  const openTickets = userTickets.filter((t) => t.status === 'OPEN');

  const stakeValidation = parseAndValidateKesInput(
    stakeInput,
    LM_MIN_STAKE_CENTS,
    LM_MAX_STAKE_CENTS
  );
  const validStakeCents = stakeValidation.valid && stakeValidation.stakeCents
    ? stakeValidation.stakeCents
    : 0;
  const previewStakeCents =
    validStakeCents > 0 ? validStakeCents : parsePreviewStakeCents(stakeInput);

  const autoValidation = validateAutoCashout(autoCashoutEnabled, autoCashoutInput);

  const oddsList = betSlip.map((s) => s.odds);
  const totalOdds = computeCombinedOdds(oddsList);
  const payoutBreakdown = computeTicketPayoutBreakdown(previewStakeCents, oddsList);
  const potentialPayoutCents = payoutBreakdown.totalPayoutCents;

  const oddsFormulaText =
    betSlip.length > 1
      ? `${betSlip.map((s) => s.odds.toFixed(2)).join(' × ')} = ${totalOdds.toFixed(2)}`
      : betSlip.length === 1
      ? `${betSlip[0].odds.toFixed(2)}`
      : '0.00';


  const walletBalanceCents = kesToCents(wallet?.balanceKes ?? 0);
  const insufficientBalance =
    user !== null && validStakeCents > 0 && validStakeCents > walletBalanceCents;

  const canPlaceBet =
    betSlip.length > 0 &&
    stakeValidation.valid &&
    autoValidation.valid &&
    !insufficientBalance &&
    !isSubmitting;

  const handleSetMaxStake = () => {
    const maxAffordableKes = Math.floor((wallet?.balanceKes ?? 10) / 1);
    const clampedKes = Math.max(10, Math.min(20000, maxAffordableKes));
    setStakeInput(String(clampedKes));
  };

  const handlePlaceBet = async () => {
    setFeedback(null);
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!stakeValidation.valid || !stakeValidation.stakeCents) {
      setFeedback({
        type: 'error',
        text: stakeValidation.message || 'Minimum bet is 10.00 KES.',
      });
      return;
    }
    if (!autoValidation.valid) {
      setFeedback({
        type: 'error',
        text: autoValidation.message || 'Invalid auto cash-out target.',
      });
      return;
    }
    if (betSlip.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Select at least one match odd to place a bet.',
      });
      return;
    }

    setIsSubmitting(true);
    const idempotencyKey = `slip_${user.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const selectionsPayload = betSlip.map((s) => ({
      matchId: s.matchId,
      marketKey: s.marketKey,
      outcomeKey: s.outcomeKey,
      expectedOdds: s.odds,
    }));

    try {
      const res = await fetch('/api/live-matches/bet/place', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          userId: user.id,
          selections: selectionsPayload,
          stakeCents: stakeValidation.stakeCents,
          autoCashoutMultiplier: autoCashoutEnabled ? autoValidation.multiplier : null,
          idempotencyKey,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        // Vercel static hosting fallback
        const fallbackRes = await placeBetClientFallback({
          userId: user.id,
          selections: selectionsPayload,
          stakeCents: stakeValidation.stakeCents,
          autoCashoutMultiplier: autoCashoutEnabled ? autoValidation.multiplier : null,
          matches: getInitialFallbackMatches(),
          currentBalanceKes: wallet?.balanceKes ?? 0,
        });
        if (!fallbackRes.ok) {
          setFeedback({
            type: 'error',
            text: fallbackRes.error || 'Failed to place football bet.',
          });
          return;
        }
        if (typeof fallbackRes.balanceKes === 'number') {
          onWalletUpdate(fallbackRes.balanceKes);
        }
        onClearSlip();
        onRefreshTickets();
        setFeedback({
          type: 'success',
          text: `Ticket ${fallbackRes.ticket?.ticketCode || ''} placed! Potential win: ${formatCentsToKes(
            fallbackRes.ticket?.potentialPayoutCents || potentialPayoutCents
          )}`,
          ticketCode: fallbackRes.ticket?.ticketCode,
        });
        return;
      }

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setFeedback({
          type: 'error',
          text: json.error || 'Failed to place football bet.',
        });
        return;
      }

      if (typeof json.balanceKes === 'number') {
        onWalletUpdate(json.balanceKes);
      }
      onClearSlip();
      onRefreshTickets();
      setFeedback({
        type: 'success',
        text: `Ticket ${json.ticket?.ticketCode || ''} placed! Potential win: ${formatCentsToKes(
          json.ticket?.potentialPayoutCents || potentialPayoutCents
        )}`,
        ticketCode: json.ticket?.ticketCode,
      });
    } catch {
      const fallbackRes = await placeBetClientFallback({
        userId: user.id,
        selections: selectionsPayload,
        stakeCents: stakeValidation.stakeCents,
        autoCashoutMultiplier: autoCashoutEnabled ? autoValidation.multiplier : null,
        matches: getInitialFallbackMatches(),
        currentBalanceKes: wallet?.balanceKes ?? 0,
      });
      if (!fallbackRes.ok) {
        setFeedback({
          type: 'error',
          text: fallbackRes.error || 'Failed to place football bet.',
        });
        return;
      }
      if (typeof fallbackRes.balanceKes === 'number') {
        onWalletUpdate(fallbackRes.balanceKes);
      }
      onClearSlip();
      onRefreshTickets();
      setFeedback({
        type: 'success',
        text: `Ticket ${fallbackRes.ticket?.ticketCode || ''} placed! Potential win: ${formatCentsToKes(
          fallbackRes.ticket?.potentialPayoutCents || potentialPayoutCents
        )}`,
        ticketCode: fallbackRes.ticket?.ticketCode,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCashOut = async (ticket: LiveMatchTicketDTO) => {
    if (!user) return;
    setCashingOutId(ticket.id);
    setFeedback(null);
    const idempotencyKey = `co_${ticket.id}_${Date.now()}`;

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
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const fb = await settleClientTicketFallback({
          userId: user.id,
          ticketId: ticket.id,
          mode: 'cashout',
          currentBalanceKes: wallet?.balanceKes ?? 0,
        });
        if (!fb.ok) {
          setFeedback({ type: 'error', text: fb.error || 'Cashout unavailable.' });
          return;
        }
        if (typeof fb.balanceKes === 'number') onWalletUpdate(fb.balanceKes);
        onRefreshTickets();
        setFeedback({
          type: 'success',
          text: `Cashed out ${formatCentsToKes(fb.cashoutCents || 0)} on ticket ${ticket.ticketCode}!`,
        });
        return;
      }

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setFeedback({
          type: 'error',
          text: json.error || 'Cashout unavailable right now.',
        });
        return;
      }
      if (typeof json.balanceKes === 'number') {
        onWalletUpdate(json.balanceKes);
      }
      onRefreshTickets();
      setFeedback({
        type: 'success',
        text: `Cashed out ${formatCentsToKes(json.cashoutCents)} on ticket ${ticket.ticketCode}!`,
      });
    } catch {
      const fb = await settleClientTicketFallback({
        userId: user.id,
        ticketId: ticket.id,
        mode: 'cashout',
        currentBalanceKes: wallet?.balanceKes ?? 0,
      });
      if (fb.ok) {
        if (typeof fb.balanceKes === 'number') onWalletUpdate(fb.balanceKes);
        onRefreshTickets();
        setFeedback({
          type: 'success',
          text: `Cashed out ${formatCentsToKes(fb.cashoutCents || 0)} on ticket ${ticket.ticketCode}!`,
        });
      }
    } finally {
      setCashingOutId(null);
    }
  };

  const handleCancelPreMatch = async (ticket: LiveMatchTicketDTO) => {
    if (!user) return;
    setCashingOutId(ticket.id);
    setFeedback(null);

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
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const fb = await settleClientTicketFallback({
          userId: user.id,
          ticketId: ticket.id,
          mode: 'cancel',
          currentBalanceKes: wallet?.balanceKes ?? 0,
        });
        if (!fb.ok) {
          setFeedback({ type: 'error', text: fb.error || 'Could not cancel ticket.' });
          return;
        }
        if (typeof fb.balanceKes === 'number') onWalletUpdate(fb.balanceKes);
        onRefreshTickets();
        setFeedback({
          type: 'success',
          text: `Pre-match ticket ${ticket.ticketCode} cancelled. Full stake (${formatCentsToKes(
            ticket.stakeCents
          )}) refunded!`,
        });
        return;
      }

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setFeedback({
          type: 'error',
          text: json.error || 'Could not cancel pre-match ticket.',
        });
        return;
      }
      if (typeof json.balanceKes === 'number') {
        onWalletUpdate(json.balanceKes);
      }
      onRefreshTickets();
      setFeedback({
        type: 'success',
        text: `Pre-match ticket ${ticket.ticketCode} cancelled. Full stake (${formatCentsToKes(
          ticket.stakeCents
        )}) refunded!`,
      });
    } catch {
      const fb = await settleClientTicketFallback({
        userId: user.id,
        ticketId: ticket.id,
        mode: 'cancel',
        currentBalanceKes: wallet?.balanceKes ?? 0,
      });
      if (fb.ok) {
        if (typeof fb.balanceKes === 'number') onWalletUpdate(fb.balanceKes);
        onRefreshTickets();
        setFeedback({
          type: 'success',
          text: `Pre-match ticket ${ticket.ticketCode} cancelled. Full stake (${formatCentsToKes(
            ticket.stakeCents
          )}) refunded!`,
        });
      }
    } finally {
      setCashingOutId(null);
    }
  };

  return (
    <div
      id="betika-betslip-panel"
      className="bg-[#121824] border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-xl"
    >
      {/* Top Slip Header Tabs */}
      <div className="grid grid-cols-2 bg-[#0b0f19] border-b border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('slip')}
          className={`flex items-center justify-center gap-2 py-3 px-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
            activeTab === 'slip'
              ? 'border-[#22c55e] text-white bg-[#121824]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Ticket className="w-4 h-4 text-[#22c55e]" />
          <span>Bet Slip</span>
          <span className="px-1.5 py-0.5 rounded bg-[#22c55e]/20 text-[#22c55e] font-mono text-[11px]">
            {betSlip.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cashout')}
          className={`flex items-center justify-center gap-2 py-3 px-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
            activeTab === 'cashout'
              ? 'border-amber-400 text-white bg-[#121824]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-400" />
          <span>Cashout</span>
          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[11px]">
            {openTickets.length}
          </span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`m-3 p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {activeTab === 'slip' ? (
        <div className="p-3 flex flex-col gap-3">
          {/* Slip Mode Header + Instant Total Payout Preview */}
          {betSlip.length > 0 && (
            <div className="bg-[#0b0f19] p-2.5 rounded-lg border border-slate-800/80 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30">
                    {betSlip.length === 1 ? 'Normal (Single)' : `Normal (${betSlip.length} Games)`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onClearSlip}
                  className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove All</span>
                </button>
              </div>

              {/* Instant Top Total Odds & Total Payout Bar */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Total Odds:</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-extrabold tabular-nums">
                    {totalOdds.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Total Payout:</span>
                  <span className="font-mono font-extrabold text-[#22c55e] tabular-nums">
                    {formatCentsToKes(potentialPayoutCents)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Selected Legs List */}
          {betSlip.length === 0 ? (
            <div className="py-8 px-4 text-center border border-dashed border-slate-800 rounded-lg bg-[#0b0f19]/50">
              <Ticket className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-300 mb-1">
                Your Football Bet Slip is Empty
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Click any odd on <strong className="text-amber-400">Bet Early (Pre-Match)</strong> or{' '}
                <strong className="text-[#22c55e]">Live In-Play</strong> football matches to add selections.
                Minimum stake is <strong className="text-slate-300">10.00 KES</strong>.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[270px] overflow-y-auto pr-0.5">
              {betSlip.map((item, idx) => (
                <div
                  key={item.selectionId}
                  className="bg-[#0b0f19] border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1.5 relative group hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigateMatch?.(item.matchId)}
                      className="text-left text-xs font-bold text-slate-100 hover:text-[#22c55e] transition-colors truncate cursor-pointer"
                    >
                      <span className="text-slate-500 font-mono mr-1">{idx + 1}.</span>
                      {item.homeTeam} vs {item.awayTeam}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveSelection(item.selectionId)}
                      className="text-slate-500 hover:text-rose-400 p-0.5 shrink-0 cursor-pointer"
                      aria-label="Remove selection"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      {item.isEarlyBet ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold text-[10px]">
                          <Clock className="w-2.5 h-2.5" />
                          PRE-MATCH
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold text-[10px]">
                          <Flame className="w-2.5 h-2.5" />
                          LIVE
                        </span>
                      )}
                      <span className="text-slate-400 truncate max-w-[130px]">
                        {item.marketName}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      #{item.fixtureCode}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/70">
                    <span className="text-xs font-bold text-[#22c55e]">
                      Pick: {item.outcomeLabel}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase text-slate-500 font-bold">Odds</span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-bold text-xs tabular-nums border border-amber-500/20">
                        {item.odds.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stake Controls (Always enforcing 10.00 KES Minimum) */}
          <div className="bg-[#0b0f19] border border-slate-800 rounded-lg p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="lm-football-stake-input"
                className="text-xs font-bold text-slate-300 uppercase tracking-wider"
              >
                Enter Stake Amount (KES)
              </label>
              <span className="text-[11px] font-mono text-amber-400 font-semibold">
                Min: 10.00 KES
              </span>
            </div>

            <div className="relative flex items-center">
              <span className="absolute left-3 text-xs font-bold text-slate-400 font-mono">
                KES
              </span>
              <input
                id="lm-football-stake-input"
                type="number"
                min={10}
                max={20000}
                step={1}
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                className={`w-full bg-[#121824] border rounded-lg pl-12 pr-16 py-2 text-right font-mono font-bold text-sm text-white focus:outline-none transition-colors tabular-nums ${
                  !stakeValidation.valid
                    ? 'border-rose-500 focus:border-rose-400'
                    : 'border-slate-700 focus:border-[#22c55e]'
                }`}
                placeholder="50"
              />
              <button
                type="button"
                onClick={handleSetMaxStake}
                className="absolute right-2 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-amber-300 uppercase tracking-wider cursor-pointer"
              >
                MAX
              </button>
            </div>

            {/* Quick Stake Buttons */}
            <div className="grid grid-cols-7 gap-1">
              {QUICK_STAKES_KES.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setStakeInput(String(amt))}
                  className={`py-1 rounded text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
                    Number(stakeInput) === amt
                      ? 'bg-[#22c55e]/20 border-[#22c55e] text-[#22c55e]'
                      : 'bg-[#121824] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {amt}
                </button>
              ))}
            </div>

            {/* Inline Stake Validation Message */}
            {!stakeValidation.valid && (
              <div className="flex items-center gap-1.5 text-[11px] text-rose-400 font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{stakeValidation.message}</span>
              </div>
            )}

            {/* Insufficient Funds Prompt */}
            {insufficientBalance && (
              <div className="flex items-center justify-between gap-2 bg-amber-950/40 border border-amber-500/30 rounded p-2 text-[11px] text-amber-200">
                <span>Insufficient KES balance for this stake.</span>
                <button
                  type="button"
                  onClick={onOpenDeposit}
                  className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold whitespace-nowrap cursor-pointer"
                >
                  Deposit KES
                </button>
              </div>
            )}

            {/* Optional Auto-Cashout Multiplier */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCashoutEnabled}
                  onChange={(e) => setAutoCashoutEnabled(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-[#22c55e] focus:ring-0"
                />
                <span>Auto Cash-Out at Multiplier</span>
              </label>
              {autoCashoutEnabled && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1.1}
                    max={100}
                    step={0.1}
                    value={autoCashoutInput}
                    onChange={(e) => setAutoCashoutInput(e.target.value)}
                    className="w-20 bg-[#121824] border border-slate-700 rounded px-2 py-1 text-right font-mono text-xs text-white tabular-nums"
                  />
                  <span className="text-xs font-mono text-slate-400">x</span>
                </div>
              )}
            </div>
          </div>

          {/* Real Betika Kenya Odds & Payout Calculation Summary */}
          <div className="bg-[#0b0f19] border border-slate-800 rounded-lg p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>Selected Games</span>
              <span className="font-mono font-bold text-slate-200 tabular-nums">
                {betSlip.length}
              </span>
            </div>

            {betSlip.length > 0 && (
              <div className="flex items-start justify-between gap-2 text-slate-400">
                <span className="shrink-0">Odds Calculation</span>
                <span className="font-mono text-[11px] text-amber-300 text-right break-all tabular-nums">
                  {oddsFormulaText}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-slate-400">
              <span>Total Odds</span>
              <span className="font-mono font-bold text-white tabular-nums">
                {betSlip.length > 0 ? totalOdds.toFixed(2) : '0.00'}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <span>Bet Amount (Stake)</span>
              <span className="font-mono text-slate-200 tabular-nums">
                {formatCentsToKes(previewStakeCents)}
              </span>
            </div>

            {betSlip.length > 0 && previewStakeCents > 0 && (
              <>
                <div className="flex items-center justify-between text-slate-300 pt-1 border-t border-slate-800/80">
                  <span>Possible Win (Stake × Total Odds)</span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    {formatCentsToKes(payoutBreakdown.totalPayoutCents)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Withholding Tax (20% WHT)</span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    -{formatCentsToKes(payoutBreakdown.withholdingTaxCents)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-300 text-[11px]">
                  <span>Final Payout (After 20% Tax)</span>
                  <span className="font-mono font-semibold text-emerald-300 tabular-nums">
                    {formatCentsToKes(payoutBreakdown.finalNetPayoutCents)}
                  </span>
                </div>
              </>
            )}

            {/* Highlighted Betika Total Payout Box */}
            <div className="mt-2 pt-2.5 border-t border-slate-800">
              <div className="bg-emerald-950/40 border border-[#22c55e]/40 rounded-lg px-3 py-2.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-extrabold text-white uppercase tracking-wider text-xs">
                    Total Payout
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {betSlip.length > 0 && previewStakeCents > 0
                      ? `${formatCentsToKes(previewStakeCents)} × ${totalOdds.toFixed(2)}`
                      : 'Select games & enter stake'}
                  </span>
                </div>
                <span
                  aria-live="polite"
                  className="font-mono font-extrabold text-base sm:text-lg text-[#22c55e] tabular-nums"
                >
                  {formatCentsToKes(potentialPayoutCents)}
                </span>
              </div>
            </div>
          </div>

          {/* Place Bet Button */}
          {!user ? (
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full py-3 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <WalletIcon className="w-4 h-4" />
              <span>Login / Register to Place Bet</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!canPlaceBet}
              onClick={handlePlaceBet}
              className={`w-full py-3 px-4 rounded-lg font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                canPlaceBet
                  ? 'bg-[#22c55e] hover:bg-[#16a34a] text-slate-950 shadow-lg shadow-[#22c55e]/20 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <span>
                {isSubmitting
                  ? 'Placing Bet...'
                  : betSlip.length === 0
                  ? 'Select Match Odds to Bet'
                  : `Place Bet ${formatCentsToKes(previewStakeCents)} • Total Payout: ${formatCentsToKes(
                      potentialPayoutCents
                    )}`}
              </span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          )}
        </div>
      ) : (
        /* Active Cashout Tab */
        <div className="p-3 flex flex-col gap-2.5 max-h-[520px] overflow-y-auto">
          {openTickets.length === 0 ? (
            <div className="py-8 px-4 text-center border border-dashed border-slate-800 rounded-lg bg-[#0b0f19]/50">
              <Zap className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-300 mb-1">
                No Active Tickets for Cashout
              </p>
              <p className="text-[11px] text-slate-500">
                Place an early pre-match or live in-play football bet to monitor live scores and cash out anytime!
              </p>
              {onNavigateHistory && (
                <button
                  type="button"
                  onClick={onNavigateHistory}
                  className="mt-3 text-xs font-bold text-[#22c55e] hover:underline cursor-pointer"
                >
                  View Settled Tickets →
                </button>
              )}
            </div>
          ) : (
            openTickets.map((tkt) => {
              const allUpcoming = tkt.legs.every((l) => l.currentStatus === 'UPCOMING');
              return (
                <div
                  key={tkt.id}
                  className="bg-[#0b0f19] border border-slate-800 rounded-lg p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-white">
                        {tkt.ticketCode}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {tkt.type} ({tkt.legs.length})
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-amber-400 tabular-nums">
                      Total Odds: {tkt.totalOdds.toFixed(2)}x
                    </span>
                  </div>

                  {/* Ticket Legs */}
                  <div className="space-y-1.5">
                    {tkt.legs.map((leg) => (
                      <div
                        key={leg.id}
                        className="text-[11px] bg-[#121824] rounded p-2 border border-slate-800/60"
                      >
                        <div className="flex items-center justify-between font-semibold text-slate-200">
                          <span className="truncate">
                            {leg.homeTeam} vs {leg.awayTeam}
                          </span>
                          <span className="font-mono text-xs text-amber-300 shrink-0 ml-2">
                            {leg.currentStatus === 'UPCOMING'
                              ? 'PRE-MATCH'
                              : `${leg.currentHomeScore}-${leg.currentAwayScore} (${leg.currentMinute}')`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400 mt-0.5">
                          <span>
                            {leg.marketName}: <strong className="text-[#22c55e]">{leg.outcomeLabel}</strong>{' '}
                            <span className="font-mono text-amber-300">@{leg.lockedOdds.toFixed(2)}</span>
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase ${
                              leg.legStatus === 'WON'
                                ? 'text-emerald-400'
                                : leg.legStatus === 'LOST'
                                ? 'text-rose-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {leg.legStatus}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/70">
                    <span>Stake: <strong className="font-mono text-slate-200">{formatCentsToKes(tkt.stakeCents)}</strong></span>
                    <span>
                      Total Payout: <strong className="font-mono text-[#22c55e]">{formatCentsToKes(tkt.potentialPayoutCents)}</strong>
                    </span>
                  </div>

                  {/* Cashout / Pre-Match Cancel Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    {tkt.cashoutOfferCents && tkt.cashoutOfferCents > 0 && (
                      <button
                        type="button"
                        disabled={cashingOutId === tkt.id}
                        onClick={() => handleCashOut(tkt)}
                        className="flex-1 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 tabular-nums cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>
                          {cashingOutId === tkt.id
                            ? 'Processing...'
                            : `Cash Out ${formatCentsToKes(tkt.cashoutOfferCents)}`}
                        </span>
                      </button>
                    )}

                    {allUpcoming && (
                      <button
                        type="button"
                        disabled={cashingOutId === tkt.id}
                        onClick={() => handleCancelPreMatch(tkt)}
                        title="Cancel pre-match bet before kickoff for 100% refund"
                        className="py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Cancel (100%)</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

