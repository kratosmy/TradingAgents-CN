const previewMetaModule = require('../../data/digest-cards.js')
const {
  DEFAULT_BASE_URL,
  createMiniAuthSessionBoundary,
  createWxRequestTransport,
} = require('../../lib/auth-session-boundary.js')
const { buildBaseState, createMiniHomeController } = require('../../lib/home-controller.js')
const { syncShellTabBar } = require('../../lib/shell-navigation.js')
const { buildWatchSurfaceState } = require('../../lib/shell-surface-state.js')

const previewMeta = previewMetaModule.createPreviewMeta()
const initialState = buildBaseState(previewMeta)

Page({
  data: {
    ...initialState,
    ...buildWatchSurfaceState({
      previewMeta,
      watchData: initialState,
    }),
  },

  onLoad() {
    const app = typeof getApp === 'function' ? getApp() : null
    const runtimeConfig = (app && app.globalData && app.globalData.runtimeConfig) || null
    const nextPreviewMeta = previewMetaModule.createPreviewMeta(runtimeConfig)
    const baseUrl = (app && app.globalData && app.globalData.apiBaseUrl) || DEFAULT_BASE_URL
    this.previewMeta = nextPreviewMeta

    this.controller = createMiniHomeController({
      authBoundary: createMiniAuthSessionBoundary({
        baseUrl,
        storage: wx,
        request: createWxRequestTransport(wx),
      }),
      previewMeta: nextPreviewMeta,
    })

    this.applyWatchData(buildBaseState(nextPreviewMeta))
    this.refreshProtectedCards()
  },

  onShow() {
    syncShellTabBar(this, '/pages/watch/index')
    if (this.controller) {
      this.refreshProtectedCards()
    }
  },

  async refreshProtectedCards() {
    if (!this.controller) {
      return
    }

    const nextState = await this.controller.hydrate()
    this.applyWatchData(nextState)
  },

  onUsernameInput(event) {
    if (!this.controller) {
      return
    }

    this.applyWatchData(
      this.controller.setCredentials({
        username: event.detail.value,
      }),
    )
  },

  onPasswordInput(event) {
    if (!this.controller) {
      return
    }

    this.applyWatchData(
      this.controller.setCredentials({
        password: event.detail.value,
      }),
    )
  },

  async onSubmitLogin() {
    if (!this.controller) {
      return
    }

    const nextState = await this.controller.submitLogin({
      username: this.data.username,
      password: this.data.password,
    })
    this.applyWatchData(nextState)
  },

  onLogout() {
    if (!this.controller) {
      return
    }

    this.applyWatchData(this.controller.logout())
  },

  applyWatchData(nextState) {
    this.setData({
      ...nextState,
      ...buildWatchSurfaceState({
        previewMeta: this.previewMeta || previewMeta,
        watchData: nextState,
      }),
    })
  },
})
