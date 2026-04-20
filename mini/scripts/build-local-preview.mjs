import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const miniRoot = path.resolve(__dirname, '..')
const distDir = path.join(miniRoot, 'dist')
const require = createRequire(import.meta.url)
const miniDigestData = require('../data/digest-cards.js')

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
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
    </style>
  </head>
  <body>
    <main>
      <section class="panel panel--warning">
        <div class="badge-row">
          <span class="badge info">mini/ preview</span>
          <span class="badge warn">local-only validation</span>
        </div>
        <p>${escapeHtml(miniDigestData.localOnlyDisclosure)}</p>
        <p>${escapeHtml(miniDigestData.previewEvidenceLabel)}</p>
        <p>Generated from the committed mini/ source tree. This is not evidence of real WeChat simulator, device, or runtime success.</p>
      </section>
      <section class="panel hero">
        <span>${escapeHtml(miniDigestData.hero.eyebrow)}</span>
        <h1>${escapeHtml(miniDigestData.hero.title)}</h1>
        <p>${escapeHtml(miniDigestData.hero.subtitle)}</p>
        <div class="metrics">
          <div class="metric"><span>监控中</span><strong>${miniDigestData.cards.length}</strong></div>
          <div class="metric"><span>活跃策略</span><strong>${miniDigestData.cards.filter((card) => card.ruleStatus === 'active').length}</strong></div>
        </div>
      </section>
      <section class="checkpoints">
        ${miniDigestData.checkpoints.map((item) => `<div class="checkpoint">${escapeHtml(item)}</div>`).join('')}
      </section>
      ${renderCards(miniDigestData.cards)}
    </main>
  </body>
</html>
`

const summary = {
  validationMode: 'local-source-build-only',
  generatedArtifacts: ['dist/local-preview.html', 'dist/validation-summary.json'],
  evidenceSource: 'mini/',
  disclaimers: [
    miniDigestData.localOnlyDisclosure,
    'Generated from the committed mini/ source tree. This is not evidence of real WeChat simulator, device, or runtime success.',
  ],
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
  ],
}

await fs.mkdir(distDir, { recursive: true })
await fs.writeFile(path.join(distDir, 'local-preview.html'), html, 'utf8')
await fs.writeFile(path.join(distDir, 'validation-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

console.log('mini build complete: wrote dist/local-preview.html and dist/validation-summary.json')
console.log('validation posture: local-only source/build evidence from mini/; no real WeChat runtime coverage claimed')
