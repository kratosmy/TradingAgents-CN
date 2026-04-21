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
const { createReleaseHandoff, renderReleaseHandoffMarkdown } = require('../lib/release-handoff.js')
const packageJson = require('../package.json')

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
  'data/shell-content.js',
  'lib/release-handoff.js',
  'lib/wechat-ci-upload.js',
  'custom-tab-bar/index.js',
  'custom-tab-bar/index.json',
  'custom-tab-bar/index.wxml',
  'custom-tab-bar/index.wxss',
  'components/shell-chrome/index.js',
  'components/shell-chrome/index.json',
  'components/shell-chrome/index.wxml',
  'components/shell-chrome/index.wxss',
  'lib/runtime-config.js',
  'lib/manual-upload-preflight.js',
  'lib/auth-session-boundary.js',
  'lib/home-controller.js',
  'lib/shell-navigation.js',
  'lib/shell-surface-state.js',
  'lib/account-secondary-page.js',
  'styles/shell.wxss',
  'pages/home/index.js',
  'pages/home/index.json',
  'pages/home/index.wxml',
  'pages/home/index.wxss',
  'pages/watch/index.js',
  'pages/watch/index.json',
  'pages/watch/index.wxml',
  'pages/watch/index.wxss',
  'pages/account/index.js',
  'pages/account/index.json',
  'pages/account/index.wxml',
  'pages/account/index.wxss',
  'pages/account/settings/index.js',
  'pages/account/settings/index.json',
  'pages/account/settings/index.wxml',
  'pages/account/settings/index.wxss',
  'pages/account/about/index.js',
  'pages/account/about/index.json',
  'pages/account/about/index.wxml',
  'pages/account/about/index.wxss',
  'pages/account/privacy/index.js',
  'pages/account/privacy/index.json',
  'pages/account/privacy/index.wxml',
  'pages/account/privacy/index.wxss',
  'pages/account/help/index.js',
  'pages/account/help/index.json',
  'pages/account/help/index.wxml',
  'pages/account/help/index.wxss',
  'scripts/build-local-preview.mjs',
  'scripts/preflight-manual-upload.mjs',
  'scripts/upload-wechat.mjs',
  'tests/auth-session-boundary.test.mjs',
  'tests/home-digest-rendering.test.mjs',
  'tests/runtime-config-boundary.test.mjs',
  'tests/publish-shell-navigation.test.mjs',
  'tests/release-preflight.test.mjs',
  'tests/wechat-ci-upload-scaffold.test.mjs',
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
  const homePageConfig = JSON.parse(
    await fs.readFile(path.join(miniRoot, 'pages/home/index.json'), 'utf8'),
  )
  const watchPageConfig = JSON.parse(
    await fs.readFile(path.join(miniRoot, 'pages/watch/index.json'), 'utf8'),
  )
  const accountPageConfig = JSON.parse(
    await fs.readFile(path.join(miniRoot, 'pages/account/index.json'), 'utf8'),
  )

  const expectedPages = [
    'pages/home/index',
    'pages/watch/index',
    'pages/account/index',
    'pages/account/settings/index',
    'pages/account/about/index',
    'pages/account/privacy/index',
    'pages/account/help/index',
  ]

  if (JSON.stringify(appConfig.pages) !== JSON.stringify(expectedPages)) {
    throw new Error('app.json must register real Home / Watch / Account surfaces plus Account secondary pages')
  }

  if (
    !appConfig.tabBar ||
    appConfig.tabBar.custom !== true ||
    JSON.stringify(appConfig.tabBar.list.map((item) => item.pagePath)) !==
      JSON.stringify(['pages/home/index', 'pages/watch/index', 'pages/account/index'])
  ) {
    throw new Error('app.json must expose Home / Watch / Account as primary shell surfaces in a custom tab bar')
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

  if (packageJson.scripts['upload:wechat'] !== 'node ./scripts/upload-wechat.mjs') {
    throw new Error('mini/package.json must expose upload:wechat -> node ./scripts/upload-wechat.mjs for the gated miniprogram-ci scaffold')
  }

  if (
    homePageConfig.navigationBarTitleText !== 'Home' ||
    watchPageConfig.navigationBarTitleText !== 'Watch' ||
    accountPageConfig.navigationBarTitleText !== 'Account'
  ) {
    throw new Error('primary shell page titles must be Home, Watch, and Account')
  }

  if (
    appConfig.window.navigationBarBackgroundColor !== '#05070B' ||
    appConfig.window.backgroundColor !== '#05070B'
  ) {
    throw new Error('the shared Mini shell window must use the dark premium root background')
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
    !gitignoreText.includes('mini/config/runtime.local.js') ||
    !gitignoreText.includes('mini/upload-secrets/')
  ) {
    throw new Error('repo .gitignore must keep Mini project.private.config.json, runtime.local.js, and mini/upload-secrets/ local-only')
  }
}

async function ensureShellSourceReuse() {
  const sharedStylesText = await fs.readFile(path.join(miniRoot, 'styles/shell.wxss'), 'utf8')
  const watchSourceText = await fs.readFile(path.join(miniRoot, 'pages/watch/index.wxml'), 'utf8')
  const accountPageText = await fs.readFile(path.join(miniRoot, 'pages/account/index.wxml'), 'utf8')
  const shellContentText = await fs.readFile(path.join(miniRoot, 'data/shell-content.js'), 'utf8')
  const customTabBarText = await fs.readFile(path.join(miniRoot, 'custom-tab-bar/index.wxml'), 'utf8')

  if (
    !sharedStylesText.includes('.shell-page') ||
    !sharedStylesText.includes('.shell-surface-card') ||
    !sharedStylesText.includes('.shell-primary-action') ||
    !sharedStylesText.includes('#05070b') ||
    !sharedStylesText.includes('#1ED760')
  ) {
    throw new Error('styles/shell.wxss must define reusable dark-premium shell tokens and shared elevated-card/action styles')
  }

  for (const relativePath of [
    'pages/home/index.wxss',
    'pages/watch/index.wxss',
    'pages/account/index.wxss',
  ]) {
    const pageStyleText = await fs.readFile(path.join(miniRoot, relativePath), 'utf8')
    if (!pageStyleText.includes('styles/shell.wxss')) {
      throw new Error(`${relativePath} must import the shared shell stylesheet`)
    }
  }

  if (
    !watchSourceText.includes('placeholder-preview') ||
    !watchSourceText.includes('mini/config/runtime.local.js') ||
    !watchSourceText.includes('project.private.config.json') ||
    !watchSourceText.includes('mini/upload-secrets/') ||
    !watchSourceText.includes("watchState === 'loading'") ||
    !watchSourceText.includes("watchState === 'auth-required'") ||
    !watchSourceText.includes("watchState === 'authenticated-empty'") ||
    !watchSourceText.includes("watchState === 'waiting'") ||
    !watchSourceText.includes("watchState === 'ready'")
  ) {
    throw new Error('Watch source must visibly disclose the placeholder runtime mode, local override paths, and distinct loading/auth-required/authenticated-empty/waiting/ready states')
  }

  if (
    !accountPageText.includes('Account pages') ||
    !shellContentText.includes('Settings') ||
    !shellContentText.includes('About') ||
    !shellContentText.includes('Privacy') ||
    !shellContentText.includes('Help') ||
    !shellContentText.includes('manual-upload preflight') ||
    !shellContentText.includes('mini/upload-secrets/')
  ) {
    throw new Error('Account source must keep Settings / About / Privacy / Help as real in-app destinations')
  }

  if (!customTabBarText.includes('TradingAgents Mini')) {
    throw new Error('custom-tab-bar/index.wxml must render branded shell navigation chrome')
  }
}

async function ensureBuildArtifacts() {
  const runtimeConfig = getCheckedInRuntimeConfig()

  const testResult = spawnSync(
    'node',
    [
      '--test',
      '--test-concurrency=1',
      'tests/auth-session-boundary.test.mjs',
      'tests/home-digest-rendering.test.mjs',
      'tests/runtime-config-boundary.test.mjs',
      'tests/publish-shell-navigation.test.mjs',
      'tests/release-preflight.test.mjs',
      'tests/wechat-ci-upload-scaffold.test.mjs',
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
    !previewText.includes('mini/upload-secrets/') ||
    !previewText.includes('manual-upload shell readiness only') ||
    !previewText.includes('operator/runtime/upload steps') ||
    !previewText.includes('not evidence of real WeChat simulator, device, upload, or runtime success')
  ) {
    throw new Error('dist/local-preview.html must disclose the placeholder runtime boundary, local-only override paths, and runtime honesty limits')
  }

  if (
    !previewText.includes('loading') ||
    !previewText.includes('auth-required') ||
    !previewText.includes('authenticated-empty') ||
    !previewText.includes('waiting') ||
    !previewText.includes('ready') ||
    !previewText.includes('blank_credentials') ||
    !previewText.includes('invalid_credentials') ||
    !previewText.includes('missing_fields')
  ) {
    throw new Error('dist/local-preview.html must surface distinct Watch loading/auth-required/authenticated-empty/waiting/ready states plus login failure states')
  }

  if (
    !previewText.includes('Home stays overview-first') ||
    !previewText.includes('Watch owns the protected read path') ||
    !previewText.includes('Account owns identity and support navigation') ||
    !previewText.includes('Signed out, but the shell remains usable') ||
    !previewText.includes('authenticated-loading overview') ||
    !previewText.includes('authenticated-empty overview') ||
    !previewText.includes('authenticated-error overview') ||
    !previewText.includes('refreshes the Watch overview') ||
    !previewText.includes('zero protected digest cards') ||
    !previewText.includes('temporarily unavailable') ||
    !previewText.includes('Account remains available before sign-in') ||
    !previewText.includes('Account → Settings → Account') ||
    !previewText.includes('Dark premium visual system')
  ) {
    throw new Error('dist/local-preview.html must prove distinct Home / Watch / Account responsibilities, signed-out plus authenticated-loading/empty/error Home states, Account round trips, and the shared dark visual system')
  }

  if (
    !previewText.includes('one-card-per-stock_code') ||
    !previewText.includes('Ready digest content wins over duplicate placeholder rows') ||
    !previewText.includes('Placeholder/waiting-state cards remain visible after dedupe when no ready digest exists') ||
    !previewText.includes('compact shared fields')
  ) {
    throw new Error('dist/local-preview.html must show Watch ready-over-placeholder dedupe precedence, placeholder-card, and compact-field evidence')
  }

  const summary = JSON.parse(await fs.readFile(path.join(miniRoot, 'dist/validation-summary.json'), 'utf8'))
  const handoffJson = JSON.parse(await fs.readFile(path.join(miniRoot, 'dist/manual-upload-handoff.json'), 'utf8'))
  const handoffMarkdown = await fs.readFile(path.join(miniRoot, 'dist/manual-upload-handoff.md'), 'utf8')
  const expectedReleaseHandoff = createReleaseHandoff({ runtimeConfig, packageVersion: packageJson.version })
  if (
    summary.validationMode !== 'source-build-import-shell' ||
    !summary.runtimeBoundary ||
    summary.runtimeBoundary.appId !== 'wx1d02a932c4f9a4ae' ||
    summary.runtimeBoundary.isLoopbackTarget !== false ||
    summary.runtimeBoundary.localOverridePath !== 'mini/config/runtime.local.js' ||
    summary.runtimeBoundary.privateProjectConfigPath !== 'mini/project.private.config.json' ||
    summary.runtimeBoundary.uploadSecretsDirectory !== 'mini/upload-secrets/' ||
    summary.runtimeBoundary.uploadPrivateKeyPath !== 'mini/upload-secrets/code-upload.private.key'
  ) {
    throw new Error('dist/validation-summary.json must capture the checked-in runtime boundary and local-only override paths')
  }

  if (
    !Array.isArray(summary.primarySurfaces) ||
    JSON.stringify(summary.primarySurfaces.map((item) => item.key)) !==
      JSON.stringify(['home', 'watch', 'account']) ||
    !Array.isArray(summary.accountSecondaryPages) ||
    summary.accountSecondaryPages.length !== 4 ||
    summary.accountSecondaryPages.some((item) => item.returnPath !== '/pages/account/index')
  ) {
    throw new Error('dist/validation-summary.json must capture primary shell surfaces plus Account secondary-page round trips')
  }

  if (
    JSON.stringify(summary.generatedArtifacts) !==
      JSON.stringify([
        'dist/local-preview.html',
        'dist/validation-summary.json',
        'dist/manual-upload-handoff.json',
        'dist/manual-upload-handoff.md',
      ]) ||
    JSON.stringify(handoffJson) !== JSON.stringify(expectedReleaseHandoff) ||
    handoffMarkdown !== renderReleaseHandoffMarkdown(expectedReleaseHandoff) ||
    !summary.releaseHandoff ||
    summary.releaseHandoff.truthBoundaryLabel !== 'manual-upload shell readiness only' ||
    !Array.isArray(summary.releaseHandoff.localOnlyPaths) ||
    !summary.releaseHandoff.localOnlyPaths.includes('mini/upload-secrets/') ||
    !Array.isArray(summary.releaseHandoff.deferredOperatorSteps) ||
    summary.releaseHandoff.deferredOperatorSteps.length < 4 ||
    !String(summary.releaseHandoff.truthBoundaryCopy || '').includes('不证明真实微信运行时') ||
    !summary.visualSystem ||
    summary.visualSystem.sharedStylesheet !== 'styles/shell.wxss' ||
    summary.visualSystem.rootBackground !== '#05070B' ||
    summary.visualSystem.accentColor !== '#1ED760' ||
    summary.visualSystem.elevatedCardClass !== 'shell-surface-card' ||
    summary.visualSystem.primaryActionClass !== 'shell-primary-action'
  ) {
    throw new Error('dist/validation-summary.json must capture the shared dark-premium visual system evidence')
  }

  if (
    !summary.homeOverview ||
    summary.homeOverview.distinctFromWatch !== true ||
    !summary.homeOverview.states ||
    summary.homeOverview.states.signedOut !== 'signed-out' ||
    summary.homeOverview.states.authenticatedLoading !== 'authenticated-loading' ||
    summary.homeOverview.authenticatedLoadingHeadline !== 'Signed in as mini-preview' ||
    !String(summary.homeOverview.authenticatedLoadingCopy || '').includes('refreshes the Watch overview') ||
    summary.homeOverview.states.authenticatedEmpty !== 'authenticated-empty' ||
    summary.homeOverview.states.authenticatedError !== 'authenticated-error' ||
    summary.homeOverview.authenticatedEmptyHeadline !== 'Signed in as mini-preview' ||
    !String(summary.homeOverview.authenticatedEmptyCopy || '').includes('zero protected digest cards') ||
    summary.homeOverview.authenticatedErrorHeadline !== 'Signed in as mini-preview' ||
    !String(summary.homeOverview.authenticatedErrorCopy || '').includes('temporarily unavailable') ||
    !summary.watchSurfaceStates ||
    summary.watchSurfaceStates.loading !== 'loading' ||
    summary.watchSurfaceStates.authRequired !== 'auth-required' ||
    summary.watchSurfaceStates.authenticatedEmpty !== 'authenticated-empty' ||
    summary.watchSurfaceStates.waiting !== 'waiting' ||
    summary.watchSurfaceStates.ready !== 'ready' ||
    !summary.watchDigestRendering ||
    summary.watchDigestRendering.rawPayloadCardCount < summary.watchDigestRendering.renderedCardCount ||
    summary.watchDigestRendering.dedupedCount < 1 ||
    summary.watchDigestRendering.placeholderCount < 1 ||
    summary.watchDigestRendering.readyDigestPreferredOverPendingDuplicate !== true ||
    summary.watchDigestRendering.waitingStateRetainedWithoutReady !== true
  ) {
    throw new Error('dist/validation-summary.json must prove Home signed-out/authenticated-loading/authenticated-empty/authenticated-error separation plus distinct Watch states, ready-over-placeholder dedupe, and waiting-state retention')
  }
}

await ensureFilesExist()
await ensureConfigShape()
await ensurePrivateOverridesStayLocal()
await ensureShellSourceReuse()
await ensureBuildArtifacts()

console.log('mini_validate passed: verified publish shell registration, dark-premium tokens, placeholder runtime boundary, manual-upload handoff artifacts, gated miniprogram-ci scaffold, and source/build evidence from mini/')
console.log(`required files: ${requiredFiles.join(', ')}`)
console.log('artifacts: dist/local-preview.html, dist/validation-summary.json, dist/manual-upload-handoff.json, dist/manual-upload-handoff.md')
