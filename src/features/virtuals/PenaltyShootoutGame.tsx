import React, { useState, useRef, useEffect } from 'react';
import {
  Minus,
  Plus,
  Shuffle,
  CheckCircle2,
  AlertCircle,
  Trophy,
  Wallet as WalletIcon,
} from 'lucide-react';
import { UserProfile, Wallet } from '../../types';
import { supabase } from '../../lib/supabase';

interface PenaltyShootoutGameProps {
  user: UserProfile | null;
  wallet: Wallet | null;
  onWalletUpdate: (newBalanceKes: number) => void;
  onOpenAuth: () => void;
  onOpenDeposit: () => void;
}

type TargetZoneId = 'TOP_LEFT' | 'TOP_RIGHT' | 'CENTER' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT';

interface TargetZone {
  id: TargetZoneId;
  label: string;
  rx: number;
  ry: number;
}

const GOAL_ZONES: TargetZone[] = [
  { id: 'TOP_LEFT', label: 'Top Left', rx: 0.19, ry: 0.28 },
  { id: 'TOP_RIGHT', label: 'Top Right', rx: 0.81, ry: 0.28 },
  { id: 'CENTER', label: 'Center', rx: 0.5, ry: 0.38 },
  { id: 'BOTTOM_LEFT', label: 'Bottom Left', rx: 0.2, ry: 0.74 },
  { id: 'BOTTOM_RIGHT', label: 'Bottom Right', rx: 0.8, ry: 0.74 },
];

const MULTIPLIER_LADDER = [1.92, 3.68, 7.07, 13.58, 26.07];

const TEAM_KITS = [
  { id: 'ken', name: 'Harambee Stars', color: '#dc2626', trim: '#16a34a' },
  { id: 'eng', name: 'England', color: '#f8fafc', trim: '#1d4ed8' },
  { id: 'bra', name: 'Brazil', color: '#facc15', trim: '#15803d' },
  { id: 'fra', name: 'France', color: '#1e40af', trim: '#ef4444' },
  { id: 'esp', name: 'Spain', color: '#b91c1c', trim: '#eab308' },
  { id: 'arg', name: 'Argentina', color: '#38bdf8', trim: '#ffffff' },
];

export const PenaltyShootoutGame: React.FC<PenaltyShootoutGameProps> = ({
  user,
  wallet,
  onWalletUpdate,
  onOpenAuth,
  onOpenDeposit,
}) => {
  const [selectedKit, setSelectedKit] = useState(TEAM_KITS[0]);
  const [stakeKes, setStakeKes] = useState<number>(50);
  const [roundState, setRoundState] = useState<
    'IDLE' | 'ACTIVE' | 'SHOOTING' | 'SAVED' | 'CASHED_OUT'
  >('IDLE');
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [activeStakeKes, setActiveStakeKes] = useState<number>(50);
  const [lastOutcomeBanner, setLastOutcomeBanner] = useState<{
    type: 'goal' | 'saved' | 'cashout';
    text: string;
  } | null>(null);
  const [history, setHistory] = useState<
    Array<{
      id: string;
      stakeKes: number;
      multiplier: number;
      payoutKes: number;
      won: boolean;
    }>
  >([]);

  const [shotAnim, setShotAnim] = useState<{
    targetZone: TargetZoneId;
    keeperZone: TargetZoneId;
    isGoal: boolean;
    progress: number;
  } | null>(null);

  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const currentMultiplier = currentStep > 0 ? MULTIPLIER_LADDER[currentStep - 1] : 1.0;
  const nextMultiplier = MULTIPLIER_LADDER[Math.min(4, currentStep)];
  const currentCashoutKes =
    currentStep > 0 ? Number((activeStakeKes * currentMultiplier).toFixed(2)) : 0;

  const updateWalletBalance = (newBal: number) => {
    onWalletUpdate(newBal);
    if (supabase && user) {
      supabase
        .from('wallets')
        .update({ balance_kes: newBal, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .then(() => {});
    }
  };

  const handleStartRound = () => {
    setLastOutcomeBanner(null);
    if (!user) {
      onOpenAuth();
      return;
    }
    if (stakeKes < 10) return;
    const bal = wallet?.balanceKes ?? 0;
    if (bal < stakeKes) {
      onOpenDeposit();
      return;
    }
    const newBal = Number((bal - stakeKes).toFixed(2));
    updateWalletBalance(newBal);
    setActiveStakeKes(stakeKes);
    setCurrentStep(0);
    setShotAnim(null);
    setRoundState('ACTIVE');
  };

  const handleCashOut = (stepOverride?: number) => {
    const stepToUse = stepOverride !== undefined ? stepOverride : currentStep;
    if (stepToUse <= 0) return;
    const mult = MULTIPLIER_LADDER[stepToUse - 1];
    const winKes = Number((activeStakeKes * mult).toFixed(2));
    const bal = wallet?.balanceKes ?? 0;
    const newBal = Number((bal + winKes).toFixed(2));
    updateWalletBalance(newBal);

    setRoundState('CASHED_OUT');
    setLastOutcomeBanner({
      type: 'cashout',
      text: `CASHED OUT ${winKes.toFixed(2)} KES (${mult.toFixed(2)}x)!`,
    });
    setHistory((prev) => [
      {
        id: `pen_${Date.now()}`,
        stakeKes: activeStakeKes,
        multiplier: mult,
        payoutKes: winKes,
        won: true,
      },
      ...prev.slice(0, 9),
    ]);
  };

  const triggerShoot = (zoneId: TargetZoneId) => {
    if (roundState !== 'ACTIVE') return;
    setRoundState('SHOOTING');
    setLastOutcomeBanner(null);

    const isGoal = Math.random() < 0.51;
    const otherZones = GOAL_ZONES.map((z) => z.id).filter((id) => id !== zoneId);
    const keeperZone: TargetZoneId = isGoal
      ? otherZones[Math.floor(Math.random() * otherZones.length)]
      : zoneId;

    const startTime = performance.now();
    const duration = 520;

    const stepAnim = (now: number) => {
      const p = Math.min(1, (now - startTime) / duration);
      setShotAnim({ targetZone: zoneId, keeperZone, isGoal, progress: p });

      if (p < 1) {
        animFrameRef.current = requestAnimationFrame(stepAnim);
      } else {
        if (isGoal) {
          const nextStep = currentStep + 1;
          setCurrentStep(nextStep);
          const multReached = MULTIPLIER_LADDER[nextStep - 1];
          setLastOutcomeBanner({
            type: 'goal',
            text: `GOAL! Reached ${multReached.toFixed(2)}x (${(
              activeStakeKes * multReached
            ).toFixed(2)} KES)`,
          });
          if (nextStep >= 5) {
            handleCashOut(5);
          } else {
            setTimeout(() => {
              setShotAnim(null);
              setRoundState('ACTIVE');
            }, 650);
          }
        } else {
          setRoundState('SAVED');
          setLastOutcomeBanner({
            type: 'saved',
            text: 'SAVED BY GOALKEEPER! Round Over.',
          });
          setHistory((prev) => [
            {
              id: `pen_${Date.now()}`,
              stakeKes: activeStakeKes,
              multiplier: 0,
              payoutKes: 0,
              won: false,
            },
            ...prev.slice(0, 9),
          ]);
        }
      }
    };
    animFrameRef.current = requestAnimationFrame(stepAnim);
  };

  const handleRandomShoot = () => {
    const randomZone = GOAL_ZONES[Math.floor(Math.random() * GOAL_ZONES.length)];
    triggerShoot(randomZone.id);
  };

  const keeperTargetObj = shotAnim
    ? GOAL_ZONES.find((z) => z.id === shotAnim.keeperZone)
    : null;
  const ballTargetObj = shotAnim
    ? GOAL_ZONES.find((z) => z.id === shotAnim.targetZone)
    : null;

  const keeperLeftPct =
    keeperTargetObj && shotAnim
      ? 50 + (keeperTargetObj.rx * 100 - 50) * shotAnim.progress
      : 50;
  const keeperTopPct =
    keeperTargetObj && shotAnim
      ? 58 + (keeperTargetObj.ry * 100 - 58) * shotAnim.progress
      : 58;

  const ballLeftPct =
    ballTargetObj && shotAnim
      ? 50 + (ballTargetObj.rx * 76 + 12 - 50) * shotAnim.progress
      : 50;
  const ballTopPct =
    ballTargetObj && shotAnim
      ? 88 + (ballTargetObj.ry * 52 + 14 - 88) * shotAnim.progress
      : 88;
  const ballScale = shotAnim ? 1 - shotAnim.progress * 0.42 : 1;

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-2 sm:gap-3 px-2 sm:px-0 pb-[env(safe-area-inset-bottom,0px)]">
      {/* ============ TOP MULTIPLIER PROGRESSION BAR ============ */}
      <div className="bg-[#151e27] border border-[#222e3a] rounded-xl sm:rounded-2xl p-2.5 sm:p-3 flex flex-col gap-2 sm:gap-2.5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="px-2 sm:px-2.5 py-0.5 rounded bg-[#22c55e] text-slate-950 font-extrabold text-[10px] sm:text-xs uppercase tracking-wider shrink-0">
              PENALTY SHOOTOUT
            </span>
            <span className="text-[10px] sm:text-xs text-[#8c9aa6] leading-tight">
              Score penalties &amp; cash out anytime up to 26.07x
            </span>
          </div>

          {/* Kit selector — horizontally scrollable on mobile */}
          <div className="-mx-1 px-1 flex items-center gap-1 overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible">
            {TEAM_KITS.map((kit) => (
              <button
                key={kit.id}
                type="button"
                disabled={roundState === 'ACTIVE' || roundState === 'SHOOTING'}
                onClick={() => setSelectedKit(kit)}
                className={`shrink-0 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 sm:gap-1.5 disabled:opacity-60 ${
                  selectedKit.id === kit.id
                    ? 'bg-[#242e38] text-white border border-white/20'
                    : 'text-[#8c9aa6] hover:text-white'
                }`}
              >
                <span
                  className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: kit.color }}
                />
                <span className="whitespace-nowrap">{kit.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 5-Kick Multiplier Ladder — always 5 across, scales text down on mobile */}
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
          {MULTIPLIER_LADDER.map((mult, idx) => {
            const stepNum = idx + 1;
            const completed = currentStep >= stepNum;
            const isCurrentTarget =
              (roundState === 'ACTIVE' || roundState === 'SHOOTING') &&
              currentStep === idx;

            return (
              <div
                key={mult}
                className={`rounded-lg sm:rounded-xl py-1.5 sm:py-2 px-1 sm:px-2 text-center border transition-all flex flex-col items-center justify-center min-w-0 ${
                  completed
                    ? 'bg-[#22c55e]/20 border-[#22c55e] text-[#22c55e]'
                    : isCurrentTarget
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 scale-[1.02]'
                    : 'bg-[#0e151c] border-[#222e3a] text-[#8c9aa6]'
                }`}
              >
                <span className="text-[8px] sm:text-[10px] uppercase font-bold leading-tight">
                  K{stepNum}
                </span>
                <span className="font-mono font-extrabold text-[11px] sm:text-sm md:text-base tabular-nums leading-tight">
                  {mult.toFixed(2)}x
                </span>
                <span className="text-[8px] sm:text-[10px] font-mono opacity-80 tabular-nums leading-tight truncate max-w-full">
                  {(activeStakeKes * mult).toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============ STADIUM GOAL STAGE (fluid aspect ratio) ============ */}
      <div
        className="relative w-full rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 shadow-2xl select-none bg-gradient-to-b from-[#070b14] via-[#0d1f18] to-[#14532d]"
        style={{ aspectRatio: '4 / 3', minHeight: 260 }}
      >
        <div className="absolute -top-12 left-1/4 w-48 h-32 bg-sky-400/15 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute -top-12 right-1/4 w-48 h-32 bg-emerald-400/15 blur-3xl rounded-full pointer-events-none" />

        {/* Crowd Stand */}
        <div className="absolute top-0 inset-x-0 h-[28%] bg-[#090d16] border-b-2 border-emerald-500/30 flex items-end justify-between px-2 sm:px-6 pb-1 sm:pb-2 gap-1">
          <span className="text-[8px] sm:text-[11px] font-extrabold tracking-widest uppercase text-emerald-400/70 truncate">
            STADIUM
          </span>
          <span className="text-[8px] sm:text-[11px] font-mono text-amber-400/80 truncate max-w-[40%]">
            {selectedKit.name.toUpperCase()}
          </span>
          <span className="text-[8px] sm:text-[11px] font-extrabold tracking-widest uppercase text-emerald-400/70 truncate">
            SHOOTOUT
          </span>
        </div>

        {/* Pitch lines */}
        <svg
          viewBox="0 0 1000 500"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <polygon
            points="180,160 820,160 960,495 40,495"
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="3"
          />
          <polygon
            points="310,160 690,160 760,260 240,260"
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="2.5"
          />
        </svg>

        {/* Goal frame */}
        <div className="absolute left-[6%] right-[6%] sm:left-[12%] sm:right-[12%] top-[12%] h-[54%] border-t-4 sm:border-t-[6px] border-x-4 sm:border-x-[6px] border-white rounded-t-sm shadow-[0_0_25px_rgba(255,255,255,0.25)] bg-[radial-gradient(#ffffff22_1px,transparent_1px)] [background-size:10px_10px] sm:[background-size:12px_12px]">
          {/* Target zones — scale tap size with container */}
          {GOAL_ZONES.map((zone) => {
            const canClick = roundState === 'ACTIVE';
            const isSelectedTarget = shotAnim?.targetZone === zone.id;
            return (
              <button
                key={zone.id}
                type="button"
                disabled={!canClick}
                onClick={() => triggerShoot(zone.id)}
                style={{
                  left: `${zone.rx * 100}%`,
                  top: `${zone.ry * 100}%`,
                }}
                aria-label={`Shoot ${zone.label}`}
                className={`-translate-x-1/2 -translate-y-1/2 absolute w-9 h-9 min-w-[44px] min-h-[44px] sm:w-14 sm:h-14 sm:min-w-0 sm:min-h-0 rounded-full flex items-center justify-center transition-all ${
                  canClick
                    ? 'bg-[#22c55e]/25 hover:bg-[#22c55e]/55 border-2 border-[#22c55e] text-white cursor-pointer hover:scale-110 animate-pulse shadow-lg'
                    : isSelectedTarget
                    ? 'bg-amber-500/40 border-2 border-amber-300 scale-105'
                    : 'bg-white/5 border border-white/15 opacity-40 cursor-default'
                }`}
              >
                <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-white shadow" />
              </button>
            );
          })}

          {/* Keeper */}
          <div
            style={{ left: `${keeperLeftPct}%`, top: `${keeperTopPct}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75 scale-75 sm:scale-100 origin-center"
          >
            <div className="relative flex flex-col items-center">
              <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-amber-200 border-2 border-slate-900" />
              <div className="flex items-center gap-5 sm:gap-7 -mt-1">
                <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#22c55e] border border-white shadow" />
                <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#22c55e] border border-white shadow" />
              </div>
              <div className="w-6 h-7 sm:w-8 sm:h-9 -mt-2 sm:-mt-3 rounded-md bg-amber-500 border border-slate-900 flex items-center justify-center text-[8px] sm:text-[10px] font-black text-slate-950">
                1
              </div>
              <div className="w-5 h-3 sm:w-7 sm:h-4 bg-slate-900 rounded-b-sm" />
            </div>
          </div>
        </div>

        {/* Ball */}
        <div
          style={{
            left: `${ballLeftPct}%`,
            top: `${ballTopPct}%`,
            transform: `translate(-50%, -50%) scale(${ballScale})`,
          }}
          className="absolute w-6 h-6 sm:w-8 sm:h-8 md:w-9 md:h-9 rounded-full bg-white border-2 border-slate-900 shadow-[0_6px_16px_rgba(0,0,0,0.6)] flex items-center justify-center pointer-events-none"
        >
          <div className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-sm bg-slate-900 rotate-45" />
        </div>

        {/* Outcome banner */}
        {lastOutcomeBanner && (
          <div className="absolute top-2 sm:top-3 left-1/2 -translate-x-1/2 z-20 max-w-[92%] px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full font-extrabold text-[10px] sm:text-xs md:text-sm uppercase tracking-wide sm:tracking-wider shadow-xl border bg-slate-950/90 border-white/15 text-white flex items-center gap-1.5 sm:gap-2">
            {lastOutcomeBanner.type === 'goal' ||
            lastOutcomeBanner.type === 'cashout' ? (
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#22c55e] shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400 shrink-0" />
            )}
            <span className="truncate">{lastOutcomeBanner.text}</span>
          </div>
        )}

        {roundState === 'IDLE' && (
          <div className="absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 w-[92%] sm:w-auto max-w-md bg-slate-950/85 border border-white/10 rounded-full px-3 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-semibold text-slate-200 text-center">
            Set your KES stake below and tap Bet to start
          </div>
        )}
      </div>

      {/* ============ CONTROL PANEL ============ */}
      <div className="bg-[#1b1c20] rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 border border-white/5 shadow-xl grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3 items-stretch">
        {/* Stake controls */}
        <div className="md:col-span-5 flex flex-col gap-2">
          <div className="bg-[#0e0f12] border border-white/10 rounded-full px-1.5 sm:px-2 py-1.5 flex items-center justify-between">
            <button
              type="button"
              disabled={
                roundState === 'ACTIVE' || roundState === 'SHOOTING' || stakeKes <= 10
              }
              onClick={() => setStakeKes((s) => Math.max(10, s - 10))}
              className="w-9 h-9 sm:w-7 sm:h-7 shrink-0 rounded-full bg-[#2a2b30] hover:bg-[#383a42] disabled:opacity-40 text-white flex items-center justify-center cursor-pointer"
            >
              <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </button>
            <input
              type="number"
              inputMode="decimal"
              min={10}
              max={20000}
              disabled={roundState === 'ACTIVE' || roundState === 'SHOOTING'}
              value={stakeKes.toFixed(2)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isNaN(v)) setStakeKes(Math.max(10, Math.min(20000, v)));
              }}
              className="flex-1 min-w-0 bg-transparent text-center font-extrabold text-white text-sm sm:text-base focus:outline-none tabular-nums px-1"
            />
            <button
              type="button"
              disabled={roundState === 'ACTIVE' || roundState === 'SHOOTING'}
              onClick={() => setStakeKes((s) => Math.min(20000, s + 10))}
              className="w-9 h-9 sm:w-7 sm:h-7 shrink-0 rounded-full bg-[#2a2b30] hover:bg-[#383a42] disabled:opacity-40 text-white flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
            {[50, 100, 200, 500].map((amt) => (
              <button
                key={amt}
                type="button"
                disabled={roundState === 'ACTIVE' || roundState === 'SHOOTING'}
                onClick={() => setStakeKes(amt)}
                className={`py-2 sm:py-1 rounded-full text-[11px] sm:text-xs font-medium border transition-colors cursor-pointer disabled:opacity-50 ${
                  stakeKes === amt
                    ? 'bg-[#2c2d33] text-white border-white/20'
                    : 'bg-[#141519] hover:bg-[#23252c] text-slate-400 border-white/5'
                }`}
              >
                {amt}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons — stack vertically on mobile */}
        <div className="md:col-span-7 flex flex-col sm:flex-row items-stretch gap-2 sm:gap-2.5">
          {roundState === 'ACTIVE' || roundState === 'SHOOTING' ? (
            <>
              <button
                type="button"
                disabled={roundState !== 'ACTIVE'}
                onClick={handleRandomShoot}
                className="flex-1 min-h-[64px] sm:min-h-[78px] rounded-xl sm:rounded-2xl bg-[#242e38] hover:bg-[#2d3946] border border-white/10 text-white flex flex-col items-center justify-center gap-0.5 sm:gap-1 cursor-pointer transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-1.5 font-bold text-sm sm:text-base">
                  <Shuffle className="w-4 h-4 text-[#22c55e]" />
                  <span>Random Shoot</span>
                </div>
                <span className="text-[10px] sm:text-xs text-slate-300 font-mono">
                  Next: {nextMultiplier.toFixed(2)}x (
                  {(activeStakeKes * nextMultiplier).toFixed(2)} KES)
                </span>
              </button>

              {currentStep > 0 && (
                <button
                  type="button"
                  disabled={roundState !== 'ACTIVE'}
                  onClick={() => handleCashOut()}
                  className="flex-1 min-h-[64px] sm:min-h-[78px] rounded-xl sm:rounded-2xl bg-[#d97706] hover:bg-[#f59e0b] border border-amber-300/70 text-white flex flex-col items-center justify-center shadow-lg cursor-pointer transition-all disabled:opacity-50"
                >
                  <span className="text-base sm:text-lg font-medium leading-tight">
                    Cash Out
                  </span>
                  <span className="text-sm sm:text-base font-extrabold tabular-nums">
                    {currentCashoutKes.toFixed(2)} KES
                  </span>
                </button>
              )}
            </>
          ) : !user ? (
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full min-h-[64px] sm:min-h-[78px] rounded-xl sm:rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer px-3"
            >
              <WalletIcon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span className="text-center leading-tight">
                Login / Register to Play Penalty Shootout
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartRound}
              className="w-full min-h-[64px] sm:min-h-[78px] rounded-xl sm:rounded-2xl bg-[#28a909] hover:bg-[#30bd0d] border border-[#65e447]/70 text-white flex flex-col items-center justify-center shadow-lg cursor-pointer transition-all"
            >
              <span className="text-lg sm:text-xl md:text-2xl font-normal leading-tight">
                Bet
              </span>
              <span className="text-sm sm:text-base md:text-xl font-normal leading-tight tabular-nums mt-0.5">
                {stakeKes.toFixed(2)} KES
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ============ HISTORY ============ */}
      {history.length > 0 && (
        <div className="bg-[#1b1c20] rounded-xl sm:rounded-2xl p-2.5 sm:p-3 border border-white/5 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold uppercase text-slate-300">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
            <span>Recent Penalty Rounds</span>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {history.map((h) => (
              <div
                key={h.id}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-mono flex items-center gap-1.5 sm:gap-2 border ${
                  h.won
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`}
              >
                <span>{h.won ? `${h.multiplier.toFixed(2)}x` : 'SAVED'}</span>
                <span className="font-bold">
                  {h.won
                    ? `+${h.payoutKes.toFixed(2)} KES`
                    : `-${h.stakeKes.toFixed(2)} KES`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PenaltyShootoutGame;