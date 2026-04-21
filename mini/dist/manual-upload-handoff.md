# TradingAgents Mini manual-upload handoff

- Shell version: 0.1.0
- AppID: wx1d02a932c4f9a4ae

## Truth boundary
- manual-upload shell readiness only
- 离线 preflight 仅验证已提交的 Mini 身份、占位运行时边界、checked-in handoff 材料与本地私有文件卫生；它不证明真实微信运行时、线上后端可达性、代码上传、审核通过或最终发布完成。

## Validated in this repo
- Checked-in AppID wx1d02a932c4f9a4ae remains wired through mini/project.config.json and mini/config/runtime.shared.js.
- The delivered Home / Watch / Account shell is validated here through committed source, local tests, generated build proof, and offline preflight output.
- The checked-in runtime boundary stays in placeholder-preview mode with a non-loopback HTTPS target (https://mini-runtime-placeholder.invalid).
- Manual-upload readiness here means the import shell can be handed off for operator-controlled DevTools work without claiming live backend, runtime, upload, audit, or publish completion.

## Deferred operator/runtime/upload steps
1. Create mini/config/runtime.local.js with the real HTTPS backend target and keep it local-only.
2. Import mini/ into WeChat DevTools while signed in as the operator; keep mini/project.private.config.json machine-local.
3. Place any upload private key or upload-secret material under mini/upload-secrets/ (for example mini/upload-secrets/code-upload.private.key) without committing it.
4. Run real WeChat simulator/device verification against the chosen runtime and confirm live backend reachability outside this repository-only environment.
5. Complete platform-side IP allowlisting, privacy/compliance setup, audit submission, and final publish actions after operator validation succeeds.

## Keep local-only and untracked
- mini/config/runtime.local.js
- mini/project.private.config.json
- mini/upload-secrets/
- mini/upload-secrets/code-upload.private.key

## Operator handoff checklist
1. Run npm --prefix mini run preflight to confirm the checked-in shell still fails closed on illegal repo-owned config.
2. Review mini/dist/manual-upload-handoff.md alongside mini/dist/local-preview.html and mini/dist/validation-summary.json before handing the shell to the operator.
3. Hand off only the checked-in mini/ shell plus instructions for local-only overrides and secrets; do not hand off committed credentials because none should exist.
