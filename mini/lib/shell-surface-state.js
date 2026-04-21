const { createShellContent } = require('../data/shell-content.js')
const { mapDigestCard, selectCompactDigestCards } = require('./home-controller.js')
const { getCheckedInRuntimeConfig } = require('./runtime-config.js')

function createBadge(label, tone = 'neutral') {
  return { label, tone }
}

function buildChrome({ eyebrow, title, subtitle, badges }, runtimeConfig = getCheckedInRuntimeConfig()) {
  return {
    brandMarkPath: runtimeConfig.shell.brandMarkPath,
    brandOverline: runtimeConfig.shell.productName,
    eyebrow,
    title,
    subtitle,
    badges,
  }
}

function buildHomeMetrics(cards, signedIn) {
  if (!signedIn) {
    return [
      { label: 'Tracked', value: '—' },
      { label: 'Ready', value: 'Watch' },
      { label: 'Waiting', value: 'Gate' },
      { label: 'Rules', value: 'Live' },
    ]
  }

  const readyCount = cards.filter((card) => card.digestStatus === 'ready').length
  const waitingCount = cards.filter((card) => card.digestStatus !== 'ready').length
  const activeRuleCount = cards.filter((card) => card.ruleStatus === 'active').length

  return [
    { label: 'Tracked', value: String(cards.length) },
    { label: 'Ready', value: String(readyCount) },
    { label: 'Waiting', value: String(waitingCount) },
    { label: 'Rules', value: String(activeRuleCount) },
  ]
}

function buildHomeSurfaceState({
  previewMeta,
  digestResult,
  runtimeConfig = getCheckedInRuntimeConfig(),
  shellContent = createShellContent(runtimeConfig),
} = {}) {
  const signedIn = Boolean(digestResult && digestResult.ok)
  const cards = signedIn
    ? selectCompactDigestCards(digestResult.cards).map(mapDigestCard)
    : []
  const featuredCard = cards.find((card) => card.digestStatus === 'ready') || cards[0] || null

  return {
    chrome: buildChrome(
      {
        eyebrow: shellContent.home.eyebrow,
        title: shellContent.home.title,
        subtitle: shellContent.home.subtitle,
        badges: [
          createBadge(previewMeta?.runtimeBoundary?.mode || 'placeholder-preview', 'warn'),
          createBadge('overview only', 'accent'),
          createBadge('distinct from Watch', 'info'),
        ],
      },
      runtimeConfig,
    ),
    roleTitle: shellContent.home.roleTitle,
    roleCopy: shellContent.home.roleCopy,
    overviewHeadline: signedIn
      ? `Signed in as ${digestResult.session.user.username}`
      : 'Signed out, but the shell remains usable',
    overviewCopy: signedIn
      ? 'Home shows a concise watch summary and one highlight, while Watch continues to own the full protected digest experience.'
      : 'Home and Account remain public. Watch keeps the auth gate and protected digest surface.',
    overviewMetrics: buildHomeMetrics(cards, signedIn),
    hasFeaturedCard: Boolean(featuredCard),
    featuredBadgeTone: featuredCard && featuredCard.digestStatus === 'ready' ? 'accent' : 'warn',
    featuredBadgeLabel: featuredCard
      ? featuredCard.digestStatus === 'ready'
        ? 'ready highlight'
        : 'waiting highlight'
      : 'watch preview',
    highlightTitle: shellContent.home.highlightTitle,
    highlightCopy: featuredCard
      ? 'Home keeps this highlight concise so the detailed protected card stack stays in Watch.'
      : shellContent.home.highlightSignedOutCopy,
    featuredCard,
    sessionUserLabel: signedIn
      ? `${digestResult.session.user.username} · ${digestResult.session.user.id}`
      : 'No active bearer session yet.',
    runtimeBoundary: previewMeta?.runtimeBoundary || {},
    quickActionCopy: shellContent.home.quickActionCopy,
    watchButtonLabel: shellContent.home.watchButtonLabel,
    accountButtonLabel: shellContent.home.accountButtonLabel,
  }
}

function buildWatchSurfaceMeta({
  previewMeta,
  runtimeConfig = getCheckedInRuntimeConfig(),
  shellContent = createShellContent(runtimeConfig),
} = {}) {
  return {
    chrome: buildChrome(
      {
        eyebrow: shellContent.watch.eyebrow,
        title: shellContent.watch.title,
        subtitle: shellContent.watch.subtitle,
        badges: [
          createBadge('protected surface', 'accent'),
          createBadge(previewMeta?.runtimeBoundary?.mode || 'placeholder-preview', 'warn'),
          createBadge('JWT contract', 'info'),
        ],
      },
      runtimeConfig,
    ),
    watchRoleTitle: shellContent.watch.roleTitle,
    watchRoleCopy: shellContent.watch.roleCopy,
    watchSupportCopy: shellContent.watch.supportCopy,
    watchContractTitle: shellContent.watch.contractTitle,
    watchContractCopy: shellContent.watch.contractCopy,
  }
}

function buildAccountSurfaceState({
  previewMeta,
  session,
  runtimeConfig = getCheckedInRuntimeConfig(),
  shellContent = createShellContent(runtimeConfig),
} = {}) {
  const signedIn = Boolean(session)

  return {
    chrome: buildChrome(
      {
        eyebrow: shellContent.account.eyebrow,
        title: shellContent.account.title,
        subtitle: shellContent.account.subtitle,
        badges: [
          createBadge('identity + help', 'accent'),
          createBadge(previewMeta?.runtimeBoundary?.mode || 'placeholder-preview', 'warn'),
          createBadge('round-trip pages', 'info'),
        ],
      },
      runtimeConfig,
    ),
    roleTitle: shellContent.account.roleTitle,
    roleCopy: shellContent.account.roleCopy,
    identityTitle: signedIn ? 'Account session is ready' : 'Account remains available before sign-in',
    identityCopy: signedIn
      ? 'Identity state lives here while detailed protected digests continue to belong to Watch.'
      : 'Use Watch to sign in, then return here for session actions and legal/help pages.',
    identityBadge: signedIn ? 'signed in' : 'signed out',
    identityTone: signedIn ? 'accent' : 'warn',
    sessionUserLabel: signedIn ? `${session.user.username} · ${session.user.id}` : 'No active bearer session.',
    showLogout: signedIn,
    primaryActionLabel: shellContent.account.watchButtonLabel,
    secondaryActionLabel: shellContent.account.homeButtonLabel,
    accountIntro: shellContent.account.intro,
    menuItems: shellContent.secondaryPages.map((page) => ({
      ...page,
      roundTripLabel: `Account → ${page.label} → Account`,
    })),
    runtimeBoundary: previewMeta?.runtimeBoundary || {},
  }
}

function buildAccountSecondarySurfaceState({
  previewMeta,
  pageKey,
  runtimeConfig = getCheckedInRuntimeConfig(),
  shellContent = createShellContent(runtimeConfig),
} = {}) {
  const page = shellContent.secondaryPages.find((item) => item.key === pageKey)
  if (!page) {
    throw new Error(`Unknown Account secondary page: ${pageKey}`)
  }

  return {
    chrome: buildChrome(
      {
        eyebrow: `Account / ${page.label}`,
        title: page.label,
        subtitle: page.subtitle,
        badges: [
          createBadge('Account leaf', 'accent'),
          createBadge('round-trip', 'info'),
          createBadge(previewMeta?.runtimeBoundary?.mode || 'placeholder-preview', 'warn'),
        ],
      },
      runtimeConfig,
    ),
    summaryTitle: page.summaryTitle,
    summaryCopy: page.summaryCopy,
    points: page.points,
    roundTripCopy: `Round-trip path: Account → ${page.label} → Account.`,
    returnLabel: '返回 Account',
  }
}

module.exports = {
  buildAccountSecondarySurfaceState,
  buildAccountSurfaceState,
  buildHomeSurfaceState,
  buildWatchSurfaceMeta,
}
