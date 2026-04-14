# User Testing

Testing surfaces, required tools, and validation concurrency guidance.

**What belongs here:** user-visible validation surfaces, tool choices, setup notes, concurrency/resource guidance, known limitations.

---

## Validation Surface

### API surface
- Primary contract surface for canonical watchlist, digest, and auth-bind behavior.
- Validate with `curl` against the mission backend on `http://localhost:8001`.
- Use API validation for membership, rules, digest payloads, auth/bind continuity, and account isolation.

### Web surface
- Validate existing web app behavior with `agent-browser` once backend is running on `8001` and the frontend is running on `3000`.
- Critical pages:
  - `/favorites`
  - `/watch`
  - dashboard favorites entry
  - screening favorite toggle
  - stock detail favorite toggle

### Mini/mobile-contract surface
- Current environment does not support honest WeChat Mini Program runtime validation.
- Acceptable evidence today is committed client structure, concrete API wiring, and named build/static validation for the Mini skeleton.
- Do not claim simulator/device or WeChat-login runtime success unless the tooling is actually added and exercised.

## Validation Concurrency

### API validators
- Max concurrent validators: `2`
- Rationale: lightweight `curl` checks against one backend process and shared MongoDB/Redis are low-cost on the current machine.

### Integrated web + API validators
- Max concurrent validators: `1`
- Rationale: current readiness depends on a single backend process on `8001` plus a single frontend dev server on `3000`; keep browser-driven validation serialized until backend startup and watch endpoints are stable.

### Mini/mobile-contract validators
- Max concurrent validators: `1`
- Rationale: this is source/build validation only; concurrency is not a bottleneck, but keeping it serialized reduces confusion around limited evidence.

## Setup Notes

- Reuse the existing backend already serving `8001`; do not stop or replace it unless the orchestrator changes the mission boundary.
- Start frontend on `3000`.
- Reuse existing MongoDB (`27017`) and Redis (`6379`).
- If `/api/watch/*` is unreachable, treat that as a contract failure for web watch validation rather than silently skipping `/watch` flows.
- The manifest backend validator `.venv-mission/bin/python -m pytest tests/ -v` intentionally relies on `tests/conftest.py` to collect the automated subdirectories plus a vetted `_AUTOMATED_TOP_LEVEL_FILES` allowlist; most other historical root-level `tests/test*.py` files remain direct-run/manual checks until they are explicitly repaired and promoted.

## Accepted Limitations

- Mini Program runtime/device validation is out of scope until real WeChat tooling exists in this environment.
- Web validation is a consumer regression surface; it does not prove Mini runtime parity.
