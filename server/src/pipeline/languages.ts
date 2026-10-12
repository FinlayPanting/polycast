const NAMES: Record<string, string> = {
  en: 'English',
  sv: 'Swedish',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  no: 'Norwegian',
  nb: 'Norwegian',
  da: 'Danish',
}

export function languageName(code: string): string {
  return NAMES[code] ?? code
}
