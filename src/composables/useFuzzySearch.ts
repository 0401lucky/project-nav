export interface FuzzyResult<T> {
  item: T
  score: number
  matches: number[]
}

export function fuzzyScore(text: string, query: string): number {
  if (!query) return 0
  const t = text.toLowerCase()
  const q = query.toLowerCase()

  if (t === q) return 1000
  if (t.startsWith(q)) return 800 - q.length
  const idx = t.indexOf(q)
  if (idx >= 0) return 600 - idx

  let qi = 0
  let score = 0
  let lastMatch = -2
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += i - lastMatch === 1 ? 8 : 3
      if (i === 0 || /\s|[-_/.]/.test(t[i - 1])) score += 4
      lastMatch = i
      qi++
    }
  }
  if (qi !== q.length) return 0
  return score
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
): FuzzyResult<T>[] {
  if (!query.trim()) {
    return items.map((item, i) => ({ item, score: -i, matches: [] }))
  }
  const q = query.trim()
  return items
    .map((item) => ({ item, score: fuzzyScore(getText(item), q), matches: [] }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
}
