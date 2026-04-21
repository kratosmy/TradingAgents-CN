import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const miniRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(miniRoot, '..')
const require = createRequire(import.meta.url)

const { getCheckedInRuntimeConfig, isLoopbackUrl } = require('../lib/runtime-config.js')

const requiredFiles = [
  'package.json',
  'app.js',
  'app.json',
  'app.wxss',
  'project.config.json',
  'sitemap.json',
  'assets/tradingagents-mini-logo.png',
  'assets/tradingagents-mini-logo.svg',
  'config/runtime.shared.js',
  'data/digest-cards.js',
  'lib/runtime-config.js',
  'lib/auth-session-boundary.js',
  'lib/home-controller.js',
  'pages/home/index.js',
  'pages/home/index.json',
  'pages/home/index.wxml',
  'pages/home/index.wxss',
  'scripts/build-local-preview.mjs',
  'tests/auth-session-boundary.test.mjs',
  'tests/home-digest-rendering.test.mjs',
  'tests/runtime-config-boundary.test.mjs',
]

async function ensureFilesExist() {
  for (const relativePath of requiredFiles) {
    const absolutePath = path.join(miniRoot, relativePath)
    try {
      await fs.access(absolutePath)
    } catch (_error) {
      throw new Error(`Missing required mini scaffold file: ${relativePath}`)
    }
  }
}

async function ensureConfigShape() {
  const runtimeConfig = getCheckedInRuntimeConfig()
  const appConfig = JSON.parse(await fs.readFile(path.join(miniRoot, 'app.json'), 'utf8'))
  const projectConfig = JSON.parse(await fs.readFile(path.join(miniRoot, 'project.config.json'), 'utf8'))
  const pageConfig = JSON.parse(
    await fs.readFile(path.join(miniRoot, 'pages/home/index.json'), 'utf8'),
  )

  if (!Array.isArray(appConfig.pages) || !appConfig.pages.includes('pages/home/index')) {
    throw new Error('app.json must declare pages/home/index as a real Mini entry page')
  }

  if (projectConfig.compileType !== 'miniprogram') {
    throw new Error('project.config.json must declare compileType=miniprogram')
  }

  if (projectConfig.appid !== runtimeConfig.appId) {
    throw new Error('project.config.json must preserve the checked-in shared AppID')
  }

  if (projectConfig.projectname.includes('LocalValidation')) {
    throw new Error('project.config.json must use publish-facing import-shell metadata instead of local-validation naming')
  }

  if (pageConfig.navigationBarTitleText.includes('本地验证')) {
    throw new Error('pages/home/index.json must use publish-facing entry naming instead of local-validation framing')
  }

  if (runtimeConfig.backend.mode !== 'placeholder-preview') {
    throw new Error('checked-in runtime config must default to placeholder-preview mode')
  }

  if (isLoopbackUrl(runtimeConfig.backend.baseUrl)) {
    throw new Error('checked-in runtime config must not use a loopback runtime target')
  }
}

async function ensurePrivateOverridesStayLocal() {
  const gitignoreText = await fs.readFile(path.join(repoRoot, '.gitignore'), 'utf8')

  if (
    !gitignoreText.includes('mini/project.private.config.json') ||
    !gitignoreText.includes('mini/config/runtime.local.js')
  ) {
    throw new Error('repo .gitignore must keep Mini project.private.config.json and runtime.local.js local-only')
  }
}

async function ensureDisclosures() {
  const sourceText = await fs.readFile(path.join(miniRoot, 'pages/home/index.wxml'), 'utf8')
  if (!sourceText.includes('placeholder-preview')) {
    throw new Error('pages/home/index.wxml must visibly disclose the checked-in placeholder-preview runtime mode')
  }

  if (!sourceText.includes('mini/config/runtime.local.js')) {
    throw new Error('pages/home/index.wxml must surface the local runtime override path')
  }

  if (!sourceText.includes('project.private.config.json')) {
    throw new Error('pages/home/index.wxml must surface the local-only DevTools private config path')
  }

  if (!sourceText.includes('auth-required')) {
    throw new Error('pages/home/index.wxml must visibly disclose the auth-required state')
  }

  const testResult = spawnSync(
    'node',
    [
      '--test',
      'tests/auth-session-boundary.test.mjs',
      'tests/home-digest-rendering.test.mjs',
      'tests/runtime-config-boundary.test.mjs',
    ],
    {
      cwd: miniRoot,
      stdio: 'inherit',
    },
  )

  if (testResult.status !== 0) {
    throw new Error(`mini tests failed with exit code ${testResult.status ?? 'unknown'}`)
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
    !previewText.includes('placeholder-preview') ||
    !previewText.includes('TradingAgentsMiniImportShell') ||
    !previewText.includes('mini/config/runtime.local.js') ||
    !previewText.includes('project.private.config.json') ||
    !previewText.includes('not evidence of real WeChat simulator, device, upload, or runtime success')
  ) {
    throw new Error('dist/local-preview.html must disclose the placeholder runtime boundary, local-only override paths, and runtime honesty limits')
  }

  if (
    !previewText.includes('auth-required') ||
    !previewText.includes('blank_credentials') ||
    !previewText.includes('invalid_credentials') ||
    !previewText.includes('missing_fields')
  ) {
    throw new Error('dist/local-preview.html must surface auth-required and distinct login failure states')
  }

  if (
    !previewText.includes('one-card-per-stock_code') ||
    !previewText.includes('Ready digest content wins over duplicate placeholder rows') ||
    !previewText.includes('Placeholder/waiting-state cards remain visible after dedupe when no ready digest exists') ||
    !previewText.includes('compact shared fields')
  ) {
    throw new Error('dist/local-preview.html must show ready-over-placeholder dedupe precedence, placeholder-card, and compact-field evidence')
  }

  const summary = JSON.parse(await fs.readFile(path.join(miniRoot, 'dist/validation-summary.json'), 'utf8'))
  if (
    summary.validationMode !== 'source-build-import-shell' ||
    !summary.runtimeBoundary ||
    summary.runtimeBoundary.appId !== 'wx1d02a932c4f9a4ae' ||
    summary.runtimeBoundary.isLoopbackTarget !== false ||
    summary.runtimeBoundary.localOverridePath !== 'mini/config/runtime.local.js' ||
    summary.runtimeBoundary.privateProjectConfigPath !== 'mini/project.private.config.json'
  ) {
    throw new Error('dist/validation-summary.json must capture the checked-in runtime boundary and local-only override paths')
  }

  if (
    !summary.homeDigestRendering ||
    summary.homeDigestRendering.rawPayloadCardCount < summary.homeDigestRendering.renderedCardCount ||
    summary.homeDigestRendering.dedupedCount < 1 ||
    summary.homeDigestRendering.placeholderCount < 1 ||
    summary.homeDigestRendering.readyDigestPreferredOverPendingDuplicate !== true ||
    summary.homeDigestRendering.waitingStateRetainedWithoutReady !== true
  ) {
    throw new Error('dist/validation-summary.json must prove ready-over-placeholder dedupe precedence and waiting-state card retention for the Mini home surface')
  }
}

await ensureFilesExist()
await ensureConfigShape()
await ensurePrivateOverridesStayLocal()
await ensureDisclosures()

console.log('mini_validate passed: verified import-shell config, placeholder runtime boundary, and source/build evidence from mini/')
console.log(`required files: ${requiredFiles.join(', ')}`)
console.log('artifacts: dist/local-preview.html, dist/validation-summary.json')
