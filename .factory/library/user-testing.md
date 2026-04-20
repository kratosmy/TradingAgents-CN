# User Testing

Testing surfaces, required tools, and validation concurrency guidance.

**What belongs here:** user-visible validation surfaces, tool choices, setup notes, concurrency/resource guidance, known limitations.

---

## Validation Surface

### API contract surface
- Primary executable validation surface for this mission.
- Validate with focused `pytest` suites and FastAPI `TestClient` probes against auth + watch digest contracts.
- Critical assertions:
  - login success/failure envelope
  - bearer protection on digest reads
  - canonical digest-card projection and placeholder waiting-state behavior
  - exact canonical watch-membership projection under degraded enrichment

### Mini source/build surface
- Validate the delivered top-level `mini/` app with a named local validator defined by the implementation worker.
- Acceptable evidence is Mini-specific source/build output and local preview/static proof generated from `mini/`.
- The existing reference demo files do **not** count as final mission evidence:
  - `frontend/src/views/MiniDemo/index.vue`
  - `mini-demo-local.html`
- Any Mini preview/build proof must label itself as local-only and must not claim WeChat runtime/device success.

### Live browser/runtime surface
- Not an executable validation surface in the current environment.
- Browser automation is blocked by missing `libasound.so.2`.
- Real WeChat simulator/device validation is unavailable.

## Validation Concurrency

### API validators
- Max concurrent validators: `2`
- Rationale: focused in-process auth/watch contract tests are lightweight on a 20-core / ~15.9 GB machine and do not require live browser instances.

### Mini source/build validators
- Max concurrent validators: `1`
- Rationale: only one delivered `mini/` build/preview surface exists, and serial execution keeps evidence clear while the exact toolchain is still being introduced.

### Live browser/runtime validators
- Max concurrent validators: `0`
- Rationale: this surface is currently blocked and must not be claimed.

## Setup Notes

- Run `./.factory/init.sh` before validators so `.venv-mission` and any available frontend/mini dependencies are installed.
- If `mini/package.json` exists, `init.sh` may install Mini dependencies automatically.
- Backend live startup on `8001` is currently blocked unless MongoDB is available and required env vars are supplied.
- Use focused `pytest` / FastAPI `TestClient` validation instead of pretending live API/browser end-to-end coverage exists.

## Accepted Limitations

- No honest WeChat runtime, simulator, or device validation is possible in this environment.
- No honest browser automation is possible until `libasound.so.2` is available.
- Local Mini validation proves source/build readiness and contract-faithful client mapping only.

## Flow Validator Guidance: API contract surface

- Isolation boundary: use in-process `pytest` and `FastAPI TestClient` only; do not start or depend on live MongoDB/Redis/backend services for these assertions.
- Safe shared resources: the repo working tree and `.venv-mission` are shared, but tests must avoid writing outside their assigned flow report and evidence paths.
- Off-limits: do not mutate app business logic, runtime env secrets, or mission files other than the assigned flow report/evidence.
- Evidence expectations: capture the exact test commands, exit codes, and the key assertion evidence for login success/failure, bearer protection, canonical digest-card fields, placeholder states, and canonical watch-membership projection.

## Flow Validator Guidance: Mini source/build surface

- Isolation boundary: validate only from the delivered top-level `mini/` surface using its local validator, source inspection, and generated local preview artifacts.
- Safe shared resources: `mini/` source files, `mini/dist/`, and the assigned flow report/evidence paths.
- Off-limits: do not claim browser, WeChat simulator, or device runtime success; do not rely on `frontend/src/views/MiniDemo/index.vue` or `mini-demo-local.html` as final evidence.
- Evidence expectations: show the named `mini/` validator output, the local-only disclosure from the delivered Mini surface, authenticated digest-card mapping by canonical `stock_code`, placeholder-card handling, and the auth-required empty state on missing/failed auth.
