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

function buildHomeMetrics(cards, homeState) {
  if (homeState === 'signed-out') {
    return [
      { label: 'Tracked', value: '—' },
      { label: 'Ready', value: 'Watch' },
      { label: 'Waiting', value: 'Gate' },
      { label: 'Rules', value: 'Live' },
    ]
  }

  if (homeState === 'authenticated-loading') {
    return [
      { label: 'Tracked', value: '—' },
      { label: 'Ready', value: 'Sync' },
      { label: 'Waiting', value: '—' },
      { label: 'Rules', value: 'Session' },
    ]
  }

  if (homeState === 'authenticated-error') {
    return [
      { label: 'Tracked', value: '—' },
      { label: 'Ready', value: 'Retry' },
      { label: 'Waiting', value: '—' },
      { label: 'Rules', value: 'Session' },
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

function deriveHomeSurfaceState({ session, digestResult, cards }) {
  if (!session) {
    return 'signed-out'
  }

  if (!digestResult) {
    return 'authenticated-loading'
  }

  if (digestResult.ok) {
    return cards.length > 0 ? 'authenticated-highlight' : 'authenticated-empty'
  }

  if (digestResult.authRequired) {
    return 'signed-out'
  }

  return 'authenticated-error'
}

function buildHomeSurfaceCopy({ homeState, session, shellContent }) {
  const username = session?.user?.username || 'Mini user'

  switch (homeState) {
    case 'signed-out':
      return {
        overviewHeadline: 'Signed out, but the shell remains usable',
        overviewCopy:
          'Home and Account remain public. Watch keeps the auth gate and protected digest surface.',
        highlightCopy: shellContent.home.highlightSignedOutCopy,
        emptyStateCopy: 'Home 不展示完整的受保护摘要堆栈；请前往 Watch 查看登录与详情卡片。',
        featuredBadgeLabel: 'watch preview',
        featuredBadgeTone: 'neutral',
      }
    case 'authenticated-loading':
      return {
        overviewHeadline: `Signed in as ${username}`,
        overviewCopy:
          'Home keeps the persisted session signed in while it refreshes the Watch overview for a concise highlight.',
        highlightCopy:
          'Until Watch responds, Home avoids signed-out copy and waits to summarize the protected digest surface honestly.',
        emptyStateCopy: '概览仍在刷新中；请稍候或前往 Watch 查看受保护摘要状态。',
        featuredBadgeLabel: 'refreshing overview',
        featuredBadgeTone: 'info',
      }
    case 'authenticated-empty':
      return {
        overviewHeadline: `Signed in as ${username}`,
        overviewCopy:
          'The persisted bearer session is ready, but Watch returned zero protected digest cards. Home keeps this authenticated-empty overview distinct from signed-out copy.',
        highlightCopy:
          'Home keeps authenticated-empty distinct so Account and Home stay aligned when Watch has zero protected cards.',
        emptyStateCopy:
          '当前会话已登录，但 Watch 还没有可展示的受保护摘要高亮；请前往 Watch 查看空态说明。',
        featuredBadgeLabel: 'authenticated empty',
        featuredBadgeTone: 'info',
      }
    case 'authenticated-error':
      return {
        overviewHeadline: `Signed in as ${username}`,
        overviewCopy:
          'The persisted bearer session is still active, but the Watch overview is temporarily unavailable. Home keeps the signed-in posture honest instead of falling back to signed-out copy.',
        highlightCopy:
          'Home treats a temporary digest read failure differently from both authenticated-empty and signed-out states.',
        emptyStateCopy: '摘要概览暂时不可用，因此 Home 不会伪造高亮卡片；请前往 Watch 重新尝试。',
        featuredBadgeLabel: 'watch unavailable',
        featuredBadgeTone: 'warn',
      }
    case 'authenticated-highlight':
    default:
      return {
        overviewHeadline: `Signed in as ${username}`,
        overviewCopy:
          'Home shows a concise watch summary and one highlight, while Watch continues to own the full protected digest experience.',
        highlightCopy:
          'Home keeps this highlight concise so the detailed protected card stack stays in Watch.',
        emptyStateCopy: 'Home 不展示完整的受保护摘要堆栈；请前往 Watch 查看登录与详情卡片。',
        featuredBadgeLabel: null,
        featuredBadgeTone: null,
      }
  }
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
  session,
  runtimeConfig = getCheckedInRuntimeConfig(),
  shellContent = createShellContent(runtimeConfig),
} = {}) {
  const persistedSession = session || digestResult?.session || null
  const cards =
    digestResult && digestResult.ok
      ? selectCompactDigestCards(digestResult.cards).map(mapDigestCard)
      : []
  const homeState = deriveHomeSurfaceState({
    session: persistedSession,
    digestResult,
    cards,
  })
  const featuredCard = homeState === 'authenticated-highlight'
    ? cards.find((card) => card.digestStatus === 'ready') || cards[0] || null
    : null
  const homeCopy = buildHomeSurfaceCopy({
    homeState,
    session: persistedSession,
    shellContent,
  })

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
    homeState,
    overviewHeadline: homeCopy.overviewHeadline,
    overviewCopy: homeCopy.overviewCopy,
    overviewMetrics: buildHomeMetrics(cards, homeState),
    hasFeaturedCard: Boolean(featuredCard),
    featuredBadgeTone:
      featuredCard && featuredCard.digestStatus === 'ready'
        ? 'accent'
        : featuredCard
          ? 'warn'
          : homeCopy.featuredBadgeTone,
    featuredBadgeLabel:
      featuredCard
        ? featuredCard.digestStatus === 'ready'
          ? 'ready highlight'
          : 'waiting highlight'
        : homeCopy.featuredBadgeLabel,
    highlightTitle: shellContent.home.highlightTitle,
    highlightCopy: homeCopy.highlightCopy,
    featuredCard,
    emptyStateCopy: homeCopy.emptyStateCopy,
    sessionUserLabel: persistedSession
      ? `${persistedSession.user.username} · ${persistedSession.user.id}`
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
      'The checked-in shell can pass manual-upload shell preflight while leaving real backend, runtime, and upload work to later local operator steps.',
    runtimeBoundarySupport: runtimeConfig.validation.manualUploadDisclosure,
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
