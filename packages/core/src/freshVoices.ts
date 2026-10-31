/**
 * Fresh voices on Discover (PC-1023-05): new shows from Spotify's RADAR Creators class of 2026 (named
 * 21 Oct 2026), so 18-to-30s current voices sit next to the long-running chart shows. Listed by title and
 * the country whose Apple catalogue carries them; the server finds each one's public feed and keeps it only
 * when the feed is in the language. Spotify named no Italian, German or Swedish shows; Eurowaves #50's picks
 * (PC-1030-06) add Spanish, French, Italian and European Portuguese ones, credited on their tiles.
 */
export interface FreshVoice {
  title: string
  /** Apple storefront to search, and where the show is from. */
  country: string
  /** Who recommended it, when it isn't from Spotify's list: shown on its tile (PC-1030-06). */
  credit?: string
}

/** The newsletter for European podcasters whose 50th issue recommended these (PC-1030-06). */
export const EUROWAVES = 'Eurowaves'

export const FRESH_VOICES_SOURCE = 'Spotify RADAR Creators 2026, Eurowaves #50'
/** Changes whenever the lists do, so the server's daily cache picks up the new shows at once. */
export const FRESH_VOICES_CACHE_KEY = 'fresh-voices:radar-2026+eurowaves-50'

export const FRESH_VOICES: Record<string, FreshVoice[]> = {
  es: [
    { title: 'Ahora me entero', country: 'es' },
    { title: 'Terapia de Parejas', country: 'es' },
    { title: 'Chronically Online', country: 'es' },
    { title: 'Querido Pícaro', country: 'es' },
    { title: 'Pareja in Crime', country: 'es' },
    { title: 'Mientras lavás los platos', country: 'ar' },
    { title: 'Nada que ocultar', country: 'ar' },
    { title: 'Tengo bocha para decir', country: 'ar' },
    { title: 'Todo por la empresa', country: 'ar' },
    { title: '¿Quién es Quién? por Martu Boden', country: 'ar' },
    { title: 'Número Mágico', country: 'es', credit: EUROWAVES },
  ],
  fr: [
    { title: 'STONKS! avec Arthur Perticoz', country: 'fr' },
    { title: 'Star System', country: 'fr' },
    { title: 'The Elevate House', country: 'fr' },
    { title: 'Femmes au bord de la crise de nerfs', country: 'fr' },
    { title: 'Tunnel par Anna Toumazoff', country: 'fr' },
    { title: 'Les Histoires Sombres et Morbides', country: 'fr' },
    { title: 'Night Confessions', country: 'fr', credit: EUROWAVES },
  ],
  it: [{ title: 'DigitMondo', country: 'it', credit: EUROWAVES }],
  pt: [
    { title: 'Café Frio Show com Victor Vaz', country: 'br' },
    { title: 'Só Pod Ser História', country: 'br' },
    { title: 'obra aberta', country: 'br' },
    { title: 'Medo em Cia.', country: 'br' },
    { title: 'Uma Tupá no Tempo', country: 'br' },
    { title: 'Em Voz Alta com @moniqueevelle', country: 'br' },
    { title: 'Dossiê de Orí', country: 'br' },
    { title: 'segunda terapia', country: 'br' },
    { title: 'Sarah de Terapia', country: 'br' },
    { title: 'Diálogos', country: 'br' },
    // European Portuguese, from Portugal.
    { title: 'Fumaça', country: 'pt', credit: EUROWAVES },
    { title: 'Lar Doce Livro', country: 'pt', credit: EUROWAVES },
  ],
}

const COUNTRY_NAMES: Record<string, string> = { es: 'Spain', ar: 'Argentina', fr: 'France', br: 'Brazil', it: 'Italy', pt: 'Portugal' }

/** The line under a fresh voice's tile, e.g. "New voice from Argentina", or "Recommended by Eurowaves". */
export function freshVoiceWhy(country: string, credit?: string): string {
  if (credit) return `Recommended by ${credit}`
  const name = COUNTRY_NAMES[country]
  return name ? `New voice from ${name}` : 'New voice'
}

/** Titles compared without case, accents, punctuation or spacing, so "Querido Pìcaro" finds "Querido Pícaro". */
export function sameShowTitle(a: string, b: string): boolean {
  const n = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  return n(a) !== '' && n(a) === n(b)
}
