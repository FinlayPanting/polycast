import { costUSD, ZERO_USAGE } from '@polycast/core'
import { SpendGuard } from './budget'
import { ELEVEN_GUIDE_SPEED, ELEVEN_TTS_MODEL } from './providers/elevenlabs'
import { errorFromResponse, ProviderError } from './providers/types'
import { withRetry } from './retry'
import { elevenVoiceFor, GUIDES, type Guide } from './voices'

/**
 * Mia in the show's room (board item PC-1019-10): ElevenLabs' optional audio effects (12 Oct 2026:
 * a filter preset, perceived distance, a reverb environment; "effects do not change the cost of a
 * request") could make the guide sound part of the show rather than a voice-over. This voices a few
 * guide lines dry and with two or three gentle settings, side by side, for Finlay to hear. Nothing
 * changes for learners: lesson plans are voiced exactly as before unless he picks one.
 *
 *   ELEVENLABS_API_KEY=… pnpm --filter @polycast/server voice-room
 */

/** The `audio_effects` object ElevenLabs' text to speech accepts. */
export interface AudioEffects {
  filter_preset_id?: string
  /** 0 (close) to 1 (far). */
  distance?: number
  environment_id?: string
  /** How much of the reverb environment is heard, 0 to 1. */
  send_level?: number
}

export interface EffectsCatalog {
  filters: { id: string; name: string }[]
  environments: { id: string; name: string }[]
}

/**
 * `GET /v1/audio-effects/catalog`, read loosely: any list under a key naming filters or environments,
 * with each entry's id and name under the usual field names. An unreadable reply is an empty catalog.
 */
export function parseEffectsCatalog(json: unknown): EffectsCatalog {
  const out: EffectsCatalog = { filters: [], environments: [] }
  const entry = (x: unknown) => {
    if (typeof x === 'string') return { id: x, name: x }
    if (!x || typeof x !== 'object') return undefined
    const o = x as Record<string, unknown>
    const id = [o.id, o.preset_id, o.filter_preset_id, o.environment_id].find((v): v is string => typeof v === 'string' && v.length > 0)
    if (!id) return undefined
    const name = [o.name, o.display_name, o.label].find((v): v is string => typeof v === 'string') ?? id
    return { id, name }
  }
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 3) return
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      const list = Array.isArray(child) ? child.map(entry).filter((e): e is { id: string; name: string } => Boolean(e)) : undefined
      if (list && /filter/i.test(k)) out.filters.push(...list)
      else if (list && /environment|reverb|room|space/i.test(k)) out.environments.push(...list)
      else if (!Array.isArray(child)) walk(child, depth + 1)
    }
  }
  walk(json, 0)
  return out
}

export interface RoomSetting {
  label: string
  /** What Finlay should listen for. */
  note: string
  effects: AudioEffects | null
}

const find = (list: { id: string; name: string }[], ...patterns: RegExp[]) => {
  for (const p of patterns) {
    const hit = list.find((x) => p.test(x.name) || p.test(x.id))
    if (hit) return hit
  }
  return undefined
}

/**
 * Dry, plus up to three gentle settings from what the catalog offers: a touch of a small room, the
 * same room a little further back, and a broadcast-style filter with no reverb. Kept subtle on purpose:
 * Mia should sit in the show, never sound like she's in a hall.
 */
export function roomSettings(catalog: EffectsCatalog): RoomSetting[] {
  const settings: RoomSetting[] = [{ label: 'dry', note: 'As learners hear Mia and Leo today.', effects: null }]
  const room = find(catalog.environments, /small|studio|booth|room|living|office/i)
  if (room) {
    settings.push({ label: 'room', note: `A touch of “${room.name}”, close to the mic.`, effects: { environment_id: room.id, send_level: 0.25, distance: 0.1 } })
    settings.push({ label: 'room-back', note: `“${room.name}”, a little further from the mic.`, effects: { environment_id: room.id, send_level: 0.35, distance: 0.3 } })
  }
  const filter = find(catalog.filters, /warm|broadcast|radio|podcast|studio/i)
  if (filter) settings.push({ label: 'warm', note: `The “${filter.name}” filter, no reverb.`, effects: { filter_preset_id: filter.id, distance: 0.1 } })
  return settings
}

export const ROOM_LINES = [
  'So far: the two hosts have been arguing about whether a summer house counts as a holiday. Here’s Alex:',
  'Swedes call a coffee break fika, and they take it very seriously.',
  'Quick question. What did Sigge say he forgot to bring?',
]

/**
 * One take on ElevenLabs with effects. MP3 output, because reverb makes stereo audio and ElevenLabs
 * turns stereo effects down for the raw PCM the lesson voices use.
 */
export async function elevenRoomTake(
  apiKey: string,
  req: { text: string; voiceId: string; effects: AudioEffects | null; model?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const res = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: req.text,
      model_id: req.model ?? ELEVEN_TTS_MODEL,
      language_code: 'en',
      voice_settings: { speed: ELEVEN_GUIDE_SPEED },
      ...(req.effects ? { audio_effects: req.effects } : {}),
    }),
  })
  if (!res.ok) throw errorFromResponse('ElevenLabs TTS', res.status, await res.text())
  const audio = new Uint8Array(await res.arrayBuffer())
  if (audio.byteLength < 2) throw new ProviderError('ElevenLabs TTS reply had no audio', true)
  return audio
}

export async function fetchEffectsCatalog(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<EffectsCatalog> {
  try {
    const res = await fetchImpl('https://api.elevenlabs.io/v1/audio-effects/catalog', { headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(10_000) })
    return res.ok ? parseEffectsCatalog(await res.json()) : { filters: [], environments: [] }
  } catch {
    return { filters: [], environments: [] }
  }
}

export interface RoomTake {
  file: string
  guide: string
  setting: string
  line: number
}

/** Voices every line for every guide in every setting, each line's takes named to sit together. */
export async function runRoomAudition(deps: {
  take: (req: { text: string; voiceId: string; effects: AudioEffects | null }) => Promise<Uint8Array>
  settings: RoomSetting[]
  save: (file: string, bytes: Uint8Array) => Promise<void>
  guard: SpendGuard
  guides?: Guide[]
  lines?: string[]
}): Promise<RoomTake[]> {
  const takes: RoomTake[] = []
  const lines = deps.lines ?? ROOM_LINES
  for (const guide of deps.guides ?? GUIDES) {
    for (const [i, text] of lines.entries()) {
      for (const s of deps.settings) {
        const ledgerId = `voice-room-${guide.id}-${i}-${s.label}`
        const usage = { ...ZERO_USAGE, elevenTtsChars: text.length }
        await deps.guard.reserve(ledgerId, Math.max(0.001, costUSD(usage)))
        const audio = await withRetry(() => deps.take({ text, voiceId: elevenVoiceFor(guide.voice), effects: s.effects }))
        await deps.guard.settle(ledgerId, usage)
        const file = `${String(i + 1).padStart(2, '0')}-${guide.id}-${s.label}.mp3`
        await deps.save(file, audio)
        takes.push({ file, guide: guide.id, setting: s.label, line: i + 1 })
      }
    }
  }
  return takes
}
