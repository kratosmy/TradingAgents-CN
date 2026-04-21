const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const packageJson = require('../package.json')
const { isSemver } = require('./manual-upload-preflight.js')
const { getCheckedInRuntimeConfig } = require('./runtime-config.js')

const UPLOAD_ENV_KEYS = Object.freeze({
  privateKeyPath: 'WECHAT_MINI_CI_PRIVATE_KEY_PATH',
  privateKeyValue: 'WECHAT_MINI_CI_PRIVATE_KEY',
  robotId: 'WECHAT_MINI_CI_ROBOT_ID',
  version: 'WECHAT_MINI_CI_VERSION',
  desc: 'WECHAT_MINI_CI_DESC',
  projectPath: 'WECHAT_MINI_CI_PROJECT_PATH',
  enableLiveUpload: 'WECHAT_MINI_CI_ENABLE_LIVE_UPLOAD',
})

const DEFAULT_UPLOAD_SETTINGS = Object.freeze({
  es6: true,
  minify: true,
  autoPrefixWXSS: true,
  uploadWithSourceMap: false,
})

function normalizeValue(value) {
  return String(value || '').trim()
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function formatDisplayPath(targetPath, repoRoot) {
  if (!targetPath) {
    return ''
  }

  if (isPathInside(repoRoot, targetPath)) {
    return path.relative(repoRoot, targetPath).split(path.sep).join('/')
  }

  return targetPath
}

function createUploadGuidance(runtimeConfig, { dryRun }) {
  return [
    `Provide ${UPLOAD_ENV_KEYS.privateKeyPath} or ${UPLOAD_ENV_KEYS.privateKeyValue} with the WeChat code upload private key at runtime.`,
    `Provide ${UPLOAD_ENV_KEYS.robotId} with the operator robot slot number.`,
    `Provide ${UPLOAD_ENV_KEYS.version} with the Mini upload version (semver).`,
    `Provide ${UPLOAD_ENV_KEYS.desc} with the operator-facing upload description.`,
    `Keep local key files under ${runtimeConfig.operatorOverrides.uploadSecretsDirectory} (gitignored) or inject ${UPLOAD_ENV_KEYS.privateKeyValue} via the environment; no private key or token material belongs in versioned source.`,
    dryRun
      ? 'Rerun the same command after injecting the required inputs; --dry-run never performs a live upload.'
      : `Validate with --dry-run first, then set ${UPLOAD_ENV_KEYS.enableLiveUpload}=1 for an operator-controlled live upload attempt.`,
  ]
}

function resolvePrivateKeyInput({ env, cwd, repoRoot, runtimeConfig, errors }) {
  const inlinePrivateKey = normalizeValue(env[UPLOAD_ENV_KEYS.privateKeyValue])
  if (inlinePrivateKey) {
    return {
      sourceType: 'env',
      displayValue: `env:${UPLOAD_ENV_KEYS.privateKeyValue}`,
      inlineValue: inlinePrivateKey,
    }
  }

  const rawPrivateKeyPath = normalizeValue(env[UPLOAD_ENV_KEYS.privateKeyPath])
  if (!rawPrivateKeyPath) {
    errors.push(
      `Missing injected upload secret: provide ${UPLOAD_ENV_KEYS.privateKeyPath} or ${UPLOAD_ENV_KEYS.privateKeyValue}.`,
    )
    return null
  }

  const resolvedPrivateKeyPath = path.resolve(cwd, rawPrivateKeyPath)
  if (!fs.existsSync(resolvedPrivateKeyPath)) {
    errors.push(
      `Upload private key path ${rawPrivateKeyPath} does not exist. Keep local keys under ${runtimeConfig.operatorOverrides.uploadSecretsDirectory} or inject ${UPLOAD_ENV_KEYS.privateKeyValue}.`,
    )
    return null
  }

  const allowedSecretDirectory = path.resolve(repoRoot, runtimeConfig.operatorOverrides.uploadSecretsDirectory)
  if (isPathInside(repoRoot, resolvedPrivateKeyPath) && !isPathInside(allowedSecretDirectory, resolvedPrivateKeyPath)) {
    errors.push(
      `Upload private key path ${formatDisplayPath(resolvedPrivateKeyPath, repoRoot)} points inside versioned source. Keep private keys under ${runtimeConfig.operatorOverrides.uploadSecretsDirectory} or outside the repository.`,
    )
    return null
  }

  return {
    sourceType: 'path',
    displayValue: formatDisplayPath(resolvedPrivateKeyPath, repoRoot),
    resolvedPath: resolvedPrivateKeyPath,
  }
}

function resolveWechatCiUploadRequest({
  env = process.env,
  argv = [],
  cwd = path.resolve(__dirname, '..'),
  miniRoot = path.resolve(__dirname, '..'),
  repoRoot = path.resolve(miniRoot, '..'),
  runtimeConfig = getCheckedInRuntimeConfig(),
  packageVersion = packageJson.version,
} = {}) {
  const dryRun = argv.includes('--dry-run')
  const liveUploadEnabled = normalizeValue(env[UPLOAD_ENV_KEYS.enableLiveUpload]) === '1'
  const errors = []

  const resolvedProjectPath = path.resolve(
    cwd,
    normalizeValue(env[UPLOAD_ENV_KEYS.projectPath]) || '.',
  )
  if (!fs.existsSync(resolvedProjectPath) || !fs.statSync(resolvedProjectPath).isDirectory()) {
    errors.push(
      `Mini project path ${formatDisplayPath(resolvedProjectPath, repoRoot)} is not a readable directory.`,
    )
  }

  const privateKey = resolvePrivateKeyInput({
    env,
    cwd,
    repoRoot,
    runtimeConfig,
    errors,
  })

  const robotId = normalizeValue(env[UPLOAD_ENV_KEYS.robotId])
  if (!/^[1-9]\d*$/.test(robotId)) {
    errors.push(`Provide numeric ${UPLOAD_ENV_KEYS.robotId} so the operator upload slot is explicit.`)
  }

  const version = normalizeValue(env[UPLOAD_ENV_KEYS.version])
  if (!isSemver(version)) {
    errors.push(`Provide semver ${UPLOAD_ENV_KEYS.version}; package version ${packageVersion} is not auto-promoted into upload metadata.`)
  }

  const description = normalizeValue(env[UPLOAD_ENV_KEYS.desc])
  if (!description) {
    errors.push(`Provide non-empty ${UPLOAD_ENV_KEYS.desc} so the upload description stays operator-controlled.`)
  }

  const plan = {
    appId: runtimeConfig.appId,
    dryRun,
    liveUploadEnabled,
    command: `npm --prefix mini run upload:wechat${dryRun ? ' -- --dry-run' : ''}`,
    projectPath: formatDisplayPath(resolvedProjectPath, repoRoot),
    resolvedProjectPath,
    robotId,
    version,
    description,
    privateKeySource: privateKey ? privateKey.displayValue : `${UPLOAD_ENV_KEYS.privateKeyPath} or ${UPLOAD_ENV_KEYS.privateKeyValue}`,
    uploadSettings: DEFAULT_UPLOAD_SETTINGS,
    enableLiveUploadEnv: `${UPLOAD_ENV_KEYS.enableLiveUpload}=1`,
  }

  if (errors.length > 0) {
    return {
      ok: false,
      outcome: 'refused_missing_inputs',
      summary: 'miniprogram-ci scaffold requires injected operator secrets and inputs.',
      errors,
      guidance: createUploadGuidance(runtimeConfig, { dryRun }),
      plan,
      runtimeConfig,
      privateKey,
    }
  }

  if (!dryRun && !liveUploadEnabled) {
    return {
      ok: false,
      outcome: 'refused_live_upload_disabled',
      summary: 'The checked-in miniprogram-ci path stays scaffold-only until the operator explicitly enables a live upload.',
      errors: [
        `Non-dry-run upload is disabled by default. Set ${UPLOAD_ENV_KEYS.enableLiveUpload}=1 only in an operator-controlled environment after the secret gate passes.`,
      ],
      guidance: [
        'Use --dry-run first to verify the secret gate without performing upload work.',
        `When the operator is ready for a real attempt, rerun without --dry-run and set ${UPLOAD_ENV_KEYS.enableLiveUpload}=1.`,
      ],
      plan,
      runtimeConfig,
      privateKey,
    }
  }

  return {
    ok: true,
    outcome: dryRun ? 'dry_run' : 'ready_for_live_upload',
    summary: dryRun
      ? 'miniprogram-ci scaffold secret gate passed; no upload was attempted.'
      : 'miniprogram-ci scaffold secret gate passed and live upload is enabled.',
    guidance: dryRun
      ? [
          'This is dry-run evidence only; no upload was attempted.',
          `Keep private material local-only under ${runtimeConfig.operatorOverrides.uploadSecretsDirectory} or inject it via ${UPLOAD_ENV_KEYS.privateKeyValue}.`,
        ]
      : [],
    errors: [],
    plan,
    runtimeConfig,
    privateKey,
  }
}

function materializePrivateKey(privateKey) {
  if (!privateKey) {
    throw new Error('Cannot materialize a missing upload private key.')
  }

  if (privateKey.sourceType === 'path') {
    return {
      privateKeyPath: privateKey.resolvedPath,
      cleanup: () => {},
    }
  }

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tradingagents-mini-ci-'))
  const tempPrivateKeyPath = path.join(tempDirectory, 'code-upload.private.key')
  fs.writeFileSync(tempPrivateKeyPath, privateKey.inlineValue, { encoding: 'utf8', mode: 0o600 })

  return {
    privateKeyPath: tempPrivateKeyPath,
    cleanup: () => {
      fs.rmSync(tempDirectory, { recursive: true, force: true })
    },
  }
}

async function performLiveWechatCiUpload(request) {
  let miniprogramCi
  try {
    miniprogramCi = require('miniprogram-ci')
  } catch (error) {
    return {
      ...request,
      ok: false,
      outcome: 'refused_missing_dependency',
      summary: 'Live upload was enabled, but miniprogram-ci is not installed in this environment.',
      errors: [error instanceof Error ? error.message : String(error)],
      guidance: [
        'Install miniprogram-ci in the operator environment before attempting a live upload.',
        'Keep using --dry-run for source/build-first validation when the dependency or operator prerequisites are unavailable.',
      ],
    }
  }

  const materializedPrivateKey = materializePrivateKey(request.privateKey)
  try {
    const project = new miniprogramCi.Project({
      appid: request.plan.appId,
      type: 'miniProgram',
      projectPath: request.plan.resolvedProjectPath,
      privateKeyPath: materializedPrivateKey.privateKeyPath,
    })

    const uploadResult = await miniprogramCi.upload({
      project,
      version: request.plan.version,
      desc: request.plan.description,
      robot: Number(request.plan.robotId),
      setting: DEFAULT_UPLOAD_SETTINGS,
    })

    return {
      ...request,
      ok: true,
      outcome: 'uploaded',
      summary: 'miniprogram-ci upload completed.',
      uploadResult,
    }
  } catch (error) {
    return {
      ...request,
      ok: false,
      outcome: 'upload_failed',
      summary: 'miniprogram-ci upload failed after the secret gate passed.',
      errors: [error instanceof Error ? error.message : String(error)],
      guidance: [
        'Inspect the operator environment, AppID permissions, robot slot, IP allowlisting, and WeChat platform readiness before retrying.',
      ],
    }
  } finally {
    materializedPrivateKey.cleanup()
  }
}

async function runWechatCiUpload(options = {}) {
  const request = resolveWechatCiUploadRequest(options)
  if (!request.ok || request.plan.dryRun) {
    return request
  }

  return performLiveWechatCiUpload(request)
}

function formatWechatCiUploadReport(result) {
  const statusLabel = result.ok
    ? result.outcome === 'dry_run'
      ? 'DRY RUN READY'
      : result.outcome === 'uploaded'
        ? 'SUCCESS'
        : 'READY'
    : result.outcome === 'upload_failed'
      ? 'FAILED'
      : 'REFUSED'

  const lines = [
    `mini upload: ${statusLabel} — ${result.summary}`,
    'Checked-in upload scaffold: miniprogram-ci path with runtime-only secret injection and no committed credentials.',
    `AppID: ${result.plan.appId}`,
    `Project path: ${result.plan.projectPath}`,
    `Private key source: ${result.plan.privateKeySource}`,
    `Robot slot: ${result.plan.robotId || `(missing ${UPLOAD_ENV_KEYS.robotId})`}`,
    `Version: ${result.plan.version || `(missing ${UPLOAD_ENV_KEYS.version})`}`,
    `Description: ${result.plan.description || `(missing ${UPLOAD_ENV_KEYS.desc})`}`,
    `Mode: ${result.plan.dryRun ? '--dry-run' : 'live-upload-request'}`,
    `Live upload enable flag: ${result.plan.enableLiveUploadEnv}`,
    '',
    'Upload settings:',
    ...Object.entries(result.plan.uploadSettings).map(([key, value]) => `- ${key}: ${value}`),
  ]

  if (result.outcome === 'uploaded' && result.uploadResult) {
    lines.push('', `Upload response: ${JSON.stringify(result.uploadResult)}`)
  }

  if (!result.ok && Array.isArray(result.errors) && result.errors.length > 0) {
    lines.push('', 'Refusal / failure details:', ...result.errors.map((error) => `- ${error}`))
  }

  if (Array.isArray(result.guidance) && result.guidance.length > 0) {
    lines.push('', 'Actionable next steps:', ...result.guidance.map((item, index) => `${index + 1}. ${item}`))
  }

  return `${lines.join('\n')}\n`
}

module.exports = {
  DEFAULT_UPLOAD_SETTINGS,
  UPLOAD_ENV_KEYS,
  formatWechatCiUploadReport,
  resolveWechatCiUploadRequest,
  runWechatCiUpload,
}
