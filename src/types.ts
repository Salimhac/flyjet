// ─── Enums / unions ─────────────────────────────────────────────────────────

export type TransactionType =
  | "deposit"
  | "bet_debit"
  | "cashout_credit"
  | "bet_refund"
  | "withdrawal";

export type TransactionStatus =
  | "pending"
  | "completed"
  | "failed"
  | "rejected";

export type BetStatus =
  | "placed"
  | "cashed_out"
  | "crashed"
  | "cancelled";

export type RoundStatus = "waiting" | "in_flight" | "crashed";

// ─── Core entities ──────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  isVerifiedAdult: boolean;
}

export interface Wallet {
  userId: string;
  balanceKes: number;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amountKes: number;
  /** Paystack / provider reference — maps to `transactions.reference` in the DB. */
  paystackReference: string;
  status: TransactionStatus;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface ActiveBet {
  betId: string;
  userId: string;
  roundId: string;
  panelIndex: number;
  stakeKes: number;
  autoCashoutMultiplier: number | null;
  status: BetStatus;
  cashoutMultiplier?: number;
  winAmountKes?: number;
  placedAt: string;
}

export interface GameRound {
  id: string;
  status: RoundStatus;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  crashMultiplier?: number;
  serverSeedRevealed?: string;
}

export interface PastRound {
  id: string;
  multiplier: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  endedAt: string;
}

