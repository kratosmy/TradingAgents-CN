const previewMetaModule = require('../../data/digest-cards.js')
const {
  DEFAULT_BASE_URL,
  createMiniAuthSessionBoundary,
  createWxRequestTransport,
} = require('../../lib/auth-session-boundary.js')
const { switchToPrimarySurface, syncShellTabBar } = require('../../lib/shell-navigation.js')
const { buildHomeSurfaceState } = require('../../lib/shell-surface-state.js')

const previewMeta = previewMetaModule.createPreviewMeta()

Page({
  data: buildHomeSurfaceState({
    previewMeta,
  }),

  onLoad() {
    const app = typeof getApp === 'function' ? getApp() : null
    const runtimeConfig = (app && app.globalData && app.globalData.runtimeConfig) || null
    const baseUrl = (app && app.globalData && app.globalData.apiBaseUrl) || DEFAULT_BASE_URL

    this.previewMeta = previewMetaModule.createPreviewMeta(runtimeConfig)
    this.authBoundary = createMiniAuthSessionBoundary({
      baseUrl,
      storage: wx,
      request: createWxRequestTransport(wx),
    })

    this.setData(
      buildHomeSurfaceState({
        previewMeta: this.previewMeta,
      }),
    )
    this.refreshOverview()
  },

  onShow() {
    syncShellTabBar(this, '/pages/home/index')
    if (this.authBoundary) {
      this.refreshOverview()
    }
  },

  async refreshOverview() {
    if (!this.authBoundary || !this.previewMeta) {
      return
    }

    const digestResult = await this.authBoundary.loadDigests()
    this.setData(
      buildHomeSurfaceState({
        previewMeta: this.previewMeta,
        digestResult,
      }),
    )
  },

  onOpenWatch() {
    switchToPrimarySurface(wx, '/pages/watch/index')
  },

  onOpenAccount() {
    switchToPrimarySurface(wx, '/pages/account/index')
  },
})
