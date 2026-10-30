import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { geminiSpeech, geminiText } from '../src/providers/gemini'
import { geminiBatchText } from '../src/providers/geminiBatch'

// PC-1027-01: Google stores requests by default since 26 Oct 2026. Every request Polycast sends
// to Gemini must carry store: false.

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
const input = { system: 'You write lesson plans.', prompt: 'Episode', schema: { type: 'object' } }

function capture(replies: Response[]) {
  const bodies: any[] = []
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    if (init?.body) bodies.push(JSON.parse(String(init.body)))
    return replies.shift() ?? json({})
  }) as typeof fetch
  return { bodies, fetchImpl }
}

// A tiny valid WAV: 44-byte header, 24 kHz mono 16-bit, 4 samples.
function wav(): string {
  const b = Buffer.alloc(52)
  b.write('RIFF', 0); b.writeUInt32LE(44, 4); b.write('WAVE', 8); b.write('fmt ', 12)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(24000, 24)
  b.writeUInt32LE(48000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(8, 40)
  return b.toString('base64')
}

describe("Gemini requests ask Google not to keep them", () => {
  it('lesson plans, translations and mood lines (Interactions text)', async () => {
    const { bodies, fetchImpl } = capture([json({ output_text: '{"ok":1}' })])
    await geminiText('k', undefined, fetchImpl).generateJson(input)
    expect(bodies[0].store).toBe(false)
  })

  it('guide speech (Interactions TTS)', async () => {
    const { bodies, fetchImpl } = capture([json({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: wav() }] }] })])
    await geminiSpeech('k', async (w) => ({ audio: w, mimeType: 'audio/wav' }), undefined, fetchImpl).synthesize({ text: 'Hej', voice: 'Kore', style: 'warm' } as any)
    expect(bodies[0].store).toBe(false)
  })

  it('half-price batch re-plans, on the request inside the batch', async () => {
    const { bodies, fetchImpl } = capture([
      json({ name: 'batches/1', metadata: { state: 'JOB_STATE_SUCCEEDED' }, response: { inlinedResponses: { inlinedResponses: [{ response: { candidates: [{ content: { parts: [{ text: '{}' }] } }] } }] } } }),
    ])
    await geminiBatchText('k', undefined, fetchImpl, { sleep: async () => {} }).generateJson(input)
    expect(bodies[0].batch.input_config.requests.requests[0].request.store).toBe(false)
  })

  it('no Gemini provider builds a request body without the flag', () => {
    const dir = join(__dirname, '../src/providers')
    for (const f of readdirSync(dir).filter((f) => /^gemini.*\.ts$/.test(f))) {
      const src = readFileSync(join(dir, f), 'utf8')
      const bodies = src.match(/body: JSON\.stringify\(/g)?.length ?? 0
      const requestObjects = src.match(/const request = \{/g)?.length ?? 0
      const flags = src.match(/store: GEMINI_STORE/g)?.length ?? 0
      // geminiBatch.ts wraps its one request in a batch body; the flag goes on the request.
      expect(flags, `${f}: every Gemini request needs store: GEMINI_STORE`).toBe(f === 'geminiBatch.ts' ? requestObjects : bodies)
    }
  })
})
