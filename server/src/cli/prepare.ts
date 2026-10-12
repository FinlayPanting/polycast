/**
 * Prepares one real episode from a feed and writes the result to a local folder, for quality checks.
 *
 *   GEMINI_API_KEY=… ELEVENLABS_API_KEY=… pnpm --filter @polycast/server prepare-episode <feedUrl> [episodeIndex] [guideId]
 *
 * Stops at the cap given by DAILY_CAP_USD (default $3).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseFeed, pickTimedTranscript, wordsFromPodcastJson, type Word } from '@polycast/core'
import { ffmpegAacEncoder } from '../audio'
import { memoryLedger, SpendGuard } from '../budget'
import { prepareEpisode } from '../pipeline/prepare'
import { scribeTranscriber } from '../providers/elevenlabs'
import { geminiSpeech, geminiText } from '../providers/gemini'
import type { Storage } from '../providers/types'
import { guideById } from '../voices'

function need(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Set ${name}`)
  return v
}

function folderStorage(root: string): Storage {
  return {
    async put(path, bytes) {
      const file = join(root, path)
      await mkdir(join(file, '..'), { recursive: true })
      await writeFile(file, bytes)
      return `file://${file}`
    },
  }
}

async function main() {
  const [feedUrl, indexArg = '0', guideId] = process.argv.slice(2)
  if (!feedUrl) throw new Error('Usage: prepare <feedUrl> [episodeIndex] [guideId]')
  const feed = parseFeed(await (await fetch(feedUrl)).text())
  const ep = feed.episodes[Number(indexArg)]
  if (!ep) throw new Error(`No episode ${indexArg} in feed`)
  const language = process.env.LANGUAGE ?? feed.language
  if (!language) throw new Error('Feed has no language; set LANGUAGE')
  if (!ep.durationSec) throw new Error('Episode has no duration in the feed')

  let feedWords: Word[] | undefined
  const link = pickTimedTranscript(ep.transcripts, language)
  if (link?.type.includes('json')) feedWords = wordsFromPodcastJson(await (await fetch(link.url)).json())

  const out = join(process.cwd(), 'prepared', ep.guid.replace(/[^\w.-]+/g, '_'))
  const gemini = need('GEMINI_API_KEY')
  console.log(`Preparing "${ep.title}" (${Math.round(ep.durationSec / 60)} min, ${language}) → ${out}`)
  const result = await prepareEpisode(
    {
      jobId: 'cli',
      episodeId: ep.guid,
      audioUrl: ep.audioUrl,
      durationSec: ep.durationSec,
      language,
      nativeLanguage: 'en',
      guide: guideById(guideId),
      feedWords,
    },
    {
      transcriber: scribeTranscriber(need('ELEVENLABS_API_KEY')),
      text: geminiText(gemini),
      speech: geminiSpeech(gemini, ffmpegAacEncoder()),
      storage: folderStorage(out),
      guard: new SpendGuard(memoryLedger(), Number(process.env.DAILY_CAP_USD ?? 3)),
      onStage: (s) => console.log(`  ${s}`),
    },
  )
  await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2))
  console.log(`Done: ${result.plan.moments.length} guide moments, ${result.difficulty.label}, $${result.costUSD.toFixed(3)}`)
  if (result.dropped.length) console.log(`Dropped:\n  ${result.dropped.join('\n  ')}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
