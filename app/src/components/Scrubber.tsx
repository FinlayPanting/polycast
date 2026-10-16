import { useState } from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { space, usePalette } from '../theme'
import { clock, Txt } from './ui'

/**
 * The playhead, with a small mark wherever the guide will step in and a soft band over each advert
 * break in the learner's copy. Drag or tap to move, adverts included.
 */
export function Scrubber({ position, duration, markers, adverts = [], onSeek }: { position: number; duration: number; markers: number[]; adverts?: { start: number; end: number }[]; onSeek: (sec: number) => void }) {
  const p = usePalette()
  const [width, setWidth] = useState(1)
  const [drag, setDrag] = useState<number>()
  const shown = drag ?? position
  const frac = duration > 0 ? Math.min(1, shown / duration) : 0
  const toSec = (x: number) => Math.max(0, Math.min(duration, (x / width) * duration))

  // runOnJS(true): these callbacks use plain JavaScript (toSec, state). Run as UI-thread worklets,
  // as gesture callbacks are by default, calling toSec crashed the app on the first drag.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => setDrag(toSec(e.x)))
    .onEnd((e) => {
      onSeek(toSec(e.x))
      setDrag(undefined)
    })
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => onSeek(toSec(e.x)))

  return (
    <View
      style={{ gap: space.xs }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Playback position"
      accessibilityValue={{ text: `${clock(position)} of ${clock(duration)}${adverts.some((a) => position >= a.start && position < a.end) ? ', advert break' : ''}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onSeek(position + (e.nativeEvent.actionName === 'increment' ? 30 : -15))}
    >
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height: 28, justifyContent: 'center' }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: p.line }} />
          {duration > 0
            ? adverts.map((a, i) => (
                <View key={`ad${i}`} style={{ position: 'absolute', left: `${(a.start / duration) * 100}%`, width: `${((a.end - a.start) / duration) * 100}%`, height: 8, borderRadius: 4, backgroundColor: p.line, opacity: 0.9 }} />
              ))
            : null}
          <View style={{ position: 'absolute', height: 4, borderRadius: 2, backgroundColor: p.play, width: `${frac * 100}%` }} />
          {markers.map((m, i) => (
            <View key={i} style={{ position: 'absolute', left: `${(m / duration) * 100}%`, width: 3, height: 10, marginLeft: -1.5, borderRadius: 1.5, backgroundColor: m <= shown ? p.play : p.guide, opacity: 0.9 }} />
          ))}
          <View style={{ position: 'absolute', left: `${frac * 100}%`, width: 14, height: 14, marginLeft: -7, borderRadius: 7, backgroundColor: p.text }} />
        </View>
      </GestureDetector>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt variant="small" tone="quiet" style={{ fontVariant: ['tabular-nums'] }}>
          {clock(shown)}
        </Txt>
        <Txt variant="small" tone="quiet" style={{ fontVariant: ['tabular-nums'] }}>
          -{clock(duration - shown)}
        </Txt>
      </View>
    </View>
  )
}
