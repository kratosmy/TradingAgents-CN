import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const runtimeSettings = require('../services/runtime-settings.js')
const request = require('../services/request.js')
const watch = require('../services/watch.js')
const auth = require('../services/auth.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const parseJson = (relativePath) => {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'))
}

const compileScript = (relativePath) => {
  const source = readFileSync(path.join(rootDir, relativePath), 'utf8')
  new vm.Script(source, { filename: relativePath })
}

const appConfig = parseJson('app.json')
assert.deepEqual(appConfig.pages, [
  'pages/auth/index',
  'pages/watch/index',
  'pages/favorite-form/index',
  'pages/rule-form/index',
  'pages/settings/index',
])

parseJson('pages/auth/index.json')
parseJson('pages/watch/index.json')
parseJson('pages/favorite-form/index.json')
parseJson('pages/rule-form/index.json')
parseJson('pages/settings/index.json')
parseJson('project.config.json')
parseJson('sitemap.json')

compileScript('app.js')
compileScript('pages/auth/index.js')
compileScript('pages/watch/index.js')
compileScript('pages/favorite-form/index.js')
compileScript('pages/rule-form/index.js')
compileScript('pages/settings/index.js')

const defaultSettings = runtimeSettings.mergeRuntimeSettings()
assert.equal(defaultSettings.apiBaseUrl, 'http://localhost:8001')
assert.equal(runtimeSettings.isRuntimeConfigured(defaultSettings), false)

assert.throws(() => {
  request.buildRequestOptions({
    path: '/api/watch/digests',
    settings: defaultSettings,
  })
}, /访问令牌/)

const requestOptions = request.buildRequestOptions({
  path: '/api/watch/digests',
  settings: {
    apiBaseUrl: 'https://api.example.com/',
    accessToken: 'jwt-token',
    language: 'zh-CN',
  },
})

assert.equal(requestOptions.url, 'https://api.example.com/api/watch/digests')
assert.equal(requestOptions.header.Authorization, 'Bearer jwt-token')
assert.equal(requestOptions.header['Accept-Language'], 'zh-CN')

const loginRequestOptions = request.buildRequestOptions({
  path: '/api/auth/wechat/login',
  method: 'POST',
  data: { code: 'placeholder-code' },
  skipAuth: true,
  settings: {
    apiBaseUrl: 'https://api.example.com/',
    accessToken: 'paste-your-jwt-access-token-here',
    language: 'zh-CN',
  },
})

assert.equal(loginRequestOptions.url, 'https://api.example.com/api/auth/wechat/login')
assert.equal(loginRequestOptions.header.Authorization, undefined)

const profilePayload = auth.buildProfilePayload({
  nickName: 'Mini 用户',
  avatarUrl: 'https://example.com/avatar.png',
})
assert.deepEqual(profilePayload, {
  nickname: 'Mini 用户',
  avatar_url: 'https://example.com/avatar.png',
})

const savedLoginSettings = auth.applyLoginResponse(
  {
    data: {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      user: { id: 'user-1', username: 'wx_user' },
    },
  },
  {
    apiBaseUrl: 'https://api.example.com',
    language: 'zh-CN',
  },
)

assert.equal(savedLoginSettings.accessToken, 'new-access-token')
assert.equal(savedLoginSettings.refreshToken, 'new-refresh-token')
assert.deepEqual(savedLoginSettings.user, { id: 'user-1', username: 'wx_user' })

const compactDigestCards = [
  {
    stock_code: '000001',
    stock_name: '平安银行',
    market: 'A股',
    tags: ['银行'],
    notes: '等下一次财报',
    summary: '',
    schedule_label: '盘中播报',
    rule_status: 'inactive',
  },
  {
    stock_code: '600519',
    stock_name: '贵州茅台',
    market: 'A股',
    current_price: 1710.52,
    change_percent: 1.23,
    tags: ['白马'],
    notes: '核心观察',
    summary: '景气度稳定，等待下一次财报催化。',
    risk_level: '低风险',
    schedule_type: 'daily_post_market',
    schedule_summary: '每天盘后',
    rule_status: 'active',
    updated_at: '2026-04-24T08:00:00+08:00',
  },
]

const cards = watch.buildWatchHomeCards(compactDigestCards)

assert.equal(cards.length, 2)
assert.equal(cards[0].stockCode, '600519')
assert.equal(cards[0].scheduleText, '每天盘后')
assert.equal(cards[0].scheduleType, 'daily_post_market')
assert.equal(cards[0].ruleStatus, 'active')
assert.equal(cards[0].ruleStatusText, '策略生效中')
assert.equal(cards[0].riskTone, 'badge--success')
assert.equal(cards[0].changeText, '+1.23%')
assert.equal(cards[0].tagsText, '白马')
assert.equal(cards[0].notesText, '核心观察')
assert.equal(cards[1].stockCode, '000001')
assert.equal(cards[1].scheduleText, '盘中播报')
assert.equal(cards[1].summaryText, watch.DEFAULT_SUMMARY)
assert.equal(cards[1].tagsText, '银行')

const requestedUrls = []
globalThis.wx = {
  request(options) {
    requestedUrls.push(options.url)
    options.success({
      statusCode: 200,
      data: {
        success: true,
        data: compactDigestCards,
        message: 'ok',
      },
    })
  },
}

const watchHomeData = await watch.loadWatchHomeData({
  apiBaseUrl: 'https://api.example.com',
  accessToken: 'jwt-token',
  language: 'zh-CN',
})

assert.deepEqual(requestedUrls, ['https://api.example.com/api/watch/digests'])
assert.equal(watchHomeData.cards.length, 2)
assert.equal(watchHomeData.cards[0].stockCode, '600519')
delete globalThis.wx

assert.deepEqual(watch.buildFavoritePayload({
  stockCode: ' 600519 ',
  stockName: '贵州茅台',
  market: 'A股',
  tags: ['白马', ''],
  notes: '核心观察',
}), {
  stock_code: '600519',
  stock_name: '贵州茅台',
  market: 'A股',
  tags: ['白马'],
  notes: '核心观察',
})

assert.deepEqual(watch.buildRulePayload({
  stockName: '贵州茅台',
  market: 'A股',
  scheduleType: 'weekly_review',
  cronExpr: '0 18 * * 5',
  status: 'paused',
}), {
  stock_name: '贵州茅台',
  market: 'A股',
  schedule_type: 'weekly_review',
  cron_expr: null,
  status: 'paused',
})

console.log('Mini validation passed')
