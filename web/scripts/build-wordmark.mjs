// 用霞鹜文楷把站点标识渲染成内联 SVG 路径。
// 文楷按 unicode-range 切成 582 个分片，最小粒度也有约 50KB/片，光是「杨中之声」四个字
// 就要拉 6 个分片、几百 KB。标识文案是固定的，所以在构建期取字形路径，运行时零字体开销。
// 改标识文案后重跑：npm run wordmark --workspace web
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import wawoff2 from 'wawoff2'
import opentype from 'opentype.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(here, '..')
const pkgDir = path.resolve(webRoot, '..', 'node_modules', 'lxgw-wenkai-webfont')
const outDir = path.join(webRoot, 'src', 'assets')
const FONT_SIZE = 100

const TARGETS = [
  { file: 'wordmark-mark.svg', text: '杨中之声', weight: 'bold', tracking: 0.04 },
  { file: 'wordmark-full.svg', text: '杨村一中校园广播电视台', weight: 'regular', tracking: 0.08 },
]

function parseRanges(spec) {
  return spec.split(',').map((part) => {
    const [from, to] = part.trim().replace(/^U\+/i, '').split('-')
    return [parseInt(from, 16), parseInt(to ?? from, 16)]
  })
}

async function loadFonts(weight, text) {
  const css = await readFile(path.join(pkgDir, `lxgwwenkai-${weight}.css`), 'utf8')
  const cps = [...text].map((ch) => ch.codePointAt(0))
  const fonts = []
  for (const raw of css.split('@font-face').slice(1)) {
    const file = raw.match(/url\('\.\/files\/([^']+)'\)/)?.[1]
    const spec = raw.match(/unicode-range:\s*([^;}]+)/)?.[1]
    if (!file || !spec) continue
    const ranges = parseRanges(spec)
    if (!cps.some((cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi))) continue
    const compressed = await readFile(path.join(pkgDir, 'files', file))
    const ttf = Buffer.from(await wawoff2.decompress(compressed))
    fonts.push(opentype.parse(new Uint8Array(ttf).buffer))
  }
  return fonts
}

function renderSvg(text, fonts, tracking) {
  const scale = FONT_SIZE / fonts[0].unitsPerEm
  const ascender = fonts[0].ascender * scale
  const descender = fonts[0].descender * scale
  const gap = FONT_SIZE * tracking
  const paths = []
  let x = 0

  for (const ch of text) {
    const font = fonts.find((f) => f.charToGlyphIndex(ch) > 0)
    if (!font) throw new Error(`文楷分片里找不到字形：${ch}`)
    const glyph = font.charToGlyph(ch)
    const d = glyph.getPath(x, 0, FONT_SIZE).toPathData(2)
    if (d) paths.push(d)
    x += (glyph.advanceWidth ?? font.unitsPerEm) * scale + gap
  }

  const width = +(x - gap).toFixed(2)
  const height = +(ascender - descender).toFixed(2)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${-ascender.toFixed(2)} ${width} ${height}"` +
    ` fill="currentColor" role="img" aria-label="${text}">` +
    `<path d="${paths.join(' ')}"/></svg>\n`
  )
}

await mkdir(outDir, { recursive: true })

for (const target of TARGETS) {
  const fonts = await loadFonts(target.weight, target.text)
  if (fonts.length === 0) throw new Error(`没有匹配到文楷分片：${target.text}`)
  const svg = renderSvg(target.text, fonts, target.tracking)
  await writeFile(path.join(outDir, target.file), svg)
  console.log(`${target.file}  ${target.text}  ${(svg.length / 1024).toFixed(1)} KB`)
}

