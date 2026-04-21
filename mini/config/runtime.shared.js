const APP_ID = 'wx1d02a932c4f9a4ae'

module.exports = Object.freeze({
  appId: APP_ID,
  backend: Object.freeze({
    mode: 'placeholder-preview',
    baseUrl: 'https://mini-runtime-placeholder.invalid',
    displayName: 'Placeholder preview runtime',
    statusNote:
      'Checked-in Mini config ships with a non-loopback placeholder backend target until an operator-private override provides a real HTTPS runtime.',
  }),
  shell: Object.freeze({
    productName: 'TradingAgents Mini',
    entryName: 'TradingAgents 盯盘助手',
    projectName: 'TradingAgentsMiniImportShell',
    navigationBarTitle: 'TradingAgents Mini',
    pageTitle: 'TradingAgents 盯盘助手',
    brandMarkPath: '/assets/tradingagents-mini-logo.png',
    previewBrandMarkPath: '../assets/tradingagents-mini-logo.svg',
    brandMarkAlt: 'TradingAgents Mini 品牌标识',
  }),
  validation: Object.freeze({
    evidenceMode: 'source-build-import-shell',
    runtimeDisclosure:
      '当前证据仅覆盖已提交的 Mini 导入壳配置与本地源码/构建结果；默认运行时仍是占位预览目标，不代表真实微信运行时、真机、上传或线上后端验证。',
    previewDisclosure:
      '当前 mini/ 仅验证可导入的壳层配置与本地源码/构建产物，不代表真实微信模拟器、真机、上传或线上运行时成功。',
    previewEvidenceLabel:
      'Evidence source: mini/ source-build import shell preview with a placeholder-safe runtime default.',
  }),
  operatorOverrides: Object.freeze({
    localRuntimeConfigPath: 'mini/config/runtime.local.js',
    devtoolsPrivateConfigPath: 'mini/project.private.config.json',
    swapSummary:
      '后续切换到真实 HTTPS 后端时，仅需提供本地私有运行时覆盖配置或 DevTools 私有项目配置，无需修改页面或业务逻辑源码。',
  }),
})
