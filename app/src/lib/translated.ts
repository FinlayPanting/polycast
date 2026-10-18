/** A translation worth showing: there is one, and it says something the original doesn't already. */
export function worthShowing(original: string, translation: string | null | undefined): string | undefined {
  if (!translation) return undefined
  const norm = (s: string) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  return norm(translation) === norm(original) ? undefined : translation
}
