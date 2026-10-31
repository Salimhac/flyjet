// Supabase Edge Function / Engine: Provably Fair Commit-Reveal Round Generator


export interface ProvablyFairRound {
  id: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  crashMultiplier: number;
}

// Convert bytes to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Compute SHA-256 hash
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(hash));
}

// Deterministic crash multiplier computation
// Using standard provably fair formula with 3% house edge:
// float = (hash slice converted to integer) / 2^52
// multiplier = max(1.00, floor((100 * e - h) / (e - h)) / 100)
export async function generateProvablyFairRound(
  nonce: number,
  clientSeed: string = "00000000000000000002aeb393c1c2c7d04954288000851608447f540f894e87"
): Promise<ProvablyFairRound> {
  // Generate 32 bytes cryptographically secure random server seed
  const seedBytes = new Uint8Array(32);
  crypto.getRandomValues(seedBytes);
  const serverSeed = bytesToHex(seedBytes);

  // Published commitment hash
  const serverSeedHash = await sha256(serverSeed);

  // Combine serverSeed, clientSeed, and nonce for result
  const combined = `${serverSeed}:${clientSeed}:${nonce}`;
  const resultHash = await sha256(combined);

  // Take first 13 hex characters (52 bits)
  const hexSlice = resultHash.substring(0, 13);
  const intVal = parseInt(hexSlice, 16);
  const e = Math.pow(2, 52);

  // 1% instant crash at 1.00x house house edge condition (e.g. if intVal % 33 === 0)
  let crashMultiplier = 1.0;
  if (intVal % 33 !== 0) {
    const rawMultiplier = Math.floor(((100 * e - intVal) / (e - intVal)) * 100) / 10000;
    // Cap at reasonable maximum (e.g. 1000.00x) and floor at 1.00x
    crashMultiplier = Math.max(1.0, Math.min(1000.0, Math.floor(rawMultiplier * 100) / 100));
  }

  return {
    id: crypto.randomUUID(),
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce,
    crashMultiplier,
  };
}
