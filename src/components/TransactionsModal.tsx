import React, { useEffect, useState } from 'react';
import { Transaction, UserProfile } from '../types';
import { fetchUserTransactions } from '../lib/engineService';
import { X, ArrowDownRight, ArrowUpRight, ShieldCheck, RefreshCw } from 'lucide-react';

interface TransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
}

export const TransactionsModal: React.FC<TransactionsModalProps> = ({
  isOpen,
  onClose,
  user,
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTransactions = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const txs = await fetchUserTransactions(user.id);
      setTransactions(txs);
    } catch (err) {
      console.error('Failed to fetch transactions', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && user) {
      fetchTransactions();
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-sm animate-fade-in flex items-center justify-center p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-[#0e1626] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] max-h-[92dvh] my-auto flex flex-col">
        {/* Header */}
        <div className="bg-[#121c30] px-3.5 sm:px-6 py-3 sm:py-3.5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base md:text-lg font-extrabold text-white truncate">
                Wallet Ledger & Transactions
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 font-mono truncate">
                Atomic Balance Mutations (KES)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={fetchTransactions}
              disabled={isLoading}
              title="Refresh"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-800/90 hover:bg-rose-500/20 active:bg-rose-500/30 text-slate-300 hover:text-rose-400 border border-slate-700/80 hover:border-rose-500/40 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Transaction Table / List */}
        <div className="p-3.5 sm:p-6 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {transactions.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <ShieldCheck className="w-8 h-8 text-slate-600" />
              <span>No transactions recorded yet. Deposits and bets will appear here.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {transactions.map((tx) => {
                const isDeposit = tx.type === 'deposit';
                const isWin = tx.type === 'cashout_credit';
                const isWithdrawal = tx.type === 'withdrawal';

                return (
                  <div
                    key={tx.id}
                    className="p-2.5 sm:p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl flex items-center justify-between gap-2 sm:gap-4"
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isDeposit
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : isWin
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : isWithdrawal
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-rose-500/15 text-rose-400'
                        }`}
                      >
                        {isDeposit || isWin ? (
                          <ArrowDownRight className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <span className="text-xs font-bold text-white uppercase tracking-wider truncate">
                            {isDeposit
                              ? 'Deposit'
                              : isWin
                              ? 'Flight Cash Out'
                              : isWithdrawal
                              ? 'Mobile Withdrawal'
                              : 'Bet Stake'}
                          </span>
                          <span className="text-[10px] text-emerald-400 font-mono font-medium shrink-0">
                            {tx.status}
                          </span>
                        </div>
                        <div className="text-[10px] sm:text-[11px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5 min-w-0">
                          <span className="truncate max-w-[120px] sm:max-w-[200px]">
                            {tx.paystackReference}
                          </span>
                          <span className="shrink-0">·</span>
                          <span className="shrink-0">
                            {new Date(tx.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs sm:text-sm font-bold font-mono tabular-nums whitespace-nowrap ${
                          isDeposit || isWin
                            ? 'text-emerald-400'
                            : isWithdrawal
                            ? 'text-amber-300'
                            : 'text-slate-200'
                        }`}
                      >
                        {isDeposit || isWin ? '+' : '-'}KES {tx.amountKes.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
