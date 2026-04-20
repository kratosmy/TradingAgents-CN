const SESSION_STORAGE_KEY = 'tradingagents-mini.auth-session'
const DEFAULT_BASE_URL = 'http://localhost:8001'

function normalizeBaseUrl(baseUrl = DEFAULT_BASE_URL) {
  return String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function createMemoryStorage(initialState = {}) {
  const state = { ...initialState }

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null
    },
    setItem(key, value) {
      state[key] = value
    },
    removeItem(key) {
      delete state[key]
    },
    dump() {
      return { ...state }
    },
  }
}

function getStorageValue(storage, key) {
  if (!storage) {
    return null
  }

  if (typeof storage.getStorageSync === 'function') {
    const value = storage.getStorageSync(key)
    return value === '' || typeof value === 'undefined' ? null : value
  }

  if (typeof storage.getItem === 'function') {
    const value = storage.getItem(key)
    return value === '' || typeof value === 'undefined' ? null : value
  }

  return null
}

function setStorageValue(storage, key, value) {
  if (!storage) {
    return
  }

  if (typeof storage.setStorageSync === 'function') {
    storage.setStorageSync(key, value)
    return
  }

  if (typeof storage.setItem === 'function') {
    storage.setItem(key, value)
  }
}

function removeStorageValue(storage, key) {
  if (!storage) {
    return
  }

  if (typeof storage.removeStorageSync === 'function') {
    storage.removeStorageSync(key)
    return
  }

  if (typeof storage.removeItem === 'function') {
    storage.removeItem(key)
  }
}

function extractErrorMessage(body, fallbackMessage) {
  if (!body) {
    return fallbackMessage
  }

  if (typeof body.detail === 'string' && body.detail.trim()) {
    return body.detail.trim()
  }

  if (Array.isArray(body.detail) && body.detail.length > 0) {
    return body.detail
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (item && typeof item.msg === 'string') {
          const path = Array.isArray(item.loc) ? item.loc.join('.') : 'body'
          return `${path}: ${item.msg}`
        }

        return JSON.stringify(item)
      })
      .join('; ')
  }

  if (typeof body.message === 'string' && body.message.trim()) {
    return body.message.trim()
  }

  return fallbackMessage
}

function classifyLoginFailure(statusCode, body) {
  if (statusCode === 400) {
    return {
      code: 'blank_credentials',
      message: extractErrorMessage(body, '用户名和密码不能为空'),
    }
  }

  if (statusCode === 401) {
    return {
      code: 'invalid_credentials',
      message: extractErrorMessage(body, '用户名或密码错误'),
    }
  }

  if (statusCode === 422) {
    return {
      code: 'missing_fields',
      message: extractErrorMessage(body, '登录请求字段缺失或字段名不正确'),
    }
  }

  return {
    code: 'login_failed',
    message: extractErrorMessage(body, '登录请求失败，请稍后重试'),
  }
}

function normalizeSessionEnvelope(payload) {
  const sessionData = payload && payload.data ? payload.data : null
  const user = sessionData && sessionData.user ? sessionData.user : null

  if (
    !sessionData ||
    typeof sessionData.access_token !== 'string' ||
    !sessionData.access_token.trim() ||
    typeof sessionData.refresh_token !== 'string' ||
    !sessionData.refresh_token.trim() ||
    !Number.isInteger(sessionData.expires_in) ||
    sessionData.expires_in <= 0 ||
    !user ||
    typeof user.id !== 'string' ||
    !user.id.trim() ||
    typeof user.username !== 'string' ||
    !user.username.trim()
  ) {
    throw new Error('登录成功响应缺少 Mini 读取所需的 bearer 会话字段')
  }

  return {
    accessToken: sessionData.access_token,
    refreshToken: sessionData.refresh_token,
    expiresIn: sessionData.expires_in,
    tokenType:
      typeof sessionData.token_type === 'string' && sessionData.token_type.trim()
        ? sessionData.token_type.trim()
        : 'bearer',
    user: {
      id: user.id,
      username: user.username,
    },
    savedAt: new Date().toISOString(),
  }
}

function readPersistedSession(storage) {
  const rawValue = getStorageValue(storage, SESSION_STORAGE_KEY)
  if (!rawValue || typeof rawValue !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue)
    if (
      !parsed ||
      typeof parsed.accessToken !== 'string' ||
      !parsed.accessToken.trim() ||
      typeof parsed.refreshToken !== 'string' ||
      !parsed.refreshToken.trim() ||
      !Number.isInteger(parsed.expiresIn) ||
      parsed.expiresIn <= 0 ||
      !parsed.user ||
      typeof parsed.user.id !== 'string' ||
      !parsed.user.id.trim() ||
      typeof parsed.user.username !== 'string' ||
      !parsed.user.username.trim()
    ) {
      return null
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresIn: parsed.expiresIn,
      tokenType:
        typeof parsed.tokenType === 'string' && parsed.tokenType.trim()
          ? parsed.tokenType.trim()
          : 'bearer',
      user: {
        id: parsed.user.id,
        username: parsed.user.username,
      },
      savedAt: parsed.savedAt || null,
    }
  } catch (_error) {
    return null
  }
}

function persistSession(storage, session) {
  setStorageValue(storage, SESSION_STORAGE_KEY, JSON.stringify(session))
  return session
}

function clearPersistedSession(storage) {
  removeStorageValue(storage, SESSION_STORAGE_KEY)
}

async function performRequest(request, options) {
  try {
    return await request(options)
  } catch (error) {
    return {
      statusCode: 0,
      data: {
        message: error instanceof Error ? error.message : '网络请求失败',
      },
      networkError: true,
    }
  }
}

function createWxRequestTransport(wxLike) {
  return function request(options) {
    return new Promise((resolve, reject) => {
      if (!wxLike || typeof wxLike.request !== 'function') {
        reject(new Error('wx.request 不可用，无法执行 Mini 合同请求'))
        return
      }

      wxLike.request({
        url: options.url,
        method: options.method || 'GET',
        data: options.data,
        header: options.header || {},
        success(response) {
          resolve({
            statusCode: response.statusCode,
            data: response.data,
            headers: response.header || {},
          })
        },
        fail(error) {
          reject(error)
        },
      })
    })
  }
}

function createMiniAuthSessionBoundary({
  baseUrl = DEFAULT_BASE_URL,
  storage = createMemoryStorage(),
  request,
} = {}) {
  if (typeof request !== 'function') {
    throw new Error('Mini auth/session boundary requires a request function')
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  function getSession() {
    const session = readPersistedSession(storage)
    if (!session) {
      clearPersistedSession(storage)
      return null
    }
    return session
  }

  function clearSession() {
    clearPersistedSession(storage)
    return null
  }

  async function login(credentials) {
    const response = await performRequest(request, {
      url: `${normalizedBaseUrl}/api/auth/login`,
      method: 'POST',
      data: {
        username: credentials.username,
        password: credentials.password,
      },
      header: {
        'Content-Type': 'application/json',
      },
    })

    if (response.statusCode === 200) {
      try {
        const session = normalizeSessionEnvelope(response.data)
        persistSession(storage, session)
        return {
          ok: true,
          session,
          response,
        }
      } catch (error) {
        clearPersistedSession(storage)
        return {
          ok: false,
          failure: {
            code: 'missing_fields',
            message: error instanceof Error ? error.message : '登录响应缺少必要字段',
          },
          response,
        }
      }
    }

    return {
      ok: false,
      failure: classifyLoginFailure(response.statusCode, response.data),
      response,
    }
  }

  async function loadDigests() {
    const session = getSession()
    if (!session) {
      return {
        ok: false,
        authRequired: true,
        code: 'missing_or_invalid_session',
        cards: [],
      }
    }

    const response = await performRequest(request, {
      url: `${normalizedBaseUrl}/api/watch/digests`,
      method: 'GET',
      header: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    })

    if (response.statusCode === 200 && response.data && response.data.success !== false) {
      return {
        ok: true,
        cards: Array.isArray(response.data.data) ? response.data.data : [],
        session,
        response,
      }
    }

    if (response.statusCode === 401) {
      clearPersistedSession(storage)
      return {
        ok: false,
        authRequired: true,
        code: 'missing_or_invalid_session',
        cards: [],
        response,
      }
    }

    return {
      ok: false,
      authRequired: false,
      code: response.networkError ? 'network_error' : 'digest_read_failed',
      cards: [],
      response,
    }
  }

  return {
    SESSION_STORAGE_KEY,
    getBaseUrl() {
      return normalizedBaseUrl
    },
    getSession,
    login,
    loadDigests,
    clearSession,
  }
}

module.exports = {
  DEFAULT_BASE_URL,
  SESSION_STORAGE_KEY,
  classifyLoginFailure,
  clearPersistedSession,
  createMemoryStorage,
  createMiniAuthSessionBoundary,
  createWxRequestTransport,
  normalizeSessionEnvelope,
  persistSession,
  readPersistedSession,
}
