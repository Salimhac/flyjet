import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FootballMarketKey,
  FootballMatchDTO,
  LiveMatchPublicFeedBetDTO,
  LiveMatchSocketEnvelope,
  LiveMatchTicketDTO,
} from './types';
import {
  autoSettleClientTickets,
  fetchBrowserRealWorldMatches,
  getClientStoredTickets,
  getInitialFallbackMatches,
} from './clientFootballEngine';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface BetSlipItem {
  selectionId: string; // "${matchId}:${marketKey}:${outcomeKey}"
  matchId: string;
  fixtureCode: number;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  isEarlyBet: boolean;
  matchStatus: string;
  marketKey: FootballMarketKey;
  marketName: string;
  outcomeKey: string;
  outcomeLabel: string;
  odds: number;
}

export function useLiveMatchesSocket(
  activeMatchId?: string,
  userId?: string,
  walletBalanceKes?: number,
  onWalletUpdate?: (newBalanceKes: number) => void
) {
  // Initialize immediately with cached real-world matches or dynamic slate so Vercel never renders an empty screen
  const [matches, setMatches] = useState<FootballMatchDTO[]>(() => getInitialFallbackMatches());
  const [recentPublicBets, setRecentPublicBets] = useState<LiveMatchPublicFeedBetDTO[]>([]);
  const [userTickets, setUserTickets] = useState<LiveMatchTicketDTO[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<number>(285);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connected');
  const [latencyMs, setLatencyMs] = useState<number>(18);
  const [clockOffsetMs, setClockOffsetMs] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>(() => new Date().toISOString());
  const [isSyncingFeed, setIsSyncingFeed] = useState<boolean>(false);

  // Persistent Bet Slip State
  const [betSlip, setBetSlip] = useState<BetSlipItem[]>(() => {
    try {
      const saved = localStorage.getItem('lm_football_betslip');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [stakeInput, setStakeInput] = useState<string>(() => {
    try {
      const savedStake = localStorage.getItem('lm_football_stake_kes');
      return savedStake && Number(savedStake) >= 10 ? savedStake : '50';
    } catch {
      return '50';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('lm_football_betslip', JSON.stringify(betSlip));
    } catch {
      // ignore storage errors
    }
  }, [betSlip]);

  useEffect(() => {
    try {
      localStorage.setItem('lm_football_stake_kes', stakeInput);
    } catch {
      // ignore storage errors
    }
  }, [stakeInput]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync live odds inside the user's Bet Slip whenever matches update (and remove matches that just reached FT from an unplaced slip)
  useEffect(() => {
    if (matches.length === 0 || betSlip.length === 0) return;
    setBetSlip((prev) =>
      prev
        .map((item) => {
          const m = matches.find((mt) => mt.id === item.matchId);
          if (!m) return item;
          if (m.status === 'FT') return null;
          const mkt = m.markets.find((mk) => mk.marketKey === item.marketKey);
          const sel = mkt?.selections.find((s) => s.outcomeKey === item.outcomeKey);
          if (!sel || sel.suspended) return item;
          return {
            ...item,
            odds: sel.odds,
            isEarlyBet: m.status === 'UPCOMING',
            matchStatus: m.status,
          };
        })
        .filter((x): x is BetSlipItem => x !== null)
    );
  }, [matches]);

  // Automatically grade and settle client-stored tickets when real-world matches update or reach FT
  useEffect(() => {
    if (!userId || matches.length === 0) return;
    void autoSettleClientTickets({
      userId,
      matches,
      currentBalanceKes: walletBalanceKes,
    }).then((res) => {
      if (res.creditedKes > 0 && typeof res.newBalanceKes === 'number' && onWalletUpdate) {
        onWalletUpdate(res.newBalanceKes);
      }
      if (res.tickets.length > 0) {
        setUserTickets((prev) => {
          const clientIds = new Set(res.tickets.map((t) => t.id));
          const serverOnly = prev.filter((t) => !clientIds.has(t.id));
          return [...res.tickets, ...serverOnly];
        });
      }
    });
  }, [matches, userId]);

  const syncFromBrowserEspn = useCallback(async (quick = false) => {
    try {
      const browserMatches = await fetchBrowserRealWorldMatches(quick);
      if (browserMatches.length > 0) {
        setMatches(browserMatches);
        setLastSyncedAt(new Date().toISOString());
        setConnectionState('connected');
      }
    } catch {
      // keep existing matches
    }
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/live-matches/state');
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        await syncFromBrowserEspn(false);
        return;
      }
      const json = await res.json();
      if (Array.isArray(json.matches) && json.matches.length > 0) {
        setMatches(json.matches);
        // Also run a browser-direct ESPN sync if the snapshot has very few matches
        if (json.matches.length < 12) {
          void syncFromBrowserEspn(false);
        }
      } else {
        await syncFromBrowserEspn(false);
      }
      if (Array.isArray(json.recentPublicBets)) {
        setRecentPublicBets(json.recentPublicBets);
      }
      if (typeof json.onlinePlayers === 'number') {
        setOnlinePlayers(json.onlinePlayers);
      }
      if (typeof json.serverTimestamp === 'number') {
        setClockOffsetMs(json.serverTimestamp - Date.now());
      }
      if (typeof json.lastSyncedAt === 'string') {
        setLastSyncedAt(json.lastSyncedAt);
      }
    } catch {
      await syncFromBrowserEspn(false);
    }
  }, [syncFromBrowserEspn]);

  const refreshUserTickets = useCallback(async () => {
    if (!userId) {
      setUserTickets([]);
      return;
    }
    const settledCheck = await autoSettleClientTickets({
      userId,
      matches,
      currentBalanceKes: walletBalanceKes,
    });
    if (
      settledCheck.creditedKes > 0 &&
      typeof settledCheck.newBalanceKes === 'number' &&
      onWalletUpdate
    ) {
      onWalletUpdate(settledCheck.newBalanceKes);
    }
    const localTickets = settledCheck.tickets.length
      ? settledCheck.tickets
      : getClientStoredTickets(userId);

    try {
      const res = await fetch(`/api/live-matches/history?userId=${encodeURIComponent(userId)}`, {
        headers: { 'x-user-id': userId },
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        setUserTickets(localTickets);
        return;
      }
      const json = await res.json();
      if (Array.isArray(json.tickets)) {
        const serverIds = new Set(json.tickets.map((t: LiveMatchTicketDTO) => t.id));
        const merged = [
          ...json.tickets,
          ...localTickets.filter((t) => !serverIds.has(t.id)),
        ];
        setUserTickets(merged);
      } else {
        setUserTickets(localTickets);
      }
    } catch {
      setUserTickets(localTickets);
    }
  }, [userId, matches, walletBalanceKes, onWalletUpdate]);

  useEffect(() => {
    fetchSnapshot();
    refreshUserTickets();
  }, [fetchSnapshot]);

  // Continuously poll real-world live matches, scores, and completed results every 20 seconds
  useEffect(() => {
    const triggerBackgroundSync = async (quick = false) => {
      try {
        // Fetch directly from browser ESPN in parallel with /api/live-matches/sync for maximum freshness on Vercel
        const browserPromise = fetchBrowserRealWorldMatches(quick);
        const apiPromise = fetch('/api/live-matches/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quick }),
        }).catch(() => null);

        const [browserMatches, apiRes] = await Promise.all([browserPromise, apiPromise]);

        if (browserMatches && browserMatches.length > 0) {
          setMatches(browserMatches);
          setLastSyncedAt(new Date().toISOString());
          setConnectionState('connected');
          return;
        }

        if (apiRes && apiRes.ok) {
          const contentType = apiRes.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await apiRes.json();
            if (Array.isArray(json.matches) && json.matches.length > 0) {
              setMatches(json.matches);
              setLastSyncedAt(json.lastSyncedAt || new Date().toISOString());
            }
          }
        }
      } catch {
        await syncFromBrowserEspn(quick);
      }
    };

    // Immediate full sync on mount
    void triggerBackgroundSync(false);

    // Poll every 20 seconds so live scores, match minutes, and full-time results update automatically
    const fastInterval = setInterval(() => {
      void triggerBackgroundSync(true);
    }, 20_000);

    // Full multi-day/multi-league refresh every 90 seconds
    const fullInterval = setInterval(() => {
      void triggerBackgroundSync(false);
    }, 90_000);

    return () => {
      clearInterval(fastInterval);
      clearInterval(fullInterval);
    };
  }, [syncFromBrowserEspn]);

  // Periodically refresh user tickets when user has open bets so live cashout offers & FT settlements stay synced
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => {
      refreshUserTickets();
    }, 5000);
    return () => clearInterval(interval);
  }, [userId, refreshUserTickets]);

  useEffect(() => {
    let unmounted = false;
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    const connectWs = () => {
      if (unmounted) return;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const query = new URLSearchParams();
        if (activeMatchId) query.set('matchId', activeMatchId);
        if (userId) query.set('userId', userId);
        const wsUrl = `${proto}//${window.location.host}/ws/live-matches?${query.toString()}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmounted) return;
          setConnectionState('connected');
          pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping', clientTimestamp: Date.now() }));
            }
          }, 5000);
        };

        ws.onmessage = (evt) => {
          if (unmounted) return;
          try {
            const envelope: LiveMatchSocketEnvelope<any> = JSON.parse(evt.data);
            if (envelope.serverTimestamp) {
              setClockOffsetMs(envelope.serverTimestamp - Date.now());
            }

            if (envelope.event === 'matches:snapshot' || envelope.event === 'match:tick') {
              const snap = envelope.data;
              if (snap && Array.isArray(snap.matches) && snap.matches.length > 0) {
                setMatches(snap.matches);
              }
              if (snap && Array.isArray(snap.recentPublicBets)) {
                setRecentPublicBets(snap.recentPublicBets);
              }
              if (snap && typeof snap.onlinePlayers === 'number') {
                setOnlinePlayers(snap.onlinePlayers);
              }
              if (snap && typeof snap.lastSyncedAt === 'string') {
                setLastSyncedAt(snap.lastSyncedAt);
              }
            } else if (
              envelope.event === 'match:kickoff' ||
              envelope.event === 'match:settled'
            ) {
              const updatedMatch: FootballMatchDTO = envelope.data;
              if (updatedMatch?.id) {
                setMatches((prev) =>
                  prev.map((m) => (m.id === updatedMatch.id ? updatedMatch : m))
                );
              }
              refreshUserTickets();
            } else if (envelope.event === 'match:event') {
              const updatedMatch: FootballMatchDTO = envelope.data?.match;
              if (updatedMatch?.id) {
                setMatches((prev) =>
                  prev.map((m) => (m.id === updatedMatch.id ? updatedMatch : m))
                );
              }
              refreshUserTickets();
            } else if (envelope.event === 'bet:placed') {
              const betFeed: LiveMatchPublicFeedBetDTO = envelope.data;
              if (betFeed?.id) {
                setRecentPublicBets((prev) => [
                  betFeed,
                  ...prev.filter((b) => b.id !== betFeed.id),
                ].slice(0, 25));
              }
            } else if (envelope.event === 'pong') {
              const sentAt = envelope.data?.clientTimestamp;
              if (typeof sentAt === 'number') {
                setLatencyMs(Math.max(4, Date.now() - sentAt));
              }
            }
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          if (pingInterval) clearInterval(pingInterval);
          if (unmounted) return;
          setConnectionState('connected');
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setConnectionState('connected');
      }
    };

    connectWs();

    return () => {
      unmounted = true;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [activeMatchId, userId, refreshUserTickets]);

  const toggleSlipSelection = useCallback((item: BetSlipItem) => {
    setBetSlip((prev) => {
      const exactExists = prev.some((s) => s.selectionId === item.selectionId);
      if (exactExists) {
        return prev.filter((s) => s.selectionId !== item.selectionId);
      }
      // Replace any existing selection from the same match (single-pick-per-match rule)
      const withoutSameMatch = prev.filter((s) => s.matchId !== item.matchId);
      return [...withoutSameMatch, item];
    });
  }, []);

  const removeSlipSelection = useCallback((selectionId: string) => {
    setBetSlip((prev) => prev.filter((s) => s.selectionId !== selectionId));
  }, []);

  const clearBetSlip = useCallback(() => {
    setBetSlip([]);
  }, []);

  const forceResync = useCallback(() => {
    fetchSnapshot();
    refreshUserTickets();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'resync' }));
    }
  }, [fetchSnapshot, refreshUserTickets]);

  const syncLiveFeed = useCallback(async () => {
    setIsSyncingFeed(true);
    try {
      const browserMatches = await fetchBrowserRealWorldMatches(false);
      if (browserMatches.length > 0) {
        setMatches(browserMatches);
        setLastSyncedAt(new Date().toISOString());
      } else {
        const res = await fetch('/api/live-matches/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quick: false }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const json = await res.json();
          if (Array.isArray(json.matches) && json.matches.length > 0) {
            setMatches(json.matches);
          }
          if (typeof json.lastSyncedAt === 'string') setLastSyncedAt(json.lastSyncedAt);
        }
      }
    } catch {
      await syncFromBrowserEspn(false);
    } finally {
      setIsSyncingFeed(false);
    }
  }, [syncFromBrowserEspn]);

  const activeMatch =
    matches.find((m) => m.id === activeMatchId) || matches[0] || null;

  return {
    matches,
    activeMatch,
    recentPublicBets,
    userTickets,
    refreshUserTickets,
    onlinePlayers,
    connectionState,
    latencyMs,
    clockOffsetMs,
    lastSyncedAt,
    isSyncingFeed,
    syncLiveFeed,
    betSlip,
    stakeInput,
    setStakeInput,
    toggleSlipSelection,
    removeSlipSelection,
    clearBetSlip,
    forceResync,
  };
}
