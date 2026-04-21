# User Testing

Testing surfaces, required tools, and validation concurrency guidance.

**What belongs here:** user-visible validation surfaces, tool choices, setup notes, concurrency/resource guidance, known limitations.

---

## Validation Surface

### API contract surface
- Primary shared-contract validation surface for auth + digest behavior already shipped in milestone 1.
- Validate with focused `pytest` suites and FastAPI `TestClient` probes against auth + watch digest contracts.
- Critical assertions remain:
  - login success/failure envelope
  - bearer protection on digest reads
  - canonical digest-card projection and placeholder waiting-state behavior
  - exact canonical watch-membership projection under degraded enrichment

### Mini shell source/build surface
- Primary executable validation surface for the new polish shell.
- Validate the delivered top-level `mini/` app through Mini-specific source/build scripts, generated proof, and local preview/static artifacts.
- Critical assertions for this continuation:
  - checked-in import-shell config and non-loopback runtime defaults
  - Home / Watch / Account shell structure and navigation
  - Settings / About / Privacy / Help round-trip navigation
  - surface-specific states (signed-out, authenticated-empty, loading, waiting, ready, preview/deferred-runtime)
  - dark-premium visual-system reuse across primary surfaces

### Release-preflight surface
- Execute offline-checkable release readiness only.
- Validate repo-owned release config, secret gating, ignored private artifacts, and checked-in runtime handoff docs.
- Critical assertions:
  - manual preflight fails closed on illegal checked-in config
  - optional `miniprogram-ci` scaffold refuses to proceed without injected secrets
  - private WeChat artifacts and upload keys stay local-only/untracked
  - product copy, preflight output, and handoff docs stay consistent about deferred runtime/upload steps

### Real runtime / upload surface
- Not an executable validation surface in the current environment.
- Real WeChat simulator/device runtime, live backend validation, and actual upload/publish execution remain deferred.

## Validation Concurrency

### API validators
- Max concurrent validators: `2`
- Rationale: focused in-process auth/watch contract tests are light and do not require browser or Mini runtime instances.

### Mini shell source/build validators
- Max concurrent validators: `5`
- Rationale: current dry run showed `npm --prefix mini run test`, `build`, and `validate` are lightweight on this machine, with minimal memory/process growth.

### Release-preflight validators
- Max concurrent validators: `5`
- Rationale: offline preflight and secret-gate checks should stay light and CPU/memory-cheap, assuming isolated workspaces when scripts write artifacts.

### Real runtime / upload validators
- Max concurrent validators: `0`
- Rationale: this surface is currently unavailable and must not be claimed.

## Setup Notes

- Reuse the existing repo-local `.venv-mission`; do not rely on recreating it from scratch here.
- `npm --prefix mini run test`, `npm --prefix mini run build`, and `npm --prefix mini run validate` are executable now.
- `./.factory/init.sh` may fail in a fresh clone/workspace if system Python `venv/ensurepip` support is missing.
- Backend live startup on `8001` remains blocked unless MongoDB/Redis and required env vars are provided.
- Release validation in this continuation must stay offline/source/build-first.

## Accepted Limitations

- No honest WeChat runtime, simulator, or device validation is possible in this environment.
- No honest live upload/publish execution is possible here.
- No honest live backend-backed end-to-end shell validation is possible until MongoDB/Redis and a public backend/runtime path exist.
- Current validation proves source/build/preflight readiness and contract-faithful shell behavior only.

## Flow Validator Guidance: Mini shell source/build surface

- Validate only from the delivered top-level `mini/` surface.
- Use the app’s named scripts plus source/build/generated proof to verify shell structure, navigation, state handling, and visual-system reuse.
- Do not treat older Vue or HTML demo artifacts as valid evidence.
- Do not claim runtime/device/upload success.

## Flow Validator Guidance: Release-preflight surface

- Validate only offline-checkable repo-owned config, checked-in handoff docs, and secret-gated script behavior.
- Captured failure output for missing secrets or blocked upload/runtime steps is valid evidence when it is intentional and explicit.
- Do not imply platform-side approval, IP allowlisting, DevTools login success, or live publish success.
