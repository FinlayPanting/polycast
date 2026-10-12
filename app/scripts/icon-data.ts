import { BRAND, DEFAULT_MARK, FLAGS, needsOutline, POLE_COLOUR } from '@polycast/core'
const outlined = [...new Set([...FLAGS.flatMap((f) => f.bars), ...DEFAULT_MARK.bars, POLE_COLOUR])].filter((c) => needsOutline(c))
console.log(JSON.stringify({ ink: BRAND.ink, pole: POLE_COLOUR, brand: DEFAULT_MARK.bars, outlined, flags: FLAGS.map((f) => ({ id: f.id, bars: f.bars })) }))
