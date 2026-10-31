import React, { useState } from 'react';
import {
  ArrowLeft,
  Clock,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Activity,
  BarChart3,
  ListOrdered,
  MapPin,
} from 'lucide-react';
import { UserProfile, Wallet } from '../../../types';
import {
  FootballMatchDTO,
  LiveMatchTicketDTO,
} from '../types';
import { BetSlipItem } from '../useLiveMatchesSocket';
import { BetikaBetSlip } from '../components/BetikaBetSlip';
import { getCountryFlag } from './LiveMatchesLobbyPage';
import {
  computeTicketPayoutBreakdown,
  formatCentsToKes,
  parsePreviewStakeCents,
} from '../money';

interface LiveMatchArenaPageProps {
  match: FootballMatchDTO | null;
  allMatches: FootballMatchDTO[];
  userTickets: LiveMatchTicketDTO[];
  onRefreshTickets: () => void;
  betSlip: BetSlipItem[];
  stakeInput?: string;
  onStakeChange?: (val: string) => void;
  onToggleSelection: (item: BetSlipItem) => void;
  onRemoveSelection: (selectionId: string) => void;
  onClearSlip: () => void;
  user: UserProfile | null;
  wallet: Wallet | null;
  onWalletUpdate: (newBalanceKes: number) => void;
  onOpenAuth: () => void;
  onOpenDeposit: () => void;
  onSwitchMatch: (matchId: string) => void;
  onNavigate: (path: string) => void;
}

function formatArenaCountdown(kickoffAt: number, seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 3600) {
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }
  if (safe < 86400) {
    const hours = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    return `${hours}h ${String(mins).padStart(2, '0')}m`;
  }
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  return `${days}d ${hours}h`;
}

export const LiveMatchArenaPage: React.FC<LiveMatchArenaPageProps> = ({
  match,
  allMatches,
  userTickets,
  onRefreshTickets,
  betSlip,
  stakeInput = '50',
  onStakeChange,
  onToggleSelection,
  onRemoveSelection,
  onClearSlip,
  user,
  wallet,
  onWalletUpdate,
  onOpenAuth,
  onOpenDeposit,
  onSwitchMatch,
  onNavigate,
}) => {
  const [centerTab, setCenterTab] = useState<'pitch' | 'stats' | 'timeline'>('pitch');

  const activeStakeCents = parsePreviewStakeCents(stakeInput);
  const slipBreakdown = computeTicketPayoutBreakdown(
    activeStakeCents,
    betSlip.map((s) => s.odds)
  );

  if (!match) {
    return (
      <div className="bg-[#121824] border border-slate-800 rounded-xl p-8 text-center">
        <p className="text-sm font-bold text-slate-300">Loading Official Football Match Center...</p>
      </div>
    );
  }

  const isUpcoming = match.status === 'UPCOMING';
  const isLive =
    match.status === 'LIVE_1H' || match.status === 'HT' || match.status === 'LIVE_2H';

  const kickoffDateFormatted = new Date(match.kickoffAt).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Horizontal Quick Match Switcher Strip */}
      <div className="bg-[#121824] border border-slate-800 rounded-xl p-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => onNavigate('/live-matches')}
          className="px-2.5 py-1.5 rounded-lg bg-[#0b0f19] hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>All Matches</span>
        </button>

        {allMatches.slice(0, 24).map((m) => {
          const active = m.id === match.id;
          const up = m.status === 'UPCOMING';
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSwitchMatch(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-2 border cursor-pointer ${
                active
                  ? 'bg-[#22c55e]/20 border-[#22c55e] text-white'
                  : 'bg-[#0b0f19] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  up ? 'bg-amber-400' : m.status === 'FT' ? 'bg-slate-500' : 'bg-rose-500 animate-pulse'
                }`}
              />
              <span>
                {m.homeShort} vs {m.awayShort}
              </span>
              <span className="font-mono text-[11px] text-amber-300">
                {up ? 'EARLY' : `${m.homeScore}-${m.awayScore}`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT / MAIN MATCH CENTER COLUMN (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          {/* Scoreboard & 2D Live Pitch Visualizer Card */}
          <div className="bg-[#121824] border border-slate-800 rounded-xl overflow-hidden">
            {/* Match Header Bar */}
            <div className="bg-[#0b0f19] px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  ID: #{match.fixtureCode}
                </span>
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  {getCountryFlag(match.country, match.leagueId) ? (
                    <span>{getCountryFlag(match.country, match.leagueId)}</span>
                  ) : null}
                  <span>{match.country} · {match.leagueName}</span>
                </span>
                {match.venue && (
                  <span className="text-slate-400 text-[11px] flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    {match.venue}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isUpcoming ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs">
                    <Clock className="w-3.5 h-3.5" />
                    BET EARLY · Kickoff in {formatArenaCountdown(match.kickoffAt, match.startsInSeconds)}
                  </span>
                ) : isLive ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono font-extrabold text-xs">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    {match.status === 'HT' ? 'HALF TIME' : `LIVE IN-PLAY · ${match.minute}'`}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono font-bold text-xs">
                    FULL TIME (90&apos;)
                  </span>
                )}
              </div>
            </div>

            {/* Teams & Scoreboard Hero */}
            <div className="p-4 sm:p-5 bg-gradient-to-b from-[#131d2e] to-[#0e1522] border-b border-slate-800">
              <div className="grid grid-cols-3 items-center gap-2 text-center">
                {/* Home Team */}
                <div className="flex flex-col items-center gap-1.5">
                  {match.homeLogo ? (
                    <img
                      src={match.homeLogo}
                      alt={match.homeTeam}
                      className="w-11 h-11 object-contain drop-shadow"
                    />
                  ) : (
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center font-extrabold text-sm text-white shadow-md border-2 border-white/20"
                      style={{ backgroundColor: match.homeBadgeColor }}
                    >
                      {match.homeShort}
                    </div>
                  )}
                  <h2 className="text-xs sm:text-base font-extrabold text-white leading-tight">
                    {match.homeTeam}
                  </h2>
                  <div className="flex items-center gap-1">
                    {match.homeForm.map((f, i) => (
                      <span
                        key={i}
                        className={`w-4 h-4 rounded text-[9px] font-mono font-bold flex items-center justify-center ${
                          f === 'W'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : f === 'D'
                            ? 'bg-slate-700 text-slate-300'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Center Score or Official Pre-Match Kickoff Countdown */}
                <div className="flex flex-col items-center justify-center">
                  {isUpcoming ? (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400">
                        Pre-Match · Bet Early
                      </span>
                      <div className="font-mono font-extrabold text-base sm:text-xl text-white bg-[#0b0f19] px-3.5 py-1.5 rounded-xl border border-amber-500/30 tabular-nums">
                        {formatArenaCountdown(match.kickoffAt, match.startsInSeconds)}
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        {kickoffDateFormatted}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-3 font-mono font-extrabold text-3xl sm:text-4xl text-white tabular-nums">
                        <span>{match.homeScore}</span>
                        <span className="text-slate-600 text-2xl">:</span>
                        <span>{match.awayScore}</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 mt-1">
                        HT: {match.htHomeScore} - {match.htAwayScore}
                      </span>
                    </div>
                  )}
                </div>

                {/* Away Team */}
                <div className="flex flex-col items-center gap-1.5">
                  {match.awayLogo ? (
                    <img
                      src={match.awayLogo}
                      alt={match.awayTeam}
                      className="w-11 h-11 object-contain drop-shadow"
                    />
                  ) : (
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center font-extrabold text-sm text-white shadow-md border-2 border-white/20"
                      style={{ backgroundColor: match.awayBadgeColor }}
                    >
                      {match.awayShort}
                    </div>
                  )}
                  <h2 className="text-xs sm:text-base font-extrabold text-white leading-tight">
                    {match.awayTeam}
                  </h2>
                  <div className="flex items-center gap-1">
                    {match.awayForm.map((f, i) => (
                      <span
                        key={i}
                        className={`w-4 h-4 rounded text-[9px] font-mono font-bold flex items-center justify-center ${
                          f === 'W'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : f === 'D'
                            ? 'bg-slate-700 text-slate-300'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Pitch / Stats / Timeline Switcher Tabs */}
            <div className="grid grid-cols-3 bg-[#0b0f19] border-b border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setCenterTab('pitch')}
                className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  centerTab === 'pitch'
                    ? 'border-[#22c55e] text-[#22c55e] bg-[#121824]'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>2D Pitch Tracker</span>
              </button>
              <button
                type="button"
                onClick={() => setCenterTab('stats')}
                className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  centerTab === 'stats'
                    ? 'border-[#22c55e] text-[#22c55e] bg-[#121824]'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Match Stats &amp; H2H</span>
              </button>
              <button
                type="button"
                onClick={() => setCenterTab('timeline')}
                className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  centerTab === 'timeline'
                    ? 'border-[#22c55e] text-[#22c55e] bg-[#121824]'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5" />
                <span>Commentary ({match.events.length})</span>
              </button>
            </div>

            {/* Visualizer Body */}
            <div className="p-3.5">
              {centerTab === 'pitch' && (
                <div className="relative w-full h-44 sm:h-52 rounded-xl bg-gradient-to-r from-[#0d3b22] via-[#114b2b] to-[#0d3b22] border-2 border-emerald-500/40 overflow-hidden shadow-inner">
                  {/* Pitch Markings SVG */}
                  <svg
                    viewBox="0 0 200 100"
                    className="w-full h-full opacity-40"
                    preserveAspectRatio="none"
                  >
                    <rect x="2" y="2" width="196" height="96" fill="none" stroke="#ffffff" strokeWidth="1.2" />
                    <line x1="100" y1="2" x2="100" y2="98" stroke="#ffffff" strokeWidth="1.2" />
                    <circle cx="100" cy="50" r="14" fill="none" stroke="#ffffff" strokeWidth="1.2" />
                    <circle cx="100" cy="50" r="1.5" fill="#ffffff" />
                    {/* Left Penalty Area */}
                    <rect x="2" y="22" width="28" height="56" fill="none" stroke="#ffffff" strokeWidth="1.2" />
                    <rect x="2" y="35" width="10" height="30" fill="none" stroke="#ffffff" strokeWidth="1.2" />
                    {/* Right Penalty Area */}
                    <rect x="170" y="22" width="28" height="56" fill="none" stroke="#ffffff" strokeWidth="1.2" />
                    <rect x="188" y="35" width="10" height="30" fill="none" stroke="#ffffff" strokeWidth="1.2" />
                  </svg>

                  {/* Live Ball Position Indicator */}
                  <div
                    className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-white shadow-lg border-2 border-amber-400 transition-all duration-700 flex items-center justify-center"
                    style={{
                      left: `${match.stats.ballX}%`,
                      top: `${match.stats.ballY}%`,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                  </div>

                  {/* Live Action Overlay Pill */}
                  <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 bg-slate-950/85 border border-emerald-500/40 px-3 py-1 rounded-md text-xs font-bold text-emerald-300 whitespace-nowrap shadow-lg">
                    {match.stats.lastActionText}
                  </div>
                </div>
              )}

              {centerTab === 'stats' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-[#0b0f19] border border-slate-800 rounded-lg p-3 space-y-2">
                    <div className="font-bold text-slate-300 uppercase tracking-wider text-[11px] border-b border-slate-800 pb-1">
                      Live Match Statistics
                    </div>
                    <div className="flex justify-between">
                      <span className="font-mono font-bold text-emerald-400">{match.stats.possessionHome}%</span>
                      <span className="text-slate-400">Ball Possession</span>
                      <span className="font-mono font-bold text-sky-400">{match.stats.possessionAway}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-mono font-bold text-white">{match.stats.shotsOnTargetHome}</span>
                      <span className="text-slate-400">Shots on Target</span>
                      <span className="font-mono font-bold text-white">{match.stats.shotsOnTargetAway}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-mono font-bold text-white">{match.stats.cornersHome}</span>
                      <span className="text-slate-400">Corner Kicks</span>
                      <span className="font-mono font-bold text-white">{match.stats.cornersAway}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-mono font-bold text-amber-400">{match.stats.yellowCardsHome}</span>
                      <span className="text-slate-400">Yellow Cards</span>
                      <span className="font-mono font-bold text-amber-400">{match.stats.yellowCardsAway}</span>
                    </div>
                  </div>

                  <div className="bg-[#0b0f19] border border-slate-800 rounded-lg p-3 space-y-2">
                    <div className="font-bold text-slate-300 uppercase tracking-wider text-[11px] border-b border-slate-800 pb-1">
                      Head-To-Head (H2H) History
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center pt-1">
                      <div className="bg-[#121824] p-2 rounded border border-slate-800">
                        <div className="font-mono font-extrabold text-sm text-emerald-400">
                          {match.h2hSummary.homeWins}
                        </div>
                        <div className="text-[10px] text-slate-400">{match.homeShort} Wins</div>
                      </div>
                      <div className="bg-[#121824] p-2 rounded border border-slate-800">
                        <div className="font-mono font-extrabold text-sm text-slate-300">
                          {match.h2hSummary.draws}
                        </div>
                        <div className="text-[10px] text-slate-400">Draws</div>
                      </div>
                      <div className="bg-[#121824] p-2 rounded border border-slate-800">
                        <div className="font-mono font-extrabold text-sm text-sky-400">
                          {match.h2hSummary.awayWins}
                        </div>
                        <div className="text-[10px] text-slate-400">{match.awayShort} Wins</div>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 pt-1">
                      Last Meeting: <strong className="text-slate-200">{match.h2hSummary.lastMeeting}</strong>
                    </div>
                  </div>
                </div>
              )}

              {centerTab === 'timeline' && (
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {match.events.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400">
                      Match has not kicked off yet. Place your <strong className="text-amber-300">Bet Early</strong> pre-match selections below!
                    </div>
                  ) : (
                    match.events.map((ev) => (
                      <div
                        key={ev.id}
                        className="bg-[#0b0f19] border border-slate-800 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-400 w-8">
                            {ev.minute}&apos;
                          </span>
                          <span
                            className={
                              ev.type === 'GOAL'
                                ? 'font-extrabold text-[#22c55e]'
                                : 'text-slate-200'
                            }
                          >
                            {ev.description}
                          </span>
                        </div>
                        {ev.scoreSnapshot && (
                          <span className="font-mono text-[11px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded">
                            {ev.scoreSnapshot}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Live Selected Games & Total Payout Calculator Banner */}
          {betSlip.length > 0 && (
            <div className="bg-gradient-to-r from-[#0d2218] via-[#121c29] to-[#0f2419] border border-[#22c55e]/50 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-lg">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#22c55e] text-slate-950 font-extrabold text-[11px] uppercase tracking-wider">
                  {betSlip.length} {betSlip.length === 1 ? 'Game Selected' : 'Games Selected'}
                </span>
                <span className="text-xs text-slate-300">
                  Total Odds:{' '}
                  <strong className="font-mono text-amber-300">{slipBreakdown.totalOdds.toFixed(2)}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">
                  Stake ({formatCentsToKes(activeStakeCents)}) · Total Payout:
                </span>
                <span className="font-mono font-extrabold text-sm text-[#22c55e] tabular-nums">
                  {formatCentsToKes(slipBreakdown.totalPayoutCents)}
                </span>
              </div>
            </div>
          )}

          {/* ALL BETIKA MARKETS ACCORDION LIST */}
          <div className="flex flex-col gap-2.5">
            {match.markets.map((market) => (
              <div
                key={market.marketKey}
                className="bg-[#121824] border border-slate-800 rounded-xl overflow-hidden"
              >
                <div className="bg-[#0b0f19] px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                      {market.marketName}
                    </span>
                    {isUpcoming && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                        EARLY ODDS
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">Cashout Eligible</span>
                </div>

                <div
                  className={`p-3 grid gap-2 ${
                    market.selections.length === 2
                      ? 'grid-cols-2'
                      : market.selections.length === 3
                      ? 'grid-cols-3'
                      : 'grid-cols-3 sm:grid-cols-3'
                  }`}
                >
                  {market.selections.map((sel) => {
                    const isSelected = betSlip.some(
                      (s) => s.selectionId === sel.selectionId
                    );
                    const disabled = Boolean(
                      market.suspended || sel.suspended || match.status === 'FT'
                    );

                    return (
                      <button
                        key={sel.selectionId}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          onToggleSelection({
                            selectionId: sel.selectionId,
                            matchId: match.id,
                            fixtureCode: match.fixtureCode,
                            leagueName: match.leagueName,
                            homeTeam: match.homeTeam,
                            awayTeam: match.awayTeam,
                            isEarlyBet: match.status === 'UPCOMING',
                            matchStatus: match.status,
                            marketKey: market.marketKey,
                            marketName: market.marketName,
                            outcomeKey: sel.outcomeKey,
                            outcomeLabel: sel.outcomeLabel,
                            odds: sel.odds,
                          })
                        }
                        className={`px-3 py-2.5 rounded-lg border flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#22c55e] border-[#22c55e] text-slate-950 font-extrabold shadow-md'
                            : disabled
                            ? 'bg-slate-900/40 border-slate-800/60 text-slate-600 cursor-not-allowed'
                            : 'bg-[#0b0f19] hover:bg-slate-800 border-slate-800 hover:border-slate-600 text-white'
                        }`}
                      >
                        <span
                          className={`text-xs truncate mr-2 ${
                            isSelected ? 'text-slate-950 font-bold' : 'text-slate-300'
                          }`}
                        >
                          {sel.outcomeLabel}
                        </span>
                        <div className="flex items-center gap-1 font-mono font-bold text-xs sm:text-sm tabular-nums shrink-0">
                          <span>{disabled ? 'LOCKED' : sel.odds.toFixed(2)}</span>
                          {!isSelected && !disabled && sel.trend === 'up' && (
                            <TrendingUp className="w-3 h-3 text-emerald-400" />
                          )}
                          {!isSelected && !disabled && sel.trend === 'down' && (
                            <TrendingDown className="w-3 h-3 text-rose-400" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Match Fairness Verification Footer */}
          <div className="bg-[#121824] border border-slate-800 rounded-xl p-3 flex items-center justify-end text-xs">
            <button
              type="button"
              onClick={() =>
                onNavigate(
                  `/live-matches/rules?serverSeedHash=${encodeURIComponent(
                    match.serverSeedHash
                  )}&clientSeed=${encodeURIComponent(match.clientSeed)}&nonce=${match.nonce}`
                )
              }
              className="text-[#22c55e] hover:underline font-bold cursor-pointer flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4 text-[#22c55e] shrink-0" />
              <span>Verify Match Fairness →</span>
            </button>
          </div>
        </div>

        {/* RIGHT SIDEBAR: BETIKA BET SLIP (4 cols) */}
        <div className="lg:col-span-4 lg:sticky lg:top-4">
          <BetikaBetSlip
            betSlip={betSlip}
            stakeInput={stakeInput}
            onStakeChange={onStakeChange}
            onRemoveSelection={onRemoveSelection}
            onClearSlip={onClearSlip}
            userTickets={userTickets}
            onRefreshTickets={onRefreshTickets}
            user={user}
            wallet={wallet}
            onWalletUpdate={onWalletUpdate}
            onOpenAuth={onOpenAuth}
            onOpenDeposit={onOpenDeposit}
            onNavigateMatch={onSwitchMatch}
            onNavigateHistory={() => onNavigate('/live-matches/history')}
          />
        </div>
      </div>
    </div>
  );
};
