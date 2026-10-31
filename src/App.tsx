/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { HistoryStrip } from './components/HistoryStrip';
import { AviatorCanvas } from './components/AviatorCanvas';
import { BetPanel } from './components/BetPanel';
import { AuthModal } from './components/AuthModal';
import { PaystackDepositModal } from './components/PaystackDepositModal';
import { WithdrawModal } from './components/WithdrawModal';
import { TermsModal } from './components/TermsModal';
import { TransactionsModal } from './components/TransactionsModal';
import { ResponsibleFooter } from './components/ResponsibleFooter';
import { ActiveBet, GameRound, PastRound, UserProfile, Wallet } from './types';
import {
  syncUserSession,
  placeBetRequest,
  cashOutBetRequest,
  cancelBetRequest,
} from './lib/engineService';
import { Volume2, VolumeX } from 'lucide-react';
import { LigiBigiGame } from './features/virtuals/LigiBigiGame';
import { PenaltyShootoutGame } from './features/virtuals/PenaltyShootoutGame';

// Base URL for the backend API (Render in production, empty → same origin locally).
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('flyjet_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [wallet, setWallet] = useState<Wallet | null>(() => {
    try {
      const saved = localStorage.getItem('flyjet_wallet');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Active Game State — bootstrapped from /api/game/state and SSE
  const [currentRound, setCurrentRound] = useState<GameRound | null>(null);
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [countdown, setCountdown] = useState<number>(5.0);
  const [roundHistory, setRoundHistory] = useState<PastRound[]>([]);

  // Player Bets (panelIndex -> bet)
  const [activeBets, setActiveBets] = useState<Map<number, ActiveBet>>(new Map());
  const [isLoadingBet, setIsLoadingBet] = useState(false);

  // Modals & Navigation
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isTransactionsOpen, setIsTransactionsOpen] = useState(false);

  const [activeTab, setActiveTabState] = useState(() => {
    if (typeof window === 'undefined') return 'game';
    if (window.location.pathname.startsWith('/ligibigi')) return 'ligibigi';
    if (window.location.pathname.startsWith('/penalty-shootout')) return 'penalty-shootout';
    return 'game';
  });

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    try {
      if (tab === 'ligibigi') {
        window.history.pushState({}, '', '/ligibigi');
      } else if (tab === 'penalty-shootout') {
        window.history.pushState({}, '', '/penalty-shootout');
      } else {
        window.history.pushState({}, '', '/');
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const handlePop = () => {
      if (window.location.pathname.startsWith('/ligibigi')) {
        setActiveTabState('ligibigi');
      } else if (window.location.pathname.startsWith('/penalty-shootout')) {
        setActiveTabState('penalty-shootout');
      } else {
        setActiveTabState('game');
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Audio System (Initially OFF/muted unless the user explicitly turns it on)
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const isMutedRef = useRef<boolean>(isMuted);
  isMutedRef.current = isMuted;
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Refs for real-time engine access to latest state
  const currentRoundRef = useRef<GameRound | null>(currentRound);
  currentRoundRef.current = currentRound;
  const activeBetsRef = useRef<Map<number, ActiveBet>>(activeBets);
  activeBetsRef.current = activeBets;
  const userRef = useRef<UserProfile | null>(user);
  userRef.current = user;
  const walletRef = useRef<Wallet | null>(wallet);
  walletRef.current = wallet;

  const playTone = (freq: number, type: OscillatorType = 'sine', duration = 0.15, vol = 0.08) => {
    if (isMutedRef.current) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio autoplay policy catch
    }
  };

  // Sync wallet to localStorage whenever updated
  useEffect(() => {
    if (wallet) {
      localStorage.setItem('flyjet_wallet', JSON.stringify(wallet));
    } else {
      localStorage.removeItem('flyjet_wallet');
    }
  }, [wallet]);

  // Fetch Wallet when User changes
  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    syncUserSession(user.id).then((res) => {
      if (mounted && res) {
        setUser(res.user);
        setWallet(res.wallet);
        localStorage.setItem('flyjet_user', JSON.stringify(res.user));
      }
    });
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // Real-Time Aviator Engine: server-authoritative via SSE + /api/game/state bootstrap.
  // No client-side round generation — the server owns all rounds, seeds, and outcomes.
  useEffect(() => {
    let cancelled = false;
    let eventSource: EventSource | null = null;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let lastCrashAt = 0;

    async function bootstrap() {
      try {
        const res = await fetch(`${API_BASE}/api/game/state`);
        if (!res.ok) throw new Error(`state ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.currentRound) setCurrentRound(data.currentRound);
        if (typeof data.currentMultiplier === 'number') setMultiplier(data.currentMultiplier);
        if (typeof data.countdown === 'number') setCountdown(data.countdown);
        if (Array.isArray(data.history)) setRoundHistory(data.history);
      } catch (err) {
        console.warn('Bootstrap game state failed:', err);
      }
    }

    function connect() {
      if (cancelled) return;
      eventSource?.close();
      eventSource = new EventSource(`${API_BASE}/api/game/events`);

      eventSource.addEventListener('open', () => {
        reconnectAttempt = 0;
      });

      eventSource.addEventListener('init', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.currentRound) setCurrentRound(data.currentRound);
          if (typeof data.currentMultiplier === 'number') setMultiplier(data.currentMultiplier);
          if (typeof data.countdown === 'number') setCountdown(data.countdown);
          if (Array.isArray(data.history) && data.history.length) {
            setRoundHistory(data.history);
          }
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('multiplier_tick', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.status === 'waiting') {
             if (Date.now() - lastCrashAt < 2000) return;
            if (typeof data.countdown === 'number') setCountdown(data.countdown);
            setMultiplier(1.0);
            setCurrentRound((prev) =>
              prev
                ? { ...prev, status: 'waiting', id: data.roundId, serverSeedHash: data.serverSeedHash }
                : {
                    id: data.roundId,
                    status: 'waiting',
                    serverSeedHash: data.serverSeedHash,
                    clientSeed: '',
                    nonce: 0,
                  }
            );
          } else if (data.status === 'in_flight') {
            if (typeof data.multiplier === 'number') setMultiplier(data.multiplier);
            setCurrentRound((prev) =>
              prev ? { ...prev, status: 'in_flight', id: data.roundId } : null
            );
          }
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('round_started', (e: MessageEvent) => {
        try {
          if (Date.now() - lastCrashAt < 2000) return;
          const data = JSON.parse(e.data);
          setCurrentRound({
            id: data.roundId,
            status: 'in_flight',
            serverSeedHash: data.serverSeedHash,
            clientSeed: data.clientSeed,
            nonce: data.nonce,
          });
          setMultiplier(1.0);
          playTone(440, 'sine', 0.25, 0.1);
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('round_crashed', (e: MessageEvent) => {
  try {
    const data = JSON.parse(e.data);
    lastCrashAt = Date.now();
    // Payload is a PastRound object: { id, multiplier, serverSeed,
    // serverSeedHash, clientSeed, nonce, endedAt }
    setRoundHistory((prev) => {
      if (!data?.id) return prev;
      if (prev.some((r) => r.id === data.id)) return prev; // dedupe
      return [
        {
          id: data.id,
          multiplier: Number(data.multiplier),
          serverSeed: data.serverSeed,
          serverSeedHash: data.serverSeedHash,
          clientSeed: data.clientSeed ?? '',
          nonce: Number(data.nonce ?? 0),
          endedAt: data.endedAt ?? new Date().toISOString(),
        },
        ...prev.slice(0, 49),
      ];
    });

    setMultiplier(Number(data.multiplier));
    playTone(180, 'sawtooth', 0.35, 0.12);

    setActiveBets((prev) => {
      const next = new Map(prev);
      for (const [panel, bet] of next.entries()) {
        if (bet.status === 'placed') {
          next.set(panel, { ...bet, status: 'crashed' });
        }
      }
      return next;
    });

    setCurrentRound((prev) =>
      prev
        ? {
            ...prev,
            status: 'crashed',
            crashMultiplier: Number(data.multiplier),
            serverSeedRevealed: data.serverSeed,
          }
        : null
    );
  } catch {
    // ignore
  }
});
      eventSource.addEventListener('round_waiting', (e: MessageEvent) => {
        try {
           if (Date.now() - lastCrashAt < 2000) return;
          const data = JSON.parse(e.data);
          setCurrentRound({
            id: data.roundId,
            status: 'waiting',
            serverSeedHash: data.serverSeedHash,
            clientSeed: data.clientSeed ?? '',
            nonce: data.nonce ?? 0,
          });
          setCountdown(data.countdown || 5.0);
          setMultiplier(1.0);
          setActiveBets(new Map());
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('bet_cashed_out', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (userRef.current && data.userId === userRef.current.id) {
            playTone(880, 'triangle', 0.3, 0.15);
            setWallet((prev) =>
              prev
                ? { ...prev, balanceKes: data.newBalanceKes, updatedAt: new Date().toISOString() }
                : null
            );
            setActiveBets((prev) => {
              const next = new Map(prev);
              const existing = next.get(data.panelIndex);
              if (existing) {
                next.set(data.panelIndex, {
                  ...existing,
                  status: 'cashed_out',
                  cashoutMultiplier: data.multiplier,
                  winAmountKes: data.winAmountKes,
                });
              }
              return next;
            });
          }
        } catch {
          // ignore
        }
      });

      eventSource.onerror = () => {
        eventSource?.close();
        if (cancelled) return;
        const delay = Math.min(30000, 500 * 2 ** reconnectAttempt++);
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    bootstrap().then(connect);

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, []);

  // Bet Actions (Strictly only allowed during the waiting period before takeoff)
  const handlePlaceBet = async (
    panelIndex: number,
    stakeKes: number,
    autoCashoutMult: number | null
  ) => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    const round = currentRoundRef.current;
    if (!round || round.status !== 'waiting') {
      return;
    }

    if ((wallet?.balanceKes ?? 0) < stakeKes) {
      setIsDepositOpen(true);
      return;
    }

    setIsLoadingBet(true);
    try {
      const result = await placeBetRequest({
        userId: user.id,
        roundId: round.id,
        stakeKes,
        panelIndex,
        autoCashoutMultiplier: autoCashoutMult,
        currentBalanceKes: wallet?.balanceKes ?? 0,
      });

      playTone(520, 'sine', 0.1, 0.08);
      setWallet((prev) =>
        prev
          ? { ...prev, balanceKes: result.remainingBalanceKes, updatedAt: new Date().toISOString() }
          : { userId: user.id, balanceKes: result.remainingBalanceKes, updatedAt: new Date().toISOString() }
      );

      setActiveBets((prev) => {
        const next = new Map(prev);
        next.set(panelIndex, result.bet);
        return next;
      });
    } catch (err: any) {
      console.warn('Error placing bet:', err.message);
    } finally {
      setIsLoadingBet(false);
    }
  };

  const handleCashOut = async (panelIndex: number) => {
    if (!user) return;
    const existingBet = activeBets.get(panelIndex);
    if (!existingBet || existingBet.status !== 'placed') return;

    setIsLoadingBet(true);

    try {
      const result = await cashOutBetRequest({
        userId: user.id,
        panelIndex,
        bet: existingBet,
        currentMultiplier: multiplier,
        currentBalanceKes: wallet?.balanceKes ?? 0,
      });

      playTone(880, 'triangle', 0.25, 0.15);
      setWallet((prev) =>
        prev ? { ...prev, balanceKes: result.newBalanceKes, updatedAt: new Date().toISOString() } : null
      );

      setActiveBets((prev) => {
        const next = new Map(prev);
        const bet = next.get(panelIndex);
        if (bet) {
          next.set(panelIndex, {
            ...bet,
            status: 'cashed_out',
            cashoutMultiplier: result.multiplier,
            winAmountKes: result.winAmountKes,
          });
        }
        return next;
      });
    } catch (err: any) {
      console.warn('Cashout error:', err.message);
    } finally {
      setIsLoadingBet(false);
    }
  };

  const handleCancelBet = async (panelIndex: number) => {
    if (!user) return;
    const existingBet = activeBets.get(panelIndex);
    if (!existingBet || existingBet.status !== 'placed') return;

    const round = currentRoundRef.current;
    if (!round || round.status !== 'waiting') return;

    try {
      const result = await cancelBetRequest({
        userId: user.id,
        panelIndex,
        bet: existingBet,
        currentBalanceKes: wallet?.balanceKes ?? 0,
      });

      setWallet((prev) =>
        prev ? { ...prev, balanceKes: result.newBalanceKes, updatedAt: new Date().toISOString() } : null
      );
      setActiveBets((prev) => {
        const next = new Map(prev);
        next.delete(panelIndex);
        return next;
      });
    } catch (err) {
      console.error('Failed to cancel bet', err);
    }
  };

  const handleSignOut = () => {
    setUser(null);
    setWallet(null);
    localStorage.removeItem('flyjet_user');
    localStorage.removeItem('flyjet_wallet');
  };

  // Gate: block rendering of the game UI until the server has supplied an active round.
  // Placed after all hooks to respect the Rules of Hooks.
  if (!currentRound) {
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500 mx-auto mb-4" />
          <p className="text-slate-400">Connecting to game engine…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Top Bar Header */}
      <Header
        user={user}
        wallet={wallet}
        onOpenDeposit={() => {
          if (!user) {
            setIsAuthOpen(true);
          } else {
            setIsDepositOpen(true);
          }
        }}
        onOpenWithdraw={() => {
          if (!user) {
            setIsAuthOpen(true);
          } else {
            setIsWithdrawOpen(true);
          }
        }}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenTerms={() => setIsTermsOpen(true)}
        onOpenTransactions={() => setIsTransactionsOpen(true)}
        onSignOut={handleSignOut}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2 sm:p-4 md:p-6 flex flex-col gap-3">
        {activeTab === 'ligibigi' ? (
          <LigiBigiGame
            user={user}
            wallet={wallet}
            onWalletUpdate={(newBalanceKes) => {
              setWallet((prev) =>
                prev
                  ? { ...prev, balanceKes: newBalanceKes, updatedAt: new Date().toISOString() }
                  : user
                  ? { userId: user.id, balanceKes: newBalanceKes, updatedAt: new Date().toISOString() }
                  : null
              );
            }}
            onOpenAuth={() => setIsAuthOpen(true)}
            onOpenDeposit={() => {
              if (!user) setIsAuthOpen(true);
              else setIsDepositOpen(true);
            }}
          />
        ) : activeTab === 'penalty-shootout' ? (
          <PenaltyShootoutGame
            user={user}
            wallet={wallet}
            onWalletUpdate={(newBalanceKes) => {
              setWallet((prev) =>
                prev
                  ? { ...prev, balanceKes: newBalanceKes, updatedAt: new Date().toISOString() }
                  : user
                  ? { userId: user.id, balanceKes: newBalanceKes, updatedAt: new Date().toISOString() }
                  : null
              );
            }}
            onOpenAuth={() => setIsAuthOpen(true)}
            onOpenDeposit={() => {
              if (!user) setIsAuthOpen(true);
              else setIsDepositOpen(true);
            }}
          />
        ) : (
          /* Game Stage Card */
          <div className="flex-1 max-w-3xl w-full mx-auto flex flex-col gap-2.5 bg-[#0e1015] p-2 sm:p-3 rounded-2xl border border-white/5 shadow-2xl">
            {/* Top of Canvas: Multiplier History Bar & Audio Control */}
            <div className="flex items-center justify-between bg-[#14161c] rounded-xl px-2.5 py-1 border border-white/5">
              <div className="flex-1 overflow-hidden">
                <HistoryStrip history={roundHistory} />
              </div>
              <button
                onClick={() => setIsMuted(!isMuted)}
                title={isMuted ? 'Sound Off (Click to Turn On)' : 'Sound On (Click to Mute)'}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-2 cursor-pointer shrink-0 flex items-center gap-1"
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-slate-500" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
              </button>
            </div>

            {/* Central Aviator Canvas */}
            <AviatorCanvas
              currentRound={currentRound}
              multiplier={multiplier}
              countdown={countdown}
            />

            {/* Bottom Dual Bet Controls & All Bets / Previous / Top Feed */}
            <BetPanel
              wallet={wallet}
              currentRound={currentRound}
              multiplier={multiplier}
              activeBets={activeBets}
              roundHistory={roundHistory}
              onPlaceBet={handlePlaceBet}
              onCashOut={handleCashOut}
              onCancelBet={handleCancelBet}
              onOpenDeposit={() => {
                if (!user) setIsAuthOpen(true);
                else setIsDepositOpen(true);
              }}
              onOpenWithdraw={() => {
                if (!user) setIsAuthOpen(true);
                else setIsWithdrawOpen(true);
              }}
              isLoading={isLoadingBet}
            />
          </div>
        )}
      </main>

      {/* Responsible Gaming Footer with Helpline */}
      <ResponsibleFooter onOpenTerms={() => setIsTermsOpen(true)} />

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(u, w) => {
          setUser(u);
          setWallet(w);
          localStorage.setItem('flyjet_user', JSON.stringify(u));
          localStorage.setItem('flyjet_wallet', JSON.stringify(w));
        }}
        onOpenTerms={() => setIsTermsOpen(true)}
      />

      <PaystackDepositModal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        user={user}
        wallet={wallet}
        onDepositSuccess={(newBal) => {
          setWallet((prev) =>
            prev
              ? { ...prev, balanceKes: newBal, updatedAt: new Date().toISOString() }
              : user
              ? { userId: user.id, balanceKes: newBal, updatedAt: new Date().toISOString() }
              : null
          );
        }}
      />

      <WithdrawModal
        isOpen={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        user={user}
        wallet={wallet}
        onWithdrawSuccess={(newBal) => {
          setWallet((prev) =>
            prev ? { ...prev, balanceKes: newBal, updatedAt: new Date().toISOString() } : null
          );
        }}
      />

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />

      <TransactionsModal
        isOpen={isTransactionsOpen}
        onClose={() => setIsTransactionsOpen(false)}
        user={user}
      />
    </div>
  );
}