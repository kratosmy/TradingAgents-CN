const { loadRuntimeSettings, saveRuntimeSettings } = require('./services/runtime-settings')

App({
  globalData: {
    runtimeSettings: loadRuntimeSettings(),
  },

  onLaunch() {
    this.globalData.runtimeSettings = loadRuntimeSettings()
  },

  updateRuntimeSettings(nextSettings) {
    const runtimeSettings = saveRuntimeSettings(nextSettings)
    this.globalData.runtimeSettings = runtimeSettings
    return runtimeSettings
  },
})
