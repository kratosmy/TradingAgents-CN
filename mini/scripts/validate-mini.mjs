import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const miniRoot = path.resolve(__dirname, '..')

const requiredFiles = [
  'package.json',
  'app.js',
  'app.json',
  'app.wxss',
  'project.config.json',
  'sitemap.json',
  'data/digest-cards.js',
  'lib/auth-session-boundary.js',
  'lib/home-controller.js',
  'pages/home/index.js',
  'pages/home/index.json',
  'pages/home/index.wxml',
  'pages/home/index.wxss',
  'scripts/build-local-preview.mjs',
  'tests/auth-session-boundary.test.mjs',
]

async function ensureFilesExist() {
  for (const relativePath of requiredFiles) {
    const absolutePath = path.join(miniRoot, relativePath)
    try {
      await fs.access(absolutePath)
    } catch (error) {
      throw new Error(`Missing required mini scaffold file: ${relativePath}`)
    }
  }
}

async function ensureConfigShape() {
  const appConfig = JSON.parse(await fs.readFile(path.join(miniRoot, 'app.json'), 'utf8'))
  const projectConfig = JSON.parse(await fs.readFile(path.join(miniRoot, 'project.config.json'), 'utf8'))

  if (!Array.isArray(appConfig.pages) || !appConfig.pages.includes('pages/home/index')) {
    throw new Error('app.json must declare pages/home/index as a real Mini entry page')
  }

  if (projectConfig.compileType !== 'miniprogram') {
    throw new Error('project.config.json must declare compileType=miniprogram')
  }
}

async function ensureDisclosures() {
  const sourceText = await fs.readFile(path.join(miniRoot, 'pages/home/index.wxml'), 'utf8')
  if (!sourceText.includes('local-only validation')) {
    throw new Error('pages/home/index.wxml must visibly disclose local-only validation')
  }

  if (!sourceText.includes('auth-required')) {
    throw new Error('pages/home/index.wxml must visibly disclose the auth-required state')
  }

  const testResult = spawnSync('node', ['--test', 'tests/auth-session-boundary.test.mjs'], {
    cwd: miniRoot,
    stdio: 'inherit',
  })

  if (testResult.status !== 0) {
    throw new Error(`mini auth/session tests failed with exit code ${testResult.status ?? 'unknown'}`)
  }

  const buildResult = spawnSync('node', ['scripts/build-local-preview.mjs'], {
    cwd: miniRoot,
    stdio: 'inherit',
  })

  if (buildResult.status !== 0) {
    throw new Error(`mini build command failed with exit code ${buildResult.status ?? 'unknown'}`)
  }

  const previewText = await fs.readFile(path.join(miniRoot, 'dist/local-preview.html'), 'utf8')
  if (
    !previewText.includes('local-only validation') ||
    !previewText.includes('not evidence of real WeChat simulator, device, or runtime success')
  ) {
    throw new Error('dist/local-preview.html must disclose that validation is local-only and not real WeChat runtime coverage')
  }

  if (
    !previewText.includes('auth-required') ||
    !previewText.includes('blank_credentials') ||
    !previewText.includes('invalid_credentials') ||
    !previewText.includes('missing_fields')
  ) {
    throw new Error('dist/local-preview.html must surface auth-required and distinct login failure states')
  }
}

await ensureFilesExist()
await ensureConfigShape()
await ensureDisclosures()

console.log('mini_validate passed: verified real mini entry/config files and local-only preview/build evidence from mini/')
console.log(`required files: ${requiredFiles.join(', ')}`)
console.log('artifacts: dist/local-preview.html, dist/validation-summary.json')
