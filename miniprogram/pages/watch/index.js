const app = getApp()

const { loadWatchHomeData, refreshAllDigests, refreshDigest, removeFavorite } = require('../../services/watch')
const { isRuntimeConfigured, loadRuntimeSettings } = require('../../services/runtime-settings')
const { formatDateTime } = require('../../utils/format')

Page({
  data: {
    loading: false,
    configReady: false,
    cards: [],
    errorMessage: '',
    refreshingAll: false,
    refreshingCode: '',
    lastUpdatedText: '请先在设置页填写接口地址与访问令牌',
  },

  onShow() {
    this.loadPage()
  },

  onPullDownRefresh() {
    this.loadPage({ stopPullDownRefresh: true })
  },

  getRuntimeSettings() {
    const runtimeSettings = app.globalData.runtimeSettings || loadRuntimeSettings()
    app.globalData.runtimeSettings = runtimeSettings
    return runtimeSettings
  },

  async loadPage(options = {}) {
    const stopPullDownRefresh = Boolean(options.stopPullDownRefresh)
    const runtimeSettings = this.getRuntimeSettings()
    const configReady = isRuntimeConfigured(runtimeSettings)

    this.setData({
      configReady,
      errorMessage: '',
      cards: configReady ? this.data.cards : [],
      loading: configReady,
      lastUpdatedText: configReady ? this.data.lastUpdatedText : '请先在设置页填写接口地址与访问令牌',
    })

    if (!configReady) {
      this.finishLoading(stopPullDownRefresh)
      return
    }

    try {
      const result = await loadWatchHomeData(runtimeSettings)
      this.setData({
        cards: result.cards,
        lastUpdatedText: `最近同步 ${formatDateTime(new Date())}`,
      })
    } catch (error) {
      this.setData({
        cards: [],
        errorMessage: error && error.message ? error.message : '加载盯盘快照失败',
      })
    } finally {
      this.finishLoading(stopPullDownRefresh)
    }
  },

  finishLoading(stopPullDownRefresh) {
    this.setData({
      loading: false,
      refreshingAll: false,
      refreshingCode: '',
    })

    if (stopPullDownRefresh && typeof wx !== 'undefined' && typeof wx.stopPullDownRefresh === 'function') {
      wx.stopPullDownRefresh()
    }
  },

  handleOpenSettings() {
    if (typeof wx !== 'undefined' && typeof wx.navigateTo === 'function') {
      wx.navigateTo({
        url: '/pages/settings/index',
      })
    }
  },

  handleOpenAuth() {
    if (typeof wx !== 'undefined' && typeof wx.navigateTo === 'function') {
      wx.navigateTo({
        url: '/pages/auth/index',
      })
    }
  },

  handleOpenAddFavorite() {
    if (typeof wx !== 'undefined' && typeof wx.navigateTo === 'function') {
      wx.navigateTo({
        url: '/pages/favorite-form/index',
      })
    }
  },

  handleOpenRuleForm(event) {
    const { stockCode, stockName, market, scheduleType, status } = event.currentTarget.dataset || {}
    if (!stockCode || typeof wx === 'undefined' || typeof wx.navigateTo !== 'function') {
      return
    }

    wx.navigateTo({
      url:
        `/pages/rule-form/index?stock_code=${encodeURIComponent(stockCode)}` +
        `&stock_name=${encodeURIComponent(stockName || '')}` +
        `&market=${encodeURIComponent(market || 'A股')}` +
        `&schedule_type=${encodeURIComponent(scheduleType || '')}` +
        `&status=${encodeURIComponent(status || '')}`,
    })
  },

  async handleRefreshAll() {
    if (!this.data.configReady || this.data.refreshingAll) {
      return
    }

    this.setData({
      refreshingAll: true,
      errorMessage: '',
    })

    try {
      const runtimeSettings = this.getRuntimeSettings()
      const response = await refreshAllDigests(runtimeSettings)
      const count = response && response.data && typeof response.data.count === 'number' ? response.data.count : 0

      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({
          title: count ? `已创建 ${count} 个任务` : '已创建批量任务',
          icon: 'none',
        })
      }

      await this.loadPage()
    } catch (error) {
      this.setData({
        errorMessage: error && error.message ? error.message : '批量创建解读任务失败',
      })
    } finally {
      this.setData({
        refreshingAll: false,
      })
    }
  },

  async handleRefreshCard(event) {
    const { stockCode, stockName, market } = event.currentTarget.dataset || {}
    if (!this.data.configReady || !stockCode || this.data.refreshingCode) {
      return
    }

    this.setData({
      refreshingCode: stockCode,
      errorMessage: '',
    })

    try {
      const runtimeSettings = this.getRuntimeSettings()
      await refreshDigest(stockCode, { stockName, market }, runtimeSettings)

      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({
          title: '已创建解读任务',
          icon: 'none',
        })
      }

      await this.loadPage()
    } catch (error) {
      this.setData({
        errorMessage: error && error.message ? error.message : '创建解读任务失败',
      })
    } finally {
      this.setData({
        refreshingCode: '',
      })
    }
  },

  async handleRemoveFavorite(event) {
    const { stockCode } = event.currentTarget.dataset || {}
    if (!this.data.configReady || !stockCode || this.data.refreshingCode) {
      return
    }

    const executeRemove = async () => {
      this.setData({ refreshingCode: stockCode, errorMessage: '' })
      try {
        const runtimeSettings = this.getRuntimeSettings()
        await removeFavorite(stockCode, runtimeSettings)
        await this.loadPage()
      } catch (error) {
        this.setData({
          errorMessage: error && error.message ? error.message : '移除自选股失败',
        })
      } finally {
        this.setData({ refreshingCode: '' })
      }
    }

    if (typeof wx !== 'undefined' && typeof wx.showModal === 'function') {
      wx.showModal({
        title: '移除自选股',
        content: `确定移除 ${stockCode} 吗？`,
        success(result) {
          if (result.confirm) {
            executeRemove()
          }
        },
      })
      return
    }

    await executeRemove()
  },
})
