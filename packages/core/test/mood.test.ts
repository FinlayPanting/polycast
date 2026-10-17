import { describe, expect, it } from 'vitest'
import { checkMoodPicks, cleanDescription, feedDescriptionFromHead, MOOD_CHIPS, moodKey, moodPrompt, normaliseMood, prefilterCandidates, type MoodCandidate } from '../src'

const pool: MoodCandidate[] = [
  { id: 'show:a1', kind: 'show', title: 'Morgonpasset', tags: ['Comedy'], description: 'Humor och snack varje morgon.' },
  { id: 'show:a2', kind: 'show', title: 'Sommar i P1', tags: ['Society'], description: 'Berättelser från kända svenskar.' },
  { id: 'show:a3', kind: 'show', title: 'Mat & Prat', tags: ['Food'], description: 'Cooking and food, in Swedish.' },
  { id: 'episode:e1', kind: 'episode', title: 'Fikan', podcastTitle: 'Svenska Samtal', tags: ['food', 'coffee'] },
]

describe('mood picks', () => {
  it('tidies a typed mood and keys the same words the same way', () => {
    expect(normaliseMood('  something   funny\n')).toBe('something funny')
    expect(normaliseMood('x'.repeat(300))).toHaveLength(100)
    expect(moodKey('sv', 'Funny FOOD')).toBe(moodKey('sv', 'food, funny'))
    expect(moodKey('sv', 'something funny')).toBe('sv:funny')
  })

  it('puts candidates sharing words with the mood first, then fills in pool order', () => {
    const picked = prefilterCandidates('something about food and cooking', pool, 3)
    expect(picked.map((c) => c.id)).toEqual(['show:a3', 'episode:e1', 'show:a1'])
    expect(prefilterCandidates('xyzzy', pool, 2).map((c) => c.id)).toEqual(['show:a1', 'show:a2'])
  })

  it('cleans feed descriptions of HTML, links and extra space', () => {
    expect(cleanDescription('<p>Hej &amp; välkommen!</p><br/>Mer på https://example.com  nu')).toBe('Hej & välkommen! Mer på nu')
    expect(cleanDescription('a'.repeat(1200))!.length).toBe(1000)
    expect(cleanDescription('<p> </p>')).toBeUndefined()
    expect(cleanDescription('&lt;p&gt;Escaped &amp;lt;b&amp;gt; too&lt;/p&gt;')).toBe('Escaped &lt;b&gt; too')
  })

  it("reads a channel's description from the start of its feed", () => {
    const head = '<rss><channel><title>X</title><description><![CDATA[<p>Ett samtal om mat.</p>]]></description><item><description>ep</description>'
    expect(feedDescriptionFromHead(head)).toBe('Ett samtal om mat.')
    expect(feedDescriptionFromHead('<rss><channel><item><description>ep</description>')).toBeUndefined()
  })

  it('asks for three picks from the list, with reasons in the learner’s language', () => {
    const { system, prompt } = moodPrompt('something funny', pool, 'sv')
    expect(system).toContain('Swedish')
    expect(system).toContain('English')
    expect(system).toContain('only from the list')
    expect(prompt).toContain('show:a1 | Morgonpasset')
    expect(prompt).toContain('episode:e1 | episode of Svenska Samtal: Fikan')
  })

  it('keeps only real, distinct picks with a tidy reason, at most three', () => {
    const reply = {
      picks: [
        { id: 'show:a1', why: 'Two friends joking about mornings!!' },
        { id: 'show:a1', why: 'again' },
        { id: 'show:nope', why: 'made up' },
        { id: 'show:a3', why: '' },
        { id: 'episode:e1', why: 'A cosy chat over coffee.' },
        { id: 'show:a2', why: 'x'.repeat(200) },
        { id: 'show:a3', why: 'Food talk.' },
      ],
    }
    const picks = checkMoodPicks(reply, pool)
    expect(picks.map((p) => p.id)).toEqual(['show:a1', 'episode:e1', 'show:a2'])
    expect(picks[0]!.why).toBe('Two friends joking about mornings.')
    expect(picks[2]!.why.length).toBe(140)
    expect(checkMoodPicks({ nothing: true }, pool)).toEqual([])
  })

  it('offers a few chips, in plain British English', () => {
    expect(MOOD_CHIPS.length).toBeGreaterThanOrEqual(4)
    for (const c of MOOD_CHIPS) expect(c).not.toMatch(/!|favorite|color/i)
  })
})
