import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const miniRoot = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)

const { createReleaseHandoff, renderReleaseHandoffMarkdown } = require('../lib/release-handoff.js')
const {
  loadCheckedInManualUploadSnapshot,
  validateManualUploadReadiness,
} = require('../lib/manual-upload-preflight.js')

test('manual upload preflight command reports checked-in shell readiness while deferring runtime and upload work', () => {
  const result = spawnSync('node', ['scripts/preflight-manual-upload.mjs'], {
    cwd: miniRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /manual-upload shell readiness only/)
  assert.match(result.stdout, /Deferred operator\/runtime\/upload steps:/)
  assert.match(result.stdout, /mini\/config\/runtime\.local\.js/)
  assert.match(result.stdout, /mini\/project\.private\.config\.json/)
  assert.match(result.stdout, /mini\/upload-secrets\//)
  assert.match(result.stdout, /does not prove real WeChat runtime|不证明真实微信运行时/)
})

test('checked-in release handoff separates validated shell readiness from deferred operator steps and local-only secrets', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(miniRoot, 'package.json'), 'utf8'))
  const handoff = createReleaseHandoff({ packageVersion: packageJson.version })
  const markdown = renderReleaseHandoffMarkdown(handoff)

  assert.equal(handoff.truthBoundaryLabel, 'manual-upload shell readiness only')
  assert.ok(handoff.validatedNow.some((item) => item.includes('placeholder-preview')))
  assert.ok(handoff.deferredOperatorSteps.some((item) => item.includes('WeChat DevTools')))
  assert.ok(handoff.localOnlyPaths.includes('mini/config/runtime.local.js'))
  assert.ok(handoff.localOnlyPaths.includes('mini/project.private.config.json'))
  assert.ok(handoff.localOnlyPaths.includes('mini/upload-secrets/'))
  assert.match(markdown, /## Validated in this repo/)
  assert.match(markdown, /## Deferred operator\/runtime\/upload steps/)
  assert.match(markdown, /## Keep local-only and untracked/)
  assert.match(markdown, /mini\/upload-secrets\/code-upload\.private\.key/)
})

test('manual upload preflight fails closed on illegal checked-in config', () => {
  const snapshot = loadCheckedInManualUploadSnapshot()
  const brokenResult = validateManualUploadReadiness({
    ...snapshot,
    packageJson: {
      ...snapshot.packageJson,
      version: 'preview',
      scripts: { ...snapshot.packageJson.scripts, preflight: 'node ./scripts/not-preflight.mjs' },
    },
    projectConfig: {
      ...snapshot.projectConfig,
      appid: '',
      compileType: 'plugin',
      miniprogramRoot: 'src',
      srcMiniprogramRoot: 'src',
      setting: { ...snapshot.projectConfig.setting, ignoreUploadUnusedFiles: false },
    },
    runtimeConfig: {
      ...snapshot.runtimeConfig,
      appId: '',
      backend: {
        ...snapshot.runtimeConfig.backend,
        mode: 'operator-runtime',
        baseUrl: 'http://127.0.0.1:8001',
      },
    },
    gitignoreText: '',
  })

  assert.equal(brokenResult.ok, false)
  assert.match(brokenResult.errors.join('\n'), /AppID/)
  assert.match(brokenResult.errors.join('\n'), /placeholder-preview mode/)
  assert.match(brokenResult.errors.join('\n'), /semver version/)
  assert.match(brokenResult.errors.join('\n'), /local-only and untracked/)
})
