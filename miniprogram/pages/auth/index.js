const app = getApp()

const {
  applyLoginResponse,
  bindWechatCode,
  getWechatBindStatus,
  loginWithWechatCode,
  requestWechatCode,
  unbindWechat,
} = require('../../services/auth')
const {
  hasUsableAccessToken,
  hasUsableApiBaseUrl,
  loadRuntimeSettings,
  saveRuntimeSettings,
} = require('../../services/runtime-settings')

Page({
  data: {
    loading: false,
    apiReady: false,
    loggedIn: false,
    bindStatusText: '未查询',
    errorMessage: '',
    userText: '未登录',
  },

  onShow() {
    this.syncState()
    this.loadBindStatus()
  },

  getRuntimeSettings() {
    const runtimeSettings = app.globalData.runtimeSettings || loadRuntimeSettings()
    app.globalData.runtimeSettings = runtimeSettings
    return runtimeSettings
  },

  syncState(nextSettings) {
    const runtimeSettings = nextSettings || this.getRuntimeSettings()
    const user = runtimeSettings.user || {}
    const loggedIn = hasUsableAccessToken(runtimeSettings)

    this.setData({
      apiReady: hasUsableApiBaseUrl(runtimeSettings),
      loggedIn,
      userText: loggedIn ? `${user.username || user.name || '微信用户'}` : '未登录',
    })
  },

  async handleWechatLogin() {
    const runtimeSettings = this.getRuntimeSettings()
    if (!hasUsableApiBaseUrl(runtimeSettings)) {
      this.setData({ errorMessage: '请先在设置页填写 API Base URL' })
      return
    }

    this.setData({ loading: true, errorMessage: '' })

    try {
      const code = await requestWechatCode()
      const response = await loginWithWechatCode(code, {}, runtimeSettings)
      const savedSettings = applyLoginResponse(response, runtimeSettings)
      app.globalData.runtimeSettings = savedSettings
      this.syncState(savedSettings)

      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '微信登录成功', icon: 'success' })
      }

      await this.loadBindStatus()
    } catch (error) {
      this.setData({
        errorMessage: error && error.message ? error.message : '微信登录失败',
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async handleWechatBind() {
    const runtimeSettings = this.getRuntimeSettings()
    if (!hasUsableAccessToken(runtimeSettings)) {
      this.setData({ errorMessage: '请先登录或在设置页填写访问令牌' })
      return
    }

    this.setData({ loading: true, errorMessage: '' })

    try {
      const code = await requestWechatCode()
      await bindWechatCode(code, {}, runtimeSettings)

      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '绑定成功', icon: 'success' })
      }

      await this.loadBindStatus()
    } catch (error) {
      this.setData({
        errorMessage: error && error.message ? error.message : '微信绑定失败',
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadBindStatus() {
    const runtimeSettings = this.getRuntimeSettings()
    this.syncState(runtimeSettings)

    if (!hasUsableAccessToken(runtimeSettings)) {
      this.setData({ bindStatusText: '未登录，无法查询绑定状态' })
      return
    }

    try {
      const response = await getWechatBindStatus(runtimeSettings)
      const data = response.data || {}
      this.setData({
        bindStatusText: data.bound ? `已绑定 ${data.openid_masked || '微信身份'}` : '未绑定微信身份',
      })
    } catch (error) {
      this.setData({
        bindStatusText: '绑定状态查询失败',
        errorMessage: error && error.message ? error.message : '绑定状态查询失败',
      })
    }
  },

  async handleWechatUnbind() {
    const runtimeSettings = this.getRuntimeSettings()
    if (!hasUsableAccessToken(runtimeSettings)) {
      this.setData({ errorMessage: '请先登录或在设置页填写访问令牌' })
      return
    }

    this.setData({ loading: true, errorMessage: '' })

    try {
      await unbindWechat(runtimeSettings)
      await this.loadBindStatus()
    } catch (error) {
      this.setData({
        errorMessage: error && error.message ? error.message : '解绑失败',
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleLogout() {
    const runtimeSettings = this.getRuntimeSettings()
    const savedSettings = saveRuntimeSettings({
      ...runtimeSettings,
      accessToken: 'paste-your-jwt-access-token-here',
      refreshToken: '',
      user: null,
    })
    app.globalData.runtimeSettings = savedSettings
    this.syncState(savedSettings)
    this.setData({ bindStatusText: '已退出登录' })
  },

  handleOpenSettings() {
    if (typeof wx !== 'undefined' && typeof wx.navigateTo === 'function') {
      wx.navigateTo({ url: '/pages/settings/index' })
    }
  },

  handleOpenWatch() {
    if (typeof wx !== 'undefined' && typeof wx.redirectTo === 'function') {
      wx.redirectTo({ url: '/pages/watch/index' })
    }
  },
})
