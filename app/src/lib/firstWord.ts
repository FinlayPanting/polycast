import AsyncStorage from '@react-native-async-storage/async-storage'
import { FIRST_WORD_KEY, isFirstWord } from './firstWordCore'
import { listWords } from './words'

/**
 * After a word is saved: true only the first time ever on this phone (PC-1018-06). Marks it done at
 * once, so it can never show twice. Any failure just means no bloom.
 */
export async function claimFirstWordBloom(language: string): Promise<boolean> {
  try {
    const celebrated = (await AsyncStorage.getItem(FIRST_WORD_KEY)) === '1'
    if (celebrated) return false
    await AsyncStorage.setItem(FIRST_WORD_KEY, '1')
    const words = await listWords(language)
    return isFirstWord({ celebrated, wordsInLanguage: words.length })
  } catch {
    return false
  }
}
