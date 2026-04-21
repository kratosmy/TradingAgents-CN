const { getRuntimeConfig } = require('./lib/runtime-config.js')

const runtimeConfig = getRuntimeConfig()

App({
  globalData: {
    appId: runtimeConfig.appId,
    apiBaseUrl: runtimeConfig.backend.baseUrl,
    runtimeConfig,
    runtimeMode: runtimeConfig.backend.mode,
    validationMode: runtimeConfig.validation.evidenceMode,
    validationDisclosure: runtimeConfig.validation.runtimeDisclosure,
  },
})
