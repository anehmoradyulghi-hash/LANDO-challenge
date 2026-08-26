import { randomInt, randomBytes } from "node:crypto";

/**
 * Returns a cryptographically secure random integer in [0, max).
 * Never use Math.random() for winner selection (section 39).
 */
export function secureRandomInt(max: number): number {
  if (max <= 0) throw new Error("max must be > 0");
  // node:crypto randomInt supports up to 2^48 - safe for any realistic pool size.
  return randomInt(0, max);
}

/**
 * Fisher-Yates shuffle using a CSPRNG, used for uniform (non-weighted) giveaways.
 */
export function secureShuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Weighted random selection WITHOUT replacement, using cumulative-weight
 * bisection driven by a CSPRNG. Used for ticket-weighted giveaways (section 39).
 *
 * entries: [{ id, weight }]
 * Returns up to `count` unique ids, ordered by draw order (1st drawn = winner rank 1).
 */
export function weightedRandomDraw<T extends { id: string; weight: number }>(
  entries: T[],
  count: number
): T[] {
  const pool = entries.filter((e) => e.weight > 0).map((e) => ({ ...e }));
  const winners: T[] = [];
  const n = Math.min(count, pool.length);

  for (let k = 0; k < n; k++) {
    const totalWeight = pool.reduce((sum, e) => sum + e.weight, 0);
    if (totalWeight <= 0) break;

    // Secure random point in [0, totalWeight)
    const point = secureRandomFloat() * totalWeight;

    let cumulative = 0;
    let pickedIndex = -1;
    for (let i = 0; i < pool.length; i++) {
      cumulative += pool[i].weight;
      if (point < cumulative) {
        pickedIndex = i;
        break;
      }
    }
    if (pickedIndex === -1) pickedIndex = pool.length - 1;

    winners.push(pool[pickedIndex]);
    pool.splice(pickedIndex, 1);
  }

  return winners;
}

/** Secure float in [0, 1) built from 6 random bytes (48 bits of entropy). */
function secureRandomFloat(): number {
  const buf = randomBytes(6);
  const val = buf.readUIntBE(0, 6); // 0 .. 2^48 - 1
  return val / Math.pow(2, 48);
}
