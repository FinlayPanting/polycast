import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Segment } from '@polycast/core'
import { splitScript } from '../pipeline/voice'
import type { PreviewPiece } from './moment'
import { runFfmpeg } from './sound'

/**
 * "Mia steps in" as a short vertical video (PC-1029-10): the Lab's moment preview (the host, Mia's moment, the
 * show picking up again) with the show's artwork, the host's subtitles and Mia's lines on her card, for launch
 * posts and pitches. Made from real moments, to be shared only with the show's permission. Like the audio
 * preview it holds episode audio, so it lives in memory for half an hour and is never stored; ffmpeg's working
 * files sit in a private temporary folder that is removed as soon as the video is made.
 */

export const VIDEO_W = 1080
export const VIDEO_H = 1920
/** Long enough for a moment with a little of the show either side; short enough for a post. */
export const VIDEO_MAX_SEC = 45

export interface Caption {
  start: number
  end: number
  who: 'host' | 'guide'
  text: string
  /** The host's line in English, under it. */
  meaning?: string
}

const clean = (s: string) => s.replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim()

/**
 * Where each line sits on the preview's timeline: the host's subtitles under episode and clip pieces (from the
 * transcript's segments), and the guide's lines on her pieces (the piece's own text when re-voiced, otherwise the
 * stored script's speech in order).
 */
export function momentCaptions(pieces: PreviewPiece[], segments: Segment[], script: string): Caption[] {
  const spoken = splitScript(script)
    .filter((p): p is { kind: 'speech'; text: string } => p.kind === 'speech')
    .map((p) => clean(p.text))
  let nextLine = 0
  const out: Caption[] = []
  for (const p of pieces) {
    const end = p.start + p.durationSec
    if (p.kind === 'guide') {
      const text = p.text ? clean(p.text) : spoken[nextLine]
      nextLine++
      if (text) out.push({ start: p.start, end, who: 'guide', text })
    } else if ((p.kind === 'episode' || p.kind === 'clip') && p.from !== undefined) {
      const from = p.from
      for (const s of segments) {
        if (s.end <= from || s.start >= from + p.durationSec) continue
        const a = Math.max(p.start, p.start + (s.start - from))
        const b = Math.min(end, p.start + (s.end - from))
        if (b - a < 0.3) continue
        out.push({ start: a, end: b, who: 'host', text: clean(s.text), ...(s.translation ? { meaning: clean(s.translation) } : {}) })
      }
    }
  }
  return out
}

const assTime = (sec: number) => {
  const cs = Math.max(0, Math.round(sec * 100))
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`
}
/** ASS text: braces would start an override block and a newline needs \N. */
const assText = (s: string) => s.replace(/[{}]/g, '').replace(/\\/g, '').replace(/\r?\n/g, '\\N')

/** The subtitles as an ASS script for a 1080×1920 frame: the show's name up top, the host's lines low, Mia's card in the middle. */
export function assSubtitles(captions: Caption[], o: { showTitle: string; guideName: string; durationSec: number }): string {
  const dialogue = (start: number, end: number, style: string, text: string) => `Dialogue: 0,${assTime(start)},${assTime(end)},${style},,0,0,0,,${text}`
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${VIDEO_W}`,
    `PlayResY: ${VIDEO_H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Colours are &HAABBGGRR. The show's name, quiet, at the top.
    'Style: Show,DejaVu Sans,44,&H00D8D8D8,&H00D8D8D8,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,8,90,90,110,1',
    // The host: white on a soft shadow, low in the frame; the English goes under it, smaller, in the same event.
    'Style: Host,DejaVu Sans,62,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,3,2,2,90,90,330,1',
    // Mia's card: dark text on a warm opaque box, mid-frame, with her name above it.
    'Style: GuideName,DejaVu Sans,46,&H0062C8FF,&H0062C8FF,&H00000000,&H00000000,1,0,0,0,100,100,1,0,1,0,0,2,110,110,700,1',
    'Style: Guide,DejaVu Sans,58,&H00201A16,&H00201A16,&H00F2F7FB,&H00F2F7FB,0,0,0,0,100,100,0,0,3,26,0,8,110,110,1240,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    dialogue(0, o.durationSec, 'Show', assText(o.showTitle)),
  ]
  for (const c of captions) {
    if (c.who === 'guide') {
      lines.push(dialogue(c.start, c.end, 'GuideName', assText(o.guideName)))
      lines.push(dialogue(c.start, c.end, 'Guide', assText(c.text)))
    } else {
      // One event, so the English always sits under the line rather than being pushed about by the renderer.
      lines.push(dialogue(c.start, c.end, 'Host', assText(c.text) + (c.meaning ? `\\N{\\fs42\\b0\\c&HC8C8C8&}${assText(c.meaning)}` : '')))
    }
  }
  return lines.join('\n') + '\n'
}

/** The ffmpeg arguments that put it together: a plain background, the artwork, the subtitles and the audio. */
export function videoArgs(files: { audio: string; subs: string; art?: string; out: string }, durationSec: number): string[] {
  const d = Math.min(VIDEO_MAX_SEC, Math.max(1, durationSec)).toFixed(2)
  const art = files.art ? ['-loop', '1', '-t', d, '-i', files.art] : []
  const subs = files.subs.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
  const filter = files.art
    ? `[2:v]scale=760:760:force_original_aspect_ratio=increase,crop=760:760,format=yuv420p[art];[0:v][art]overlay=(W-w)/2:250[bg];[bg]ass='${subs}'[v]`
    : `[0:v]ass='${subs}'[v]`
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=0x16181d:s=${VIDEO_W}x${VIDEO_H}:r=30:d=${d}`,
    '-i', files.audio,
    ...art,
    '-filter_complex', filter,
    '-map', '[v]', '-map', '1:a',
    '-t', d,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    files.out,
  ]
}

/** Makes the MP4. The working folder is removed whether it succeeds or not. */
export async function renderMomentVideo(input: { mp3: Uint8Array; durationSec: number; captions: Caption[]; showTitle: string; guideName: string; artwork?: Uint8Array }): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'polycast-video-'))
  try {
    const files = { audio: join(dir, 'moment.mp3'), subs: join(dir, 'subs.ass'), out: join(dir, 'moment.mp4'), ...(input.artwork ? { art: join(dir, 'art') } : {}) }
    await writeFile(files.audio, input.mp3)
    await writeFile(files.subs, assSubtitles(input.captions, { showTitle: input.showTitle, guideName: input.guideName, durationSec: Math.min(VIDEO_MAX_SEC, input.durationSec) }))
    if (files.art) await writeFile(files.art, input.artwork!)
    await runFfmpeg(videoArgs(files, input.durationSec))
    return new Uint8Array(await readFile(files.out))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
