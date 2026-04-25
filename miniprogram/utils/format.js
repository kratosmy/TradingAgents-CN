const padNumber = (value) => {
  return String(value).padStart(2, '0')
}

const toNumberOrNull = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

const formatDateTime = (value) => {
  if (!value) {
    return '尚未更新'
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return `${date.getMonth() + 1}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

const formatPrice = (value) => {
  const price = toNumberOrNull(value)
  if (price === null) {
    return '--'
  }

  return `¥${price.toFixed(2)}`
}

const formatChangePercent = (value) => {
  const change = toNumberOrNull(value)
  if (change === null) {
    return '暂无涨跌幅'
  }

  return `${change > 0 ? '+' : ''}${change.toFixed(2)}%`
}

const getChangeClass = (value) => {
  const change = toNumberOrNull(value)
  if (change === null) {
    return 'tone-muted'
  }

  if (change > 0) {
    return 'tone-up'
  }

  if (change < 0) {
    return 'tone-down'
  }

  return 'tone-flat'
}

const getRiskTone = (riskLevel) => {
  const normalized = typeof riskLevel === 'string' ? riskLevel : ''

  if (normalized.includes('低')) {
    return 'badge--success'
  }

  if (normalized.includes('关注') || normalized.includes('高')) {
    return 'badge--danger'
  }

  if (normalized.includes('中')) {
    return 'badge--warning'
  }

  return 'badge--neutral'
}

const getRuleStatusText = (status) => {
  return status === 'active' ? '策略生效中' : '未启用策略'
}

const TASK_STATUS_LABELS = Object.freeze({
  queued: '排队中',
  pending: '待执行',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
})

const formatTaskStatus = (status) => {
  if (!status) {
    return ''
  }

  const normalized = String(status)
  return `任务状态：${TASK_STATUS_LABELS[normalized] || normalized}`
}

module.exports = {
  formatChangePercent,
  formatDateTime,
  formatPrice,
  formatTaskStatus,
  getChangeClass,
  getRiskTone,
  getRuleStatusText,
  toNumberOrNull,
}
