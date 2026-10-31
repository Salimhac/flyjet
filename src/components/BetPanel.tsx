import React, { useState, useMemo } from 'react';
import { ActiveBet, GameRound, PastRound, Wallet } from '../types';
import { Minus, Plus, SquareMinus, SquarePlus, AlertCircle } from 'lucide-react';

interface BetPanelProps {
  wallet: Wallet | null;
  currentRound: GameRound;
  multiplier: number;
  activeBets: Map<number, ActiveBet>; // panelIndex -> bet
  roundHistory?: PastRound[];
  onPlaceBet: (panelIndex: number, stake: number, autoCashoutMult: number | null) => Promise<void>;
  onCashOut: (panelIndex: number) => Promise<void>;
  onCancelBet: (panelIndex: number) => Promise<void>;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  isLoading: boolean;
}

const PRESET_AMOUNTS = [
  { label: '100', value: 100 },
  { label: '200', value: 200 },
  { label: '500', value: 500 },
  { label: '10,000', value: 10000 },
];

interface SimulatedRoomBet {
  id: string;
  user: string;
  avatarBg: string;
  avatarLetter: string;
  stakeKes: number;
  cashoutAt: number | null;
}

const ROOM_PLAYERS: Array<{ user: string; avatarBg: string; avatarLetter: string; baseStake: number; targetMult: number | null }> = [
  { user: '2547***812', avatarBg: 'from-emerald-400 to-teal-700', avatarLetter: 'J', baseStake: 100, targetMult: 1.45 },
  { user: '2547***109', avatarBg: 'from-amber-400 to-orange-600', avatarLetter: 'K', baseStake: 500, targetMult: 1.85 },
  { user: '2541***443', avatarBg: 'from-sky-400 to-blue-700', avatarLetter: 'M', baseStake: 200, targetMult: 2.10 },
  { user: '2547***920', avatarBg: 'from-rose-400 to-red-700', avatarLetter: 'B', baseStake: 50, targetMult: 1.32 },
  { user: '2547***337', avatarBg: 'from-purple-400 to-indigo-700', avatarLetter: 'W', baseStake: 1000, targetMult: 1.60 },
  { user: '2547***651', avatarBg: 'from-lime-400 to-emerald-700', avatarLetter: 'D', baseStake: 10, targetMult: 3.40 },
  { user: '2541***778', avatarBg: 'from-cyan-400 to-blue-600', avatarLetter: 'S', baseStake: 250, targetMult: 1.95 },
  { user: '2547***504', avatarBg: 'from-pink-400 to-rose-700', avatarLetter: 'N', baseStake: 100, targetMult: 2.50 },
];

export const BetPanel: React.FC<BetPanelProps> = ({
  wallet,
  currentRound,
  multiplier,
  activeBets,
  roundHistory = [],
  onPlaceBet,
  onCashOut,
  onCancelBet,
  onOpenDeposit,
  isLoading,
}) => {
  const [showSecondPanel, setShowSecondPanel] = useState<boolean>(true);
  const [bottomFeedTab, setBottomFeedTab] = useState<'all' | 'previous' | 'top'>('all');

  const liveRoomBets = useMemo<SimulatedRoomBet[]>(() => {
    const seed = currentRound.nonce || 2048;
    return ROOM_PLAYERS.map((p, idx) => {
      const factor = ((seed + idx * 7) % 3 === 0) ? 2 : 1;
      const stakeKes = p.baseStake * factor;
      const target = p.targetMult ? Number((p.targetMult + ((seed + idx) % 5) * 0.12).toFixed(2)) : null;
      const cashed =
        currentRound.status === 'in_flight' && target && multiplier >= target
          ? target
          : currentRound.status === 'crashed' && target && (currentRound.crashMultiplier ?? 1) >= target
          ? target
          : null;
      return {
        id: `${currentRound.id}_${idx}`,
        user: p.user,
        avatarBg: p.avatarBg,
        avatarLetter: p.avatarLetter,
        stakeKes,
        cashoutAt: cashed,
      };
    });
  }, [currentRound.id, currentRound.nonce, currentRound.status, currentRound.crashMultiplier, multiplier]);

  return (
    <div className="w-full flex flex-col gap-2.5">
      {/* Dual Aviator Bet Cards (Stacked on mobile/tablet, side-by-side on lg, matching Screenshot 2) */}
      <div className={`w-full grid grid-cols-1 ${showSecondPanel ? 'lg:grid-cols-2' : 'lg:grid-cols-1'} gap-2.5`}>
        <SingleBetSlip
          panelIndex={0}
          wallet={wallet}
          currentRound={currentRound}
          multiplier={multiplier}
          activeBet={activeBets.get(0)}
          onPlaceBet={onPlaceBet}
          onCashOut={onCashOut}
          onCancelBet={onCancelBet}
          onOpenDeposit={onOpenDeposit}
          isLoading={isLoading}
          showToggleIcon={!showSecondPanel}
          toggleIconType="add"
          onToggleSecondPanel={() => setShowSecondPanel(true)}
        />

        {showSecondPanel && (
          <SingleBetSlip
            panelIndex={1}
            wallet={wallet}
            currentRound={currentRound}
            multiplier={multiplier}
            activeBet={activeBets.get(1)}
            onPlaceBet={onPlaceBet}
            onCashOut={onCashOut}
            onCancelBet={onCancelBet}
            onOpenDeposit={onOpenDeposit}
            isLoading={isLoading}
            showToggleIcon={true}
            toggleIconType="remove"
            onToggleSecondPanel={() => setShowSecondPanel(false)}
          />
        )}
      </div>

      {/* Bottom All Bets / Previous / Top Feed Section (Matching bottom of Screenshot 2) */}
      <div className="bg-[#1b1c20] rounded-2xl p-3 border border-white/5 flex flex-col gap-2.5">
        {/* Segmented Pill Tabs: All Bets | Previous | Top */}
        <div className="bg-[#121316] rounded-full p-0.5 grid grid-cols-3 border border-white/5 max-w-md mx-auto w-full">
          <button
            type="button"
            onClick={() => setBottomFeedTab('all')}
            className={`py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              bottomFeedTab === 'all'
                ? 'bg-[#2c2d33] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Bets
          </button>
          <button
            type="button"
            onClick={() => setBottomFeedTab('previous')}
            className={`py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              bottomFeedTab === 'previous'
                ? 'bg-[#2c2d33] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setBottomFeedTab('top')}
            className={`py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              bottomFeedTab === 'top'
                ? 'bg-[#2c2d33] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Top
          </button>
        </div>

        {/* Feed Content */}
        {bottomFeedTab === 'all' && (
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-12 px-2 py-1 text-[11px] text-slate-400 border-b border-white/5">
              <span className="col-span-5">User</span>
              <span className="col-span-3 text-right">Bet KES</span>
              <span className="col-span-2 text-center">X</span>
              <span className="col-span-2 text-right">Cash out KES</span>
            </div>
            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-0.5">
              {Array.from(activeBets.entries()).map(([idx, b]) => (
                <div
                  key={`my_${idx}`}
                  className={`grid grid-cols-12 items-center px-2.5 py-1.5 rounded-lg text-xs ${
                    b.status === 'cashed_out'
                      ? 'bg-[#17331c] border border-[#28a909]/40'
                      : 'bg-[#121316]'
                  }`}
                >
                  <div className="col-span-5 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-green-700 flex items-center justify-center text-[10px] font-bold text-white">
                      YOU
                    </span>
                    <span className="text-white font-semibold">You (Panel {idx + 1})</span>
                  </div>
                  <span className="col-span-3 text-right font-mono text-slate-200 tabular-nums">
                    {b.stakeKes.toFixed(2)}
                  </span>
                  <div className="col-span-2 flex justify-center">
                    {b.cashoutMultiplier ? (
                      <span className="px-2 py-0.5 rounded-full bg-[#1f2937] text-emerald-400 font-mono font-bold text-[11px]">
                        {b.cashoutMultiplier.toFixed(2)}x
                      </span>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </div>
                  <span className="col-span-2 text-right font-mono font-bold text-emerald-400 tabular-nums">
                    {b.winAmountKes ? b.winAmountKes.toFixed(2) : '-'}
                  </span>
                </div>
              ))}

              {liveRoomBets.map((rb) => (
                <div
                  key={rb.id}
                  className={`grid grid-cols-12 items-center px-2.5 py-1.5 rounded-lg text-xs ${
                    rb.cashoutAt
                      ? 'bg-[#17331c]/80 border border-[#28a909]/30'
                      : 'bg-[#121316]'
                  }`}
                >
                  <div className="col-span-5 flex items-center gap-2">
                    <span
                      className={`w-6 h-6 rounded-full bg-gradient-to-br ${rb.avatarBg} flex items-center justify-center text-[11px] font-bold text-white shadow-sm`}
                    >
                      {rb.avatarLetter}
                    </span>
                    <span className="text-slate-300">{rb.user}</span>
                  </div>
                  <span className="col-span-3 text-right font-mono text-slate-200 tabular-nums">
                    {rb.stakeKes.toFixed(2)}
                  </span>
                  <div className="col-span-2 flex justify-center">
                    {rb.cashoutAt ? (
                      <span className="px-2 py-0.5 rounded-full bg-[#0f172a] text-sky-400 font-mono font-bold text-[11px]">
                        {rb.cashoutAt.toFixed(2)}x
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </div>
                  <span className="col-span-2 text-right font-mono font-bold text-emerald-400 tabular-nums">
                    {rb.cashoutAt ? (rb.stakeKes * rb.cashoutAt).toFixed(2) : '-'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {bottomFeedTab === 'previous' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-2 py-1 text-xs text-slate-400">
              <span>Previous Round Result</span>
              <span className="font-mono font-bold text-rose-400">
                {roundHistory[0] ? `${roundHistory[0].multiplier.toFixed(2)}x` : '1.42x'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 px-2 py-1">
              {roundHistory.slice(0, 18).map((r) => (
                <span
                  key={r.id}
                  className={`px-2.5 py-1 rounded-full font-mono text-xs font-bold ${
                    r.multiplier >= 10
                      ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                      : r.multiplier >= 2
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  }`}
                >
                  {r.multiplier.toFixed(2)}x
                </span>
              ))}
            </div>
          </div>
        )}

        {bottomFeedTab === 'top' && (
          <div className="flex flex-col gap-1.5">
            {roundHistory
              .slice()
              .sort((a, b) => b.multiplier - a.multiplier)
              .slice(0, 6)
              .map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between bg-[#121316] px-3 py-2 rounded-lg text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400">#{i + 1}</span>
                    <span className="text-slate-200 font-semibold">Round {r.nonce}</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-pink-500/20 text-pink-400 font-mono font-bold">
                    {r.multiplier.toFixed(2)}x
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface SingleBetSlipProps {
  panelIndex: number;
  wallet: Wallet | null;
  currentRound: GameRound;
  multiplier: number;
  activeBet?: ActiveBet;
  onPlaceBet: (panelIndex: number, stake: number, autoCashoutMult: number | null) => Promise<void>;
  onCashOut: (panelIndex: number) => Promise<void>;
  onCancelBet: (panelIndex: number) => Promise<void>;
  onOpenDeposit: () => void;
  isLoading: boolean;
  showToggleIcon?: boolean;
  toggleIconType?: 'add' | 'remove';
  onToggleSecondPanel?: () => void;
}

const SingleBetSlip: React.FC<SingleBetSlipProps> = ({
  panelIndex,
  wallet,
  currentRound,
  multiplier,
  activeBet,
  onPlaceBet,
  onCashOut,
  onCancelBet,
  onOpenDeposit,
  isLoading,
  showToggleIcon,
  toggleIconType,
  onToggleSecondPanel,
}) => {
  const [mode, setMode] = useState<'bet' | 'auto'>('bet');
  const [stake, setStake] = useState<number>(10);
  const [isAutoCashoutEnabled, setIsAutoCashoutEnabled] = useState<boolean>(false);
  const [autoCashoutMult, setAutoCashoutMult] = useState<string>('2.00');
  const [validationError, setValidationError] = useState<string | null>(null);

  const balance = wallet?.balanceKes ?? 0;

  const adjustStake = (delta: number) => {
    setValidationError(null);
    setStake((prev) => {
      const next = prev + delta;
      return next < 10 ? 10 : Math.min(20000, Math.round(next));
    });
  };

  const setPresetStake = (val: number) => {
    setValidationError(null);
    setStake(val);
  };

  const handlePlaceBetClick = () => {
    setValidationError(null);
    if (currentRound.status !== 'waiting') {
      setValidationError('Bets can only be placed during the waiting period before takeoff.');
      return;
    }
    if (stake < 10) {
      setValidationError('Min bet is 10.00 KES');
      return;
    }
    if (balance < stake) {
      onOpenDeposit();
      return;
    }

    const autoMultNum =
      mode === 'auto' && isAutoCashoutEnabled ? parseFloat(autoCashoutMult) : null;
    onPlaceBet(panelIndex, stake, autoMultNum);
  };

  const isPlaced = activeBet && activeBet.status === 'placed';
  const isCashedOut = activeBet && activeBet.status === 'cashed_out';
  const isRoundWaiting = currentRound.status === 'waiting';
  const isRoundInFlight = currentRound.status === 'in_flight';

  const potentialWin = activeBet ? (activeBet.stakeKes * multiplier).toFixed(2) : '0.00';

  return (
    <div className="bg-[#1b1c20] rounded-2xl px-3.5 py-3 border border-white/5 flex flex-col gap-3 shadow-lg">
      {/* Top Row: Centered Bet / Auto Pill Switcher + Right Toggle Button */}
      <div className="relative flex items-center justify-center">
        <div className="bg-[#121316] rounded-full p-0.5 grid grid-cols-2 w-[210px] border border-white/5">
          <button
            type="button"
            onClick={() => setMode('bet')}
            className={`py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              mode === 'bet'
                ? 'bg-[#2c2d33] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Bet
          </button>
          <button
            type="button"
            onClick={() => setMode('auto')}
            className={`py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              mode === 'auto'
                ? 'bg-[#2c2d33] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Auto
          </button>
        </div>

        {showToggleIcon && onToggleSecondPanel && (
          <button
            type="button"
            onClick={onToggleSecondPanel}
            className="absolute right-0 w-7 h-7 rounded-full bg-[#2a2b30] hover:bg-[#35373d] text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
            aria-label={toggleIconType === 'remove' ? 'Hide second bet panel' : 'Show second bet panel'}
          >
            {toggleIconType === 'remove' ? (
              <SquareMinus className="w-4 h-4 text-slate-300" />
            ) : (
              <SquarePlus className="w-4 h-4 text-slate-300" />
            )}
          </button>
        )}
      </div>

      {/* Main Controls Row: Left Stepper + 2x2 Quick Amounts | Right Giant Green Bet Button */}
      <div className="grid grid-cols-12 gap-2.5 items-stretch">
        {/* Left Column (5 cols): Stake Stepper + 2x2 Preset Pills */}
        <div className="col-span-5 flex flex-col justify-between gap-1.5">
          {/* Pill Stepper: (-) 10.00 (+) */}
          <div className="bg-[#0e0f12] border border-white/10 rounded-full px-1.5 py-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => adjustStake(-10)}
              disabled={isPlaced || stake <= 10}
              className="w-6 h-6 rounded-full bg-[#2a2b30] hover:bg-[#383a42] disabled:opacity-40 text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              aria-label="Decrease stake"
            >
              <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>

            <input
              type="number"
              min={10}
              step={1}
              disabled={isPlaced}
              value={stake.toFixed(2)}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                if (!Number.isNaN(parsed)) {
                  setStake(Math.max(10, Math.min(20000, parsed)));
                }
              }}
              className="w-full bg-transparent text-center font-extrabold text-white text-sm sm:text-base focus:outline-none tabular-nums"
            />

            <button
              type="button"
              onClick={() => adjustStake(10)}
              disabled={isPlaced}
              className="w-6 h-6 rounded-full bg-[#2a2b30] hover:bg-[#383a42] disabled:opacity-40 text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              aria-label="Increase stake"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

          {/* 2x2 Quick Amount Pills: 100, 200, 500, 10,000 */}
          <div className="grid grid-cols-2 gap-1.5">
            {PRESET_AMOUNTS.map((item) => (
              <button
                key={item.value}
                type="button"
                disabled={isPlaced}
                onClick={() => setPresetStake(item.value)}
                className={`py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                  stake === item.value
                    ? 'bg-[#2c2d33] text-white border-white/20'
                    : 'bg-[#141519] hover:bg-[#23252c] text-slate-400 border-white/5'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right Column (7 cols): Giant Green Aviator Bet Button */}
        <div className="col-span-7 flex">
          {isPlaced && isRoundInFlight ? (
            <button
              type="button"
              onClick={() => onCashOut(panelIndex)}
              disabled={isLoading}
              className="w-full min-h-[86px] rounded-2xl bg-[#d97706] hover:bg-[#f59e0b] border border-amber-300/70 text-white flex flex-col items-center justify-center shadow-lg transition-all active:scale-98 cursor-pointer"
            >
              <span className="text-lg sm:text-xl font-medium leading-tight">Cash Out</span>
              <span className="text-base sm:text-lg font-bold leading-tight tabular-nums mt-0.5">
                {potentialWin} KES
              </span>
            </button>
          ) : isPlaced && isRoundWaiting ? (
            <button
              type="button"
              onClick={() => onCancelBet(panelIndex)}
              disabled={isLoading}
              className="w-full min-h-[86px] rounded-2xl bg-[#dc2626] hover:bg-[#ef4444] border border-rose-300/60 text-white flex flex-col items-center justify-center shadow-lg transition-all active:scale-98 cursor-pointer"
            >
              <span className="text-lg sm:text-xl font-medium leading-tight">Cancel</span>
              <span className="text-xs text-rose-100 mt-0.5">Bet Placed • Waiting for takeoff</span>
            </button>
          ) : isCashedOut ? (
            <button
              type="button"
              disabled={true}
              className="w-full min-h-[86px] rounded-2xl bg-[#1e2620] border border-[#28a909]/50 text-white flex flex-col items-center justify-center shadow-lg transition-all cursor-not-allowed"
            >
              <span className="text-xs font-bold uppercase text-emerald-400">
                Won {activeBet?.winAmountKes?.toFixed(2)} KES
              </span>
              <span className="text-xs text-slate-300 mt-1">Waiting for next round</span>
            </button>
          ) : isRoundWaiting ? (
            <button
              type="button"
              onClick={handlePlaceBetClick}
              disabled={isLoading}
              className="w-full min-h-[86px] rounded-2xl bg-[#28a909] hover:bg-[#30bd0d] active:scale-[0.99] border border-[#65e447]/70 text-white flex flex-col items-center justify-center shadow-lg transition-all cursor-pointer"
            >
              <span className="text-xl sm:text-2xl font-normal leading-tight">Bet</span>
              <span className="text-base sm:text-xl font-normal leading-tight tabular-nums mt-0.5">
                {stake.toFixed(2)} KES
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={true}
              className="w-full min-h-[86px] rounded-2xl bg-[#24262d] border border-white/10 text-slate-400 flex flex-col items-center justify-center shadow-lg transition-all cursor-not-allowed opacity-75"
            >
              <span className="text-sm sm:text-base font-semibold leading-tight text-slate-300">
                Waiting for next round
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Auto Cashout Row (Shown when "Auto" tab is selected) */}
      {mode === 'auto' && (
        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-slate-300">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isAutoCashoutEnabled}
              disabled={isPlaced}
              onChange={(e) => setIsAutoCashoutEnabled(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-[#28a909] focus:ring-0 w-4 h-4 accent-[#28a909]"
            />
            <span>Auto Cash Out</span>
          </label>
          <div className="flex items-center gap-1 bg-[#0e0f12] border border-white/10 rounded-full px-3 py-1">
            <input
              type="number"
              step="0.10"
              min="1.01"
              max="100.00"
              value={autoCashoutMult}
              disabled={!isAutoCashoutEnabled || isPlaced}
              onChange={(e) => setAutoCashoutMult(e.target.value)}
              className="w-16 bg-transparent text-white font-mono font-bold text-xs text-right focus:outline-none tabular-nums"
            />
            <span className="text-slate-400 font-mono text-xs">x</span>
          </div>
        </div>
      )}

      {validationError && (
        <div className="flex items-center gap-1.5 text-[11px] text-rose-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
};
