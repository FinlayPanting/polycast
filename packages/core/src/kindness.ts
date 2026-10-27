/**
 * A kindness check on every nudge (PC-1026-07). Coming back is always an invitation, never a telling-off:
 * no guilt ("you gave up on Swedish"), no streak threats ("don't lose your streak"), no sulking ("we miss
 * you"), no pressure ("last chance"), no shouting. Tests run every notification and nudge line through it,
 * so a line that guilt-trips fails the build.
 */
const UNKIND: { why: string; pattern: RegExp }[] = [
  { why: 'says they gave up or quit', pattern: /\b(gave|give|giving|given)\s+up\b|\bquit(ting)?\b|\babandon/i },
  { why: 'threatens a streak', pattern: /\bstreaks?\b/i },
  { why: 'says we miss them', pattern: /\b(we|i)\s+(really\s+)?miss(ed)?\s+you\b|\bmissing\s+you\b/i },
  { why: 'says they forgot or neglected it', pattern: /\bforg(ot|otten|etting)\b|\bneglect|\bignor(e|ed|ing)\b/i },
  { why: 'counts how long they have been away', pattern: /\b(it[’']?s|it has)\s+been\s+(\d+|a|an|one|two|three|four|five|six|seven|several|many|a few)\s+(days?|weeks?|months?)\b|\b(days?|weeks?|months?)\s+since\b/i },
  { why: 'says they are behind or slipping', pattern: /\bfall(ing|en)?\s+behind\b|\bslipping\b|\bbehind\s+(on|with)\b/i },
  { why: 'is disappointed or sad about them', pattern: /\b(disappointed|disappointing|sad|let\s+(me|us)\s+down)\b/i },
  { why: 'calls them lazy', pattern: /\blazy\b|\bslacking\b/i },
  { why: 'pressures them with time running out', pattern: /\blast\s+chance\b|\bbefore\s+it[’']?s\s+too\s+late\b|\bdon[’']?t\s+(lose|waste|let)\b|\brunning\s+out\b/i },
  { why: 'tells them off', pattern: /\byou\s+(should|must|need\s+to|have\s+to)\b|\bwhere\s+have\s+you\s+been\b|\bwhy\s+(haven|didn)[’']?t\s+you\b/i },
  { why: 'shouts', pattern: /!/ },
]

/** The reasons a line isn't kind, or an empty list when it is. */
export function unkindReasons(line: string): string[] {
  return UNKIND.filter((u) => u.pattern.test(line)).map((u) => u.why)
}

export function isKindNudge(line: string): boolean {
  return unkindReasons(line).length === 0
}
