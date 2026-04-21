import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const miniRoot = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(miniRoot, relativePath), 'utf8'))
}

function readText(relativePath) {
  return fs.readFileSync(path.join(miniRoot, relativePath), 'utf8')
}

test('publish shell registers real Home, Watch, and Account primary surfaces', () => {
  const appConfig = readJson('app.json')

  assert.deepEqual(appConfig.pages, [
    'pages/home/index',
    'pages/watch/index',
    'pages/account/index',
    'pages/account/settings/index',
    'pages/account/about/index',
    'pages/account/privacy/index',
    'pages/account/help/index',
  ])

  assert.equal(appConfig.tabBar.custom, true)
  assert.deepEqual(
    appConfig.tabBar.list.map((item) => item.pagePath),
    ['pages/home/index', 'pages/watch/index', 'pages/account/index'],
  )
  assert.equal(appConfig.window.backgroundColor, '#05070B')
  assert.equal(appConfig.window.navigationBarBackgroundColor, '#05070B')
})

test('shell navigation contract defines account secondary pages and round-trip helpers', () => {
  const shellNavigation = require('../lib/shell-navigation.js')

  assert.deepEqual(
    shellNavigation.PRIMARY_SURFACES.map((item) => item.key),
    ['home', 'watch', 'account'],
  )
  assert.deepEqual(
    shellNavigation.ACCOUNT_SECONDARY_PAGES.map((item) => item.key),
    ['settings', 'about', 'privacy', 'help'],
  )
  assert.ok(
    shellNavigation.ACCOUNT_SECONDARY_PAGES.every(
      (item) => item.pagePath.startsWith('/pages/account/') && item.returnPath === '/pages/account/index',
    ),
  )

  const calls = []
  const wxLike = {
    switchTab(options) {
      calls.push(['switchTab', options])
    },
    navigateTo(options) {
      calls.push(['navigateTo', options])
    },
    navigateBack(options) {
      calls.push(['navigateBack', options])
    },
  }

  shellNavigation.switchToPrimarySurface(wxLike, '/pages/watch/index')
  shellNavigation.openAccountSecondaryPage(wxLike, '/pages/account/privacy/index')
  shellNavigation.returnToAccountSurface(wxLike)

  assert.deepEqual(calls, [
    ['switchTab', { url: '/pages/watch/index' }],
    ['navigateTo', { url: '/pages/account/privacy/index' }],
    ['navigateBack', { delta: 1 }],
  ])
})

test('primary shell surfaces reuse shared dark-premium tokens and branded chrome', () => {
  const sharedShellStyles = readText('styles/shell.wxss')
  const customTabBarTemplate = readText('custom-tab-bar/index.wxml')
  const shellChromeTemplate = readText('components/shell-chrome/index.wxml')

  assert.match(sharedShellStyles, /\.shell-page/)
  assert.match(sharedShellStyles, /\.shell-surface-card/)
  assert.match(sharedShellStyles, /\.shell-primary-action/)
  assert.match(sharedShellStyles, /\.shell-title/)
  assert.match(sharedShellStyles, /#05070B/i)
  assert.match(sharedShellStyles, /#1ED760/i)

  assert.match(customTabBarTemplate, /TradingAgents Mini/)
  assert.match(shellChromeTemplate, /brandMarkPath/)

  assert.match(readText('pages/home/index.wxss'), /styles\/shell\.wxss/)
  assert.match(readText('pages/watch/index.wxss'), /styles\/shell\.wxss/)
  assert.match(readText('pages/account/index.wxss'), /styles\/shell\.wxss/)
})

test('account secondary pages remain in-app destinations with an explicit return path', () => {
  const expectedPages = ['settings', 'about', 'privacy', 'help']
  const pageFactory = readText('lib/account-secondary-page.js')

  assert.match(pageFactory, /returnToAccountSurface/)

  for (const pageKey of expectedPages) {
    const pageJson = readJson(`pages/account/${pageKey}/index.json`)
    const pageScript = readText(`pages/account/${pageKey}/index.js`)
    const pageTemplate = readText(`pages/account/${pageKey}/index.wxml`)

    assert.match(pageJson.navigationBarTitleText, /Settings|About|Privacy|Help/)
    assert.match(pageScript, /createAccountSecondaryPage/)
    assert.match(pageTemplate, /返回 Account/)
  }
})
