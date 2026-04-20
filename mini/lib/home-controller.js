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

function mapDigestCard(card) {
  return {
    stockCode: card.stock_code || '--',
    stockName: card.stock_name || card.stock_code || '--',
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
    hero: previewMeta.hero || {
      eyebrow: 'Mini local preview',
      title: 'Mini auth/session boundary',
      subtitle: '',
    },
    checkpoints: Array.isArray(previewMeta.checkpoints) ? previewMeta.checkpoints : [],
    username: '',
    password: '',
    authState: 'checking',
    authTitle: '正在检查本地 Bearer 会话',
    authMessage: '当前 Mini 页面会先读取本地 Bearer 会话，再决定是否允许展示受保护盯盘卡片。',
    authIssueCode: '',
    loginErrorCode: '',
    loginErrorMessage: '',
    cards: [],
    monitoredCount: 0,
    activeRuleCount: 0,
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
    state.authIssueCode = code
    state.authTitle = title
    state.authMessage = message
    state.loginErrorCode = loginErrorCode
    state.loginErrorMessage = loginErrorMessage
    state.cards = []
    state.monitoredCount = 0
    state.activeRuleCount = 0
    state.sessionUserLabel = ''
  }

  function applyAuthenticatedState(cards, session) {
    const mappedCards = Array.isArray(cards) ? cards.map(mapDigestCard) : []
    state.authState = 'authenticated'
    state.authIssueCode = ''
    state.authTitle = '已使用 Bearer 会话读取受保护盯盘摘要'
    state.authMessage =
      '当前卡片来自受保护的 `/api/watch/digests` 读取结果；如果会话缺失或失效，页面会立即回到 auth-required 状态。'
    state.loginErrorCode = ''
    state.loginErrorMessage = ''
    state.cards = mappedCards
    state.monitoredCount = mappedCards.length
    state.activeRuleCount = mappedCards.filter((card) => card.ruleStatus === 'active').length
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
        title: '需要重新登录后才能查看受保护盯盘内容',
        message: '当前未检测到可用 Bearer 会话，页面已阻止显示任何受保护盯盘卡片。',
      })
      return snapshot()
    }

    applyAuthRequiredState({
      code: digestResult.code,
      title: '盯盘摘要读取失败',
      message: '摘要读取未成功完成，已保持受保护内容关闭，避免显示过期或伪成功数据。',
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
        title: '登录未通过，受保护盯盘内容仍保持关闭',
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
      title: '登录后摘要读取仍未通过认证',
      message: '登录会话未能完成受保护摘要读取，页面已清空所有盯盘卡片并返回 auth-required 状态。',
    })
    return snapshot()
  }

  function logout() {
    authBoundary.clearSession()
    applyAuthRequiredState({
      code: 'missing_or_invalid_session',
      title: '已清除本地 Bearer 会话',
      message: '退出后不会保留任何受保护盯盘卡片，直到再次通过 `/api/auth/login` 建立会话。',
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
}
