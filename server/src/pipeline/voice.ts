import type { AudioPart, GuideMoment, LessonPlan } from '@polycast/core'
import { mapLimit, withRetry } from '../retry'
import type { SpeechSynth, Storage } from '../providers/types'
import type { UsageMeter } from '../budget'
import type { Guide } from '../voices'

/** Splits a script at {clip:N} markers into speech and host-clip parts, in order. */
export function splitScript(script: string): ({ kind: 'speech'; text: string } | { kind: 'clip'; clipIndex: number })[] {
  const parts: ({ kind: 'speech'; text: string } | { kind: 'clip'; clipIndex: number })[] = []
  const re = /\{clip:(\d+)\}/g
  let last = 0
  for (const m of script.matchAll(re)) {
    const text = script.slice(last, m.index).trim()
    if (text) parts.push({ kind: 'speech', text })
    parts.push({ kind: 'clip', clipIndex: Number(m[1]) })
    last = m.index! + m[0].length
  }
  const tail = script.slice(last).trim()
  if (tail) parts.push({ kind: 'speech', text: tail })
  return parts
}

/**
 * Voices every moment of the full Hands-on plan once, for one guide. Lighter levels play a subset,
 * so one pass covers all three levels (spec: How it's made).
 */
export async function voicePlan(
  plan: LessonPlan,
  guide: Guide,
  deps: { speech: SpeechSynth; storage: Storage; meter: UsageMeter },
): Promise<LessonPlan> {
  const voiced = await mapLimit(plan.moments, 4, async (m): Promise<GuideMoment> => {
    const pieces = splitScript(m.script)
    let speechIndex = 0
    const parts: AudioPart[] = []
    let durationSec = 0
    for (const piece of pieces) {
      if (piece.kind === 'clip') {
        const clip = m.clips[piece.clipIndex]
        if (!clip) continue
        parts.push({ kind: 'clip', clipIndex: piece.clipIndex })
        durationSec += clip.end - clip.start
        continue
      }
      const { audio, mimeType, durationSec: d, usage } = await withRetry(() =>
        deps.speech.synthesize({ text: piece.text, voice: guide.voice, style: guide.style, language: plan.nativeLanguage }),
      )
      deps.meter.add(usage)
      const ext = mimeType === 'audio/mp4' ? 'm4a' : mimeType === 'audio/mpeg' ? 'mp3' : 'wav'
      const url = await deps.storage.put(`guide/${plan.episodeId}/v${plan.version}/${guide.id}/${m.id}-${speechIndex++}.${ext}`, audio, mimeType)
      parts.push({ kind: 'speech', url, durationSec: d })
      durationSec += d
    }
    return { ...m, audio: { parts, durationSec } }
  })
  return { ...plan, moments: voiced }
}
