import { fetchServerlessFootballMatches } from './state';

export default async function handler(req: any, res: any) {
  try {
    const matches = await fetchServerlessFootballMatches();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      syncedMatchesCount: matches.length,
      lastSyncedAt: new Date().toISOString(),
      matches,
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      matches: [],
      error: err?.message || 'Failed to sync football matches',
    });
  }
}
