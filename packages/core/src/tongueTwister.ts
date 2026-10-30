import type { LaunchLanguage } from './types'

/**
 * A tongue-twister for the curious (PC-1029-08): hold the guide's mark on the wrap-up and Mia (or Leo) says one
 * in the language being learnt, slowly and then at full speed, with the words on screen. One per language, voiced
 * once per guide ahead of time by the server (beside the goodbye), and never announced: it's for fans to find.
 */
export const TONGUE_TWISTERS: Record<LaunchLanguage, { text: string; meaning: string }> = {
  es: { text: 'Tres tristes tigres tragaban trigo en un trigal.', meaning: 'Three glum tigers were swallowing wheat in a wheat field.' },
  fr: { text: 'Les chaussettes de l’archiduchesse sont-elles sèches ? Archi-sèches !', meaning: 'Are the archduchess’s socks dry? Bone dry!' },
  de: { text: 'Fischers Fritz fischt frische Fische.', meaning: 'Fritz the fisherman fishes fresh fish.' },
  it: { text: 'Trentatré trentini entrarono a Trento, tutti e trentatré trotterellando.', meaning: 'Thirty-three people from Trento came into Trento, all thirty-three of them trotting.' },
  pt: { text: 'O rato roeu a roupa do rei de Roma.', meaning: 'The rat gnawed the King of Rome’s clothes.' },
  sv: { text: 'Sju sjösjuka sjömän sköttes av sju sköna sjuksköterskor.', meaning: 'Seven seasick sailors were looked after by seven lovely nurses.' },
}

/** The first time through is slowed down (pitch kept), the second is as voiced. */
export const TWISTER_SLOW_RATE = 0.7

/** What the guide says on screen as she offers it. */
export function twisterOffer(guideName: string): string {
  return `${guideName}: Here’s one for the curious. Slowly first, then at full speed.`
}
