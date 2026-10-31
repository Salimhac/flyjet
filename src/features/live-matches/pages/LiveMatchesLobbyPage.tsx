import React, { useState, useMemo } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { UserProfile, Wallet } from '../../../types';
import {
  FootballLeagueId,
  FootballMarketKey,
  FootballMatchDTO,
  LiveMatchPublicFeedBetDTO,
  LiveMatchTicketDTO,
} from '../types';
import { BetSlipItem } from '../useLiveMatchesSocket';
import { BetikaBetSlip } from '../components/BetikaBetSlip';
import {
  computeTicketPayoutBreakdown,
  formatCentsToKes,
  parsePreviewStakeCents,
} from '../money';

interface LiveMatchesLobbyPageProps {
  matches: FootballMatchDTO[];
  recentPublicBets: LiveMatchPublicFeedBetDTO[];
  userTickets: LiveMatchTicketDTO[];
  onRefreshTickets: () => void;
  onlinePlayers: number;
  lastSyncedAt?: string;
  isSyncingFeed?: boolean;
  onSyncLiveFeed?: () => void;
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
  onSelectMatch: (matchId: string) => void;
  onNavigate: (path: string) => void;
}

type TimingFilter = 'ALL' | 'EARLY' | 'LIVE' | 'RESULTS';

const LEAGUE_TABS: Array<{ id: 'ALL' | FootballLeagueId; label: string; flag: string }> = [
  { id: 'ALL', label: 'All', flag: '' },
  { id: 'EPL', label: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 'LALIGA', label: 'Spain', flag: '🇪🇸' },
  { id: 'SERIEA', label: 'Serie A', flag: '🇮🇹' },
  { id: 'BUNDESLIGA', label: 'Bundesliga', flag: '🇩🇪' },
  { id: 'LIGUE1', label: 'Ligue 1', flag: '🇫🇷' },
  { id: 'UCL', label: 'Champions League', flag: '' },
  { id: 'UEL', label: 'Europa League', flag: '' },
  { id: 'FKF', label: 'Africa / CAF', flag: '🇰🇪' },
  { id: 'WORLD', label: 'World / Cups', flag: '' },
];

export function getCountryFlag(country: string, leagueId?: FootballLeagueId): string {
  const c = (country || '').toLowerCase();
  if (c.includes('england') || leagueId === 'EPL') return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
  if (c.includes('spain') || leagueId === 'LALIGA') return '🇪🇸';
  if (c.includes('italy') || leagueId === 'SERIEA') return '🇮🇹';
  if (c.includes('germany') || leagueId === 'BUNDESLIGA') return '🇩🇪';
  if (c.includes('france') || leagueId === 'LIGUE1') return '🇫🇷';
  if (c.includes('kenya')) return '🇰🇪';
  if (c.includes('brazil')) return '🇧🇷';
  if (c.includes('saudi')) return '🇸🇦';
  if (c.includes('netherlands')) return '🇳🇱';
  if (c.includes('sweden')) return '🇸🇪';
  if (c.includes('colombia')) return '🇨🇴';
  if (c.includes('peru')) return '🇵🇪';
  if (c.includes('mexico')) return '🇲🇽';
  if (c.includes('argentina')) return '🇦🇷';
  if (c.includes('portugal')) return '🇵🇹';
  if (c.includes('scotland')) return '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
  return '';
}

const QUICK_MARKETS: Array<{
  key: FootballMarketKey;
  label: string;
}> = [
  { key: '1X2', label: '1X2' },
  { key: 'DOUBLE_CHANCE', label: 'Double Chance' },
  { key: 'OVER_UNDER_25', label: 'O/U 2.5' },
  { key: 'BTTS', label: 'GG / NG' },
];

/**
 * Formats kickoff timestamp as "DD/MM, HH:mm" (e.g. "29/10, 22:45") matching Screenshot 1
 */
function formatMatchDateTime(kickoffAt: number): string {
  const d = new Date(kickoffAt);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}, ${hours}:${mins}`;
}

function formatSyncTime(iso?: string): string {
  if (!iso) return 'Just now';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return 'Just now';
  }
}

/**
 * Computes a realistic "+XX Markets" count per fixture (e.g. +85 Markets, +68 Markets, +33 Markets)
 */
function getDisplayMarketsCount(match: FootballMatchDTO): number {
  const base = 25 + (match.fixtureCode % 62);
  return Math.max(match.markets.length, base);
}

/**
 * Clean monochrome Soccer Ball SVG icon matching the top-left of each match row in Screenshot 1
 */
const SoccerBallIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9.5" />
    <polygon points="12,7.5 15.8,10.2 14.3,14.6 9.7,14.6 8.2,10.2" fill="currentColor" fillOpacity="0.25" />
    <line x1="12" y1="2.5" x2="12" y2="7.5" />
    <line x1="15.8" y1="10.2" x2="20.8" y2="8.5" />
    <line x1="14.3" y1="14.6" x2="17.8" y2="19.2" />
    <line x1="9.7" y1="14.6" x2="6.2" y2="19.2" />
    <line x1="8.2" y1="10.2" x2="3.2" y2="8.5" />
  </svg>
);

export const LiveMatchesLobbyPage: React.FC<LiveMatchesLobbyPageProps> = ({
  matches,
  userTickets,
  onRefreshTickets,
  lastSyncedAt,
  isSyncingFeed,
  onSyncLiveFeed,
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
  onSelectMatch,
  onNavigate,
}) => {
  const [timingFilter, setTimingFilter] = useState<TimingFilter>('ALL');
  const [leagueFilter, setLeagueFilter] = useState<'ALL' | FootballLeagueId>('ALL');
  const [quickMarket, setQuickMarket] = useState<FootballMarketKey>('1X2');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeStakeCents = parsePreviewStakeCents(stakeInput);
  const slipBreakdown = computeTicketPayoutBreakdown(
    activeStakeCents,
    betSlip.map((s) => s.odds)
  );

  const upcomingCount = useMemo(
    () => matches.filter((m) => m.status === 'UPCOMING').length,
    [matches]
  );
  const liveCount = useMemo(
    () =>
      matches.filter(
        (m) => m.status === 'LIVE_1H' || m.status === 'HT' || m.status === 'LIVE_2H'
      ).length,
    [matches]
  );
  const resultsCount = useMemo(
    () => matches.filter((m) => m.status === 'FT').length,
    [matches]
  );

  const filteredMatches = useMemo(() => {
    const filtered = matches.filter((m) => {
      if (timingFilter === 'EARLY' && m.status !== 'UPCOMING') return false;
      if (
        timingFilter === 'LIVE' &&
        m.status !== 'LIVE_1H' &&
        m.status !== 'HT' &&
        m.status !== 'LIVE_2H'
      ) {
        return false;
      }
      if (timingFilter === 'RESULTS' && m.status !== 'FT') return false;

      if (leagueFilter !== 'ALL' && m.leagueId !== leagueFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hit =
          m.homeTeam.toLowerCase().includes(q) ||
          m.awayTeam.toLowerCase().includes(q) ||
          m.leagueName.toLowerCase().includes(q) ||
          m.country.toLowerCase().includes(q) ||
          String(m.fixtureCode).includes(q);
        if (!hit) return false;
      }
      return true;
    });

    const rankStatus = (s: FootballMatchDTO['status']) => {
      if (s === 'LIVE_1H' || s === 'HT' || s === 'LIVE_2H') return 0;
      if (s === 'UPCOMING') return 1;
      return 2;
    };

    return [...filtered].sort((a, b) => {
      if (timingFilter === 'RESULTS') {
        return b.kickoffAt - a.kickoffAt;
      }
      const ra = rankStatus(a.status);
      const rb = rankStatus(b.status);
      if (ra !== rb) return ra - rb;
      if (ra === 1) return a.kickoffAt - b.kickoffAt;
      return b.kickoffAt - a.kickoffAt;
    });
  }, [matches, timingFilter, leagueFilter, searchQuery]);

  const scrollToBetSlip = () => {
    const el = document.getElementById('betika-betslip-panel');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* LEFT / MAIN MATCHES LIST COLUMN (8 cols on lg) */}
      <div className="lg:col-span-8 flex flex-col gap-2.5">
        {/* Compact Filter & Market Bar */}
        <div className="bg-[#151e27] border border-[#222e3a] rounded-xl p-2.5 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Highlights / Upcoming / Live / Results Tabs */}
            <div className="flex items-center gap-1 bg-[#0e151c] p-1 rounded-full border border-[#222e3a] overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setTimingFilter('ALL')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  timingFilter === 'ALL'
                    ? 'bg-[#242e38] text-white'
                    : 'text-[#8c9aa6] hover:text-white'
                }`}
              >
                Highlights ({matches.length})
              </button>
              <button
                type="button"
                onClick={() => setTimingFilter('EARLY')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  timingFilter === 'EARLY'
                    ? 'bg-[#242e38] text-white'
                    : 'text-[#8c9aa6] hover:text-white'
                }`}
              >
                Upcoming ({upcomingCount})
              </button>
              <button
                type="button"
                onClick={() => setTimingFilter('LIVE')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  timingFilter === 'LIVE'
                    ? 'bg-[#242e38] text-white'
                    : 'text-[#8c9aa6] hover:text-white'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                <span>Live ({liveCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setTimingFilter('RESULTS')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  timingFilter === 'RESULTS'
                    ? 'bg-[#242e38] text-white'
                    : 'text-[#8c9aa6] hover:text-white'
                }`}
              >
                Results ({resultsCount})
              </button>
            </div>

            {/* Market Selector Pills (1X2, Double Chance, O/U 2.5, GG/NG) */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {QUICK_MARKETS.map((mkt) => (
                <button
                  key={mkt.key}
                  type="button"
                  onClick={() => setQuickMarket(mkt.key)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    quickMarket === mkt.key
                      ? 'bg-[#22c55e] text-slate-950 font-bold'
                      : 'bg-[#0e151c] text-[#8c9aa6] hover:text-white border border-[#222e3a]'
                  }`}
                >
                  {mkt.label}
                </button>
              ))}
            </div>

            {/* Search Input & Live Sync Button */}
            <div className="flex items-center gap-1.5 flex-1 min-w-[200px] sm:max-w-[260px]">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-[#8c9aa6] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search team or league..."
                  className="w-full bg-[#0e151c] border border-[#222e3a] focus:border-[#22c55e] rounded-full pl-8 pr-3 py-1 text-xs text-white placeholder-[#8c9aa6] focus:outline-none"
                />
              </div>
              {onSyncLiveFeed && (
                <button
                  type="button"
                  onClick={onSyncLiveFeed}
                  disabled={isSyncingFeed}
                  title={`Last synced: ${formatSyncTime(lastSyncedAt)}`}
                  className="px-2.5 py-1 rounded-full bg-[#0e151c] hover:bg-[#242e38] border border-[#222e3a] text-[#8c9aa6] hover:text-white text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncingFeed ? 'animate-spin text-[#22c55e]' : ''}`} />
                  <span className="hidden sm:inline">Sync</span>
                </button>
              )}
            </div>
          </div>

          {/* League Filter Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
            {LEAGUE_TABS.map((lg) => {
              const active = leagueFilter === lg.id;
              return (
                <button
                  key={lg.id}
                  type="button"
                  onClick={() => setLeagueFilter(lg.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                    active
                      ? 'bg-[#242e38] text-white font-semibold'
                      : 'text-[#8c9aa6] hover:text-white'
                  }`}
                >
                  {lg.flag ? <span>{lg.flag}</span> : null}
                  <span>{lg.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Selected Games & Total Payout Summary Bar (when games are selected) */}
        {betSlip.length > 0 && (
          <div className="bg-[#151e27] border border-[#22c55e]/50 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-lg">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full bg-[#22c55e] text-slate-950 font-extrabold text-xs">
                {betSlip.length} {betSlip.length === 1 ? 'Game' : 'Games'}
              </span>
              <span className="text-xs text-[#8c9aa6]">
                Total Odds:{' '}
                <strong className="font-mono text-white">{slipBreakdown.totalOdds.toFixed(2)}</strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[11px] text-[#8c9aa6] block">
                  Total Payout ({formatCentsToKes(activeStakeCents)} × {slipBreakdown.totalOdds.toFixed(2)})
                </span>
                <span className="font-mono font-extrabold text-sm sm:text-base text-[#22c55e] tabular-nums">
                  {formatCentsToKes(slipBreakdown.totalPayoutCents)}
                </span>
              </div>
              <button
                type="button"
                onClick={scrollToBetSlip}
                className="px-3.5 py-1.5 rounded-full bg-[#22c55e] hover:bg-[#16a34a] text-slate-950 font-extrabold text-xs cursor-pointer shrink-0"
              >
                Bet Slip
              </button>
            </div>
          </div>
        )}

        {/* MATCHES LIST CONTAINER (Exact Layout from Screenshot 1) */}
        <div className="bg-[#151e27] border border-[#202b37] rounded-xl overflow-hidden">
          {filteredMatches.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-slate-300">No matches found</p>
              <button
                type="button"
                onClick={() => {
                  setTimingFilter('ALL');
                  setLeagueFilter('ALL');
                  setSearchQuery('');
                }}
                className="mt-3 px-4 py-1.5 rounded-full bg-[#242e38] text-white font-semibold text-xs cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#202b37]">
              {filteredMatches.map((match) => {
                const isUpcoming = match.status === 'UPCOMING';
                const isFT = match.status === 'FT';
                const isLive =
                  match.status === 'LIVE_1H' ||
                  match.status === 'HT' ||
                  match.status === 'LIVE_2H';

                const marketObj =
                  match.markets.find((m) => m.marketKey === quickMarket) ||
                  match.markets[0];
                const marketsCount = getDisplayMarketsCount(match);

                return (
                  <div
                    key={match.id}
                    className="px-3.5 sm:px-4 py-3.5 hover:bg-[#19242f] transition-colors flex flex-col"
                  >
                    {/* Top Line: Soccer Ball + Country • League on Left | Date/Time or Live/FT Status on Right */}
                    <div className="flex items-center justify-between text-[13px] text-[#8c9aa6] mb-1.5">
                      <div className="flex items-center gap-1.5 truncate pr-2">
                        <SoccerBallIcon className="w-4 h-4 text-[#8c9aa6] shrink-0" />
                        <span className="truncate">
                          {match.country} &bull; {match.leagueName}
                        </span>
                      </div>

                      <div className="shrink-0 tabular-nums">
                        {isLive ? (
                          <span className="text-[#4ade80] font-semibold">
                            LIVE {match.status === 'HT' ? 'HT' : `${match.minute}'`} &bull; {formatMatchDateTime(match.kickoffAt)}
                          </span>
                        ) : isFT ? (
                          <span className="text-amber-400 font-semibold">
                            FT &bull; {formatMatchDateTime(match.kickoffAt)}
                          </span>
                        ) : (
                          <span>{formatMatchDateTime(match.kickoffAt)}</span>
                        )}
                      </div>
                    </div>

                    {/* Middle Line: Stacked Team Names & Real Scores on Left | Rounded-Full Odd Pills on Right */}
                    <div className="flex items-center justify-between gap-3">
                      {/* Left: Home & Away Teams */}
                      <div
                        onClick={() => onSelectMatch(match.id)}
                        className="w-[42%] sm:w-[45%] flex flex-col justify-center cursor-pointer group min-w-0 pr-1"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[15px] font-semibold text-white group-hover:text-[#4ade80] transition-colors leading-[1.35] truncate">
                            {match.homeTeam}
                          </span>
                          {!isUpcoming && (
                            <span
                              className={`font-mono font-bold text-sm tabular-nums shrink-0 ${
                                isFT ? 'text-white' : 'text-[#4ade80]'
                              }`}
                            >
                              {match.homeScore}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[15px] font-semibold text-white group-hover:text-[#4ade80] transition-colors leading-[1.35] truncate">
                            {match.awayTeam}
                          </span>
                          {!isUpcoming && (
                            <span
                              className={`font-mono font-bold text-sm tabular-nums shrink-0 ${
                                isFT ? 'text-white' : 'text-[#4ade80]'
                              }`}
                            >
                              {match.awayScore}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Pill Odd Buttons (or Final Result Summary if FT) */}
                      {isFT ? (
                        <div className="w-[58%] sm:w-[55%] flex items-center justify-between gap-2 bg-[#1c252e] border border-[#283542] rounded-full px-4 h-[40px] sm:h-[42px]">
                          <span className="text-xs font-semibold text-[#8c9aa6] uppercase tracking-wider">
                            Final Score
                          </span>
                          <span className="font-mono font-extrabold text-sm sm:text-base text-[#4ade80] tabular-nums">
                            {match.homeScore} - {match.awayScore}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#242e38] text-slate-300">
                            {match.homeScore > match.awayScore
                              ? '1 Won'
                              : match.awayScore > match.homeScore
                              ? '2 Won'
                              : 'X Draw'}
                          </span>
                        </div>
                      ) : (
                        <div
                          className={`w-[58%] sm:w-[55%] grid gap-2 ${
                            marketObj.selections.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
                          }`}
                        >
                          {marketObj.selections.map((sel) => {
                            const isSelected = betSlip.some(
                              (s) => s.selectionId === sel.selectionId
                            );
                            const isDisabled = Boolean(sel.suspended);

                            return (
                              <button
                                key={sel.selectionId}
                                type="button"
                                disabled={isDisabled}
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
                                    marketKey: marketObj.marketKey,
                                    marketName: marketObj.marketName,
                                    outcomeKey: sel.outcomeKey,
                                    outcomeLabel: sel.outcomeLabel,
                                    odds: sel.odds,
                                  })
                                }
                                className={`h-[40px] sm:h-[42px] rounded-full flex items-center justify-center font-semibold text-[14px] sm:text-[15px] tabular-nums transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#22c55e] text-slate-950 font-bold shadow-md'
                                    : isDisabled
                                    ? 'bg-[#1c252e] text-slate-600 cursor-not-allowed'
                                    : 'bg-[#242e38] hover:bg-[#2d3946] text-white'
                                }`}
                              >
                                {isDisabled ? '-' : sel.odds.toFixed(2)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Bottom Line: Right-aligned "+XX Markets" or "Match Result & Stats" in Green */}
                    <div className="flex justify-end mt-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectMatch(match.id)}
                        className="text-[13px] font-medium text-[#43b02a] hover:text-[#4ade80] transition-colors cursor-pointer"
                      >
                        {isFT ? 'View Match Stats & Result' : `+${marketsCount} Markets`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDEBAR: STICKY BET SLIP (4 cols on lg) */}
      <div className="lg:col-span-4 flex flex-col gap-4 lg:sticky lg:top-4">
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
          onNavigateMatch={onSelectMatch}
          onNavigateHistory={() => onNavigate('/live-matches/history')}
        />
      </div>
    </div>
  );
};
