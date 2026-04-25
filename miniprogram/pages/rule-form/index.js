const app = getApp()

const { saveWatchRule } = require('../../services/watch')
const { hasUsableAccessToken, loadRuntimeSettings } = require('../../services/runtime-settings')

const SCHEDULE_OPTIONS = [
  { label: '每天盘前', value: 'daily_pre_market' },
  { label: '每天盘后', value: 'daily_post_market' },
  { label: '盘中播报', value: 'intra_day' },
  { label: '每周复盘', value: 'weekly_review' },
]

Page({
  data: {
    loading: false,
    scheduleOptions: SCHEDULE_OPTIONS.map((item) => item.label),
    scheduleIndex: 1,
    statusOptions: ['启用', '停用'],
    statusIndex: 0,
    form: {
      stock_code: '',
      stock_name: '',
      market: 'A股',
      schedule_type: 'daily_post_market',
      status: 'active',
    },
    errorMessage: '',
  },

  onLoad(options = {}) {
    const scheduleIndex = SCHEDULE_OPTIONS.findIndex((item) => item.value === options.schedule_type)
    const statusIndex = options.status === 'paused' || options.status === 'inactive' ? 1 : 0

    this.setData({
      scheduleIndex: scheduleIndex >= 0 ? scheduleIndex : 1,
      statusIndex,
      form: {
        stock_code: decodeURIComponent(options.stock_code || ''),
        stock_name: decodeURIComponent(options.stock_name || ''),
        market: decodeURIComponent(options.market || 'A股'),
        schedule_type: scheduleIndex >= 0 ? SCHEDULE_OPTIONS[scheduleIndex].value : 'daily_post_market',
        status: statusIndex === 1 ? 'paused' : 'active',
      },
    })
  },

  getRuntimeSettings() {
    const runtimeSettings = app.globalData.runtimeSettings || loadRuntimeSettings()
    app.globalData.runtimeSettings = runtimeSettings
    return runtimeSettings
  },

  handleScheduleChange(event) {
    const scheduleIndex = Number(event.detail.value || 0)
    this.setData({
      scheduleIndex,
      'form.schedule_type': SCHEDULE_OPTIONS[scheduleIndex]?.value || 'daily_post_market',
    })
  },

  handleStatusChange(event) {
    const statusIndex = Number(event.detail.value || 0)
    this.setData({
      statusIndex,
      'form.status': statusIndex === 1 ? 'paused' : 'active',
    })
  },

  async handleSubmit() {
    const runtimeSettings = this.getRuntimeSettings()
    if (!hasUsableAccessToken(runtimeSettings)) {
      this.setData({ errorMessage: '请先登录或填写访问令牌' })
      return
    }

    if (!this.data.form.stock_code) {
      this.setData({ errorMessage: '缺少股票代码' })
      return
    }

    this.setData({ loading: true, errorMessage: '' })

    try {
      await saveWatchRule(this.data.form.stock_code, this.data.form, runtimeSettings)

      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '策略已保存', icon: 'success' })
      }

      if (typeof wx !== 'undefined' && typeof wx.navigateBack === 'function') {
        wx.navigateBack()
      }
    } catch (error) {
      this.setData({
        errorMessage: error && error.message ? error.message : '保存策略失败',
      })
    } finally {
      this.setData({ loading: false })
    }
  },
})
