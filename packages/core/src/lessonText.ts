import type { GuideMoment, LessonPlan, MomentKind, Segment, Word } from './types'

/** Plain names for each kind of moment, as a reviewer would call them. */
export const MOMENT_NAMES: Record<MomentKind, string> = {
  warmup: 'Warm-up',
  listenFor: 'Listen for',
  spotlight: 'Spotlight',
  cultureNote: 'Culture note',
  checkpoint: 'Checkpoint',
  quickQuestion: 'Quick question',
  wrapUp: 'Wrap-up',
}

export interface LessonSource {
  title: string
  podcastTitle: string
  guideId?: string
  plan: LessonPlan
  transcript: { segments: Segment[]; words: Word[] }
}

function stamp(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

function clipWords(words: Word[], start: number, end: number): string {
  return words
    .filter((w) => w.start >= start - 0.05 && w.end <= end + 0.05)
    .map((w) => w.text)
    .join(' ')
}

/** The host's lines just before a moment (up to `before`) and the one it lands in or after. */
function linesAround(segments: Segment[], at: number, before = 2, after = 1): Segment[] {
  const i = segments.findIndex((s) => s.end > at)
  const cut = i < 0 ? segments.length : i
  return [...segments.slice(Math.max(0, cut - before), cut), ...segments.slice(cut, cut + after)]
}

function quote(s: Segment): string {
  const who = s.speaker ? `${s.speaker}: ` : ''
  return `> ${stamp(s.start)} ${who}${s.text}${s.translation ? `\n>   _${s.translation}_` : ''}`
}

function momentText(m: GuideMoment, src: LessonSource, n: number): string {
  const { words, segments } = src.transcript
  const clips = m.clips.map((c) => clipWords(words, c.start, c.end))
  const script = m.script.replace(/\{clip:(\d+)\}/g, (_, k) => `[host: “${clips[Number(k)] ?? '?'}”]`)
  const out = [`### ${n}. ${stamp(m.at)} · ${MOMENT_NAMES[m.kind] ?? m.kind} · from ${m.minLevel}`, '', `**Guide:** ${script}`]
  if (m.term) out.push('', `**Word:** ${m.term.text} (${m.term.lemma}): ${m.term.meaning}`)
  if (m.question) {
    out.push('', `**Question:** ${m.question.prompt}`)
    m.question.options.forEach((o, k) => out.push(`- ${k === m.question!.answerIndex ? '✓' : ' '} ${o}`))
  }
  if (m.clips.length) {
    out.push('', '**Host clips:**')
    m.clips.forEach((c, k) => out.push(`- clip ${k} at ${stamp(c.start)}–${stamp(c.end)}: “${clips[k]}”`))
  }
  if (m.kind !== 'warmup' && m.kind !== 'wrapUp') {
    const around = linesAround(segments, m.at)
    if (around.length) out.push('', '**Around it:**', ...around.map(quote))
  }
  return out.join('\n')
}

/**
 * One episode's lesson as a readable page (Markdown): every moment in order with its time, kind,
 * what the guide says (host clips written in), the host lines around it, and the wrap-up questions.
 * For reviewing lesson quality; nothing here is shown to learners.
 */
export function lessonText(src: LessonSource): string {
  const { plan } = src
  const moments = [...plan.moments].sort((a, b) => a.at - b.at)
  const counts = moments.reduce<Record<string, number>>((c, m) => ((c[m.kind] = (c[m.kind] ?? 0) + 1), c), {})
  const head = [
    `# ${src.podcastTitle}: ${src.title}`,
    '',
    `Lesson plan v${plan.version}, ${plan.targetLanguage} for ${plan.nativeLanguage} speakers${src.guideId ? `, guide ${src.guideId}` : ''}.`,
    `Hosts: ${plan.hosts.map((h) => `${h.name} (${h.description})`).join('; ') || 'not named'}.`,
    `Moments: ${moments.length} (${Object.entries(counts).map(([k, v]) => `${v} ${MOMENT_NAMES[k as MomentKind] ?? k}`).join(', ')}).`,
    '',
    `**Summary:** ${plan.summary}`,
    '',
    '## Moments',
  ]
  const body = moments.map((m, i) => momentText(m, src, i + 1))
  const wrap = ['## Wrap-up questions']
  plan.wrapUpQuestions.forEach((q, i) => {
    wrap.push('', `${i + 1}. ${q.prompt}`)
    q.options.forEach((o, k) => wrap.push(`   - ${k === q.answerIndex ? '✓' : ' '} ${o}`))
  })
  if (!plan.wrapUpQuestions.length) wrap.push('', 'None.')
  return [...head, '', body.join('\n\n'), '', ...wrap, ''].join('\n')
}
