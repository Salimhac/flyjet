import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Trophy,
  Ticket,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Wallet as WalletIcon,
  FastForward,
  History,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Clock,
} from 'lucide-react';
import { UserProfile, Wallet } from '../../types';
import {
  LM_MAX_STAKE_CENTS,
  LM_MIN_STAKE_CENTS,
  centsToKes,
  computeCombinedOdds,
  computeTicketPayoutBreakdown,
  formatCentsToKes,
  kesToCents,
  parseAndValidateKesInput,
  parsePreviewStakeCents,
} from '../live-matches/money';
import { supabase } from '../../lib/supabase';

interface LigiBigiGameProps {
  user: UserProfile | null;
  wallet: Wallet | null;
  onWalletUpdate: (newBalanceKes: number) => void;
  onOpenAuth: () => void;
  onOpenDeposit: () => void;
}

type LeagueId = 'english' | 'kenyan' | 'spanish' | 'italian';

interface LigiTeam {
  id: string;
  name: string;
  short: string;
  primaryColor: string;
  secondaryColor: string;
  rating: number;
  form: Array<'W' | 'D' | 'L'>;
}

interface LigiFixture {
  id: string;
  matchNumber: number;
  home: LigiTeam;
  away: LigiTeam;
  homeScore: number;
  awayScore: number;
  htHomeScore: number;
  htAwayScore: number;
  goalEvents: Array<{
    minute: number;
    side: 'HOME' | 'AWAY';
    scorer: string;
  }>;
  odds1X2: { '1': number; X: number; '2': number };
  oddsDC: { '1X': number; '12': number; X2: number };
  oddsOU25: { OVER: number; UNDER: number };
  oddsOU15: { OVER: number; UNDER: number };
  oddsBTTS: { GG: number; NG: number };
  oddsHT1X2: { '1': number; X: number; '2': number };
  oddsCorrectScore: Array<{ label: string; h: number; a: number; odd: number }>;
}

type MarketCategory = '1X2' | 'DC' | 'O/U 2.5' | 'GG/NG';

interface LigiSlipSelection {
  selectionId: string;
  fixtureId: string;
  homeName: string;
  awayName: string;
  market: string;
  pick: string;
  odds: number;
}

interface LigiSettledTicket {
  id: string;
  ticketCode: string;
  leagueName: string;
  matchday: number;
  stakeCents: number;
  totalOdds: number;
  potentialPayoutCents: number;
  payoutCents: number;
  status: 'OPEN' | 'WON' | 'LOST';
  selections: Array<
    LigiSlipSelection & {
      finalScore?: string;
      won?: boolean;
    }
  >;
  createdAt: string;
}

interface StandingsRow {
  teamId: string;
  name: string;
  short: string;
  color: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
  form: Array<'W' | 'D' | 'L'>;
}

const LEAGUES: Array<{
  id: LeagueId;
  name: string;
  shortLabel: string;
  countryCode: string;
  teams: LigiTeam[];
}> = [
  {
    id: 'english',
    name: 'English Premier League',
    shortLabel: 'England',
    countryCode: 'EN',
    teams: [
      { id: 'en_mci', name: 'Manchester City', short: 'MCI', primaryColor: '#38bdf8', secondaryColor: '#0284c7', rating: 92, form: ['W', 'W', 'D', 'W', 'W'] },
      { id: 'en_ars', name: 'Arsenal', short: 'ARS', primaryColor: '#ef4444', secondaryColor: '#ffffff', rating: 90, form: ['W', 'W', 'W', 'D', 'W'] },
      { id: 'en_liv', name: 'Liverpool', short: 'LIV', primaryColor: '#dc2626', secondaryColor: '#facc15', rating: 91, form: ['W', 'D', 'W', 'W', 'W'] },
      { id: 'en_che', name: 'Chelsea', short: 'CHE', primaryColor: '#2563eb', secondaryColor: '#ffffff', rating: 86, form: ['W', 'L', 'W', 'D', 'W'] },
      { id: 'en_mun', name: 'Man United', short: 'MUN', primaryColor: '#b91c1c', secondaryColor: '#111827', rating: 84, form: ['D', 'W', 'L', 'W', 'D'] },
      { id: 'en_tot', name: 'Tottenham', short: 'TOT', primaryColor: '#e2e8f0', secondaryColor: '#1e293b', rating: 85, form: ['W', 'L', 'W', 'W', 'L'] },
      { id: 'en_new', name: 'Newcastle', short: 'NEW', primaryColor: '#94a3b8', secondaryColor: '#0f172a', rating: 84, form: ['W', 'D', 'D', 'W', 'L'] },
      { id: 'en_avl', name: 'Aston Villa', short: 'AVL', primaryColor: '#9f1239', secondaryColor: '#38bdf8', rating: 85, form: ['W', 'W', 'L', 'D', 'W'] },
      { id: 'en_bha', name: 'Brighton', short: 'BHA', primaryColor: '#0ea5e9', secondaryColor: '#ffffff', rating: 81, form: ['D', 'D', 'W', 'L', 'W'] },
      { id: 'en_whu', name: 'West Ham', short: 'WHU', primaryColor: '#881337', secondaryColor: '#38bdf8', rating: 79, form: ['L', 'D', 'W', 'L', 'D'] },
      { id: 'en_ful', name: 'Fulham', short: 'FUL', primaryColor: '#f8fafc', secondaryColor: '#0f172a', rating: 79, form: ['D', 'W', 'L', 'D', 'W'] },
      { id: 'en_bre', name: 'Brentford', short: 'BRE', primaryColor: '#dc2626', secondaryColor: '#f8fafc', rating: 78, form: ['L', 'W', 'L', 'W', 'D'] },
    ],
  },
  {
    id: 'kenyan',
    name: 'FKF Premier League',
    shortLabel: 'Kenya',
    countryCode: 'KE',
    teams: [
      { id: 'ke_gor', name: 'Gor Mahia', short: 'GOR', primaryColor: '#16a34a', secondaryColor: '#ffffff', rating: 88, form: ['W', 'W', 'W', 'D', 'W'] },
      { id: 'ke_afc', name: 'AFC Leopards', short: 'AFC', primaryColor: '#2563eb', secondaryColor: '#ffffff', rating: 84, form: ['W', 'D', 'W', 'L', 'W'] },
      { id: 'ke_tus', name: 'Tusker FC', short: 'TUS', primaryColor: '#eab308', secondaryColor: '#0f172a', rating: 85, form: ['W', 'W', 'L', 'W', 'D'] },
      { id: 'ke_pol', name: 'Kenya Police', short: 'POL', primaryColor: '#dc2626', secondaryColor: '#1e3a8a', rating: 84, form: ['D', 'W', 'W', 'D', 'W'] },
      { id: 'ke_kcb', name: 'KCB FC', short: 'KCB', primaryColor: '#22c55e', secondaryColor: '#0f172a', rating: 82, form: ['W', 'D', 'L', 'W', 'D'] },
      { id: 'ke_ban', name: 'Bandari FC', short: 'BAN', primaryColor: '#0284c7', secondaryColor: '#ffffff', rating: 81, form: ['D', 'W', 'D', 'L', 'W'] },
      { id: 'ke_uli', name: 'Ulinzi Stars', short: 'ULI', primaryColor: '#b91c1c', secondaryColor: '#14532d', rating: 79, form: ['L', 'D', 'W', 'D', 'L'] },
      { id: 'ke_kak', name: 'KK Homeboyz', short: 'KKH', primaryColor: '#f59e0b', secondaryColor: '#15803d', rating: 80, form: ['W', 'L', 'D', 'W', 'L'] },
      { id: 'ke_shb', name: 'Shabana FC', short: 'SHB', primaryColor: '#e11d48', secondaryColor: '#ffffff', rating: 78, form: ['L', 'W', 'L', 'D', 'W'] },
      { id: 'ke_sof', name: 'Sofapaka', short: 'SOF', primaryColor: '#1d4ed8', secondaryColor: '#f8fafc', rating: 77, form: ['D', 'L', 'L', 'W', 'D'] },
      { id: 'ke_pos', name: 'Posta Rangers', short: 'POS', primaryColor: '#ea580c', secondaryColor: '#0f172a', rating: 78, form: ['W', 'D', 'L', 'L', 'D'] },
      { id: 'ke_mur', name: 'Muranga Seal', short: 'MUR', primaryColor: '#eab308', secondaryColor: '#1e293b', rating: 77, form: ['L', 'D', 'W', 'L', 'D'] },
    ],
  },
  {
    id: 'spanish',
    name: 'Spain LaLiga',
    shortLabel: 'Spain',
    countryCode: 'ES',
    teams: [
      { id: 'es_rma', name: 'Real Madrid', short: 'RMA', primaryColor: '#f8fafc', secondaryColor: '#eab308', rating: 92, form: ['W', 'W', 'W', 'D', 'W'] },
      { id: 'es_bar', name: 'Barcelona', short: 'BAR', primaryColor: '#1d4ed8', secondaryColor: '#b91c1c', rating: 91, form: ['W', 'W', 'L', 'W', 'W'] },
      { id: 'es_atm', name: 'Atletico Madrid', short: 'ATM', primaryColor: '#dc2626', secondaryColor: '#1e3a8a', rating: 87, form: ['W', 'D', 'W', 'W', 'D'] },
      { id: 'es_ath', name: 'Athletic Club', short: 'ATH', primaryColor: '#ef4444', secondaryColor: '#ffffff', rating: 84, form: ['D', 'W', 'W', 'L', 'W'] },
      { id: 'es_vil', name: 'Villarreal', short: 'VIL', primaryColor: '#facc15', secondaryColor: '#1e3a8a', rating: 83, form: ['W', 'L', 'D', 'W', 'W'] },
      { id: 'es_rso', name: 'Real Sociedad', short: 'RSO', primaryColor: '#2563eb', secondaryColor: '#ffffff', rating: 82, form: ['D', 'W', 'L', 'D', 'W'] },
      { id: 'es_bet', name: 'Real Betis', short: 'BET', primaryColor: '#16a34a', secondaryColor: '#ffffff', rating: 81, form: ['W', 'D', 'D', 'L', 'W'] },
      { id: 'es_sev', name: 'Sevilla', short: 'SEV', primaryColor: '#f8fafc', secondaryColor: '#dc2626', rating: 80, form: ['L', 'W', 'D', 'L', 'W'] },
      { id: 'es_gir', name: 'Girona', short: 'GIR', primaryColor: '#ef4444', secondaryColor: '#ffffff', rating: 80, form: ['L', 'D', 'W', 'L', 'D'] },
      { id: 'es_val', name: 'Valencia', short: 'VAL', primaryColor: '#f8fafc', secondaryColor: '#0f172a', rating: 78, form: ['D', 'L', 'D', 'W', 'L'] },
      { id: 'es_cel', name: 'Celta Vigo', short: 'CEL', primaryColor: '#38bdf8', secondaryColor: '#ffffff', rating: 78, form: ['W', 'L', 'L', 'D', 'W'] },
      { id: 'es_osa', name: 'Osasuna', short: 'OSA', primaryColor: '#991b1b', secondaryColor: '#1e3a8a', rating: 78, form: ['D', 'W', 'L', 'D', 'L'] },
    ],
  },
  {
    id: 'italian',
    name: 'Italy Serie A',
    shortLabel: 'Italy',
    countryCode: 'IT',
    teams: [
      { id: 'it_int', name: 'Inter Milan', short: 'INT', primaryColor: '#1d4ed8', secondaryColor: '#0f172a', rating: 90, form: ['W', 'W', 'D', 'W', 'W'] },
      { id: 'it_nap', name: 'Napoli', short: 'NAP', primaryColor: '#0ea5e9', secondaryColor: '#ffffff', rating: 88, form: ['W', 'W', 'W', 'L', 'D'] },
      { id: 'it_juv', name: 'Juventus', short: 'JUV', primaryColor: '#f8fafc', secondaryColor: '#0f172a', rating: 87, form: ['D', 'W', 'D', 'W', 'W'] },
      { id: 'it_mil', name: 'AC Milan', short: 'MIL', primaryColor: '#dc2626', secondaryColor: '#0f172a', rating: 86, form: ['W', 'L', 'W', 'D', 'W'] },
      { id: 'it_ata', name: 'Atalanta', short: 'ATA', primaryColor: '#1e40af', secondaryColor: '#0f172a', rating: 86, form: ['W', 'W', 'L', 'W', 'W'] },
      { id: 'it_laz', name: 'Lazio', short: 'LAZ', primaryColor: '#38bdf8', secondaryColor: '#ffffff', rating: 83, form: ['W', 'L', 'W', 'W', 'L'] },
      { id: 'it_fio', name: 'Fiorentina', short: 'FIO', primaryColor: '#7c3aed', secondaryColor: '#ffffff', rating: 83, form: ['W', 'D', 'W', 'L', 'W'] },
      { id: 'it_rom', name: 'AS Roma', short: 'ROM', primaryColor: '#991b1b', secondaryColor: '#f59e0b', rating: 82, form: ['L', 'D', 'W', 'L', 'D'] },
      { id: 'it_bol', name: 'Bologna', short: 'BOL', primaryColor: '#b91c1c', secondaryColor: '#1e3a8a', rating: 80, form: ['D', 'D', 'W', 'D', 'L'] },
      { id: 'it_tor', name: 'Torino', short: 'TOR', primaryColor: '#7f1d1d', secondaryColor: '#ffffff', rating: 79, form: ['L', 'W', 'L', 'D', 'L'] },
      { id: 'it_udi', name: 'Udinese', short: 'UDI', primaryColor: '#e2e8f0', secondaryColor: '#0f172a', rating: 78, form: ['W', 'L', 'L', 'W', 'D'] },
      { id: 'it_gen', name: 'Genoa', short: 'GEN', primaryColor: '#dc2626', secondaryColor: '#1e3a8a', rating: 76, form: ['L', 'D', 'L', 'D', 'W'] },
    ],
  },
];

const SCORER_POOL: Record<LeagueId, string[]> = {
  english: ['Haaland', 'Saka', 'Salah', 'Palmer', 'Isak', 'Watkins', 'B. Fernandes', 'Son', 'Mbeumo', 'Solanke', 'Bowen', 'Havertz'],
  kenyan: ['Omala', 'Odhiambo', 'Kapaito', 'Bajaber', 'Muchiri', 'M. Ochieng', 'K. Otieno', 'Muguna', 'Rupia', 'Juma'],
  spanish: ['Mbappe', 'Vinicius Jr', 'Lewandowski', 'Yamal', 'Griezmann', 'I. Williams', 'Sorloth', 'Ayoze', 'Isco', 'Budimir'],
  italian: ['Lautaro', 'Thuram', 'Lukaku', 'Vlahovic', 'Leao', 'Pulisic', 'Retegui', 'Lookman', 'Kean', 'Dybala'],
};

function clampOdd(v: number, min = 1.10, max = 18.0): number {
  return Math.max(min, Math.min(max, Math.round(v * 100) / 100));
}

function generateLeagueFixtures(leagueId: LeagueId, matchday: number): LigiFixture[] {
  const league = LEAGUES.find((l) => l.id === leagueId) || LEAGUES[0];
  const shuffled = [...league.teams].sort(
    (a, b) =>
      Math.sin(matchday * 19 + a.rating) -
      Math.cos(matchday * 29 + b.rating) +
      (Math.random() - 0.5) * 0.35
  );

  const scorers = SCORER_POOL[leagueId];
  const fixtures: LigiFixture[] = [];

  for (let i = 0; i < 6; i++) {
    const home = shuffled[i * 2];
    const away = shuffled[i * 2 + 1];
    const diff = (home.rating + 3 - away.rating) / 38;
    const p1 = Math.max(0.20, Math.min(0.68, 0.43 + diff));
    const pX = Math.max(0.19, Math.min(0.31, 0.27 - Math.abs(diff) * 0.14));
    const p2 = Math.max(0.13, 1 - p1 - pX);

    const overround = 1.065;
    const odd1 = clampOdd(1 / (p1 * overround), 1.24, 8.8);
    const oddX = clampOdd(1 / (pX * overround), 2.9, 5.5);
    const odd2 = clampOdd(1 / (p2 * overround), 1.30, 9.6);

    const odd1X = clampOdd(1 / ((p1 + pX) * 1.05), 1.10, 2.45);
    const odd12 = clampOdd(1 / ((p1 + p2) * 1.05), 1.14, 1.48);
    const oddX2 = clampOdd(1 / ((pX + p2) * 1.05), 1.12, 2.75);

    const probOver25 = Math.max(0.42, Math.min(0.65, 0.52 + (home.rating + away.rating - 166) * 0.006));
    const oddOver25 = clampOdd(1 / (probOver25 * 1.06), 1.54, 2.38);
    const oddUnder25 = clampOdd(1 / ((1 - probOver25) * 1.06), 1.54, 2.38);

    const oddOver15 = clampOdd(oddOver25 * 0.68, 1.18, 1.55);
    const oddUnder15 = clampOdd(oddUnder25 * 1.72, 2.35, 3.90);

    const probGG = Math.max(0.46, Math.min(0.65, 0.55));
    const oddGG = clampOdd(1 / (probGG * 1.06), 1.62, 2.18);
    const oddNG = clampOdd(1 / ((1 - probGG) * 1.06), 1.68, 2.25);

    const oddHT1 = clampOdd(odd1 * 1.45, 1.85, 9.5);
    const oddHTX = clampOdd(oddX * 0.68, 1.95, 2.65);
    const oddHT2 = clampOdd(odd2 * 1.45, 1.95, 10.5);

    const oddsCorrectScore = [
      { label: '1:0', h: 1, a: 0, odd: clampOdd(odd1 * 3.1, 5.2, 14.0) },
      { label: '2:0', h: 2, a: 0, odd: clampOdd(odd1 * 4.2, 6.8, 18.0) },
      { label: '2:1', h: 2, a: 1, odd: clampOdd(odd1 * 3.8, 7.2, 16.5) },
      { label: '0:0', h: 0, a: 0, odd: clampOdd(oddX * 2.5, 6.5, 13.0) },
      { label: '1:1', h: 1, a: 1, odd: clampOdd(oddX * 1.95, 5.4, 9.5) },
      { label: '0:1', h: 0, a: 1, odd: clampOdd(odd2 * 3.2, 5.8, 15.0) },
      { label: '0:2', h: 0, a: 2, odd: clampOdd(odd2 * 4.5, 7.5, 19.0) },
      { label: '1:2', h: 1, a: 2, odd: clampOdd(odd2 * 3.9, 7.5, 17.0) },
    ];

    const goalEvents: Array<{ minute: number; side: 'HOME' | 'AWAY'; scorer: string }> = [];
    const totalExpectedGoals = Math.floor(Math.random() * 4) + (Math.random() < 0.45 ? 1 : 0);
    for (let g = 0; g < totalExpectedGoals; g++) {
      const minute = Math.max(3, Math.min(89, Math.floor(Math.random() * 86) + 3));
      const side: 'HOME' | 'AWAY' = Math.random() < p1 / (p1 + p2) ? 'HOME' : 'AWAY';
      const scorer = scorers[Math.floor(Math.random() * scorers.length)];
      goalEvents.push({ minute, side, scorer });
    }
    goalEvents.sort((a, b) => a.minute - b.minute);

    fixtures.push({
      id: `lb_${leagueId}_md${matchday}_${i}`,
      matchNumber: i + 1,
      home,
      away,
      homeScore: 0,
      awayScore: 0,
      htHomeScore: 0,
      htAwayScore: 0,
      goalEvents,
      odds1X2: { '1': odd1, X: oddX, '2': odd2 },
      oddsDC: { '1X': odd1X, '12': odd12, X2: oddX2 },
      oddsOU25: { OVER: oddOver25, UNDER: oddUnder25 },
      oddsOU15: { OVER: oddOver15, UNDER: oddUnder15 },
      oddsBTTS: { GG: oddGG, NG: oddNG },
      oddsHT1X2: { '1': oddHT1, X: oddHTX, '2': oddHT2 },
      oddsCorrectScore,
    });
  }

  return fixtures;
}

function buildInitialStandings(leagueId: LeagueId): StandingsRow[] {
  const league = LEAGUES.find((l) => l.id === leagueId) || LEAGUES[0];
  return league.teams.map((t, idx) => {
    const won = Math.max(2, 9 - Math.floor(idx * 0.65));
    const drawn = 2 + (idx % 2);
    const lost = Math.max(1, 13 - won - drawn);
    return {
      teamId: t.id,
      name: t.name,
      short: t.short,
      color: t.primaryColor,
      played: 13,
      won,
      drawn,
      lost,
      gf: 25 - idx,
      ga: 9 + idx,
      pts: won * 3 + drawn,
      form: [...t.form],
    };
  });
}

export const LigiBigiGame: React.FC<LigiBigiGameProps> = ({
  user,
  wallet,
  onWalletUpdate,
  onOpenAuth,
  onOpenDeposit,
}) => {
  const [activeLeagueId, setActiveLeagueId] = useState<LeagueId>('english');
  const [seasonNumber] = useState<number>(142);
  const [matchday, setMatchday] = useState<number>(14);
  const [phase, setPhase] = useState<'BETTING' | 'LIVE' | 'RESULTS'>('BETTING');
  const [countdown, setCountdown] = useState<number>(30);
  const [simMinute, setSimMinute] = useState<number>(0);

  const [fixtures, setFixtures] = useState<LigiFixture[]>(() =>
    generateLeagueFixtures('english', 14)
  );
  const [featuredIdx, setFeaturedIdx] = useState<number>(0);
  const [activeMarketTab, setActiveMarketTab] = useState<MarketCategory>('1X2');
  const [activeViewTab, setActiveViewTab] = useState<'MATCHES' | 'STANDINGS' | 'RESULTS'>('MATCHES');
  const [expandedFixtureId, setExpandedFixtureId] = useState<string | null>(null);
  const [pastMatchdayResults, setPastMatchdayResults] = useState<
    Array<{
      matchday: number;
      leagueName: string;
      matches: Array<{ home: string; away: string; score: string; htScore: string }>;
    }>
  >([]);

  const [slip, setSlip] = useState<LigiSlipSelection[]>([]);
  const [stakeInput, setStakeInput] = useState<string>('50');
  const [tickets, setTickets] = useState<LigiSettledTicket[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [standingsByLeague, setStandingsByLeague] = useState<Record<LeagueId, StandingsRow[]>>(() => ({
    english: buildInitialStandings('english'),
    kenyan: buildInitialStandings('kenyan'),
    spanish: buildInitialStandings('spanish'),
    italian: buildInitialStandings('italian'),
  }));

  const pitchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const walletRef = useRef<Wallet | null>(wallet);
  walletRef.current = wallet;
  const userRef = useRef<UserProfile | null>(user);
  userRef.current = user;

  const activeLeague = LEAGUES.find((l) => l.id === activeLeagueId) || LEAGUES[0];
  const currentStandings = standingsByLeague[activeLeagueId] || [];

  const handleSelectLeague = (newLeagueId: LeagueId) => {
    if (phase === 'LIVE') return;
    setActiveLeagueId(newLeagueId);
    setFixtures(generateLeagueFixtures(newLeagueId, matchday));
    setFeaturedIdx(0);
    setExpandedFixtureId(null);
  };

  // Continuous Matchday Timer Loop
  useEffect(() => {
    const timer = setInterval(() => {
      if (phase === 'BETTING') {
        setCountdown((prev) => {
          if (prev <= 1) {
            setPhase('LIVE');
            setSimMinute(1);
            return 0;
          }
          return prev - 1;
        });
      } else if (phase === 'LIVE') {
        setSimMinute((prev) => {
          const nextMin = prev + 3;
          if (nextMin >= 90) {
            setPhase('RESULTS');
            setCountdown(8);
            return 90;
          }
          return nextMin;
        });
      } else if (phase === 'RESULTS') {
        setCountdown((prev) => {
          if (prev <= 1) {
            const nextMd = matchday >= 38 ? 1 : matchday + 1;
            setMatchday(nextMd);
            setFixtures(generateLeagueFixtures(activeLeagueId, nextMd));
            setSimMinute(0);
            setFeaturedIdx(0);
            setExpandedFixtureId(null);
            setPhase('BETTING');
            return 30;
          }
          return prev - 1;
        });
      }
    }, 350);

    return () => clearInterval(timer);
  }, [phase, matchday, activeLeagueId]);

  // Update scores dynamically as simMinute progresses
  useEffect(() => {
    if (phase !== 'LIVE' && phase !== 'RESULTS') return;
    setFixtures((prev) =>
      prev.map((f) => {
        let h = 0;
        let a = 0;
        let htH = 0;
        let htA = 0;
        for (const ev of f.goalEvents) {
          if (ev.minute <= simMinute) {
            if (ev.side === 'HOME') h++;
            else a++;
          }
          if (ev.minute <= 45 && ev.minute <= simMinute) {
            if (ev.side === 'HOME') htH++;
            else htA++;
          }
        }
        return {
          ...f,
          homeScore: h,
          awayScore: a,
          htHomeScore: htH,
          htAwayScore: htA,
        };
      })
    );
  }, [simMinute, phase]);

  // Settle tickets, archive matchday results, and update standings at Full Time
  useEffect(() => {
    if (phase !== 'RESULTS') return;

    // Save completed matchday results
    setPastMatchdayResults((prev) => [
      {
        matchday,
        leagueName: activeLeague.name,
        matches: fixtures.map((f) => ({
          home: f.home.name,
          away: f.away.name,
          score: `${f.homeScore} - ${f.awayScore}`,
          htScore: `${f.htHomeScore}-${f.htAwayScore}`,
        })),
      },
      ...prev.slice(0, 9),
    ]);

    // Update league standings
    setStandingsByLeague((prev) => {
      const currentRows = prev[activeLeagueId] || [];
      const map = new Map<string, StandingsRow>(currentRows.map((r) => [r.teamId, { ...r, form: [...r.form] }]));

      for (const f of fixtures) {
        const hRow = map.get(f.home.id);
        const aRow = map.get(f.away.id);
        if (hRow && aRow) {
          hRow.played += 1;
          aRow.played += 1;
          hRow.gf += f.homeScore;
          hRow.ga += f.awayScore;
          aRow.gf += f.awayScore;
          aRow.ga += f.homeScore;
          if (f.homeScore > f.awayScore) {
            hRow.won += 1;
            hRow.pts += 3;
            aRow.lost += 1;
            hRow.form = ['W', ...hRow.form.slice(0, 4)];
            aRow.form = ['L', ...aRow.form.slice(0, 4)];
          } else if (f.homeScore < f.awayScore) {
            aRow.won += 1;
            aRow.pts += 3;
            hRow.lost += 1;
            aRow.form = ['W', ...aRow.form.slice(0, 4)];
            hRow.form = ['L', ...hRow.form.slice(0, 4)];
          } else {
            hRow.drawn += 1;
            aRow.drawn += 1;
            hRow.pts += 1;
            aRow.pts += 1;
            hRow.form = ['D', ...hRow.form.slice(0, 4)];
            aRow.form = ['D', ...aRow.form.slice(0, 4)];
          }
        }
      }

      const sorted = Array.from(map.values()).sort(
        (a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga)
      );
      return {
        ...prev,
        [activeLeagueId]: sorted,
      };
    });

    // Grade open tickets
    setTickets((prev) => {
      let totalWonCents = 0;
      const updated = prev.map((tkt) => {
        if (tkt.status !== 'OPEN' || tkt.matchday !== matchday) return tkt;

        const gradedSelections = tkt.selections.map((sel) => {
          const fx = fixtures.find((f) => f.id === sel.fixtureId);
          if (!fx) return { ...sel, finalScore: '0-0', won: false };

          const h = fx.homeScore;
          const a = fx.awayScore;
          const htH = fx.htHomeScore;
          const htA = fx.htAwayScore;
          let won = false;

          if (sel.market === '1X2') {
            if (sel.pick === '1' && h > a) won = true;
            if (sel.pick === 'X' && h === a) won = true;
            if (sel.pick === '2' && a > h) won = true;
          } else if (sel.market === 'DC') {
            if (sel.pick === '1X' && h >= a) won = true;
            if (sel.pick === '12' && h !== a) won = true;
            if (sel.pick === 'X2' && a >= h) won = true;
          } else if (sel.market === 'O/U 2.5') {
            if (sel.pick === 'Over 2.5' && h + a >= 3) won = true;
            if (sel.pick === 'Under 2.5' && h + a <= 2) won = true;
          } else if (sel.market === 'O/U 1.5') {
            if (sel.pick === 'Over 1.5' && h + a >= 2) won = true;
            if (sel.pick === 'Under 1.5' && h + a <= 1) won = true;
          } else if (sel.market === 'GG/NG') {
            if (sel.pick === 'GG' && h > 0 && a > 0) won = true;
            if (sel.pick === 'NG' && (h === 0 || a === 0)) won = true;
          } else if (sel.market === 'HT 1X2') {
            if (sel.pick === 'HT 1' && htH > htA) won = true;
            if (sel.pick === 'HT X' && htH === htA) won = true;
            if (sel.pick === 'HT 2' && htA > htH) won = true;
          } else if (sel.market === 'CS') {
            if (sel.pick === `${h}:${a}`) won = true;
          }

          return {
            ...sel,
            finalScore: `${h}-${a}`,
            won,
          };
        });

        const allWon = gradedSelections.every((s) => s.won);
        if (allWon) {
          totalWonCents += tkt.potentialPayoutCents;
        }

        return {
          ...tkt,
          status: (allWon ? 'WON' : 'LOST') as 'WON' | 'LOST',
          payoutCents: allWon ? tkt.potentialPayoutCents : 0,
          selections: gradedSelections,
        };
      });

      if (totalWonCents > 0 && walletRef.current && userRef.current) {
        const wonKes = centsToKes(totalWonCents);
        const newBal = Number((walletRef.current.balanceKes + wonKes).toFixed(2));
        onWalletUpdate(newBal);
        if (supabase) {
          supabase
            .from('wallets')
            .update({ balance_kes: newBal, updated_at: new Date().toISOString() })
            .eq('user_id', userRef.current.id)
            .then(() => {});
        }
        setFeedback({
          type: 'success',
          text: `Matchday ${matchday} WON! ${formatCentsToKes(totalWonCents)} credited to your wallet!`,
        });
      }

      return updated;
    });
  }, [phase]);

  // 2D Broadcast Pitch Canvas Animation
  const featuredMatch = fixtures[featuredIdx] || fixtures[0];

  useEffect(() => {
    const canvas = pitchCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const renderPitch = () => {
      t += 0.04;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (
        canvas.width !== Math.floor(rect.width * dpr) ||
        canvas.height !== Math.floor(rect.height * dpr)
      ) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }
      ctx.save();
      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;

      // Rich turf stripes
      const numStripes = 12;
      const stripeW = w / numStripes;
      for (let i = 0; i < numStripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#114224' : '#15522d';
        ctx.fillRect(i * stripeW, 0, stripeW, h);
      }

      // Outer pitch lines
      ctx.strokeStyle = 'rgba(255,255,255,0.42)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(14, 12, w - 28, h - 24);

      // Halfway line & center circle
      ctx.beginPath();
      ctx.moveTo(w / 2, 12);
      ctx.lineTo(w / 2, h - 12);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 24, 0, Math.PI * 2);
      ctx.stroke();

      // Penalty boxes
      ctx.strokeRect(14, h * 0.23, 44, h * 0.54);
      ctx.strokeRect(w - 58, h * 0.23, 44, h * 0.54);

      const isLiveSim = phase === 'LIVE';
      const ballX = isLiveSim ? w * 0.5 + Math.sin(t * 1.7) * (w * 0.35) : w * 0.5;
      const ballY = isLiveSim ? h * 0.5 + Math.cos(t * 2.2) * (h * 0.28) : h * 0.5;

      // Home formation
      const homePositions = [
        [0.08, 0.5],
        [0.22, 0.26],
        [0.22, 0.74],
        [0.38, 0.35],
        [0.43, 0.55],
        [0.37, 0.78],
      ];
      for (let i = 0; i < homePositions.length; i++) {
        const px = w * homePositions[i][0] + (isLiveSim && i > 0 ? Math.sin(t + i) * 16 : 0);
        const py = h * homePositions[i][1] + (isLiveSim && i > 0 ? Math.cos(t * 1.2 + i) * 11 : 0);
        ctx.beginPath();
        ctx.arc(px, py, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = featuredMatch.home.primaryColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Away formation
      const awayPositions = [
        [0.92, 0.5],
        [0.78, 0.26],
        [0.78, 0.74],
        [0.62, 0.32],
        [0.57, 0.5],
        [0.62, 0.75],
      ];
      for (let i = 0; i < awayPositions.length; i++) {
        const px = w * awayPositions[i][0] + (isLiveSim && i > 0 ? Math.cos(t + i) * 16 : 0);
        const py = h * awayPositions[i][1] + (isLiveSim && i > 0 ? Math.sin(t * 1.3 + i) * 11 : 0);
        ctx.beginPath();
        ctx.arc(px, py, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = featuredMatch.away.primaryColor;
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Ball
      ctx.beginPath();
      ctx.arc(ballX, ballY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
      animId = requestAnimationFrame(renderPitch);
    };

    animId = requestAnimationFrame(renderPitch);
    return () => cancelAnimationFrame(animId);
  }, [featuredMatch, phase]);

  const toggleSelection = (sel: LigiSlipSelection) => {
    if (phase !== 'BETTING') return;
    setSlip((prev) => {
      const exists = prev.some((s) => s.selectionId === sel.selectionId);
      if (exists) return prev.filter((s) => s.selectionId !== sel.selectionId);
      const withoutSameFixture = prev.filter((s) => s.fixtureId !== sel.fixtureId);
      return [...withoutSameFixture, sel];
    });
  };

  const stakeValidation = parseAndValidateKesInput(
    stakeInput,
    LM_MIN_STAKE_CENTS,
    LM_MAX_STAKE_CENTS
  );
  const validStakeCents =
    stakeValidation.valid && stakeValidation.stakeCents ? stakeValidation.stakeCents : 0;
  const previewStakeCents =
    validStakeCents > 0 ? validStakeCents : parsePreviewStakeCents(stakeInput);
  const totalOdds = computeCombinedOdds(slip.map((s) => s.odds));
  const payoutBreakdown = computeTicketPayoutBreakdown(
    previewStakeCents,
    slip.map((s) => s.odds)
  );

  const handlePlaceBet = async (instantKickoff = false) => {
    setFeedback(null);
    if (!user) {
      onOpenAuth();
      return;
    }
    if (slip.length === 0) {
      setFeedback({ type: 'error', text: 'Select at least one match odd to place a bet.' });
      return;
    }
    if (!stakeValidation.valid || !stakeValidation.stakeCents) {
      setFeedback({
        type: 'error',
        text: stakeValidation.message || 'Minimum stake is 10.00 KES.',
      });
      return;
    }

    const walletCents = kesToCents(wallet?.balanceKes ?? 0);
    if (stakeValidation.stakeCents > walletCents) {
      onOpenDeposit();
      return;
    }

    const stakeKes = centsToKes(stakeValidation.stakeCents);
    const newBalanceKes = Number(((wallet?.balanceKes ?? 0) - stakeKes).toFixed(2));
    onWalletUpdate(newBalanceKes);

    if (supabase) {
      supabase
        .from('wallets')
        .update({ balance_kes: newBalanceKes, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .then(() => {});
    }

    const newTicket: LigiSettledTicket = {
      id: `lb_tkt_${Date.now()}`,
      ticketCode: `LGB-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      leagueName: activeLeague.shortLabel,
      matchday,
      stakeCents: stakeValidation.stakeCents,
      totalOdds,
      potentialPayoutCents: payoutBreakdown.totalPayoutCents,
      payoutCents: 0,
      status: 'OPEN',
      selections: [...slip],
      createdAt: new Date().toISOString(),
    };

    setTickets((prev) => [newTicket, ...prev]);
    setSlip([]);
    setFeedback({
      type: 'success',
      text: `LigiBigi Ticket ${newTicket.ticketCode} placed! Possible Win: ${formatCentsToKes(
        newTicket.potentialPayoutCents
      )}`,
    });

    if (instantKickoff && phase === 'BETTING') {
      setPhase('LIVE');
      setSimMinute(1);
    }
  };

  // Column labels for the active market tab
  const marketColumnLabels =
    activeMarketTab === '1X2'
      ? ['1', 'X', '2']
      : activeMarketTab === 'DC'
      ? ['1X', '12', 'X2']
      : activeMarketTab === 'O/U 2.5'
      ? ['Over 2.5', 'Under 2.5']
      : ['GG (Yes)', 'NG (No)'];

  const formattedCountdown = `00:${String(countdown).padStart(2, '0')}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* LEFT / MAIN BETIKA LIGIBIGI STAGE (8 cols) */}
      <div className="lg:col-span-8 flex flex-col gap-3">
        {/* 1. Betika LigiBigi Top Brand & League Navigation Bar */}
        <div className="bg-[#151e27] border border-[#222e3a] rounded-xl overflow-hidden shadow-xl">
          <div className="bg-[#0b1117] px-3.5 sm:px-4 py-2.5 border-b border-[#222e3a] flex flex-wrap items-center justify-between gap-3">
            {/* Official LigiBigi Wordmark & Season Info */}
            <div className="flex items-center gap-3">
              <div className="flex items-center tracking-tight font-black text-base sm:text-lg">
                <span className="text-white">LIGI</span>
                <span className="text-[#39b54a]">BIGI</span>
              </div>
              <span className="text-slate-600">|</span>
              <span className="text-xs font-semibold text-slate-300">
                Season {seasonNumber} &middot; Week {matchday}/38
              </span>
            </div>

            {/* Digital Timer & Instant Kickoff */}
            <div className="flex items-center gap-2">
              {phase === 'BETTING' ? (
                <>
                  <div className="flex items-center gap-1.5 bg-[#151e27] border border-[#2a3846] px-2.5 py-1 rounded-md">
                    <Clock className="w-3.5 h-3.5 text-[#39b54a]" />
                    <span className="font-mono font-extrabold text-xs text-white tabular-nums">
                      {formattedCountdown}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPhase('LIVE');
                      setSimMinute(1);
                    }}
                    className="px-3 py-1 rounded-md bg-[#39b54a] hover:bg-[#2ea03e] text-white font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <FastForward className="w-3.5 h-3.5" />
                    <span>Kickoff</span>
                  </button>
                </>
              ) : phase === 'LIVE' ? (
                <div className="px-3 py-1 rounded-md bg-rose-600 text-white font-mono font-bold text-xs flex items-center gap-1.5 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-white" />
                  <span>LIVE {simMinute}&apos;</span>
                </div>
              ) : (
                <div className="px-3 py-1 rounded-md bg-[#1e293b] border border-emerald-500/40 text-emerald-400 font-mono font-bold text-xs">
                  FT &middot; Next Week {formattedCountdown}
                </div>
              )}
            </div>
          </div>

          {/* League Competition Selector Tabs (England, Kenya, Spain, Italy) */}
          <div className="bg-[#111820] px-3 py-2 border-b border-[#222e3a] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {LEAGUES.map((lg) => {
              const isActive = lg.id === activeLeagueId;
              return (
                <button
                  key={lg.id}
                  type="button"
                  disabled={phase === 'LIVE'}
                  onClick={() => handleSelectLeague(lg.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-[#39b54a] text-white shadow-sm'
                      : 'bg-[#18222c] text-[#8c9aa6] hover:text-white border border-[#222e3a]'
                  }`}
                >
                  <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-black/25">
                    {lg.countryCode}
                  </span>
                  <span>{lg.name}</span>
                </button>
              );
            })}
          </div>

          {/* Broadcast Pitch & Simultaneous Live Scoreboard */}
          <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch bg-[#111921]">
            <div className="md:col-span-7 flex flex-col justify-between relative min-h-[168px] sm:min-h-[184px] rounded-lg overflow-hidden border border-[#243240]">
              <canvas ref={pitchCanvasRef} className="w-full h-full absolute inset-0 block" />

              {/* Top Broadcast Scoreboard Overlay */}
              <div className="relative z-10 m-2.5 flex items-center justify-between bg-[#0b1117]/90 backdrop-blur-sm px-3 py-1.5 rounded-md border border-white/10 text-xs">
                <div className="flex items-center gap-2 min-w-0 w-[40%]">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: featuredMatch.home.primaryColor }}
                  />
                  <span className="font-bold text-white truncate">
                    {featuredMatch.home.name}
                  </span>
                </div>

                <div className="px-2.5 py-0.5 rounded bg-[#18222c] font-mono font-extrabold text-amber-400 text-xs shrink-0">
                  {phase === 'BETTING'
                    ? 'VS'
                    : `${featuredMatch.homeScore} - ${featuredMatch.awayScore}`}
                </div>

                <div className="flex items-center justify-end gap-2 min-w-0 w-[40%]">
                  <span className="font-bold text-white truncate text-right">
                    {featuredMatch.away.name}
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: featuredMatch.away.primaryColor }}
                  />
                </div>
              </div>

              {/* Bottom Goal Scorer Ticker inside Pitch */}
              <div className="relative z-10 m-2.5 bg-[#0b1117]/85 px-3 py-1 rounded text-[11px] text-slate-300 flex items-center justify-between">
                <span className="font-semibold text-[#39b54a]">
                  {activeLeague.name} &middot; Match #{featuredMatch.matchNumber}
                </span>
                <span className="font-mono text-slate-300 truncate max-w-[60%]">
                  {phase === 'BETTING'
                    ? 'Awaiting Kickoff'
                    : featuredMatch.goalEvents
                        .filter((ev) => ev.minute <= simMinute)
                        .map((ev) => `${ev.minute}' ${ev.scorer}`)
                        .join(', ') || 'No goals yet'}
                </span>
              </div>
            </div>

            {/* Simultaneous Week Scoreboard (6 Matches) */}
            <div className="md:col-span-5 flex flex-col justify-between bg-[#0e151c] border border-[#222e3a] rounded-lg p-2.5">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#8c9aa6] pb-1.5 border-b border-[#1e2936]">
                <span>Week {matchday} Live Scores</span>
                <span className="font-mono text-[#39b54a]">
                  {phase === 'BETTING' ? 'PRE-MATCH' : phase === 'LIVE' ? `${simMinute}'` : 'FT'}
                </span>
              </div>

              <div className="flex flex-col gap-1 my-1">
                {fixtures.map((fx, i) => (
                  <button
                    key={fx.id}
                    type="button"
                    onClick={() => setFeaturedIdx(i)}
                    className={`px-2.5 py-1.5 rounded text-xs flex items-center justify-between transition-colors cursor-pointer border ${
                      featuredIdx === i
                        ? 'bg-[#1c2834] border-[#39b54a]/60 text-white'
                        : 'bg-[#131c26] border-transparent text-slate-300 hover:bg-[#19242f]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 w-[40%]">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: fx.home.primaryColor }}
                      />
                      <span className="font-bold truncate">{fx.home.short}</span>
                    </div>
                    <span className="font-mono font-bold text-amber-400 text-xs">
                      {phase === 'BETTING' ? 'vs' : `${fx.homeScore} : ${fx.awayScore}`}
                    </span>
                    <div className="flex items-center justify-end gap-1.5 w-[40%]">
                      <span className="font-bold truncate">{fx.away.short}</span>
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: fx.away.primaryColor }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Main Betika LigiBigi View Switcher & Market Filter Bar */}
        <div className="bg-[#151e27] border border-[#202b37] rounded-xl overflow-hidden shadow-xl">
          {/* Primary Section Tabs: Matches | Standings | Results */}
          <div className="bg-[#0b1117] px-3.5 pt-2.5 border-b border-[#202b37] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-5">
              {(
                [
                  { id: 'MATCHES', label: `Week ${matchday} Matches` },
                  { id: 'STANDINGS', label: 'Table Standings' },
                  { id: 'RESULTS', label: 'Results' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveViewTab(tab.id)}
                  className={`pb-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                    activeViewTab === tab.id
                      ? 'border-[#39b54a] text-[#39b54a]'
                      : 'border-transparent text-[#8c9aa6] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeViewTab === 'MATCHES' && (
              <div className="flex items-center gap-1 pb-2">
                {(['1X2', 'DC', 'O/U 2.5', 'GG/NG'] as const).map((mkt) => (
                  <button
                    key={mkt}
                    type="button"
                    onClick={() => setActiveMarketTab(mkt)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                      activeMarketTab === mkt
                        ? 'bg-[#39b54a] text-white'
                        : 'bg-[#18222c] text-[#8c9aa6] hover:text-white border border-[#222e3a]'
                    }`}
                  >
                    {mkt}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* VIEW 1: WEEK MATCHES & ODDS TABLE */}
          {activeViewTab === 'MATCHES' && (
            <>
              {/* Column Header Row (Aligned with Betika Odds Pills) */}
              <div className="px-3.5 sm:px-4 py-2 bg-[#10171f] border-b border-[#202b37] flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#8c9aa6]">
                <div className="w-[42%] sm:w-[44%]">Clubs / Form</div>
                <div className="w-[58%] sm:w-[56%] flex items-center gap-2">
                  <div
                    className={`flex-1 grid gap-1.5 text-center ${
                      marketColumnLabels.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
                    }`}
                  >
                    {marketColumnLabels.map((lbl) => (
                      <span key={lbl}>{lbl}</span>
                    ))}
                  </div>
                  <div className="w-12 text-right">+Mkts</div>
                </div>
              </div>

              {/* Fixtures List */}
              <div className="divide-y divide-[#202b37]">
                {fixtures.map((fx) => {
                  const isExpanded = expandedFixtureId === fx.id;
                  const options =
                    activeMarketTab === '1X2'
                      ? [
                          { pick: '1', odd: fx.odds1X2['1'] },
                          { pick: 'X', odd: fx.odds1X2.X },
                          { pick: '2', odd: fx.odds1X2['2'] },
                        ]
                      : activeMarketTab === 'DC'
                      ? [
                          { pick: '1X', odd: fx.oddsDC['1X'] },
                          { pick: '12', odd: fx.oddsDC['12'] },
                          { pick: 'X2', odd: fx.oddsDC.X2 },
                        ]
                      : activeMarketTab === 'O/U 2.5'
                      ? [
                          { pick: 'Over 2.5', odd: fx.oddsOU25.OVER },
                          { pick: 'Under 2.5', odd: fx.oddsOU25.UNDER },
                        ]
                      : [
                          { pick: 'GG', odd: fx.oddsBTTS.GG },
                          { pick: 'NG', odd: fx.oddsBTTS.NG },
                        ];

                  return (
                    <div key={fx.id} className="transition-colors hover:bg-[#18222c]">
                      <div className="px-3.5 sm:px-4 py-3 flex flex-col gap-1.5">
                        {/* Top Metadata Line */}
                        <div className="flex items-center justify-between text-[11px] text-[#8c9aa6]">
                          <span>
                            {activeLeague.name} &middot; Week {matchday}
                          </span>
                          <span className="font-mono">
                            {phase === 'BETTING'
                              ? `Kickoff ${formattedCountdown}`
                              : phase === 'LIVE'
                              ? `LIVE ${simMinute}'`
                              : `FT (${fx.htHomeScore}-${fx.htAwayScore})`}
                          </span>
                        </div>

                        {/* Teams & Odds Row */}
                        <div className="flex items-center justify-between gap-2">
                          {/* Left: Home & Away Teams with Jersey Dot & Form */}
                          <div className="w-[42%] sm:w-[44%] flex flex-col gap-1 pr-1">
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                                  style={{ backgroundColor: fx.home.primaryColor }}
                                />
                                <span className="text-[14px] sm:text-[15px] font-semibold text-white truncate">
                                  {fx.home.name}
                                </span>
                              </div>
                              {phase !== 'BETTING' ? (
                                <span className="font-mono font-bold text-sm text-[#39b54a]">
                                  {fx.homeScore}
                                </span>
                              ) : (
                                <div className="hidden sm:flex items-center gap-0.5 shrink-0">
                                  {fx.home.form.slice(0, 3).map((res, idx) => (
                                    <span
                                      key={idx}
                                      className={`w-3.5 h-3.5 rounded-[2px] text-[9px] font-bold flex items-center justify-center ${
                                        res === 'W'
                                          ? 'bg-[#39b54a]/25 text-[#4ade80]'
                                          : res === 'D'
                                          ? 'bg-slate-700 text-slate-300'
                                          : 'bg-rose-500/25 text-rose-400'
                                      }`}
                                    >
                                      {res}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                                  style={{ backgroundColor: fx.away.primaryColor }}
                                />
                                <span className="text-[14px] sm:text-[15px] font-semibold text-white truncate">
                                  {fx.away.name}
                                </span>
                              </div>
                              {phase !== 'BETTING' ? (
                                <span className="font-mono font-bold text-sm text-[#39b54a]">
                                  {fx.awayScore}
                                </span>
                              ) : (
                                <div className="hidden sm:flex items-center gap-0.5 shrink-0">
                                  {fx.away.form.slice(0, 3).map((res, idx) => (
                                    <span
                                      key={idx}
                                      className={`w-3.5 h-3.5 rounded-[2px] text-[9px] font-bold flex items-center justify-center ${
                                        res === 'W'
                                          ? 'bg-[#39b54a]/25 text-[#4ade80]'
                                          : res === 'D'
                                          ? 'bg-slate-700 text-slate-300'
                                          : 'bg-rose-500/25 text-rose-400'
                                      }`}
                                    >
                                      {res}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right: Betika Dark Pill Odds + More Markets Toggle */}
                          <div className="w-[58%] sm:w-[56%] flex items-center gap-1.5">
                            <div
                              className={`flex-1 grid gap-1.5 ${
                                options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
                              }`}
                            >
                              {options.map((opt) => {
                                const selId = `${fx.id}:${activeMarketTab}:${opt.pick}`;
                                const isSelected = slip.some((s) => s.selectionId === selId);
                                const disabled = phase !== 'BETTING';

                                return (
                                  <button
                                    key={selId}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() =>
                                      toggleSelection({
                                        selectionId: selId,
                                        fixtureId: fx.id,
                                        homeName: fx.home.name,
                                        awayName: fx.away.name,
                                        market: activeMarketTab,
                                        pick: opt.pick,
                                        odds: opt.odd,
                                      })
                                    }
                                    className={`h-[40px] rounded-full flex items-center justify-center font-semibold text-[14px] sm:text-[15px] tabular-nums transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-[#39b54a] text-slate-950 font-bold shadow-md'
                                        : disabled
                                        ? 'bg-[#1c252e] text-slate-500 cursor-not-allowed'
                                        : 'bg-[#242e38] hover:bg-[#2d3946] text-white'
                                    }`}
                                  >
                                    {opt.odd.toFixed(2)}
                                  </button>
                                );
                              })}
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setExpandedFixtureId(isExpanded ? null : fx.id)
                              }
                              className={`w-12 h-[40px] rounded-full text-xs font-bold flex items-center justify-center gap-0.5 transition-colors cursor-pointer shrink-0 ${
                                isExpanded
                                  ? 'bg-[#39b54a]/20 text-[#39b54a] border border-[#39b54a]/40'
                                  : 'bg-[#1c252e] hover:bg-[#242e38] text-[#39b54a]'
                              }`}
                            >
                              <span>+13</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expandable Additional LigiBigi Markets (Half-Time 1X2, O/U 1.5, Correct Score) */}
                      {isExpanded && (
                        <div className="px-3.5 sm:px-4 pb-3.5 pt-2 bg-[#0e151c] border-t border-[#202b37] flex flex-col gap-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Half-Time 1X2 */}
                            <div>
                              <div className="text-[11px] font-bold uppercase text-[#8c9aa6] mb-1.5">
                                Half-Time 1X2
                              </div>
                              <div className="grid grid-cols-3 gap-1.5">
                                {[
                                  { pick: 'HT 1', odd: fx.oddsHT1X2['1'] },
                                  { pick: 'HT X', odd: fx.oddsHT1X2.X },
                                  { pick: 'HT 2', odd: fx.oddsHT1X2['2'] },
                                ].map((item) => {
                                  const selId = `${fx.id}:HT 1X2:${item.pick}`;
                                  const isSelected = slip.some((s) => s.selectionId === selId);
                                  return (
                                    <button
                                      key={selId}
                                      type="button"
                                      disabled={phase !== 'BETTING'}
                                      onClick={() =>
                                        toggleSelection({
                                          selectionId: selId,
                                          fixtureId: fx.id,
                                          homeName: fx.home.name,
                                          awayName: fx.away.name,
                                          market: 'HT 1X2',
                                          pick: item.pick,
                                          odds: item.odd,
                                        })
                                      }
                                      className={`py-2 px-2 rounded-lg text-xs flex items-center justify-between cursor-pointer ${
                                        isSelected
                                          ? 'bg-[#39b54a] text-slate-950 font-bold'
                                          : 'bg-[#1a242e] hover:bg-[#242e38] text-white'
                                      }`}
                                    >
                                      <span className="opacity-75">{item.pick}</span>
                                      <span className="font-mono font-bold">
                                        {item.odd.toFixed(2)}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Over / Under 1.5 Goals */}
                            <div>
                              <div className="text-[11px] font-bold uppercase text-[#8c9aa6] mb-1.5">
                                Goals Over / Under 1.5
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                {[
                                  { pick: 'Over 1.5', odd: fx.oddsOU15.OVER },
                                  { pick: 'Under 1.5', odd: fx.oddsOU15.UNDER },
                                ].map((item) => {
                                  const selId = `${fx.id}:O/U 1.5:${item.pick}`;
                                  const isSelected = slip.some((s) => s.selectionId === selId);
                                  return (
                                    <button
                                      key={selId}
                                      type="button"
                                      disabled={phase !== 'BETTING'}
                                      onClick={() =>
                                        toggleSelection({
                                          selectionId: selId,
                                          fixtureId: fx.id,
                                          homeName: fx.home.name,
                                          awayName: fx.away.name,
                                          market: 'O/U 1.5',
                                          pick: item.pick,
                                          odds: item.odd,
                                        })
                                      }
                                      className={`py-2 px-2.5 rounded-lg text-xs flex items-center justify-between cursor-pointer ${
                                        isSelected
                                          ? 'bg-[#39b54a] text-slate-950 font-bold'
                                          : 'bg-[#1a242e] hover:bg-[#242e38] text-white'
                                      }`}
                                    >
                                      <span className="opacity-75">{item.pick}</span>
                                      <span className="font-mono font-bold">
                                        {item.odd.toFixed(2)}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Correct Score Grid */}
                          <div>
                            <div className="text-[11px] font-bold uppercase text-[#8c9aa6] mb-1.5">
                              Correct Score
                            </div>
                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                              {fx.oddsCorrectScore.map((cs) => {
                                const selId = `${fx.id}:CS:${cs.label}`;
                                const isSelected = slip.some((s) => s.selectionId === selId);
                                return (
                                  <button
                                    key={selId}
                                    type="button"
                                    disabled={phase !== 'BETTING'}
                                    onClick={() =>
                                      toggleSelection({
                                        selectionId: selId,
                                        fixtureId: fx.id,
                                        homeName: fx.home.name,
                                        awayName: fx.away.name,
                                        market: 'CS',
                                        pick: cs.label,
                                        odds: cs.odd,
                                      })
                                    }
                                    className={`py-1.5 px-1.5 rounded-lg text-center cursor-pointer flex flex-col items-center ${
                                      isSelected
                                        ? 'bg-[#39b54a] text-slate-950 font-bold'
                                        : 'bg-[#1a242e] hover:bg-[#242e38] text-white'
                                    }`}
                                  >
                                    <span className="text-[10px] opacity-75">{cs.label}</span>
                                    <span className="font-mono font-bold text-xs">
                                      {cs.odd.toFixed(2)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* VIEW 2: FULL LEAGUE TABLE STANDINGS */}
          {activeViewTab === 'STANDINGS' && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#10171f] text-[#8c9aa6] uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Club</th>
                    <th className="py-2.5 px-2 text-center">P</th>
                    <th className="py-2.5 px-2 text-center">W</th>
                    <th className="py-2.5 px-2 text-center">D</th>
                    <th className="py-2.5 px-2 text-center">L</th>
                    <th className="py-2.5 px-2 text-center">GD</th>
                    <th className="py-2.5 px-2 text-center">Form</th>
                    <th className="py-2.5 px-3 text-right">PTS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#202b37]">
                  {currentStandings.map((row, idx) => (
                    <tr key={row.teamId} className="hover:bg-[#19242f]">
                      <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-white flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: row.color }}
                        />
                        <span>{row.name}</span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-300">
                        {row.played}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-300">
                        {row.won}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-300">
                        {row.drawn}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-300">
                        {row.lost}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-300">
                        {row.gf - row.ga >= 0 ? `+${row.gf - row.ga}` : row.gf - row.ga}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center justify-center gap-0.5">
                          {row.form.slice(0, 5).map((res, fIdx) => (
                            <span
                              key={fIdx}
                              className={`w-3.5 h-3.5 rounded-[2px] text-[9px] font-bold flex items-center justify-center ${
                                res === 'W'
                                  ? 'bg-[#39b54a]/25 text-[#4ade80]'
                                  : res === 'D'
                                  ? 'bg-slate-700 text-slate-300'
                                  : 'bg-rose-500/25 text-rose-400'
                              }`}
                            >
                              {res}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-extrabold text-[#39b54a]">
                        {row.pts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* VIEW 3: PAST WEEK RESULTS */}
          {activeViewTab === 'RESULTS' && (
            <div className="p-4 flex flex-col gap-3">
              {pastMatchdayResults.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#8c9aa6]">
                  Complete a matchday or click Kickoff to view settled week results here.
                </div>
              ) : (
                pastMatchdayResults.map((res, idx) => (
                  <div
                    key={idx}
                    className="bg-[#0e151c] border border-[#222e3a] rounded-lg p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-white border-b border-[#202b37] pb-1.5">
                      <span>
                        {res.leagueName} &middot; Week {res.matchday}
                      </span>
                      <span className="text-[#39b54a] font-mono">Full Time</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {res.matches.map((m, mIdx) => (
                        <div
                          key={mIdx}
                          className="flex items-center justify-between bg-[#151e27] px-2.5 py-1.5 rounded text-xs"
                        >
                          <span className="text-slate-200 truncate w-[38%]">{m.home}</span>
                          <span className="font-mono font-bold text-amber-400">
                            {m.score}{' '}
                            <span className="text-[10px] text-slate-400">({m.htScore})</span>
                          </span>
                          <span className="text-slate-200 truncate w-[38%] text-right">
                            {m.away}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: BETIKA LIGIBIGI BETSLIP & TICKETS (4 cols) */}
      <div className="lg:col-span-4 flex flex-col gap-3 lg:sticky lg:top-4">
        <div className="bg-[#151e27] border border-[#222e3a] rounded-xl overflow-hidden flex flex-col shadow-xl p-3.5 gap-3">
          <div className="flex items-center justify-between border-b border-[#222e3a] pb-2.5">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-[#39b54a]" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                LigiBigi BetSlip ({slip.length})
              </span>
            </div>
            {slip.length > 0 && (
              <button
                type="button"
                onClick={() => setSlip([])}
                className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {feedback && (
            <div
              className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{feedback.text}</span>
              </div>
              <button type="button" onClick={() => setFeedback(null)}>
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          )}

          {slip.length === 0 ? (
            <div className="py-7 px-3 text-center border border-dashed border-[#243240] rounded-lg bg-[#0e151c]">
              <p className="text-xs font-semibold text-slate-300">Your LigiBigi Slip is Empty</p>
              <p className="text-[11px] text-[#8c9aa6] mt-1">
                Select any match odd from {activeLeague.name} Week {matchday} to place a Single or
                Multi-Bet.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {slip.map((s) => (
                <div
                  key={s.selectionId}
                  className="bg-[#0e151c] border border-[#222e3a] rounded-lg p-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">
                      {s.homeName} vs {s.awayName}
                    </div>
                    <div className="text-[11px] text-[#39b54a] font-semibold">
                      {s.market}: {s.pick}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded bg-[#1c2834] text-amber-300 font-mono font-bold">
                      {s.odds.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSlip((prev) => prev.filter((item) => item.selectionId !== s.selectionId))
                      }
                      className="text-slate-500 hover:text-rose-400 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stake Input */}
          <div className="bg-[#0e151c] border border-[#222e3a] rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-bold">Stake (KES)</span>
              <span className="text-amber-400 font-mono text-[11px]">Min: 10.00 KES</span>
            </div>
            <input
              type="number"
              min={10}
              max={20000}
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
              className="w-full bg-[#151e27] border border-[#2a3846] rounded-lg px-3 py-1.5 text-right font-mono font-bold text-sm text-white focus:outline-none focus:border-[#39b54a]"
            />
            <div className="grid grid-cols-5 gap-1">
              {[10, 50, 100, 200, 500].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setStakeInput(String(amt))}
                  className="py-1 rounded bg-[#151e27] hover:bg-[#1e2a36] border border-[#222e3a] text-[11px] font-mono font-bold text-slate-300 cursor-pointer"
                >
                  {amt}
                </button>
              ))}
            </div>
          </div>

          {/* Betika Payout Breakdown */}
          <div className="bg-[#0e151c] border border-[#222e3a] rounded-lg p-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Total Odds</span>
              <span className="font-mono font-bold text-white">
                {slip.length > 0 ? totalOdds.toFixed(2) : '0.00'}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Bet Amount (Stake)</span>
              <span className="font-mono text-slate-200">
                {formatCentsToKes(previewStakeCents)}
              </span>
            </div>
            <div className="flex justify-between text-slate-200 pt-1.5 border-t border-[#202b37]">
              <span className="font-bold">Total Payout</span>
              <span className="font-mono font-extrabold text-sm text-[#39b54a]">
                {formatCentsToKes(payoutBreakdown.totalPayoutCents)}
              </span>
            </div>
          </div>

          {!user ? (
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full py-2.5 rounded-lg bg-[#39b54a] hover:bg-[#2ea03e] text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              <WalletIcon className="w-4 h-4" />
              <span>Login to Place Bet</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={phase !== 'BETTING' || slip.length === 0}
                onClick={() => handlePlaceBet(false)}
                className="py-2.5 px-3 rounded-lg bg-[#39b54a] hover:bg-[#2ea03e] disabled:opacity-40 text-white font-extrabold text-xs uppercase cursor-pointer"
              >
                Place Bet
              </button>
              <button
                type="button"
                disabled={phase !== 'BETTING' || slip.length === 0}
                onClick={() => handlePlaceBet(true)}
                className="py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-extrabold text-xs uppercase flex items-center justify-center gap-1 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Bet &amp; Kickoff</span>
              </button>
            </div>
          )}
        </div>

        {/* Settled & Active LigiBigi Tickets */}
        {tickets.length > 0 && (
          <div className="bg-[#151e27] border border-[#222e3a] rounded-xl p-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase text-white border-b border-[#222e3a] pb-2">
              <History className="w-4 h-4 text-[#39b54a]" />
              <span>My LigiBigi Bets ({tickets.length})</span>
            </div>
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {tickets.slice(0, 6).map((t) => (
                <div
                  key={t.id}
                  className="bg-[#0e151c] border border-[#222e3a] rounded-lg p-2.5 text-xs flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-white">
                      {t.ticketCode} &middot; {t.leagueName} Wk {t.matchday}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        t.status === 'WON'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : t.status === 'LOST'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Odds: {t.totalOdds.toFixed(2)}</span>
                    <span className="font-mono text-[#39b54a] font-bold">
                      Payout: {formatCentsToKes(t.potentialPayoutCents)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
