const sharedRuntimeConfig = require('../config/runtime.shared.js')
const net = require('node:net')

const LOCAL_OVERRIDE_MODULE_PATH = '../config/runtime.local.js'
const LOCAL_OVERRIDE_RELATIVE_PATH = 'mini/config/runtime.local.js'
const DEVTOOLS_PRIVATE_CONFIG_RELATIVE_PATH = 'mini/project.private.config.json'

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue)
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)]),
    )
  }

  return value
}

function mergeConfig(baseValue, overrideValue) {
  if (Array.isArray(baseValue)) {
    return Array.isArray(overrideValue) ? overrideValue.map(cloneValue) : baseValue.map(cloneValue)
  }

  if (!isPlainObject(baseValue)) {
    return typeof overrideValue === 'undefined' ? cloneValue(baseValue) : cloneValue(overrideValue)
  }

  const merged = cloneValue(baseValue)
  if (!isPlainObject(overrideValue)) {
    return merged
  }

  for (const [key, nestedOverride] of Object.entries(overrideValue)) {
    const baseNestedValue = Object.prototype.hasOwnProperty.call(merged, key) ? merged[key] : undefined
    if (isPlainObject(baseNestedValue) && isPlainObject(nestedOverride)) {
      merged[key] = mergeConfig(baseNestedValue, nestedOverride)
      continue
    }

    if (Array.isArray(baseNestedValue) && Array.isArray(nestedOverride)) {
      merged[key] = nestedOverride.map(cloneValue)
      continue
    }

    merged[key] = cloneValue(nestedOverride)
  }

  return merged
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue)
  }

  return Object.freeze(value)
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '')
}

function normalizeHostname(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase()
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    return normalized.slice(1, -1)
  }

  return normalized
}

function isIPv4LoopbackHost(hostname) {
  return net.isIP(hostname) === 4 && hostname.split('.')[0] === '127'
}

function isIPv6LoopbackHost(hostname) {
  return net.isIP(hostname) === 6 && (hostname === '::1' || hostname === '0:0:0:0:0:0:0:1')
}

function isLoopbackUrl(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return true
  }

  try {
    const parsed = new URL(url)
    const host = normalizeHostname(parsed.hostname)

    if (
      !host ||
      host === 'localhost' ||
      host === '0.0.0.0' ||
      isIPv4LoopbackHost(host) ||
      isIPv6LoopbackHost(host) ||
      host.endsWith('.localhost')
    ) {
      return true
    }

    return false
  } catch (_error) {
    return true
  }
}

function isMissingLocalOverrideError(error) {
  if (!error || error.code !== 'MODULE_NOT_FOUND') {
    return false
  }

  const message = String(error.message || '')
  return (
    message.includes(`'${LOCAL_OVERRIDE_MODULE_PATH}'`) ||
    message.includes(`"${LOCAL_OVERRIDE_MODULE_PATH}"`) ||
    message.includes(`'${LOCAL_OVERRIDE_RELATIVE_PATH}'`) ||
    message.includes(`"${LOCAL_OVERRIDE_RELATIVE_PATH}"`)
  )
}

function createRuntimeConfig({ operatorOverrides } = {}) {
  const merged = mergeConfig(sharedRuntimeConfig, operatorOverrides)
  if (!merged.backend || !isPlainObject(merged.backend)) {
    merged.backend = {}
  }

  merged.backend.baseUrl = normalizeBaseUrl(merged.backend.baseUrl)

  return deepFreeze(merged)
}

function loadOperatorOverrides() {
  try {
    const resolvedOverrideModulePath = require.resolve(LOCAL_OVERRIDE_MODULE_PATH)
    return require(resolvedOverrideModulePath)
  } catch (error) {
    if (isMissingLocalOverrideError(error)) {
      return null
    }

    throw error
  }
}

function getCheckedInRuntimeConfig() {
  return createRuntimeConfig()
}

function getRuntimeConfig() {
  return createRuntimeConfig({
    operatorOverrides: loadOperatorOverrides(),
  })
}

const DEFAULT_BASE_URL = getRuntimeConfig().backend.baseUrl

module.exports = {
  DEFAULT_BASE_URL,
  DEVTOOLS_PRIVATE_CONFIG_RELATIVE_PATH,
  LOCAL_OVERRIDE_MODULE_PATH,
  LOCAL_OVERRIDE_RELATIVE_PATH,
  createRuntimeConfig,
  getCheckedInRuntimeConfig,
  getRuntimeConfig,
  isLoopbackUrl,
  loadOperatorOverrides,
}
