const app = getApp()

const {
  DEFAULT_RUNTIME_SETTINGS,
  isRuntimeConfigured,
  loadRuntimeSettings,
} = require('../../services/runtime-settings')

Page({
  data: {
    form: loadRuntimeSettings(),
    isConfigured: false,
    configuredAppId: 'wx1d02a932c4f9a4ae',
  },

  onShow() {
    this.syncForm()
  },

  syncForm() {
    const runtimeSettings = app.globalData.runtimeSettings || loadRuntimeSettings()
    app.globalData.runtimeSettings = runtimeSettings

    this.setData({
      form: runtimeSettings,
      isConfigured: isRuntimeConfigured(runtimeSettings),
    })
  },

  handleFieldInput(event) {
    const { field } = event.currentTarget.dataset || {}
    if (!field) {
      return
    }

    this.setData({
      [`form.${field}`]: event.detail.value,
    })
  },

  handleSave() {
    const runtimeSettings = app.updateRuntimeSettings(this.data.form)

    this.setData({
      form: runtimeSettings,
      isConfigured: isRuntimeConfigured(runtimeSettings),
    })

    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({
        title: '设置已保存',
        icon: 'success',
      })
    }
  },

  handleReset() {
    const runtimeSettings = app.updateRuntimeSettings(DEFAULT_RUNTIME_SETTINGS)

    this.setData({
      form: runtimeSettings,
      isConfigured: false,
    })
  },

  handleBackToWatch() {
    if (typeof wx === 'undefined') {
      return
    }

    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages.length > 1 && typeof wx.navigateBack === 'function') {
      wx.navigateBack()
      return
    }

    if (typeof wx.redirectTo === 'function') {
      wx.redirectTo({
        url: '/pages/watch/index',
      })
    }
  },
})
