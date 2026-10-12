import type { Word } from '@polycast/core'
import type { PlanDraft } from '../src/pipeline/lessonPlan'

/**
 * A synthetic 10-minute Swedish episode: two speakers alternating sentences of 12 words, a short pause
 * after each sentence, with useful terms placed at known times.
 */
export function syntheticEpisode(): { words: Word[]; durationSec: number; termAt: Record<string, number> } {
  const filler = ['vi', 'pratade', 'om', 'det', 'och', 'sen', 'gick', 'vi', 'vidare', 'till', 'nästa', 'grej']
  const terms: Record<number, string> = { 6: 'försenad', 13: 'ändå', 32: 'fika', 33: 'jättekul', 58: 'sambo' }
  const words: Word[] = []
  const termAt: Record<string, number> = {}
  let t = 0
  for (let s = 0; s < 60; s++) {
    const speaker = s % 2 === 0 ? 'speaker_0' : 'speaker_1'
    for (let i = 0; i < 12; i++) {
      let text = filler[i]!
      if (i === 5 && terms[s]) {
        text = terms[s]!
        termAt[text] = t
      }
      if (i === 11) text += '.'
      words.push({ text, start: t, end: t + 0.55, speaker })
      t += 0.6
    }
    t += 2.6 // pause after each sentence: about 10 seconds per sentence overall
  }
  return { words, durationSec: Math.ceil(t), termAt }
}

/** The draft a lesson-plan writer might return for the synthetic episode. Segment ids are s1..s60. */
export function draftFor(): PlanDraft {
  const wm = (text: string, seg: number, priority: number) => ({
    text,
    lemma: text,
    meaning: `meaning of ${text}`,
    segmentId: `s${seg}`,
    priority,
    listenFor: `Coming up, listen for {term}.`,
    spotlight: `Here it is again: {sentence}. {term} means something useful.`,
  })
  return {
    hosts: [
      { name: 'Anna', description: 'the faster one' },
      { name: 'Erik', description: 'asks the questions' },
    ],
    summary: 'Anna and Erik talk about a delayed train and a fika.',
    warmup: {
      script: "You'll hear Anna and Erik. Listen for {term1}, {term2} and {term3}.",
      terms: [
        { text: 'försenad', lemma: 'försenad', meaning: 'delayed', segmentId: 's7' },
        { text: 'fika', lemma: 'fika', meaning: 'coffee break', segmentId: 's33' },
        { text: 'hittepå', lemma: 'hittepå', meaning: 'made up', segmentId: 's2' }, // not in the episode
      ],
    },
    chapters: [
      { startSegmentId: 's1', title: 'The train', recap: 'They talked about the train being late.' },
      { startSegmentId: 's25', title: 'Fika', recap: 'They stopped for a fika.' },
      { startSegmentId: 's45', title: 'Home', recap: 'They went home.' },
    ],
    wordMoments: [
      wm('försenad', 7, 9),
      wm('ändå', 14, 8), // ~70s after försenad: under even the Hands-on gap, so dropped
      wm('fika', 33, 9),
      wm('jättekul', 34, 5), // ~10s after fika: dropped
      wm('sambo', 59, 7),
      wm('saknas', 20, 6), // not in the episode
    ],
    cultureNotes: [{ segmentId: 's33', script: 'Fika is a Swedish coffee break, almost a ritual.' }],
    quickQuestions: [{ segmentId: 's20', prompt: 'Was the train on time?', options: ['Yes', 'No', 'They walked'], answerIndex: 1 }],
    wrapUp: {
      script: 'Nicely done. Anna and Erik covered a late train, a fika and getting home.',
      questions: [
        { prompt: 'What did they stop for?', options: ['Lunch', 'A fika'], answerIndex: 1 },
        { prompt: 'Broken', options: ['Only one'], answerIndex: 0 },
      ],
    },
  }
}
