/**
 * Sample data for demo mode: a fictional Swedish show, "Svenska Samtal", with one ready episode, its
 * subtitles and lesson plan. Used only for previews and screenshots.
 */
import type { GuideMoment, Primer, Segment, Word } from '@polycast/core'
import type { ListenPayload, Shelf } from '../lib/api'

export const art = {
  samtal: require('./art/samtal.png'),
  kaffe: require('./art/kaffe.png'),
  nyheter: require('./art/nyheter.png'),
  historia: require('./art/historia.png'),
  humor: require('./art/humor.png'),
  resa: require('./art/resa.png'),
}

const LINES: { text: string; translation: string; speaker: string; pause?: number }[] = [
  { text: 'Hej och välkommen till Svenska Samtal.', translation: 'Hi and welcome to Svenska Samtal.', speaker: 'Anna' },
  { text: 'Idag pratar vi om resor med tåg.', translation: 'Today we’re talking about travelling by train.', speaker: 'Anna', pause: 1 },
  { text: 'Erik, du åkte till Göteborg i helgen, eller hur?', translation: 'Erik, you went to Gothenburg at the weekend, didn’t you?', speaker: 'Anna' },
  { text: 'Ja, men tåget var försenat i nästan en timme.', translation: 'Yes, but the train was delayed by almost an hour.', speaker: 'Erik', pause: 1.2 },
  { text: 'En timme! Vad gjorde du då?', translation: 'An hour! What did you do then?', speaker: 'Anna' },
  { text: 'Jag tog en fika på stationen och läste en bok.', translation: 'I had a fika at the station and read a book.', speaker: 'Erik', pause: 1.4 },
  { text: 'Det låter ändå ganska mysigt.', translation: 'That still sounds quite cosy.', speaker: 'Anna' },
  { text: 'Ja, det var faktiskt helt okej.', translation: 'Yes, it was actually completely fine.', speaker: 'Erik', pause: 1 },
]

export function buildTranscript(): { words: Word[]; segments: Segment[] } {
  const words: Word[] = []
  const segments: Segment[] = []
  let t = 1
  LINES.forEach((line, i) => {
    const start = words.length
    for (const w of line.text.split(' ')) {
      words.push({ text: w, start: t, end: t + 0.42, speaker: line.speaker })
      t += 0.5
    }
    segments.push({ id: `s${i + 1}`, start: words[start]!.start, end: words.at(-1)!.end, speaker: line.speaker, text: line.text, translation: line.translation, wordStart: start, wordEnd: words.length })
    t += 0.6 + (line.pause ?? 0)
  })
  return { words, segments }
}

const transcript = buildTranscript()
const w = (text: string) => transcript.words.find((x) => x.text.replace(/[.,!?]/g, '') === text)!
const speech = (seconds: number) => ({ kind: 'speech' as const, url: 'demo', durationSec: seconds })

const delayed = w('försenat')
const fika = w('fika')

export const MOMENTS: GuideMoment[] = [
  {
    id: 'warmup',
    kind: 'warmup',
    at: 0,
    minLevel: 'light',
    script: 'You’ll hear Anna and Erik. Erik’s train to Gothenburg runs late. Listen for {clip:0}, delayed, and {clip:1}, a coffee break.',
    clips: [{ start: delayed.start, end: delayed.end }, { start: fika.start, end: fika.end }],
    audio: { parts: [speech(3), { kind: 'clip', clipIndex: 0 }, speech(1), { kind: 'clip', clipIndex: 1 }, speech(1)], durationSec: 6 },
  },
  {
    id: 'spot',
    kind: 'spotlight',
    at: transcript.segments[3]!.end,
    minLevel: 'standard',
    termId: 't1',
    term: { text: 'försenat', lemma: 'försenad', meaning: 'delayed, late' },
    script: 'Erik said {clip:1}. {clip:0} means delayed. You’ll see it on every departure board: tåget är försenat, the train is late.',
    clips: [{ start: delayed.start, end: delayed.end }, { start: transcript.segments[3]!.start, end: transcript.segments[3]!.end }],
    audio: { parts: [speech(1), { kind: 'clip', clipIndex: 1 }, speech(4)], durationSec: 8 },
  },
  {
    id: 'culture',
    kind: 'cultureNote',
    at: transcript.segments[5]!.end,
    minLevel: 'standard',
    script: 'Fika is more than coffee: a proper pause, usually with something sweet. Swedes plan their day around it.',
    clips: [],
    audio: { parts: [speech(5)], durationSec: 5 },
  },
  {
    id: 'question',
    kind: 'quickQuestion',
    at: transcript.segments[6]!.end,
    minLevel: 'handsOn',
    script: 'How did Erik feel about the wait?',
    clips: [],
    waits: true,
    question: { prompt: 'How did Erik feel about the wait?', options: ['Furious', 'It was fine', 'He went home'], answerIndex: 1 },
    audio: { parts: [speech(2)], durationSec: 2 },
  },
  {
    id: 'wrap',
    kind: 'wrapUp',
    at: transcript.words.at(-1)!.end,
    minLevel: 'light',
    script: 'Nicely done. Erik’s train was an hour late, so he had a fika and read. Anna thought it sounded cosy.',
    clips: [],
    audio: { parts: [speech(5)], durationSec: 5 },
  },
]

/** The demo episode's primer (PC-1017-P1). */
export const PRIMER: Primer = {
  gist: 'Eriks tåg är försenat. Han väntar på stationen, tar en fika och läser. Anna tycker att det låter mysigt.',
  gistNative: 'Erik’s train is late. He waits at the station, has a fika and reads. Anna thinks it sounds cosy.',
  words: [
    { text: 'försenat', lemma: 'försenad', meaning: 'delayed, late', at: delayed.start, clip: { start: delayed.start, end: delayed.end } },
    { text: 'fika', lemma: 'fika', meaning: 'coffee break', at: transcript.segments[5]!.start, clip: { start: transcript.segments[5]!.start, end: transcript.segments[5]!.start + 0.6 } },
    { text: 'mysigt', lemma: 'mysig', meaning: 'cosy', at: transcript.segments[7]?.start ?? 60, clip: { start: -1, end: -1 } },
  ],
  themes: [
    { title: 'A late train', at: 0 },
    { title: 'Making the most of the wait', at: transcript.segments[5]!.start },
  ],
}

export const LISTEN: ListenPayload = {
  episode: { id: 'ep1', title: 'Tåget till Göteborg', podcastTitle: 'Svenska Samtal', audioUrl: 'demo', image: art.samtal, durationSec: Math.ceil(transcript.words.at(-1)!.end + 2) },
  transcript: {
    language: 'sv',
    ...transcript,
    glossary: {
      tåget: { lemma: 'tåg', meaning: 'the train' },
      försenat: { lemma: 'försenad', meaning: 'delayed' },
      fika: { lemma: 'fika', meaning: 'coffee break' },
      mysigt: { lemma: 'mysig', meaning: 'cosy' },
      ändå: { lemma: 'ändå', meaning: 'still, anyway' },
      stationen: { lemma: 'station', meaning: 'the station' },
      helgen: { lemma: 'helg', meaning: 'the weekend' },
    },
  },
  guided: true,
  guidanceLevel: 'handsOn',
  plan: {
    episodeId: 'ep1',
    version: 1,
    targetLanguage: 'sv',
    nativeLanguage: 'en',
    hosts: [{ name: 'Anna', description: 'asks the questions' }, { name: 'Erik', description: 'tells the story' }],
    summary: 'Erik’s train to Gothenburg runs an hour late.',
    moments: MOMENTS,
    primer: PRIMER,
    wrapUpQuestions: [
      { prompt: 'Where was Erik going?', options: ['Malmö', 'Gothenburg', 'Uppsala'], answerIndex: 1 },
      { prompt: 'What did he do while he waited?', options: ['Had a fika and read', 'Took a taxi', 'Went home'], answerIndex: 0 },
    ],
  },
}

const ep = (id: string, title: string, podcastTitle: string, image: number, minutes: number, label?: string) => ({
  episodeId: id,
  podcastId: 'p1',
  title,
  podcastTitle,
  image: image as unknown as string,
  durationSec: minutes * 60,
  ready: true,
  difficulty: label ? { band: 'easier', label } : null,
})

const show = (id: string, title: string, author: string, artwork: number, readyEpisodes = 0) => ({ podcastId: id, title, author, artwork: artwork as unknown as string, readyEpisodes })

export const SHELVES: Shelf[] = [
  {
    id: 'for-you',
    title: 'For you',
    shows: [
      { appleId: 'f1', title: 'Depåsnack', author: 'Två motorjournalister', artwork: art.historia, genres: [], why: 'Because you follow Formula One' },
      { appleId: 'c1', title: 'Skratt i P3', author: 'Sveriges Radio', artwork: art.kaffe, genres: [], why: 'Because you like a laugh' },
    ],
  },
  {
    id: 'picks',
    title: 'Polycast picks',
    shows: [show('p1', 'Svenska Samtal', 'Anna & Erik', art.samtal, 12), show('p2', 'Kaffe med Karin', 'Karin Lund', art.kaffe, 5), show('p3', 'Historiepodden', 'Två historiker', art.historia, 8)],
  },
  {
    id: 'easy',
    title: 'Easy listening',
    episodes: [ep('ep1', 'Tåget till Göteborg', 'Svenska Samtal', art.samtal, 24, 'A2–B1'), ep('ep2', 'Min första midsommar', 'Kaffe med Karin', art.kaffe, 31, 'A2–B1'), ep('ep3', 'Veckans nyheter, enkelt', 'Lätta nyheter', art.nyheter, 12, 'A2–B1')],
  },
  {
    id: 'top',
    title: 'Top charts',
    shows: [
      { appleId: '1', title: 'Skrattfabriken', author: 'Humorlaget', artwork: art.humor as unknown as string, genres: [] },
      { appleId: '2', title: 'Historiepodden', author: 'Två historiker', artwork: art.historia as unknown as string, genres: [] },
      { appleId: '3', title: 'På resande fot', author: 'Resebyrån', artwork: art.resa as unknown as string, genres: [] },
      { appleId: '4', title: 'Lätta nyheter', author: 'Nyhetsredaktionen', artwork: art.nyheter as unknown as string, genres: [] },
    ],
  },
  { id: 'favourites', title: 'Listener favourites', episodes: [ep('ep4', 'Varför älskar vi kanelbullar?', 'Kaffe med Karin', art.kaffe, 27), ep('ep5', 'Vasaskeppet', 'Historiepodden', art.historia, 44)] },
]
