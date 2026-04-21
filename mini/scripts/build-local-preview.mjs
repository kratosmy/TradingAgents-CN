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
const { createReleaseHandoff, renderReleaseHandoffMarkdown } = require('../lib/release-handoff.js')
const packageJson = require('../package.json')
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
  buildWatchSurfaceState,
} = require('../lib/shell-surface-state.js')
const { getCheckedInRuntimeConfig, isLoopbackUrl } = require('../lib/runtime-config.js')

const runtimeConfig = getCheckedInRuntimeConfig()
const previewMeta = createPreviewMeta(runtimeConfig)
const shellContent = createShellContent(runtimeConfig)
const releaseHandoff = createReleaseHandoff({
  runtimeConfig,
  packageVersion: packageJson.version,
})
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
  const loadingController = createMiniHomeController({
    previewMeta,
    authBoundary: createMiniAuthSessionBoundary({
      storage: createMemoryStorage(),
      request: async () => ({
        statusCode: 200,
        data: {
          success: true,
          data: [],
        },
      }),
    }),
  })

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

  const authenticatedEmptyStorage = createMemoryStorage()
  const authenticatedWaitingStorage = createMemoryStorage()
  const authenticatedReadyStorage = createMemoryStorage()

  authenticatedEmptyStorage.setItem(
    'tradingagents-mini.auth-session',
    JSON.stringify(previewSession),
  )
  authenticatedWaitingStorage.setItem(
    'tradingagents-mini.auth-session',
    JSON.stringify(previewSession),
  )
  authenticatedReadyStorage.setItem(
    'tradingagents-mini.auth-session',
    JSON.stringify(previewSession),
  )

  const authenticatedEmptyController = createMiniHomeController({
    previewMeta,
    authBoundary: createMiniAuthSessionBoundary({
      storage: authenticatedEmptyStorage,
      request: async () => ({
        statusCode: 200,
        data: {
          success: true,
          data: [],
        },
      }),
    }),
  })

  const waitingController = createMiniHomeController({
    previewMeta,
    authBoundary: createMiniAuthSessionBoundary({
      storage: authenticatedWaitingStorage,
      request: async () => ({
        statusCode: 200,
        data: {
          success: true,
          data: previewMeta.previewCards.filter((card) => card.stock_code === '000001'),
        },
      }),
    }),
  })

  const readyController = createMiniHomeController({
    previewMeta,
    authBoundary: createMiniAuthSessionBoundary({
      storage: authenticatedReadyStorage,
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

  const authenticatedEmptyState = await authenticatedEmptyController.hydrate()
  const waitingState = await waitingController.hydrate()
  const readyState = await readyController.submitLogin({
    username: 'mini-preview',
    password: 'correct-password',
  })

  const decorateWatchState = (state) => ({
    ...state,
    ...buildWatchSurfaceState({
      previewMeta,
      watchData: state,
    }),
  })

  return {
    loadingState: decorateWatchState(loadingController.getState()),
    authRequiredState: decorateWatchState(authRequiredState),
    loginFailureStates,
    authenticatedEmptyState: decorateWatchState(authenticatedEmptyState),
    waitingState: decorateWatchState(waitingState),
    readyState: decorateWatchState(readyState),
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

function renderWatchStatePanels(watchStates) {
  return watchStates
    .map(
      (state) => `
        <article class="panel">
          <div class="row split">
            <h3>${escapeHtml(state.watchState)}</h3>
            <span class="badge badge--${escapeHtml(state.watchStateTone)}">${escapeHtml(state.watchStateLabel)}</span>
          </div>
          <p style="margin-top: 10px;"><strong>${escapeHtml(state.watchStateTitle)}</strong></p>
          <p>${escapeHtml(state.watchStateCopy)}</p>
          <p>${escapeHtml(state.watchStateSupportCopy)}</p>
          <p class="muted">cards ${escapeHtml(state.monitoredCount)} · ready ${escapeHtml(state.readyCount)} · waiting ${escapeHtml(state.waitingCount)}</p>
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

function renderListItems(items) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
}

const watchPreviewStates = await buildWatchPreviewStates()
const signedOutHomeSurfaceState = buildHomeSurfaceState({
  previewMeta,
})
const authenticatedLoadingHomeSurfaceState = buildHomeSurfaceState({
  previewMeta,
  session: previewSession,
})
const authenticatedEmptyHomeSurfaceState = buildHomeSurfaceState({
  previewMeta,
  session: previewSession,
  digestResult: {
    ok: true,
    cards: [],
    session: previewSession,
  },
})
const authenticatedErrorHomeSurfaceState = buildHomeSurfaceState({
  previewMeta,
  session: previewSession,
  digestResult: {
    ok: false,
    authRequired: false,
    code: 'digest_read_failed',
    cards: [],
  },
})
const signedInHomeSurfaceState = buildHomeSurfaceState({
  previewMeta,
  session: previewSession,
  digestResult: {
    ok: true,
    cards: previewMeta.previewCards,
    session: previewSession,
  },
})
const signedOutAccountSurfaceState = buildAccountSurfaceState({
  previewMeta,
})
const signedInAccountSurfaceState = buildAccountSurfaceState({
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
          <h2>${escapeHtml(signedOutHomeSurfaceState.chrome.title)}</h2>
          ${renderBadges(signedOutHomeSurfaceState.chrome.badges)}
        </div>
        <p style="margin-top: 12px;"><strong>${escapeHtml(signedOutHomeSurfaceState.roleTitle)}</strong></p>
        <p>${escapeHtml(signedOutHomeSurfaceState.roleCopy)}</p>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--warn">signed-out navigation</span>
            <span class="badge badge--info">Home remains public</span>
          </div>
          <p style="margin-top: 10px;"><strong>${escapeHtml(signedOutHomeSurfaceState.overviewHeadline)}</strong></p>
          <p>${escapeHtml(signedOutHomeSurfaceState.overviewCopy)}</p>
          <p class="muted">${escapeHtml(signedOutHomeSurfaceState.highlightCopy)}</p>
        </div>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--info">authenticated-loading overview</span>
            <span class="badge badge--info">${escapeHtml(authenticatedLoadingHomeSurfaceState.featuredBadgeLabel)}</span>
          </div>
          <p style="margin-top: 10px;"><strong>${escapeHtml(authenticatedLoadingHomeSurfaceState.overviewHeadline)}</strong></p>
          <p>${escapeHtml(authenticatedLoadingHomeSurfaceState.overviewCopy)}</p>
          <p class="muted">${escapeHtml(authenticatedLoadingHomeSurfaceState.highlightCopy)}</p>
          <p class="muted">${escapeHtml(authenticatedLoadingHomeSurfaceState.emptyStateCopy)}</p>
        </div>
        <div class="metrics" style="margin-top: 16px;">
          ${renderHomeMetrics(authenticatedLoadingHomeSurfaceState.overviewMetrics)}
        </div>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--info">authenticated-empty overview</span>
            <span class="badge badge--info">${escapeHtml(authenticatedEmptyHomeSurfaceState.featuredBadgeLabel)}</span>
          </div>
          <p style="margin-top: 10px;"><strong>${escapeHtml(authenticatedEmptyHomeSurfaceState.overviewHeadline)}</strong></p>
          <p>${escapeHtml(authenticatedEmptyHomeSurfaceState.overviewCopy)}</p>
          <p class="muted">${escapeHtml(authenticatedEmptyHomeSurfaceState.highlightCopy)}</p>
          <p class="muted">${escapeHtml(authenticatedEmptyHomeSurfaceState.emptyStateCopy)}</p>
        </div>
        <div class="metrics" style="margin-top: 16px;">
          ${renderHomeMetrics(authenticatedEmptyHomeSurfaceState.overviewMetrics)}
        </div>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--warn">authenticated-error overview</span>
            <span class="badge badge--warn">${escapeHtml(authenticatedErrorHomeSurfaceState.featuredBadgeLabel)}</span>
          </div>
          <p style="margin-top: 10px;"><strong>${escapeHtml(authenticatedErrorHomeSurfaceState.overviewHeadline)}</strong></p>
          <p>${escapeHtml(authenticatedErrorHomeSurfaceState.overviewCopy)}</p>
          <p class="muted">${escapeHtml(authenticatedErrorHomeSurfaceState.highlightCopy)}</p>
          <p class="muted">${escapeHtml(authenticatedErrorHomeSurfaceState.emptyStateCopy)}</p>
        </div>
        <div class="metrics" style="margin-top: 16px;">
          ${renderHomeMetrics(authenticatedErrorHomeSurfaceState.overviewMetrics)}
        </div>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--accent">signed-in highlight</span>
            <span class="badge badge--info">highlight only</span>
          </div>
          <p style="margin-top: 10px;"><strong>${escapeHtml(signedInHomeSurfaceState.overviewHeadline)}</strong></p>
          <p>${escapeHtml(signedInHomeSurfaceState.overviewCopy)}</p>
        </div>
        <div class="metrics" style="margin-top: 16px;">
          ${renderHomeMetrics(signedInHomeSurfaceState.overviewMetrics)}
        </div>
        <div class="panel" style="margin-top: 16px;">
          <div class="row split">
            <h3>${escapeHtml(signedInHomeSurfaceState.highlightTitle)}</h3>
            <span class="badge badge--${escapeHtml(signedInHomeSurfaceState.featuredBadgeTone || 'neutral')}">${escapeHtml(signedInHomeSurfaceState.featuredBadgeLabel)}</span>
          </div>
          <p style="margin-top: 8px;">${escapeHtml(signedInHomeSurfaceState.highlightCopy)}</p>
          ${
            signedInHomeSurfaceState.featuredCard
              ? `
                <p style="margin-top: 8px;"><strong>${escapeHtml(signedInHomeSurfaceState.featuredCard.stockName)} · ${escapeHtml(signedInHomeSurfaceState.featuredCard.stockCode)}</strong></p>
                <p>${escapeHtml(signedInHomeSurfaceState.featuredCard.summary)}</p>
                <p class="muted">${escapeHtml(signedInHomeSurfaceState.featuredCard.market)} · ${escapeHtml(signedInHomeSurfaceState.featuredCard.board)} · ${escapeHtml(signedInHomeSurfaceState.featuredCard.exchange)}</p>
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
        <div class="surface-grid" style="margin-top: 16px;">
          ${renderWatchStatePanels([
            watchPreviewStates.loadingState,
            watchPreviewStates.authRequiredState,
            watchPreviewStates.authenticatedEmptyState,
            watchPreviewStates.waitingState,
            watchPreviewStates.readyState,
          ])}
        </div>
        <div class="failure-grid" style="margin-top: 16px;">
          ${renderFailureStates(watchPreviewStates.loginFailureStates)}
        </div>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--info">one-card-per-stock_code</span>
            <span class="badge badge--warn">deduped ${watchPreviewStates.readyState.dedupedCount}</span>
          </div>
          <p style="margin-top: 10px;">Ready preview payload contained ${watchPreviewStates.readyState.rawPayloadCount} digest rows and rendered ${watchPreviewStates.readyState.cards.length} visible cards for canonical stock_code values: ${escapeHtml(watchPreviewStates.readyState.renderedStockCodes)}.</p>
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
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--warn">waiting proof</span>
            <span class="badge badge--neutral">${escapeHtml(watchPreviewStates.waitingState.protectedSummaryBadge)}</span>
          </div>
          <p style="margin-top: 10px;">Watch keeps signed-in waiting cards visible when no ready digest exists yet, so authenticated-empty and waiting never collapse together.</p>
        </div>
        <div class="failure-grid" style="margin-top: 16px;">
          ${renderDigestCards(watchPreviewStates.waitingState.cards)}
        </div>
        <div class="failure-grid" style="margin-top: 16px;">
          ${renderDigestCards(watchPreviewStates.readyState.cards)}
        </div>
      </section>

      <section class="panel">
        <div class="row split">
          <h2>${escapeHtml(signedOutAccountSurfaceState.chrome.title)}</h2>
          ${renderBadges(signedOutAccountSurfaceState.chrome.badges)}
        </div>
        <p style="margin-top: 12px;"><strong>${escapeHtml(signedOutAccountSurfaceState.roleTitle)}</strong></p>
        <p>${escapeHtml(signedOutAccountSurfaceState.roleCopy)}</p>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--warn">signed out</span>
            <span class="badge badge--info">Account remains public</span>
          </div>
          <p style="margin-top: 10px;"><strong>${escapeHtml(signedOutAccountSurfaceState.identityTitle)}</strong></p>
          <p>${escapeHtml(signedOutAccountSurfaceState.identityCopy)}</p>
        </div>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--accent">signed in</span>
            <span class="badge badge--info">identity stays here</span>
          </div>
          <p style="margin-top: 10px;"><strong>${escapeHtml(signedInAccountSurfaceState.identityTitle)}</strong> · ${escapeHtml(signedInAccountSurfaceState.sessionUserLabel)}</p>
          <p>${escapeHtml(signedInAccountSurfaceState.identityCopy)}</p>
        </div>
        <div style="margin-top: 16px;">
          ${renderAccountMenu(signedOutAccountSurfaceState.menuItems)}
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
          <h2>Manual-upload handoff</h2>
          <span class="badge badge--warn">${escapeHtml(releaseHandoff.truthBoundaryLabel)}</span>
        </div>
        <p style="margin-top: 12px;">${escapeHtml(releaseHandoff.truthBoundaryCopy)}</p>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--accent">validated now</span>
            <span class="badge badge--info">checked-in shell evidence</span>
          </div>
          <ul class="bullet-list" style="margin-top: 12px;">
            ${renderListItems(releaseHandoff.validatedNow)}
          </ul>
        </div>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--warn">deferred work</span>
            <span class="badge badge--info">operator/runtime/upload steps</span>
          </div>
          <ol class="bullet-list" style="margin-top: 12px; padding-left: 18px;">
            ${renderListItems(releaseHandoff.deferredOperatorSteps)}
          </ol>
        </div>
        <div class="panel" style="margin-top: 16px;">
          <div class="row">
            <span class="badge badge--info">keep local-only</span>
            <span class="badge badge--neutral">WeChat private artifacts</span>
          </div>
          <ul class="bullet-list" style="margin-top: 12px;">
            ${renderListItems(releaseHandoff.localOnlyPaths)}
          </ul>
          <ol class="bullet-list" style="margin-top: 12px; padding-left: 18px;">
            ${renderListItems(releaseHandoff.operatorHandoffSteps)}
          </ol>
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
  generatedArtifacts: [
    'dist/local-preview.html',
    'dist/validation-summary.json',
    'dist/manual-upload-handoff.json',
    'dist/manual-upload-handoff.md',
  ],
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
    uploadSecretsDirectory: previewMeta.runtimeBoundary.uploadSecretsDirectory,
    uploadPrivateKeyPath: previewMeta.runtimeBoundary.uploadPrivateKeyPath,
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
    authenticatedCardCount: watchPreviewStates.readyState.cards.length,
  },
  watchSurfaceStates: {
    loading: watchPreviewStates.loadingState.watchState,
    authRequired: watchPreviewStates.authRequiredState.watchState,
    authenticatedEmpty: watchPreviewStates.authenticatedEmptyState.watchState,
    waiting: watchPreviewStates.waitingState.watchState,
    ready: watchPreviewStates.readyState.watchState,
  },
  homeOverview: {
    distinctFromWatch: true,
    states: {
      signedOut: signedOutHomeSurfaceState.homeState,
      authenticatedLoading: authenticatedLoadingHomeSurfaceState.homeState,
      authenticatedEmpty: authenticatedEmptyHomeSurfaceState.homeState,
      authenticatedError: authenticatedErrorHomeSurfaceState.homeState,
      highlight: signedInHomeSurfaceState.homeState,
    },
    signedOutHeadline: signedOutHomeSurfaceState.overviewHeadline,
    authenticatedLoadingHeadline: authenticatedLoadingHomeSurfaceState.overviewHeadline,
    authenticatedLoadingCopy: authenticatedLoadingHomeSurfaceState.overviewCopy,
    authenticatedEmptyHeadline: authenticatedEmptyHomeSurfaceState.overviewHeadline,
    authenticatedEmptyCopy: authenticatedEmptyHomeSurfaceState.overviewCopy,
    authenticatedErrorHeadline: authenticatedErrorHomeSurfaceState.overviewHeadline,
    authenticatedErrorCopy: authenticatedErrorHomeSurfaceState.overviewCopy,
    overviewHeadline: signedInHomeSurfaceState.overviewHeadline,
    featuredStockCode: signedInHomeSurfaceState.featuredCard
      ? signedInHomeSurfaceState.featuredCard.stockCode
      : null,
    metrics: signedInHomeSurfaceState.overviewMetrics,
  },
  watchDigestRendering: {
    rawPayloadCardCount: watchPreviewStates.readyState.rawPayloadCount,
    renderedCardCount: watchPreviewStates.readyState.cards.length,
    dedupedCount: watchPreviewStates.readyState.dedupedCount,
    placeholderCount: watchPreviewStates.readyState.placeholderCount,
    readyDigestPreferredOverPendingDuplicate: watchPreviewStates.readyState.cards.some(
      (card) =>
        card.stockCode === '600519' &&
        card.digestStatus === 'ready' &&
        card.summary.includes('优先显示 ready digest'),
    ),
    waitingStateRetainedWithoutReady: watchPreviewStates.waitingState.cards.some(
      (card) => card.stockCode === '000001' && card.digestStatus !== 'ready',
    ),
    renderedStockCodes: watchPreviewStates.readyState.cards.map((card) => card.stockCode),
    compactFieldKeys: previewMeta.compactFieldKeys,
  },
  accountRoundTrips: accountLeafStates.map((state) => state.roundTripCopy),
  releaseHandoff,
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
    'lib/release-handoff.js',
    'lib/wechat-ci-upload.js',
    'lib/runtime-config.js',
    'lib/auth-session-boundary.js',
    'lib/home-controller.js',
    'lib/shell-navigation.js',
    'lib/shell-surface-state.js',
    'lib/manual-upload-preflight.js',
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
    'scripts/build-local-preview.mjs',
    'scripts/install-wechat-ci.mjs',
    'scripts/upload-wechat.mjs',
    'tests/auth-session-boundary.test.mjs',
    'tests/home-digest-rendering.test.mjs',
    'tests/runtime-config-boundary.test.mjs',
    'tests/publish-shell-navigation.test.mjs',
    'tests/release-preflight.test.mjs',
    'tests/wechat-ci-upload-scaffold.test.mjs',
  ],
}

await fs.mkdir(distDir, { recursive: true })
await fs.writeFile(path.join(distDir, 'local-preview.html'), html, 'utf8')
await fs.writeFile(
  path.join(distDir, 'validation-summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
  'utf8',
)
await fs.writeFile(
  path.join(distDir, 'manual-upload-handoff.json'),
  `${JSON.stringify(releaseHandoff, null, 2)}\n`,
  'utf8',
)
await fs.writeFile(
  path.join(distDir, 'manual-upload-handoff.md'),
  renderReleaseHandoffMarkdown(releaseHandoff),
  'utf8',
)

console.log('mini build complete: wrote dist/local-preview.html, dist/validation-summary.json, dist/manual-upload-handoff.json, and dist/manual-upload-handoff.md')
console.log('validation posture: source/build import-shell evidence only; no real WeChat runtime, upload, or live backend coverage claimed')
