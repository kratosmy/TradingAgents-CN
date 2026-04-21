const fs = require('node:fs')
const path = require('node:path')
const childProcess = require('node:child_process')

const { getCheckedInRuntimeConfig, isLoopbackUrl } = require('./runtime-config.js')
const { createReleaseHandoff } = require('../lib/release-handoff.js')

const EXPECTED_APP_ID = 'wx1d02a932c4f9a4ae'

function isSemver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(String(value || '').trim())
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function normalizePathList(values) {
  return [...new Set([].concat(values || []).map((value) => String(value || '').trim()).filter(Boolean))]
}

function getLocalOnlyWeChatPaths(runtimeConfig = {}) {
  return normalizePathList([
    runtimeConfig.operatorOverrides?.localRuntimeConfigPath,
    runtimeConfig.operatorOverrides?.devtoolsPrivateConfigPath,
    runtimeConfig.operatorOverrides?.uploadSecretsDirectory,
    runtimeConfig.operatorOverrides?.wechatCiPackageDirectory,
  ])
}

function inspectTrackedLocalOnlyArtifacts({ repoRoot, localOnlyPaths }) {
  const normalizedPaths = normalizePathList(localOnlyPaths)

  if (normalizedPaths.length === 0) {
    return { paths: [], error: null }
  }

  try {
    const output = childProcess.execFileSync(
      'git',
      ['-C', repoRoot, 'ls-files', '--cached', '--', ...normalizedPaths],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    return {
      paths: normalizePathList(output.split(/\r?\n/g)),
      error: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return {
      paths: [],
      error: `Unable to inspect tracked/staged local-only WeChat artifacts via git ls-files: ${message}`,
    }
  }
}

function loadCheckedInManualUploadSnapshot({
  miniRoot = path.resolve(__dirname, '..'),
  repoRoot = path.resolve(miniRoot, '..'),
} = {}) {
  return {
    miniRoot,
    repoRoot,
    packageJson: readJson(path.join(miniRoot, 'package.json')),
    appConfig: readJson(path.join(miniRoot, 'app.json')),
    projectConfig: readJson(path.join(miniRoot, 'project.config.json')),
    gitignoreText: fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8'),
    runtimeConfig: getCheckedInRuntimeConfig(),
  }
}

function validateManualUploadReadiness(snapshot = loadCheckedInManualUploadSnapshot()) {
  const runtimeConfig = snapshot.runtimeConfig || getCheckedInRuntimeConfig()
  const packageJson = snapshot.packageJson || {}
  const projectConfig = snapshot.projectConfig || {}
  const appConfig = snapshot.appConfig || {}
  const gitignoreText = String(snapshot.gitignoreText || '')
  const handoff = snapshot.releaseHandoff || createReleaseHandoff({
    runtimeConfig,
    packageVersion: packageJson.version || '0.1.0',
  })
  const repoRoot = snapshot.repoRoot || path.resolve(__dirname, '..', '..')

  const checks = []
  const errors = []

  function record(name, ok, successDetail, errorDetail) {
    checks.push({
      name,
      ok,
      detail: ok ? successDetail : errorDetail,
    })

    if (!ok) {
      errors.push(errorDetail)
    }
  }

  record(
    'checked-in Mini identity',
    runtimeConfig.appId === EXPECTED_APP_ID && projectConfig.appid === EXPECTED_APP_ID,
    `AppID ${EXPECTED_APP_ID} is present in checked-in runtime and Mini project config.`,
    `Checked-in Mini AppID must stay ${EXPECTED_APP_ID} in both runtime.shared.js and project.config.json.`,
  )

  record(
    'manual-upload runtime boundary',
    runtimeConfig.backend.mode === 'placeholder-preview' &&
      /^https:\/\//.test(String(runtimeConfig.backend.baseUrl || '')) &&
      isLoopbackUrl(runtimeConfig.backend.baseUrl) === false,
    `Checked-in runtime remains placeholder-preview on a non-loopback HTTPS target (${runtimeConfig.backend.baseUrl}).`,
    'Checked-in runtime must stay in placeholder-preview mode on a non-loopback HTTPS target for manual-upload handoff.',
  )

  record(
    'shared Mini project config',
    projectConfig.compileType === 'miniprogram' &&
      projectConfig.miniprogramRoot === '.' &&
      projectConfig.srcMiniprogramRoot === '.' &&
      projectConfig.setting?.ignoreUploadUnusedFiles === true &&
      Array.isArray(appConfig.pages) &&
      appConfig.pages.length >= 3,
    'project.config.json keeps import-shell upload settings and app.json still registers the checked-in shell pages.',
    'Mini project config must keep compileType=miniprogram, root=".", ignoreUploadUnusedFiles=true, and a registered checked-in shell page list.',
  )

  record(
    'release metadata shape',
    isSemver(packageJson.version) &&
      packageJson.scripts?.preflight === 'node ./scripts/preflight-manual-upload.mjs' &&
      packageJson.scripts?.['install:wechat-ci'] === 'node ./scripts/install-wechat-ci.mjs' &&
      packageJson.scripts?.['upload:wechat'] === 'node ./scripts/upload-wechat.mjs',
    `mini/package.json version ${packageJson.version} is semver and the manual-upload preflight, operator-only install helper, and gated upload scaffold commands are exposed.`,
    'mini/package.json must expose a semver version plus npm scripts preflight -> node ./scripts/preflight-manual-upload.mjs, install:wechat-ci -> node ./scripts/install-wechat-ci.mjs, and upload:wechat -> node ./scripts/upload-wechat.mjs.',
  )

  const checkedInMiniprogramCiDependency = packageJson.dependencies?.['miniprogram-ci'] ||
    packageJson.devDependencies?.['miniprogram-ci'] ||
    packageJson.optionalDependencies?.['miniprogram-ci']

  record(
    'operator-only miniprogram-ci dependency boundary',
    !checkedInMiniprogramCiDependency,
    `Checked-in Mini dependencies stay free of ${runtimeConfig.operatorOverrides.wechatCiPackageSpec}; later activation uses ${runtimeConfig.operatorOverrides.wechatCiInstallCommand} in a local-only install directory.`,
    `mini/package.json must keep ${runtimeConfig.operatorOverrides.wechatCiPackageSpec} out of checked-in dependencies so the upload-only dependency footprint stays operator-local.`,
  )

  const requiredGitignoreEntries = getLocalOnlyWeChatPaths(runtimeConfig)
  const trackedArtifactInspection =
    Array.isArray(snapshot.trackedLocalOnlyArtifacts) || snapshot.trackedLocalOnlyArtifactsError
      ? {
          paths: normalizePathList(snapshot.trackedLocalOnlyArtifacts),
          error: snapshot.trackedLocalOnlyArtifactsError
            ? String(snapshot.trackedLocalOnlyArtifactsError)
            : null,
        }
      : inspectTrackedLocalOnlyArtifacts({
          repoRoot,
          localOnlyPaths: requiredGitignoreEntries,
        })

  record(
    'local-only WeChat ignore rules',
    requiredGitignoreEntries.every((entry) => gitignoreText.includes(entry)),
    `Repo hygiene keeps ${requiredGitignoreEntries.join(', ')} local-only and untracked.`,
    `Repo .gitignore must keep ${requiredGitignoreEntries.join(', ')} local-only and untracked.`,
  )

  record(
    'tracked/staged local-only WeChat artifacts',
    trackedArtifactInspection.error == null && trackedArtifactInspection.paths.length === 0,
    'Git index inspection found no tracked/staged operator-private WeChat artifacts in versioned Mini paths.',
    trackedArtifactInspection.error ||
      `Tracked/staged operator-private WeChat artifacts must not be committed or staged: ${trackedArtifactInspection.paths.join(', ')}.`,
  )

  const handoffLocalOnlyPaths = new Set(Array.isArray(handoff.localOnlyPaths) ? handoff.localOnlyPaths : [])
  record(
    'checked-in runtime/upload handoff',
    handoff.truthBoundaryLabel === runtimeConfig.validation.manualUploadBoundaryLabel &&
      String(handoff.truthBoundaryCopy || '').includes('不证明真实微信运行时') &&
      Array.isArray(handoff.validatedNow) && handoff.validatedNow.length >= 3 &&
      Array.isArray(handoff.deferredOperatorSteps) && handoff.deferredOperatorSteps.length >= 4 &&
      requiredGitignoreEntries.every((entry) => handoffLocalOnlyPaths.has(entry)),
    'Handoff material separates validated shell readiness, deferred operator/runtime/upload steps, and local-only secret paths.',
    'Checked-in runtime/upload handoff material must separate validated shell readiness from deferred operator/runtime/upload steps and local-only secret paths.',
  )

  return {
    ok: errors.length === 0,
    checks,
    errors,
    handoff,
  }
}

function formatManualUploadPreflightReport(result) {
  const lines = [
    `mini preflight: ${result.ok ? 'PASS' : 'FAIL'} — ${result.handoff.truthBoundaryLabel}`,
    result.handoff.truthBoundaryCopy,
    '',
    'Validated checked-in shell readiness:',
    ...result.handoff.validatedNow.map((item) => `- ${item}`),
    '',
    'Deferred operator/runtime/upload steps:',
    ...result.handoff.deferredOperatorSteps.map((item, index) => `${index + 1}. ${item}`),
    '',
    'Keep local-only / untracked:',
    ...result.handoff.localOnlyPaths.map((item) => `- ${item}`),
    '',
    'Operator handoff checklist:',
    ...result.handoff.operatorHandoffSteps.map((item, index) => `${index + 1}. ${item}`),
    '',
    'Checks:',
    ...result.checks.map((check) => `- [${check.ok ? 'pass' : 'fail'}] ${check.name}: ${check.detail}`),
  ]

  if (result.ok) {
    lines.push(
      '',
      'Result: the checked-in mini/ shell is ready for operator handoff and manual DevTools upload preparation, while live backend/runtime/upload/publish verification remains deferred.',
    )
  } else {
    lines.push('', 'Preflight blockers:', ...result.errors.map((error) => `- ${error}`))
  }

  return `${lines.join('\n')}\n`
}

module.exports = {
  EXPECTED_APP_ID,
  formatManualUploadPreflightReport,
  isSemver,
  loadCheckedInManualUploadSnapshot,
  validateManualUploadReadiness,
}
