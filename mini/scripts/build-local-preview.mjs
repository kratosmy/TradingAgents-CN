import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const miniRoot = path.resolve(__dirname, '..')
const distDir = path.join(miniRoot, 'dist')
const require = createRequire(import.meta.url)
const previewMeta = require('../data/digest-cards.js')
const {
  createMemoryStorage,
  createMiniAuthSessionBoundary,
} = require('../lib/auth-session-boundary.js')
const { createMiniHomeController } = require('../lib/home-controller.js')

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function buildPreviewStates() {
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

function renderCards(cards) {
  return cards
    .map(
      (card) => `
        <article class="digest-card">
          <div class="card-header">
            <div>
              <div class="stock-row"><strong>${escapeHtml(card.stockName)}</strong><span>${escapeHtml(card.stockCode)}</span></div>
              <p class="stock-market">${escapeHtml(card.market)} · ${escapeHtml(card.board)} · ${escapeHtml(card.exchange)}</p>
            </div>
            <span class="risk-pill risk-pill--${escapeHtml(card.riskTone)}">${escapeHtml(card.riskLabel)}</span>
          </div>
          <div class="quote-row">
            <div class="current-price">¥${escapeHtml(card.currentPrice)}</div>
            <div class="change-pill change-pill--${escapeHtml(card.changeDirection)}">${escapeHtml(card.changePercent)}</div>
          </div>
          <p class="summary-copy">${escapeHtml(card.summary)}</p>
          <div class="status-grid">
            <div class="status-item"><span class="status-label">digest_status</span><strong>${escapeHtml(card.digestStatus)}</strong></div>
            <div class="status-item"><span class="status-label">rule_status</span><strong>${escapeHtml(card.ruleStatus)}</strong></div>
            <div class="status-item"><span class="status-label">task_status</span><strong>${escapeHtml(card.taskStatus)}</strong></div>
          </div>
          <div class="meta-row"><span>${escapeHtml(card.taskLabel)}</span><span>${escapeHtml(card.updatedAt)}</span></div>
        </article>
      `,
    )
    .join('\n')
}

function renderFailureStates(failureStates) {
  return failureStates
    .map(
      ({ label, statusCode, state }) => `
        <article class="panel">
          <div class="badge-row">
            <span class="badge warn">login failure</span>
            <span class="badge info">HTTP ${statusCode}</span>
          </div>
          <h3>${escapeHtml(label)}</h3>
          <p><strong>${escapeHtml(state.loginErrorCode)}</strong></p>
          <p>${escapeHtml(state.loginErrorMessage)}</p>
        </article>
      `,
    )
    .join('\n')
}

function renderCompactFields(fields) {
  return fields.map((field) => `<span class="checkpoint">${escapeHtml(field)}</span>`).join('')
}

const previewStates = await buildPreviewStates()

const html = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TradingAgents Mini Local Validation Preview</title>
    <style>
      :root {
        color-scheme: light;
        font-family: 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
        background: #f7f8fa;
        color: #0f172a;
      }
      body {
        margin: 0;
        background: linear-gradient(180deg, #f7f8fa 0%, #eef2ff 100%);
      }
      main {
        max-width: 480px;
        margin: 0 auto;
        padding: 24px 16px 48px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .panel, .digest-card {
        background: rgba(255, 255, 255, 0.94);
        border-radius: 24px;
        padding: 18px;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      }
      .panel-grid {
        display: grid;
        gap: 16px;
      }
      .panel--warning {
        background: #fffaf0;
        border: 1px solid rgba(245, 158, 11, 0.35);
      }
      .badge-row, .stock-row, .card-header, .quote-row, .meta-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .card-header, .quote-row, .meta-row {
        justify-content: space-between;
      }
      .badge, .risk-pill, .change-pill, .checkpoint, .metric {
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 700;
      }
      .badge.info { background: rgba(37, 99, 235, 0.12); color: #1d4ed8; }
      .badge.warn { background: rgba(245, 158, 11, 0.16); color: #b45309; }
      .hero {
        background: linear-gradient(135deg, #2563eb, #4f46e5);
        color: #fff;
      }
      .hero h1 { margin: 10px 0 0; font-size: 28px; }
      .hero p { line-height: 1.7; color: rgba(255,255,255,0.88); }
      .metrics, .checkpoints, .status-grid {
        display: grid;
        gap: 12px;
      }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 18px; }
      .metric { background: rgba(255,255,255,0.14); color: #fff; display: flex; flex-direction: column; }
      .metric strong { font-size: 24px; margin-top: 4px; }
      .checkpoints { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .compact-fields { display: flex; flex-wrap: wrap; gap: 8px; }
      .checkpoint { background: rgba(148, 163, 184, 0.16); color: #0f172a; text-align: center; }
      .stock-market, .summary-copy, .meta-row, .status-label, .panel p { color: #475569; }
      .current-price { font-size: 28px; font-weight: 700; }
      .risk-pill--positive, .change-pill--up { background: rgba(34, 197, 94, 0.12); color: #15803d; }
      .risk-pill--warning { background: rgba(245, 158, 11, 0.16); color: #b45309; }
      .risk-pill--neutral { background: rgba(148, 163, 184, 0.16); color: #475569; }
      .change-pill--down { background: rgba(239, 68, 68, 0.12); color: #b91c1c; }
      .summary-copy { line-height: 1.7; }
      .status-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 14px; }
      .status-item { background: rgba(148, 163, 184, 0.08); border-radius: 16px; padding: 12px; }
      .status-item strong { display: block; margin-top: 6px; }
      .meta-row { font-size: 12px; margin-top: 14px; }
      .auth-state { border: 1px dashed rgba(245, 158, 11, 0.4); }
    </style>
  </head>
  <body>
    <main>
      <section class="panel panel--warning">
        <div class="badge-row">
          <span class="badge info">mini/ preview</span>
          <span class="badge warn">local-only validation</span>
        </div>
        <p>${escapeHtml(previewMeta.localOnlyDisclosure)}</p>
        <p>${escapeHtml(previewMeta.previewEvidenceLabel)}</p>
        <p>Generated from the committed mini/ source tree. This is not evidence of real WeChat simulator, device, or runtime success.</p>
      </section>
      <section class="panel hero">
        <span>${escapeHtml(previewMeta.hero.eyebrow)}</span>
        <h1>${escapeHtml(previewMeta.hero.title)}</h1>
        <p>${escapeHtml(previewMeta.hero.subtitle)}</p>
        <div class="metrics">
          <div class="metric"><span>authState</span><strong>${escapeHtml(previewStates.authenticatedState.authState)}</strong></div>
          <div class="metric"><span>raw payload cards</span><strong>${previewStates.authenticatedState.rawPayloadCount}</strong></div>
          <div class="metric"><span>visible cards</span><strong>${previewStates.authenticatedState.cards.length}</strong></div>
          <div class="metric"><span>placeholder cards</span><strong>${previewStates.authenticatedState.placeholderCount}</strong></div>
        </div>
      </section>
      <section class="checkpoints">
        ${previewMeta.checkpoints.map((item) => `<div class="checkpoint">${escapeHtml(item)}</div>`).join('')}
      </section>
      <section class="panel">
        <div class="badge-row">
          <span class="badge info">one-card-per-stock_code</span>
          <span class="badge warn">deduped ${previewStates.authenticatedState.dedupedCount}</span>
        </div>
        <p>Authenticated preview payload contained ${previewStates.authenticatedState.rawPayloadCount} digest rows and rendered ${previewStates.authenticatedState.cards.length} visible cards for canonical stock_code values: ${escapeHtml(previewStates.authenticatedState.renderedStockCodes)}.</p>
        <p>Ready digest content wins over duplicate placeholder rows for the same canonical stock_code, even when the placeholder row is newer by timestamp.</p>
        <p>Placeholder/waiting-state cards remain visible after dedupe when no ready digest exists, so pending watched stocks are not dropped from the Mini home surface.</p>
      </section>
      <section class="panel">
        <div class="badge-row">
          <span class="badge info">compact shared fields</span>
          <span class="badge warn">presentation-neutral</span>
        </div>
        <p>The Mini mapping consumes only compact digest-card fields and does not require report bodies, browser routes, or runtime-specific context.</p>
        <div class="compact-fields">${renderCompactFields(previewMeta.compactFieldKeys)}</div>
      </section>
      <section class="panel auth-state">
        <div class="badge-row">
          <span class="badge warn">auth-required</span>
          <span class="badge info">${escapeHtml(previewStates.authRequiredState.authIssueCode)}</span>
        </div>
        <h3>${escapeHtml(previewStates.authRequiredState.authTitle)}</h3>
        <p>${escapeHtml(previewStates.authRequiredState.authMessage)}</p>
      </section>
      <section class="panel-grid">
        ${renderFailureStates(previewStates.loginFailureStates)}
      </section>
      ${renderCards(previewStates.authenticatedState.cards)}
    </main>
  </body>
</html>
`

const summary = {
  validationMode: 'local-source-build-only',
  generatedArtifacts: ['dist/local-preview.html', 'dist/validation-summary.json'],
  evidenceSource: 'mini/',
  disclaimers: [
    previewMeta.localOnlyDisclosure,
    'Generated from the committed mini/ source tree. This is not evidence of real WeChat simulator, device, or runtime success.',
  ],
  authStates: {
    authRequired: previewStates.authRequiredState.authIssueCode,
    loginFailures: previewStates.loginFailureStates.map((item) => ({
      statusCode: item.statusCode,
      code: item.state.loginErrorCode,
    })),
    authenticatedCardCount: previewStates.authenticatedState.cards.length,
  },
  homeDigestRendering: {
    rawPayloadCardCount: previewStates.authenticatedState.rawPayloadCount,
    renderedCardCount: previewStates.authenticatedState.cards.length,
    dedupedCount: previewStates.authenticatedState.dedupedCount,
    placeholderCount: previewStates.authenticatedState.placeholderCount,
    readyDigestPreferredOverPendingDuplicate:
      previewStates.authenticatedState.cards.some(
        (card) =>
          card.stockCode === '600519' &&
          card.digestStatus === 'ready' &&
          card.summary.includes('优先显示 ready digest'),
      ),
    waitingStateRetainedWithoutReady:
      previewStates.authenticatedState.cards.some(
        (card) => card.stockCode === '000001' && card.digestStatus !== 'ready',
      ),
    renderedStockCodes: previewStates.authenticatedState.cards.map((card) => card.stockCode),
    compactFieldKeys: previewMeta.compactFieldKeys,
  },
  entryFiles: [
    'app.js',
    'app.json',
    'app.wxss',
    'project.config.json',
    'sitemap.json',
    'pages/home/index.js',
    'pages/home/index.wxml',
    'pages/home/index.wxss',
    'pages/home/index.json',
    'lib/auth-session-boundary.js',
    'lib/home-controller.js',
    'tests/auth-session-boundary.test.mjs',
    'tests/home-digest-rendering.test.mjs',
  ],
}

await fs.mkdir(distDir, { recursive: true })
await fs.writeFile(path.join(distDir, 'local-preview.html'), html, 'utf8')
await fs.writeFile(path.join(distDir, 'validation-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

console.log('mini build complete: wrote dist/local-preview.html and dist/validation-summary.json')
console.log('validation posture: local-only source/build evidence from mini/; no real WeChat runtime coverage claimed')
