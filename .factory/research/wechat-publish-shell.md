# WeChat Mini publish-shell research

Raw research notes supporting the current Mini publish-shell continuation.

## Sources consulted

- WeChat DevTools project config docs: `https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html`
- `miniprogram-ci` docs: `https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html`
- DevTools / CLI docs: `https://developers.weixin.qq.com/miniprogram/dev/devtools/devtools.html`, `https://developers.weixin.qq.com/miniprogram/dev/devtools/cli.html`
- Mini Program release flow: `https://developers.weixin.qq.com/miniprogram/dev/framework/quickstart/release.html`
- Network and domain rules: `https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html`, `https://developers.weixin.qq.com/miniprogram/dev/framework/ability/domain.html`
- Privacy guidance: `https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/`
- Product / operating rules: `https://developers.weixin.qq.com/miniprogram/product/`
- Filing guidance / FAQ: `https://developers.weixin.qq.com/minigame/product/record/guidelines.html`, `https://developers.weixin.qq.com/minigame/product/record/record_faq.html`
- `miniprogram-ci` npm page: `https://www.npmjs.com/package/miniprogram-ci`

## Key findings

- The repo is already close to DevTools import-ready because `mini/` contains real app entry/config files and the target AppID is present.
- A publish-facing continuation still needs:
  - checked-in non-loopback runtime defaults
  - shared vs private config separation
  - offline preflight checks
  - secret-gated upload scaffolding
- Actual upload/publish still requires operator-controlled prerequisites such as:
  - DevTools login or upload private key
  - IP allowlisting for CI upload
  - real HTTPS domains
  - platform-side privacy/category/compliance steps
- `project.private.config.json` is the appropriate local override path and should stay local-only.
- `miniprogram-ci` scaffolding can be added now, but it must refuse to run without injected secrets and must not imply live upload success.

## Worker-facing implications

- The fastest honest path is: publish-facing shell first, manual-upload preflight second, gated `miniprogram-ci` scaffold third.
- Checked-in defaults must not point at `localhost` or other loopback-only targets for publish-shell work.
- Product copy, preflight output, and release handoff docs must all tell the same truth about deferred runtime/upload work.
