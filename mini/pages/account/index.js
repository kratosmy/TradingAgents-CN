const previewMetaModule = require('../../data/digest-cards.js')
const {
  DEFAULT_BASE_URL,
  createMiniAuthSessionBoundary,
  createWxRequestTransport,
} = require('../../lib/auth-session-boundary.js')
const {
  openAccountSecondaryPage,
  switchToPrimarySurface,
  syncShellTabBar,
} = require('../../lib/shell-navigation.js')
const { buildAccountSurfaceState } = require('../../lib/shell-surface-state.js')

const previewMeta = previewMetaModule.createPreviewMeta()

Page({
  data: buildAccountSurfaceState({
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

    this.refreshAccountSurface()
  },

  onShow() {
    syncShellTabBar(this, '/pages/account/index')
    this.refreshAccountSurface()
  },

  refreshAccountSurface() {
    const session = this.authBoundary ? this.authBoundary.getSession() : null
    this.setData(
      buildAccountSurfaceState({
        previewMeta: this.previewMeta || previewMeta,
        session,
      }),
    )
  },

  onOpenMenu(event) {
    const pagePath = event.currentTarget.dataset.pagePath
    if (!pagePath) {
      return
    }

    openAccountSecondaryPage(wx, pagePath)
  },

  onOpenWatch() {
    switchToPrimarySurface(wx, '/pages/watch/index')
  },

  onOpenHome() {
    switchToPrimarySurface(wx, '/pages/home/index')
  },

  onLogout() {
    if (!this.authBoundary) {
      return
    }

    this.authBoundary.clearSession()
    this.refreshAccountSurface()
  },
})
