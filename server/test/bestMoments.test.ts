import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { GuideMoment, Segment, Word } from '@polycast/core'
import { bestMoments, scoreMoment } from '../src/lab/bestMoments'

/** A transcript of one-word-per-second lines, each `text` starting at `start`. */
function transcript(lines: { start: number; text: string; speaker?: string }[]) {
  const words: Word[] = []
  const segments: Segment[] = []
  lines.forEach((l, i) => {
    const ws = l.text.split(' ')
    const wordStart = words.length
    ws.forEach((w, k) => words.push({ text: w, start: l.start + k * 0.5, end: l.start + k * 0.5 + 0.45, speaker: l.speaker }))
    segments.push({ id: `s${i}`, start: l.start, end: l.start + ws.length * 0.5 - 0.05, text: l.text, wordStart, wordEnd: words.length })
  })
  return { words, segments }
}

const moment = (id: string, at: number, guideSec: number | undefined, kind: GuideMoment['kind'] = 'spotlight'): GuideMoment => ({
  id,
  kind,
  at,
  minLevel: 'standard',
  script: 'x',
  clips: [],
  ...(guideSec === undefined ? {} : { audio: { parts: [{ kind: 'speech', url: 'u', durationSec: guideSec }], durationSec: guideSec } }),
})

describe('The Lab picks the best moments for a video (PC-1030-10)', () => {
  const t = transcript([
    { start: 10, text: 'Det här är en ganska vanlig mening' }, // 7 words, 3.5 s: clear
    { start: 40, text: 'Nej' }, // too short
    { start: 70, text: 'Haha jag kan inte tro det' },
    { start: 100, text: 'Och då sa han att tåget var försenat igen!' },
    { start: 130, text: 'en två tre fyra fem sex sju åtta nio tio elva tolv tretton fjorton femton sexton sjutton arton' }, // too long
  ])

  it('scores a clear host line just before, a laugh or punchline nearby, and a short guide line', () => {
    expect(scoreMoment(moment('a', 14, 8), t)).toEqual({ score: 4, reasons: ['clear host line just before', 'short guide line (8 s)'] })
    expect(scoreMoment(moment('b', 41, 8), t)).toEqual({ score: 2, reasons: ['short guide line (8 s)'] })
    expect(scoreMoment(moment('c', 73.5, 9), t)).toEqual({ score: 6, reasons: ['clear host line just before', 'a laugh nearby', 'short guide line (9 s)'] })
    expect(scoreMoment(moment('d', 105, 15), t)).toEqual({ score: 3, reasons: ['clear host line just before', 'a punchline nearby'] })
    expect(scoreMoment(moment('e', 140, 25), t)).toEqual({ score: -1, reasons: ['long guide line (25 s)'] })
  })

  it('never picks unvoiced moments, the warm-up or the wrap-up', () => {
    expect(scoreMoment(moment('n', 14, undefined), t)).toBeUndefined()
    expect(scoreMoment(moment('w', 14, 5, 'warmup'), t)).toBeUndefined()
    expect(scoreMoment(moment('z', 14, 5, 'wrapUp'), t)).toBeUndefined()
  })

  it('lists the top three, best first, ties to the earlier one', () => {
    const ms = [moment('a', 14, 8), moment('b', 41, 8), moment('c', 73.5, 9), moment('d', 105, 15), moment('e', 140, 25), moment('n', 14, undefined)]
    expect(bestMoments(ms, t).map((b) => b.id)).toEqual(['c', 'a', 'd'])
    expect(bestMoments([moment('e', 140, 25)], t)).toEqual([])
  })

  it('shows them first in the Moments list, picked already', () => {
    const page = readFileSync(new URL('../src/lab/page.html', import.meta.url), 'utf8')
    expect(page).toContain('Best for a video #')
    expect(page).toContain('picker.ep.best?.[0]')
    expect(readFileSync(new URL('../src/lab/routes.ts', import.meta.url), 'utf8')).toContain('best: bestMoments(ep.plan.moments, ep.transcript)')
  })
})
