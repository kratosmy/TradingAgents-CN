const STORAGE_KEY = 'ta-mini-runtime-settings'

const DEFAULT_RUNTIME_SETTINGS = Object.freeze({
  apiBaseUrl: 'http://localhost:8001',
  accessToken: 'paste-your-jwt-access-token-here',
  refreshToken: '',
  language: 'zh-CN',
  user: null,
})

const normalizeString = (value, fallback = '') => {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized || fallback
}

const mergeRuntimeSettings = (settings = {}) => {
  const apiBaseUrl = normalizeString(settings.apiBaseUrl, DEFAULT_RUNTIME_SETTINGS.apiBaseUrl).replace(/\/+$/, '')
  const accessToken = normalizeString(settings.accessToken, DEFAULT_RUNTIME_SETTINGS.accessToken)
  const refreshToken = normalizeString(settings.refreshToken, DEFAULT_RUNTIME_SETTINGS.refreshToken)
  const language = normalizeString(settings.language, DEFAULT_RUNTIME_SETTINGS.language)
  const user = settings.user && typeof settings.user === 'object' ? settings.user : DEFAULT_RUNTIME_SETTINGS.user

  return {
    apiBaseUrl: apiBaseUrl || DEFAULT_RUNTIME_SETTINGS.apiBaseUrl,
    accessToken: accessToken || DEFAULT_RUNTIME_SETTINGS.accessToken,
    refreshToken,
    language: language || DEFAULT_RUNTIME_SETTINGS.language,
    user,
  }
}

const getStorageApi = () => {
  if (typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function') {
    return wx
  }

  return null
}

const isPlaceholderValue = (value) => {
  const normalized = normalizeString(value)
  if (!normalized) {
    return true
  }

  return normalized.includes('your-backend-host') || normalized.includes('paste-your-jwt-access-token')
}

const hasUsableApiBaseUrl = (settings = DEFAULT_RUNTIME_SETTINGS) => {
  const runtimeSettings = mergeRuntimeSettings(settings)
  return !isPlaceholderValue(runtimeSettings.apiBaseUrl)
}

const hasUsableAccessToken = (settings = DEFAULT_RUNTIME_SETTINGS) => {
  const runtimeSettings = mergeRuntimeSettings(settings)
  return !isPlaceholderValue(runtimeSettings.accessToken)
}

const isRuntimeConfigured = (settings = DEFAULT_RUNTIME_SETTINGS) => {
  return hasUsableApiBaseUrl(settings) && hasUsableAccessToken(settings)
}

const loadRuntimeSettings = () => {
  const storageApi = getStorageApi()
  if (!storageApi) {
    return mergeRuntimeSettings()
  }

  try {
    const stored = storageApi.getStorageSync(STORAGE_KEY)
    if (!stored || typeof stored !== 'object') {
      return mergeRuntimeSettings()
    }

    return mergeRuntimeSettings(stored)
  } catch (error) {
    return mergeRuntimeSettings()
  }
}

const saveRuntimeSettings = (nextSettings = {}) => {
  const storageApi = getStorageApi()
  const runtimeSettings = mergeRuntimeSettings(nextSettings)

  if (!storageApi || typeof storageApi.setStorageSync !== 'function') {
    return runtimeSettings
  }

  storageApi.setStorageSync(STORAGE_KEY, runtimeSettings)
  return runtimeSettings
}

module.exports = {
  DEFAULT_RUNTIME_SETTINGS,
  STORAGE_KEY,
  hasUsableAccessToken,
  hasUsableApiBaseUrl,
  isPlaceholderValue,
  isRuntimeConfigured,
  loadRuntimeSettings,
  mergeRuntimeSettings,
  saveRuntimeSettings,
}
