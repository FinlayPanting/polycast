/**
 * Mia's and Leo's voice, written down (PC-1028-09). Every fixed line the guide says or signs (welcomes,
 * goodbyes and goodnights, nudges, recap sign-offs, the Plus card, seasonal notes, the guessing game) is
 * written to this guide, and tests run each one through `voiceIssues`, so lines written on different
 * nights still sound like the same person. Lines a model writes inside a lesson plan follow the prompt's
 * own rules; this covers what is written by hand.
 */
import { unkindReasons } from './kindness'

export const GUIDE_VOICE = {
  who: 'A friend who happens to speak the language: warm, plain, curious about the show, never a teacher with a red pen. Mia and Leo share one voice; only the name changes.',
  opens: [
    'Starts with the thing itself: the episode, the word, the show. No "Hey there!" or "Guess what?".',
    'A welcome says who is speaking once ("Hi, I\'m Mia."), then what happens next.',
    'A line signed in a notification or on a card starts with the guide\'s name and a colon ("Mia: …").',
  ],
  length: 'One idea per line. A short line (nudge, sign-off, card, reply) stays under 140 characters; a sentence in a longer script stays under 35 words.',
  jokes: 'Light and specific, from the culture or the show (Swedes take fika very seriously), never at the learner\'s expense, never a pun for its own sake. At most one exclamation mark in a line, and only where a real person would use one.',
  never: [
    'No childish praise: "Amazing job", "Great job", "Awesome", "Yay", "superstar", "You rock".',
    'No guilt, streak threats, sulking or pressure (the kindness check).',
    'No talk of AI, algorithms or being generated: the guide is a character, not a feature.',
    'No game words that turn listening into a score: points, XP, levelling up, streaks.',
    'No emoji, no shouting in capitals, no "!!".',
    'British English: colour, favourite, cosy, centre, practise (verb), programme (show).',
  ],
} as const

export const SHORT_LINE_MAX = 140
export const SCRIPT_SENTENCE_MAX_WORDS = 35

const CHILDISH = /\b(amazing|great|awesome|fantastic|brilliant)\s+(job|work)\b|\bawesome\b|\byay\b|\bwoo+hoo+\b|\bsuperstar\b|\byou\s+rock\b|\bwell\s+done\s+you\b/i
const AI_TALK = /\b(AI|A\.I\.|artificial intelligence|algorithm|machine learning|language model|LLM|generated|chatbot)\b/
const GAME_WORDS = /\b(points?|XP|level(l)?ing up|level up|streaks?|leaderboard|high score)\b/i
const EMOJI = /\p{Extended_Pictographic}/u
const SHOUTING = /\b[A-Z]{4,}\b/
const AMERICAN: [RegExp, string][] = [
  [/\bcolor/i, 'colour'],
  [/\bfavorite/i, 'favourite'],
  [/\bflavor/i, 'flavour'],
  [/\bcozy\b/i, 'cosy'],
  [/\bcenter\b/i, 'centre'],
  [/\btheater\b/i, 'theatre'],
  [/\bpracticing\b|\bpracticed\b/i, 'practising/practised'],
  [/\bgotten\b/i, 'got'],
  [/\bmom\b/i, 'mum'],
  [/\bvacation\b/i, 'holiday'],
  [/\bhumor\b/i, 'humour'],
  [/\bneighbor/i, 'neighbour'],
]

/**
 * Why a fixed guide line doesn't sound like Mia or Leo, or an empty list when it does.
 * `kind`: 'short' for a one-line nudge, sign-off, card or reply; 'script' for a spoken welcome.
 * Target-language words in [[ ]] are left out of the checks (they're the host's language, not the guide's).
 */
export function voiceIssues(line: string, kind: 'short' | 'script' = 'short'): string[] {
  const text = line.replace(/\[\[[^\]]*\]\]/g, 'word')
  const out: string[] = []
  if (CHILDISH.test(text)) out.push('childish praise')
  if (AI_TALK.test(text)) out.push('talks about AI')
  if (GAME_WORDS.test(text)) out.push('game words')
  if (EMOJI.test(text)) out.push('emoji')
  if (SHOUTING.test(text.replace(/\b(OK|BBC|USA|UK|EU|NHS|ABBA|IKEA)\b/g, ''))) out.push('shouting in capitals')
  if ((text.match(/!/g) ?? []).length > 1) out.push('more than one exclamation mark')
  for (const [re, uk] of AMERICAN) if (re.test(text)) out.push(`American spelling (say "${uk}")`)
  for (const why of unkindReasons(text)) if (why !== 'shouts') out.push(why)
  if (kind === 'short' && text.length > SHORT_LINE_MAX) out.push(`longer than ${SHORT_LINE_MAX} characters`)
  if (kind === 'script')
    for (const s of text.split(/(?<=[.?!])\s+/)) if (s.split(/\s+/).filter(Boolean).length > SCRIPT_SENTENCE_MAX_WORDS) out.push(`a sentence over ${SCRIPT_SENTENCE_MAX_WORDS} words`)
  return out
}
