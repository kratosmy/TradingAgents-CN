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
