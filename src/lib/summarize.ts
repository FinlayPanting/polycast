const GPT_URL = 'https://api.openai.com/v1/chat/completions'

async function gpt(system: string, user: string, apiKey: string, maxTokens = 180): Promise<string> {
  const res = await fetch(GPT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens,
      temperature: 0.5,
    }),
  })
  if (!res.ok) throw new Error(`GPT-4o error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return (data.choices[0].message.content as string).trim()
}

// Translate an episode title into English
export async function translateTitle(title: string, language: string, apiKey: string): Promise<string> {
  return gpt(
    `Translate this ${language} podcast episode title to English. Return only the translated title, nothing else.`,
    title,
    apiKey,
    80,
  )
}

const TRANSLATE_CHUNK = 80

async function translateChunk(lines: string[], language: string, apiKey: string): Promise<string[]> {
  const res = await gpt(
    `Translate each of these ${language} podcast transcript lines to natural English. Return ONLY a valid JSON array of strings in exactly the same order. No extra text.`,
    JSON.stringify(lines),
    apiKey,
    lines.length * 50 + 200,
  )
  try {
    const match = res.match(/\[[\s\S]*\]/)
    if (match) {
      const parsed: unknown = JSON.parse(match[0])
      if (Array.isArray(parsed) && parsed.length === lines.length) {
        return parsed.map(String)
      }
    }
  } catch { /* fall through */ }
  return lines.map(() => '')
}

// Translate transcript lines in chunks to stay within token limits.
export async function translateBatch(lines: string[], language: string, apiKey: string): Promise<string[]> {
  if (lines.length === 0) return []
  const results: string[] = []
  for (let i = 0; i < lines.length; i += TRANSLATE_CHUNK) {
    const chunk = lines.slice(i, i + TRANSLATE_CHUNK)
    const translated = await translateChunk(chunk, language, apiKey)
    results.push(...translated)
  }
  return results
}

// Intro summary fired at t=0: episode overview + first-section preview
export async function generateIntro(
  fullTranscript: string,
  firstSectionTranscript: string,
  language: string,
  apiKey: string,
): Promise<string> {
  return gpt(
    `You are a friendly audio companion helping someone learn ${language} by listening to podcasts.
Write a short spoken introduction in English — 2 sentences giving a high-level overview of what the episode covers, then 1 sentence previewing what's discussed in the opening section.
Speak naturally, as if you're a helpful host. No bullet points or headers.`,
    `Full episode transcript (for overview):\n${fullTranscript.slice(0, 4000)}\n\nOpening section transcript (for preview):\n${firstSectionTranscript}`,
    apiKey,
    220,
  )
}

// Preview summary fired at each breakpoint: previews the NEXT section
export async function generatePreview(
  nextSectionTranscript: string,
  language: string,
  apiKey: string,
): Promise<string> {
  return gpt(
    `You are a friendly audio companion helping someone learn ${language} by listening to podcasts.
In 2–3 spoken English sentences, preview what the listener is about to hear in the next section. Be specific about the topics, names, or ideas coming up.
Start naturally — e.g. "Coming up...", "Next, you'll hear...", or "In a moment...". No bullet points.`,
    nextSectionTranscript,
    apiKey,
    160,
  )
}

export function sliceTranscriptByTime(
  segments: Array<{ start: number; end: number; text: string }> | undefined,
  fromSec: number,
  toSec: number,
): string {
  return (segments ?? [])
    .filter((s) => s.end > fromSec && s.start < toSec)
    .map((s) => s.text)
    .join(' ')
    .trim()
}

// Find natural summary insertion points within [minInterval, maxInterval] windows.
export function findNaturalBreakpoints(
  segments: Array<{ start: number; end: number; text: string }>,
  minInterval: number,
  maxInterval: number,
  totalDuration: number,
): number[] {
  const breakpoints: number[] = []
  let cursor = 0

  while (cursor + minInterval < totalDuration) {
    const windowStart = cursor + minInterval
    const windowEnd = Math.min(cursor + maxInterval, totalDuration)

    const candidates = segments
      .filter((seg) => seg.end > windowStart && seg.end <= windowEnd)
      .map((seg) => {
        const text = seg.text.trimEnd()
        const punctScore = /[.!?]$/.test(text) ? 3 : /[,;:]$/.test(text) ? 1 : 0
        const next = segments.find((s) => s.start >= seg.end)
        const pauseScore = next ? Math.min((next.start - seg.end) * 2, 2) : 2
        return { t: seg.end, score: punctScore + pauseScore }
      })

    const chosen = candidates.length > 0
      ? candidates.reduce((best, c) => c.score > best.score ? c : best).t
      : windowEnd

    breakpoints.push(chosen)
    cursor = chosen
  }

  return breakpoints
}
