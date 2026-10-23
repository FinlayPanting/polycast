import { File, Paths } from 'expo-file-system'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Share, View } from 'react-native'
import Svg, { Circle, Rect, Text as SvgText, TSpan } from 'react-native-svg'
import { STORY, type StoryLayout } from '../lib/recap'
import { base64ToBytes, CARD_COLOURS, type CardText } from '../lib/shareCard'
import { font } from '../theme'

export interface RecapCardHandle {
  /** Shares the card as a picture with `message` as text; falls back to the text alone. */
  share: (message: string) => Promise<void>
}

function Block({ t }: { t: CardText }) {
  return (
    <>
      {t.lines.map((l, i) => (
        <SvgText key={i} x={t.x ?? STORY.padding} y={t.y + i * t.lineHeight} fill={t.colour} fontSize={t.size} fontFamily={t.weight === 'semibold' ? font.semibold : font.regular}>
          {l}
        </SvgText>
      ))}
    </>
  )
}

/**
 * A 9:16 story card (PC-1019-F01), drawn on screen as a preview at `previewWidth` and exported at
 * 1080 × 1920 when shared. Words only, never the host's audio.
 */
export const RecapCard = forwardRef<RecapCardHandle, { layout: StoryLayout; name: string; previewWidth: number; label: string }>(function RecapCard({ layout, name, previewWidth, label }, ref) {
  const svg = useRef<any>(null)
  useImperativeHandle(ref, () => ({
    async share(message: string) {
      try {
        const b64 = await new Promise<string>((resolve, reject) => {
          if (!svg.current?.toDataURL) return reject(new Error('No picture'))
          svg.current.toDataURL((data: string) => (data ? resolve(data) : reject(new Error('No picture'))), { width: STORY.width, height: STORY.height })
        })
        const file = new File(Paths.cache, `polycast-${name}.png`)
        if (file.exists) file.delete()
        file.create()
        file.write(base64ToBytes(b64))
        await Share.share({ url: file.uri, message })
      } catch {
        await Share.share({ message }).catch(() => {})
      }
    },
  }))

  const height = (previewWidth * STORY.height) / STORY.width
  return (
    <View accessible accessibilityLabel={label} style={{ width: previewWidth, height, borderRadius: 16, overflow: 'hidden' }}>
      <Svg ref={svg} width={previewWidth} height={height} viewBox={`0 0 ${STORY.width} ${STORY.height}`}>
        <Rect x={0} y={0} width={STORY.width} height={STORY.height} fill={layout.background} />
        {layout.mark.map((m, i) => (
          <Rect key={i} x={m.x} y={m.y} width={m.width} height={m.height} rx={m.radius} ry={m.radius} fill={m.colour} />
        ))}
        {layout.texts.map((t, i) => (
          <Block key={i} t={t} />
        ))}
        {layout.badge ? (
          <>
            <Circle cx={layout.badge.cx} cy={layout.badge.cy} r={layout.badge.r} fill={layout.badge.colour} />
            <SvgText x={layout.badge.cx} y={layout.badge.cy + layout.badge.size * 0.36} textAnchor="middle" fill={CARD_COLOURS.text} fontSize={layout.badge.size} fontFamily={font.semibold}>
              {layout.badge.initial}
            </SvgText>
          </>
        ) : null}
        {layout.wordRows.map((r, i) => (
          <SvgText key={`w${i}`} x={STORY.padding} y={r.y} fontSize={r.size}>
            <TSpan fill={CARD_COLOURS.accent} fontFamily={font.semibold}>
              {r.word}
            </TSpan>
            <TSpan fill={CARD_COLOURS.text} fontFamily={font.regular}>
              {`  ${r.meaning}`}
            </TSpan>
          </SvgText>
        ))}
        {layout.chips.map((c, i) => (
          <SvgText key={`c${i}`} x={c.x + 28} y={c.y + c.height / 2 + 11} fill={CARD_COLOURS.text} fontSize={30} fontFamily={font.semibold}>
            {c.label}
          </SvgText>
        ))}
        {layout.chips.map((c, i) => (
          <Rect key={`r${i}`} x={c.x} y={c.y} width={c.width} height={c.height} rx={c.height / 2} ry={c.height / 2} fill="none" stroke={CARD_COLOURS.quiet} strokeWidth={3} />
        ))}
      </Svg>
    </View>
  )
})
