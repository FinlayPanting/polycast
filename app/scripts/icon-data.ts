import { DEFAULT_MARK, FLAGS, ICON_BACKGROUND, ICON_MARK_HEIGHT, needsOutline, POLE_COLOUR } from '@polycast/core'
const outlined = [...new Set([...FLAGS.flatMap((f) => f.bars), ...DEFAULT_MARK.bars, POLE_COLOUR])].filter((c) => needsOutline(c, ICON_BACKGROUND))
console.log(JSON.stringify({ ink: ICON_BACKGROUND, markHeight: ICON_MARK_HEIGHT, pole: POLE_COLOUR, brand: DEFAULT_MARK.bars, outlined, flags: FLAGS.map((f) => ({ id: f.id, bars: f.bars })) }))
