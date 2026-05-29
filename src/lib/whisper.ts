export interface WhisperWord {
  word: string
  start: number
  end: number
}

export interface WhisperSegment {
  id: number
  start: number
  end: number
  text: string
  words?: WhisperWord[]
}

export interface WhisperResponse {
  text: string
  segments: WhisperSegment[]
  language: string
}

const WHISPER_MAX_BYTES = 24 * 1024 * 1024 // 24 MB — stay comfortably under the 25 MB API limit
const CHUNK_DURATION_SECS = 9 * 60          // 9-minute chunks → ~17 MB WAV each

export async function transcribeAudio(
  audioBlob: Blob,
  language: string,
  apiKey: string,
  onProgress?: (pct: number) => void,
): Promise<WhisperResponse> {
  if (audioBlob.size <= WHISPER_MAX_BYTES) {
    onProgress?.(0.1)
    const result = await callWhisper(audioBlob, language, apiKey)
    onProgress?.(1)
    return result
  }

  // Decode full audio once, then process in time-sliced chunks
  onProgress?.(0.05)
  const arrayBuffer = await audioBlob.arrayBuffer()
  const tempCtx = new AudioContext()
  const decoded = await tempCtx.decodeAudioData(arrayBuffer)
  await tempCtx.close()
  onProgress?.(0.1)

  const numChunks = Math.ceil(decoded.duration / CHUNK_DURATION_SECS)
  const allSegments: WhisperSegment[] = []
  let fullText = ''
  let detectedLanguage = ''

  for (let i = 0; i < numChunks; i++) {
    const startSec = i * CHUNK_DURATION_SECS
    const endSec = Math.min((i + 1) * CHUNK_DURATION_SECS, decoded.duration)

    const samples = await resampleMono16k(decoded, startSec, endSec)
    const wav = encodeWav(samples, 16_000)

    const chunkResult = await callWhisper(wav, language, apiKey)
    console.log(`[polycast] chunk ${i + 1}/${numChunks} — segments:`, chunkResult.segments?.length ?? 'none', '| text length:', chunkResult.text?.length ?? 0)

    ;(chunkResult.segments ?? []).forEach((seg) => {
      allSegments.push({
        ...seg,
        id: allSegments.length,
        start: seg.start + startSec,
        end: seg.end + startSec,
        words: seg.words?.map((w) => ({
          ...w,
          start: w.start + startSec,
          end: w.end + startSec,
        })),
      })
    })
    fullText += (fullText ? ' ' : '') + chunkResult.text.trim()
    if (!detectedLanguage) detectedLanguage = chunkResult.language

    onProgress?.(0.1 + 0.9 * (i + 1) / numChunks)
  }

  return { text: fullText, segments: allSegments, language: detectedLanguage }
}

// Resample a time slice of the decoded buffer to 16 kHz mono using OfflineAudioContext
async function resampleMono16k(buffer: AudioBuffer, startSec: number, endSec: number): Promise<Float32Array> {
  const duration = endSec - startSec
  const frameCount = Math.ceil(duration * 16_000)
  const offlineCtx = new OfflineAudioContext(1, frameCount, 16_000)
  const source = offlineCtx.createBufferSource()
  source.buffer = buffer
  source.connect(offlineCtx.destination)
  source.start(0, startSec, duration)
  const rendered = await offlineCtx.startRendering()
  return rendered.getChannelData(0)
}

// Minimal WAV encoder — mono 16-bit PCM
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataBytes = samples.length * 2
  const buf = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buf)
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }

  str(0, 'RIFF');  view.setUint32(4, 36 + dataBytes, true)
  str(8, 'WAVE'); str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)             // PCM
  view.setUint16(22, 1, true)             // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data'); view.setUint32(40, dataBytes, true)

  let off = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    off += 2
  }

  return new Blob([buf], { type: 'audio/wav' })
}

async function callWhisper(audio: Blob, language: string, apiKey: string): Promise<WhisperResponse> {
  const form = new FormData()
  form.append('file', audio, audio.type === 'audio/wav' ? 'chunk.wav' : 'episode.mp3')
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')
  form.append('timestamp_granularities[]', 'word')
  form.append('language', languageCode(language))

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Whisper error ${res.status}: ${err}`)
  }

  return res.json() as Promise<WhisperResponse>
}

function languageCode(name: string): string {
  const map: Record<string, string> = {
    Swedish: 'sv', Spanish: 'es', German: 'de', French: 'fr',
    Italian: 'it', Portuguese: 'pt', Dutch: 'nl', Norwegian: 'no',
    Danish: 'da', Polish: 'pl', Japanese: 'ja', Mandarin: 'zh', Korean: 'ko',
  }
  return map[name] ?? 'sv'
}
