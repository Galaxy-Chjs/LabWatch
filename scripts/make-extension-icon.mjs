#!/usr/bin/env node
/**
 * Generate the extension icon as a real PNG, without an image library.
 *
 * vsce requires a raster icon; committing a hand-authored binary is opaque and
 * the alternative is a build dependency for one 128x128 image. PNG only needs
 * zlib and CRC32, both of which Node already has, so the icon is generated from
 * the same geometry as media/labwatch.svg.
 *
 * Usage: node scripts/make-extension-icon.mjs
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 128
const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, '..', 'vscode-extension', 'media', 'icon.png')

// Palette from the dashboard theme.
const BACKGROUND = [10, 14, 20, 255]
const BAR = [56, 189, 248, 255]
const DOT = [52, 211, 153, 255]
const BORDER = [36, 48, 68, 255]

/** Raw RGBA canvas. */
const pixels = new Uint8Array(SIZE * SIZE * 4)

function set(x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  pixels[i] = r
  pixels[i + 1] = g
  pixels[i + 2] = b
  pixels[i + 3] = a
}

function fill(x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) set(x, y, color)
  }
}

function roundedRect(x0, y0, w, h, radius, color, filled) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      // Distance from the nearest corner centre decides the rounded shape.
      const cx = Math.min(Math.max(x, x0 + radius), x0 + w - 1 - radius)
      const cy = Math.min(Math.max(y, y0 + radius), y0 + h - 1 - radius)
      const d = Math.hypot(x - cx, y - cy)
      if (d > radius) continue
      if (filled || d > radius - 2) set(x, y, color)
    }
  }
}

// Background panel.
roundedRect(0, 0, SIZE, SIZE, 26, BACKGROUND, true)

// Three ascending bars, echoing the logo.
const barWidth = 14
const baseY = 100
const bars = [
  { x: 30, height: 30, alpha: 0.55 },
  { x: 30 + barWidth + 8, height: 58, alpha: 0.8 },
  { x: 30 + (barWidth + 8) * 2, height: 84, alpha: 1 },
]
for (const bar of bars) {
  const color = [...BAR.slice(0, 3), Math.round(255 * bar.alpha), 255]
  roundedRect(bar.x, baseY - bar.height, barWidth, bar.height, 5, color, true)
}

// Status dot, matching the "GPU free" indicator in the UI.
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (Math.hypot(x - 101, y - 30) <= 9) set(x, y, DOT)
  }
}

// Subtle frame so the icon reads on a light background too.
roundedRect(1, 1, SIZE - 2, SIZE - 2, 25, BORDER, false)

/** CRC32, required by every PNG chunk. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

// One filter byte (0 = none) per scanline.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  Buffer.from(pixels.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1)
}

const header = Buffer.alloc(13)
header.writeUInt32BE(SIZE, 0)
header.writeUInt32BE(SIZE, 4)
header[8] = 8 // bit depth
header[9] = 6 // colour type: RGBA
header[10] = 0
header[11] = 0
header[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync(target, png)
console.log(`wrote ${target} (${SIZE}x${SIZE}, ${png.length} bytes)`)
