# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** required env vars, external services, local runtime assumptions, dependency quirks, platform limits.
**What does NOT belong here:** service ports/commands (use `.factory/services.yaml`).

---

## Mission-local runtime assumptions

- Backend workers use `.venv-mission` created by `.factory/init.sh`.
- Backend runtime for this mission must use port `8001`, not `8000`.
- Existing MongoDB on `localhost:27017` and Redis on `localhost:6379` are reused.
- Redis password is expected to match current project defaults (`tradingagents123`) unless a worker proves otherwise.

## Known environment constraints

- Port `8000` is occupied and off-limits for this mission.
- Current checked-in `venv` is not reliable for mission work; workers should use `.venv-mission`.
- True WeChat Mini Program runtime tooling is not available in this environment, so Mini validation is limited to source/build-level evidence unless that tooling is added later.

## External identity and integration expectations

- WeChat login plus account bind is in scope for this mission.
- The bind model must attach external identities to one stable internal `user_id` instead of creating a second ownership model.
- Future iOS reuse depends on stable backend contracts, not shared UI code.
