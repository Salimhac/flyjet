import React from 'react';
import { PhoneCall } from 'lucide-react';

interface ResponsibleFooterProps {
  onOpenTerms: () => void;
}

export const ResponsibleFooter: React.FC<ResponsibleFooterProps> = ({
  onOpenTerms,
}) => {
  return (
    <footer className="w-full bg-[#080d17] border-t border-slate-800/80 px-4 py-3 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        {/* Responsible Gaming & Licensing notice (18+ badge removed per instructions) */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-slate-300 font-medium">
            Betting is addictive. Play responsibly.
          </span>
          </div>

        {/* Responsible Gambling Hotline & Rules Link */}
        <div className="flex items-center gap-4 text-[11px] shrink-0 font-medium">
          <div className="flex items-center gap-1.5 text-emerald-400 font-mono">
          </div>
          <button
            onClick={onOpenTerms}
            className="text-slate-400 hover:text-slate-200 transition-colors underline cursor-pointer"
          >
            Terms & Rules
          </button>
        </div>
      </div>
    </footer>
  );
};
