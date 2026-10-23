import { describe, expect, it } from 'vitest'
import { memoryLedger, SpendCapReached, SpendGuard } from '../src/budget'
import { elevenRoomTake, fetchEffectsCatalog, parseEffectsCatalog, roomSettings, ROOM_LINES, runRoomAudition } from '../src/roomAudition'

const catalog = {
  filter_presets: [{ id: 'flt_tel', name: 'Telephone' }, { id: 'flt_warm', name: 'Warm broadcast' }],
  environments: [{ id: 'env_hall', name: 'Concert hall' }, { id: 'env_small', name: 'Small room' }],
  background_noises: [{ id: 'bg_cafe', name: 'Café' }],
}

describe('Mia in the show’s room (PC-1019-10)', () => {
  it('reads the effects catalog loosely', () => {
    const c = parseEffectsCatalog(catalog)
    expect(c.filters.map((f) => f.id)).toEqual(['flt_tel', 'flt_warm'])
    expect(c.environments.map((e) => e.id)).toEqual(['env_hall', 'env_small'])
    expect(parseEffectsCatalog({ catalog: { reverb_environments: ['env_a'] } }).environments).toEqual([{ id: 'env_a', name: 'env_a' }])
    expect(parseEffectsCatalog('nonsense')).toEqual({ filters: [], environments: [] })
  })

  it('picks a dry take and up to three gentle settings, never a hall', () => {
    const s = roomSettings(parseEffectsCatalog(catalog))
    expect(s.map((x) => x.label)).toEqual(['dry', 'room', 'room-back', 'warm'])
    expect(s[0]!.effects).toBeNull()
    expect(s[1]!.effects).toEqual({ environment_id: 'env_small', send_level: 0.25, distance: 0.1 })
    expect(s[3]!.effects).toEqual({ filter_preset_id: 'flt_warm', distance: 0.1 })
    for (const x of s) expect(JSON.stringify(x.effects ?? {})).not.toContain('hall')
    expect(roomSettings({ filters: [], environments: [] }).map((x) => x.label)).toEqual(['dry'])
  })

  it('asks ElevenLabs for MP3 with the effects (stereo reverb is refused for raw PCM)', async () => {
    const calls: { url: string; body: any }[] = []
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) })
      return new Response(new Uint8Array([1, 2, 3]))
    }) as unknown as typeof fetch
    await elevenRoomTake('k', { text: 'Hej', voiceId: 'v1', effects: { environment_id: 'env_small', send_level: 0.25 } }, f)
    await elevenRoomTake('k', { text: 'Hej', voiceId: 'v1', effects: null }, f)
    expect(calls[0]!.url).toContain('output_format=mp3_44100_128')
    expect(calls[0]!.body.audio_effects).toEqual({ environment_id: 'env_small', send_level: 0.25 })
    expect(calls[1]!.body).not.toHaveProperty('audio_effects')
  })

  it('treats an unreachable catalog as empty', async () => {
    const f = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch
    expect(await fetchEffectsCatalog('k', f)).toEqual({ filters: [], environments: [] })
  })

  it('voices each line in each setting for both guides, counted against the cap', async () => {
    const saved: string[] = []
    const asked: (string | undefined)[] = []
    const ledger = memoryLedger()
    const settings = roomSettings(parseEffectsCatalog(catalog))
    const takes = await runRoomAudition({
      take: async (r) => (asked.push(r.effects?.environment_id ?? r.effects?.filter_preset_id), new Uint8Array([1])),
      settings,
      save: async (file) => void saved.push(file),
      guard: new SpendGuard(ledger, 1),
    })
    expect(takes).toHaveLength(2 * ROOM_LINES.length * settings.length)
    expect(saved.slice(0, 4)).toEqual(['01-mia-dry.mp3', '01-mia-room.mp3', '01-mia-room-back.mp3', '01-mia-warm.mp3'])
    expect(ledger.entries.size).toBe(takes.length)
    expect(asked.filter((a) => a === undefined)).toHaveLength(2 * ROOM_LINES.length)
  })

  it('stops before voicing anything when the cap would be passed', async () => {
    let calls = 0
    await expect(
      runRoomAudition({ take: async () => (calls++, new Uint8Array([1])), settings: roomSettings({ filters: [], environments: [] }), save: async () => {}, guard: new SpendGuard(memoryLedger(), 0) }),
    ).rejects.toBeInstanceOf(SpendCapReached)
    expect(calls).toBe(0)
  })

  it('leaves the lesson voice untouched', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(new URL('../src/providers/elevenlabs.ts', import.meta.url), 'utf8')).not.toContain('audio_effects')
  })
})
