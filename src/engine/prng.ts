export function hash32(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function stableIndex(seed: string, purposeKey: string, length: number): number {
  if (length <= 0) throw new Error('Cannot choose from an empty list');
  return hash32(`${seed}:${purposeKey}`) % length;
}

export function stableShuffle<T>(items: readonly T[], seed: string, purposeKey: string): T[] {
  return items
    .map((item, index) => ({ item, score: hash32(`${seed}:${purposeKey}:${index}`), index }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ item }) => item);
}
