import { ExtensionStorage } from '@bacons/apple-targets'
import { Platform } from 'react-native'
import type { SavedWord } from '@polycast/core'
import { WIDGET_GROUP, WIDGET_KEY, WIDGET_KIND, widgetWords } from './wordWidgetCore'

let lastSent = ''

/** Shares the learner's recent saved words with the Home Screen widget (PC-1025-08). Never throws. */
export function publishWidgetWords(words: readonly SavedWord[]): void {
  if (Platform.OS !== 'ios') return
  try {
    const json = JSON.stringify(widgetWords(words))
    if (json === lastSent) return
    new ExtensionStorage(WIDGET_GROUP).set(WIDGET_KEY, json)
    ExtensionStorage.reloadWidget(WIDGET_KIND)
    lastSent = json
  } catch {
    // A build without the widget, or no App Group yet: nothing to show, nothing to break.
  }
}
