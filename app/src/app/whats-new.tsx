import { groupChangelog, type ChangelogEntry } from '@polycast/core'
import { router } from 'expo-router'
import { useEffect, useMemo } from 'react'
import { ScrollView, View } from 'react-native'
import { Loading } from '../components/Loading'
import { Button, Screen, Txt } from '../components/ui'
import { useAsync } from '../lib/useAsync'
import { loadChangelog, markSeen } from '../lib/whatsNew'
import { space, usePalette } from '../theme'

/** What's new (PC-1019-F02): what each overnight build changed, newest first, and where to try it. */
export default function WhatsNew() {
  const { data } = useAsync(() => loadChangelog(), [])
  const builds = useMemo(() => groupChangelog(data?.entries ?? []), [data])
  useEffect(() => {
    if (data?.entries.length) void markSeen(data.entries)
  }, [data])

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl, gap: space.xl }}>
        <Button kind="quiet" label="Back" onPress={() => router.back()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
        <Txt variant="title" accessibilityRole="header">
          What’s new
        </Txt>
        {!data ? <Loading fill={false} /> : null}
        {data?.offline && builds.length ? (
          <Txt variant="small" tone="quiet">
            You’re offline, so this is the copy from last time.
          </Txt>
        ) : null}
        {data && !builds.length ? <Txt tone="quiet">Nothing here yet. New changes will show up after the next build.</Txt> : null}
        {builds.map((b) => (
          <View key={b.date} style={{ gap: space.md }}>
            <Txt variant="heading" accessibilityRole="header">
              {b.label}
            </Txt>
            {b.features.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
            {b.fixes.length ? (
              <View style={{ gap: space.sm, paddingTop: space.xs }}>
                <Txt variant="smallStrong" tone="quiet" accessibilityRole="header">
                  Fixes and refinements
                </Txt>
                {b.fixes.map((e) => (
                  <Entry key={e.id} e={e} small />
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </Screen>
  )
}

function Entry({ e, small = false }: { e: ChangelogEntry; small?: boolean }) {
  const p = usePalette()
  return (
    <View style={{ gap: 2, paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: small ? p.line : p.play }}>
      <Txt variant={small ? 'smallStrong' : 'bodyStrong'}>{e.title}</Txt>
      <Txt variant="small" tone="quiet">
        {e.description}
      </Txt>
      {e.tryIt ? (
        <Txt variant="small" tone="play">
          Try it: {e.tryIt}
        </Txt>
      ) : null}
    </View>
  )
}
