/**
 * Discover says hello in the learner's new language (PC-1019-09): a time-of-day greeting, with
 * their first name when Polycast knows it, the English on a tap, and now and then a local wink
 * ("Fika time?" at 3 pm for Swedish). Hand-written, so no AI cost, and it works offline.
 */
export interface Greeting {
  text: string
  english: string
  wink?: { text: string; english: string }
}

/** From this hour (local time), this greeting; before the first one, the last one carries on. */
type Band = [fromHour: number, text: string, english: string]

const GREETINGS: Record<string, Band[]> = {
  sv: [[5, 'God morgon', 'Good morning'], [10, 'Hej hej', 'Hi there'], [18, 'God kväll', 'Good evening']],
  es: [[5, 'Buenos días', 'Good morning'], [14, 'Buenas tardes', 'Good afternoon'], [21, 'Buenas noches', 'Good evening']],
  fr: [[5, 'Bonjour', 'Hello'], [18, 'Bonsoir', 'Good evening']],
  de: [[5, 'Guten Morgen', 'Good morning'], [11, 'Guten Tag', 'Hello'], [18, 'Guten Abend', 'Good evening']],
  it: [[5, 'Buongiorno', 'Good morning'], [17, 'Buonasera', 'Good evening']],
  pt: [[5, 'Bom dia', 'Good morning'], [12, 'Boa tarde', 'Good afternoon'], [19, 'Boa noite', 'Good evening']],
}

/** A local wink: shown in its hours (and on its weekdays, 0 = Sunday), every other day. */
interface Wink {
  from: number
  to: number
  days?: number[]
  text: string
  english: string
}

const WINKS: Record<string, Wink[]> = {
  sv: [
    { from: 15, to: 16, text: 'Dags för fika?', english: 'Fika time?' },
    { from: 17, to: 22, days: [5], text: 'Fredagsmys ikväll?', english: 'A cosy Friday night in?' },
  ],
  es: [
    { from: 15, to: 16, text: '¿Hora de la siesta?', english: 'Siesta time?' },
    { from: 21, to: 22, text: '¿Ya has cenado?', english: 'Had dinner yet?' },
  ],
  fr: [
    { from: 16, to: 16, text: 'C’est l’heure du goûter ?', english: 'Time for an afternoon snack?' },
    { from: 18, to: 20, text: 'On prend l’apéro ?', english: 'Apéritif time?' },
  ],
  de: [
    { from: 15, to: 16, text: 'Zeit für Kaffee und Kuchen?', english: 'Time for coffee and cake?' },
    { from: 16, to: 22, days: [5], text: 'Schönes Wochenende!', english: 'Have a lovely weekend!' },
  ],
  it: [
    { from: 18, to: 20, text: 'È l’ora dell’aperitivo?', english: 'Aperitivo time?' },
    { from: 12, to: 13, text: 'Buon pranzo!', english: 'Enjoy your lunch!' },
  ],
  pt: [
    { from: 16, to: 17, text: 'Hora do lanche?', english: 'Snack time?' },
    { from: 16, to: 22, days: [5], text: 'Bom fim de semana!', english: 'Have a good weekend!' },
  ],
}

/** The first word of a name, if it looks like a name (not an email or a private relay address). */
export function firstName(name: string | null | undefined): string | undefined {
  const first = name?.trim().split(/\s+/)[0]
  if (!first || first.length > 24 || /[@\d]/.test(first)) return undefined
  return first
}

function dayNumber(now: Date): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000)
}

export function greeting(language: string, now: Date, name?: string): Greeting | undefined {
  const bands = GREETINGS[language]
  if (!bands) return undefined
  const hour = now.getHours()
  const band = [...bands].reverse().find(([from]) => hour >= from) ?? bands[bands.length - 1]!
  const who = firstName(name)
  const out: Greeting = { text: who ? `${band[1]}, ${who}` : band[1], english: who ? `${band[2]}, ${who}` : band[2] }
  // Now and then: every other day, so it stays a surprise.
  if (dayNumber(now) % 2 === 0) {
    const wink = (WINKS[language] ?? []).find((w) => hour >= w.from && hour <= w.to && (!w.days || w.days.includes(now.getDay())))
    if (wink) out.wink = { text: wink.text, english: wink.english }
  }
  return out
}

/** Every greeting and wink, for checking the hand-written lists. */
export const GREETING_LANGUAGES = Object.keys(GREETINGS)
export const ALL_WINKS = WINKS
