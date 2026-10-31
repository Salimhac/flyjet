import { LiveMatchErrorCode, LiveMatchFairnessVerifyResult } from './types';

/**
 * HARD MINIMUM BET RULE:
 * - Minimum stake = 10.00 KES = 1,000 KES cents (integer minor units).
 * - Increment step = 1.00 KES = 100 KES cents.
 * - Maximum stake = 20,000.00 KES = 2,000,000 KES cents.
 * - Maximum single-bet / multi-bet payout = 500,000.00 KES = 50,000,000 KES cents.
 * - Never use floating-point arithmetic for monetary ledger operations.
 */
export const LM_MIN_STAKE_CENTS = 1_000; // 10.00 KES
export const LM_MIN_STAKE_KES = 10;
export const LM_STAKE_STEP_CENTS = 100; // 1.00 KES whole steps
export const LM_MAX_STAKE_CENTS = 2_000_000; // 20,000.00 KES
export const LM_MAX_STAKE_KES = 20_000;
export const LM_MAX_PAYOUT_CENTS = 1_000_000_000; // 10,000,000.00 KES (Betika Kenya max payout)
export const LM_MIN_AUTO_CASHOUT = 1.01;
export const LM_MAX_AUTO_CASHOUT = 1000.0;


export interface StakeValidationResult {
  valid: boolean;
  code?: LiveMatchErrorCode;
  message?: string;
  stakeCents?: number;
}

/**
 * Validates a stake supplied in integer KES cents.
 * Rejects < 1000 cents, > maxLimitCents, non-integers, NaN/Infinity, and non-100-cent steps.
 */
export function validateStakeCents(
  stakeCents: unknown,
  minLimitCents: number = LM_MIN_STAKE_CENTS,
  maxLimitCents: number = LM_MAX_STAKE_CENTS
): StakeValidationResult {
  if (typeof stakeCents !== 'number' || !Number.isFinite(stakeCents) || !Number.isSafeInteger(stakeCents)) {
    return {
      valid: false,
      code: 'LM_STAKE_NON_INTEGER_CENTS',
      message: 'Stake must be provided in integer KES cents.',
    };
  }

  const effectiveMin = Math.max(LM_MIN_STAKE_CENTS, minLimitCents);

  if (stakeCents < effectiveMin) {
    const minKes = (effectiveMin / 100).toFixed(2);
    return {
      valid: false,
      code: 'LM_STAKE_BELOW_MIN_10_KES',
      message: `Minimum bet is ${minKes} KES (${effectiveMin} cents).`,
    };
  }

  if (stakeCents > maxLimitCents) {
    const maxKes = (maxLimitCents / 100).toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return {
      valid: false,
      code: 'LM_STAKE_ABOVE_MAX_LIMIT',
      message: `Maximum bet is ${maxKes} KES.`,
    };
  }

  if (stakeCents % LM_STAKE_STEP_CENTS !== 0) {
    return {
      valid: false,
      code: 'LM_STAKE_INVALID_INCREMENT',
      message: 'Stake must be in whole 1.00 KES increments (multiples of 100 cents).',
    };
  }

  return {
    valid: true,
    stakeCents,
  };
}

/**
 * Parses user-entered KES input string (e.g., "10", "10.00", "9.99") into integer cents
 * and validates against the 10.00 KES minimum and 1.00 KES step rules.
 */
export function parseAndValidateKesInput(
  rawInput: string | number,
  minLimitCents: number = LM_MIN_STAKE_CENTS,
  maxLimitCents: number = LM_MAX_STAKE_CENTS
): StakeValidationResult {
  const cleaned = String(rawInput).trim();
  if (!cleaned) {
    return {
      valid: false,
      code: 'LM_STAKE_BELOW_MIN_10_KES',
      message: 'Minimum bet is 10.00 KES.',
    };
  }

  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) {
    return {
      valid: false,
      code: 'LM_STAKE_NON_INTEGER_CENTS',
      message: 'Enter a valid KES amount (minimum 10.00 KES).',
    };
  }

  // Convert KES to exact cents, detecting sub-cent fractions
  const scaledCents = Math.round(numeric * 100);
  if (Math.abs(numeric * 100 - scaledCents) > 1e-6) {
    return {
      valid: false,
      code: 'LM_STAKE_NON_INTEGER_CENTS',
      message: 'Amount cannot have more than 2 decimal places.',
    };
  }

  return validateStakeCents(scaledCents, minLimitCents, maxLimitCents);
}

/**
 * Validates optional auto-cashout multiplier.
 */
export function validateAutoCashout(
  enabled: boolean,
  rawMultiplier: unknown
): { valid: boolean; multiplier: number | null; code?: LiveMatchErrorCode; message?: string } {
  if (!enabled || rawMultiplier === null || rawMultiplier === undefined || rawMultiplier === '') {
    return { valid: true, multiplier: null };
  }
  const num = Number(rawMultiplier);
  if (!Number.isFinite(num) || num < LM_MIN_AUTO_CASHOUT || num > LM_MAX_AUTO_CASHOUT) {
    return {
      valid: false,
      multiplier: null,
      code: 'LM_AUTO_CASHOUT_INVALID',
      message: `Auto cash-out must be between ${LM_MIN_AUTO_CASHOUT.toFixed(2)}x and ${LM_MAX_AUTO_CASHOUT.toFixed(0)}x.`,
    };
  }
  const rounded = Math.floor(num * 100) / 100;
  return { valid: true, multiplier: rounded };
}

/**
 * Converts existing wallet KES balance into integer KES cents safely.
 */
export function kesToCents(amountKes: number): number {
  if (!Number.isFinite(amountKes)) return 0;
  return Math.round(amountKes * 100);
}

/**
 * Converts integer KES cents to numeric KES with 2 decimals for legacy wallet compatibility.
 */
export function centsToKes(amountCents: number): number {
  if (!Number.isFinite(amountCents)) return 0;
  return Math.round(amountCents) / 100;
}

/**
 * Formats integer KES cents into standard Kenyan Shilling currency string ("10.00 KES" or "KES 10.00").
 */
export function formatCentsToKes(
  amountCents: number,
  options: { prefix?: boolean; showSign?: boolean } = {}
): string {
  const safeCents = Number.isFinite(amountCents) ? Math.trunc(amountCents) : 0;
  const isNegative = safeCents < 0;
  const absCents = Math.abs(safeCents);
  const wholeKes = Math.floor(absCents / 100);
  const remainderCents = absCents % 100;

  const formattedWhole = wholeKes.toLocaleString('en-KE');
  const formattedDecimals = String(remainderCents).padStart(2, '0');
  const sign = isNegative ? '-' : options.showSign && safeCents > 0 ? '+' : '';

  if (options.prefix) {
    return `${sign}KES ${formattedWhole}.${formattedDecimals}`;
  }
  return `${sign}${formattedWhole}.${formattedDecimals} KES`;
}

/**
 * Parses a raw KES input string into preview integer cents for live betslip payout calculation
 * even while the user is actively typing.
 */
export function parsePreviewStakeCents(rawInput: string | number): number {
  const cleaned = String(rawInput ?? '').trim();
  if (!cleaned) return 0;
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(LM_MAX_STAKE_CENTS, Math.round(numeric * 100));
}

/**
 * Computes integer payout in KES cents using exact Betika formula:
 * Possible Win / Total Payout = Stake * Total Odds (rounded to 2 decimal places),
 * capped at LM_MAX_PAYOUT_CENTS (10,000,000.00 KES).
 */
export function computePayoutCents(
  stakeCents: number,
  multiplier: number,
  maxPayoutCents: number = LM_MAX_PAYOUT_CENTS
): number {
  const safeStake = Math.max(0, Math.trunc(stakeCents));
  if (safeStake <= 0 || !Number.isFinite(multiplier) || multiplier <= 0) {
    return 0;
  }
  const multiplierBps = Math.max(100, Math.round(multiplier * 100));
  const rawPayout = Math.round((safeStake * multiplierBps) / 100);
  return Math.min(rawPayout, maxPayoutCents);
}

/**
 * Computes combined accumulator odds from an array of individual leg odds, rounded to 2 decimals,
 * matching Betika Kenya's exact Total Odds calculation (Odd_1 * Odd_2 * ... * Odd_n).
 */
export function computeCombinedOdds(oddsList: number[]): number {
  const valid = oddsList.filter((odd) => Number.isFinite(odd) && odd > 1.0);
  if (valid.length === 0) return 0;
  let product = 1.0;
  for (const odd of valid) {
    product *= odd;
  }
  return Math.round(product * 100) / 100;
}

/**
 * Standard Betika slip calculation uses exact Stake * Total Odds without artificial boost inflation.
 */
export function computeMultiBoostPercent(_validLegsCount: number): number {
  return 0;
}

export interface TicketPayoutBreakdown {
  stakeCents: number;
  legsCount: number;
  totalOdds: number;
  basePayoutCents: number; // Possible Win (Stake * Total Odds)
  withholdingTaxCents: number; // 20% Kenyan Withholding Tax on Net Winnings
  finalNetPayoutCents: number; // Final Payout after 20% WHT
  boostPercent: number;
  boostBonusCents: number;
  totalPayoutCents: number; // Total Payout (Stake * Total Odds)
  netProfitCents: number; // Gross Winnings (Possible Win - Stake)
}

/**
 * Computes full Betika Kenya betslip breakdown:
 * - Total Odds = product of all selected decimal odds (rounded to 2 decimals)
 * - Possible Win / Total Payout = Stake * Total Odds
 * - Gross Winnings (Profit) = Possible Win - Stake
 * - Withholding Tax (20% KRA WHT) = 20% of Gross Winnings
 * - Final Net Payout = Possible Win - Withholding Tax
 */
export function computeTicketPayoutBreakdown(
  stakeCents: number,
  oddsList: number[],
  maxPayoutCents: number = LM_MAX_PAYOUT_CENTS
): TicketPayoutBreakdown {
  const validLegs = oddsList.filter((o) => Number.isFinite(o) && o > 1.0);
  const legsCount = validLegs.length;
  const totalOdds = legsCount > 0 ? computeCombinedOdds(validLegs) : 0;

  if (stakeCents <= 0 || legsCount === 0) {
    return {
      stakeCents: Math.max(0, Math.trunc(stakeCents)),
      legsCount,
      totalOdds,
      basePayoutCents: 0,
      withholdingTaxCents: 0,
      finalNetPayoutCents: 0,
      boostPercent: 0,
      boostBonusCents: 0,
      totalPayoutCents: 0,
      netProfitCents: 0,
    };
  }

  const safeStake = Math.max(0, Math.trunc(stakeCents));
  const totalPayoutCents = computePayoutCents(safeStake, totalOdds, maxPayoutCents);
  const netProfitCents = Math.max(0, totalPayoutCents - safeStake);
  const withholdingTaxCents = Math.round(netProfitCents * 0.2);
  const finalNetPayoutCents = Math.max(safeStake, totalPayoutCents - withholdingTaxCents);

  return {
    stakeCents: safeStake,
    legsCount,
    totalOdds,
    basePayoutCents: totalPayoutCents,
    withholdingTaxCents,
    finalNetPayoutCents,
    boostPercent: 0,
    boostBonusCents: 0,
    totalPayoutCents,
    netProfitCents,
  };
}

/**
 * Computes total potential payout in integer KES cents (Stake * Total Odds),
 * capped at LM_MAX_PAYOUT_CENTS (10,000,000.00 KES).
 */
export function computeTicketPotentialPayoutCents(
  stakeCents: number,
  totalOdds: number,
  _legsCount: number,
  maxPayoutCents: number = LM_MAX_PAYOUT_CENTS
): number {
  return computePayoutCents(stakeCents, totalOdds, maxPayoutCents);
}



/**
 * Deterministic derivation of full-time football match score (Home Goals, Away Goals)
 * from a 64-character HMAC-SHA256 hex digest using realistic football Poisson-weighted buckets.
 */
export function deriveFootballScoreFromHmacHex(hmacHex: string): {
  homeGoals: number;
  awayGoals: number;
} {
  const homeByte = parseInt(hmacHex.slice(0, 4), 16) % 100;
  const awayByte = parseInt(hmacHex.slice(4, 8), 16) % 100;

  const mapToGoals = (roll: number, isHome: boolean): number => {
    if (isHome) {
      if (roll < 24) return 0;
      if (roll < 58) return 1;
      if (roll < 82) return 2;
      if (roll < 94) return 3;
      return 4;
    } else {
      if (roll < 32) return 0;
      if (roll < 66) return 1;
      if (roll < 88) return 2;
      if (roll < 97) return 3;
      return 4;
    }
  };

  return {
    homeGoals: mapToGoals(homeByte, true),
    awayGoals: mapToGoals(awayByte, false),
  };
}

export function computeGrowthMultiplier(elapsedMs: number): number {
  if (elapsedMs <= 0) return 1.0;
  const elapsedSeconds = elapsedMs / 1000;
  const raw = Math.exp(0.07 * elapsedSeconds);
  return Math.max(1.0, Math.floor(raw * 100) / 100);
}

export function computeCrashDurationMs(crashPoint: number): number {
  if (crashPoint <= 1.0) return 0;
  const seconds = Math.log(crashPoint) / 0.07;
  return Math.max(50, Math.round(seconds * 1000));
}

export function deriveCrashPointFromHmacHex(hmacHex: string): number {
  const hexSlice = hmacHex.slice(0, 13);
  const r = parseInt(hexSlice, 16);
  const e = Math.pow(2, 52);

  if (r % 33 === 0) {
    return 1.0;
  }

  const rawMultiplier = Math.floor((100 * e - r) / (e - r)) / 100;
  return Math.max(1.0, Math.min(rawMultiplier, 1000.0));
}

async function sha256HexWebCrypto(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256HexWebCrypto(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verifies a settled Football Match's provably fair seeds and recomputes the exact simulated goals.
 */
export async function verifyRoundFairness(params: {
  serverSeed: string;
  serverSeedHash?: string;
  clientSeed: string;
  nonce: number;
}): Promise<LiveMatchFairnessVerifyResult> {
  const cleanServerSeed = params.serverSeed.trim();
  const cleanClientSeed = params.clientSeed.trim();
  const cleanNonce = Number(params.nonce) || 0;

  const computedServerSeedHash = await sha256HexWebCrypto(cleanServerSeed);
  const expectedServerSeedHash = (params.serverSeedHash || computedServerSeedHash).trim().toLowerCase();
  const hashMatches = computedServerSeedHash.toLowerCase() === expectedServerSeedHash;

  const message = `${cleanClientSeed}:${cleanNonce}`;
  const hmacHex = await hmacSha256HexWebCrypto(cleanServerSeed, message);
  const computedCrashPoint = deriveCrashPointFromHmacHex(hmacHex);
  const { homeGoals, awayGoals } = deriveFootballScoreFromHmacHex(hmacHex);

  return {
    valid: hashMatches,
    serverSeed: cleanServerSeed,
    expectedServerSeedHash,
    computedServerSeedHash,
    hashMatches,
    clientSeed: cleanClientSeed,
    nonce: cleanNonce,
    hmacHex,
    simulatedHomeGoals: homeGoals,
    simulatedAwayGoals: awayGoals,
    computedCrashPoint,
  };
}
