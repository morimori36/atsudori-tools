/**
 * Rectangular Hungarian matching. Rows and columns must already be in stable ID order.
 * null forbids an edge; callers provide one dummy (no Snap) column per member.
 * BigInt encodes an exact lexicographic column tie-break below the weight total:
 * no floating epsilon, overflow or change to calculateRating's rounding.
 * O(rows² * columns) time, O(rows * columns) space; no exponential enumeration.
 */
export function maximumAssignment(weights: readonly (readonly (number | null)[])[]): number[] {
  const n = weights.length;
  if (!n) return [];
  const m = weights[0]!.length;
  if (m < n || weights.some(row => row.length !== m)) throw new Error('invalid assignment dimensions');
  const base = BigInt(m + 1), scale = base ** BigInt(n);
  const places = Array.from({length:n}, (_,i) => base ** BigInt(n - 1 - i));
  const costs = weights.map((row,i) => row.map((value,j) => value === null ? null
    : -BigInt(value) * scale + BigInt(j) * places[i]!));
  const u = Array<bigint>(n + 1).fill(0n), v = Array<bigint>(m + 1).fill(0n);
  const p = Array<number>(m + 1).fill(0), way = Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const min = Array<bigint | null>(m + 1).fill(null), used = Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta: bigint | null = null, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const cost = costs[i0 - 1]![j - 1]!;
        if (cost !== null) {
          const cur = cost - u[i0]! - v[j]!;
          if (min[j] === null || cur < min[j]!) { min[j] = cur; way[j] = j0; }
        }
        if (min[j] !== null && (delta === null || min[j]! < delta)) { delta = min[j]!; j1 = j; }
      }
      if (delta === null) throw new Error('no feasible assignment');
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]!] = u[p[j]!]! + delta; v[j] = v[j]! - delta; }
        else if (min[j] !== null) min[j] = min[j]! - delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }
  const result = Array<number>(n);
  for (let j = 1; j <= m; j++) if (p[j]) result[p[j]! - 1] = j - 1;
  return result;
}
