import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  createMemoryStorage,
  createMiniAuthSessionBoundary,
  SESSION_STORAGE_KEY,
} = require('../lib/auth-session-boundary.js')
const { createMiniHomeController } = require('../lib/home-controller.js')

function createSuccessEnvelope(overrides = {}) {
  return {
    success: true,
    data: {
      access_token: 'access-token-1',
      refresh_token: 'refresh-token-1',
      expires_in: 3600,
      user: {
        id: 'user-1',
        username: 'mini-user',
      },
      ...overrides,
    },
  }
}

test('successful login persists the bearer session fields needed for protected reads', async () => {
  const requests = []
  const storage = createMemoryStorage()
  const boundary = createMiniAuthSessionBoundary({
    baseUrl: 'http://localhost:8001',
    storage,
    request: async (options) => {
      requests.push(options)
      return { statusCode: 200, data: createSuccessEnvelope() }
    },
  })

  const result = await boundary.login({ username: 'mini-user', password: 'correct-password' })

  assert.equal(result.ok, true)
  assert.equal(requests[0].url, 'http://localhost:8001/api/auth/login')
  assert.deepEqual(requests[0].data, { username: 'mini-user', password: 'correct-password' })
  assert.match(storage.dump()[SESSION_STORAGE_KEY], /access-token-1/)

  const session = boundary.getSession()
  assert.equal(session.accessToken, 'access-token-1')
  assert.equal(session.refreshToken, 'refresh-token-1')
  assert.equal(session.expiresIn, 3600)
  assert.equal(session.user.id, 'user-1')
  assert.equal(session.user.username, 'mini-user')
})

test('digest reads reuse the login-issued bearer token on the protected read path', async () => {
  const requests = []
  const boundary = createMiniAuthSessionBoundary({
    baseUrl: 'http://localhost:8001',
    storage: createMemoryStorage(),
    request: async (options) => {
      requests.push(options)
      if (options.url.endsWith('/api/auth/login')) {
        return { statusCode: 200, data: createSuccessEnvelope() }
      }

      return {
        statusCode: 200,
        data: {
          success: true,
          data: [{ stock_code: '600519', summary: 'digest ok', digest_status: 'ready' }],
        },
      }
    },
  })

  await boundary.login({ username: 'mini-user', password: 'correct-password' })
  const digestResult = await boundary.loadDigests()

  assert.equal(digestResult.ok, true)
  assert.equal(requests[1].url, 'http://localhost:8001/api/watch/digests')
  assert.equal(requests[1].header.Authorization, 'Bearer access-token-1')
  assert.equal(digestResult.cards[0].stock_code, '600519')
})

test('login failure modes remain distinguishable to the Mini client', async (t) => {
  await t.test('blank credentials map to a blank_credentials state', async () => {
    const controller = createMiniHomeController({
      authBoundary: createMiniAuthSessionBoundary({
        baseUrl: 'http://localhost:8001',
        storage: createMemoryStorage(),
        request: async () => ({
          statusCode: 400,
          data: { detail: '用户名和密码不能为空' },
        }),
      }),
    })

    const state = await controller.submitLogin({ username: '', password: '' })

    assert.equal(state.loginErrorCode, 'blank_credentials')
  })

  await t.test('invalid credentials map to an invalid_credentials state', async () => {
    const controller = createMiniHomeController({
      authBoundary: createMiniAuthSessionBoundary({
        baseUrl: 'http://localhost:8001',
        storage: createMemoryStorage(),
        request: async () => ({
          statusCode: 401,
          data: { detail: '用户名或密码错误' },
        }),
      }),
    })

    const state = await controller.submitLogin({ username: 'mini-user', password: 'bad-password' })

    assert.equal(state.loginErrorCode, 'invalid_credentials')
  })

  await t.test('missing or mistyped fields map to a missing_fields state', async () => {
    const controller = createMiniHomeController({
      authBoundary: createMiniAuthSessionBoundary({
        baseUrl: 'http://localhost:8001',
        storage: createMemoryStorage(),
        request: async () => ({
          statusCode: 422,
          data: {
            detail: [{ loc: ['body', 'username'], msg: 'Field required', type: 'missing' }],
          },
        }),
      }),
    })

    const state = await controller.submitLogin({ username: 'mini-user', password: 'correct-password' })

    assert.equal(state.loginErrorCode, 'missing_fields')
  })
})

test('login failures clear any stale persisted session before later auth-required hydrates', async (t) => {
  const failureCases = [
    {
      name: 'blank credentials clear stale session state',
      statusCode: 400,
      body: { detail: '用户名和密码不能为空' },
      credentials: { username: '', password: '' },
      expectedCode: 'blank_credentials',
    },
    {
      name: 'invalid credentials clear stale session state',
      statusCode: 401,
      body: { detail: '用户名或密码错误' },
      credentials: { username: 'mini-user', password: 'bad-password' },
      expectedCode: 'invalid_credentials',
    },
    {
      name: 'missing fields clear stale session state',
      statusCode: 422,
      body: {
        detail: [{ loc: ['body', 'username'], msg: 'Field required', type: 'missing' }],
      },
      credentials: { username: 'mini-user', password: 'correct-password' },
      expectedCode: 'missing_fields',
    },
  ]

  for (const failureCase of failureCases) {
    await t.test(failureCase.name, async () => {
      const requests = []
      const storage = createMemoryStorage({
        [SESSION_STORAGE_KEY]: JSON.stringify({
          accessToken: 'stale-access-token',
          refreshToken: 'stale-refresh-token',
          expiresIn: 3600,
          tokenType: 'bearer',
          user: { id: 'user-1', username: 'mini-user' },
        }),
      })
      const boundary = createMiniAuthSessionBoundary({
        baseUrl: 'http://localhost:8001',
        storage,
        request: async (options) => {
          requests.push(options)
          return {
            statusCode: failureCase.statusCode,
            data: failureCase.body,
          }
        },
      })
      const controller = createMiniHomeController({ authBoundary: boundary })

      const failedLoginState = await controller.submitLogin(failureCase.credentials)

      assert.equal(failedLoginState.authState, 'auth-required')
      assert.equal(failedLoginState.loginErrorCode, failureCase.expectedCode)
      assert.deepEqual(failedLoginState.cards, [])
      assert.equal(boundary.getSession(), null)
      assert.equal(storage.getItem(SESSION_STORAGE_KEY), null)

      const hydratedState = await controller.hydrate()

      assert.equal(hydratedState.authState, 'auth-required')
      assert.equal(hydratedState.authIssueCode, 'missing_or_invalid_session')
      assert.deepEqual(hydratedState.cards, [])
      assert.equal(requests.length, 1)
      assert.equal(requests[0].url, 'http://localhost:8001/api/auth/login')
    })
  }
})

test('missing or invalid auth clears protected cards and returns an auth-required state', async () => {
  const boundary = createMiniAuthSessionBoundary({
    baseUrl: 'http://localhost:8001',
    storage: createMemoryStorage({
      [SESSION_STORAGE_KEY]: JSON.stringify({
        accessToken: 'expired-token',
        refreshToken: 'refresh-token-1',
        expiresIn: 3600,
        tokenType: 'bearer',
        user: { id: 'user-1', username: 'mini-user' },
      }),
    }),
    request: async () => ({
      statusCode: 401,
      data: { detail: 'Invalid token' },
    }),
  })
  const controller = createMiniHomeController({ authBoundary: boundary })

  const state = await controller.hydrate()

  assert.equal(state.authState, 'auth-required')
  assert.equal(state.authIssueCode, 'missing_or_invalid_session')
  assert.deepEqual(state.cards, [])
  assert.equal(boundary.getSession(), null)
})
