import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'

// ─── Pure-JS PNG encoder ──────────────────────────────────────────────────────

const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  CRC_TABLE[n] = c
}
function crc32(buf) {
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}
function chunk(type, data) {
  const tb = Buffer.from(type, 'ascii')
  const lb = Buffer.allocUnsafe(4); lb.writeUInt32BE(data.length, 0)
  const cb = Buffer.allocUnsafe(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0)
  return Buffer.concat([lb, tb, data, cb])
}
function makePNG(size, getPixel) {
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  const raw = Buffer.allocUnsafe(size * (1 + size * 3))
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = getPixel(x, y, size)
      const i = y * (1 + size * 3) + 1 + x * 3
      raw[i] = r; raw[i+1] = g; raw[i+2] = b
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ─── Icon drawing ─────────────────────────────────────────────────────────────

// Signed-distance field for a rounded rectangle (centered at origin)
function sdfRoundedRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r
  const qy = Math.abs(py - cy) - hh + r
  return Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - r
}

function drawIcon(x, y, size) {
  const s = size
  const cx = s / 2, cy = s / 2

  // Background: deep ink #0d0d0f
  const BG = [13, 13, 15]
  // Accent: warm amber #f59e0b
  const AM = [245, 158, 11]

  // Card background: slightly lighter rounded square
  const cardR = s * 0.18
  const cardSDF = sdfRoundedRect(x, y, cx, cy, s * 0.5 - 1, s * 0.5 - 1, cardR)
  if (cardSDF > 0) return BG   // outside card → pure background

  // "T" shape: crossbar + stem, proportioned for readability
  const barH = s * 0.11     // crossbar height
  const barW = s * 0.55     // crossbar width
  const barY = cy - s * 0.15 // crossbar vertical centre
  const stemW = s * 0.15
  const stemTop = barY + barH / 2
  const stemBot = cy + s * 0.28

  // Anti-aliased fill helper: returns 0..1 coverage
  function inBar(px, py) {
    const dx = Math.abs(px - cx) - barW / 2
    const dy = Math.abs(py - barY) - barH / 2
    const d = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2) + Math.min(Math.max(dx, dy), 0)
    return Math.max(0, Math.min(1, 0.5 - d))
  }
  function inStem(px, py) {
    if (py < stemTop || py > stemBot) return 0
    const dx = Math.abs(px - cx) - stemW / 2
    return Math.max(0, Math.min(1, 0.5 - dx))
  }

  const tCoverage = Math.min(1, inBar(x, y) + inStem(x, y))
  if (tCoverage > 0) {
    return BG.map((v, i) => Math.round(v * (1 - tCoverage) + AM[i] * tCoverage))
  }

  // Subtle amber dot in the centre-bottom of the T (the "tether" dot)
  const dotR = s * 0.055
  const dotY = stemBot + dotR * 0.3
  const dotDist = Math.sqrt((x - cx) ** 2 + (y - dotY) ** 2) - dotR
  const dotCov = Math.max(0, Math.min(1, 0.5 - dotDist))
  if (dotCov > 0) {
    return BG.map((v, i) => Math.round(v * (1 - dotCov) + AM[i] * dotCov))
  }

  return BG
}

// ─── Generate & save ─────────────────────────────────────────────────────────

mkdirSync('./public/icons', { recursive: true })

for (const size of [512, 192, 180]) {
  const png = makePNG(size, (x, y, s) => drawIcon(x, y, s))
  const name = size === 180 ? 'apple-touch-icon' : `icon-${size}`
  writeFileSync(`./public/icons/${name}.png`, png)
  console.log(`✓ ${name}.png (${size}×${size})`)
}

console.log('\nDone. Icons written to public/icons/')
