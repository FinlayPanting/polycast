import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { assSubtitles, momentCaptions, renderMomentVideo, videoArgs, VIDEO_MAX_SEC } from '../src/lab/video'
import { runFfmpeg } from '../src/lab/sound'

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0
const segments = [
  { id: 's0', start: 90, end: 94, text: 'Vi tar tåget till Göteborg.', translation: 'We take the train to Gothenburg.', wordStart: 0, wordEnd: 0 },
  { id: 's1', start: 94, end: 99, text: 'Det är {lite} sent.', wordStart: 0, wordEnd: 0 },
  { id: 's2', start: 200, end: 204, text: 'Långt bort.', wordStart: 0, wordEnd: 0 },
]
const pieces = [
  { kind: 'episode' as const, start: 0, durationSec: 6, from: 92 },
  { kind: 'pause' as const, start: 6, durationSec: 0.4 },
  { kind: 'guide' as const, start: 6.4, durationSec: 3 },
  { kind: 'pause' as const, start: 9.4, durationSec: 0.3 },
  { kind: 'clip' as const, start: 9.7, durationSec: 2, from: 90.5 },
  { kind: 'guide' as const, start: 11.7, durationSec: 2.5 },
]
const script = 'Did you catch that? She said [[tåget]]. {clip:0} That’s the train.'

describe("A 'Mia steps in' video from the Lab (PC-1029-10)", () => {
  it('places the host’s subtitles and Mia’s lines on the preview’s timeline', () => {
    const c = momentCaptions(pieces, segments, script)
    expect(c.filter((x) => x.who === 'guide').map((x) => x.text)).toEqual(['Did you catch that? She said tåget.', 'That’s the train.'])
    const host = c.filter((x) => x.who === 'host')
    // s0 (90–94) is heard from 0 to 2 s of the preview, s1 from 2 to 6; s2 never.
    expect(host[0]).toMatchObject({ start: 0, end: 2, text: 'Vi tar tåget till Göteborg.', meaning: 'We take the train to Gothenburg.' })
    expect(host[1]).toMatchObject({ start: 2, end: 6, text: 'Det är {lite} sent.' })
    expect(host.some((x) => x.text === 'Långt bort.')).toBe(false)
    // The host's clip inside the moment gets its subtitle too.
    expect(host.at(-1)).toMatchObject({ start: 9.7, text: 'Vi tar tåget till Göteborg.' })
    // A re-voiced piece carries its own text.
    expect(momentCaptions([{ kind: 'guide', start: 0, durationSec: 1, text: 'Hej [[då]]' }], [], '')[0]!.text).toBe('Hej då')
  })

  it('writes a vertical ASS script with the show, the host and Mia’s card', () => {
    const ass = assSubtitles(momentCaptions(pieces, segments, script), { showTitle: 'Svenska Samtal', guideName: 'Mia', durationSec: 14.2 })
    expect(ass).toContain('PlayResX: 1080')
    expect(ass).toContain('PlayResY: 1920')
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:14.20,Show,,0,0,0,,Svenska Samtal')
    expect(ass).toContain(',Guide,,0,0,0,,Did you catch that? She said tåget.')
    expect(ass).toContain(',GuideName,,0,0,0,,Mia')
    // Braces would be read as ASS overrides.
    expect(ass).toContain(',Host,,0,0,0,,Det är lite sent.')
    // The English sits under the host's line in the same event.
    expect(ass).toContain(',Host,,0,0,0,,Vi tar tåget till Göteborg.\\N{\\fs42\\b0\\c&HC8C8C8&}We take the train to Gothenburg.')
  })

  it('caps the length and only adds the artwork when there is some', () => {
    const withArt = videoArgs({ audio: '/t/a.mp3', subs: '/t/s.ass', art: '/t/art', out: '/t/o.mp4' }, 400)
    expect(withArt).toContain(String(VIDEO_MAX_SEC.toFixed(2)))
    expect(withArt.join(' ')).toContain('overlay=(W-w)/2:250')
    const plain = videoArgs({ audio: '/t/a.mp3', subs: '/t/s.ass', out: '/t/o.mp4' }, 10)
    expect(plain.join(' ')).not.toContain('overlay')
    expect(plain).toContain('libx264')
  })

  it.runIf(hasFfmpeg)('renders a real 1080×1920 MP4 with sound', async () => {
    const { out: mp3 } = await runFfmpeg(['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'libmp3lame', '-f', 'mp3', 'pipe:1'])
    const { out: art } = await runFfmpeg(['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=300x300:d=1', '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'])
    const mp4 = await renderMomentVideo({ mp3, durationSec: 3, captions: [{ start: 0, end: 2, who: 'guide', text: 'Hej!' }], showTitle: 'Svenska Samtal', guideName: 'Mia', artwork: art })
    expect(mp4.byteLength).toBeGreaterThan(1000)
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'csv=p=0', '-i', 'pipe:0'], { input: Buffer.from(mp4) })
    const out = probe.stdout.toString()
    expect(out).toMatch(/video,1080,1920/)
    expect(out).toMatch(/audio/)
  }, 60_000)
})
