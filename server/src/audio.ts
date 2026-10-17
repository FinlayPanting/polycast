import { spawn } from 'node:child_process'
import { FINGERPRINT_SAMPLE_RATE, FingerprintBuilder } from '@polycast/core'
import { POLYCAST_UA, safeFetch, TooLarge, UnsafeUrl, type LookupHost } from './safeFetch'

/** Duration of a PCM WAV file from its header. */
export function wavDurationSec(wav: Uint8Array): number {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const tag = (o: number) => String.fromCharCode(wav[o]!, wav[o + 1]!, wav[o + 2]!, wav[o + 3]!)
  if (wav.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file')
  let byteRate = 0
  let offset = 12
  while (offset + 8 <= wav.byteLength) {
    const id = tag(offset)
    const size = view.getUint32(offset + 4, true)
    if (id === 'fmt ') byteRate = view.getUint32(offset + 16, true)
    if (id === 'data') {
      if (!byteRate) throw new Error('WAV has no format chunk')
      const dataSize = Math.min(size, wav.byteLength - offset - 8)
      return dataSize / byteRate
    }
    offset += 8 + size + (size % 2)
  }
  throw new Error('WAV has no data chunk')
}

/** Wraps raw 16-bit mono PCM (as ElevenLabs' pcm_24000 returns it) in a WAV header. */
export function pcmToWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const out = new Uint8Array(44 + pcm.byteLength)
  const v = new DataView(out.buffer)
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.byteLength, true); w(8, 'WAVE')
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, pcm.byteLength, true)
  out.set(pcm, 44)
  return out
}

/** A silent PCM WAV, used by tests and mocks. */
export function silentWav(seconds: number, sampleRate = 24000): Uint8Array {
  const dataSize = Math.round(seconds * sampleRate) * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buf)
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); w(8, 'WAVE')
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, dataSize, true)
  return new Uint8Array(buf)
}

/** WAV → 64 kbit/s AAC in an M4A container with ffmpeg: about 0.5 MB a minute of guide speech. */
export function ffmpegAacEncoder(ffmpegPath = 'ffmpeg') {
  return (wav: Uint8Array): Promise<{ audio: Uint8Array; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'wav', '-i', 'pipe:0', '-c:a', 'aac', '-b:a', '64k', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'])
      const out: Buffer[] = []
      const err: Buffer[] = []
      p.stdout.on('data', (d: Buffer) => out.push(d))
      p.stderr.on('data', (d: Buffer) => err.push(d))
      p.on('error', reject)
      p.on('close', (code) => {
        if (code === 0) resolve({ audio: new Uint8Array(Buffer.concat(out)), mimeType: 'audio/mp4' })
        else reject(new Error(`ffmpeg failed: ${Buffer.concat(err).toString().slice(0, 300)}`))
      })
      p.stdin.end(Buffer.from(wav))
    })
}

/**
 * Fingerprints an episode (see @polycast/core sync.ts): ffmpeg decodes it to 8 kHz mono and the
 * samples stream through the fingerprint builder, so the decoded audio is never held in memory.
 */
export function ffmpegFingerprint(ffmpegPath = 'ffmpeg') {
  return (audio: Uint8Array): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
      const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', String(FINGERPRINT_SAMPLE_RATE), '-f', 's16le', 'pipe:1'])
      const fp = new FingerprintBuilder()
      let odd: Buffer | undefined
      const err: Buffer[] = []
      p.stdout.on('data', (d: Buffer) => {
        const buf = odd ? Buffer.concat([odd, d]) : d
        const even = buf.length - (buf.length % 2)
        odd = even < buf.length ? buf.subarray(even) : undefined
        // Copy into an aligned buffer: Int16Array needs an even byte offset.
        const aligned = new Int16Array(even / 2)
        Buffer.from(aligned.buffer).set(buf.subarray(0, even))
        fp.push(aligned)
      })
      p.stderr.on('data', (d: Buffer) => err.push(d))
      p.on('error', reject)
      p.on('close', (code) => {
        if (code === 0) resolve(fp.finish())
        else reject(new Error(`ffmpeg fingerprint failed: ${Buffer.concat(err).toString().slice(0, 300)}`))
      })
      p.stdin.on('error', () => {}) // ffmpeg may close early on a bad file; 'close' reports it
      p.stdin.end(Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength))
    })
}

/** The longest an episode download may take; a two-hour episode is about 120 MB. */
export const EPISODE_TIMEOUT_MS = 10 * 60 * 1000
export const EPISODE_MAX_BYTES = 400 * 1024 * 1024

/**
 * Downloads an episode's audio once, into memory only (it is never written to disk or storage).
 * Same safety as feeds: public addresses only, every redirect checked, a time limit, and the size
 * cap enforced while reading, so an undeclared or lying length can't fill the server's memory.
 */
export function downloadEpisode(fetchImpl: typeof fetch = fetch, maxBytes = EPISODE_MAX_BYTES, opts: { lookupHost?: LookupHost; timeoutMs?: number } = {}) {
  return async (url: string): Promise<Uint8Array> => {
    try {
      // Podcast links often hop through a few measurement redirects before the file.
      const res = await safeFetch(url, { fetch: fetchImpl, maxBytes, maxRedirects: 10, timeoutMs: opts.timeoutMs ?? EPISODE_TIMEOUT_MS, lookupHost: opts.lookupHost, headers: POLYCAST_UA })
      if (!res.ok) throw new Error(`Couldn't download the episode: ${res.status}`)
      return res.body
    } catch (e) {
      if (e instanceof TooLarge) throw new Error(`Episode file too large (over ${Math.round(maxBytes / 1e6)} MB)`)
      if (e instanceof UnsafeUrl) throw new Error(`Couldn't download the episode: ${e.message}`)
      throw e
    }
  }
}
