const miniDigestData = require('../../data/digest-cards.js')

function countActiveRules(cards) {
  return cards.filter((card) => card.ruleStatus === 'active').length
}

Page({
  data: {
    localOnlyDisclosure: miniDigestData.localOnlyDisclosure,
    previewEvidenceLabel: miniDigestData.previewEvidenceLabel,
    hero: miniDigestData.hero,
    checkpoints: miniDigestData.checkpoints,
    cards: miniDigestData.cards,
    monitoredCount: miniDigestData.cards.length,
    activeRuleCount: countActiveRules(miniDigestData.cards),
  },
})
