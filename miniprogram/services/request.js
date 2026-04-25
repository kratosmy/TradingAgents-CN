const {
  hasUsableAccessToken,
  hasUsableApiBaseUrl,
  loadRuntimeSettings,
  mergeRuntimeSettings,
} = require('./runtime-settings')

const createRequestId = () => {
  return `mini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const joinApiUrl = (baseUrl, path) => {
  const normalizedBase = String(baseUrl || '').replace(/\/+$/, '')
  const normalizedPath = `/${String(path || '').replace(/^\/+/, '')}`
  return `${normalizedBase}${normalizedPath}`
}

const buildRequestOptions = ({ path, method = 'GET', data, settings, skipAuth = false }) => {
  const runtimeSettings = mergeRuntimeSettings(settings || loadRuntimeSettings())

  if (!hasUsableApiBaseUrl(runtimeSettings)) {
    throw new Error('请先在设置页填写可访问的 API Base URL')
  }

  if (!skipAuth && !hasUsableAccessToken(runtimeSettings)) {
    throw new Error('请先在设置页填写有效的访问令牌')
  }

  const header = {
    'Content-Type': 'application/json',
    'Accept-Language': runtimeSettings.language,
    'X-Request-ID': createRequestId(),
  }

  if (!skipAuth) {
    header.Authorization = `Bearer ${runtimeSettings.accessToken}`
  }

  return {
    url: joinApiUrl(runtimeSettings.apiBaseUrl, path),
    method: String(method || 'GET').toUpperCase(),
    data,
    header,
    timeout: 20000,
  }
}

const extractErrorMessage = (payload, fallback) => {
  if (payload && typeof payload === 'object') {
    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail.trim()
    }

    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim()
    }
  }

  return fallback
}

const unwrapResponseBody = (statusCode, payload) => {
  if (statusCode >= 200 && statusCode < 300) {
    if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'success')) {
      if (payload.success) {
        return payload
      }

      throw new Error(extractErrorMessage(payload, '请求失败'))
    }

    return {
      success: true,
      data: payload,
      message: 'ok',
    }
  }

  throw new Error(extractErrorMessage(payload, `请求失败 (${statusCode})`))
}

const request = (options) => {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || !wx || typeof wx.request !== 'function') {
      reject(new Error('当前环境未提供 wx.request'))
      return
    }

    let requestOptions
    try {
      requestOptions = buildRequestOptions(options)
    } catch (error) {
      reject(error)
      return
    }

    wx.request({
      ...requestOptions,
      success(response) {
        try {
          resolve(unwrapResponseBody(response.statusCode, response.data))
        } catch (error) {
          reject(error)
        }
      },
      fail(error) {
        reject(new Error(error && error.errMsg ? error.errMsg : '网络请求失败'))
      },
    })
  })
}

module.exports = {
  buildRequestOptions,
  createRequestId,
  extractErrorMessage,
  joinApiUrl,
  request,
  unwrapResponseBody,
}
