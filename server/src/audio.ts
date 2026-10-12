import { spawn } from 'node:child_process'

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
