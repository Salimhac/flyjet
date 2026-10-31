import crypto from 'crypto';
import type http from 'http';
import type { Express, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import {
  BetSlipSelectionInput,
  FootballLeagueId,
  FootballMarketDTO,
  FootballMarketKey,
  FootballMatchDTO,
  FootballMatchEventDTO,
  FootballMatchStatus,
  LiveMatchAuditLogDTO,
  LiveMatchErrorCode,
  LiveMatchLegStatus,
  LiveMatchPublicFeedBetDTO,
  LiveMatchSocketEnvelope,
  LiveMatchSocketEventType,
  LiveMatchTicketDTO,
  LiveMatchTicketLegDTO,
  LiveMatchesStateSnapshotDTO,
} from '../features/live-matches/types';
import {
  LM_MAX_PAYOUT_CENTS,
  LM_MAX_STAKE_CENTS,
  LM_MIN_STAKE_CENTS,
  centsToKes,
  computeCombinedOdds,
  computeMultiBoostPercent,
  computeTicketPotentialPayoutCents,
  deriveCrashPointFromHmacHex,
  deriveFootballScoreFromHmacHex,
  kesToCents,
  validateAutoCashout,
  validateStakeCents,
} from '../features/live-matches/money';
import {
  fetchRealWorldFootballMatches,
  NormalizedRealMatchData,
} from './realWorldFootballProvider';

export interface SharedServerContext {
  users: Map<string, any>;
  wallets: Map<string, { userId: string; balanceKes: number; updatedAt: string }>;
  transactions: Array<{
    id: string;
    userId: string;
    type: 'deposit' | 'bet_debit' | 'cashout_credit' | 'withdrawal';
    amountKes: number;
    paystackReference: string;
    status: 'pending' | 'completed' | 'failed';
    createdAt: string;
    meta?: any;
  }>;
  supabaseAdmin?: any;
}

interface FixtureTemplate {
  id: string;
  fixtureCode: number;
  leagueId: FootballLeagueId;
  leagueName: string;
  country: string;
  homeTeam: string;
  homeShort: string;
  homeBadgeColor: string;
  homeForm: Array<'W' | 'D' | 'L'>;
  awayTeam: string;
  awayShort: string;
  awayBadgeColor: string;
  awayForm: Array<'W' | 'D' | 'L'>;
  homeStrength: number; // 0.35 to 0.65 base win probability
  drawBase: number;     // 0.22 to 0.30
  initialStatus: FootballMatchStatus;
  initialMinute: number;
  initialHomeScore: number;
  initialAwayScore: number;
  startsInSeconds: number;
  h2hSummary: {
    homeWins: number;
    draws: number;
    awayWins: number;
    lastMeeting: string;
  };
  homePlayers: string[];
  awayPlayers: string[];
}

interface InternalFootballMatch extends FootballMatchDTO {
  serverSeed: string;
  baseHomeProb: number;
  baseDrawProb: number;
  baseAwayProb: number;
  homePlayers: string[];
  awayPlayers: string[];
  finishedAtMs: number | null;
}

const FIXTURE_TEMPLATES: FixtureTemplate[] = [
  // --- PRE-MATCH ("BET EARLY" BEFORE KICKOFF) FIXTURES ---
  {
    id: 'm_fkf_gor_afc',
    fixtureCode: 1042,
    leagueId: 'FKF',
    leagueName: 'FKF Premier League',
    country: 'Kenya',
    homeTeam: 'Gor Mahia FC',
    homeShort: 'GOR',
    homeBadgeColor: '#16a34a',
    homeForm: ['W', 'W', 'D', 'W', 'W'],
    awayTeam: 'AFC Leopards',
    awayShort: 'AFC',
    awayBadgeColor: '#2563eb',
    awayForm: ['W', 'D', 'L', 'W', 'D'],
    homeStrength: 0.48,
    drawBase: 0.28,
    initialStatus: 'UPCOMING',
    initialMinute: 0,
    initialHomeScore: 0,
    initialAwayScore: 0,
    startsInSeconds: 180, // Starts in 3 mins (Bet Early!)
    h2hSummary: {
      homeWins: 18,
      draws: 11,
      awayWins: 9,
      lastMeeting: 'Gor Mahia 2 - 1 AFC Leopards',
    },
    homePlayers: ['Benson Omala', 'Austin Odhiambo', 'Rooney Onyango', 'Alpha Onyango'],
    awayPlayers: ['Victor Omune', 'Clifton Miheso', 'Kayci Odhiambo', 'Hassan Beja'],
  },
  {
    id: 'm_epl_ars_che',
    fixtureCode: 2108,
    leagueId: 'EPL',
    leagueName: 'Premier League',
    country: 'England',
    homeTeam: 'Arsenal',
    homeShort: 'ARS',
    homeBadgeColor: '#dc2626',
    homeForm: ['W', 'W', 'W', 'D', 'W'],
    awayTeam: 'Chelsea',
    awayShort: 'CHE',
    awayBadgeColor: '#1d4ed8',
    awayForm: ['W', 'D', 'W', 'L', 'W'],
    homeStrength: 0.51,
    drawBase: 0.25,
    initialStatus: 'UPCOMING',
    initialMinute: 0,
    initialHomeScore: 0,
    initialAwayScore: 0,
    startsInSeconds: 360, // Starts in 6 mins (Bet Early!)
    h2hSummary: {
      homeWins: 24,
      draws: 14,
      awayWins: 20,
      lastMeeting: 'Arsenal 3 - 1 Chelsea',
    },
    homePlayers: ['Bukayo Saka', 'Martin Odegaard', 'Kai Havertz', 'Declan Rice'],
    awayPlayers: ['Cole Palmer', 'Nicolas Jackson', 'Pedro Neto', 'Enzo Fernandez'],
  },
  {
    id: 'm_ucl_rma_bay',
    fixtureCode: 3094,
    leagueId: 'UCL',
    leagueName: 'UEFA Champions League',
    country: 'Europe',
    homeTeam: 'Real Madrid',
    homeShort: 'RMA',
    homeBadgeColor: '#ca8a04',
    homeForm: ['W', 'W', 'L', 'W', 'W'],
    awayTeam: 'Bayern Munich',
    awayShort: 'BAY',
    awayBadgeColor: '#b91c1c',
    awayForm: ['W', 'W', 'W', 'D', 'L'],
    homeStrength: 0.45,
    drawBase: 0.26,
    initialStatus: 'UPCOMING',
    initialMinute: 0,
    initialHomeScore: 0,
    initialAwayScore: 0,
    startsInSeconds: 600, // Starts in 10 mins (Bet Early!)
    h2hSummary: {
      homeWins: 12,
      draws: 4,
      awayWins: 11,
      lastMeeting: 'Real Madrid 2 - 1 Bayern Munich',
    },
    homePlayers: ['Kylian Mbappe', 'Vinicius Jr', 'Jude Bellingham', 'Rodrygo'],
    awayPlayers: ['Harry Kane', 'Jamal Musiala', 'Michael Olise', 'Joshua Kimmich'],
  },
  {
    id: 'm_fkf_tsk_pol',
    fixtureCode: 1088,
    leagueId: 'FKF',
    leagueName: 'FKF Premier League',
    country: 'Kenya',
    homeTeam: 'Tusker FC',
    homeShort: 'TSK',
    homeBadgeColor: '#eab308',
    homeForm: ['W', 'D', 'W', 'L', 'W'],
    awayTeam: 'Kenya Police FC',
    awayShort: 'POL',
    awayBadgeColor: '#0284c7',
    awayForm: ['D', 'W', 'W', 'D', 'W'],
    homeStrength: 0.39,
    drawBase: 0.30,
    initialStatus: 'UPCOMING',
    initialMinute: 0,
    initialHomeScore: 0,
    initialAwayScore: 0,
    startsInSeconds: 900, // Starts in 15 mins (Bet Early!)
    h2hSummary: {
      homeWins: 4,
      draws: 3,
      awayWins: 3,
      lastMeeting: 'Tusker FC 1 - 1 Kenya Police',
    },
    homePlayers: ['Deogratious Ojok', 'Shaphan Oyugi', 'Chris Erambo'],
    awayPlayers: ['Kenneth Muguna', 'Tito Okello', 'Abud Omar'],
  },
  {
    id: 'm_laliga_bar_atm',
    fixtureCode: 4412,
    leagueId: 'LALIGA',
    leagueName: 'La Liga',
    country: 'Spain',
    homeTeam: 'FC Barcelona',
    homeShort: 'BAR',
    homeBadgeColor: '#991b1b',
    homeForm: ['W', 'W', 'W', 'W', 'D'],
    awayTeam: 'Atletico Madrid',
    awayShort: 'ATM',
    awayBadgeColor: '#dc2626',
    awayForm: ['W', 'D', 'W', 'D', 'L'],
    homeStrength: 0.49,
    drawBase: 0.26,
    initialStatus: 'UPCOMING',
    initialMinute: 0,
    initialHomeScore: 0,
    initialAwayScore: 0,
    startsInSeconds: 1500, // Starts in 25 mins (Bet Early!)
    h2hSummary: {
      homeWins: 28,
      draws: 12,
      awayWins: 10,
      lastMeeting: 'FC Barcelona 1 - 0 Atletico Madrid',
    },
    homePlayers: ['Lamine Yamal', 'Robert Lewandowski', 'Raphinha', 'Pedri'],
    awayPlayers: ['Antoine Griezmann', 'Julian Alvarez', 'Alexander Sorloth'],
  },
  {
    id: 'm_seriea_juv_nap',
    fixtureCode: 5190,
    leagueId: 'SERIEA',
    leagueName: 'Serie A',
    country: 'Italy',
    homeTeam: 'Juventus',
    homeShort: 'JUV',
    homeBadgeColor: '#475569',
    homeForm: ['D', 'W', 'D', 'W', 'W'],
    awayTeam: 'SSC Napoli',
    awayShort: 'NAP',
    awayBadgeColor: '#0284c7',
    awayForm: ['W', 'W', 'D', 'L', 'W'],
    homeStrength: 0.41,
    drawBase: 0.29,
    initialStatus: 'UPCOMING',
    initialMinute: 0,
    initialHomeScore: 0,
    initialAwayScore: 0,
    startsInSeconds: 2400, // Starts in 40 mins (Bet Early!)
    h2hSummary: {
      homeWins: 21,
      draws: 10,
      awayWins: 16,
      lastMeeting: 'Juventus 0 - 0 SSC Napoli',
    },
    homePlayers: ['Dusan Vlahovic', 'Kenan Yildiz', 'Teun Koopmeiners'],
    awayPlayers: ['Romelu Lukaku', 'Khvicha Kvaratskhelia', 'Scott McTominay'],
  },

  // --- LIVE IN-PLAY FIXTURES (CURRENTLY PLAYING) ---
  {
    id: 'm_epl_mci_liv',
    fixtureCode: 2015,
    leagueId: 'EPL',
    leagueName: 'Premier League',
    country: 'England',
    homeTeam: 'Manchester City',
    homeShort: 'MCI',
    homeBadgeColor: '#0ea5e9',
    homeForm: ['W', 'D', 'W', 'W', 'W'],
    awayTeam: 'Liverpool',
    awayShort: 'LIV',
    awayBadgeColor: '#e11d48',
    awayForm: ['W', 'W', 'D', 'W', 'W'],
    homeStrength: 0.44,
    drawBase: 0.27,
    initialStatus: 'LIVE_1H',
    initialMinute: 28,
    initialHomeScore: 1,
    initialAwayScore: 1,
    startsInSeconds: 0,
    h2hSummary: {
      homeWins: 15,
      draws: 16,
      awayWins: 19,
      lastMeeting: 'Liverpool 1 - 1 Manchester City',
    },
    homePlayers: ['Erling Haaland', 'Phil Foden', 'Kevin De Bruyne', 'Jeremy Doku'],
    awayPlayers: ['Mohamed Salah', 'Luis Diaz', 'Dominik Szoboszlai', 'Darwin Nunez'],
  },
  {
    id: 'm_epl_mun_tot',
    fixtureCode: 2049,
    leagueId: 'EPL',
    leagueName: 'Premier League',
    country: 'England',
    homeTeam: 'Manchester United',
    homeShort: 'MUN',
    homeBadgeColor: '#dc2626',
    homeForm: ['W', 'L', 'D', 'W', 'D'],
    awayTeam: 'Tottenham Hotspur',
    awayShort: 'TOT',
    awayBadgeColor: '#3b82f6',
    awayForm: ['W', 'W', 'L', 'W', 'L'],
    homeStrength: 0.42,
    drawBase: 0.26,
    initialStatus: 'LIVE_2H',
    initialMinute: 62,
    initialHomeScore: 2,
    initialAwayScore: 1,
    startsInSeconds: 0,
    h2hSummary: {
      homeWins: 26,
      draws: 11,
      awayWins: 12,
      lastMeeting: 'Man United 2 - 2 Tottenham',
    },
    homePlayers: ['Bruno Fernandes', 'Alejandro Garnacho', 'Rasmus Hojlund', 'Amad Diallo'],
    awayPlayers: ['Heung-Min Son', 'Dominic Solanke', 'James Maddison', 'Brennan Johnson'],
  },
  {
    id: 'm_ucl_psg_int',
    fixtureCode: 3112,
    leagueId: 'UCL',
    leagueName: 'UEFA Champions League',
    country: 'Europe',
    homeTeam: 'Paris Saint-Germain',
    homeShort: 'PSG',
    homeBadgeColor: '#1e40af',
    homeForm: ['W', 'W', 'D', 'W', 'L'],
    awayTeam: 'Inter Milan',
    awayShort: 'INT',
    awayBadgeColor: '#0369a1',
    awayForm: ['W', 'D', 'W', 'W', 'W'],
    homeStrength: 0.43,
    drawBase: 0.28,
    initialStatus: 'LIVE_1H',
    initialMinute: 16,
    initialHomeScore: 0,
    initialAwayScore: 0,
    startsInSeconds: 0,
    h2hSummary: {
      homeWins: 3,
      draws: 2,
      awayWins: 2,
      lastMeeting: 'PSG 1 - 2 Inter Milan',
    },
    homePlayers: ['Ousmane Dembele', 'Bradley Barcola', 'Achraf Hakimi', 'Vitinha'],
    awayPlayers: ['Lautaro Martinez', 'Marcus Thuram', 'Nicolo Barella', 'Hakan Calhanoglu'],
  },
  {
    id: 'm_fkf_sha_kcb',
    fixtureCode: 1095,
    leagueId: 'FKF',
    leagueName: 'FKF Premier League',
    country: 'Kenya',
    homeTeam: 'Shabana FC',
    homeShort: 'SHA',
    homeBadgeColor: '#be123c',
    homeForm: ['W', 'D', 'L', 'W', 'D'],
    awayTeam: 'KCB FC',
    awayShort: 'KCB',
    awayBadgeColor: '#15803d',
    awayForm: ['W', 'W', 'D', 'D', 'L'],
    homeStrength: 0.37,
    drawBase: 0.31,
    initialStatus: 'HT',
    initialMinute: 45,
    initialHomeScore: 1,
    initialAwayScore: 0,
    startsInSeconds: 0,
    h2hSummary: {
      homeWins: 2,
      draws: 2,
      awayWins: 3,
      lastMeeting: 'Shabana FC 1 - 1 KCB FC',
    },
    homePlayers: ['Brian Michira', 'Mathew Tegisi', 'Darius Msagha'],
    awayPlayers: ['Francis Kahiro', 'Derrick Otanga', 'Farouk Shikhalo'],
  },
  {
    id: 'm_bund_bvb_lev',
    fixtureCode: 6031,
    leagueId: 'BUNDESLIGA',
    leagueName: 'Bundesliga',
    country: 'Germany',
    homeTeam: 'Borussia Dortmund',
    homeShort: 'BVB',
    homeBadgeColor: '#ca8a04',
    homeForm: ['W', 'L', 'W', 'W', 'D'],
    awayTeam: 'Bayer Leverkusen',
    awayShort: 'LEV',
    awayBadgeColor: '#b91c1c',
    awayForm: ['W', 'D', 'W', 'D', 'W'],
    homeStrength: 0.40,
    drawBase: 0.26,
    initialStatus: 'LIVE_2H',
    initialMinute: 74,
    initialHomeScore: 1,
    initialAwayScore: 2,
    startsInSeconds: 0,
    h2hSummary: {
      homeWins: 22,
      draws: 10,
      awayWins: 14,
      lastMeeting: 'Dortmund 1 - 1 Leverkusen',
    },
    homePlayers: ['Serhou Guirassy', 'Karim Adeyemi', 'Julian Brandt', 'Jamie Gittens'],
    awayPlayers: ['Florian Wirtz', 'Victor Boniface', 'Alejandro Grimaldo', 'Granit Xhaka'],
  },
  {
    id: 'm_seriea_mil_rom',
    fixtureCode: 5204,
    leagueId: 'SERIEA',
    leagueName: 'Serie A',
    country: 'Italy',
    homeTeam: 'AC Milan',
    homeShort: 'MIL',
    homeBadgeColor: '#b91c1c',
    homeForm: ['W', 'W', 'D', 'L', 'W'],
    awayTeam: 'AS Roma',
    awayShort: 'ROM',
    awayBadgeColor: '#9a3412',
    awayForm: ['D', 'W', 'L', 'W', 'D'],
    homeStrength: 0.47,
    drawBase: 0.27,
    initialStatus: 'LIVE_1H',
    initialMinute: 37,
    initialHomeScore: 1,
    initialAwayScore: 0,
    startsInSeconds: 0,
    h2hSummary: {
      homeWins: 29,
      draws: 19,
      awayWins: 14,
      lastMeeting: 'AC Milan 3 - 1 AS Roma',
    },
    homePlayers: ['Christian Pulisic', 'Rafael Leao', 'Alvaro Morata', 'Tijjani Reijnders'],
    awayPlayers: ['Paulo Dybala', 'Artem Dovbyk', 'Lorenzo Pellegrini'],
  },
];

function maskDisplayName(nameOrPhone: string): string {
  const clean = (nameOrPhone || 'Player').trim();
  if (clean.length <= 4) return `${clean[0] || '254'}***`;
  return `${clean.slice(0, 3)}***${clean.slice(-2)}`;
}

function sha256HexNode(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function clampOdd(raw: number, min = 1.04, max = 45.0): number {
  return Math.max(min, Math.min(max, Math.round(raw * 100) / 100));
}

/**
 * Generates all 9 Betika football markets dynamically from match state (score, minute, status, team strength).
 */
function buildMatchMarkets(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  status: FootballMatchStatus,
  minute: number,
  homeScore: number,
  awayScore: number,
  baseHomeProb: number,
  baseDrawProb: number,
  baseAwayProb: number,
  previousMarkets?: FootballMarketDTO[]
): FootballMarketDTO[] {
  const prevOddsMap = new Map<string, number>();
  if (previousMarkets) {
    for (const m of previousMarkets) {
      for (const s of m.selections) {
        prevOddsMap.set(s.selectionId, s.odds);
      }
    }
  }

  const isSuspended = status === 'FT';
  const timeRemainingRatio = status === 'UPCOMING' ? 1.0 : Math.max(0.06, (90 - minute) / 90);
  const goalDiff = homeScore - awayScore;
  const totalGoals = homeScore + awayScore;

  // Adjust 1X2 probabilities based on current live score & time left
  let pHome = baseHomeProb;
  let pDraw = baseDrawProb;
  let pAway = baseAwayProb;

  if (status !== 'UPCOMING') {
    if (goalDiff === 0) {
      pDraw = Math.min(0.84, baseDrawProb + (1 - timeRemainingRatio) * 0.48);
      const rem = 1 - pDraw;
      const ratioH = baseHomeProb / (baseHomeProb + baseAwayProb);
      pHome = rem * ratioH;
      pAway = rem * (1 - ratioH);
    } else if (goalDiff > 0) {
      const leadBoost = Math.min(0.92, 0.52 + goalDiff * 0.22 + (1 - timeRemainingRatio) * 0.28);
      pHome = leadBoost;
      pDraw = Math.max(0.04, (1 - pHome) * 0.62);
      pAway = Math.max(0.02, 1 - pHome - pDraw);
    } else {
      const leadBoost = Math.min(0.92, 0.52 + Math.abs(goalDiff) * 0.22 + (1 - timeRemainingRatio) * 0.28);
      pAway = leadBoost;
      pDraw = Math.max(0.04, (1 - pAway) * 0.62);
      pHome = Math.max(0.02, 1 - pAway - pDraw);
    }
  }

  const overround = 1.06; // Standard 6% sportsbook margin
  const odd1 = clampOdd(1 / (pHome * overround), 1.05, 28.0);
  const oddX = clampOdd(1 / (pDraw * overround), 1.18, 19.0);
  const odd2 = clampOdd(1 / (pAway * overround), 1.05, 28.0);

  // Double Chance
  const odd1X = clampOdd(1 / Math.min(0.95, (pHome + pDraw) * 1.04), 1.03, 6.5);
  const odd12 = clampOdd(1 / Math.min(0.95, (pHome + pAway) * 1.04), 1.06, 4.5);
  const oddX2 = clampOdd(1 / Math.min(0.95, (pDraw + pAway) * 1.04), 1.03, 6.5);

  // Expected remaining goals
  const expectedRemainingGoals = 2.65 * timeRemainingRatio;
  const expectedTotalGoals = totalGoals + expectedRemainingGoals;

  const makeOverUnder = (
    marketKey: FootballMarketKey,
    line: number,
    shortLabel: string
  ): FootballMarketDTO => {
    const alreadyOver = totalGoals > line;
    const diffFromLine = expectedTotalGoals - line;
    const probOver = alreadyOver
      ? 0.98
      : Math.max(0.06, Math.min(0.92, 0.5 + diffFromLine * 0.26));
    const probUnder = 1 - probOver;

    const overOdd = alreadyOver ? 1.01 : clampOdd(1 / (probOver * 1.06), 1.06, 15.0);
    const underOdd = alreadyOver ? 25.0 : clampOdd(1 / (probUnder * 1.06), 1.06, 15.0);

    const overId = `${matchId}:${marketKey}:OVER_${line}`;
    const underId = `${matchId}:${marketKey}:UNDER_${line}`;

    return {
      marketKey,
      marketName: `Total Goals Over/Under ${line}`,
      shortName: shortLabel,
      suspended: isSuspended || alreadyOver,
      selections: [
        {
          selectionId: overId,
          marketKey,
          marketName: `Total Goals Over/Under ${line}`,
          outcomeKey: `OVER_${line}`,
          outcomeLabel: `Over ${line}`,
          odds: overOdd,
          previousOdds: prevOddsMap.get(overId),
          trend: getTrend(prevOddsMap.get(overId), overOdd),
          suspended: isSuspended || alreadyOver,
        },
        {
          selectionId: underId,
          marketKey,
          marketName: `Total Goals Over/Under ${line}`,
          shortName: shortLabel,
          outcomeKey: `UNDER_${line}`,
          outcomeLabel: `Under ${line}`,
          odds: underOdd,
          previousOdds: prevOddsMap.get(underId),
          trend: getTrend(prevOddsMap.get(underId), underOdd),
          suspended: isSuspended || alreadyOver,
        } as any,
      ],
    };
  };

  // Both Teams To Score (GG / NG)
  const bothScoredAlready = homeScore > 0 && awayScore > 0;
  const oneScored = (homeScore > 0) !== (awayScore > 0);
  const probGG = bothScoredAlready
    ? 0.98
    : oneScored
    ? Math.max(0.15, Math.min(0.85, 0.68 * Math.sqrt(timeRemainingRatio)))
    : Math.max(0.10, Math.min(0.75, 0.54 * timeRemainingRatio));
  const oddGG = bothScoredAlready ? 1.01 : clampOdd(1 / (probGG * 1.06), 1.12, 9.5);
  const oddNG = bothScoredAlready ? 18.0 : clampOdd(1 / ((1 - probGG) * 1.06), 1.10, 9.5);

  // Draw No Bet
  const dnbHomeProb = pHome / (pHome + pAway);
  const oddDnb1 = clampOdd(1 / (dnbHomeProb * 1.05), 1.04, 14.0);
  const oddDnb2 = clampOdd(1 / ((1 - dnbHomeProb) * 1.05), 1.04, 14.0);

  // 1st Half 1X2
  const firstHalfLocked = status === 'HT' || status === 'LIVE_2H' || status === 'FT';
  const fh1 = clampOdd(odd1 * 1.32, 1.25, 16.0);
  const fhX = clampOdd(oddX * 0.68, 1.35, 8.5);
  const fh2 = clampOdd(odd2 * 1.35, 1.25, 16.0);

  // Correct Score options
  const csOptions: Array<{ key: string; h: number; a: number; baseOdd: number }> = [
    { key: '1:0', h: 1, a: 0, baseOdd: 6.4 },
    { key: '2:0', h: 2, a: 0, baseOdd: 8.8 },
    { key: '2:1', h: 2, a: 1, baseOdd: 8.2 },
    { key: '0:0', h: 0, a: 0, baseOdd: 9.5 },
    { key: '1:1', h: 1, a: 1, baseOdd: 6.0 },
    { key: '2:2', h: 2, a: 2, baseOdd: 13.5 },
    { key: '0:1', h: 0, a: 1, baseOdd: 7.8 },
    { key: '0:2', h: 0, a: 2, baseOdd: 11.5 },
    { key: '1:2', h: 1, a: 2, baseOdd: 9.4 },
  ];

  const buildSelection = (
    marketKey: FootballMarketKey,
    marketName: string,
    outcomeKey: string,
    outcomeLabel: string,
    odds: number,
    suspended = isSuspended
  ) => {
    const selectionId = `${matchId}:${marketKey}:${outcomeKey}`;
    const prev = prevOddsMap.get(selectionId);
    return {
      selectionId,
      marketKey,
      marketName,
      outcomeKey,
      outcomeLabel,
      odds,
      previousOdds: prev,
      trend: getTrend(prev, odds),
      suspended,
    };
  };

  return [
    {
      marketKey: '1X2',
      marketName: '1X2 (Full Time Result)',
      shortName: '1X2',
      suspended: isSuspended,
      selections: [
        buildSelection('1X2', '1X2 (Full Time Result)', '1', `1 (${homeTeam})`, odd1),
        buildSelection('1X2', '1X2 (Full Time Result)', 'X', 'X (Draw)', oddX),
        buildSelection('1X2', '1X2 (Full Time Result)', '2', `2 (${awayTeam})`, odd2),
      ],
    },
    {
      marketKey: 'DOUBLE_CHANCE',
      marketName: 'Double Chance',
      shortName: 'DC',
      suspended: isSuspended,
      selections: [
        buildSelection('DOUBLE_CHANCE', 'Double Chance', '1X', `1X (${homeTeam} or Draw)`, odd1X),
        buildSelection('DOUBLE_CHANCE', 'Double Chance', '12', `12 (${homeTeam} or ${awayTeam})`, odd12),
        buildSelection('DOUBLE_CHANCE', 'Double Chance', 'X2', `X2 (Draw or ${awayTeam})`, oddX2),
      ],
    },
    makeOverUnder('OVER_UNDER_25', 2.5, 'O/U 2.5'),
    {
      marketKey: 'BTTS',
      marketName: 'Both Teams To Score (GG/NG)',
      shortName: 'GG/NG',
      suspended: isSuspended || bothScoredAlready,
      selections: [
        buildSelection('BTTS', 'Both Teams To Score (GG/NG)', 'GG', 'Yes (GG)', oddGG, isSuspended || bothScoredAlready),
        buildSelection('BTTS', 'Both Teams To Score (GG/NG)', 'NG', 'No (NG)', oddNG, isSuspended || bothScoredAlready),
      ],
    },
    makeOverUnder('OVER_UNDER_15', 1.5, 'O/U 1.5'),
    makeOverUnder('OVER_UNDER_35', 3.5, 'O/U 3.5'),
    {
      marketKey: 'DRAW_NO_BET',
      marketName: 'Draw No Bet',
      shortName: 'DNB',
      suspended: isSuspended,
      selections: [
        buildSelection('DRAW_NO_BET', 'Draw No Bet', 'DNB_1', homeTeam, oddDnb1),
        buildSelection('DRAW_NO_BET', 'Draw No Bet', 'DNB_2', awayTeam, oddDnb2),
      ],
    },
    {
      marketKey: 'FIRST_HALF_1X2',
      marketName: '1st Half 1X2',
      shortName: '1H 1X2',
      suspended: isSuspended || firstHalfLocked,
      selections: [
        buildSelection('FIRST_HALF_1X2', '1st Half 1X2', '1H_1', `1 (${homeTeam})`, fh1, isSuspended || firstHalfLocked),
        buildSelection('FIRST_HALF_1X2', '1st Half 1X2', '1H_X', 'X (Draw)', fhX, isSuspended || firstHalfLocked),
        buildSelection('FIRST_HALF_1X2', '1st Half 1X2', '1H_2', `2 (${awayTeam})`, fh2, isSuspended || firstHalfLocked),
      ],
    },
    {
      marketKey: 'CORRECT_SCORE',
      marketName: 'Correct Score (90 Mins)',
      shortName: 'CS',
      suspended: isSuspended,
      selections: csOptions.map((cs) => {
        const impossible = homeScore > cs.h || awayScore > cs.a;
        const exactCurrent = homeScore === cs.h && awayScore === cs.a;
        const adjustedOdd = impossible
          ? 50.0
          : exactCurrent && status !== 'UPCOMING'
          ? clampOdd(cs.baseOdd * Math.max(0.28, timeRemainingRatio), 1.45, 25.0)
          : cs.baseOdd;
        return buildSelection(
          'CORRECT_SCORE',
          'Correct Score (90 Mins)',
          cs.key,
          cs.key,
          adjustedOdd,
          isSuspended || impossible
        );
      }),
    },
  ];
}

function getTrend(prev: number | undefined, next: number): 'up' | 'down' | 'same' {
  if (prev === undefined || Math.abs(next - prev) < 0.01) return 'same';
  return next > prev ? 'up' : 'down';
}

/**
 * Evaluates whether a specific selection leg has already won, lost, or is still pending.
 */
function evaluateLegOutcome(
  match: InternalFootballMatch,
  marketKey: FootballMarketKey,
  outcomeKey: string
): LiveMatchLegStatus {
  const h = match.homeScore;
  const a = match.awayScore;
  const total = h + a;
  const isFT = match.status === 'FT';
  const isHTorLater = match.status === 'HT' || match.status === 'LIVE_2H' || match.status === 'FT';

  // Early mathematical win checks even while match is still LIVE
  if (marketKey === 'OVER_UNDER_15' && outcomeKey === 'OVER_1.5' && total >= 2) return 'WON';
  if (marketKey === 'OVER_UNDER_25' && outcomeKey === 'OVER_2.5' && total >= 3) return 'WON';
  if (marketKey === 'OVER_UNDER_35' && outcomeKey === 'OVER_3.5' && total >= 4) return 'WON';
  if (marketKey === 'BTTS' && outcomeKey === 'GG' && h > 0 && a > 0) return 'WON';

  // Early mathematical loss checks
  if (marketKey === 'OVER_UNDER_15' && outcomeKey === 'UNDER_1.5' && total >= 2) return 'LOST';
  if (marketKey === 'OVER_UNDER_25' && outcomeKey === 'UNDER_2.5' && total >= 3) return 'LOST';
  if (marketKey === 'OVER_UNDER_35' && outcomeKey === 'UNDER_3.5' && total >= 4) return 'LOST';
  if (marketKey === 'BTTS' && outcomeKey === 'NG' && h > 0 && a > 0) return 'LOST';

  // 1st Half 1X2 settles at HT or later
  if (marketKey === 'FIRST_HALF_1X2' && isHTorLater) {
    const h1 = match.htHomeScore;
    const a1 = match.htAwayScore;
    if (outcomeKey === '1H_1') return h1 > a1 ? 'WON' : 'LOST';
    if (outcomeKey === '1H_X') return h1 === a1 ? 'WON' : 'LOST';
    if (outcomeKey === '1H_2') return a1 > h1 ? 'WON' : 'LOST';
  }

  if (!isFT) {
    return 'PENDING';
  }

  // Full Time (90 mins) settlement
  switch (marketKey) {
    case '1X2':
      if (outcomeKey === '1') return h > a ? 'WON' : 'LOST';
      if (outcomeKey === 'X') return h === a ? 'WON' : 'LOST';
      if (outcomeKey === '2') return a > h ? 'WON' : 'LOST';
      break;
    case 'DOUBLE_CHANCE':
      if (outcomeKey === '1X') return h >= a ? 'WON' : 'LOST';
      if (outcomeKey === '12') return h !== a ? 'WON' : 'LOST';
      if (outcomeKey === 'X2') return a >= h ? 'WON' : 'LOST';
      break;
    case 'OVER_UNDER_15':
      return outcomeKey === 'OVER_1.5' ? (total > 1.5 ? 'WON' : 'LOST') : total < 1.5 ? 'WON' : 'LOST';
    case 'OVER_UNDER_25':
      return outcomeKey === 'OVER_2.5' ? (total > 2.5 ? 'WON' : 'LOST') : total < 2.5 ? 'WON' : 'LOST';
    case 'OVER_UNDER_35':
      return outcomeKey === 'OVER_3.5' ? (total > 3.5 ? 'WON' : 'LOST') : total < 3.5 ? 'WON' : 'LOST';
    case 'BTTS':
      return outcomeKey === 'GG' ? (h > 0 && a > 0 ? 'WON' : 'LOST') : h === 0 || a === 0 ? 'WON' : 'LOST';
    case 'DRAW_NO_BET':
      if (h === a) return 'VOID';
      if (outcomeKey === 'DNB_1') return h > a ? 'WON' : 'LOST';
      if (outcomeKey === 'DNB_2') return a > h ? 'WON' : 'LOST';
      break;
    case 'CORRECT_SCORE':
      return outcomeKey === `${h}:${a}` ? 'WON' : 'LOST';
  }

  return 'LOST';
}

export class LiveMatchesEngine {
  private ctx: SharedServerContext;
  private matches = new Map<string, InternalFootballMatch>();
  private tickets = new Map<string, LiveMatchTicketDTO>();
  private userTickets = new Map<string, string[]>(); // userId -> ticketIds[]
  private publicBetsFeed: LiveMatchPublicFeedBetDTO[] = [];
  private auditLogs: LiveMatchAuditLogDTO[] = [];
  private idempotencyStore = new Map<string, { timestamp: number; response: any }>();
  private userMutexes = new Set<string>();
  private userRateBuckets = new Map<string, number[]>();
  private selfExcludedUntil = new Map<string, number>();

  private wsClients = new Set<{ ws: WebSocket; matchId?: string; userId?: string }>();
  private sseClients = new Set<Response>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private liveSyncTimer: ReturnType<typeof setInterval> | null = null;
  private dailyScheduleTimer: ReturnType<typeof setInterval> | null = null;
  private tickCounter = 0;
  private hasSyncedRealWorld = false;
  private syncInProgress = false;
  private lastSyncedAt: string = new Date().toISOString();

  constructor(ctx: SharedServerContext) {
    this.ctx = ctx;
    this.seedInitialMatches();
    this.seedInitialPublicBets();
  }

  private seedInitialMatches() {
    const now = Date.now();
    FIXTURE_TEMPLATES.forEach((tpl, idx) => {
      const serverSeed = crypto.randomBytes(32).toString('hex');
      const serverSeedHash = sha256HexNode(serverSeed);
      const clientSeed = `BETIKA-KE-FOOTBALL-${tpl.fixtureCode}`;
      const nonce = 100 + idx;

      const baseHomeProb = tpl.homeStrength;
      const baseDrawProb = tpl.drawBase;
      const baseAwayProb = Math.max(0.15, 1 - baseHomeProb - baseDrawProb);

      const events: FootballMatchEventDTO[] = [];
      if (tpl.initialStatus !== 'UPCOMING') {
        events.push({
          id: `ev_${tpl.id}_ko`,
          minute: 1,
          type: 'KICKOFF',
          team: 'NEUTRAL',
          description: `1' First Half kicks off: ${tpl.homeTeam} vs ${tpl.awayTeam}`,
          scoreSnapshot: '0 - 0',
          timestamp: new Date(now - tpl.initialMinute * 45000).toISOString(),
        });

        if (tpl.initialHomeScore > 0) {
          events.push({
            id: `ev_${tpl.id}_g1`,
            minute: Math.min(tpl.initialMinute - 3, 19),
            type: 'GOAL',
            team: 'HOME',
            player: tpl.homePlayers[0],
            description: `GOAL! ${tpl.homePlayers[0]} fires ${tpl.homeTeam} ahead!`,
            scoreSnapshot: '1 - 0',
            timestamp: new Date(now - 300000).toISOString(),
          });
        }
        if (tpl.initialAwayScore > 0) {
          events.push({
            id: `ev_${tpl.id}_g2`,
            minute: Math.min(tpl.initialMinute - 1, 26),
            type: 'GOAL',
            team: 'AWAY',
            player: tpl.awayPlayers[0],
            description: `GOAL! ${tpl.awayPlayers[0]} equalizes for ${tpl.awayTeam}!`,
            scoreSnapshot: `${Math.min(1, tpl.initialHomeScore)} - 1`,
            timestamp: new Date(now - 180000).toISOString(),
          });
        }
        if (tpl.initialHomeScore > 1) {
          events.push({
            id: `ev_${tpl.id}_g3`,
            minute: Math.min(tpl.initialMinute, 54),
            type: 'GOAL',
            team: 'HOME',
            player: tpl.homePlayers[1],
            description: `GOAL! ${tpl.homePlayers[1]} scores a clinical finish for ${tpl.homeTeam}!`,
            scoreSnapshot: `${tpl.initialHomeScore} - ${tpl.initialAwayScore}`,
            timestamp: new Date(now - 90000).toISOString(),
          });
        }
        if (tpl.initialAwayScore > 1) {
          events.push({
            id: `ev_${tpl.id}_g4`,
            minute: Math.min(tpl.initialMinute, 68),
            type: 'GOAL',
            team: 'AWAY',
            player: tpl.awayPlayers[1],
            description: `GOAL! ${tpl.awayPlayers[1]} puts ${tpl.awayTeam} in front!`,
            scoreSnapshot: `${tpl.initialHomeScore} - ${tpl.initialAwayScore}`,
            timestamp: new Date(now - 60000).toISOString(),
          });
        }
      }

      const markets = buildMatchMarkets(
        tpl.id,
        tpl.homeTeam,
        tpl.awayTeam,
        tpl.initialStatus,
        tpl.initialMinute,
        tpl.initialHomeScore,
        tpl.initialAwayScore,
        baseHomeProb,
        baseDrawProb,
        baseAwayProb
      );

      const match: InternalFootballMatch = {
        id: tpl.id,
        fixtureCode: tpl.fixtureCode,
        leagueId: tpl.leagueId,
        leagueName: tpl.leagueName,
        country: tpl.country,
        venue: `${tpl.country} National Stadium`,
        homeTeam: tpl.homeTeam,
        homeShort: tpl.homeShort,
        homeBadgeColor: tpl.homeBadgeColor,
        homeForm: tpl.homeForm,
        awayTeam: tpl.awayTeam,
        awayShort: tpl.awayShort,
        awayBadgeColor: tpl.awayBadgeColor,
        awayForm: tpl.awayForm,
        status: tpl.initialStatus,
        isPreMatchBetEarly: tpl.initialStatus === 'UPCOMING',
        kickoffAt: tpl.initialStatus === 'UPCOMING' ? now + tpl.startsInSeconds * 1000 : now - tpl.initialMinute * 60000,
        kickoffIso: new Date(
          tpl.initialStatus === 'UPCOMING' ? now + tpl.startsInSeconds * 1000 : now - tpl.initialMinute * 60000
        ).toISOString(),
        startsInSeconds: tpl.startsInSeconds,
        minute: tpl.initialMinute,
        homeScore: tpl.initialHomeScore,
        awayScore: tpl.initialAwayScore,
        htHomeScore: tpl.initialStatus === 'LIVE_2H' || tpl.initialStatus === 'HT' ? Math.min(1, tpl.initialHomeScore) : 0,
        htAwayScore: tpl.initialStatus === 'LIVE_2H' || tpl.initialStatus === 'HT' ? Math.min(1, tpl.initialAwayScore) : 0,
        marketsCount: 28,
        markets,
        events: events.reverse(),
        stats: {
          possessionHome: 52,
          possessionAway: 48,
          shotsHome: tpl.initialStatus === 'UPCOMING' ? 0 : 4 + tpl.initialHomeScore * 3,
          shotsAway: tpl.initialStatus === 'UPCOMING' ? 0 : 3 + tpl.initialAwayScore * 3,
          shotsOnTargetHome: tpl.initialStatus === 'UPCOMING' ? 0 : 2 + tpl.initialHomeScore,
          shotsOnTargetAway: tpl.initialStatus === 'UPCOMING' ? 0 : 1 + tpl.initialAwayScore,
          cornersHome: tpl.initialStatus === 'UPCOMING' ? 0 : 3 + (idx % 4),
          cornersAway: tpl.initialStatus === 'UPCOMING' ? 0 : 2 + (idx % 3),
          yellowCardsHome: tpl.initialStatus === 'UPCOMING' ? 0 : idx % 2,
          yellowCardsAway: tpl.initialStatus === 'UPCOMING' ? 0 : (idx + 1) % 2,
          redCardsHome: 0,
          redCardsAway: 0,
          dangerousAttacksHome: tpl.initialStatus === 'UPCOMING' ? 0 : 18 + tpl.initialMinute,
          dangerousAttacksAway: tpl.initialStatus === 'UPCOMING' ? 0 : 15 + tpl.initialMinute,
          ballX: 50,
          ballY: 50,
          momentumTeam: 'HOME',
          lastActionText:
            tpl.initialStatus === 'UPCOMING'
              ? 'Pre-Match Markets Open — Bet Early before Kickoff'
              : `${tpl.homeShort} building attack in midfield`,
        },
        h2hSummary: tpl.h2hSummary,
        serverSeedHash,
        serverSeed,
        clientSeed,
        nonce,
        totalBetsCount: 24 + idx * 11,
        totalPoolCents: (24 + idx * 11) * 8500,
        updatedAt: now,
        baseHomeProb,
        baseDrawProb,
        baseAwayProb,
        homePlayers: tpl.homePlayers,
        awayPlayers: tpl.awayPlayers,
        finishedAtMs: null,
      };

      this.matches.set(match.id, match);
    });
  }

  private seedInitialPublicBets() {
    const sampleHandles = ['072***89', '071***34', '079***12', '011***65', '070***41', '074***98'];
    const allMatches = Array.from(this.matches.values());
    if (allMatches.length === 0) return;

    this.publicBetsFeed = [];
    sampleHandles.forEach((handle, idx) => {
      const m = allMatches[idx % allMatches.length];
      const market = m.markets[0];
      const sel = market.selections[idx % market.selections.length];
      const stakeCents = [2000, 5000, 10000, 25000, 50000, 1000][idx % 6];
      const isEarly = m.status === 'UPCOMING';

      this.publicBetsFeed.push({
        id: `pub_seed_${idx}`,
        ticketCode: `BTK-${491020 + idx}`,
        usernameMasked: handle,
        type: idx % 3 === 0 ? 'MULTI' : 'SINGLE',
        legsCount: idx % 3 === 0 ? 3 : 1,
        primaryMatchId: m.id,
        primaryMatchLabel: `${m.homeShort} vs ${m.awayShort}`,
        primaryPickLabel: `${market.shortName}: ${sel.outcomeLabel}`,
        isEarlyBet: isEarly,
        totalOdds: idx % 3 === 0 ? Math.round(sel.odds * 3.4 * 100) / 100 : sel.odds,
        stakeCents,
        potentialPayoutCents: computeTicketPotentialPayoutCents(
          stakeCents,
          idx % 3 === 0 ? Math.round(sel.odds * 3.4 * 100) / 100 : sel.odds,
          idx % 3 === 0 ? 3 : 1
        ),
        status: 'OPEN',
        cashedOutAmountCents: null,
        placedAt: new Date(Date.now() - (idx + 1) * 42000).toISOString(),
      });
    });
  }

  /**
   * Synchronizes real-world live and daily football matches from global sports feeds (ESPN Soccer API).
   * - Updates live scores, match clocks, statuses, play-by-play events, and team statistics.
   * - Automatically grades and settles user tickets when real matches finish (FT).
   * - Updates daily fixtures so every day's real world matches are available for Pre-Match ("Bet Early") and Live betting.
   */
  public async syncRealWorldMatches(quickLiveOnly = false): Promise<number> {
    if (this.syncInProgress) return this.matches.size;
    this.syncInProgress = true;
    try {
      const realMatches = await fetchRealWorldFootballMatches(quickLiveOnly);
      if (!realMatches || realMatches.length === 0) {
        return this.matches.size;
      }

      const now = Date.now();
      const firstRealSync = !this.hasSyncedRealWorld;

      // Identify matches referenced by any user ticket so we never orphan an active/historical bet leg
      const referencedMatchIds = new Set<string>();
      for (const t of this.tickets.values()) {
        for (const l of t.legs) {
          referencedMatchIds.add(l.matchId);
        }
      }

      // On first real-world sync (or full daily sync), remove any unreferenced fallback `m_*` templates
      if (!quickLiveOnly || firstRealSync) {
        const incomingIds = new Set(realMatches.map((rm) => rm.id));
        for (const existingId of Array.from(this.matches.keys())) {
          if (existingId.startsWith('m_') && !referencedMatchIds.has(existingId)) {
            this.matches.delete(existingId);
          } else if (
            !quickLiveOnly &&
            !incomingIds.has(existingId) &&
            !referencedMatchIds.has(existingId)
          ) {
            const oldMatch = this.matches.get(existingId);
            if (oldMatch && (oldMatch.status === 'FT' || now - oldMatch.kickoffAt > 12 * 3600_000)) {
              this.matches.delete(existingId);
            }
          }
        }
      }

      for (let i = 0; i < realMatches.length; i++) {
        const rm: NormalizedRealMatchData = realMatches[i];
        const existing = this.matches.get(rm.id);

        if (existing) {
          const prevStatus = existing.status;
          const prevScore = `${existing.homeScore}-${existing.awayScore}`;

          existing.leagueId = rm.leagueId;
          existing.leagueName = rm.leagueName;
          existing.country = rm.country;
          existing.venue = rm.venue;
          existing.homeTeam = rm.homeTeam;
          existing.homeShort = rm.homeShort;
          existing.homeBadgeColor = rm.homeBadgeColor;
          existing.homeLogo = rm.homeLogo;
          existing.homeForm = rm.homeForm;
          existing.awayTeam = rm.awayTeam;
          existing.awayShort = rm.awayShort;
          existing.awayBadgeColor = rm.awayBadgeColor;
          existing.awayLogo = rm.awayLogo;
          existing.awayForm = rm.awayForm;
          existing.status = rm.status;
          existing.statusDetail = rm.statusDetail;
          existing.isPreMatchBetEarly = rm.status === 'UPCOMING';
          existing.kickoffAt = rm.kickoffAt;
          existing.kickoffIso = rm.kickoffIso;
          existing.startsInSeconds = rm.startsInSeconds;
          existing.minute = rm.minute;
          existing.homeScore = rm.homeScore;
          existing.awayScore = rm.awayScore;
          existing.htHomeScore = rm.htHomeScore;
          existing.htAwayScore = rm.htAwayScore;
          existing.baseHomeProb = rm.baseHomeProb;
          existing.baseDrawProb = rm.baseDrawProb;
          existing.baseAwayProb = rm.baseAwayProb;
          existing.events = rm.events;
          existing.stats = rm.stats;
          existing.h2hSummary = rm.h2hSummary;
          existing.updatedAt = now;
          if (rm.status === 'FT' && !existing.finishedAtMs) {
            existing.finishedAtMs = now;
          }

          existing.markets = buildMatchMarkets(
            existing.id,
            existing.homeTeam,
            existing.awayTeam,
            existing.status,
            existing.minute,
            existing.homeScore,
            existing.awayScore,
            existing.baseHomeProb,
            existing.baseDrawProb,
            existing.baseAwayProb,
            existing.markets
          );

          if (
            prevStatus !== existing.status ||
            prevScore !== `${existing.homeScore}-${existing.awayScore}` ||
            existing.status !== 'UPCOMING'
          ) {
            this.refreshTicketsForMatch(existing.id);
          }
        } else {
          // Skip matches that ended more than 48 hours ago
          if (rm.status === 'FT' && now - rm.kickoffAt > 48 * 3600_000) {
            continue;
          }

          // Deterministic audit seed per official fixture ID
          const serverSeed = crypto
            .createHmac('sha256', 'BETIKA-OFFICIAL-FEED-AUDIT-KEY')
            .update(rm.id)
            .digest('hex');
          const serverSeedHash = sha256HexNode(serverSeed);
          const clientSeed = `OFFICIAL-FIXTURE-${rm.fixtureCode}`;
          const nonce = rm.fixtureCode;

          const markets = buildMatchMarkets(
            rm.id,
            rm.homeTeam,
            rm.awayTeam,
            rm.status,
            rm.minute,
            rm.homeScore,
            rm.awayScore,
            rm.baseHomeProb,
            rm.baseDrawProb,
            rm.baseAwayProb
          );

          const created: InternalFootballMatch = {
            id: rm.id,
            fixtureCode: rm.fixtureCode,
            leagueId: rm.leagueId,
            leagueName: rm.leagueName,
            country: rm.country,
            venue: rm.venue,
            homeTeam: rm.homeTeam,
            homeShort: rm.homeShort,
            homeBadgeColor: rm.homeBadgeColor,
            homeLogo: rm.homeLogo,
            homeForm: rm.homeForm,
            awayTeam: rm.awayTeam,
            awayShort: rm.awayShort,
            awayBadgeColor: rm.awayBadgeColor,
            awayLogo: rm.awayLogo,
            awayForm: rm.awayForm,
            status: rm.status,
            statusDetail: rm.statusDetail,
            isPreMatchBetEarly: rm.status === 'UPCOMING',
            kickoffAt: rm.kickoffAt,
            kickoffIso: rm.kickoffIso,
            startsInSeconds: rm.startsInSeconds,
            minute: rm.minute,
            homeScore: rm.homeScore,
            awayScore: rm.awayScore,
            htHomeScore: rm.htHomeScore,
            htAwayScore: rm.htAwayScore,
            marketsCount: 28,
            markets,
            events: rm.events,
            stats: rm.stats,
            h2hSummary: rm.h2hSummary,
            serverSeedHash,
            serverSeed,
            clientSeed,
            nonce,
            totalBetsCount: 18 + (rm.fixtureCode % 65),
            totalPoolCents: (18 + (rm.fixtureCode % 65)) * 9500,
            updatedAt: now,
            baseHomeProb: rm.baseHomeProb,
            baseDrawProb: rm.baseDrawProb,
            baseAwayProb: rm.baseAwayProb,
            homePlayers: rm.homePlayers,
            awayPlayers: rm.awayPlayers,
            finishedAtMs: null,
          };

          this.matches.set(created.id, created);
        }
      }

      // Settle any tickets for finished (FT) matches and prune only matches older than 48 hours
      for (const [mid, m] of Array.from(this.matches.entries())) {
        if (m.status === 'FT') {
          this.refreshTicketsForMatch(mid);
          if (now - m.kickoffAt > 48 * 3600_000) {
            this.matches.delete(mid);
          }
        }
      }

      this.hasSyncedRealWorld = true;
      this.lastSyncedAt = new Date(now).toISOString();

      if (firstRealSync) {
        // Refresh initial public feed slips so they reference real-world matches
        const userCreatedSlips = this.publicBetsFeed.filter((b) => !b.id.startsWith('pub_seed_'));
        this.seedInitialPublicBets();
        this.publicBetsFeed = [...userCreatedSlips, ...this.publicBetsFeed].slice(0, 60);
      }

      this.broadcast({
        event: 'matches:snapshot',
        serverTimestamp: now,
        data: this.getStateSnapshot(),
      });

      return this.matches.size;
    } catch {
      return this.matches.size;
    } finally {
      this.syncInProgress = false;
    }
  }

  public start() {
    if (this.tickTimer) return;
    // Immediately sync real-world live & daily matches on startup
    void this.syncRealWorldMatches(false);

    // Tick every 2 seconds to update real-time pre-match kickoff countdowns & broadcast state
    this.tickTimer = setInterval(() => this.tick(), 2000);

    // Poll real-world live scoreboard every 20 seconds for live scores, minutes, cards & stats
    this.liveSyncTimer = setInterval(() => {
      void this.syncRealWorldMatches(true);
    }, 20_000);

    // Refresh full multi-league daily schedule every 5 minutes
    this.dailyScheduleTimer = setInterval(() => {
      void this.syncRealWorldMatches(false);
    }, 300_000);
  }

  public stop() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.liveSyncTimer) {
      clearInterval(this.liveSyncTimer);
      this.liveSyncTimer = null;
    }
    if (this.dailyScheduleTimer) {
      clearInterval(this.dailyScheduleTimer);
      this.dailyScheduleTimer = null;
    }
  }

  private tick() {
    this.tickCounter++;
    const now = Date.now();

    for (const match of this.matches.values()) {
      if (match.status === 'UPCOMING') {
        const remainingSec = Math.max(0, Math.floor((match.kickoffAt - now) / 1000));
        match.startsInSeconds = remainingSec;
        match.isPreMatchBetEarly = true;
      } else if (match.status === 'LIVE_1H' || match.status === 'LIVE_2H') {
        match.isPreMatchBetEarly = false;
        // Subtle 2D ball tracker animation based on real team possession while waiting for next 20s live feed poll
        const homeBias = (match.stats.possessionHome - 50) * 0.15;
        const ballShiftX = (Math.random() - 0.5) * 10 + homeBias;
        const ballShiftY = (Math.random() - 0.5) * 12;
        match.stats.ballX = Math.max(10, Math.min(90, Math.round(match.stats.ballX + ballShiftX)));
        match.stats.ballY = Math.max(14, Math.min(86, Math.round(match.stats.ballY + ballShiftY)));
      }
    }

    // Broadcast live state update to connected clients
    this.broadcast({
      event: 'match:tick',
      serverTimestamp: now,
      data: this.getStateSnapshot(),
    });
  }

  private kickoffMatchInternal(match: InternalFootballMatch, now: number) {
    match.status = 'LIVE_1H';
    match.isPreMatchBetEarly = false;
    match.startsInSeconds = 0;
    match.minute = 1;
    match.homeScore = 0;
    match.awayScore = 0;
    match.htHomeScore = 0;
    match.htAwayScore = 0;
    match.stats.ballX = 50;
    match.stats.ballY = 50;
    match.stats.lastActionText = `1' Match Kicked Off — Live In-Play Markets Open!`;
    match.events.unshift({
      id: `ev_${match.id}_ko_${now}`,
      minute: 1,
      type: 'KICKOFF',
      team: 'NEUTRAL',
      description: `1' KICK OFF! ${match.homeTeam} vs ${match.awayTeam} is now LIVE!`,
      scoreSnapshot: '0 - 0',
      timestamp: new Date(now).toISOString(),
    });
    match.markets = buildMatchMarkets(
      match.id,
      match.homeTeam,
      match.awayTeam,
      match.status,
      match.minute,
      match.homeScore,
      match.awayScore,
      match.baseHomeProb,
      match.baseDrawProb,
      match.baseAwayProb,
      match.markets
    );
    match.updatedAt = now;
    this.refreshTicketsForMatch(match.id);

    this.broadcast({
      event: 'match:kickoff',
      matchId: match.id,
      serverTimestamp: now,
      data: this.toPublicMatchDTO(match),
    });
  }

  private triggerGoalInternal(match: InternalFootballMatch, team: 'HOME' | 'AWAY', now: number) {
    const players = team === 'HOME' ? match.homePlayers : match.awayPlayers;
    const scorer = players[Math.floor(Math.random() * players.length)] || 'Striker';

    if (team === 'HOME') {
      match.homeScore++;
      match.stats.shotsHome++;
      match.stats.shotsOnTargetHome++;
      match.stats.ballX = 94;
      match.stats.ballY = 50;
    } else {
      match.awayScore++;
      match.stats.shotsAway++;
      match.stats.shotsOnTargetAway++;
      match.stats.ballX = 6;
      match.stats.ballY = 50;
    }

    if (match.status === 'LIVE_1H') {
      match.htHomeScore = match.homeScore;
      match.htAwayScore = match.awayScore;
    }

    const teamName = team === 'HOME' ? match.homeTeam : match.awayTeam;
    const eventItem: FootballMatchEventDTO = {
      id: `ev_${match.id}_goal_${now}_${Math.random().toString(36).slice(2, 6)}`,
      minute: match.minute,
      type: 'GOAL',
      team,
      player: scorer,
      description: `${match.minute}' GOAL! ${scorer} scores for ${teamName}! (${match.homeScore} - ${match.awayScore})`,
      scoreSnapshot: `${match.homeScore} - ${match.awayScore}`,
      timestamp: new Date(now).toISOString(),
    };
    match.events.unshift(eventItem);
    match.stats.momentumTeam = team;
    match.stats.lastActionText = `GOAL! ${scorer} (${teamName}) ${match.homeScore}-${match.awayScore}`;

    match.markets = buildMatchMarkets(
      match.id,
      match.homeTeam,
      match.awayTeam,
      match.status,
      match.minute,
      match.homeScore,
      match.awayScore,
      match.baseHomeProb,
      match.baseDrawProb,
      match.baseAwayProb,
      match.markets
    );
    match.updatedAt = now;
    this.refreshTicketsForMatch(match.id);

    this.broadcast({
      event: 'match:event',
      matchId: match.id,
      serverTimestamp: now,
      data: {
        match: this.toPublicMatchDTO(match),
        event: eventItem,
      },
    });
  }

  private finishMatchInternal(match: InternalFootballMatch, now: number) {
    match.status = 'FT';
    match.minute = 90;
    match.finishedAtMs = now;
    match.stats.ballX = 50;
    match.stats.ballY = 50;
    match.stats.momentumTeam = 'NEUTRAL';
    match.stats.lastActionText = `Full Time: ${match.homeShort} ${match.homeScore} - ${match.awayScore} ${match.awayShort}`;
    match.events.unshift({
      id: `ev_${match.id}_ft_${now}`,
      minute: 90,
      type: 'FT',
      team: 'NEUTRAL',
      description: `90' FULL TIME: ${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`,
      scoreSnapshot: `${match.homeScore} - ${match.awayScore}`,
      timestamp: new Date(now).toISOString(),
    });
    match.markets = buildMatchMarkets(
      match.id,
      match.homeTeam,
      match.awayTeam,
      'FT',
      90,
      match.homeScore,
      match.awayScore,
      match.baseHomeProb,
      match.baseDrawProb,
      match.baseAwayProb,
      match.markets
    );
    match.updatedAt = now;
    this.refreshTicketsForMatch(match.id);

    this.broadcast({
      event: 'match:settled',
      matchId: match.id,
      serverTimestamp: now,
      data: this.toPublicMatchDTO(match),
    });
  }

  private resetMatchAsUpcoming(match: InternalFootballMatch, now: number) {
    const newServerSeed = crypto.randomBytes(32).toString('hex');
    match.serverSeed = newServerSeed;
    match.serverSeedHash = sha256HexNode(newServerSeed);
    match.nonce += 1;
    match.fixtureCode += 10;
    match.status = 'UPCOMING';
    match.isPreMatchBetEarly = true;
    match.startsInSeconds = 240 + Math.floor(Math.random() * 300);
    match.kickoffAt = now + match.startsInSeconds * 1000;
    match.minute = 0;
    match.homeScore = 0;
    match.awayScore = 0;
    match.htHomeScore = 0;
    match.htAwayScore = 0;
    match.finishedAtMs = null;
    match.events = [];
    match.stats = {
      possessionHome: 50,
      possessionAway: 50,
      shotsHome: 0,
      shotsAway: 0,
      shotsOnTargetHome: 0,
      shotsOnTargetAway: 0,
      cornersHome: 0,
      cornersAway: 0,
      yellowCardsHome: 0,
      yellowCardsAway: 0,
      redCardsHome: 0,
      redCardsAway: 0,
      dangerousAttacksHome: 0,
      dangerousAttacksAway: 0,
      ballX: 50,
      ballY: 50,
      momentumTeam: 'NEUTRAL',
      lastActionText: 'Pre-Match Markets Open — Bet Early before Kickoff',
    };
    match.markets = buildMatchMarkets(
      match.id,
      match.homeTeam,
      match.awayTeam,
      'UPCOMING',
      0,
      0,
      0,
      match.baseHomeProb,
      match.baseDrawProb,
      match.baseAwayProb
    );
    match.updatedAt = now;
  }

  /**
   * Re-evaluates all OPEN tickets that contain `matchId`, updating leg statuses,
   * live Cashout Offer in KES cents, and settling the ticket if all legs are decided!
   */
  private refreshTicketsForMatch(matchId: string) {
    const nowIso = new Date().toISOString();

    for (const ticket of this.tickets.values()) {
      if (ticket.status !== 'OPEN') continue;
      const touchesMatch = ticket.legs.some((l) => l.matchId === matchId);
      if (!touchesMatch) continue;

      let anyLegLost = false;
      let allLegsSettled = true;
      let combinedLiveOdds = 1.0;

      for (const leg of ticket.legs) {
        const m = this.matches.get(leg.matchId);
        if (!m) continue;

        leg.currentHomeScore = m.homeScore;
        leg.currentAwayScore = m.awayScore;
        leg.currentStatus = m.status;
        leg.currentMinute = m.minute;

        // Find current live odd for this selection
        const mkt = m.markets.find((mk) => mk.marketKey === leg.marketKey);
        const sel = mkt?.selections.find((s) => s.outcomeKey === leg.outcomeKey);
        leg.currentLiveOdds = sel ? sel.odds : null;

        const outcome = evaluateLegOutcome(m, leg.marketKey, leg.outcomeKey);
        leg.legStatus = outcome;

        if (outcome === 'LOST') {
          anyLegLost = true;
        } else if (outcome === 'PENDING') {
          allLegsSettled = false;
          combinedLiveOdds *= Math.max(1.02, leg.currentLiveOdds || leg.lockedOdds);
        } else if (outcome === 'WON') {
          // Won leg contributes 1.0 to remaining needed odds
          combinedLiveOdds *= 1.0;
        }
      }

      if (anyLegLost) {
        ticket.status = 'LOST';
        ticket.cashoutOfferCents = null;
        ticket.payoutCents = 0;
        ticket.profitCents = -ticket.stakeCents;
        ticket.settledAt = nowIso;
        continue;
      }

      if (allLegsSettled) {
        // Every leg is WON or VOID! Credit wallet atomically!
        const activeLockedOdds = ticket.legs
          .filter((l) => l.legStatus === 'WON')
          .map((l) => l.lockedOdds);
        const finalOdds = computeCombinedOdds(activeLockedOdds);
        const wonLegsCount = activeLockedOdds.length;
        const finalPayoutCents = computeTicketPotentialPayoutCents(
          ticket.stakeCents,
          finalOdds,
          wonLegsCount
        );

        ticket.status = 'WON';
        ticket.cashoutOfferCents = null;
        ticket.payoutCents = finalPayoutCents;
        ticket.profitCents = finalPayoutCents - ticket.stakeCents;
        ticket.settledAt = nowIso;

        this.creditUserWalletCents(
          ticket.userId,
          finalPayoutCents,
          'MATCH_SETTLE_WIN',
          matchId,
          ticket.id,
          `LM-WIN-${ticket.ticketCode}`,
          {
            ticketCode: ticket.ticketCode,
            totalOdds: finalOdds,
            legsCount: ticket.legs.length,
          }
        );
        continue;
      }

      // Ticket is still OPEN: compute live Early Cashout offer in integer KES cents!
      const allStillUpcoming = ticket.legs.every((l) => l.currentStatus === 'UPCOMING');
      if (allStillUpcoming) {
        // Pre-match ("Bet Early") cashout offer before kickoff: 96% of stake
        ticket.cashoutOfferCents = Math.max(100, Math.floor(ticket.stakeCents * 0.96));
      } else {
        // Fair value ratio = lockedOdds / combinedRemainingLiveOdds * 0.92 house cashout margin
        const fairRatio = (ticket.totalOdds / Math.max(1.01, combinedLiveOdds)) * 0.92;
        const rawOffer = Math.floor(ticket.stakeCents * fairRatio);
        // Cap offer at 96% of potential payout and floor at 10% of stake
        const minOffer = Math.floor(ticket.stakeCents * 0.12);
        const maxOffer = Math.floor(ticket.potentialPayoutCents * 0.96);
        ticket.cashoutOfferCents = Math.max(minOffer, Math.min(maxOffer, rawOffer));
      }

      // Check auto-cashout target if configured
      if (
        ticket.autoCashoutMultiplier &&
        ticket.cashoutOfferCents &&
        ticket.cashoutOfferCents >= Math.round(ticket.stakeCents * ticket.autoCashoutMultiplier)
      ) {
        const autoOffer = ticket.cashoutOfferCents;
        ticket.status = 'CASHED_OUT';
        ticket.cashedOutAmountCents = autoOffer;
        ticket.payoutCents = autoOffer;
        ticket.profitCents = autoOffer - ticket.stakeCents;
        ticket.cashoutOfferCents = null;
        ticket.settledAt = nowIso;

        this.creditUserWalletCents(
          ticket.userId,
          autoOffer,
          'CASHOUT_CREDIT',
          matchId,
          ticket.id,
          `LM-AUTOCO-${ticket.ticketCode}`,
          {
            ticketCode: ticket.ticketCode,
            autoCashoutMultiplier: ticket.autoCashoutMultiplier,
          }
        );
      }
    }
  }

  private creditUserWalletCents(
    userId: string,
    amountCents: number,
    eventType: 'CASHOUT_CREDIT' | 'MATCH_SETTLE_WIN' | 'BET_CANCEL_REFUND',
    matchId: string | null,
    ticketId: string,
    reference: string,
    metadata: Record<string, unknown>
  ): number {
    const wallet = this.ctx.wallets.get(userId) || {
      userId,
      balanceKes: 0,
      updatedAt: new Date().toISOString(),
    };
    const beforeCents = kesToCents(wallet.balanceKes);
    const afterCents = beforeCents + amountCents;
    wallet.balanceKes = centsToKes(afterCents);
    wallet.updatedAt = new Date().toISOString();
    this.ctx.wallets.set(userId, wallet);

    this.ctx.transactions.unshift({
      id: `tx_lm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      type: 'cashout_credit',
      amountKes: centsToKes(amountCents),
      paystackReference: reference,
      status: 'completed',
      createdAt: new Date().toISOString(),
      meta: { module: 'live-matches', ticketId, ...metadata },
    });

    this.appendAuditLog({
      eventType,
      userId,
      matchId,
      ticketId,
      amountCents,
      balanceBeforeCents: beforeCents,
      balanceAfterCents: afterCents,
      idempotencyKey: reference,
      metadata,
    });

    return afterCents;
  }

  private appendAuditLog(params: {
    eventType: LiveMatchAuditLogDTO['eventType'];
    userId: string | null;
    matchId: string | null;
    ticketId: string | null;
    amountCents: number;
    balanceBeforeCents: number | null;
    balanceAfterCents: number | null;
    idempotencyKey: string | null;
    metadata: Record<string, unknown>;
  }) {
    const entry: LiveMatchAuditLogDTO = {
      id: `audit_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      eventType: params.eventType,
      userId: params.userId,
      matchId: params.matchId,
      ticketId: params.ticketId,
      amountCents: params.amountCents,
      balanceBeforeCents: params.balanceBeforeCents,
      balanceAfterCents: params.balanceAfterCents,
      idempotencyKey: params.idempotencyKey,
      metadata: params.metadata,
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.unshift(entry);
    if (this.auditLogs.length > 500) {
      this.auditLogs.length = 500;
    }
  }

  private toPublicMatchDTO(match: InternalFootballMatch): FootballMatchDTO {
    return {
      id: match.id,
      fixtureCode: match.fixtureCode,
      leagueId: match.leagueId,
      leagueName: match.leagueName,
      country: match.country,
      venue: match.venue,
      homeTeam: match.homeTeam,
      homeShort: match.homeShort,
      homeBadgeColor: match.homeBadgeColor,
      homeLogo: match.homeLogo,
      homeForm: match.homeForm,
      awayTeam: match.awayTeam,
      awayShort: match.awayShort,
      awayBadgeColor: match.awayBadgeColor,
      awayLogo: match.awayLogo,
      awayForm: match.awayForm,
      status: match.status,
      statusDetail: match.statusDetail,
      isPreMatchBetEarly: match.status === 'UPCOMING',
      kickoffAt: match.kickoffAt,
      kickoffIso: match.kickoffIso,
      startsInSeconds: match.startsInSeconds,
      minute: match.minute,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      htHomeScore: match.htHomeScore,
      htAwayScore: match.htAwayScore,
      marketsCount: match.marketsCount,
      markets: match.markets,
      events: match.events.slice(0, 25),
      stats: match.stats,
      h2hSummary: match.h2hSummary,
      serverSeedHash: match.serverSeedHash,
      // Only reveal serverSeed once match is Full Time (FT)
      serverSeed: match.status === 'FT' ? match.serverSeed : null,
      clientSeed: match.clientSeed,
      nonce: match.nonce,
      totalBetsCount: match.totalBetsCount,
      totalPoolCents: match.totalPoolCents,
      updatedAt: match.updatedAt,
    };
  }

  public getStateSnapshot(): LiveMatchesStateSnapshotDTO {
    const matchesList = Array.from(this.matches.values()).map((m) =>
      this.toPublicMatchDTO(m)
    );
    return {
      matches: matchesList,
      recentPublicBets: this.publicBetsFeed.slice(0, 25),
      onlinePlayers: 284 + this.wsClients.size,
      minStakeCents: LM_MIN_STAKE_CENTS,
      maxStakeCents: LM_MAX_STAKE_CENTS,
      maxPayoutCents: LM_MAX_PAYOUT_CENTS,
      serverTimestamp: Date.now(),
      lastSyncedAt: this.lastSyncedAt,
      feedSource: 'ESPN Live Global Football Feed',
    };
  }

  public getMatchById(matchId: string): FootballMatchDTO | null {
    const m = this.matches.get(matchId);
    if (!m) {
      // Fallback: if a legacy room slug ('standard', 'low', 'high') was requested, return the featured match
      const first = Array.from(this.matches.values())[0];
      return first ? this.toPublicMatchDTO(first) : null;
    }
    return this.toPublicMatchDTO(m);
  }

  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const bucket = (this.userRateBuckets.get(userId) || []).filter((t) => now - t < 10_000);
    if (bucket.length >= 15) {
      return false;
    }
    bucket.push(now);
    this.userRateBuckets.set(userId, bucket);
    return true;
  }

  /**
   * Places a Single or Multi-Bet (Accumulator) Football Ticket.
   * Supports both Pre-Match ("Bet Early") and Live In-Play selections!
   * Enforces the strict 10.00 KES (1,000 cents) minimum stake rule.
   */
  public placeBet(params: {
    userId: string;
    selections?: BetSlipSelectionInput[];
    matchId?: string;
    marketKey?: FootballMarketKey;
    outcomeKey?: string;
    stakeCents: unknown;
    autoCashoutMultiplier?: unknown;
    idempotencyKey?: unknown;
  }): { status: number; body: any } {
    const { userId, idempotencyKey } = params;

    if (!userId || !this.ctx.users.has(userId)) {
      return {
        status: 401,
        body: {
          ok: false,
          code: 'LM_AUTH_REQUIRED' as LiveMatchErrorCode,
          error: 'Please sign in to place a football bet.',
        },
      };
    }

    if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 6) {
      return {
        status: 400,
        body: {
          ok: false,
          code: 'LM_MISSING_IDEMPOTENCY_KEY' as LiveMatchErrorCode,
          error: 'A valid idempotencyKey is required for every bet placement.',
        },
      };
    }

    const cleanIdemKey = `${userId}:${idempotencyKey.trim()}`;
    const existingIdem = this.idempotencyStore.get(cleanIdemKey);
    if (existingIdem) {
      return existingIdem.response;
    }

    const excludedUntil = this.selfExcludedUntil.get(userId) || 0;
    if (excludedUntil > Date.now()) {
      return {
        status: 403,
        body: {
          ok: false,
          code: 'LM_SELF_EXCLUDED' as LiveMatchErrorCode,
          error: 'Self-exclusion is active on your account for Responsible Gaming.',
        },
      };
    }

    if (!this.checkRateLimit(userId)) {
      return {
        status: 429,
        body: {
          ok: false,
          code: 'LM_RATE_LIMITED' as LiveMatchErrorCode,
          error: 'Too many bet requests. Please wait a few seconds.',
        },
      };
    }

    // Validate 10.00 KES (1,000 cents) minimum stake & integer cents rule
    const stakeValidation = validateStakeCents(
      params.stakeCents,
      LM_MIN_STAKE_CENTS,
      LM_MAX_STAKE_CENTS
    );
    if (!stakeValidation.valid || stakeValidation.stakeCents === undefined) {
      this.appendAuditLog({
        eventType: 'REJECTED_ACTION',
        userId,
        matchId: params.matchId || null,
        ticketId: null,
        amountCents: typeof params.stakeCents === 'number' ? Math.trunc(params.stakeCents) : 0,
        balanceBeforeCents: null,
        balanceAfterCents: null,
        idempotencyKey: cleanIdemKey,
        metadata: { reason: stakeValidation.code, rawStake: params.stakeCents },
      });
      return {
        status: 400,
        body: {
          ok: false,
          code: stakeValidation.code,
          error: stakeValidation.message,
        },
      };
    }

    const stakeCents = stakeValidation.stakeCents;

    // Validate optional auto-cashout
    const autoCheck = validateAutoCashout(
      params.autoCashoutMultiplier !== null && params.autoCashoutMultiplier !== undefined,
      params.autoCashoutMultiplier
    );
    if (!autoCheck.valid) {
      return {
        status: 400,
        body: {
          ok: false,
          code: autoCheck.code,
          error: autoCheck.message,
        },
      };
    }

    // Normalize selections array
    const rawSelections: BetSlipSelectionInput[] =
      Array.isArray(params.selections) && params.selections.length > 0
        ? params.selections
        : params.matchId && params.marketKey && params.outcomeKey
        ? [
            {
              matchId: params.matchId,
              marketKey: params.marketKey,
              outcomeKey: params.outcomeKey,
            },
          ]
        : [];

    if (rawSelections.length === 0) {
      return {
        status: 400,
        body: {
          ok: false,
          code: 'LM_EMPTY_SELECTIONS' as LiveMatchErrorCode,
          error: 'Select at least one football match odd to place a bet.',
        },
      };
    }

    // Ensure no duplicate matchId in a single accumulator ticket
    const seenMatches = new Set<string>();
    const builtLegs: LiveMatchTicketLegDTO[] = [];

    for (const selInput of rawSelections) {
      if (seenMatches.has(selInput.matchId)) {
        return {
          status: 400,
          body: {
            ok: false,
            code: 'LM_DUPLICATE_MATCH_IN_SLIP' as LiveMatchErrorCode,
            error: 'Cannot combine multiple selections from the same match in one Multi-Bet.',
          },
        };
      }
      seenMatches.add(selInput.matchId);

      const match = this.matches.get(selInput.matchId);
      if (!match) {
        return {
          status: 404,
          body: {
            ok: false,
            code: 'LM_MATCH_NOT_FOUND' as LiveMatchErrorCode,
            error: `Match ${selInput.matchId} not found.`,
          },
        };
      }

      if (match.status === 'FT') {
        return {
          status: 400,
          body: {
            ok: false,
            code: 'LM_MATCH_ALREADY_FINISHED' as LiveMatchErrorCode,
            error: `${match.homeTeam} vs ${match.awayTeam} has already finished (Full Time).`,
          },
        };
      }

      const market = match.markets.find((m) => m.marketKey === selInput.marketKey);
      const outcome = market?.selections.find((s) => s.outcomeKey === selInput.outcomeKey);

      if (!market || !outcome || market.suspended || outcome.suspended) {
        return {
          status: 400,
          body: {
            ok: false,
            code: 'LM_MARKET_SUSPENDED' as LiveMatchErrorCode,
            error: `Market ${selInput.marketKey} (${selInput.outcomeKey}) is currently suspended.`,
          },
        };
      }

      builtLegs.push({
        id: `leg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        matchId: match.id,
        fixtureCode: match.fixtureCode,
        leagueName: match.leagueName,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        placedAtStatus: match.status,
        isEarlyBet: match.status === 'UPCOMING',
        scoreAtPlacement: `${match.homeScore} - ${match.awayScore}`,
        currentHomeScore: match.homeScore,
        currentAwayScore: match.awayScore,
        currentStatus: match.status,
        currentMinute: match.minute,
        marketKey: market.marketKey,
        marketName: market.marketName,
        outcomeKey: outcome.outcomeKey,
        outcomeLabel: outcome.outcomeLabel,
        lockedOdds: outcome.odds,
        currentLiveOdds: outcome.odds,
        legStatus: 'PENDING',
      });
    }

    if (this.userMutexes.has(userId)) {
      return {
        status: 429,
        body: {
          ok: false,
          code: 'LM_RATE_LIMITED' as LiveMatchErrorCode,
          error: 'Another transaction is currently in progress.',
        },
      };
    }

    this.userMutexes.add(userId);
    try {
      const wallet = this.ctx.wallets.get(userId);
      const balanceBeforeCents = wallet ? kesToCents(wallet.balanceKes) : 0;

      if (!wallet || balanceBeforeCents < stakeCents) {
        this.appendAuditLog({
          eventType: 'REJECTED_ACTION',
          userId,
          matchId: builtLegs[0].matchId,
          ticketId: null,
          amountCents: stakeCents,
          balanceBeforeCents,
          balanceAfterCents: balanceBeforeCents,
          idempotencyKey: cleanIdemKey,
          metadata: { reason: 'LM_INSUFFICIENT_FUNDS' },
        });
        return {
          status: 400,
          body: {
            ok: false,
            code: 'LM_INSUFFICIENT_FUNDS' as LiveMatchErrorCode,
            error: `Insufficient wallet balance. Available: ${(balanceBeforeCents / 100).toFixed(2)} KES.`,
            balanceCents: balanceBeforeCents,
          },
        };
      }

      // Atomic wallet deduction in integer cents
      const balanceAfterCents = balanceBeforeCents - stakeCents;
      wallet.balanceKes = centsToKes(balanceAfterCents);
      wallet.updatedAt = new Date().toISOString();
      this.ctx.wallets.set(userId, wallet);

      const totalOdds = computeCombinedOdds(builtLegs.map((l) => l.lockedOdds));
      const multiBoostPercent = computeMultiBoostPercent(builtLegs.length);
      const potentialPayoutCents = computeTicketPotentialPayoutCents(
        stakeCents,
        totalOdds,
        builtLegs.length
      );

      const ticketCode = `BTK-${Math.floor(100000 + Math.random() * 900000)}`;
      const ticketId = `tkt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const userObj = this.ctx.users.get(userId);
      const usernameMasked = maskDisplayName(userObj?.phone || userObj?.fullName || 'Player');

      const hasEarlyBetLegs = builtLegs.some((l) => l.isEarlyBet);
      const hasLiveLegs = builtLegs.some((l) => !l.isEarlyBet);

      // Initial early cashout offer (95% pre-match, 92% live)
      const initialCashoutCents = Math.max(
        100,
        Math.floor(stakeCents * (hasLiveLegs ? 0.92 : 0.96))
      );

      const ticket: LiveMatchTicketDTO = {
        id: ticketId,
        ticketCode,
        userId,
        usernameMasked,
        type: builtLegs.length > 1 ? 'MULTI' : 'SINGLE',
        legs: builtLegs,
        totalOdds,
        stakeCents,
        multiBoostPercent,
        potentialPayoutCents,
        cashoutOfferCents: initialCashoutCents,
        cashedOutAmountCents: null,
        autoCashoutMultiplier: autoCheck.multiplier,
        payoutCents: 0,
        profitCents: 0,
        status: 'OPEN',
        hasEarlyBetLegs,
        hasLiveLegs,
        idempotencyKey: idempotencyKey.trim(),
        placedAt: new Date().toISOString(),
        settledAt: null,
      };

      this.tickets.set(ticket.id, ticket);
      const uList = this.userTickets.get(userId) || [];
      uList.unshift(ticket.id);
      this.userTickets.set(userId, uList);

      // Update match pools
      for (const leg of builtLegs) {
        const m = this.matches.get(leg.matchId);
        if (m) {
          m.totalBetsCount += 1;
          m.totalPoolCents += Math.floor(stakeCents / builtLegs.length);
        }
      }

      // Record shared transaction & audit log
      this.ctx.transactions.unshift({
        id: `tx_lm_bet_${Date.now()}`,
        userId,
        type: 'bet_debit',
        amountKes: centsToKes(stakeCents),
        paystackReference: `LM-BET-${ticketCode}`,
        status: 'completed',
        createdAt: new Date().toISOString(),
        meta: {
          module: 'live-matches',
          ticketId: ticket.id,
          ticketCode,
          legsCount: builtLegs.length,
          hasEarlyBetLegs,
        },
      });

      this.appendAuditLog({
        eventType: 'BET_DEBIT',
        userId,
        matchId: builtLegs[0].matchId,
        ticketId: ticket.id,
        amountCents: stakeCents,
        balanceBeforeCents,
        balanceAfterCents,
        idempotencyKey: cleanIdemKey,
        metadata: {
          ticketCode,
          type: ticket.type,
          totalOdds,
          legsCount: builtLegs.length,
          hasEarlyBetLegs,
        },
      });

      const primaryLeg = builtLegs[0];
      const primaryMatch = this.matches.get(primaryLeg.matchId);
      const feedEntry: LiveMatchPublicFeedBetDTO = {
        id: ticket.id,
        ticketCode: ticket.ticketCode,
        usernameMasked,
        type: ticket.type,
        legsCount: builtLegs.length,
        primaryMatchId: primaryLeg.matchId,
        primaryMatchLabel: primaryMatch
          ? `${primaryMatch.homeShort} vs ${primaryMatch.awayShort}`
          : `${primaryLeg.homeTeam} vs ${primaryLeg.awayTeam}`,
        primaryPickLabel: `${primaryLeg.marketName}: ${primaryLeg.outcomeLabel}`,
        isEarlyBet: hasEarlyBetLegs && !hasLiveLegs,
        totalOdds,
        stakeCents,
        potentialPayoutCents,
        status: 'OPEN',
        cashedOutAmountCents: null,
        placedAt: ticket.placedAt,
      };
      this.publicBetsFeed.unshift(feedEntry);
      if (this.publicBetsFeed.length > 60) {
        this.publicBetsFeed.length = 60;
      }

      const response = {
        status: 200,
        body: {
          ok: true,
          ticket,
          balanceCents: balanceAfterCents,
          balanceKes: centsToKes(balanceAfterCents),
        },
      };
      this.idempotencyStore.set(cleanIdemKey, { timestamp: Date.now(), response });

      this.broadcast({
        event: 'bet:placed',
        matchId: primaryLeg.matchId,
        serverTimestamp: Date.now(),
        data: feedEntry,
      });

      return response;
    } finally {
      this.userMutexes.delete(userId);
    }
  }

  /**
   * Executes Early Cashout on an OPEN football ticket (works for both Pre-Match and Live In-Play tickets).
   */
  public cashOutTicket(params: {
    userId: string;
    ticketId: string;
    idempotencyKey?: unknown;
  }): { status: number; body: any } {
    const { userId, ticketId, idempotencyKey } = params;

    if (!userId || !this.ctx.users.has(userId)) {
      return {
        status: 401,
        body: {
          ok: false,
          code: 'LM_AUTH_REQUIRED' as LiveMatchErrorCode,
          error: 'Authentication required to cash out.',
        },
      };
    }

    if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 6) {
      return {
        status: 400,
        body: {
          ok: false,
          code: 'LM_MISSING_IDEMPOTENCY_KEY' as LiveMatchErrorCode,
          error: 'idempotencyKey is required for cashout.',
        },
      };
    }

    const cleanIdemKey = `${userId}:co:${idempotencyKey.trim()}`;
    const cached = this.idempotencyStore.get(cleanIdemKey);
    if (cached) return cached.response;

    const ticket = this.tickets.get(ticketId);
    if (!ticket || ticket.userId !== userId) {
      return {
        status: 404,
        body: {
          ok: false,
          code: 'LM_BET_NOT_FOUND' as LiveMatchErrorCode,
          error: 'Ticket not found.',
        },
      };
    }

    if (ticket.status !== 'OPEN') {
      return {
        status: 400,
        body: {
          ok: false,
          code: 'LM_BET_ALREADY_SETTLED' as LiveMatchErrorCode,
          error: `Ticket is already ${ticket.status}.`,
        },
      };
    }

    // Recompute fresh cashout offer
    if (ticket.legs[0]) {
      this.refreshTicketsForMatch(ticket.legs[0].matchId);
    }

    if (ticket.status !== 'OPEN' || !ticket.cashoutOfferCents || ticket.cashoutOfferCents <= 0) {
      return {
        status: 400,
        body: {
          ok: false,
          code: 'LM_CASHOUT_UNAVAILABLE' as LiveMatchErrorCode,
          error: 'Cashout is currently unavailable for this ticket.',
        },
      };
    }

    const cashoutCents = ticket.cashoutOfferCents;
    ticket.status = 'CASHED_OUT';
    ticket.cashedOutAmountCents = cashoutCents;
    ticket.payoutCents = cashoutCents;
    ticket.profitCents = cashoutCents - ticket.stakeCents;
    ticket.cashoutOfferCents = null;
    ticket.settledAt = new Date().toISOString();

    const newBalanceCents = this.creditUserWalletCents(
      userId,
      cashoutCents,
      'CASHOUT_CREDIT',
      ticket.legs[0]?.matchId || null,
      ticket.id,
      `LM-CASHOUT-${ticket.ticketCode}`,
      {
        ticketCode: ticket.ticketCode,
        stakeCents: ticket.stakeCents,
        cashoutCents,
      }
    );

    const feedItem = this.publicBetsFeed.find((f) => f.id === ticket.id);
    if (feedItem) {
      feedItem.status = 'CASHED_OUT';
      feedItem.cashedOutAmountCents = cashoutCents;
    }

    const response = {
      status: 200,
      body: {
        ok: true,
        ticket,
        cashoutCents,
        cashoutKes: centsToKes(cashoutCents),
        balanceCents: newBalanceCents,
        balanceKes: centsToKes(newBalanceCents),
      },
    };
    this.idempotencyStore.set(cleanIdemKey, { timestamp: Date.now(), response });

    this.broadcast({
      event: 'bet:cashed_out',
      matchId: ticket.legs[0]?.matchId,
      serverTimestamp: Date.now(),
      data: {
        ticketId: ticket.id,
        ticketCode: ticket.ticketCode,
        usernameMasked: ticket.usernameMasked,
        cashoutCents,
      },
    });

    return response;
  }

  /**
   * Cancels a Pre-Match ("Bet Early") ticket before kickoff for a 100% full stake refund!
   */
  public cancelPreMatchTicket(params: {
    userId: string;
    ticketId: string;
  }): { status: number; body: any } {
    const { userId, ticketId } = params;
    const ticket = this.tickets.get(ticketId);
    if (!ticket || ticket.userId !== userId) {
      return {
        status: 404,
        body: { ok: false, code: 'LM_BET_NOT_FOUND', error: 'Ticket not found.' },
      };
    }

    if (ticket.status !== 'OPEN') {
      return {
        status: 400,
        body: { ok: false, code: 'LM_BET_ALREADY_SETTLED', error: 'Ticket is already settled.' },
      };
    }

    const allUpcoming = ticket.legs.every((l) => {
      const m = this.matches.get(l.matchId);
      return m && m.status === 'UPCOMING';
    });

    if (!allUpcoming) {
      return {
        status: 400,
        body: {
          ok: false,
          code: 'LM_CASHOUT_UNAVAILABLE',
          error: 'One or more matches have already kicked off. Use Early Cashout instead.',
        },
      };
    }

    ticket.status = 'CANCELLED';
    ticket.cashoutOfferCents = null;
    ticket.payoutCents = ticket.stakeCents;
    ticket.profitCents = 0;
    ticket.settledAt = new Date().toISOString();

    const newBalanceCents = this.creditUserWalletCents(
      userId,
      ticket.stakeCents,
      'BET_CANCEL_REFUND',
      ticket.legs[0]?.matchId || null,
      ticket.id,
      `LM-REFUND-${ticket.ticketCode}`,
      { ticketCode: ticket.ticketCode }
    );

    return {
      status: 200,
      body: {
        ok: true,
        ticket,
        refundedCents: ticket.stakeCents,
        balanceCents: newBalanceCents,
        balanceKes: centsToKes(newBalanceCents),
      },
    };
  }

  /**
   * Allows a user to immediately kick off an UPCOMING ("Bet Early") match so they can watch
   * their pre-match bet transition into Live In-Play action immediately.
   */
  public forceKickoffMatch(matchId: string): { status: number; body: any } {
    const match = this.matches.get(matchId);
    if (!match) {
      return { status: 404, body: { ok: false, error: 'Match not found' } };
    }
    if (match.status === 'UPCOMING') {
      this.kickoffMatchInternal(match, Date.now());
    }
    return {
      status: 200,
      body: {
        ok: true,
        match: this.toPublicMatchDTO(match),
      },
    };
  }

  public getUserTickets(
    userId: string,
    filterStatus?: string,
    filterTiming?: string
  ): LiveMatchTicketDTO[] {
    const ids = this.userTickets.get(userId) || [];
    let list = ids
      .map((id) => this.tickets.get(id))
      .filter((t): t is LiveMatchTicketDTO => Boolean(t));

    if (filterStatus && filterStatus !== 'ALL') {
      list = list.filter((t) => t.status === filterStatus);
    }
    if (filterTiming === 'EARLY') {
      list = list.filter((t) => t.hasEarlyBetLegs);
    } else if (filterTiming === 'LIVE') {
      list = list.filter((t) => t.hasLiveLegs);
    }
    return list;
  }

  public getUserAuditLogs(userId: string): LiveMatchAuditLogDTO[] {
    return this.auditLogs.filter((l) => l.userId === userId).slice(0, 100);
  }

  public activateSelfExclusion(userId: string, hours = 24): number {
    const until = Date.now() + hours * 3600 * 1000;
    this.selfExcludedUntil.set(userId, until);
    return until;
  }

  private broadcast(envelope: LiveMatchSocketEnvelope) {
    const payload = JSON.stringify(envelope);
    for (const client of this.wsClients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
    for (const res of this.sseClients) {
      try {
        res.write(`data: ${payload}\n\n`);
      } catch {
        this.sseClients.delete(res);
      }
    }
  }

  public attachRoutesAndSockets(app: Express, httpServer: http.Server) {
    // 1. State / Lobby Snapshot
    const handleState = (_req: Request, res: Response) => {
      const lastSyncAgeMs = Date.now() - new Date(this.lastSyncedAt).getTime();
      if (!this.hasSyncedRealWorld || lastSyncAgeMs > 60_000) {
        void this.syncRealWorldMatches(false);
      }
      res.json({
        ok: true,
        ...this.getStateSnapshot(),
      });
    };
    app.get('/api/live-matches/state', handleState);
    app.get('/api/live-matches/lobby', handleState);

    // 1b. On-demand Live World Feed Sync
    app.post('/api/live-matches/sync', async (req: Request, res: Response) => {
      const quick = Boolean(req.body?.quick);
      await this.syncRealWorldMatches(quick);
      res.json({
        ok: true,
        ...this.getStateSnapshot(),
      });
    });

    // 2. Single Match Center Detail
    const handleSingleMatch = (req: Request, res: Response) => {
      const matchId = req.params.matchId || req.params.roundId;
      const match = this.getMatchById(matchId);
      if (!match) {
        return res.status(404).json({ ok: false, code: 'LM_MATCH_NOT_FOUND', error: 'Match not found' });
      }
      const matchBets = this.publicBetsFeed.filter((b) => b.primaryMatchId === match.id).slice(0, 20);
      return res.json({
        ok: true,
        match,
        recentBets: matchBets,
        serverTimestamp: Date.now(),
      });
    };
    app.get('/api/live-matches/matches/:matchId', handleSingleMatch);
    app.get('/api/live-matches/rounds/:roundId', handleSingleMatch);

    // 3. Place Football Bet (Single or Multi-Bet, Pre-Match "Bet Early" or Live In-Play)
    app.post('/api/live-matches/bet/place', (req: Request, res: Response) => {
      const userId = (req.headers['x-user-id'] as string) || req.body?.userId;
      const result = this.placeBet({
        userId,
        selections: req.body?.selections,
        matchId: req.body?.matchId || req.body?.roundId,
        marketKey: req.body?.marketKey || '1X2',
        outcomeKey: req.body?.outcomeKey || '1',
        stakeCents: req.body?.stakeCents,
        autoCashoutMultiplier: req.body?.autoCashoutMultiplier,
        idempotencyKey: req.headers['x-idempotency-key'] || req.body?.idempotencyKey,
      });
      res.status(result.status).json(result.body);
    });

    // 4. Early Cashout
    app.post('/api/live-matches/bet/cashout', (req: Request, res: Response) => {
      const userId = (req.headers['x-user-id'] as string) || req.body?.userId;
      const ticketId = req.body?.ticketId || req.body?.betId;
      const result = this.cashOutTicket({
        userId,
        ticketId,
        idempotencyKey: req.headers['x-idempotency-key'] || req.body?.idempotencyKey,
      });
      res.status(result.status).json(result.body);
    });

    // 5. Cancel Pre-Match ("Bet Early") Ticket before Kickoff
    app.post('/api/live-matches/bet/cancel', (req: Request, res: Response) => {
      const userId = (req.headers['x-user-id'] as string) || req.body?.userId;
      const ticketId = req.body?.ticketId || req.body?.betId;
      const result = this.cancelPreMatchTicket({ userId, ticketId });
      res.status(result.status).json(result.body);
    });

    // 6. Instant Kickoff for an UPCOMING ("Bet Early") match
    app.post('/api/live-matches/matches/:matchId/kickoff', (req: Request, res: Response) => {
      const result = this.forceKickoffMatch(req.params.matchId);
      res.status(result.status).json(result.body);
    });

    // 7. Personal Ticket History
    app.get('/api/live-matches/history', (req: Request, res: Response) => {
      const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string);
      if (!userId) {
        return res.status(401).json({ ok: false, code: 'LM_AUTH_REQUIRED', error: 'Sign in required' });
      }
      const statusFilter = (req.query.status as string) || 'ALL';
      const timingFilter = (req.query.timing as string) || 'ALL';
      const tickets = this.getUserTickets(userId, statusFilter, timingFilter);
      return res.json({
        ok: true,
        tickets,
        bets: tickets, // alias for backward compatibility
      });
    });

    // 8. Module Wallet Bridge & Audit Ledger
    app.get('/api/live-matches/wallet', (req: Request, res: Response) => {
      const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string);
      if (!userId) {
        return res.status(401).json({ ok: false, code: 'LM_AUTH_REQUIRED', error: 'Sign in required' });
      }
      const wallet = this.ctx.wallets.get(userId);
      const balanceKes = wallet?.balanceKes ?? 0;
      const balanceCents = kesToCents(balanceKes);
      const auditLogs = this.getUserAuditLogs(userId);
      const sharedTransactions = this.ctx.transactions.filter((t) => t.userId === userId).slice(0, 50);

      return res.json({
        ok: true,
        balanceCents,
        balanceKes,
        minStakeCents: LM_MIN_STAKE_CENTS,
        maxStakeCents: LM_MAX_STAKE_CENTS,
        maxPayoutCents: LM_MAX_PAYOUT_CENTS,
        auditLogs,
        sharedTransactions,
      });
    });

    // 9. Provably Fair Match RNG Verification
    app.post('/api/live-matches/fairness/verify', (req: Request, res: Response) => {
      const { serverSeed, serverSeedHash, clientSeed, nonce } = req.body || {};
      if (!serverSeed || !clientSeed || nonce === undefined) {
        return res.status(400).json({
          ok: false,
          error: 'serverSeed, clientSeed, and nonce are required.',
        });
      }
      const cleanServerSeed = String(serverSeed).trim();
      const cleanClientSeed = String(clientSeed).trim();
      const cleanNonce = Number(nonce) || 0;
      const computedHash = sha256HexNode(cleanServerSeed);
      const expectedHash = (serverSeedHash ? String(serverSeedHash).trim() : computedHash).toLowerCase();
      const hmacHex = crypto
        .createHmac('sha256', cleanServerSeed)
        .update(`${cleanClientSeed}:${cleanNonce}`)
        .digest('hex');

      const { homeGoals, awayGoals } = deriveFootballScoreFromHmacHex(hmacHex);
      const computedCrashPoint = deriveCrashPointFromHmacHex(hmacHex);

      return res.json({
        ok: true,
        valid: computedHash.toLowerCase() === expectedHash,
        serverSeed: cleanServerSeed,
        expectedServerSeedHash: expectedHash,
        computedServerSeedHash: computedHash,
        hashMatches: computedHash.toLowerCase() === expectedHash,
        clientSeed: cleanClientSeed,
        nonce: cleanNonce,
        hmacHex,
        simulatedHomeGoals: homeGoals,
        simulatedAwayGoals: awayGoals,
        computedCrashPoint,
      });
    });

    // 10. Responsible Gaming Self-Exclusion
    app.post('/api/live-matches/responsible/self-exclude', (req: Request, res: Response) => {
      const userId = (req.headers['x-user-id'] as string) || req.body?.userId;
      if (!userId) {
        return res.status(401).json({ ok: false, code: 'LM_AUTH_REQUIRED', error: 'Sign in required' });
      }
      const hours = Math.max(1, Math.min(720, Number(req.body?.hours) || 24));
      const excludedUntil = this.activateSelfExclusion(userId, hours);
      return res.json({
        ok: true,
        excludedUntil: new Date(excludedUntil).toISOString(),
      });
    });

    // 11. SSE Fallback Stream
    app.get('/api/live-matches/stream', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const initial: LiveMatchSocketEnvelope = {
        event: 'matches:snapshot',
        serverTimestamp: Date.now(),
        data: this.getStateSnapshot(),
      };
      res.write(`data: ${JSON.stringify(initial)}\n\n`);
      this.sseClients.add(res);

      req.on('close', () => {
        this.sseClients.delete(res);
      });
    });

    // 12. Isolated WebSocket Gateway (/ws/live-matches)
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
      try {
        const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
        if (url.pathname === '/ws/live-matches') {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        }
      } catch {
        // ignore non-matching upgrade requests
      }
    });

    wss.on('connection', (ws: WebSocket, request) => {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      const matchId = url.searchParams.get('matchId') || undefined;
      const userId = url.searchParams.get('userId') || undefined;

      const clientRecord = { ws, matchId, userId };
      this.wsClients.add(clientRecord);

      ws.send(
        JSON.stringify({
          event: 'matches:snapshot',
          serverTimestamp: Date.now(),
          data: this.getStateSnapshot(),
        } satisfies LiveMatchSocketEnvelope)
      );

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg.type === 'ping') {
            ws.send(
              JSON.stringify({
                event: 'pong',
                serverTimestamp: Date.now(),
                data: { clientTimestamp: msg.clientTimestamp || Date.now() },
              } satisfies LiveMatchSocketEnvelope)
            );
          } else if (msg.type === 'resync') {
            ws.send(
              JSON.stringify({
                event: 'matches:snapshot',
                serverTimestamp: Date.now(),
                data: this.getStateSnapshot(),
              } satisfies LiveMatchSocketEnvelope)
            );
          }
        } catch {
          // ignore malformed client messages
        }
      });

      ws.on('close', () => {
        this.wsClients.delete(clientRecord);
      });
    });
  }
}

let singletonEngine: LiveMatchesEngine | null = null;

export function attachLiveMatchesModule(
  app: Express,
  httpServer: http.Server,
  ctx: SharedServerContext
): LiveMatchesEngine {
  if (!singletonEngine) {
    singletonEngine = new LiveMatchesEngine(ctx);
    singletonEngine.start();
  }
  singletonEngine.attachRoutesAndSockets(app, httpServer);
  return singletonEngine;
}
