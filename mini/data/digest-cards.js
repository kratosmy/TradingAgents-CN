module.exports = {
  localOnlyDisclosure:
    '本地源码/构建验证：当前 mini/ 证据仅证明本地 Mini 源文件与构建产物存在，不代表真实微信模拟器、真机或运行时验证。',
  previewEvidenceLabel: 'Evidence source: mini/ local source-build validation output.',
  hero: {
    eyebrow: '自选股智能盯盘',
    title: 'Mini 本地验证骨架',
    subtitle:
      '此页面使用 mini/ 自带样例数据生成本地预览与源码证据，后续真实登录/摘要读取会在独立特性中接入既有 JWT + watch digest 契约。',
  },
  checkpoints: [
    'top-level mini/ delivery surface',
    'real Mini entry + config files',
    'named local validator',
    'local-only disclosure',
  ],
  cards: [
    {
      stockCode: '600519',
      stockName: '贵州茅台',
      market: 'A股',
      board: '主板',
      exchange: 'SSE',
      currentPrice: '1688.50',
      changePercent: '+1.82%',
      changeDirection: 'up',
      digestStatus: 'ready',
      summary: '本地预览卡片：结构对齐 watch digest 紧凑字段，显示行情快照、摘要和状态标签。',
      riskLabel: '低风险',
      riskTone: 'positive',
      ruleStatus: 'active',
      taskStatus: 'completed',
      taskLabel: '摘要已生成',
      updatedAt: '18:12 更新'
    },
    {
      stockCode: '300750',
      stockName: '宁德时代',
      market: 'A股',
      board: '创业板',
      exchange: 'SZSE',
      currentPrice: '214.36',
      changePercent: '-2.14%',
      changeDirection: 'down',
      digestStatus: 'ready',
      summary: '本地预览卡片：保留风险标签与任务状态位，但不宣称真实微信运行时已验证。',
      riskLabel: '重点关注',
      riskTone: 'warning',
      ruleStatus: 'active',
      taskStatus: 'running',
      taskLabel: '策略运行中',
      updatedAt: '17:48 更新'
    },
    {
      stockCode: '000001',
      stockName: '平安银行',
      market: 'A股',
      board: '主板',
      exchange: 'SZSE',
      currentPrice: '11.28',
      changePercent: '+0.43%',
      changeDirection: 'up',
      digestStatus: 'pending',
      summary: '等待态占位卡片：表示股票仍在监控中，但当前只提供本地样例与源码验证证据。',
      riskLabel: '等待解读',
      riskTone: 'neutral',
      ruleStatus: 'pending',
      taskStatus: 'waiting',
      taskLabel: '等待任务生成',
      updatedAt: '等待解读'
    }
  ]
}
