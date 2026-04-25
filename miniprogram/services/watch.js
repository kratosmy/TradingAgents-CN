const { request } = require('./request')
const {
  formatChangePercent,
  formatDateTime,
  formatPrice,
  formatTaskStatus,
  getChangeClass,
  getRiskTone,
  getRuleStatusText,
} = require('../utils/format')

const DEFAULT_SUMMARY = '暂无摘要，请先执行一次解读。'

const SCHEDULE_LABELS = Object.freeze({
  custom: '自定义调度',
  daily_pre_market: '每天盘前',
  daily_post_market: '每天盘后',
  intra_day: '盘中播报',
  weekly_review: '每周复盘',
})

const firstDefinedValue = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }

  return null
}

const firstText = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) {
    return []
  }

  return tags
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())
}

const normalizeStockCode = (value) => {
  const rawValue = typeof value === 'string' ? value : value && (value.stock_code || value.symbol || value.code)
  if (typeof rawValue !== 'string') {
    return ''
  }

  return rawValue.trim().toUpperCase()
}

const normalizeScheduleText = (digest = {}) => {
  return firstText(digest.schedule_summary, digest.schedule_label, SCHEDULE_LABELS[digest.schedule_type], '未配置')
}

const buildWatchCard = (favorite = {}, digest = {}) => {
  const stockCode = normalizeStockCode(digest) || normalizeStockCode(favorite)
  const ruleStatus = firstText(digest.rule_status, favorite.rule_status, 'inactive')
  const riskLevel = firstText(digest.risk_level, '未解读')
  const tags = normalizeTags(firstDefinedValue(digest.tags, favorite.tags))

  return {
    stockCode,
    stockName: firstText(digest.stock_name, favorite.stock_name, stockCode),
    market: firstText(digest.market, favorite.market, 'A股'),
    board: firstText(digest.board, favorite.board),
    exchange: firstText(digest.exchange, favorite.exchange),
    priceText: formatPrice(firstDefinedValue(digest.current_price, favorite.current_price)),
    changeText: formatChangePercent(firstDefinedValue(digest.change_percent, favorite.change_percent)),
    changeClass: getChangeClass(firstDefinedValue(digest.change_percent, favorite.change_percent)),
    summaryText: firstText(digest.summary, DEFAULT_SUMMARY),
    recommendationText: firstText(digest.recommendation),
    riskText: riskLevel,
    riskTone: getRiskTone(riskLevel),
    scheduleText: normalizeScheduleText(digest),
    scheduleType: firstText(digest.schedule_type, favorite.schedule_type),
    ruleStatus,
    ruleStatusText: getRuleStatusText(ruleStatus),
    ruleStatusTone: ruleStatus === 'active' ? 'badge--success' : 'badge--neutral',
    isRuleActive: ruleStatus === 'active',
    updatedAtText: formatDateTime(firstDefinedValue(digest.updated_at, digest.generated_at, favorite.added_at)),
    taskStatusText: formatTaskStatus(firstDefinedValue(digest.task_status, digest.digest_status)),
    tagsText: tags.join(' / '),
    notesText: firstText(digest.notes, favorite.notes),
    alertPriceHigh: firstDefinedValue(digest.alert_price_high, favorite.alert_price_high),
    alertPriceLow: firstDefinedValue(digest.alert_price_low, favorite.alert_price_low),
    reportId: firstText(digest.report_id),
    taskId: firstText(digest.task_id),
  }
}

const buildWatchHomeCards = (digests = []) => {
  const cards = []
  const seenCodes = new Set()

  digests.forEach((digest) => {
    const stockCode = normalizeStockCode(digest)
    if (!stockCode || seenCodes.has(stockCode)) {
      return
    }

    seenCodes.add(stockCode)
    cards.push(buildWatchCard(digest, digest))
  })

  return cards.sort((left, right) => {
    if (left.isRuleActive !== right.isRuleActive) {
      return left.isRuleActive ? -1 : 1
    }

    return left.stockCode.localeCompare(right.stockCode, 'zh-CN')
  })
}

const buildRefreshPayload = (stockCode, options = {}) => {
  const normalizedStockCode = normalizeStockCode(stockCode)

  return {
    stock_name: firstText(options.stockName, normalizedStockCode),
    market: firstText(options.market, 'A股'),
  }
}

const buildFavoritePayload = (form = {}) => {
  const stockCode = normalizeStockCode(form.stock_code || form.stockCode || form.symbol)

  return {
    stock_code: stockCode,
    stock_name: firstText(form.stock_name, form.stockName, stockCode),
    market: firstText(form.market, 'A股'),
    tags: normalizeTags(form.tags),
    notes: firstText(form.notes),
  }
}

const buildRulePayload = (form = {}) => {
  const scheduleType = firstText(form.schedule_type, form.scheduleType, 'daily_post_market')
  const cronExpr = firstText(form.cron_expr, form.cronExpr)
  const isPaused = form.status === 'paused' || form.status === 'inactive'

  return {
    stock_name: firstText(form.stock_name, form.stockName),
    market: firstText(form.market, 'A股'),
    schedule_type: scheduleType,
    cron_expr: scheduleType === 'custom' ? cronExpr : null,
    status: isPaused ? 'paused' : 'active',
  }
}

const listFavorites = (settings) => {
  return request({
    path: '/api/favorites/',
    settings,
  })
}

const listWatchDigests = (settings) => {
  return request({
    path: '/api/watch/digests',
    settings,
  })
}

const loadWatchHomeData = async (settings) => {
  const digestsResponse = await listWatchDigests(settings)
  const digests = Array.isArray(digestsResponse.data) ? digestsResponse.data : []

  return {
    digests,
    cards: buildWatchHomeCards(digests),
  }
}

const refreshDigest = (stockCode, options = {}, settings) => {
  const normalizedStockCode = normalizeStockCode(stockCode)

  return request({
    path: `/api/watch/digests/${encodeURIComponent(normalizedStockCode)}/refresh`,
    method: 'POST',
    data: buildRefreshPayload(normalizedStockCode, options),
    settings,
  })
}

const refreshAllDigests = (settings) => {
  return request({
    path: '/api/watch/digests/refresh-all',
    method: 'POST',
    data: {},
    settings,
  })
}

const addFavorite = (form, settings) => {
  return request({
    path: '/api/favorites/',
    method: 'POST',
    data: buildFavoritePayload(form),
    settings,
  })
}

const removeFavorite = (stockCode, settings) => {
  const normalizedStockCode = normalizeStockCode(stockCode)

  return request({
    path: `/api/favorites/${encodeURIComponent(normalizedStockCode)}`,
    method: 'DELETE',
    settings,
  })
}

const saveWatchRule = (stockCode, form, settings) => {
  const normalizedStockCode = normalizeStockCode(stockCode)

  return request({
    path: `/api/watch/rules/${encodeURIComponent(normalizedStockCode)}`,
    method: 'PUT',
    data: buildRulePayload(form),
    settings,
  })
}

module.exports = {
  DEFAULT_SUMMARY,
  SCHEDULE_LABELS,
  addFavorite,
  buildFavoritePayload,
  buildRefreshPayload,
  buildRulePayload,
  buildWatchCard,
  buildWatchHomeCards,
  listFavorites,
  listWatchDigests,
  loadWatchHomeData,
  normalizeStockCode,
  removeFavorite,
  refreshAllDigests,
  refreshDigest,
  saveWatchRule,
}
