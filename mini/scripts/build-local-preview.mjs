import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const miniRoot = path.resolve(__dirname, '..')
const distDir = path.join(miniRoot, 'dist')
const require = createRequire(import.meta.url)
const { createPreviewMeta } = require('../data/digest-cards.js')
const { createShellContent } = require('../data/shell-content.js')
const {
  createMemoryStorage,
  createMiniAuthSessionBoundary,
  normalizeSessionEnvelope,
} = require('../lib/auth-session-boundary.js')
const { createMiniHomeController } = require('../lib/home-controller.js')
const { PRIMARY_SURFACES, ACCOUNT_SECONDARY_PAGES } = require('../lib/shell-navigation.js')
const {
  buildAccountSecondarySurfaceState,
  buildAccountSurfaceState,
  buildHomeSurfaceState,
} = require('../lib/shell-surface-state.js')
const { getCheckedInRuntimeConfig, isLoopbackUrl } = require('../lib/runtime-config.js')

const runtimeConfig = getCheckedInRuntimeConfig()
const previewMeta = createPreviewMeta(runtimeConfig)
const shellContent = createShellContent(runtimeConfig)
const previewSession = normalizeSessionEnvelope({
  success: true,
  data: previewMeta.previewSession,
})

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function buildWatchPreviewStates() {
  const authRequiredController = createMiniHomeController({
    previewMeta,
    authBoundary: createMiniAuthSessionBoundary({
      storage: createMemoryStorage(),
      request: async () => ({
        statusCode: 401,
        data: { detail: 'Invalid token' },
      }),
    }),
  })

  const authRequiredState = await authRequiredController.hydrate()

  const loginFailureStates = []
  for (const failure of previewMeta.previewAuthFailures) {
    const controller = createMiniHomeController({
      previewMeta,
      authBoundary: createMiniAuthSessionBoundary({
        storage: createMemoryStorage(),
        request: async () => ({
          statusCode: failure.statusCode,
          data:
            failure.statusCode === 422
              ? { detail: [{ loc: ['body', 'username'], msg: 'Field required', type: 'missing' }] }
              : { detail: failure.detail },
        }),
      }),
    })

    const state = await controller.submitLogin({
      username: failure.statusCode === 400 ? '' : 'mini-preview',
      password: failure.statusCode === 400 ? '' : 'bad-password',
    })

    loginFailureStates.push({
      ...failure,
      state,
    })
  }

  const authenticatedController = createMiniHomeController({
    previewMeta,
    authBoundary: createMiniAuthSessionBoundary({
      storage: createMemoryStorage(),
      request: async (options) => {
        if (options.url.endsWith('/api/auth/login')) {
          return {
            statusCode: 200,
            data: {
              success: true,
              data: previewMeta.previewSession,
            },
          }
        }

        return {
          statusCode: 200,
          data: {
            success: true,
            data: previewMeta.previewCards,
          },
        }
      },
    }),
  })

  const authenticatedState = await authenticatedController.submitLogin({
    username: 'mini-preview',
    password: 'correct-password',
  })

  return {
    authRequiredState,
    loginFailureStates,
    authenticatedState,
  }
}

function renderBadges(badges = []) {
  return badges
    .map(
      (badge) =>
        `<span class="badge badge--${escapeHtml(badge.tone || 'neutral')}">${escapeHtml(badge.label)}</span>`,
    )
    .join('')
}

function renderHomeMetrics(metrics) {
  return metrics
    .map(
      (metric) => `
        <div class="metric-card">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
        </div>
      `,
    )
    .join('')
}

function renderDigestCards(cards) {
  return cards
    .map(
      (card) => `
        <article class="panel digest-card">
          <div class="row split">
            <div>
              <h4>${escapeHtml(card.stockName)} · ${escapeHtml(card.stockCode)}</h4>
              <p class="muted">${escapeHtml(card.market)} · ${escapeHtml(card.board)} · ${escapeHtml(card.exchange)}</p>
            </div>
            <span class="badge badge--${escapeHtml(
              card.riskTone === 'positive' ? 'accent' : card.riskTone === 'warning' ? 'warn' : 'neutral',
            )}">${escapeHtml(card.riskLabel)}</span>
          </div>
          <div class="row split">
            <div class="price">¥${escapeHtml(card.currentPrice)}</div>
            <span class="badge badge--${escapeHtml(
              card.changeDirection === 'up' ? 'accent' : card.changeDirection === 'down' ? 'warn' : 'neutral',
            )}">${escapeHtml(card.changePercent)}</span>
          </div>
          <p>${escapeHtml(card.summary)}</p>
          <div class="status-grid">
            <div class="status-card"><span>digest_status</span><strong>${escapeHtml(card.digestStatus)}</strong></div>
            <div class="status-card"><span>rule_status</span><strong>${escapeHtml(card.ruleStatus)}</strong></div>
            <div class="status-card"><span>task_status</span><strong>${escapeHtml(card.taskStatus)}</strong></div>
          </div>
          <div class="row split meta">
            <span>${escapeHtml(card.taskLabel)}</span>
            <span>${escapeHtml(card.updatedAt)}</span>
          </div>
        </article>
      `,
    )
    .join('')
}

function renderFailureStates(failureStates) {
  return failureStates
    .map(
      ({ label, statusCode, state }) => `
        <article class="panel">
          <div class="row">
            <span class="badge badge--warn">login failure</span>
            <span class="badge badge--info">HTTP ${statusCode}</span>
          </div>
          <h4>${escapeHtml(label)}</h4>
          <p><strong>${escapeHtml(state.loginErrorCode)}</strong></p>
          <p>${escapeHtml(state.loginErrorMessage)}</p>
        </article>
      `,
    )
    .join('')
}

function renderPrimarySurfaces() {
  return PRIMARY_SURFACES.map(
    (surface) => `
      <article class="panel">
        <div class="row split">
          <h3>${escapeHtml(surface.label)}</h3>
          <span class="badge badge--accent">${escapeHtml(surface.navHint)}</span>
        </div>
        <p>${escapeHtml(surface.responsibility)}</p>
      </article>
    `,
  ).join('')
}

function renderAccountMenu(menuItems) {
  return menuItems
    .map(
      (item) => `
        <article class="menu-item">
          <div>
            <h4>${escapeHtml(item.label)}</h4>
            <p>${escapeHtml(item.description)}</p>
            <p class="muted">${escapeHtml(item.roundTripLabel)}</p>
          </div>
          <span class="chevron">›</span>
        </article>
      `,
    )
    .join('')
}

function renderLeafPages(leafStates) {
  return leafStates
    .map(
      (state) => `
        <article class="panel">
          <div class="row split">
            <h3>${escapeHtml(state.chrome.title)}</h3>
            <span class="badge badge--info">返回 Account</span>
          </div>
          <p>${escapeHtml(state.summaryCopy)}</p>
          <ul class="bullet-list">
            ${state.points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}
          </ul>
          <p class="muted">${escapeHtml(state.roundTripCopy)}</p>
        </article>
      `,
    )
    .join('')
}

const watchPreviewStates = await buildWatchPreviewStates()
const homeSurfaceState = buildHomeSurfaceState({
  previewMeta,
  digestResult: {
    ok: true,
    cards: previewMeta.previewCards,
    session: previewSession,
  },
})
const accountSurfaceState = buildAccountSurfaceState({
  previewMeta,
  session: previewSession,
})
const accountLeafStates = ACCOUNT_SECONDARY_PAGES.map((page) =>
  buildAccountSecondarySurfaceState({
    previewMeta,
    pageKey: page.key,
  }),
)

const html = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(runtimeConfig.shell.projectName)} Preview</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
        background: #05070b;
        color: #f5f7fb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: radial-gradient(circle at top, rgba(30, 215, 96, 0.12), transparent 28%), #05070b;
      }
      main {
        max-width: 520px;
        margin: 0 auto;
        padding: 24px 16px 112px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .panel {
        border-radius: 24px;
        padding: 20px;
        background: rgba(13, 18, 26, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 24px 56px rgba(0, 0, 0, 0.32);
      }
      .hero {
        background: linear-gradient(160deg, rgba(14, 21, 31, 0.98), rgba(5, 7, 11, 0.98));
      }
      .row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .split {
        justify-content: space-between;
      }
      h1, h2, h3, h4, p { margin: 0; }
      h1 { font-size: 30px; margin-top: 8px; }
      h2, h3, h4 { color: #ffffff; }
      p, li, code, .muted { color: #a6b1c2; line-height: 1.7; }
      .muted { font-size: 13px; }
      .brand-row {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .brand-mark {
        width: 72px;
        height: 72px;
        border-radius: 20px;
      }
      .eyebrow {
        font-size: 12px;
        color: #8d97a8;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .badge {
        display: inline-flex;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
      }
      .badge--accent { color: #7ff5aa; background: rgba(30, 215, 96, 0.16); border: 1px solid rgba(30, 215, 96, 0.22); }
      .badge--warn { color: #ffd089; background: rgba(245, 158, 11, 0.16); border: 1px solid rgba(245, 158, 11, 0.22); }
      .badge--info { color: #c8d4ff; background: rgba(99, 102, 241, 0.18); border: 1px solid rgba(99, 102, 241, 0.24); }
      .badge--neutral { color: #d5dbe5; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.08); }
      .surface-grid, .metrics, .status-grid, .leaf-grid, .failure-grid {
        display: grid;
        gap: 12px;
      }
      .metrics, .status-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .surface-grid, .leaf-grid, .failure-grid {
        grid-template-columns: 1fr;
      }
      .metric-card, .status-card, .menu-item {
        border-radius: 18px;
        padding: 14px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .metric-card strong, .status-card strong, .price {
        display: block;
        margin-top: 6px;
        font-size: 28px;
        color: #ffffff;
      }
      .digest-card { display: flex; flex-direction: column; gap: 14px; }
      .status-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .menu-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      .chevron { color: #1ed760; font-size: 28px; }
      .bullet-list { margin: 0; padding-left: 18px; display: grid; gap: 8px; }
      .nav-rail {
        position: sticky;
        bottom: 0;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .nav-pill {
        border-radius: 18px;
        padding: 14px 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .nav-pill.active {
        background: rgba(30, 215, 96, 0.14);
        border-color: rgba(30, 215, 96, 0.28);
      }
      .visual-system {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .visual-chip {
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: #d5dbe5;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel hero">
        <div class="row">
          <span class="badge badge--info">import shell</span>
          <span class="badge badge--warn">${escapeHtml(previewMeta.runtimeBoundary.mode)}</span>
          <span class="badge badge--accent">Home / Watch / Account</span>
        </div>
        <div class="brand-row" style="margin-top: 16px;">
          <img class="brand-mark" src="${escapeHtml(previewMeta.brand.previewBrandMarkPath)}" alt="${escapeHtml(previewMeta.brand.brandMarkAlt)}" />
          <div>
            <div class="eyebrow">${escapeHtml(runtimeConfig.shell.productName)}</div>
            <h1>${escapeHtml(runtimeConfig.shell.entryName)}</h1>
            <p>AppID ${escapeHtml(previewMeta.runtimeBoundary.appId)} · ${escapeHtml(runtimeConfig.shell.projectName)}</p>
          </div>
        </div>
        <p style="margin-top: 16px;">${escapeHtml(previewMeta.runtimeBoundary.disclosure)}</p>
        <p>${escapeHtml(previewMeta.localOnlyDisclosure)}</p>
        <p>${escapeHtml(previewMeta.previewEvidenceLabel)}</p>
        <p>shared config: <code>${escapeHtml(previewMeta.runtimeBoundary.sharedConfigPath)}</code></p>
        <p>local override: <code>${escapeHtml(previewMeta.runtimeBoundary.localOverridePath)}</code></p>
        <p>private DevTools config: <code>${escapeHtml(previewMeta.runtimeBoundary.privateProjectConfigPath)}</code></p>
        <p>Generated from the committed mini/ source tree. This is not evidence of real WeChat simulator, device, upload, or runtime success.</p>
      </section>

      <section class="panel">
        <div class="row split">
          <h2>Primary shell responsibilities</h2>
          <span class="badge badge--accent">distinct surfaces</span>
        </div>
        <p style="margin-top: 12px;">Home stays overview-first, Watch owns the protected read path, and Account owns identity and support navigation.</p>
        <div class="surface-grid" style="margin-top: 16px;">
          ${renderPrimarySurfaces()}
        </div>
      </section>

      <section class="panel">
        <div class="row split">
          <h2>${escapeHtml(homeSurfaceState.chrome.title)}</h2>
          ${renderBadges(homeSurfaceState.chrome.badges)}
        </div>
        <p style="margin-top: 12px;"><strong>${escapeHtml(homeSurfaceState.roleTitle)}</strong></p>
        <p>${escapeHtml(homeSurfaceState.roleCopy)}</p>
        <p>${escapeHtml(homeSurfaceState.overviewHeadline)}</p>
        <p>${escapeHtml(homeSurfaceState.overviewCopy)}</p>
        <div class="metrics" style="margin-top: 16px;">
          ${renderHomeMetrics(homeSurfaceState.overviewMetrics)}
        </div>
        <div class="panel" style="margin-top: 16px;">
          <div class="row split">
            <h3>${escapeHtml(homeSurfaceState.highlightTitle)}</h3>
            <span class="badge badge--${escapeHtml(homeSurfaceState.featuredBadgeTone || 'neutral')}">${escapeHtml(homeSurfaceState.featuredBadgeLabel)}</span>
          </div>
          <p style="margin-top: 8px;">${escapeHtml(homeSurfaceState.highlightCopy)}</p>
          ${
            homeSurfaceState.featuredCard
              ? `
                <p style="margin-top: 8px;"><strong>${escapeHtml(homeSurfaceState.featuredCard.stockName)} · ${escapeHtml(homeSurfaceState.featuredCard.stockCode)}</strong></p>
                <p>${escapeHtml(homeSurfaceState.featuredCard.summary)}</p>
                <p class="muted">${escapeHtml(homeSurfaceState.featuredCard.market)} · ${escapeHtml(homeSurfaceState.featuredCard.board)} · ${escapeHtml(homeSurfaceState.featuredCard.exchange)}</p>
              `
              : `<p class="muted" style="margin-top: 8px;">No featured card is shown when the shell is signed out.</p>`
          }
        </div>
      </section>

      <section class="panel">
        <div class="row split">
          <h2>Watch</h2>
          <span class="badge badge--accent">protected digest surface</span>
        </div>
        <p style="margin-top: 12px;"><strong>${escapeHtml(shellContent.watch.roleTitle)}</strong></p>
        <p>${escapeHtml(shellContent.watch.roleCopy)}</p>
        <p>${escapeHtml(shellContent.watch.supportCopy)}</p>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--warn">auth-required</span>
            <span class="badge badge--info">${escapeHtml(watchPreviewStates.authRequiredState.authIssueCode)}</span>
          </div>
          <h3 style="margin-top: 10px;">${escapeHtml(watchPreviewStates.authRequiredState.authTitle)}</h3>
          <p>${escapeHtml(watchPreviewStates.authRequiredState.authMessage)}</p>
        </div>
        <div class="failure-grid" style="margin-top: 16px;">
          ${renderFailureStates(watchPreviewStates.loginFailureStates)}
        </div>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--info">one-card-per-stock_code</span>
            <span class="badge badge--warn">deduped ${watchPreviewStates.authenticatedState.dedupedCount}</span>
          </div>
          <p style="margin-top: 10px;">Authenticated preview payload contained ${watchPreviewStates.authenticatedState.rawPayloadCount} digest rows and rendered ${watchPreviewStates.authenticatedState.cards.length} visible cards for canonical stock_code values: ${escapeHtml(watchPreviewStates.authenticatedState.renderedStockCodes)}.</p>
          <p>Ready digest content wins over duplicate placeholder rows for the same canonical stock_code, even when the placeholder row is newer by timestamp.</p>
          <p>Placeholder/waiting-state cards remain visible after dedupe when no ready digest exists, so pending watched stocks are not dropped from Watch.</p>
        </div>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--info">compact shared fields</span>
            <span class="badge badge--neutral">presentation-neutral</span>
          </div>
          <p style="margin-top: 10px;">The Watch mapping consumes only compact digest-card fields and does not require report bodies, browser routes, or runtime-specific context.</p>
          <div class="visual-system" style="margin-top: 12px;">
            ${previewMeta.compactFieldKeys
              .map((field) => `<span class="visual-chip">${escapeHtml(field)}</span>`)
              .join('')}
          </div>
        </div>
        <div class="failure-grid" style="margin-top: 16px;">
          ${renderDigestCards(watchPreviewStates.authenticatedState.cards)}
        </div>
      </section>

      <section class="panel">
        <div class="row split">
          <h2>${escapeHtml(accountSurfaceState.chrome.title)}</h2>
          ${renderBadges(accountSurfaceState.chrome.badges)}
        </div>
        <p style="margin-top: 12px;"><strong>${escapeHtml(accountSurfaceState.roleTitle)}</strong></p>
        <p>${escapeHtml(accountSurfaceState.roleCopy)}</p>
        <p>${escapeHtml(accountSurfaceState.identityTitle)} · ${escapeHtml(accountSurfaceState.sessionUserLabel)}</p>
        <div style="margin-top: 16px;">
          ${renderAccountMenu(accountSurfaceState.menuItems)}
        </div>
      </section>

      <section class="panel">
        <div class="row split">
          <h2>Account secondary pages</h2>
          <span class="badge badge--accent">round-trip in-app</span>
        </div>
        <p style="margin-top: 12px;">Each page supports a usable in-app round trip such as Account → Settings → Account.</p>
        <div class="leaf-grid" style="margin-top: 16px;">
          ${renderLeafPages(accountLeafStates)}
        </div>
      </section>

      <section class="panel">
        <div class="row split">
          <h2>Dark premium visual system</h2>
          <span class="badge badge--accent">shared tokens</span>
        </div>
        <p style="margin-top: 12px;">The shell visual system keeps objective dark-premium cues across primary surfaces: dark root backgrounds, restrained green accents for active navigation and primary actions, elevated cards, and consistent spacing/typography.</p>
        <div class="visual-system" style="margin-top: 12px;">
          <span class="visual-chip">root background ${escapeHtml(shellContent.visualSystem.rootBackground)}</span>
          <span class="visual-chip">accent ${escapeHtml(shellContent.visualSystem.accentColor)}</span>
          <span class="visual-chip">${escapeHtml(shellContent.visualSystem.elevatedCardClass)}</span>
          <span class="visual-chip">${escapeHtml(shellContent.visualSystem.primaryActionClass)}</span>
          <span class="visual-chip">${escapeHtml(shellContent.visualSystem.spacingRule)}</span>
        </div>
      </section>

      <section class="nav-rail">
        ${PRIMARY_SURFACES.map(
          (surface) => `
            <article class="nav-pill ${surface.key === 'watch' ? 'active' : ''}">
              <strong>${escapeHtml(surface.label)}</strong>
              <p class="muted">${escapeHtml(surface.navHint)}</p>
            </article>
          `,
        ).join('')}
      </section>
    </main>
  </body>
</html>
`

const summary = {
  validationMode: runtimeConfig.validation.evidenceMode,
  generatedArtifacts: ['dist/local-preview.html', 'dist/validation-summary.json'],
  evidenceSource: 'mini/',
  disclaimers: [
    previewMeta.runtimeBoundary.disclosure,
    previewMeta.localOnlyDisclosure,
    'Generated from the committed mini/ source tree. This is not evidence of real WeChat simulator, device, upload, or runtime success.',
  ],
  runtimeBoundary: {
    appId: runtimeConfig.appId,
    mode: runtimeConfig.backend.mode,
    baseUrl: runtimeConfig.backend.baseUrl,
    sharedConfigPath: previewMeta.runtimeBoundary.sharedConfigPath,
    localOverridePath: previewMeta.runtimeBoundary.localOverridePath,
    privateProjectConfigPath: previewMeta.runtimeBoundary.privateProjectConfigPath,
    isLoopbackTarget: isLoopbackUrl(runtimeConfig.backend.baseUrl),
  },
  shellMetadata: {
    productName: runtimeConfig.shell.productName,
    entryName: runtimeConfig.shell.entryName,
    projectName: runtimeConfig.shell.projectName,
    navigationBarTitle: runtimeConfig.shell.navigationBarTitle,
    brandMarkPath: runtimeConfig.shell.brandMarkPath,
  },
  primarySurfaces: PRIMARY_SURFACES.map((surface) => ({
    ...surface,
    pagePath: surface.pagePath,
  })),
  accountSecondaryPages: ACCOUNT_SECONDARY_PAGES.map((page) => ({
    ...page,
    roundTripLabel: `Account → ${page.label} → Account`,
  })),
  visualSystem: {
    ...shellContent.visualSystem,
    sharedStylesheet: 'styles/shell.wxss',
  },
  authStates: {
    authRequired: watchPreviewStates.authRequiredState.authIssueCode,
    loginFailures: watchPreviewStates.loginFailureStates.map((item) => ({
      statusCode: item.statusCode,
      code: item.state.loginErrorCode,
    })),
    authenticatedCardCount: watchPreviewStates.authenticatedState.cards.length,
  },
  homeOverview: {
    distinctFromWatch: true,
    overviewHeadline: homeSurfaceState.overviewHeadline,
    featuredStockCode: homeSurfaceState.featuredCard ? homeSurfaceState.featuredCard.stockCode : null,
    metrics: homeSurfaceState.overviewMetrics,
  },
  watchDigestRendering: {
    rawPayloadCardCount: watchPreviewStates.authenticatedState.rawPayloadCount,
    renderedCardCount: watchPreviewStates.authenticatedState.cards.length,
    dedupedCount: watchPreviewStates.authenticatedState.dedupedCount,
    placeholderCount: watchPreviewStates.authenticatedState.placeholderCount,
    readyDigestPreferredOverPendingDuplicate: watchPreviewStates.authenticatedState.cards.some(
      (card) =>
        card.stockCode === '600519' &&
        card.digestStatus === 'ready' &&
        card.summary.includes('优先显示 ready digest'),
    ),
    waitingStateRetainedWithoutReady: watchPreviewStates.authenticatedState.cards.some(
      (card) => card.stockCode === '000001' && card.digestStatus !== 'ready',
    ),
    renderedStockCodes: watchPreviewStates.authenticatedState.cards.map((card) => card.stockCode),
    compactFieldKeys: previewMeta.compactFieldKeys,
  },
  accountRoundTrips: accountLeafStates.map((state) => state.roundTripCopy),
  entryFiles: [
    'app.js',
    'app.json',
    'app.wxss',
    'project.config.json',
    'sitemap.json',
    'assets/tradingagents-mini-logo.png',
    'assets/tradingagents-mini-logo.svg',
    'config/runtime.shared.js',
    'custom-tab-bar/index.js',
    'custom-tab-bar/index.json',
    'custom-tab-bar/index.wxml',
    'custom-tab-bar/index.wxss',
    'components/shell-chrome/index.js',
    'components/shell-chrome/index.json',
    'components/shell-chrome/index.wxml',
    'components/shell-chrome/index.wxss',
    'data/digest-cards.js',
    'data/shell-content.js',
    'lib/runtime-config.js',
    'lib/auth-session-boundary.js',
    'lib/home-controller.js',
    'lib/shell-navigation.js',
    'lib/shell-surface-state.js',
    'lib/account-secondary-page.js',
    'styles/shell.wxss',
    'pages/home/index.js',
    'pages/home/index.json',
    'pages/home/index.wxml',
    'pages/home/index.wxss',
    'pages/watch/index.js',
    'pages/watch/index.json',
    'pages/watch/index.wxml',
    'pages/watch/index.wxss',
    'pages/account/index.js',
    'pages/account/index.json',
    'pages/account/index.wxml',
    'pages/account/index.wxss',
    'pages/account/settings/index.js',
    'pages/account/settings/index.json',
    'pages/account/settings/index.wxml',
    'pages/account/settings/index.wxss',
    'pages/account/about/index.js',
    'pages/account/about/index.json',
    'pages/account/about/index.wxml',
    'pages/account/about/index.wxss',
    'pages/account/privacy/index.js',
    'pages/account/privacy/index.json',
    'pages/account/privacy/index.wxml',
    'pages/account/privacy/index.wxss',
    'pages/account/help/index.js',
    'pages/account/help/index.json',
    'pages/account/help/index.wxml',
    'pages/account/help/index.wxss',
    'tests/auth-session-boundary.test.mjs',
    'tests/home-digest-rendering.test.mjs',
    'tests/runtime-config-boundary.test.mjs',
    'tests/publish-shell-navigation.test.mjs',
  ],
}

await fs.mkdir(distDir, { recursive: true })
await fs.writeFile(path.join(distDir, 'local-preview.html'), html, 'utf8')
await fs.writeFile(
  path.join(distDir, 'validation-summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
  'utf8',
)

console.log('mini build complete: wrote dist/local-preview.html and dist/validation-summary.json')
console.log('validation posture: source/build import-shell evidence only; no real WeChat runtime, upload, or live backend coverage claimed')
