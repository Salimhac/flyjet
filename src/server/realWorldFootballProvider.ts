import {
  FootballLeagueId,
  FootballMatchEventDTO,
  FootballMatchStatus,
  FootballMatchStatsDTO,
} from '../features/live-matches/types';

export interface NormalizedRealMatchData {
  id: string;
  fixtureCode: number;
  leagueId: FootballLeagueId;
  leagueName: string;
  country: string;
  venue: string;
  homeTeam: string;
  homeShort: string;
  homeBadgeColor: string;
  homeLogo: string;
  homeForm: Array<'W' | 'D' | 'L'>;
  awayTeam: string;
  awayShort: string;
  awayBadgeColor: string;
  awayLogo: string;
  awayForm: Array<'W' | 'D' | 'L'>;
  status: FootballMatchStatus;
  statusDetail: string;
  kickoffAt: number;
  kickoffIso: string;
  startsInSeconds: number;
  minute: number;
  homeScore: number;
  awayScore: number;
  htHomeScore: number;
  htAwayScore: number;
  baseHomeProb: number;
  baseDrawProb: number;
  baseAwayProb: number;
  events: FootballMatchEventDTO[];
  stats: FootballMatchStatsDTO;
  h2hSummary: {
    homeWins: number;
    draws: number;
    awayWins: number;
    lastMeeting: string;
  };
  homePlayers: string[];
  awayPlayers: string[];
}

interface LeagueFeedConfig {
  slug: string;
  leagueId: FootballLeagueId;
  defaultName: string;
  defaultCountry: string;
  priority: number;
}

const LEAGUE_FEEDS: LeagueFeedConfig[] = [
  { slug: 'all', leagueId: 'WORLD', defaultName: 'Global Football', defaultCountry: 'International', priority: 1 },
  { slug: 'eng.1', leagueId: 'EPL', defaultName: 'English Premier League', defaultCountry: 'England', priority: 10 },
  { slug: 'uefa.champions', leagueId: 'UCL', defaultName: 'UEFA Champions League', defaultCountry: 'Europe', priority: 10 },
  { slug: 'uefa.europa', leagueId: 'UEL', defaultName: 'UEFA Europa League', defaultCountry: 'Europe', priority: 9 },
  { slug: 'esp.1', leagueId: 'LALIGA', defaultName: 'Spanish LaLiga', defaultCountry: 'Spain', priority: 9 },
  { slug: 'ita.1', leagueId: 'SERIEA', defaultName: 'Italian Serie A', defaultCountry: 'Italy', priority: 9 },
  { slug: 'ger.1', leagueId: 'BUNDESLIGA', defaultName: 'German Bundesliga', defaultCountry: 'Germany', priority: 9 },
  { slug: 'fra.1', leagueId: 'LIGUE1', defaultName: 'French Ligue 1', defaultCountry: 'France', priority: 8 },
  { slug: 'eng.league_cup', leagueId: 'EPL', defaultName: 'EFL Carabao Cup', defaultCountry: 'England', priority: 8 },
  { slug: 'ksa.1', leagueId: 'WORLD', defaultName: 'Saudi Pro League', defaultCountry: 'Saudi Arabia', priority: 7 },
  { slug: 'bra.1', leagueId: 'WORLD', defaultName: 'Brazil Serie A', defaultCountry: 'Brazil', priority: 7 },
  { slug: 'caf.champions', leagueId: 'FKF', defaultName: 'CAF Champions League', defaultCountry: 'Africa', priority: 8 },
];

const ESPN_LEAGUE_ID_MAP: Record<
  string,
  { leagueId: FootballLeagueId; leagueName: string; country: string }
> = {
  '3920': { leagueId: 'EPL', leagueName: 'EFL Carabao Cup', country: 'England' },
  '730': { leagueId: 'SERIEA', leagueName: 'Italian Serie A', country: 'Italy' },
  '3951': { leagueId: 'LALIGA', leagueName: 'Spanish Copa del Rey', country: 'Spain' },
  '21231': { leagueId: 'WORLD', leagueName: 'Saudi Pro League', country: 'Saudi Arabia' },
  '630': { leagueId: 'WORLD', leagueName: 'Brazil Serie A', country: 'Brazil' },
  '2466': { leagueId: 'WORLD', leagueName: 'AFC Champions League Two', country: 'Asia' },
  '3957': { leagueId: 'WORLD', leagueName: 'KNVB Beker', country: 'Netherlands' },
  '3945': { leagueId: 'WORLD', leagueName: 'Swedish Allsvenskan', country: 'Sweden' },
  '19483': { leagueId: 'UCL', leagueName: 'UEFA Champions League (W)', country: 'Europe' },
  '650': { leagueId: 'WORLD', leagueName: 'Categoría Primera A', country: 'Colombia' },
  '670': { leagueId: 'WORLD', leagueName: 'Peru Liga 1', country: 'Peru' },
  '3932': { leagueId: 'WORLD', leagueName: 'Liga Expansión MX', country: 'Mexico' },
};

function parseAmericanOddsToProb(americanStr: string | number | undefined): number | null {
  if (americanStr === undefined || americanStr === null) return null;
  const cleaned = String(americanStr).trim().replace(/^EVEN$/i, '+100');
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num === 0) return null;
  if (num > 0) {
    return 100 / (num + 100);
  }
  const abs = Math.abs(num);
  return abs / (abs + 100);
}

function parseFormString(formStr?: string): Array<'W' | 'D' | 'L'> {
  if (!formStr || typeof formStr !== 'string') {
    return ['W', 'D', 'W', 'L', 'W'];
  }
  const chars = formStr
    .toUpperCase()
    .split('')
    .filter((c): c is 'W' | 'D' | 'L' => c === 'W' || c === 'D' || c === 'L');
  if (chars.length === 0) {
    return ['W', 'D', 'W', 'L', 'W'];
  }
  return chars.slice(-5);
}

function parseRecordWdl(summary?: string): { w: number; d: number; l: number } {
  if (!summary || typeof summary !== 'string') {
    return { w: 5, d: 3, l: 3 };
  }
  const parts = summary.split('-').map((n) => parseInt(n, 10));
  if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
    return { w: parts[0], d: parts[1], l: parts[2] };
  }
  return { w: 5, d: 3, l: 3 };
}

function normalizeColor(hex?: string, fallback = '#16a34a'): string {
  if (!hex || typeof hex !== 'string') return fallback;
  const clean = hex.replace(/^#/, '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    if (clean.toLowerCase() === '000000' || clean.toLowerCase() === 'ffffff') {
      return fallback;
    }
    return `#${clean}`;
  }
  return fallback;
}

function classifyCompetition(
  ev: any,
  feedCfg: LeagueFeedConfig,
  leagueObj?: any
): { leagueId: FootballLeagueId; leagueName: string; country: string } {
  const comp = ev.competitions?.[0];
  const altNote: string = comp?.altGameNote || '';
  const venueCountry: string = comp?.venue?.address?.country || '';
  const trackingLeague: string =
    comp?.odds?.[0]?.total?.over?.close?.link?.tracking?.tags?.league ||
    comp?.odds?.[0]?.moneyline?.home?.close?.link?.tracking?.tags?.league ||
    '';

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

  const combinedText = `${altNote} ${trackingLeague} ${leagueObj?.name || ''}`.toLowerCase();

  if (combinedText.includes('premier league') && combinedText.includes('kenya')) {
    return { leagueId: 'FKF', leagueName: 'FKF Premier League', country: 'Kenya' };
  }
  if (
    combinedText.includes('eng.1') ||
    combinedText.includes('english premier') ||
    combinedText.includes('carabao') ||
    combinedText.includes('fa cup')
  ) {
    return {
      leagueId: 'EPL',
      leagueName: altNote ? altNote.split(',')[0].trim() : 'English Football',
      country: venueCountry || 'England',
    };
  }
  if (combinedText.includes('champions league') && !combinedText.includes('afc') && !combinedText.includes('caf')) {
    return {
      leagueId: 'UCL',
      leagueName: altNote ? altNote.split(',')[0].trim() : 'UEFA Champions League',
      country: 'Europe',
    };
  }
  if (combinedText.includes('europa') || combinedText.includes('conference league')) {
    return {
      leagueId: 'UEL',
      leagueName: altNote ? altNote.split(',')[0].trim() : 'UEFA Europa Cup',
      country: 'Europe',
    };
  }
  if (combinedText.includes('laliga') || combinedText.includes('copa del rey') || combinedText.includes('esp.')) {
    return {
      leagueId: 'LALIGA',
      leagueName: altNote ? altNote.split(',')[0].trim() : 'Spanish Football',
      country: 'Spain',
    };
  }
  if (combinedText.includes('serie a') && !combinedText.includes('brazil') && !combinedText.includes('bra.')) {
    return {
      leagueId: 'SERIEA',
      leagueName: 'Italian Serie A',
      country: 'Italy',
    };
  }
  if (combinedText.includes('bundesliga') || combinedText.includes('dfb') || combinedText.includes('ger.')) {
    return {
      leagueId: 'BUNDESLIGA',
      leagueName: altNote ? altNote.split(',')[0].trim() : 'German Bundesliga',
      country: 'Germany',
    };
  }
  if (combinedText.includes('ligue 1') || combinedText.includes('fra.')) {
    return {
      leagueId: 'LIGUE1',
      leagueName: 'French Ligue 1',
      country: 'France',
    };
  }

  return {
    leagueId: 'WORLD',
    leagueName: altNote ? altNote.split(',')[0].trim() : leagueObj?.name || 'International Club Football',
    country: venueCountry || feedCfg.defaultCountry,
  };
}

function mapEspnEventToNormalized(
  ev: any,
  feedCfg: LeagueFeedConfig,
  leagueObj?: any
): NormalizedRealMatchData | null {
  const comp = ev?.competitions?.[0];
  if (!comp || !Array.isArray(comp.competitors) || comp.competitors.length < 2) {
    return null;
  }

  // Filter out college soccer (NCAAM / NCAAW) so only professional football matches appear
  const altNote = String(comp.altGameNote || '');
  if (altNote.includes('NCAAM') || altNote.includes('NCAAW')) {
    return null;
  }

  const homeComp = comp.competitors.find((c: any) => c.homeAway === 'home') || comp.competitors[0];
  const awayComp = comp.competitors.find((c: any) => c.homeAway === 'away') || comp.competitors[1];

  const homeTeam = String(homeComp.team?.displayName || homeComp.team?.name || 'Home FC').trim();
  const awayTeam = String(awayComp.team?.displayName || awayComp.team?.name || 'Away FC').trim();
  if (!homeTeam || !awayTeam || homeTeam === 'TBD' || awayTeam === 'TBD') {
    return null;
  }

  const homeShort = String(
    homeComp.team?.abbreviation || homeTeam.slice(0, 3).toUpperCase()
  ).slice(0, 4);
  const awayShort = String(
    awayComp.team?.abbreviation || awayTeam.slice(0, 3).toUpperCase()
  ).slice(0, 4);

  const homeBadgeColor = normalizeColor(homeComp.team?.color, '#16a34a');
  const awayBadgeColor = normalizeColor(awayComp.team?.color, '#2563eb');
  const homeLogo = String(homeComp.team?.logo || '');
  const awayLogo = String(awayComp.team?.logo || '');

  const homeForm = parseFormString(homeComp.form);
  const awayForm = parseFormString(awayComp.form);

  const { leagueId, leagueName, country } = classifyCompetition(ev, feedCfg, leagueObj);

  const statusType = ev.status?.type || comp.status?.type || {};
  const state = String(statusType.state || 'pre').toLowerCase();
  const statusName = String(statusType.name || 'STATUS_SCHEDULED').toUpperCase();
  const statusDetail = String(statusType.shortDetail || statusType.detail || '');
  const period = Number(ev.status?.period || comp.status?.period || 1);
  const displayClock = String(ev.status?.displayClock || comp.status?.displayClock || "0'");

  let status: FootballMatchStatus = 'UPCOMING';
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
  } else {
    status = 'UPCOMING';
  }

  // Parse match minute from displayClock e.g. "56'", "45'+2'", "90'+4'"
  let minute = 0;
  if (status === 'HT') {
    minute = 45;
  } else if (status === 'FT') {
    minute = 90;
  } else if (status === 'LIVE_1H' || status === 'LIVE_2H') {
    const mMatch = displayClock.match(/(\d+)/);
    minute = mMatch ? Math.max(1, Math.min(90, parseInt(mMatch[1], 10))) : period === 2 ? 46 : 1;
  }

  const homeScore = Math.max(0, parseInt(String(homeComp.score || '0'), 10) || 0);
  const awayScore = Math.max(0, parseInt(String(awayComp.score || '0'), 10) || 0);

  const htLineHome = homeComp.linescores?.[0]?.value;
  const htLineAway = awayComp.linescores?.[0]?.value;
  const htHomeScore =
    typeof htLineHome === 'number'
      ? htLineHome
      : status === 'LIVE_1H'
      ? homeScore
      : Math.min(homeScore, Math.floor(homeScore * 0.5));
  const htAwayScore =
    typeof htLineAway === 'number'
      ? htLineAway
      : status === 'LIVE_1H'
      ? awayScore
      : Math.min(awayScore, Math.floor(awayScore * 0.5));

  const kickoffIso = String(ev.date || comp.date || new Date().toISOString());
  const kickoffAt = new Date(kickoffIso).getTime() || Date.now() + 3600_000;
  const startsInSeconds =
    status === 'UPCOMING' ? Math.max(0, Math.floor((kickoffAt - Date.now()) / 1000)) : 0;

  // Compute base 1X2 probabilities from real bookmaker odds when available, else from real records & form
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
    baseHomeProb = Math.max(0.10, Math.min(0.80, mlHome / sum));
    baseDrawProb = Math.max(0.14, Math.min(0.42, mlDraw / sum));
    baseAwayProb = Math.max(0.10, 1 - baseHomeProb - baseDrawProb);
  } else {
    const homeTotal = Math.max(1, homeRec.w + homeRec.d + homeRec.l);
    const awayTotal = Math.max(1, awayRec.w + awayRec.d + awayRec.l);
    const homeWinRate = (homeRec.w + 1.5) / (homeTotal + 3);
    const awayWinRate = (awayRec.w + 1.2) / (awayTotal + 3);
    const homeFormPts = homeForm.reduce((acc, f) => acc + (f === 'W' ? 3 : f === 'D' ? 1 : 0), 0) / 15;
    const awayFormPts = awayForm.reduce((acc, f) => acc + (f === 'W' ? 3 : f === 'D' ? 1 : 0), 0) / 15;

    const rawH = homeWinRate * 0.65 + homeFormPts * 0.35 + 0.05; // +5% home advantage
    const rawA = awayWinRate * 0.65 + awayFormPts * 0.35;
    const rawD = 0.27;
    const sum = rawH + rawD + rawA;
    baseHomeProb = Math.max(0.16, Math.min(0.74, rawH / sum));
    baseDrawProb = Math.max(0.18, Math.min(0.36, rawD / sum));
    baseAwayProb = Math.max(0.14, 1 - baseHomeProb - baseDrawProb);
  }

  // Parse real match statistics from ESPN competitors
  const getStat = (competitor: any, statName: string, fallback: number): number => {
    const found = (competitor.statistics || []).find(
      (s: any) => s.name === statName || s.abbreviation === statName
    );
    if (!found) return fallback;
    const val = parseFloat(String(found.displayValue || '0'));
    return Number.isFinite(val) ? Math.round(val) : fallback;
  };

  const possH = getStat(homeComp, 'possessionPct', status === 'UPCOMING' ? 50 : 52);
  const possA = getStat(awayComp, 'possessionPct', status === 'UPCOMING' ? 50 : 100 - possH);
  const shotsH = getStat(homeComp, 'totalShots', status === 'UPCOMING' ? 0 : homeScore * 3 + 2);
  const shotsA = getStat(awayComp, 'totalShots', status === 'UPCOMING' ? 0 : awayScore * 3 + 2);
  const sotH = getStat(homeComp, 'shotsOnTarget', status === 'UPCOMING' ? 0 : homeScore + 1);
  const sotA = getStat(awayComp, 'shotsOnTarget', status === 'UPCOMING' ? 0 : awayScore + 1);
  const cornersH = getStat(homeComp, 'wonCorners', 0);
  const cornersA = getStat(awayComp, 'wonCorners', 0);

  // Parse real match events (goals, yellow cards, red cards) from comp.details
  const events: FootballMatchEventDTO[] = [];
  let yellowH = 0;
  let yellowA = 0;
  let redH = 0;
  let redA = 0;
  let runScoreH = 0;
  let runScoreA = 0;

  const homeTeamId = String(homeComp.team?.id || homeComp.id || '');
  const homePlayers: string[] = [];
  const awayPlayers: string[] = [];

  if (Array.isArray(comp.details)) {
    for (let i = 0; i < comp.details.length; i++) {
      const d = comp.details[i];
      const isHome = String(d.team?.id || '') === homeTeamId;
      const side: 'HOME' | 'AWAY' = isHome ? 'HOME' : 'AWAY';
      const teamLabel = isHome ? homeTeam : awayTeam;
      const teamShortLabel = isHome ? homeShort : awayShort;
      const clkStr = String(d.clock?.displayValue || "1'");
      const evMin = parseInt(clkStr.replace(/[^\d]/g, ''), 10) || 1;
      const player = d.athletesInvolved?.[0]?.displayName || d.athletesInvolved?.[0]?.shortName || undefined;

      if (player) {
        if (isHome && !homePlayers.includes(player)) homePlayers.push(player);
        if (!isHome && !awayPlayers.includes(player)) awayPlayers.push(player);
      }

      if (d.scoringPlay) {
        if (isHome) runScoreH++;
        else runScoreA++;
        const penTag = d.penaltyKick ? ' (PEN)' : d.ownGoal ? ' (OG)' : '';
        events.push({
          id: `ev_${ev.id}_goal_${i}`,
          minute: evMin,
          type: 'GOAL',
          team: side,
          player,
          description: `${clkStr} GOAL! ${player || teamLabel}${penTag} scores for ${teamLabel}!`,
          scoreSnapshot: `${runScoreH} - ${runScoreA}`,
          timestamp: kickoffIso,
        });
      } else if (d.redCard) {
        if (isHome) redH++;
        else redA++;
        events.push({
          id: `ev_${ev.id}_rc_${i}`,
          minute: evMin,
          type: 'RED_CARD',
          team: side,
          player,
          description: `${clkStr} Red Card: ${player || 'Player'} (${teamShortLabel})`,
          scoreSnapshot: `${runScoreH} - ${runScoreA}`,
          timestamp: kickoffIso,
        });
      } else if (d.yellowCard) {
        if (isHome) yellowH++;
        else yellowA++;
        events.push({
          id: `ev_${ev.id}_yc_${i}`,
          minute: evMin,
          type: 'YELLOW_CARD',
          team: side,
          player,
          description: `${clkStr} Yellow Card: ${player || 'Player'} (${teamShortLabel})`,
          scoreSnapshot: `${runScoreH} - ${runScoreA}`,
          timestamp: kickoffIso,
        });
      }
    }
  }

  events.reverse();

  const venueName = comp.venue?.fullName
    ? `${comp.venue.fullName}${comp.venue.address?.city ? `, ${comp.venue.address.city}` : ''}`
    : `${country} Stadium`;

  const lastEventText =
    status === 'UPCOMING'
      ? `Official Kickoff: ${new Date(kickoffAt).toUTCString().replace(':00 GMT', ' UTC')} · ${venueName}`
      : status === 'HT'
      ? `Half Time Break (${homeShort} ${homeScore} - ${awayScore} ${awayShort})`
      : status === 'FT'
      ? `Full Time Official Result: ${homeShort} ${homeScore} - ${awayScore} ${awayShort}`
      : events[0]?.description ||
        `LIVE ${displayClock} · ${homeShort} ${homeScore} - ${awayScore} ${awayShort} (${possH}% - ${possA}% poss)`;

  const numericId = parseInt(String(ev.id).slice(-5), 10) || 1000;

  return {
    id: `espn_${ev.id}`,
    fixtureCode: numericId,
    leagueId,
    leagueName,
    country,
    venue: venueName,
    homeTeam,
    homeShort,
    homeBadgeColor,
    homeLogo,
    homeForm,
    awayTeam,
    awayShort,
    awayBadgeColor,
    awayLogo,
    awayForm,
    status,
    statusDetail,
    kickoffAt,
    kickoffIso,
    startsInSeconds,
    minute,
    homeScore,
    awayScore,
    htHomeScore,
    htAwayScore,
    baseHomeProb,
    baseDrawProb,
    baseAwayProb,
    events,
    stats: {
      possessionHome: possH,
      possessionAway: possA,
      shotsHome: shotsH,
      shotsAway: shotsA,
      shotsOnTargetHome: sotH,
      shotsOnTargetAway: sotA,
      cornersHome: cornersH,
      cornersAway: cornersA,
      yellowCardsHome: yellowH,
      yellowCardsAway: yellowA,
      redCardsHome: redH,
      redCardsAway: redA,
      dangerousAttacksHome: status === 'UPCOMING' ? 0 : shotsH * 4 + cornersH * 3 + Math.floor(minute * 0.4),
      dangerousAttacksAway: status === 'UPCOMING' ? 0 : shotsA * 4 + cornersA * 3 + Math.floor(minute * 0.4),
      ballX: status === 'UPCOMING' || status === 'HT' || status === 'FT' ? 50 : Math.min(88, Math.max(12, possH)),
      ballY: 50,
      momentumTeam: possH > 54 ? 'HOME' : possA > 54 ? 'AWAY' : 'NEUTRAL',
      lastActionText: lastEventText,
    },
    h2hSummary: {
      homeWins: homeRec.w,
      draws: homeRec.d + awayRec.d,
      awayWins: awayRec.w,
      lastMeeting: `Season Record: ${homeShort} (${homeRec.w}W-${homeRec.d}D-${homeRec.l}L) vs ${awayShort} (${awayRec.w}W-${awayRec.d}D-${awayRec.l}L)`,
    },
    homePlayers,
    awayPlayers,
  };
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 6500): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; BetikaSportsbookFeed/2.0)',
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches real-world live and upcoming football matches across all major leagues.
 * - `quickLiveOnly = true`: polls `all/scoreboard` for real-time live score & clock updates (used every 20s)
 * - `quickLiveOnly = false`: fetches `all/scoreboard` + tomorrow's global slate + all top league scoreboards
 */
export async function fetchRealWorldFootballMatches(
  quickLiveOnly = false
): Promise<NormalizedRealMatchData[]> {
  const resultsById = new Map<string, { data: NormalizedRealMatchData; priority: number }>();

  const feedsToQuery = quickLiveOnly ? LEAGUE_FEEDS.slice(0, 5) : LEAGUE_FEEDS;
  const now = new Date();
  const yesterdayDt = new Date(now.getTime() - 86_400_000);
  const yesterdayYmd = yesterdayDt.toISOString().slice(0, 10).replace(/-/g, '');
  const todayYmd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const tomorrowDt = new Date(now.getTime() + 86_400_000);
  const tomorrowYmd = tomorrowDt.toISOString().slice(0, 10).replace(/-/g, '');

  const ingestEvents = (json: any, feedCfg: LeagueFeedConfig) => {
    if (!json || !Array.isArray(json.events)) return;
    const leagueObj = json.leagues?.[0];
    for (const ev of json.events) {
      const normalized = mapEspnEventToNormalized(ev, feedCfg, leagueObj);
      if (!normalized) continue;
      const existing = resultsById.get(normalized.id);
      if (!existing || feedCfg.priority >= existing.priority) {
        resultsById.set(normalized.id, { data: normalized, priority: feedCfg.priority });
      }
    }
  };

  await Promise.all(
    feedsToQuery.map(async (feedCfg) => {
      const [todayJson, defaultJson] = await Promise.all([
        fetchJsonWithTimeout(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${feedCfg.slug}/scoreboard?dates=${todayYmd}`
        ),
        fetchJsonWithTimeout(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${feedCfg.slug}/scoreboard`
        ),
      ]);
      ingestEvents(defaultJson, feedCfg);
      ingestEvents(todayJson, feedCfg);

      // On full daily sync, also fetch yesterday's results and tomorrow's upcoming schedule
      if (!quickLiveOnly && (feedCfg.slug === 'all' || feedCfg.priority >= 8)) {
        const [yestJson, tomJson] = await Promise.all([
          fetchJsonWithTimeout(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${feedCfg.slug}/scoreboard?dates=${yesterdayYmd}`
          ),
          fetchJsonWithTimeout(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${feedCfg.slug}/scoreboard?dates=${tomorrowYmd}`
          ),
        ]);
        ingestEvents(yestJson, feedCfg);
        ingestEvents(tomJson, feedCfg);
      }
    })
  );

  const allEntries = Array.from(resultsById.values());

  const statusRank = (s: FootballMatchStatus): number => {
    if (s === 'LIVE_1H' || s === 'LIVE_2H' || s === 'HT') return 0;
    if (s === 'UPCOMING') return 1;
    return 2;
  };

  // Separate live matches, high-priority flagship league matches, and general international matches
  const liveMatches = allEntries
    .filter((e) => statusRank(e.data.status) === 0)
    .map((e) => e.data);

  const flagshipUpcoming = allEntries
    .filter((e) => statusRank(e.data.status) === 1 && e.priority >= 8)
    .sort((a, b) => a.data.kickoffAt - b.data.kickoffAt)
    .map((e) => e.data);

  const generalUpcoming = allEntries
    .filter((e) => statusRank(e.data.status) === 1 && e.priority < 8)
    .sort((a, b) => a.data.kickoffAt - b.data.kickoffAt)
    .map((e) => e.data);

  const finishedMatches = allEntries
    .filter((e) => statusRank(e.data.status) === 2)
    .sort((a, b) => b.data.kickoffAt - a.data.kickoffAt)
    .map((e) => e.data)
    .slice(0, 45);

  const combinedUpcoming = [...flagshipUpcoming, ...generalUpcoming].slice(0, 65);
  // Sort the selected upcoming matches chronologically by kickoff time
  combinedUpcoming.sort((a, b) => a.kickoffAt - b.kickoffAt);

  return [...liveMatches, ...combinedUpcoming, ...finishedMatches];
}

