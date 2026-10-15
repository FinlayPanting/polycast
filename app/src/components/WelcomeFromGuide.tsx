import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { config } from '../lib/config'
import { flagsForLanguage } from '@polycast/core'
import { loadWelcome, playWelcome, welcomeText, welcomeUrl, type Welcome } from '../lib/welcome'
import { expoGuideVoice } from '../player/expoGuideVoice'
import { space, type, usePalette } from '../theme'
import { Mark } from './Mark'
import { Button, Txt } from './ui'

/**
 * Mia says hello once a learner has picked their language: what Polycast does, and a first word or
 * two in that language. Fixed audio voiced ahead of time; if it isn't there (offline, not voiced
 * yet), the card simply doesn't appear.
 */
export function WelcomeFromGuide({ language }: { language: string }) {
  const p = usePalette()
  const [welcome, setWelcome] = useState<Welcome>()
  const [playing, setPlaying] = useState(false)
  const voice = useRef(expoGuideVoice())
  const stopped = useRef(false)

  const play = async (w: Welcome) => {
    stopped.current = false
    setPlaying(true)
    await playWelcome(voice.current, w, () => stopped.current).catch(() => {})
    setPlaying(false)
  }
  const stop = () => {
    stopped.current = true
    voice.current.stop()
    setPlaying(false)
  }

  useEffect(() => {
    if (config.demo || !config.supabaseUrl || !language) return
    let gone = false
    void loadWelcome(welcomeUrl(config.supabaseUrl, language)).then((w) => {
      if (gone || !w) return
      setWelcome(w)
      void play(w)
    })
    return () => {
      gone = true
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  if (!welcome) return null
  const flagId = flagsForLanguage(language)[0]?.id ?? 'polycast'
  return (
    <View style={{ backgroundColor: p.raised, borderRadius: 18, padding: space.md, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Mark height={28} flagId={flagId} speaking={playing} accessibilityLabel="" />
        <Txt variant="bodyStrong" style={{ flex: 1 }}>
          Mia says hello
        </Txt>
        <Button kind="quiet" label={playing ? 'Stop' : 'Play again'} onPress={() => (playing ? stop() : void play(welcome))} />
      </View>
      <Text style={[type.small, { color: p.quiet }]} maxFontSizeMultiplier={1.6}>
        {welcomeText(welcome.text).map((part, i) => (
          <Text key={i} style={part.target ? { fontStyle: 'italic', color: p.text } : undefined}>
            {part.text}
          </Text>
        ))}
      </Text>
    </View>
  )
}
