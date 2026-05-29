import type { Episode } from './rss'
import type { ProcessedEpisode } from './storage'
import { transcribeAudio } from './whisper'
import { generateIntro, generatePreview, sliceTranscriptByTime, findNaturalBreakpoints, translateBatch, translateTitle } from './summarize'
import type { TranscriptLine } from './storage'
import { synthesise, arrayBufferToBase64 } from './tts'
import { cacheEpisode } from './storage'

export type PipelineStage = 'download' | 'transcribe' | 'translate' | 'summarize' | 'tts' | 'build'

export interface PipelineProgress {
  stage: PipelineStage
  progress: number
  detail?: string
}

interface PipelineOptions {
  episode: Episode
  language: string
  summaryMin: number
  summaryMax: number
  openaiKey: string
  elevenlabsKey: string
  onProgress: (p: PipelineProgress) => void
  signal?: AbortSignal
}

const PROXIES = [
  (url: string) => url,                                                 // direct (no proxy)
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
]

async function fetchWithFallback(url: string, signal?: AbortSignal): Promise<Response> {
  let lastErr: Error = new Error('All download methods failed')

  for (const makeUrl of PROXIES) {
    const attemptUrl = makeUrl(url)
    console.log('[polycast] download attempt:', attemptUrl)
    try {
      const res = await fetch(attemptUrl, { signal })
      if (res.ok) {
        console.log('[polycast] download success via:', attemptUrl.slice(0, 60))
        return res
      }
      lastErr = new Error(`HTTP ${res.status} from ${attemptUrl.slice(0, 60)}`)
      console.warn('[polycast] download failed:', lastErr.message)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      if (lastErr.name === 'AbortError') throw lastErr
      console.warn('[polycast] download error:', lastErr.message)
    }
  }

  throw lastErr
}

export async function runPipeline(opts: PipelineOptions): Promise<ProcessedEpisode> {
  const { episode, language, summaryMin, summaryMax, openaiKey, elevenlabsKey, onProgress, signal } = opts

  const emit = (stage: PipelineStage, progress: number, detail?: string) => {
    console.log(`[polycast] ${stage} ${Math.round(progress * 100)}%`, detail ?? '')
    onProgress({ stage, progress, detail })
  }

  // ── 1. Download ──────────────────────────────────────────────────────────
  emit('download', 0)
  console.log('[polycast] fetching:', episode.enclosureUrl)

  const dlRes = await fetchWithFallback(episode.enclosureUrl, signal)

  const reader = dlRes.body?.getReader()
  const contentLength = Number(dlRes.headers.get('Content-Length') ?? 0)
  console.log('[polycast] content-length:', contentLength, 'bytes')
  const chunks: Uint8Array[] = []
  let received = 0

  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      if (contentLength) emit('download', received / contentLength)
    }
  }

  const audioBuffer = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0))
  let off = 0
  for (const chunk of chunks) { audioBuffer.set(chunk, off); off += chunk.length }
  const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' })
  console.log('[polycast] downloaded:', (audioBuffer.length / 1e6).toFixed(1), 'MB')
  emit('download', 1)

  signal?.throwIfAborted()

  // ── 2. Transcribe ────────────────────────────────────────────────────────
  emit('transcribe', 0)
  const whisperResult = await transcribeAudio(
    audioBlob,
    language,
    openaiKey,
    (pct) => emit('transcribe', pct),
  )
  console.log('[polycast] transcript length:', whisperResult.text.length, 'chars,', whisperResult.segments.length, 'segments')
  emit('transcribe', 1)

  signal?.throwIfAborted()

  // ── 3. Translate ─────────────────────────────────────────────────────────
  emit('translate', 0)
  const segs = whisperResult.segments ?? []
  const originalLines = segs.map((s) => s.text.trim()).filter(Boolean)
  const [titleTranslation, translations] = await Promise.all([
    translateTitle(episode.title, language, openaiKey),
    translateBatch(originalLines, language, openaiKey),
  ])
  const transcriptLines: TranscriptLine[] = segs
    .filter((s) => s.text.trim())
    .map((s, i) => ({
      start: s.start,
      end: s.end,
      original: s.text.trim(),
      translation: translations[i] ?? '',
    }))
  console.log('[polycast] title translation:', titleTranslation)
  console.log('[polycast] translated', transcriptLines.length, 'lines')
  emit('translate', 1)

  signal?.throwIfAborted()

  // ── 4. Summarize ─────────────────────────────────────────────────────────
  const totalDuration = segs.at(-1)?.end ?? 0
  const breakpoints = findNaturalBreakpoints(segs, summaryMin, summaryMax, totalDuration)
  console.log('[polycast] natural breakpoints:', breakpoints.map((t) => Math.round(t) + 's').join(', '))

  // Total jobs: 1 intro + one preview per breakpoint
  const totalJobs = 1 + breakpoints.length
  const summaryTexts: Array<{ timestamp: number; text: string }> = []

  // Intro at t=0: episode overview + preview of first section
  signal?.throwIfAborted()
  emit('summarize', 0, 'Intro')
  const firstSectionEnd = breakpoints[0] ?? totalDuration
  const firstSection = sliceTranscriptByTime(segs, 0, firstSectionEnd)
  const introText = await generateIntro(whisperResult.text, firstSection, language, openaiKey)
  console.log('[polycast] intro:', introText.slice(0, 80))
  summaryTexts.push({ timestamp: 0, text: introText })

  // Preview at each breakpoint: previews the NEXT section
  for (let i = 0; i < breakpoints.length; i++) {
    signal?.throwIfAborted()
    const nextFrom = breakpoints[i]
    const nextTo = breakpoints[i + 1] ?? totalDuration
    const nextChunk = sliceTranscriptByTime(segs, nextFrom, nextTo)
    if (!nextChunk.trim()) continue
    emit('summarize', (i + 1) / totalJobs, `Preview ${i + 1}/${breakpoints.length}`)
    const text = await generatePreview(nextChunk, language, openaiKey)
    console.log(`[polycast] preview ${i + 1} @${Math.round(nextFrom)}s:`, text.slice(0, 80))
    summaryTexts.push({ timestamp: nextFrom, text })
  }
  emit('summarize', 1)

  signal?.throwIfAborted()

  // ── 4. TTS ───────────────────────────────────────────────────────────────
  const summaries: ProcessedEpisode['summaries'] = []
  for (let i = 0; i < summaryTexts.length; i++) {
    signal?.throwIfAborted()
    emit('tts', i / summaryTexts.length, `Clip ${i + 1}/${summaryTexts.length}`)
    const audioBuf = await synthesise(summaryTexts[i].text, elevenlabsKey)
    console.log(`[polycast] tts clip ${i + 1}: ${(audioBuf.byteLength / 1024).toFixed(0)} KB`)
    summaries.push({
      timestamp: summaryTexts[i].timestamp,
      text: summaryTexts[i].text,
      audioBase64: arrayBufferToBase64(audioBuf),
    })
  }
  emit('tts', 1)

  signal?.throwIfAborted()

  // ── 5. Build ─────────────────────────────────────────────────────────────
  emit('build', 0)
  const processed: ProcessedEpisode = {
    guid: episode.guid,
    transcript: whisperResult.text,
    titleTranslation,
    transcriptLines,
    summaries,
    enclosureUrl: episode.enclosureUrl,
  }
  emit('build', 0.5)
  await cacheEpisode(processed)
  console.log('[polycast] cached, done')
  emit('build', 1)

  return processed
}
