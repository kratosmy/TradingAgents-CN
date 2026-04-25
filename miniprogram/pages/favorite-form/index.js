const app = getApp()

const { addFavorite } = require('../../services/watch')
const { hasUsableAccessToken, loadRuntimeSettings } = require('../../services/runtime-settings')

const MARKET_OPTIONS = ['A股', '港股', '美股']

Page({
  data: {
    loading: false,
    marketOptions: MARKET_OPTIONS,
    marketIndex: 0,
    form: {
      stock_code: '',
      stock_name: '',
      market: 'A股',
      tags: '',
      notes: '',
    },
    errorMessage: '',
  },

  getRuntimeSettings() {
    const runtimeSettings = app.globalData.runtimeSettings || loadRuntimeSettings()
    app.globalData.runtimeSettings = runtimeSettings
    return runtimeSettings
  },

  handleInput(event) {
    const { field } = event.currentTarget.dataset || {}
    if (!field) {
      return
    }

    this.setData({
      [`form.${field}`]: event.detail.value,
    })
  },

  handleMarketChange(event) {
    const marketIndex = Number(event.detail.value || 0)
    this.setData({
      marketIndex,
      'form.market': MARKET_OPTIONS[marketIndex] || 'A股',
    })
  },

  buildSubmitPayload() {
    const form = this.data.form
    return {
      stock_code: form.stock_code,
      stock_name: form.stock_name,
      market: form.market,
      tags: String(form.tags || '')
        .split(/[,，\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
      notes: form.notes,
    }
  },

  async handleSubmit() {
    const runtimeSettings = this.getRuntimeSettings()
    if (!hasUsableAccessToken(runtimeSettings)) {
      this.setData({ errorMessage: '请先登录或填写访问令牌' })
      return
    }

    const payload = this.buildSubmitPayload()
    if (!payload.stock_code || !payload.stock_name) {
      this.setData({ errorMessage: '请填写股票代码和股票名称' })
      return
    }

    this.setData({ loading: true, errorMessage: '' })

    try {
      await addFavorite(payload, runtimeSettings)

      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '已添加自选股', icon: 'success' })
      }

      if (typeof wx !== 'undefined' && typeof wx.navigateBack === 'function') {
        wx.navigateBack()
      }
    } catch (error) {
      this.setData({
        errorMessage: error && error.message ? error.message : '添加自选股失败',
      })
    } finally {
      this.setData({ loading: false })
    }
  },
})
