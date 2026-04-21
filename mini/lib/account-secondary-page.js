const previewMetaModule = require('../data/digest-cards.js')
const { buildAccountSecondarySurfaceState } = require('./shell-surface-state.js')
const { returnToAccountSurface, switchToPrimarySurface } = require('./shell-navigation.js')

function createAccountSecondaryPage(pageKey) {
  const initialPreviewMeta = previewMetaModule.createPreviewMeta()

  return {
    data: buildAccountSecondarySurfaceState({
      previewMeta: initialPreviewMeta,
      pageKey,
    }),

    onLoad() {
      const app = typeof getApp === 'function' ? getApp() : null
      const runtimeConfig = (app && app.globalData && app.globalData.runtimeConfig) || null

      this.previewMeta = previewMetaModule.createPreviewMeta(runtimeConfig)
      this.setData(
        buildAccountSecondarySurfaceState({
          previewMeta: this.previewMeta,
          pageKey,
        }),
      )
    },

    onChromeBack() {
      returnToAccountSurface(wx)
    },

    onReturnToAccount() {
      returnToAccountSurface(wx)
    },

    onOpenWatch() {
      switchToPrimarySurface(wx, '/pages/watch/index')
    },

    onOpenHome() {
      switchToPrimarySurface(wx, '/pages/home/index')
    },
  }
}

module.exports = {
  createAccountSecondaryPage,
}
