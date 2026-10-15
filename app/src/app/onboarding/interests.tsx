import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { InterestPicker } from '../../components/InterestPicker'
import { Button, Screen, Txt } from '../../components/ui'
import { WelcomeFromGuide } from '../../components/WelcomeFromGuide'
import { languageName } from '../../lib/languages'
import { space } from '../../theme'

/** Optional: a few interests so Discover leads with shows in the learner's language they'll enjoy. */
export default function ChooseInterests() {
  const { language } = useLocalSearchParams<{ language: string }>()
  const [interests, setInterests] = useState<string[]>([])
  const next = (chosen: string[]) => router.push({ pathname: '/onboarding/guidance', params: { language, interests: chosen.join(',') } })

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Button kind="quiet" label="Back" onPress={() => router.back()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0, marginTop: space.md }} />
        {language ? <WelcomeFromGuide language={language} /> : null}
        <Txt variant="title">What do you enjoy?</Txt>
        <Txt tone="quiet">Pick a few and we’ll find {language ? languageName(language) : ''} shows about them. You can change these any time.</Txt>
        <InterestPicker value={interests} onChange={setInterests} />
      </ScrollView>
      <View style={{ padding: space.lg, gap: space.sm }}>
        <Button label="Continue" disabled={interests.length === 0} onPress={() => next(interests)} />
        <Button kind="quiet" label="Skip for now" onPress={() => next([])} />
      </View>
    </Screen>
  )
}
