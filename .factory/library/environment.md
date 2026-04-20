# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** required env vars, external services, local runtime assumptions, dependency quirks, platform limits.
**What does NOT belong here:** service ports/commands (use `.factory/services.yaml`).

---

## Mini MVP runtime assumptions

- The approved mission builds a new top-level `mini/` client as a local-contract MVP.
- Real WeChat Mini Program runtime, simulator, and device validation are not available in this environment.
- Existing demo artifacts under `frontend/src/views/MiniDemo/index.vue` and `mini-demo-local.html` are reference surfaces only; they are not valid final delivery evidence for the mission.
- The Mini client should reuse the existing JWT login contract and watch digest contract instead of introducing WeChat-specific auth semantics in this mission.

## Local dependency state

- Workers use `.venv-mission` created by `.factory/init.sh` for Python validation.
- Frontend dependencies may need local installation before any web or Mini source/build validation can run.
- Docker is unavailable in this environment.
- MongoDB is currently not running on `127.0.0.1:27017`.
- Redis is currently not running on `127.0.0.1:6379`.
- Browser automation is blocked by the missing system library `libasound.so.2`.

## Backend configuration notes

- The backend target for shared contract work is `http://localhost:8001` when it can be started.
- Backend startup currently requires local config such as `MONGODB_HOST`, `MONGODB_PORT`, `MONGODB_DATABASE`, `REDIS_HOST`, `REDIS_PORT`, and `JWT_SECRET`.
- Even with development defaults supplied, live backend startup still fails if MongoDB is unreachable.
- Focused backend contract tests remain the honest fallback validation surface when live backend startup is blocked.

## Scope constraints

- WeChat account bind flows are out of scope for this mission.
- The Mini client must remain thin and contract-first so the same backend payloads stay reusable for future iOS/mobile work.
- Secrets must stay local-only and must never be committed.
