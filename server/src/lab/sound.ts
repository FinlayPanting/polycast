import { spawn } from 'node:child_process'
import { GUIDE_LUFS, parseIntegratedLoudness } from '@polycast/core'
import { GUIDE_FADE_SEC, wavDurationSec } from '../audio'

/**
 * Audio work for the Lab with ffmpeg, all in memory: tidying a take the way the app's guide lines
 * are tidied, gentle "room" sounds, cutting a stretch of an episode and joining pieces into one
 * preview. Nothing here is written to disk.
 */

/**
 * Sound settings the Lab can put on a guide line after it's voiced (free, any voice). Kept gentle:
 * Mia should sound part of the show, never like she's in a hall.
 */
export const SOUND_PRESETS = {
  dry: { label: 'Dry', note: 'As learners hear Mia and Leo today.', chain: [] as string[] },
  studio: {
    label: 'Studio',
    note: 'Cleaned up like a podcast mic: low rumble and harsh top trimmed, gently compressed.',
    chain: ['highpass=f=80', 'lowpass=f=13000', 'acompressor=threshold=0.125:ratio=2.5:attack=15:release=200'],
  },
  smallRoom: {
    label: 'Small room',
    note: 'Studio, plus the faint early reflections of a small treated room.',
    chain: ['highpass=f=80', 'lowpass=f=13000', 'acompressor=threshold=0.125:ratio=2.5:attack=15:release=200', 'aecho=0.9:0.85:19|31|43:0.10|0.07|0.04'],
  },
  backOfRoom: {
    label: 'Back of the room',
    note: 'A little further from the mic: softer top, a touch more room.',
    chain: ['highpass=f=100', 'lowpass=f=8500', 'aecho=0.9:0.8:23|37|53:0.14|0.10|0.06', 'volume=-1.5dB'],
  },
} as const

export type SoundPreset = keyof typeof SOUND_PRESETS

export function isSoundPreset(s: unknown): s is SoundPreset {
  return typeof s === 'string' && Object.hasOwn(SOUND_PRESETS, s)
}

/**
 * The chain a guide line gets: the preset, then the app's own treatment (brought to the podcast
 * loudness standard, short fades in and out). The fade-out works without knowing the length by
 * fading in the reversed audio.
 */
export function lineChain(preset: SoundPreset = 'dry'): string {
  return [
    ...SOUND_PRESETS[preset].chain,
    `loudnorm=I=${GUIDE_LUFS}:TP=-1.5:LRA=11`,
    `afade=t=in:st=0:d=${GUIDE_FADE_SEC}`,
    'areverse',
    `afade=t=in:st=0:d=${GUIDE_FADE_SEC}`,
    'areverse',
  ].join(',')
}

/**
 * The app's handover pacing (app/src/player/GuidedListen.ts, Finlay 14 Oct), copied here so a
 * preview sounds like the phone. Change both together.
 */
export const HANDOVER = {
  fadeOutSec: 0.45,
  fadeInSec: 0.9,
  breathBeforeSec: 0.45,
  breathAfterSec: 0.5,
  pickUpBeforeSec: 2,
  gapBeforeClipSec: 0.35,
  gapAfterClipSec: 0.45,
  clipLeadSec: 0.15,
  clipTailSec: 0.2,
} as const
export const LINE_GAP_SEC = 0.12

/** The Lab's working format: 44.1 kHz stereo 16-bit WAV, so effects in stereo survive and pieces join cleanly. */
export const LAB_RATE = 44100
const WAV_OUT = ['-ar', String(LAB_RATE), '-ac', '2', '-c:a', 'pcm_s16le', '-f', 'wav']

export function runFfmpeg(args: string[], input?: Uint8Array, ffmpegPath = 'ffmpeg'): Promise<{ out: Uint8Array; log: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-hide_banner', '-nostdin', ...args])
    const out: Buffer[] = []
    const err: Buffer[] = []
    p.stdout.on('data', (d: Buffer) => out.push(d))
    p.stderr.on('data', (d: Buffer) => err.push(d))
    p.on('error', reject)
    p.on('close', (code) => {
      const log = Buffer.concat(err).toString()
      if (code === 0) resolve({ out: new Uint8Array(Buffer.concat(out)), log })
      else reject(new Error(`ffmpeg failed: ${log.slice(-400)}`))
    })
    p.stdin.on('error', () => {})
    if (input) p.stdin.end(Buffer.from(input.buffer, input.byteOffset, input.byteLength))
    else p.stdin.end()
  })
}

/**
 * ffmpeg reads WAV headers with a 0xFFFFFFFF data size (as it writes them to a pipe) fine, but our
 * duration helper needs a real size, so fix the header up from the bytes we have.
 */
export function fixWavSizes(wav: Uint8Array): Uint8Array {
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const tag = (o: number) => String.fromCharCode(wav[o]!, wav[o + 1]!, wav[o + 2]!, wav[o + 3]!)
  if (wav.byteLength < 12 || tag(0) !== 'RIFF') return wav
  v.setUint32(4, wav.byteLength - 8, true)
  let offset = 12
  while (offset + 8 <= wav.byteLength) {
    const id = tag(offset)
    if (id === 'data') {
      v.setUint32(offset + 4, wav.byteLength - offset - 8, true)
      break
    }
    offset += 8 + v.getUint32(offset + 4, true)
  }
  return wav
}

/** Any audio a voice returns → a tidied WAV in the Lab's format, with its length. */
export async function tidyLine(audio: Uint8Array, preset: SoundPreset = 'dry'): Promise<{ wav: Uint8Array; durationSec: number }> {
  const { out } = await runFfmpeg(['-loglevel', 'error', '-i', 'pipe:0', '-af', lineChain(preset), ...WAV_OUT, '-rf64', 'never', 'pipe:1'], audio)
  const wav = fixWavSizes(out)
  return { wav, durationSec: wavDurationSec(wav) }
}

/** WAV → 128 kbit/s MP3, which every browser plays. */
export async function toMp3(wav: Uint8Array): Promise<Uint8Array> {
  return (await runFfmpeg(['-loglevel', 'error', '-f', 'wav', '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', 'pipe:1'], wav)).out
}

/** A stretch of an episode (any format), as a WAV in the Lab's format. */
export async function cutEpisode(episode: Uint8Array, start: number, end: number): Promise<Uint8Array> {
  const from = Math.max(0, start)
  const dur = Math.max(0.05, end - from)
  // -ss before -i seeks fast; on a pipe ffmpeg decodes up to it, which is fine for a preview.
  const { out } = await runFfmpeg(['-loglevel', 'error', '-ss', from.toFixed(3), '-t', dur.toFixed(3), '-i', 'pipe:0', ...WAV_OUT, '-rf64', 'never', 'pipe:1'], episode)
  return fixWavSizes(out)
}

/** Silence in the Lab's format. */
export function silence(seconds: number): Uint8Array {
  const frames = Math.round(Math.max(0, seconds) * LAB_RATE)
  const dataSize = frames * 4
  const buf = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buf)
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); w(8, 'WAVE')
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true)
  v.setUint32(24, LAB_RATE, true); v.setUint32(28, LAB_RATE * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, dataSize, true)
  return new Uint8Array(buf)
}

/** The PCM bytes of a Lab-format WAV (after its data chunk header). */
export function wavData(wav: Uint8Array): Uint8Array {
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const tag = (o: number) => String.fromCharCode(wav[o]!, wav[o + 1]!, wav[o + 2]!, wav[o + 3]!)
  let offset = 12
  while (offset + 8 <= wav.byteLength) {
    const size = v.getUint32(offset + 4, true)
    if (tag(offset) === 'data') return wav.subarray(offset + 8, Math.min(wav.byteLength, offset + 8 + size))
    offset += 8 + size + (size % 2)
  }
  throw new Error('WAV has no data chunk')
}

/** Joins Lab-format WAVs end to end. */
export function joinWavs(pieces: Uint8Array[]): Uint8Array {
  const datas = pieces.map(wavData)
  const total = datas.reduce((a, d) => a + d.byteLength, 0)
  const head = silence(0)
  const out = new Uint8Array(44 + total)
  out.set(head, 0)
  const v = new DataView(out.buffer)
  v.setUint32(4, 36 + total, true)
  v.setUint32(40, total, true)
  let at = 44
  for (const d of datas) {
    out.set(d, at)
    at += d.byteLength
  }
  return out
}

/** Scales a Lab-format WAV's volume (the app plays the guide at a level matched to each episode). */
export function scaleWav(wav: Uint8Array, gain: number): Uint8Array {
  if (gain === 1) return wav
  const copy = new Uint8Array(wav)
  const data = wavData(copy)
  const s = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2))
  for (let i = 0; i < s.length; i++) s[i] = Math.max(-32768, Math.min(32767, Math.round(s[i]! * gain)))
  return copy
}

/**
 * Eased fades (slow at both ends, like the app's) at the start and end of a Lab-format WAV.
 */
export function fadeWav(wav: Uint8Array, inSec: number, outSec: number): Uint8Array {
  const copy = new Uint8Array(wav)
  const data = wavData(copy)
  const s = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2))
  const frames = s.length / 2
  const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)))
  const inF = Math.min(frames, Math.round(inSec * LAB_RATE))
  const outF = Math.min(frames, Math.round(outSec * LAB_RATE))
  for (let f = 0; f < inF; f++) {
    const g = ease(f / inF)
    s[2 * f] = Math.round(s[2 * f]! * g)
    s[2 * f + 1] = Math.round(s[2 * f + 1]! * g)
  }
  for (let k = 0; k < outF; k++) {
    const f = frames - 1 - k
    const g = ease(k / outF)
    s[2 * f] = Math.round(s[2 * f]! * g)
    s[2 * f + 1] = Math.round(s[2 * f + 1]! * g)
  }
  return copy
}

/** Integrated loudness (LUFS) of a stretch of audio, for the preview's level check. */
export async function loudnessOf(audio: Uint8Array): Promise<number | undefined> {
  try {
    const { log } = await runFfmpeg(['-nostats', '-i', 'pipe:0', '-vn', '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], audio)
    return parseIntegratedLoudness(log)
  } catch {
    return undefined
  }
}
