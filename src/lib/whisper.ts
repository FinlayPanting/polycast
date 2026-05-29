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

const WHISPER_MAX_BYTES = 24 * 1024 * 1024  // stay under 25MB API limit
const CHUNK_BYTES = 20 * 1024 * 1024         // 20MB chunks

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

  // Get duration for timestamp offset estimation (no decoding — just metadata)
  onProgress?.(0.05)
  const duration = await getAudioDuration(audioBlob)
  console.log('[polycast] audio duration:', duration.toFixed(1), 's, size:', (audioBlob.size / 1e6).toFixed(1), 'MB')
  onProgress?.(0.1)

  const totalBytes = audioBlob.size
  const numChunks = Math.ceil(totalBytes / CHUNK_BYTES)
  const allSegments: WhisperSegment[] = []
  let fullText = ''
  let detectedLanguage = ''

  for (let i = 0; i < numChunks; i++) {
    const startByte = i * CHUNK_BYTES
    const endByte = Math.min((i + 1) * CHUNK_BYTES, totalBytes)
    const chunk = audioBlob.slice(startByte, endByte, audioBlob.type)

    // Estimate time offset from byte position — accurate for CBR, approximate for VBR
    const timeOffset = duration > 0 ? (startByte / totalBytes) * duration : 0
    console.log(`[polycast] whisper chunk ${i + 1}/${numChunks}: bytes ${startByte}–${endByte}, timeOffset ${timeOffset.toFixed(1)}s`)

    const chunkResult = await callWhisper(chunk, language, apiKey)
    console.log(`[polycast] chunk ${i + 1} done — segments: ${chunkResult.segments?.length ?? 0}, text: ${chunkResult.text?.length ?? 0} chars`)

    ;(chunkResult.segments ?? []).forEach((seg) => {
      allSegments.push({
        ...seg,
        id: allSegments.length,
        start: seg.start + timeOffset,
        end: seg.end + timeOffset,
        words: seg.words?.map((w) => ({
          ...w,
          start: w.start + timeOffset,
          end: w.end + timeOffset,
        })),
      })
    })
    fullText += (fullText ? ' ' : '') + chunkResult.text.trim()
    if (!detectedLanguage) detectedLanguage = chunkResult.language

    onProgress?.(0.1 + 0.9 * (i + 1) / numChunks)
  }

  return { text: fullText, segments: allSegments, language: detectedLanguage }
}

function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio()
    const url = URL.createObjectURL(blob)
    audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(audio.duration) }
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(0) }
    audio.src = url
  })
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
    const body = await res.text()
    const msg = `Whisper ${res.status}: ${body}`
    console.error('[polycast]', msg)
    throw new Error(msg)
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
