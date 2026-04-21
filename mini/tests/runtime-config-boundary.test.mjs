import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const miniRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(miniRoot, '..')
const runtimeLocalPath = path.join(miniRoot, 'config/runtime.local.js')
const require = createRequire(import.meta.url)
const runtimeConfigModulePath = require.resolve('../lib/runtime-config.js')

const runtimeConfigModule = require('../lib/runtime-config.js')
const previewMeta = require('../data/digest-cards.js')

function clearRuntimeConfigModuleCache() {
  delete require.cache[runtimeConfigModulePath]
  delete require.cache[runtimeLocalPath]
}

function loadFreshRuntimeConfigModule() {
  clearRuntimeConfigModuleCache()
  return require('../lib/runtime-config.js')
}

test('checked-in runtime config preserves AppID and a non-loopback placeholder target', () => {
  const runtimeConfig = runtimeConfigModule.getCheckedInRuntimeConfig()

  assert.equal(runtimeConfig.appId, 'wx1d02a932c4f9a4ae')
  assert.equal(runtimeConfig.backend.mode, 'placeholder-preview')
  assert.equal(runtimeConfigModule.isLoopbackUrl(runtimeConfig.backend.baseUrl), false)
  assert.match(runtimeConfig.backend.baseUrl, /^https:\/\//)
  assert.match(runtimeConfig.backend.baseUrl, /\.invalid(?:\/|$)/)
})

test('operator overrides can swap runtime targets without changing shared shell metadata', () => {
  const runtimeConfig = runtimeConfigModule.createRuntimeConfig({
    operatorOverrides: {
      backend: {
        mode: 'operator-runtime',
        baseUrl: 'https://mini-runtime.example.com',
      },
    },
  })

  assert.equal(runtimeConfig.backend.mode, 'operator-runtime')
  assert.equal(runtimeConfig.backend.baseUrl, 'https://mini-runtime.example.com')
  assert.equal(runtimeConfig.appId, 'wx1d02a932c4f9a4ae')
  assert.match(runtimeConfig.shell.projectName, /TradingAgentsMini/i)
})

test(
  'broken local override dependency failures surface instead of falling back to placeholder defaults',
  { concurrency: false },
  () => {
    const originalRuntimeLocalExists = fs.existsSync(runtimeLocalPath)
    const originalRuntimeLocalText = originalRuntimeLocalExists
      ? fs.readFileSync(runtimeLocalPath, 'utf8')
      : null

    try {
      fs.writeFileSync(
        runtimeLocalPath,
        "module.exports = require('./runtime.local.missing-dependency.js')\n",
        'utf8',
      )

      assert.throws(() => loadFreshRuntimeConfigModule(), (error) => {
        assert.equal(error.code, 'MODULE_NOT_FOUND')
        assert.match(String(error.message || ''), /runtime\.local\.missing-dependency\.js/)
        return true
      })
    } finally {
      if (originalRuntimeLocalExists) {
        fs.writeFileSync(runtimeLocalPath, originalRuntimeLocalText, 'utf8')
      } else {
        fs.rmSync(runtimeLocalPath, { force: true })
      }

      clearRuntimeConfigModuleCache()
    }
  },
)

test('loopback detection rejects full 127.0.0.0/8 and bracketed IPv6 spellings', () => {
  for (const url of [
    'https://127.0.0.2',
    'https://127.255.255.255',
    'https://[::1]',
    'https://[0:0:0:0:0:0:0:1]',
  ]) {
    assert.equal(
      runtimeConfigModule.isLoopbackUrl(url),
      true,
      `${url} should be rejected as a loopback runtime target`,
    )
  }

  assert.equal(runtimeConfigModule.isLoopbackUrl('https://126.255.255.255'), false)
  assert.equal(runtimeConfigModule.isLoopbackUrl('https://mini-runtime.example.com'), false)
})

test('publish-facing shell metadata replaces local-validation framing while keeping honesty copy', () => {
  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(miniRoot, 'project.config.json'), 'utf8'),
  )
  const appConfig = JSON.parse(fs.readFileSync(path.join(miniRoot, 'app.json'), 'utf8'))
  const pageConfig = JSON.parse(
    fs.readFileSync(path.join(miniRoot, 'pages/home/index.json'), 'utf8'),
  )

  assert.equal(projectConfig.appid, 'wx1d02a932c4f9a4ae')
  assert.doesNotMatch(projectConfig.projectname, /LocalValidation/)
  assert.doesNotMatch(pageConfig.navigationBarTitleText, /本地验证/)
  assert.match(appConfig.window.navigationBarTitleText, /TradingAgents/)
  assert.match(previewMeta.hero.title, /TradingAgents/i)
  assert.match(previewMeta.runtimeBoundary.mode, /placeholder-preview/)
  assert.match(previewMeta.localOnlyDisclosure, /不代表真实微信.*运行时/)
})

test('operator-private runtime overrides stay outside versioned source', () => {
  const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8')

  assert.match(gitignore, /mini\/project\.private\.config\.json/)
  assert.match(gitignore, /mini\/config\/runtime\.local\.js/)
  assert.equal(previewMeta.runtimeBoundary.localOverridePath, 'mini/config/runtime.local.js')
})
