const previewMetaModule = require('../../data/digest-cards.js')
const {
  DEFAULT_BASE_URL,
  createMiniAuthSessionBoundary,
  createWxRequestTransport,
} = require('../../lib/auth-session-boundary.js')
const { buildBaseState, createMiniHomeController } = require('../../lib/home-controller.js')

const previewMeta = previewMetaModule.createPreviewMeta()

Page({
  data: buildBaseState(previewMeta),

  onLoad() {
    const app = typeof getApp === 'function' ? getApp() : null
    const runtimeConfig = (app && app.globalData && app.globalData.runtimeConfig) || null
    const previewMeta = previewMetaModule.createPreviewMeta(runtimeConfig)
    const baseUrl = (app && app.globalData && app.globalData.apiBaseUrl) || DEFAULT_BASE_URL

    this.controller = createMiniHomeController({
      authBoundary: createMiniAuthSessionBoundary({
        baseUrl,
        storage: wx,
        request: createWxRequestTransport(wx),
      }),
      previewMeta,
    })

    this.setData(this.controller.getState())
    this.refreshProtectedCards()
  },

  async refreshProtectedCards() {
    if (!this.controller) {
      return
    }

    const nextState = await this.controller.hydrate()
    this.setData(nextState)
  },

  onUsernameInput(event) {
    if (!this.controller) {
      return
    }

    this.setData(
      this.controller.setCredentials({
        username: event.detail.value,
      }),
    )
  },

  onPasswordInput(event) {
    if (!this.controller) {
      return
    }

    this.setData(
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
    this.setData(nextState)
  },

  onLogout() {
    if (!this.controller) {
      return
    }

    this.setData(this.controller.logout())
  },
})
