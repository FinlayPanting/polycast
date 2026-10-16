import type { Word } from '@polycast/core'

/** How two transcripts of the same audio differ: words, timings and names. */
export interface TranscriptComparison {
  wordsA: number
  wordsB: number
  /** Share of A's words found, in order, in B. */
  matchedShare: number
  /** Start-time differences of matched words, in seconds. */
  medianStartDiffSec: number
  p95StartDiffSec: number
  /** Capitalised words (likely names) that only one side has. */
  namesOnlyInA: string[]
  namesOnlyInB: string[]
}

const norm = (s: string) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

/** Matches words in order (longest common subsequence) and compares their timings. */
export function compareTranscripts(a: Word[], b: Word[]): TranscriptComparison {
  const x = a.map((w) => norm(w.text))
  const y = b.map((w) => norm(w.text))
  const n = x.length
  const m = y.length
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i]![j] = x[i] === y[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  const diffs: number[] = []
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (x[i] === y[j]) diffs.push(Math.abs(a[i]!.start - b[j]!.start)), i++, j++
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++
    else j++
  }
  diffs.sort((p, q) => p - q)
  const at = (q: number) => (diffs.length ? diffs[Math.min(diffs.length - 1, Math.floor(q * diffs.length))]! : NaN)
  const names = (ws: Word[]) => new Set(ws.slice(1).filter((w, i) => /^\p{Lu}/u.test(w.text) && !/[.!?]$/.test(ws[i]!.text)).map((w) => w.text.replace(/[^\p{L}\p{N}-]/gu, '')))
  const na = names(a)
  const nb = names(b)
  return {
    wordsA: n,
    wordsB: m,
    matchedShare: n ? diffs.length / n : 0,
    medianStartDiffSec: at(0.5),
    p95StartDiffSec: at(0.95),
    namesOnlyInA: [...na].filter((s) => !nb.has(s)).sort(),
    namesOnlyInB: [...nb].filter((s) => !na.has(s)).sort(),
  }
}

/** Good enough to switch: nearly all words agree and timings stay within host-clip tolerance. */
export function timingsSurvive(c: TranscriptComparison): boolean {
  return c.matchedShare >= 0.95 && c.medianStartDiffSec <= 0.05 && c.p95StartDiffSec <= 0.2
}
