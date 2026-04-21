function normalizeRiskTone(riskLevel) {
  if (!riskLevel) {
    return 'neutral'
  }

  const normalized = String(riskLevel).toLowerCase()
  if (normalized.includes('high') || normalized.includes('高')) {
    return 'warning'
  }
  if (normalized.includes('medium') || normalized.includes('中')) {
    return 'warning'
  }
  if (normalized.includes('low') || normalized.includes('低')) {
    return 'positive'
  }
  return 'neutral'
}

function normalizeChangeDirection(changePercent) {
  const value = String(changePercent ?? '').trim()
  if (value.startsWith('-')) {
    return 'down'
  }
  if (value.startsWith('+')) {
    return 'up'
  }
  return 'flat'
}

function formatPrice(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2)
  }

  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  return '--'
}

function formatPercent(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const prefix = value > 0 ? '+' : ''
    return `${prefix}${value.toFixed(2)}%`
  }

  if (typeof value === 'string' && value.trim()) {
    return value.trim().includes('%') ? value.trim() : `${value.trim()}%`
  }

  return '--'
}

function formatUpdatedAt(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return fallback
}

function normalizeStockCode(stockCode) {
  return typeof stockCode === 'string' ? stockCode.trim() : ''
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return Number.NEGATIVE_INFINITY
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

function isReadyDigestCard(card) {
  return String(card?.digest_status || '')
    .trim()
    .toLowerCase() === 'ready'
}

function isReadyMappedDigestCard(card) {
  return String(card?.digestStatus || '')
    .trim()
    .toLowerCase() === 'ready'
}

function deriveWatchState(mappedCards) {
  if (!Array.isArray(mappedCards) || mappedCards.length === 0) {
    return 'authenticated-empty'
  }

  return mappedCards.some(isReadyMappedDigestCard) ? 'ready' : 'waiting'
}

function buildAuthenticatedWatchCopy({ watchState, readyCount, waitingCount }) {
  switch (watchState) {
    case 'authenticated-empty':
      return {
        title: '已登录，但 Watch 暂无受保护摘要',
        message:
          '当前会话已经通过认证，但还没有可展示的受保护摘要卡片；这与未登录或加载中不同，也不会回退到 Home 的概览内容。',
      }
    case 'waiting':
      return {
        title: '已登录，Watch 正等待摘要完成',
        message:
          '当前受保护 watch 成员仍在等待 digest 完成；Watch 会继续展示等待态卡片，而不是把页面误判为空白或伪成功。',
      }
    case 'ready':
    default:
      return {
        title: '已登录，Watch 已准备好受保护摘要',
        message:
          waitingCount > 0
            ? `Watch 当前展示 ${readyCount} 张已就绪摘要卡片，并保留 ${waitingCount} 张等待态卡片，避免遗漏仍在排队的受保护成员。`
            : `Watch 当前展示 ${readyCount} 张已就绪摘要卡片，并保持受保护 digest 读取结果与共享紧凑合同一致。`,
      }
  }
}

function shouldReplaceDigestCard(existingCard, nextCard) {
  const existingReady = isReadyDigestCard(existingCard)
  const nextReady = isReadyDigestCard(nextCard)

  if (nextReady !== existingReady) {
    return nextReady
  }

  const existingDigestTimestamp = parseTimestamp(existingCard?.updated_at)
  const nextDigestTimestamp = parseTimestamp(nextCard?.updated_at)

  if (nextDigestTimestamp !== existingDigestTimestamp) {
    return nextDigestTimestamp > existingDigestTimestamp
  }

  const existingTaskTimestamp = parseTimestamp(existingCard?.task_updated_at)
  const nextTaskTimestamp = parseTimestamp(nextCard?.task_updated_at)

  if (nextTaskTimestamp !== existingTaskTimestamp) {
    return nextTaskTimestamp > existingTaskTimestamp
  }

  return false
}

function selectCompactDigestCards(cards) {
  if (!Array.isArray(cards)) {
    return []
  }

  const cardsByStockCode = new Map()
  for (const card of cards) {
    if (!card || typeof card !== 'object') {
      continue
    }

    const stockCode = normalizeStockCode(card.stock_code)
    if (!stockCode) {
      continue
    }

    const normalizedCard = {
      stock_code: stockCode,
      stock_name: card.stock_name,
      market: card.market,
      board: card.board,
      exchange: card.exchange,
      current_price: card.current_price,
      change_percent: card.change_percent,
      digest_status: card.digest_status,
      summary: card.summary,
      risk_level: card.risk_level,
      rule_status: card.rule_status,
      task_status: card.task_status,
      task_id: card.task_id,
      updated_at: card.updated_at,
      task_updated_at: card.task_updated_at,
    }

    const existingCard = cardsByStockCode.get(stockCode)
    if (!existingCard || shouldReplaceDigestCard(existingCard, normalizedCard)) {
      cardsByStockCode.set(stockCode, normalizedCard)
    }
  }

  return Array.from(cardsByStockCode.values())
}

function mapDigestCard(card) {
  return {
    stockCode: normalizeStockCode(card.stock_code) || '--',
    stockName: card.stock_name || normalizeStockCode(card.stock_code) || '--',
    market: card.market || '--',
    board: card.board || '--',
    exchange: card.exchange || '--',
    currentPrice: formatPrice(card.current_price),
    changePercent: formatPercent(card.change_percent),
    changeDirection: normalizeChangeDirection(card.change_percent),
    digestStatus: card.digest_status || '--',
    summary: card.summary || '暂无摘要',
    riskLabel: card.risk_level || '等待解读',
    riskTone: normalizeRiskTone(card.risk_level),
    ruleStatus: card.rule_status || '--',
    taskStatus: card.task_status || '--',
    taskLabel: card.task_id ? `任务 ${card.task_id}` : '暂无任务',
    updatedAt: formatUpdatedAt(card.updated_at || card.task_updated_at, '等待更新'),
  }
}

function buildBaseState(previewMeta = {}) {
  return {
    localOnlyDisclosure: previewMeta.localOnlyDisclosure || '',
    previewEvidenceLabel: previewMeta.previewEvidenceLabel || '',
    brand: previewMeta.brand || {},
    runtimeBoundary: previewMeta.runtimeBoundary || {},
    hero: previewMeta.hero || {
      eyebrow: 'Mini local preview',
      title: 'Mini auth/session boundary',
      subtitle: '',
    },
    checkpoints: Array.isArray(previewMeta.checkpoints) ? previewMeta.checkpoints : [],
    username: '',
    password: '',
    authState: 'checking',
    watchState: 'loading',
    authTitle: 'Watch 正在准备受保护盯盘视图',
    authMessage:
      'Watch 会先检查 Bearer 会话与受保护 digest 读取结果，再决定显示登录入口、等待态卡片或已就绪摘要。',
    authIssueCode: '',
    loginErrorCode: '',
    loginErrorMessage: '',
    compactFieldKeys: Array.isArray(previewMeta.compactFieldKeys) ? previewMeta.compactFieldKeys : [],
    rawPayloadCount: 0,
    dedupedCount: 0,
    placeholderCount: 0,
    compactFieldKeysText: Array.isArray(previewMeta.compactFieldKeys)
      ? previewMeta.compactFieldKeys.join(', ')
      : '',
    renderedStockCodes: '',
    cards: [],
    monitoredCount: 0,
    activeRuleCount: 0,
    readyCount: 0,
    sessionUserLabel: '',
  }
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state))
}

function createMiniHomeController({ authBoundary, previewMeta } = {}) {
  if (!authBoundary) {
    throw new Error('Mini home controller requires an authBoundary')
  }

  const state = buildBaseState(previewMeta)

  function snapshot() {
    return cloneState(state)
  }

  function setCredentials({ username, password } = {}) {
    if (typeof username === 'string') {
      state.username = username
    }
    if (typeof password === 'string') {
      state.password = password
    }
    return snapshot()
  }

  function applyAuthRequiredState({ code, title, message, loginErrorCode = '', loginErrorMessage = '' }) {
    state.authState = 'auth-required'
    state.watchState = 'auth-required'
    state.authIssueCode = code
    state.authTitle = title
    state.authMessage = message
    state.loginErrorCode = loginErrorCode
    state.loginErrorMessage = loginErrorMessage
    state.rawPayloadCount = 0
    state.dedupedCount = 0
    state.placeholderCount = 0
    state.renderedStockCodes = ''
    state.cards = []
    state.monitoredCount = 0
    state.activeRuleCount = 0
    state.readyCount = 0
    state.sessionUserLabel = ''
  }

  function applyAuthenticatedState(cards, session) {
    const compactCards = selectCompactDigestCards(cards)
    const mappedCards = compactCards.map(mapDigestCard)
    const rawPayloadCount = Array.isArray(cards) ? cards.length : 0
    const readyCount = mappedCards.filter(isReadyMappedDigestCard).length
    const waitingCount = mappedCards.length - readyCount
    const watchState = deriveWatchState(mappedCards)
    const watchCopy = buildAuthenticatedWatchCopy({
      watchState,
      readyCount,
      waitingCount,
    })
    state.authState = 'authenticated'
    state.watchState = watchState
    state.authIssueCode = ''
    state.authTitle = watchCopy.title
    state.authMessage = watchCopy.message
    state.loginErrorCode = ''
    state.loginErrorMessage = ''
    state.rawPayloadCount = rawPayloadCount
    state.dedupedCount = Math.max(rawPayloadCount - mappedCards.length, 0)
    state.placeholderCount = waitingCount
    state.renderedStockCodes = mappedCards.map((card) => card.stockCode).join(', ')
    state.cards = mappedCards
    state.monitoredCount = mappedCards.length
    state.activeRuleCount = mappedCards.filter((card) => card.ruleStatus === 'active').length
    state.readyCount = readyCount
    state.sessionUserLabel = session ? `${session.user.username} · ${session.user.id}` : ''
  }

  async function hydrate() {
    const digestResult = await authBoundary.loadDigests()

    if (digestResult.ok) {
      applyAuthenticatedState(digestResult.cards, digestResult.session)
      return snapshot()
    }

    if (digestResult.authRequired) {
      applyAuthRequiredState({
        code: digestResult.code,
        title: '登录后即可查看 Watch',
        message:
          '当前未检测到可用 Bearer 会话，因此 Watch 会继续保持受保护状态，不显示任何受保护盯盘卡片。',
      })
      return snapshot()
    }

    applyAuthRequiredState({
      code: digestResult.code,
      title: 'Watch 暂时无法打开受保护摘要',
      message: '本次摘要读取未成功完成，Watch 已保持受保护内容关闭，避免显示过期或伪成功数据。',
    })
    return snapshot()
  }

  async function submitLogin(credentials = {}) {
    setCredentials(credentials)

    const loginResult = await authBoundary.login({
      username: state.username,
      password: state.password,
    })

    if (!loginResult.ok) {
      applyAuthRequiredState({
        code: 'login_failed',
        title: '登录未通过，Watch 仍保持受保护',
        message: loginResult.failure.message,
        loginErrorCode: loginResult.failure.code,
        loginErrorMessage: loginResult.failure.message,
      })
      return snapshot()
    }

    const digestResult = await authBoundary.loadDigests()
    if (digestResult.ok) {
      applyAuthenticatedState(digestResult.cards, digestResult.session)
      return snapshot()
    }

    applyAuthRequiredState({
      code: digestResult.code || 'missing_or_invalid_session',
      title: '登录后仍未拿到受保护摘要',
      message: '登录会话未能完成受保护摘要读取，Watch 已清空所有受保护卡片并回到 auth-required 状态。',
    })
    return snapshot()
  }

  function logout() {
    authBoundary.clearSession()
    applyAuthRequiredState({
      code: 'missing_or_invalid_session',
      title: '已清除本地会话，Watch 已重新上锁',
      message: '退出后 Watch 不会保留任何受保护盯盘卡片；Home 与 Account 仍可继续浏览。',
    })
    return snapshot()
  }

  return {
    getState: snapshot,
    hydrate,
    logout,
    setCredentials,
    submitLogin,
  }
}

module.exports = {
  buildBaseState,
  createMiniHomeController,
  mapDigestCard,
  selectCompactDigestCards,
}
