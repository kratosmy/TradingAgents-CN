const PRIMARY_SURFACES = Object.freeze([
  Object.freeze({
    key: 'home',
    label: 'Home',
    pagePath: '/pages/home/index',
    navHint: 'Overview',
    responsibility: 'Product overview, highlight-level watch summary, and runtime posture.',
  }),
  Object.freeze({
    key: 'watch',
    label: 'Watch',
    pagePath: '/pages/watch/index',
    navHint: 'Protected digests',
    responsibility: 'Primary protected digest surface for login, loading, waiting, and ready cards.',
  }),
  Object.freeze({
    key: 'account',
    label: 'Account',
    pagePath: '/pages/account/index',
    navHint: 'Identity hub',
    responsibility: 'Identity state plus entry to Settings, About, Privacy, and Help.',
  }),
])

const ACCOUNT_SECONDARY_PAGES = Object.freeze([
  Object.freeze({
    key: 'settings',
    label: 'Settings',
    pagePath: '/pages/account/settings/index',
    returnPath: '/pages/account/index',
    description: 'Shell preferences, notification posture, and runtime-boundary reminders.',
  }),
  Object.freeze({
    key: 'about',
    label: 'About',
    pagePath: '/pages/account/about/index',
    returnPath: '/pages/account/index',
    description: 'Mini product positioning, shell responsibilities, and delivery scope.',
  }),
  Object.freeze({
    key: 'privacy',
    label: 'Privacy',
    pagePath: '/pages/account/privacy/index',
    returnPath: '/pages/account/index',
    description: 'Privacy posture for bearer-session auth and deferred runtime boundaries.',
  }),
  Object.freeze({
    key: 'help',
    label: 'Help',
    pagePath: '/pages/account/help/index',
    returnPath: '/pages/account/index',
    description: 'Support paths, sign-in guidance, and deferred operator/runtime next steps.',
  }),
])

function cloneItem(item) {
  return { ...item }
}

function getPrimarySurfaces() {
  return PRIMARY_SURFACES.map(cloneItem)
}

function getAccountSecondaryPages() {
  return ACCOUNT_SECONDARY_PAGES.map(cloneItem)
}

function switchToPrimarySurface(wxLike, pagePath) {
  if (!wxLike || typeof wxLike.switchTab !== 'function') {
    throw new Error('wx.switchTab is required to navigate between primary shell surfaces')
  }

  wxLike.switchTab({ url: pagePath })
  return pagePath
}

function openAccountSecondaryPage(wxLike, pagePath) {
  if (!wxLike || typeof wxLike.navigateTo !== 'function') {
    throw new Error('wx.navigateTo is required to open Account secondary pages')
  }

  wxLike.navigateTo({ url: pagePath })
  return pagePath
}

function returnToAccountSurface(wxLike, fallbackPagePath = '/pages/account/index') {
  if (wxLike && typeof wxLike.navigateBack === 'function') {
    wxLike.navigateBack({ delta: 1 })
    return { type: 'navigateBack', fallbackPagePath }
  }

  if (wxLike && typeof wxLike.redirectTo === 'function') {
    wxLike.redirectTo({ url: fallbackPagePath })
    return { type: 'redirectTo', fallbackPagePath }
  }

  if (wxLike && typeof wxLike.switchTab === 'function') {
    wxLike.switchTab({ url: fallbackPagePath })
    return { type: 'switchTab', fallbackPagePath }
  }

  throw new Error('No supported WeChat navigation API was available to return to Account')
}

function syncShellTabBar(pageInstance, pagePath) {
  if (!pageInstance || typeof pageInstance.getTabBar !== 'function') {
    return
  }

  const tabBar = pageInstance.getTabBar()
  if (!tabBar || typeof tabBar.setSelected !== 'function') {
    return
  }

  tabBar.setSelected(pagePath)
}

module.exports = {
  ACCOUNT_SECONDARY_PAGES,
  PRIMARY_SURFACES,
  getAccountSecondaryPages,
  getPrimarySurfaces,
  openAccountSecondaryPage,
  returnToAccountSurface,
  switchToPrimarySurface,
  syncShellTabBar,
}
