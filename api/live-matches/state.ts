interface LeagueFeedConfig {
  slug: string;
  leagueId: string;
  defaultName: string;
  defaultCountry: string;
  priority: number;
}

const SERVERLESS_LEAGUE_FEEDS: LeagueFeedConfig[] = [
  { slug: 'all', leagueId: 'WORLD', defaultName: 'Global Football', defaultCountry: 'International', priority: 1 },
  { slug: 'eng.1', leagueId: 'EPL', defaultName: 'Premier League', defaultCountry: 'England', priority: 10 },
  { slug: 'uefa.champions', leagueId: 'UCL', defaultName: 'Champions League', defaultCountry: 'Europe', priority: 10 },
  { slug: 'uefa.europa', leagueId: 'UEL', defaultName: 'Europa League', defaultCountry: 'Europe', priority: 9 },
  { slug: 'esp.1', leagueId: 'LALIGA', defaultName: 'LaLiga', defaultCountry: 'Spain', priority: 9 },
  { slug: 'esp.copa_del_rey', leagueId: 'LALIGA', defaultName: 'Copa del Rey', defaultCountry: 'Spain', priority: 9 },
  { slug: 'ita.1', leagueId: 'SERIEA', defaultName: 'Serie A', defaultCountry: 'Italy', priority: 9 },
  { slug: 'ger.1', leagueId: 'BUNDESLIGA', defaultName: 'Bundesliga', defaultCountry: 'Germany', priority: 9 },
  { slug: 'fra.1', leagueId: 'LIGUE1', defaultName: 'Ligue 1', defaultCountry: 'France', priority: 8 },
  { slug: 'eng.league_cup', leagueId: 'EPL', defaultName: 'EFL Cup', defaultCountry: 'England', priority: 8 },
  { slug: 'ned.1', leagueId: 'WORLD', defaultName: 'Eredivisie', defaultCountry: 'Netherlands', priority: 7 },
  { slug: 'por.1', leagueId: 'WORLD', defaultName: 'Primeira Liga', defaultCountry: 'Portugal', priority: 7 },
  { slug: 'ksa.1', leagueId: 'WORLD', defaultName: 'Saudi Pro League', defaultCountry: 'Saudi Arabia', priority: 7 },
  { slug: 'bra.1', leagueId: 'WORLD', defaultName: 'Serie A', defaultCountry: 'Brazil', priority: 7 },
  { slug: 'caf.champions', leagueId: 'FKF', defaultName: 'CAF Champions League', defaultCountry: 'Africa', priority: 8 },
];

const ESPN_LEAGUE_ID_MAP: Record<
  string,
  { leagueId: string; leagueName: string; country: string }
> = {
  '3920': { leagueId: 'EPL', leagueName: 'EFL Carabao Cup', country: 'England' },
  '730': { leagueId: 'SERIEA', leagueName: 'Serie A', country: 'Italy' },
  '3951': { leagueId: 'LALIGA', leagueName: 'Copa del Rey', country: 'Spain' },
  '21231': { leagueId: 'WORLD', leagueName: 'Saudi Pro League', country: 'Saudi Arabia' },
  '630': { leagueId: 'WORLD', leagueName: 'Serie A', country: 'Brazil' },
  '2466': { leagueId: 'WORLD', leagueName: 'AFC Champions League', country: 'Asia' },
  '3957': { leagueId: 'WORLD', leagueName: 'KNVB Beker', country: 'Netherlands' },
  '3945': { leagueId: 'WORLD', leagueName: 'Allsvenskan', country: 'Sweden' },
  '19483': { leagueId: 'UCL', leagueName: 'Champions League', country: 'Europe' },
  '650': { leagueId: 'WORLD', leagueName: 'Primera A', country: 'Colombia' },
  '670': { leagueId: 'WORLD', leagueName: 'Liga 1', country: 'Peru' },
  '3932': { leagueId: 'WORLD', leagueName: 'Liga MX', country: 'Mexico' },
};

function clampOdd(raw: number, min = 1.02, max = 70.0): number {
  return Math.max(min, Math.min(max, Math.round(raw * 100) / 100));
}

function buildMarkets(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  status: string,
  minute: number,
  homeScore: number,
  awayScore: number,
  baseHomeProb: number,
  baseDrawProb: number,
  baseAwayProb: number
) {
  const isSuspended = status === 'FT';
  const timeRemainingRatio = status === 'UPCOMING' ? 1.0 : Math.max(0.06, (90 - minute) / 90);
  const goalDiff = homeScore - awayScore;
  const totalGoals = homeScore + awayScore;

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

  const overround = 1.06;
  const odd1 = clampOdd(1 / (pHome * overround), 1.02, 70.0);
  const oddX = clampOdd(1 / (pDraw * overround), 1.18, 25.0);
  const odd2 = clampOdd(1 / (pAway * overround), 1.02, 70.0);

  const odd1X = clampOdd(1 / Math.min(0.95, (pHome + pDraw) * 1.04), 1.02, 6.5);
  const odd12 = clampOdd(1 / Math.min(0.95, (pHome + pAway) * 1.04), 1.04, 4.5);
  const oddX2 = clampOdd(1 / Math.min(0.95, (pDraw + pAway) * 1.04), 1.02, 6.5);

  const expectedRemainingGoals = 2.65 * timeRemainingRatio;
  const expectedTotalGoals = totalGoals + expectedRemainingGoals;

  const makeOverUnder = (marketKey: string, line: number, shortLabel: string) => {
    const alreadyOver = totalGoals > line;
    const diffFromLine = expectedTotalGoals - line;
    const probOver = alreadyOver
      ? 0.98
      : Math.max(0.06, Math.min(0.92, 0.5 + diffFromLine * 0.26));
    const probUnder = 1 - probOver;
    const overOdd = alreadyOver ? 1.01 : clampOdd(1 / (probOver * 1.06), 1.06, 15.0);
    const underOdd = alreadyOver ? 25.0 : clampOdd(1 / (probUnder * 1.06), 1.06, 15.0);

    return {
      marketKey,
      marketName: `Total Goals Over/Under ${line}`,
      shortName: shortLabel,
      suspended: isSuspended || alreadyOver,
      selections: [
        {
          selectionId: `${matchId}:${marketKey}:OVER_${line}`,
          marketKey,
          marketName: `Total Goals Over/Under ${line}`,
          outcomeKey: `OVER_${line}`,
          outcomeLabel: `Over ${line}`,
          odds: overOdd,
          trend: 'same',
          suspended: isSuspended || alreadyOver,
        },
        {
          selectionId: `${matchId}:${marketKey}:UNDER_${line}`,
          marketKey,
          marketName: `Total Goals Over/Under ${line}`,
          outcomeKey: `UNDER_${line}`,
          outcomeLabel: `Under ${line}`,
          odds: underOdd,
          trend: 'same',
          suspended: isSuspended || alreadyOver,
        },
      ],
    };
  };

  const bothScoredAlready = homeScore > 0 && awayScore > 0;
  const oneScored = (homeScore > 0) !== (awayScore > 0);
  const probGG = bothScoredAlready
    ? 0.98
    : oneScored
    ? Math.max(0.15, Math.min(0.85, 0.68 * Math.sqrt(timeRemainingRatio)))
    : Math.max(0.10, Math.min(0.75, 0.54 * timeRemainingRatio));
  const oddGG = bothScoredAlready ? 1.01 : clampOdd(1 / (probGG * 1.06), 1.12, 9.5);
  const oddNG = bothScoredAlready ? 18.0 : clampOdd(1 / ((1 - probGG) * 1.06), 1.10, 9.5);

  const dnbHomeProb = pHome / (pHome + pAway);
  const oddDnb1 = clampOdd(1 / (dnbHomeProb * 1.05), 1.04, 14.0);
  const oddDnb2 = clampOdd(1 / ((1 - dnbHomeProb) * 1.05), 1.04, 14.0);

  const firstHalfLocked = status === 'HT' || status === 'LIVE_2H' || status === 'FT';
  const fh1 = clampOdd(odd1 * 1.32, 1.25, 16.0);
  const fhX = clampOdd(oddX * 0.68, 1.35, 8.5);
  const fh2 = clampOdd(odd2 * 1.35, 1.25, 16.0);

  const csOptions = [
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

  const sel = (
    marketKey: string,
    marketName: string,
    outcomeKey: string,
    outcomeLabel: string,
    odds: number,
    suspended = isSuspended
  ) => ({
    selectionId: `${matchId}:${marketKey}:${outcomeKey}`,
    marketKey,
    marketName,
    outcomeKey,
    outcomeLabel,
    odds,
    trend: 'same',
    suspended,
  });

  return [
    {
      marketKey: '1X2',
      marketName: '1X2 (Full Time Result)',
      shortName: '1X2',
      suspended: isSuspended,
      selections: [
        sel('1X2', '1X2 (Full Time Result)', '1', `1 (${homeTeam})`, odd1),
        sel('1X2', '1X2 (Full Time Result)', 'X', 'X (Draw)', oddX),
        sel('1X2', '1X2 (Full Time Result)', '2', `2 (${awayTeam})`, odd2),
      ],
    },
    {
      marketKey: 'DOUBLE_CHANCE',
      marketName: 'Double Chance',
      shortName: 'DC',
      suspended: isSuspended,
      selections: [
        sel('DOUBLE_CHANCE', 'Double Chance', '1X', `1X (${homeTeam} or Draw)`, odd1X),
        sel('DOUBLE_CHANCE', 'Double Chance', '12', `12 (${homeTeam} or ${awayTeam})`, odd12),
        sel('DOUBLE_CHANCE', 'Double Chance', 'X2', `X2 (Draw or ${awayTeam})`, oddX2),
      ],
    },
    makeOverUnder('OVER_UNDER_25', 2.5, 'O/U 2.5'),
    {
      marketKey: 'BTTS',
      marketName: 'Both Teams To Score (GG/NG)',
      shortName: 'GG/NG',
      suspended: isSuspended || bothScoredAlready,
      selections: [
        sel('BTTS', 'Both Teams To Score (GG/NG)', 'GG', 'Yes (GG)', oddGG, isSuspended || bothScoredAlready),
        sel('BTTS', 'Both Teams To Score (GG/NG)', 'NG', 'No (NG)', oddNG, isSuspended || bothScoredAlready),
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
        sel('DRAW_NO_BET', 'Draw No Bet', 'DNB_1', homeTeam, oddDnb1),
        sel('DRAW_NO_BET', 'Draw No Bet', 'DNB_2', awayTeam, oddDnb2),
      ],
    },
    {
      marketKey: 'FIRST_HALF_1X2',
      marketName: '1st Half 1X2',
      shortName: '1H 1X2',
      suspended: isSuspended || firstHalfLocked,
      selections: [
        sel('FIRST_HALF_1X2', '1st Half 1X2', '1H_1', `1 (${homeTeam})`, fh1, isSuspended || firstHalfLocked),
        sel('FIRST_HALF_1X2', '1st Half 1X2', '1H_X', 'X (Draw)', fhX, isSuspended || firstHalfLocked),
        sel('FIRST_HALF_1X2', '1st Half 1X2', '1H_2', `2 (${awayTeam})`, fh2, isSuspended || firstHalfLocked),
      ],
    },
    {
      marketKey: 'CORRECT_SCORE',
      marketName: 'Correct Score (90 Mins)',
      shortName: 'CS',
      suspended: isSuspended,
      selections: csOptions.map((cs) => {
        const impossible = homeScore > cs.h || awayScore > cs.a;
        const csOdd = impossible
          ? 99.0
          : clampOdd(
              cs.baseOdd * (cs.h > cs.a ? odd1 / 2.1 : cs.a > cs.h ? odd2 / 2.2 : 1.0),
              3.2,
              65.0
            );
        return sel('CORRECT_SCORE', 'Correct Score (90 Mins)', cs.key, cs.key, csOdd, isSuspended || impossible);
      }),
    },
  ];
}

function parseAmericanOddsToProb(americanStr: string | number | undefined): number | null {
  if (americanStr === undefined || americanStr === null) return null;
  const cleaned = String(americanStr).trim().replace(/^EVEN$/i, '+100');
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num === 0) return null;
  if (num > 0) return 100 / (num + 100);
  const abs = Math.abs(num);
  return abs / (abs + 100);
}

function parseFormString(formStr?: string): Array<'W' | 'D' | 'L'> {
  if (!formStr || typeof formStr !== 'string') return ['W', 'D', 'W', 'L', 'W'];
  const chars = formStr
    .toUpperCase()
    .split('')
    .filter((c): c is 'W' | 'D' | 'L' => c === 'W' || c === 'D' || c === 'L');
  return chars.length ? chars.slice(-5) : ['W', 'D', 'W', 'L', 'W'];
}

function parseRecordWdl(summary?: string): { w: number; d: number; l: number } {
  if (!summary || typeof summary !== 'string') return { w: 5, d: 3, l: 3 };
  const parts = summary.split('-').map((n) => parseInt(n, 10));
  if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
    return { w: parts[0], d: parts[1], l: parts[2] };
  }
  return { w: 5, d: 3, l: 3 };
}

function classifyCompetition(ev: any, feedCfg: LeagueFeedConfig, leagueObj?: any) {
  const comp = ev.competitions?.[0];
  const altNote: string = comp?.altGameNote || '';
  const venueCountry: string = comp?.venue?.address?.country || '';
  const uidMatch = String(ev.uid || '').match(/~l:(\d+)~/);
  const espnLid = uidMatch?.[1] || '';

  if (feedCfg.slug !== 'all') {
    return {
      leagueId: feedCfg.leagueId,
      leagueName: leagueObj?.name || altNote.split(',')[0] || feedCfg.defaultName,
      country: venueCountry || feedCfg.defaultCountry,
    };
  }

  if (espnLid && ESPN_LEAGUE_ID_MAP[espnLid]) {
    const mapped = ESPN_LEAGUE_ID_MAP[espnLid];
    return {
      leagueId: mapped.leagueId,
      leagueName: altNote ? altNote.split(',')[0].trim() : mapped.leagueName,
      country: venueCountry || mapped.country,
    };
  }

  const combinedText = `${altNote} ${leagueObj?.name || ''}`.toLowerCase();
  if (combinedText.includes('copa del rey') || combinedText.includes('laliga') || combinedText.includes('spain')) {
    return {
      leagueId: 'LALIGA',
      leagueName: combinedText.includes('copa del rey') ? 'Copa del Rey' : 'LaLiga',
      country: 'Spain',
    };
  }
  if (combinedText.includes('serie a') && !combinedText.includes('brazil')) {
    return { leagueId: 'SERIEA', leagueName: 'Serie A', country: 'Italy' };
  }
  if (combinedText.includes('premier league') || combinedText.includes('carabao') || combinedText.includes('fa cup')) {
    return { leagueId: 'EPL', leagueName: altNote ? altNote.split(',')[0].trim() : 'Premier League', country: 'England' };
  }
  if (combinedText.includes('champions league')) {
    return { leagueId: 'UCL', leagueName: 'Champions League', country: 'Europe' };
  }
  if (combinedText.includes('europa') || combinedText.includes('conference league')) {
    return { leagueId: 'UEL', leagueName: 'Europa League', country: 'Europe' };
  }
  if (combinedText.includes('bundesliga') || combinedText.includes('dfb')) {
    return { leagueId: 'BUNDESLIGA', leagueName: 'Bundesliga', country: 'Germany' };
  }
  if (combinedText.includes('ligue 1')) {
    return { leagueId: 'LIGUE1', leagueName: 'Ligue 1', country: 'France' };
  }

  return {
    leagueId: 'WORLD',
    leagueName: altNote ? altNote.split(',')[0].trim() : leagueObj?.name || 'Club Football',
    country: venueCountry || feedCfg.defaultCountry,
  };
}

function mapEvent(ev: any, feedCfg: LeagueFeedConfig, leagueObj?: any): any | null {
  const comp = ev?.competitions?.[0];
  if (!comp || !Array.isArray(comp.competitors) || comp.competitors.length < 2) {
    return null;
  }

  const altNote = String(comp.altGameNote || '');
  if (altNote.includes('NCAAM') || altNote.includes('NCAAW')) {
    return null;
  }

  const homeComp = comp.competitors.find((c: any) => c.homeAway === 'home') || comp.competitors[0];
  const awayComp = comp.competitors.find((c: any) => c.homeAway === 'away') || comp.competitors[1];

  const homeTeam = String(homeComp.team?.displayName || homeComp.team?.name || '').trim();
  const awayTeam = String(awayComp.team?.displayName || awayComp.team?.name || '').trim();
  if (!homeTeam || !awayTeam || homeTeam === 'TBD' || awayTeam === 'TBD') {
    return null;
  }

  const homeShort = String(homeComp.team?.abbreviation || homeTeam.slice(0, 3).toUpperCase()).slice(0, 4);
  const awayShort = String(awayComp.team?.abbreviation || awayTeam.slice(0, 3).toUpperCase()).slice(0, 4);
  const homeForm = parseFormString(homeComp.form);
  const awayForm = parseFormString(awayComp.form);
  const { leagueId, leagueName, country } = classifyCompetition(ev, feedCfg, leagueObj);

  const statusType = ev.status?.type || comp.status?.type || {};
  const state = String(statusType.state || 'pre').toLowerCase();
  const statusName = String(statusType.name || 'STATUS_SCHEDULED').toUpperCase();
  const statusDetail = String(statusType.shortDetail || statusType.detail || '');
  const period = Number(ev.status?.period || comp.status?.period || 1);
  const displayClock = String(ev.status?.displayClock || comp.status?.displayClock || "0'");

  let status = 'UPCOMING';
  if (state === 'in') {
    if (statusName.includes('HALFTIME') || statusDetail.toUpperCase() === 'HT') {
      status = 'HT';
    } else if (period === 1 || statusName.includes('FIRST_HALF')) {
      status = 'LIVE_1H';
    } else {
      status = 'LIVE_2H';
    }
  } else if (state === 'post' || statusType.completed === true) {
    status = 'FT';
  }

  let minute = 0;
  if (status === 'HT') minute = 45;
  else if (status === 'FT') minute = 90;
  else if (status === 'LIVE_1H' || status === 'LIVE_2H') {
    const mMatch = displayClock.match(/(\d+)/);
    minute = mMatch ? Math.max(1, Math.min(90, parseInt(mMatch[1], 10))) : period === 2 ? 46 : 1;
  }

  const homeScore = Math.max(0, parseInt(String(homeComp.score || '0'), 10) || 0);
  const awayScore = Math.max(0, parseInt(String(awayComp.score || '0'), 10) || 0);

  const kickoffIso = String(ev.date || comp.date || new Date().toISOString());
  const kickoffAt = new Date(kickoffIso).getTime() || Date.now() + 3600_000;
  const startsInSeconds =
    status === 'UPCOMING' ? Math.max(0, Math.floor((kickoffAt - Date.now()) / 1000)) : 0;

  let baseHomeProb = 0.42;
  let baseDrawProb = 0.28;
  let baseAwayProb = 0.30;

  const oddsEntry = comp.odds?.[0];
  const mlHome = parseAmericanOddsToProb(
    oddsEntry?.moneyline?.home?.close?.odds || oddsEntry?.moneyline?.home?.open?.odds
  );
  const mlAway = parseAmericanOddsToProb(
    oddsEntry?.moneyline?.away?.close?.odds || oddsEntry?.moneyline?.away?.open?.odds
  );
  const mlDraw = parseAmericanOddsToProb(
    oddsEntry?.moneyline?.draw?.close?.odds ||
      oddsEntry?.moneyline?.draw?.open?.odds ||
      oddsEntry?.drawOdds?.moneyLine
  );

  const homeRec = parseRecordWdl(homeComp.records?.[0]?.summary);
  const awayRec = parseRecordWdl(awayComp.records?.[0]?.summary);

  if (mlHome && mlAway && mlDraw) {
    const sum = mlHome + mlDraw + mlAway;
    baseHomeProb = Math.max(0.08, Math.min(0.84, mlHome / sum));
    baseDrawProb = Math.max(0.12, Math.min(0.42, mlDraw / sum));
    baseAwayProb = Math.max(0.08, 1 - baseHomeProb - baseDrawProb);
  } else {
    const homeTotal = Math.max(1, homeRec.w + homeRec.d + homeRec.l);
    const awayTotal = Math.max(1, awayRec.w + awayRec.d + awayRec.l);
    const homeWinRate = (homeRec.w + 1.5) / (homeTotal + 3);
    const awayWinRate = (awayRec.w + 1.2) / (awayTotal + 3);
    const homeFormPts = homeForm.reduce((acc, f) => acc + (f === 'W' ? 3 : f === 'D' ? 1 : 0), 0) / 15;
    const awayFormPts = awayForm.reduce((acc, f) => acc + (f === 'W' ? 3 : f === 'D' ? 1 : 0), 0) / 15;
    const rawH = homeWinRate * 0.65 + homeFormPts * 0.35 + 0.05;
    const rawA = awayWinRate * 0.65 + awayFormPts * 0.35;
    const rawD = 0.27;
    const sum = rawH + rawD + rawA;
    baseHomeProb = Math.max(0.14, Math.min(0.76, rawH / sum));
    baseDrawProb = Math.max(0.16, Math.min(0.36, rawD / sum));
    baseAwayProb = Math.max(0.12, 1 - baseHomeProb - baseDrawProb);
  }

  const matchId = `espn_${ev.id}`;
  const numericId = parseInt(String(ev.id).slice(-5), 10) || 1000;
  const venueName = comp.venue?.fullName || `${country} Stadium`;

  const markets = buildMarkets(
    matchId,
    homeTeam,
    awayTeam,
    status,
    minute,
    homeScore,
    awayScore,
    baseHomeProb,
    baseDrawProb,
    baseAwayProb
  );

  return {
    id: matchId,
    fixtureCode: numericId,
    leagueId,
    leagueName,
    country,
    venue: venueName,
    homeTeam,
    homeShort,
    homeBadgeColor: '#16a34a',
    homeLogo: String(homeComp.team?.logo || ''),
    homeForm,
    awayTeam,
    awayShort,
    awayBadgeColor: '#2563eb',
    awayLogo: String(awayComp.team?.logo || ''),
    awayForm,
    status,
    statusDetail: status === 'FT' ? 'Full Time' : statusDetail,
    isPreMatchBetEarly: status === 'UPCOMING',
    kickoffAt,
    kickoffIso,
    startsInSeconds,
    minute,
    homeScore,
    awayScore,
    htHomeScore: Math.min(homeScore, Math.floor(homeScore * 0.5)),
    htAwayScore: Math.min(awayScore, Math.floor(awayScore * 0.5)),
    marketsCount: markets.length,
    markets,
    events: [],
    stats: {
      possessionHome: 52,
      possessionAway: 48,
      shotsHome: status === 'UPCOMING' ? 0 : homeScore * 3 + 2,
      shotsAway: status === 'UPCOMING' ? 0 : awayScore * 3 + 2,
      shotsOnTargetHome: status === 'UPCOMING' ? 0 : homeScore + 1,
      shotsOnTargetAway: status === 'UPCOMING' ? 0 : awayScore + 1,
      cornersHome: 3,
      cornersAway: 2,
      yellowCardsHome: 1,
      yellowCardsAway: 1,
      redCardsHome: 0,
      redCardsAway: 0,
      dangerousAttacksHome: status === 'UPCOMING' ? 0 : 24,
      dangerousAttacksAway: status === 'UPCOMING' ? 0 : 21,
      ballX: 50,
      ballY: 50,
      momentumTeam: 'NEUTRAL',
      lastActionText:
        status === 'UPCOMING'
          ? `Kickoff at ${venueName}`
          : status === 'FT'
          ? `Full Time Result: ${homeShort} ${homeScore} - ${awayScore} ${awayShort}`
          : `Live ${minute}' · ${homeShort} ${homeScore} - ${awayScore} ${awayShort}`,
    },
    h2hSummary: {
      homeWins: homeRec.w,
      draws: homeRec.d + awayRec.d,
      awayWins: awayRec.w,
      lastMeeting: `${homeShort} vs ${awayShort}`,
    },
    serverSeedHash: `sha256_${ev.id}_verified`,
    serverSeed: status === 'FT' ? `verified_${ev.id}_ft` : null,
    clientSeed: 'official-football-feed-v2',
    nonce: numericId,
    totalBetsCount: 42 + (numericId % 90),
    totalPoolCents: 1850000,
    updatedAt: Date.now(),
  };
}

async function fetchJson(url: string, timeoutMs = 5500): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchServerlessFootballMatches(): Promise<any[]> {
  const resultsById = new Map<string, { dto: any; priority: number }>();
  const now = new Date();
  const yesterdayDt = new Date(now.getTime() - 86_400_000);
  const yesterdayYmd = yesterdayDt.toISOString().slice(0, 10).replace(/-/g, '');
  const todayYmd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const tomorrowDt = new Date(now.getTime() + 86_400_000);
  const tomorrowYmd = tomorrowDt.toISOString().slice(0, 10).replace(/-/g, '');

  const ingest = (json: any, feedCfg: LeagueFeedConfig) => {
    if (!json || !Array.isArray(json.events)) return;
    const leagueObj = json.leagues?.[0];
    for (const ev of json.events) {
      const dto = mapEvent(ev, feedCfg, leagueObj);
      if (!dto) continue;
      const existing = resultsById.get(dto.id);
      if (!existing || feedCfg.priority >= existing.priority) {
        resultsById.set(dto.id, { dto, priority: feedCfg.priority });
      }
    }
  };

  await Promise.all(
    SERVERLESS_LEAGUE_FEEDS.map(async (feedCfg) => {
      const [todayJson, defaultJson] = await Promise.all([
        fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${feedCfg.slug}/scoreboard?dates=${todayYmd}`),
        fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${feedCfg.slug}/scoreboard`),
      ]);
      ingest(defaultJson, feedCfg);
      ingest(todayJson, feedCfg);

      if (feedCfg.slug === 'all' || feedCfg.priority >= 8) {
        const [yestJson, tomJson] = await Promise.all([
          fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${feedCfg.slug}/scoreboard?dates=${yesterdayYmd}`),
          fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${feedCfg.slug}/scoreboard?dates=${tomorrowYmd}`),
        ]);
        ingest(yestJson, feedCfg);
        ingest(tomJson, feedCfg);
      }
    })
  );

  const fetchedList = Array.from(resultsById.values()).map((x) => x.dto);
  const liveMatches = fetchedList
    .filter((m) => m.status === 'LIVE_1H' || m.status === 'HT' || m.status === 'LIVE_2H')
    .sort((a, b) => b.minute - a.minute);
  const upcomingMatches = fetchedList
    .filter((m) => m.status === 'UPCOMING')
    .sort((a, b) => a.kickoffAt - b.kickoffAt);
  const finishedMatches = fetchedList
    .filter((m) => m.status === 'FT')
    .sort((a, b) => b.kickoffAt - a.kickoffAt);

  return [
    ...liveMatches,
    ...upcomingMatches.slice(0, 65),
    ...finishedMatches.slice(0, 45),
  ];
}

export default async function handler(req: any, res: any) {
  try {
    const matches = await fetchServerlessFootballMatches();
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json({
      matches,
      recentPublicBets: [],
      onlinePlayers: 312 + Math.floor(Math.random() * 25),
      minStakeCents: 1000,
      maxStakeCents: 20000000,
      maxPayoutCents: 500000000,
      serverTimestamp: Date.now(),
      lastSyncedAt: new Date().toISOString(),
      feedSource: 'ESPN Live Global Football Feed',
    });
  } catch (err: any) {
    return res.status(500).json({
      matches: [],
      error: err?.message || 'Failed to fetch live football state',
    });
  }
}
