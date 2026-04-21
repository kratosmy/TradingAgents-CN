import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const miniRoot = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)
const { runWechatCiUpload } = require('../lib/wechat-ci-upload.js')

const CLEARED_UPLOAD_ENV = {
  WECHAT_MINI_CI_PRIVATE_KEY_PATH: '',
  WECHAT_MINI_CI_PRIVATE_KEY: '',
  WECHAT_MINI_CI_ROBOT_ID: '',
  WECHAT_MINI_CI_VERSION: '',
  WECHAT_MINI_CI_DESC: '',
  WECHAT_MINI_CI_PROJECT_PATH: '',
  WECHAT_MINI_CI_ENABLE_LIVE_UPLOAD: '',
}

function runUpload(args = ['--dry-run'], envOverrides = {}) {
  return spawnSync('node', ['scripts/upload-wechat.mjs', ...args], {
    cwd: miniRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...CLEARED_UPLOAD_ENV,
      ...envOverrides,
    },
  })
}

function readMiniJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(miniRoot, relativePath), 'utf8'))
}

test('mini package manifest and lockfile declare miniprogram-ci for clean installs', () => {
  const packageJson = readMiniJson('package.json')
  const packageLock = readMiniJson('package-lock.json')
  const declaredRange = packageJson.dependencies?.['miniprogram-ci']

  assert.equal(typeof declaredRange, 'string')
  assert.notEqual(declaredRange.length, 0)
  assert.equal(packageLock.packages?.['']?.dependencies?.['miniprogram-ci'], declaredRange)
  assert.equal(typeof packageLock.packages?.['node_modules/miniprogram-ci']?.version, 'string')
})

test('upload scaffold refuses to proceed without injected secrets and operator inputs', () => {
  const result = runUpload(['--dry-run'])

  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /mini upload: REFUSED/)
  assert.match(result.stdout, /WECHAT_MINI_CI_PRIVATE_KEY_PATH/)
  assert.match(result.stdout, /WECHAT_MINI_CI_PRIVATE_KEY/)
  assert.match(result.stdout, /WECHAT_MINI_CI_ROBOT_ID/)
  assert.match(result.stdout, /WECHAT_MINI_CI_VERSION/)
  assert.match(result.stdout, /WECHAT_MINI_CI_DESC/)
  assert.match(result.stdout, /mini\/upload-secrets\//)
})

test('upload scaffold supports env-injected private key material during dry run without echoing the secret', () => {
  const inlinePrivateKey = '-----BEGIN PRIVATE KEY-----\nTOPSECRET-CI-KEY\n-----END PRIVATE KEY-----\n'
  const result = runUpload(['--dry-run'], {
    WECHAT_MINI_CI_PRIVATE_KEY: inlinePrivateKey,
    WECHAT_MINI_CI_ROBOT_ID: '1',
    WECHAT_MINI_CI_VERSION: '0.1.0',
    WECHAT_MINI_CI_DESC: 'scaffold dry run',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /mini upload: DRY RUN READY/)
  assert.match(result.stdout, /env:WECHAT_MINI_CI_PRIVATE_KEY/)
  assert.match(result.stdout, /wx1d02a932c4f9a4ae/)
  assert.match(result.stdout, /scaffold dry run/)
  assert.doesNotMatch(result.stdout + result.stderr, /TOPSECRET-CI-KEY/)
})

test('upload scaffold refuses private key paths that live inside versioned source', () => {
  const result = runUpload(['--dry-run'], {
    WECHAT_MINI_CI_PRIVATE_KEY_PATH: './app.js',
    WECHAT_MINI_CI_ROBOT_ID: '1',
    WECHAT_MINI_CI_VERSION: '0.1.0',
    WECHAT_MINI_CI_DESC: 'scaffold dry run',
  })

  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /versioned source/)
  assert.match(result.stdout, /mini\/upload-secrets\//)
})

test('non-dry-run upload stays gated until the operator explicitly enables live upload', () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tradingagents-mini-upload-test-'))
  const privateKeyPath = path.join(tempDirectory, 'code-upload.private.key')
  fs.writeFileSync(privateKeyPath, 'not-a-real-private-key', 'utf8')

  try {
    const result = runUpload([], {
      WECHAT_MINI_CI_PRIVATE_KEY_PATH: privateKeyPath,
      WECHAT_MINI_CI_ROBOT_ID: '1',
      WECHAT_MINI_CI_VERSION: '0.1.0',
      WECHAT_MINI_CI_DESC: 'live gate test',
    })

    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stdout, /WECHAT_MINI_CI_ENABLE_LIVE_UPLOAD=1/)
    assert.match(result.stdout, /scaffold-only/)
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true })
  }
})

test('live-enabled upload path reaches miniprogram-ci once secrets and metadata are injected', async () => {
  const projectCalls = []
  const uploadCalls = []
  const fakeMiniprogramCi = {
    Project: class Project {
      constructor(options) {
        projectCalls.push(options)
      }
    },
    upload: async (options) => {
      uploadCalls.push(options)
      return { ok: true }
    },
  }

  const result = await runWechatCiUpload({
    env: {
      ...process.env,
      ...CLEARED_UPLOAD_ENV,
      WECHAT_MINI_CI_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nSIMULATED-PRIVATE-KEY\n-----END PRIVATE KEY-----\n',
      WECHAT_MINI_CI_ROBOT_ID: '1',
      WECHAT_MINI_CI_VERSION: '0.1.0',
      WECHAT_MINI_CI_DESC: 'live activation path',
      WECHAT_MINI_CI_ENABLE_LIVE_UPLOAD: '1',
    },
    argv: [],
    cwd: miniRoot,
    loadMiniprogramCi: () => fakeMiniprogramCi,
  })

  assert.equal(result.ok, true)
  assert.equal(result.outcome, 'uploaded')
  assert.equal(projectCalls.length, 1)
  assert.equal(projectCalls[0].appid, 'wx1d02a932c4f9a4ae')
  assert.equal(projectCalls[0].projectPath, miniRoot)
  assert.equal(uploadCalls.length, 1)
  assert.equal(uploadCalls[0].version, '0.1.0')
  assert.equal(uploadCalls[0].desc, 'live activation path')
  assert.equal(uploadCalls[0].robot, 1)
})
