# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** required env vars, external services, local runtime assumptions, dependency quirks, platform limits.
**What does NOT belong here:** service ports/commands (use `.factory/services.yaml`).

---

## Current continuation scope

- The completed first milestone delivered a real top-level `mini/` client with JWT login reuse and protected digest reads.
- The current continuation upgrades that MVP into a publish-facing Mini shell with Home / Watch / Account surfaces, secondary Account pages, manual upload preflight, and a gated `miniprogram-ci` scaffold.
- Real WeChat runtime/device/upload validation is still unavailable in this environment.

## Runtime configuration rules

- Checked-in Mini runtime defaults must not point to `localhost`, `127.0.0.1`, or other loopback-only targets.
- The checked-in app should default to an explicit placeholder/safe preview backend posture for now.
- Later operator/runtime activation must come from config or local/private overrides, not from page/business-logic source edits.
- Operator-private WeChat files (for example `project.private.config.json`) and upload key material must stay local-only and untracked.

## Local dependency state

- The current repo already contains a usable `.venv-mission`.
- `./.factory/init.sh` cannot reliably recreate that venv from scratch in this environment today because system Python `venv/ensurepip` support is missing.
- `mini/package.json` exists and the current `mini` scripts run in this environment.
- Docker is unavailable.
- MongoDB is currently not running on `127.0.0.1:27017`.
- Redis is currently not running on `127.0.0.1:6379`.
- Real WeChat DevTools/runtime validation is unavailable here.

## Backend and release notes

- The legacy local contract target remains `http://localhost:8001` only for focused development/testing when the backend can run; it is not an acceptable checked-in publish-shell default.
- Honest live backend validation is still blocked until MongoDB/Redis and required backend config exist.
- Actual upload/publish still requires operator-controlled prerequisites such as DevTools login or a code-upload private key, IP allowlisting, public HTTPS domains, and platform-side compliance/account steps.

## Scope constraints

- WeChat-specific login/bind delivery remains out of scope for this continuation.
- The Mini client must remain thin and contract-first so the same backend payloads stay reusable for future mobile work.
- Secrets must stay local-only and must never be committed.
- The repo root `.gitignore` contains a broad `data/` ignore rule, so new checked-in Mini source/helpers should not be placed under `mini/data/` unless the ignore patterns are intentionally adjusted first.
