import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const assetsDirectory = new URL('../dist/assets/', import.meta.url)
const assetNames = await readdir(assetsDirectory)
const cssAssetNames = assetNames.filter((name) => name.endsWith('.css'))

if (!cssAssetNames.length) {
  throw new Error('Player CSS check failed: no compiled CSS assets found')
}

const compiledCss = (
  await Promise.all(cssAssetNames.map((name) => readFile(join(assetsDirectory.pathname, name), 'utf8')))
).join('\n')

const criticalSelectors = [
  '.player-page',
  '.phone-shell',
  '.game-screen',
  '.question-screen',
  '.option-grid',
  '.option-1',
  '.leaderboard-screen',
  '.final-screen',
  '.question-screen.has-image',
  '.option-text-box',
]

const missingSelectors = criticalSelectors.filter((selector) => !compiledCss.includes(selector))

if (missingSelectors.length) {
  throw new Error(`Player CSS check failed: missing ${missingSelectors.join(', ')}`)
}

console.log(`Player CSS check passed (${criticalSelectors.length} critical selectors)`)
