import React, { useState } from 'react';
import {
  ShieldCheck,
  Scale,
  Clock,
  HeartHandshake,
  BookOpen,
} from 'lucide-react';
import { UserProfile } from '../../../types';

interface LiveMatchesFairnessPageProps {
  user: UserProfile | null;
  initialQuery?: URLSearchParams;
}

export const LiveMatchesFairnessPage: React.FC<LiveMatchesFairnessPageProps> = ({
  user,
}) => {
  const [cooldownStatus, setCooldownStatus] = useState<string | null>(null);

  const handleSelfExclusion = async (hours: number) => {
    if (!user) {
      setCooldownStatus('Please sign in first to configure responsible gaming session cooldowns.');
      return;
    }
    try {
      const res = await fetch('/api/live-matches/responsible/self-exclude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({ userId: user.id, hours }),
      });
      const data = await res.json();
      if (data.excludedUntil) {
        setCooldownStatus(
          `Self-exclusion active until ${new Date(data.excludedUntil).toLocaleString()}.`
        );
      }
    } catch {
      setCooldownStatus('Unable to update self-exclusion right now.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="bg-[#0b1220] border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2 text-[#22c55e] text-xs font-mono font-bold">
          <ShieldCheck className="w-4 h-4" />
          <span>FOOTBALL SPORTSBOOK RULES &amp; FAIRNESS</span>
        </div>
        <h1 className="text-lg sm:text-xl font-extrabold text-white mt-1">
          Pre-Match (&ldquo;Bet Early&rdquo;) Rules, Market Settlement &amp; Fairness
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl">
          Learn how Pre-Match (&ldquo;Bet Early&rdquo;) and Live In-Play football bets are settled and how Early Cashout
          is calculated in real time across official global football competitions.
        </p>
      </div>

      {/* Football Betting Rules Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-[#121824] border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase">
            <Clock className="w-4 h-4" />
            <span>1. Bet Early (Pre-Match) Rules</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            You can place early bets on any <strong className="text-white">UPCOMING</strong> football match
            before kickoff to lock in pre-match odds. Before the match kicks off, you can cancel your ticket
            for a <strong className="text-[#22c55e]">100% full stake refund</strong> or cash out early.
          </p>
        </div>

        <div className="bg-[#121824] border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-[#22c55e] font-extrabold text-xs uppercase">
            <BookOpen className="w-4 h-4" />
            <span>2. 90-Minute Regulation Settlement</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            All football markets (<strong className="text-white">1X2, Double Chance, Over/Under, GG/NG, Draw No Bet, Correct Score</strong>)
            settle on the official 90-minute regulation score. Markets mathematically won mid-game (e.g.{' '}
            <strong className="text-[#22c55e]">Over 2.5 Goals</strong> when the 3rd goal is scored) settle immediately!
          </p>
        </div>

        <div className="bg-[#121824] border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sky-400 font-extrabold text-xs uppercase">
            <Scale className="w-4 h-4" />
            <span>3. 10.00 KES Minimum &amp; Multi-Boost</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Every Single or Multi-Bet (Accumulator) requires a minimum stake of{' '}
            <strong className="text-amber-300">10.00 KES (1,000 integer cents)</strong> in whole 1 KES steps.
            Combine 3+ football selections to earn up to <strong className="text-[#22c55e]">+15% Win Boost</strong>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 6 Cols: Sportsbook Limits & Market Rules */}
        <div className="lg:col-span-6 bg-[#0b1220] border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#22c55e]" />
            <span>Sportsbook Limits &amp; Market Rules</span>
          </h2>
          <ul className="space-y-2 text-xs text-slate-300 font-mono">
            <li className="flex justify-between border-b border-slate-800/70 pb-1.5">
              <span className="text-slate-400">Minimum Stake:</span>
              <strong className="text-[#22c55e]">10.00 KES (1,000 cents)</strong>
            </li>
            <li className="flex justify-between border-b border-slate-800/70 pb-1.5">
              <span className="text-slate-400">Stake Increment Step:</span>
              <strong className="text-white">1.00 KES (100 cents)</strong>
            </li>
            <li className="flex justify-between border-b border-slate-800/70 pb-1.5">
              <span className="text-slate-400">Maximum Stake:</span>
              <strong className="text-white">20,000.00 KES (2,000,000 cents)</strong>
            </li>
            <li className="flex justify-between border-b border-slate-800/70 pb-1.5">
              <span className="text-slate-400">Maximum Single/Multi Payout:</span>
              <strong className="text-[#22c55e]">500,000.00 KES</strong>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-400">Early Cashout Margin:</span>
              <strong className="text-amber-300">96% Pre-Match · 92% In-Play</strong>
            </li>
          </ul>
        </div>

        {/* Right 6 Cols: Responsible Gaming Self-Exclusion */}
        <div className="lg:col-span-6 bg-[#0b1220] border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
            <HeartHandshake className="w-4 h-4 text-[#22c55e]" />
            <span>Responsible Gaming (BCLB Kenya)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Need a break from football betting? Activate a cooling-off period below to temporarily
            block new bet placements on your account.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleSelfExclusion(1)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-amber-300 flex items-center gap-1 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>1h Take-a-Break</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelfExclusion(24)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-amber-300 flex items-center gap-1 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>24h Self-Exclusion</span>
            </button>
          </div>
          {cooldownStatus && (
            <div className="text-xs font-mono text-[#22c55e] bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
              {cooldownStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

