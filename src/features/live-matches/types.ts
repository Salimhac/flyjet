export type FootballLeagueId =
  | 'EPL'
  | 'UCL'
  | 'UEL'
  | 'FKF'
  | 'LALIGA'
  | 'SERIEA'
  | 'BUNDESLIGA'
  | 'LIGUE1'
  | 'WORLD';

export type FootballMatchStatus =
  | 'UPCOMING' // Pre-Match ("Bet Early" before kickoff)
  | 'LIVE_1H'  // 1st Half In-Play (1' - 45')
  | 'HT'       // Half Time Break
  | 'LIVE_2H'  // 2nd Half In-Play (46' - 90')
  | 'FT';      // Full Time (Settled)

export type FootballMarketKey =
  | '1X2'
  | 'DOUBLE_CHANCE'
  | 'OVER_UNDER_15'
  | 'OVER_UNDER_25'
  | 'OVER_UNDER_35'
  | 'BTTS'
  | 'DRAW_NO_BET'
  | 'FIRST_HALF_1X2'
  | 'CORRECT_SCORE';

export type LiveMatchTicketStatus =
  | 'OPEN'
  | 'WON'
  | 'LOST'
  | 'CASHED_OUT'
  | 'CANCELLED'
  | 'VOID';

export type LiveMatchLegStatus =
  | 'PENDING'
  | 'WON'
  | 'LOST'
  | 'VOID';

export type LiveMatchErrorCode =
  | 'LM_AUTH_REQUIRED'
  | 'LM_STAKE_BELOW_MIN_10_KES'
  | 'LM_STAKE_ABOVE_MAX_LIMIT'
  | 'LM_STAKE_NON_INTEGER_CENTS'
  | 'LM_STAKE_INVALID_INCREMENT'
  | 'LM_AUTO_CASHOUT_INVALID'
  | 'LM_INSUFFICIENT_FUNDS'
  | 'LM_MATCH_NOT_FOUND'
  | 'LM_MARKET_SUSPENDED'
  | 'LM_MATCH_ALREADY_FINISHED'
  | 'LM_EMPTY_SELECTIONS'
  | 'LM_DUPLICATE_MATCH_IN_SLIP'
  | 'LM_BET_NOT_FOUND'
  | 'LM_BET_ALREADY_SETTLED'
  | 'LM_CASHOUT_UNAVAILABLE'
  | 'LM_MISSING_IDEMPOTENCY_KEY'
  | 'LM_RATE_LIMITED'
  | 'LM_SELF_EXCLUDED'
  | 'LM_INTERNAL_ERROR';

export interface FootballSelectionOption {
  selectionId: string; // e.g. "m_ars_che:1X2:1"
  marketKey: FootballMarketKey;
  marketName: string;
  outcomeKey: string; // e.g. "1", "X", "2", "1X", "OVER_2.5", "GG"
  outcomeLabel: string; // e.g. "Arsenal", "Draw", "Chelsea", "Over 2.5", "Yes (GG)"
  odds: number; // e.g. 2.15
  previousOdds?: number;
  trend?: 'up' | 'down' | 'same';
  suspended?: boolean;
}

export interface FootballMarketDTO {
  marketKey: FootballMarketKey;
  marketName: string;
  shortName: string;
  suspended: boolean;
  selections: FootballSelectionOption[];
}

export interface FootballMatchEventDTO {
  id: string;
  minute: number;
  type: 'KICKOFF' | 'GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'CORNER' | 'DANGEROUS_ATTACK' | 'HT' | 'FT';
  team: 'HOME' | 'AWAY' | 'NEUTRAL';
  player?: string;
  description: string;
  scoreSnapshot?: string;
  timestamp: string;
}

export interface FootballMatchStatsDTO {
  possessionHome: number;
  possessionAway: number;
  shotsHome: number;
  shotsAway: number;
  shotsOnTargetHome: number;
  shotsOnTargetAway: number;
  cornersHome: number;
  cornersAway: number;
  yellowCardsHome: number;
  yellowCardsAway: number;
  redCardsHome: number;
  redCardsAway: number;
  dangerousAttacksHome: number;
  dangerousAttacksAway: number;
  // Live 2D pitch ball coordinates (0-100 x, 0-100 y)
  ballX: number;
  ballY: number;
  momentumTeam: 'HOME' | 'AWAY' | 'NEUTRAL';
  lastActionText: string;
}

export interface FootballMatchDTO {
  id: string;
  fixtureCode: number; // Betika-style game ID derived from official match ID
  leagueId: FootballLeagueId;
  leagueName: string;
  country: string;
  venue?: string;
  homeTeam: string;
  homeShort: string;
  homeBadgeColor: string;
  homeLogo?: string;
  homeForm: Array<'W' | 'D' | 'L'>;
  awayTeam: string;
  awayShort: string;
  awayBadgeColor: string;
  awayLogo?: string;
  awayForm: Array<'W' | 'D' | 'L'>;
  status: FootballMatchStatus;
  statusDetail?: string;
  isPreMatchBetEarly: boolean; // True when UPCOMING (Bet Early before kickoff)
  kickoffAt: number; // Unix timestamp ms
  kickoffIso?: string;
  startsInSeconds: number; // Countdown for UPCOMING matches
  minute: number; // 0 for UPCOMING, 1..90+ for LIVE/FT
  homeScore: number;
  awayScore: number;
  htHomeScore: number;
  htAwayScore: number;
  marketsCount: number;
  markets: FootballMarketDTO[];
  events: FootballMatchEventDTO[];
  stats: FootballMatchStatsDTO;
  h2hSummary: {
    homeWins: number;
    draws: number;
    awayWins: number;
    lastMeeting: string;
  };
  // Provably Fair & Official Data Audit metadata
  serverSeedHash: string;
  serverSeed: string | null; // Revealed only when status === 'FT'
  clientSeed: string;
  nonce: number;
  totalBetsCount: number;
  totalPoolCents: number;
  updatedAt: number;
}

export interface BetSlipSelectionInput {
  matchId: string;
  marketKey: FootballMarketKey;
  outcomeKey: string;
  expectedOdds?: number;
}

export interface LiveMatchTicketLegDTO {
  id: string;
  matchId: string;
  fixtureCode: number;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  placedAtStatus: FootballMatchStatus;
  isEarlyBet: boolean; // True if placed while UPCOMING (before kickoff)
  scoreAtPlacement: string;
  currentHomeScore: number;
  currentAwayScore: number;
  currentStatus: FootballMatchStatus;
  currentMinute: number;
  marketKey: FootballMarketKey;
  marketName: string;
  outcomeKey: string;
  outcomeLabel: string;
  lockedOdds: number;
  currentLiveOdds: number | null;
  legStatus: LiveMatchLegStatus;
}

export interface LiveMatchTicketDTO {
  id: string;
  ticketCode: string; // e.g. "BTK-948210"
  userId: string;
  usernameMasked: string;
  type: 'SINGLE' | 'MULTI';
  legs: LiveMatchTicketLegDTO[];
  totalOdds: number;
  stakeCents: number; // Integer minor units (min 1000 = 10.00 KES)
  multiBoostPercent: number; // e.g. 0%, 5%, 10%
  potentialPayoutCents: number; // Integer minor units
  cashoutOfferCents: number | null; // Live early cashout offer in KES cents
  cashedOutAmountCents: number | null;
  autoCashoutMultiplier: number | null; // Optional auto-cashout multiplier target
  payoutCents: number;
  profitCents: number;
  status: LiveMatchTicketStatus;
  hasEarlyBetLegs: boolean;
  hasLiveLegs: boolean;
  idempotencyKey: string;
  placedAt: string;
  settledAt: string | null;
}

export interface LiveMatchPublicFeedBetDTO {
  id: string;
  ticketCode: string;
  usernameMasked: string;
  type: 'SINGLE' | 'MULTI';
  legsCount: number;
  primaryMatchId: string;
  primaryMatchLabel: string;
  primaryPickLabel: string;
  isEarlyBet: boolean;
  totalOdds: number;
  stakeCents: number;
  potentialPayoutCents: number;
  status: LiveMatchTicketStatus;
  cashedOutAmountCents: number | null;
  placedAt: string;
}

export interface LiveMatchesStateSnapshotDTO {
  matches: FootballMatchDTO[];
  recentPublicBets: LiveMatchPublicFeedBetDTO[];
  onlinePlayers: number;
  minStakeCents: number;
  maxStakeCents: number;
  maxPayoutCents: number;
  serverTimestamp: number;
  lastSyncedAt?: string;
  feedSource?: string;
}

export interface LiveMatchAuditLogDTO {
  id: string;
  eventType:
    | 'BET_DEBIT'
    | 'BET_CANCEL_REFUND'
    | 'CASHOUT_CREDIT'
    | 'MATCH_SETTLE_WIN'
    | 'REJECTED_ACTION';
  userId: string | null;
  matchId: string | null;
  ticketId: string | null;
  amountCents: number;
  balanceBeforeCents: number | null;
  balanceAfterCents: number | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface LiveMatchFairnessVerifyResult {
  valid: boolean;
  serverSeed: string;
  expectedServerSeedHash: string;
  computedServerSeedHash: string;
  hashMatches: boolean;
  clientSeed: string;
  nonce: number;
  hmacHex: string;
  simulatedHomeGoals: number;
  simulatedAwayGoals: number;
  computedCrashPoint: number; // Kept for backward compatibility with verifier utility
}

export type LiveMatchSocketEventType =
  | 'matches:snapshot'
  | 'match:tick'
  | 'match:event'
  | 'match:kickoff'
  | 'match:settled'
  | 'bet:placed'
  | 'bet:cashed_out'
  | 'ticket:updated'
  | 'pong';

export interface LiveMatchSocketEnvelope<T = unknown> {
  event: LiveMatchSocketEventType;
  matchId?: string;
  serverTimestamp: number;
  data: T;
}
