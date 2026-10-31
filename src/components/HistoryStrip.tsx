import React from 'react';
import { PastRound } from '../types';
import { History } from 'lucide-react';

interface HistoryStripProps {
  history: PastRound[];
}

export const HistoryStrip: React.FC<HistoryStripProps> = ({ history }) => {
  return (
    <div className="w-full bg-[#0a0f18] border-b border-slate-800/80 px-3 py-1.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 shrink-0 uppercase tracking-wider pr-2 border-r border-slate-800">
        <History className="w-3.5 h-3.5 text-slate-400" />
        <span>Rounds</span>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
        {history.length === 0 ? (
          <span className="text-xs text-slate-400 italic">Connecting to live game engine...</span>
        ) : (
          history.slice(0, 20).map((r, i) => {
            const mult = r.multiplier;
            let badgeClass = 'text-sky-400 bg-sky-950/40 border-sky-800/40';
            if (mult >= 10.0) {
              badgeClass = 'text-purple-300 bg-purple-950/50 border-purple-800/50 font-bold';
            } else if (mult >= 2.0) {
              badgeClass = 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40';
            }

            return (
              <div
                key={r.id || i}
                className={`text-[12px] font-mono tabular-nums px-2.5 py-0.5 rounded border whitespace-nowrap shrink-0 flex items-center ${badgeClass}`}
              >
                <span>{mult.toFixed(2)}x</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
