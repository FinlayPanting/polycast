import { File, Paths } from 'expo-file-system'
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { Share, View } from 'react-native'
import Svg, { Rect, Text as SvgText } from 'react-native-svg'
import { base64ToBytes, CARD, CARD_COLOURS, cardLayout, type CardText } from '../lib/shareCard'
import type { ShareableLine } from '../lib/shareLine'
import { font } from '../theme'

export interface ShareCardHandle {
  /** Shares the card as a picture with the line's words and link as text; falls back to text alone. */
  share: (message: string) => Promise<void>
}

function Block({ t }: { t: CardText }) {
  return (
    <>
      {t.lines.map((l, i) => (
        <SvgText key={i} x={CARD.padding} y={t.y + i * t.lineHeight} fill={t.colour} fontSize={t.size} fontFamily={t.weight === 'semibold' ? font.semibold : font.regular}>
          {l}
        </SvgText>
      ))}
    </>
  )
}

/** Drawn off screen at a third of its size and exported at full size when shared (PC-1017-08). */
export const ShareCard = forwardRef<ShareCardHandle, { line: ShareableLine; showTitle: string; flagId?: string | null }>(function ShareCard({ line, showTitle, flagId }, ref) {
  const svg = useRef<any>(null)
  const layout = useMemo(() => cardLayout(line, showTitle, flagId), [line, showTitle, flagId])

  useImperativeHandle(ref, () => ({
    async share(message: string) {
      try {
        const b64 = await new Promise<string>((resolve, reject) => {
          if (!svg.current?.toDataURL) return reject(new Error('No picture'))
          svg.current.toDataURL((data: string) => (data ? resolve(data) : reject(new Error('No picture'))), { width: CARD.width, height: CARD.height })
        })
        const file = new File(Paths.cache, `polycast-line-${Math.round(line.start)}.png`)
        if (file.exists) file.delete()
        file.create()
        file.write(base64ToBytes(b64))
        await Share.share({ url: file.uri, message })
      } catch {
        await Share.share({ message }).catch(() => {})
      }
    },
  }))

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: -10000, top: 0, width: CARD.width / 3, height: CARD.height / 3 }}>
      <Svg ref={svg} width={CARD.width / 3} height={CARD.height / 3} viewBox={`0 0 ${CARD.width} ${CARD.height}`}>
        <Rect x={0} y={0} width={CARD.width} height={CARD.height} fill={CARD_COLOURS.background} />
        {layout.mark.map((m, i) => (
          <Rect key={i} x={m.x} y={m.y} width={m.width} height={m.height} rx={m.radius} ry={m.radius} fill={m.colour} />
        ))}
        <Block t={layout.quote} />
        <Block t={layout.meaning} />
        <Block t={layout.credit} />
        <Block t={layout.link} />
      </Svg>
    </View>
  )
})
