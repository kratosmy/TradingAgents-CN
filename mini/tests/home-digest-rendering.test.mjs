import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  createMemoryStorage,
  createMiniAuthSessionBoundary,
  persistSession,
} = require('../lib/auth-session-boundary.js')
const { createMiniHomeController, selectCompactDigestCards } = require('../lib/home-controller.js')
const { buildHomeSurfaceState } = require('../lib/shell-surface-state.js')
const homePageModulePath = require.resolve('../pages/home/index.js')

function createSession() {
  return {
    accessToken: 'access-token-1',
    refreshToken: 'refresh-token-1',
    expiresIn: 3600,
    tokenType: 'bearer',
    user: {
      id: 'user-1',
      username: 'mini-user',
    },
    savedAt: '2026-04-20T08:00:00.000Z',
  }
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data))
}

function loadHomePageDefinition({ wxLike } = {}) {
  delete require.cache[homePageModulePath]

  const previousPage = globalThis.Page
  const previousWx = globalThis.wx
  const previousGetApp = globalThis.getApp
  let pageDefinition = null

  globalThis.Page = (definition) => {
    pageDefinition = definition
    return definition
  }
  globalThis.wx = wxLike || createMemoryStorage()
  globalThis.getApp = () => ({
    globalData: {
      apiBaseUrl: 'https://mini-runtime-placeholder.invalid',
      runtimeConfig: null,
    },
  })

  try {
    require(homePageModulePath)
  } finally {
    delete require.cache[homePageModulePath]

    if (previousPage === undefined) {
      delete globalThis.Page
    } else {
      globalThis.Page = previousPage
    }

    if (previousWx === undefined) {
      delete globalThis.wx
    } else {
      globalThis.wx = previousWx
    }

    if (previousGetApp === undefined) {
      delete globalThis.getApp
    } else {
      globalThis.getApp = previousGetApp
    }
  }

  assert.ok(pageDefinition, 'Home page definition should register through Page()')
  return pageDefinition
}

function createPageInstance(pageDefinition) {
  return {
    ...pageDefinition,
    data: cloneData(pageDefinition.data),
    setData(nextData) {
      this.data = {
        ...this.data,
        ...nextData,
      }
    },
  }
}

test('selectCompactDigestCards keeps one canonical card per stock_code and strips non-compact fields', () => {
  const cards = selectCompactDigestCards([
    {
      stock_code: '600519',
      stock_name: '贵州茅台',
      market: 'A股',
      board: '主板',
      exchange: 'SSE',
      current_price: 1679.0,
      change_percent: '+0.92%',
      digest_status: 'pending',
      summary: 'newer pending placeholder must not replace ready digest',
      risk_level: '等待解读',
      rule_status: 'active',
      task_status: 'waiting',
      task_id: 'task-older',
      updated_at: '2026-04-20T15:48:00+08:00',
      task_updated_at: '2026-04-20T15:48:00+08:00',
      symbol: 'MOUTAI',
      report_body: 'heavy body',
      browser_route_context: '/watch/600519',
    },
    {
      stock_code: '600519',
      stock_name: '贵州茅台',
      market: 'A股',
      board: '主板',
      exchange: 'SSE',
      current_price: 1688.5,
      change_percent: '+1.82%',
      digest_status: 'ready',
      summary: 'newer ready digest',
      risk_level: '低风险',
      rule_status: 'active',
      task_status: 'completed',
      task_id: 'task-ready',
      updated_at: '2026-04-20T15:45:00+08:00',
      task_updated_at: '2026-04-20T15:45:00+08:00',
      report_html: '<p>not needed</p>',
    },
    {
      stock_code: '000001',
      stock_name: '平安银行',
      market: 'A股',
      board: '主板',
      exchange: 'SZSE',
      current_price: 11.18,
      change_percent: '+0.22%',
      digest_status: 'pending',
      summary: 'older placeholder should yield to the fresher waiting-state card',
      risk_level: '等待解读',
      rule_status: 'pending',
      task_status: 'queued',
      task_id: 'task-waiting-older',
      updated_at: '2026-04-20T15:38:00+08:00',
      task_updated_at: '2026-04-20T15:38:00+08:00',
    },
    {
      stock_code: '000001',
      stock_name: '平安银行',
      market: 'A股',
      board: '主板',
      exchange: 'SZSE',
      current_price: 11.28,
      change_percent: '+0.43%',
      digest_status: 'pending',
      summary: 'placeholder still visible',
      risk_level: '等待解读',
      rule_status: 'pending',
      task_status: 'waiting',
      task_id: 'task-waiting',
      updated_at: '2026-04-20T15:40:00+08:00',
      task_updated_at: '2026-04-20T15:40:00+08:00',
      symbol: 'PAYH',
    },
  ])

  assert.equal(cards.length, 2)
  assert.deepEqual(
    cards.map((card) => card.stock_code),
    ['600519', '000001'],
  )
  assert.equal(cards[0].summary, 'newer ready digest')
  assert.equal(cards[0].digest_status, 'ready')
  assert.equal(cards[1].digest_status, 'pending')
  assert.equal(cards[1].summary, 'placeholder still visible')
  assert.equal(cards[1].task_status, 'waiting')
  assert.ok(!Object.hasOwn(cards[0], 'symbol'))
  assert.ok(!Object.hasOwn(cards[0], 'report_body'))
  assert.ok(!Object.hasOwn(cards[0], 'browser_route_context'))
})

test('authenticated Mini home state renders deduped digest cards and preserves placeholder waiting cards', async () => {
  const storage = createMemoryStorage()
  persistSession(storage, createSession())

  const controller = createMiniHomeController({
    authBoundary: createMiniAuthSessionBoundary({
      baseUrl: 'http://localhost:8001',
      storage,
      request: async () => ({
        statusCode: 200,
        data: {
          success: true,
          data: [
            {
              stock_code: '600519',
              stock_name: '贵州茅台',
              market: 'A股',
              board: '主板',
              exchange: 'SSE',
              current_price: 1679.0,
              change_percent: '+0.92%',
              digest_status: 'pending',
              summary: 'newer pending placeholder must not replace ready digest',
              risk_level: '等待解读',
              rule_status: 'active',
              task_status: 'waiting',
              task_id: 'task-older',
              updated_at: '2026-04-20T15:48:00+08:00',
              task_updated_at: '2026-04-20T15:48:00+08:00',
            },
            {
              stock_code: '600519',
              stock_name: '贵州茅台',
              market: 'A股',
              board: '主板',
              exchange: 'SSE',
              current_price: 1688.5,
              change_percent: '+1.82%',
              digest_status: 'ready',
              summary: 'newer ready digest',
              risk_level: '低风险',
              rule_status: 'active',
              task_status: 'completed',
              task_id: 'task-ready',
              updated_at: '2026-04-20T15:45:00+08:00',
              task_updated_at: '2026-04-20T15:45:00+08:00',
            },
            {
              stock_code: '000001',
              stock_name: '平安银行',
              market: 'A股',
              board: '主板',
              exchange: 'SZSE',
              current_price: 11.18,
              change_percent: '+0.22%',
              digest_status: 'pending',
              summary: 'older placeholder should yield to the fresher waiting-state card',
              risk_level: '等待解读',
              rule_status: 'pending',
              task_status: 'queued',
              task_id: 'task-waiting-older',
              updated_at: '2026-04-20T15:38:00+08:00',
              task_updated_at: '2026-04-20T15:38:00+08:00',
            },
            {
              stock_code: '000001',
              stock_name: '平安银行',
              market: 'A股',
              board: '主板',
              exchange: 'SZSE',
              current_price: 11.28,
              change_percent: '+0.43%',
              digest_status: 'pending',
              summary: 'placeholder still visible',
              risk_level: '等待解读',
              rule_status: 'pending',
              task_status: 'waiting',
              task_id: 'task-waiting',
              updated_at: '2026-04-20T15:40:00+08:00',
              task_updated_at: '2026-04-20T15:40:00+08:00',
            },
          ],
        },
      }),
    }),
  })

  const state = await controller.hydrate()

  assert.equal(state.authState, 'authenticated')
  assert.equal(state.rawPayloadCount, 4)
  assert.equal(state.monitoredCount, 2)
  assert.equal(state.dedupedCount, 2)
  assert.equal(state.placeholderCount, 1)
  assert.equal(state.cards[0].stockCode, '600519')
  assert.equal(state.cards[0].summary, 'newer ready digest')
  assert.equal(state.cards[1].stockCode, '000001')
  assert.equal(state.cards[1].digestStatus, 'pending')
  assert.equal(state.cards[1].summary, 'placeholder still visible')
  assert.equal(state.cards[1].taskStatus, 'waiting')
  assert.match(state.renderedStockCodes, /600519/)
  assert.match(state.renderedStockCodes, /000001/)
})

test('Watch controller keeps loading, auth-required, authenticated-empty, waiting, and ready states distinct', async () => {
  const missingSessionController = createMiniHomeController({
    authBoundary: createMiniAuthSessionBoundary({
      baseUrl: 'https://mini-runtime-placeholder.invalid',
      storage: createMemoryStorage(),
      request: async () => ({
        statusCode: 401,
        data: { detail: 'Invalid token' },
      }),
    }),
  })

  assert.equal(missingSessionController.getState().watchState, 'loading')

  const authRequiredState = await missingSessionController.hydrate()
  assert.equal(authRequiredState.watchState, 'auth-required')
  assert.equal(authRequiredState.cards.length, 0)

  const emptyStorage = createMemoryStorage()
  persistSession(emptyStorage, createSession())
  const authenticatedEmptyController = createMiniHomeController({
    authBoundary: createMiniAuthSessionBoundary({
      baseUrl: 'https://mini-runtime-placeholder.invalid',
      storage: emptyStorage,
      request: async () => ({
        statusCode: 200,
        data: {
          success: true,
          data: [],
        },
      }),
    }),
  })

  const authenticatedEmptyState = await authenticatedEmptyController.hydrate()
  assert.equal(authenticatedEmptyState.watchState, 'authenticated-empty')
  assert.equal(authenticatedEmptyState.authState, 'authenticated')
  assert.equal(authenticatedEmptyState.cards.length, 0)

  const waitingStorage = createMemoryStorage()
  persistSession(waitingStorage, createSession())
  const waitingController = createMiniHomeController({
    authBoundary: createMiniAuthSessionBoundary({
      baseUrl: 'https://mini-runtime-placeholder.invalid',
      storage: waitingStorage,
      request: async () => ({
        statusCode: 200,
        data: {
          success: true,
          data: [
            {
              stock_code: '000001',
              stock_name: '平安银行',
              market: 'A股',
              board: '主板',
              exchange: 'SZSE',
              current_price: 11.28,
              change_percent: '+0.43%',
              digest_status: 'pending',
              summary: 'placeholder still visible',
              risk_level: '等待解读',
              rule_status: 'pending',
              task_status: 'waiting',
              task_id: 'task-waiting',
              updated_at: '2026-04-20T15:40:00+08:00',
              task_updated_at: '2026-04-20T15:40:00+08:00',
            },
          ],
        },
      }),
    }),
  })

  const waitingState = await waitingController.hydrate()
  assert.equal(waitingState.watchState, 'waiting')
  assert.equal(waitingState.placeholderCount, 1)
  assert.equal(waitingState.cards.length, 1)

  const readyStorage = createMemoryStorage()
  persistSession(readyStorage, createSession())
  const readyController = createMiniHomeController({
    authBoundary: createMiniAuthSessionBoundary({
      baseUrl: 'https://mini-runtime-placeholder.invalid',
      storage: readyStorage,
      request: async () => ({
        statusCode: 200,
        data: {
          success: true,
          data: [
            {
              stock_code: '600519',
              stock_name: '贵州茅台',
              market: 'A股',
              board: '主板',
              exchange: 'SSE',
              current_price: 1688.5,
              change_percent: '+1.82%',
              digest_status: 'ready',
              summary: 'newer ready digest',
              risk_level: '低风险',
              rule_status: 'active',
              task_status: 'completed',
              task_id: 'task-ready',
              updated_at: '2026-04-20T15:45:00+08:00',
              task_updated_at: '2026-04-20T15:45:00+08:00',
            },
          ],
        },
      }),
    }),
  })

  const readyState = await readyController.hydrate()
  assert.equal(readyState.watchState, 'ready')
  assert.equal(readyState.cards.length, 1)
  assert.equal(readyState.placeholderCount, 0)
})

test('Home page refreshOverview immediately enters a signed-in loading posture before loadDigests resolves', async () => {
  const session = createSession()
  const pageDefinition = loadHomePageDefinition()
  const page = createPageInstance(pageDefinition)

  page.previewMeta = {
    runtimeBoundary: {
      mode: 'placeholder-preview',
      baseUrl: 'https://mini-runtime-placeholder.invalid',
      disclosure: 'Local preview only.',
    },
  }
  page.data = buildHomeSurfaceState({
    previewMeta: page.previewMeta,
  })

  let resolveDigest
  const digestPromise = new Promise((resolve) => {
    resolveDigest = resolve
  })

  page.authBoundary = {
    getSession() {
      return session
    },
    loadDigests() {
      return digestPromise
    },
  }

  assert.equal(page.data.homeState, 'signed-out')

  const pendingRefresh = page.refreshOverview()

  assert.equal(page.data.homeState, 'authenticated-loading')
  assert.equal(page.data.overviewHeadline, 'Signed in as mini-user')
  assert.match(page.data.overviewCopy, /refreshes the Watch overview|refreshing/i)
  assert.equal(page.data.sessionUserLabel, 'mini-user · user-1')

  resolveDigest({
    ok: true,
    cards: [],
    session,
  })
  await pendingRefresh

  assert.equal(page.data.homeState, 'authenticated-empty')
  assert.equal(page.data.overviewHeadline, 'Signed in as mini-user')
})

test('Home overview keeps authenticated-empty and authenticated-error states signed in and distinct from signed-out copy', () => {
  const session = createSession()
  const signedOutState = buildHomeSurfaceState()

  const authenticatedEmptyState = buildHomeSurfaceState({
    session,
    digestResult: {
      ok: true,
      cards: [],
      session,
    },
  })

  assert.equal(authenticatedEmptyState.overviewHeadline, 'Signed in as mini-user')
  assert.notEqual(authenticatedEmptyState.overviewCopy, signedOutState.overviewCopy)
  assert.match(authenticatedEmptyState.overviewCopy, /zero protected digest cards|已登录/i)
  assert.equal(authenticatedEmptyState.featuredBadgeLabel, 'authenticated empty')
  assert.equal(authenticatedEmptyState.sessionUserLabel, 'mini-user · user-1')
  assert.deepEqual(
    authenticatedEmptyState.overviewMetrics.map((metric) => metric.value),
    ['0', '0', '0', '0'],
  )
  assert.match(authenticatedEmptyState.highlightCopy, /authenticated-empty|零张|zero/i)
  assert.match(authenticatedEmptyState.emptyStateCopy, /已登录|authenticated-empty/i)

  const authenticatedErrorState = buildHomeSurfaceState({
    session,
    digestResult: {
      ok: false,
      authRequired: false,
      code: 'digest_read_failed',
      cards: [],
    },
  })

  assert.equal(authenticatedErrorState.overviewHeadline, 'Signed in as mini-user')
  assert.notEqual(authenticatedErrorState.overviewCopy, signedOutState.overviewCopy)
  assert.match(authenticatedErrorState.overviewCopy, /temporarily unavailable|暂时不可用/i)
  assert.equal(authenticatedErrorState.featuredBadgeLabel, 'watch unavailable')
  assert.equal(authenticatedErrorState.sessionUserLabel, 'mini-user · user-1')
  assert.deepEqual(
    authenticatedErrorState.overviewMetrics.map((metric) => metric.value),
    ['—', 'Retry', '—', 'Session'],
  )
  assert.match(authenticatedErrorState.highlightCopy, /temporary digest read failure|temporarily unavailable|暂时不可用/i)
  assert.match(authenticatedErrorState.emptyStateCopy, /不会伪造|temporarily unavailable|重新尝试/i)
})
