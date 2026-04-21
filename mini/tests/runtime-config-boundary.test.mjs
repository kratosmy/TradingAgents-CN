import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const miniRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(miniRoot, '..')
const require = createRequire(import.meta.url)

const runtimeConfigModule = require('../lib/runtime-config.js')
const previewMeta = require('../data/digest-cards.js')

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
