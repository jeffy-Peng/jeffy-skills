// 用 Chromium 给每页截图，顺便量一遍溢出。
// 浏览器依赖的解析在 lib/browser.mjs，三种装法都认。
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { loadChromium, findChrome } from '../lib/browser.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const [htmlPath, outDir = 'shots', pagesArg = ''] = process.argv.slice(2)
if (!htmlPath) {
  console.error('用法 shot.mjs demo/index.html [outDir] [1,3,5]')
  process.exit(2)
}

let chromium
try {
  chromium = loadChromium()
} catch (e) {
  console.error(String(e.message || e))
  process.exit(2)
}

const browser = await chromium.launch({ executablePath: findChrome() })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()

await page.goto(pathToFileURL(resolve(htmlPath)).href, { waitUntil: 'load' })
await page.evaluate(() => document.documentElement.style.setProperty('--s', '1'))

const total = await page.$$eval('.slide', (els) => els.length)
const want = pagesArg
  ? pagesArg.split(',').map((x) => parseInt(x, 10))
  : Array.from({ length: total }, (_, i) => i + 1)

mkdirSync(resolve(ROOT, outDir), { recursive: true })
const report = []

for (const i of want) {
  await page.evaluate((idx) => {
    const s = [...document.querySelectorAll('.slide')]
    s.forEach((el, k) => el.classList.toggle('on', k === idx - 1))
  }, i)
  await page.waitForTimeout(120)

  const problems = await page.evaluate(() => {
    const out = []
    const area = document.querySelector('.slide.on')
    if (!area) return out
    area.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el)
      if (cs.display === 'none') return
      if (el.children.length && el.scrollHeight > el.clientHeight + 3 && el.clientHeight > 0) {
        out.push(`纵向溢出 ${el.className || el.tagName} +${el.scrollHeight - el.clientHeight}px`)
      }
      const r = el.getBoundingClientRect()
      const a = area.getBoundingClientRect()
      if (r.bottom > a.bottom + 2) out.push(`底边越界 ${el.className || el.tagName}`)
      if (r.right > a.right + 2) out.push(`右边越界 ${el.className || el.tagName}`)
    })
    return out
  })

  const file = resolve(ROOT, outDir, `p${String(i).padStart(2, '0')}.png`)
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1280, height: 720 } })
  report.push({ page: i, file, problems })
}

await browser.close()
for (const r of report) {
  console.log(`第 ${String(r.page).padStart(2, '0')} 页  ${r.file}`)
  for (const p of r.problems) console.log('   ✗ ' + p)
}
const bad = report.filter((r) => r.problems.length).length
console.log(bad ? `\n${bad} 页有问题` : '\n✓ 没有溢出')
