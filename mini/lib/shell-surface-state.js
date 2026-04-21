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

function getWatchStateLabel(watchState) {
  switch (watchState) {
    case 'auth-required':
      return 'auth gate'
    case 'authenticated-empty':
      return 'authenticated empty'
    case 'waiting':
      return 'waiting'
    case 'ready':
      return 'ready'
    case 'loading':
    default:
      return 'loading'
  }
}

function getWatchStateTone(watchState) {
  switch (watchState) {
    case 'ready':
      return 'accent'
    case 'loading':
      return 'info'
    case 'auth-required':
    case 'authenticated-empty':
    case 'waiting':
    default:
      return 'warn'
  }
}

function getDefaultWatchStateCopy(watchState) {
  switch (watchState) {
    case 'auth-required':
      return {
        title: '登录后即可查看 Watch',
        copy: 'Signed-out users can still move through Home and Account, while Watch keeps the protected digest surface gated.',
        support:
          'No protected digest cards render until a valid bearer session unlocks the shared `/api/watch/digests` contract.',
      }
    case 'authenticated-empty':
      return {
        title: 'Watch 已登录，但当前没有受保护摘要卡片',
        copy: 'Authenticated-empty remains distinct from auth-required and loading so the protected surface never looks broken or falsely signed out.',
        support: 'Watch stays unlocked for this session, but it does not fabricate cards from Home or any mock source.',
      }
    case 'waiting':
      return {
        title: 'Watch 正等待受保护摘要完成',
        copy: 'Protected watch members are present, but the current digest payload is still pending; Watch keeps those waiting cards visible.',
        support:
          'Waiting stays distinct from authenticated-empty so pending protected members are not dropped or collapsed into a blank state.',
      }
    case 'ready':
      return {
        title: 'Watch 已准备好受保护摘要',
        copy: 'Ready digest cards are available on the primary protected surface, and any remaining waiting cards stay visible beside them.',
        support:
          'Watch prefers ready digest content over duplicate placeholder rows for the same canonical `stock_code` without leaking extra fields.',
      }
    case 'loading':
    default:
      return {
        title: 'Watch 正在检查受保护会话',
        copy: 'Loading remains distinct while Watch verifies any stored bearer session before showing protected digest content.',
        support:
          'Until the contract check finishes, Watch does not reveal protected cards or reuse stale content from a previous session.',
      }
  }
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
  const watchState = 'loading'

  return {
    chrome: buildChrome(
      {
        eyebrow: shellContent.watch.eyebrow,
        title: shellContent.watch.title,
        subtitle: shellContent.watch.subtitle,
        badges: [
          createBadge('protected surface', 'accent'),
          createBadge(getWatchStateLabel(watchState), getWatchStateTone(watchState)),
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

function buildWatchSurfaceState({
  previewMeta,
  watchData = {},
  runtimeConfig = getCheckedInRuntimeConfig(),
  shellContent = createShellContent(runtimeConfig),
} = {}) {
  const watchState =
    watchData.watchState ||
    (watchData.authState === 'authenticated' ? 'authenticated-empty' : 'loading')
  const watchStateTone = getWatchStateTone(watchState)
  const watchStateLabel = getWatchStateLabel(watchState)
  const watchStateCopy = getDefaultWatchStateCopy(watchState)
  const isAuthenticatedState = ['authenticated-empty', 'waiting', 'ready'].includes(watchState)
  const digestCardCount = Number.isFinite(watchData.monitoredCount) ? watchData.monitoredCount : 0
  const readyCount = Number.isFinite(watchData.readyCount) ? watchData.readyCount : 0
  const waitingCount = Number.isFinite(watchData.placeholderCount) ? watchData.placeholderCount : 0

  return {
    ...buildWatchSurfaceMeta({
      previewMeta,
      runtimeConfig,
      shellContent,
    }),
    chrome: buildChrome(
      {
        eyebrow: shellContent.watch.eyebrow,
        title: shellContent.watch.title,
        subtitle: shellContent.watch.subtitle,
        badges: [
          createBadge('protected surface', 'accent'),
          createBadge(watchStateLabel, watchStateTone),
          createBadge(previewMeta?.runtimeBoundary?.mode || 'placeholder-preview', 'warn'),
          createBadge('JWT contract', 'info'),
        ],
      },
      runtimeConfig,
    ),
    watchState,
    watchStateLabel,
    watchStateTone,
    watchStateTitle: watchData.authTitle || watchStateCopy.title,
    watchStateCopy: watchData.authMessage || watchStateCopy.copy,
    watchStateSupportCopy: watchStateCopy.support,
    showLoginForm: watchState === 'auth-required',
    showSessionSummary: Boolean(watchData.sessionUserLabel),
    showLogoutAction: isAuthenticatedState,
    showProtectedDigestSummary: isAuthenticatedState,
    showDigestCards: ['waiting', 'ready'].includes(watchState) && digestCardCount > 0,
    showAuthenticatedEmptyState: watchState === 'authenticated-empty',
    loginActionLabel: 'Sign in to Watch',
    clearSessionLabel: 'Clear session',
    protectedSummaryTitle:
      watchState === 'authenticated-empty'
        ? 'Authenticated-empty remains explicit'
        : shellContent.watch.contractTitle,
    protectedSummaryCopy:
      watchState === 'authenticated-empty'
        ? 'Watch is unlocked for this session, but there are no protected digest cards to render yet.'
        : shellContent.watch.contractCopy,
    protectedSummaryBadge:
      watchState === 'authenticated-empty'
        ? '0 protected cards'
        : `${digestCardCount} protected cards`,
    readyCount,
    waitingCount,
    runtimeBoundaryTitle: 'Placeholder runtime boundary',
    runtimeBoundaryCopy:
      'The checked-in shell stays honest about its deferred runtime while leaving later HTTPS activation to local operator overrides.',
    runtimeBoundarySupport:
      previewMeta?.runtimeBoundary?.disclosure || runtimeConfig.validation.runtimeDisclosure,
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
  buildWatchSurfaceState,
  buildWatchSurfaceMeta,
}
