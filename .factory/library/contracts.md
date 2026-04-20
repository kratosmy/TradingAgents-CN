# Contracts

Shared contract notes for workers touching watchlist-related APIs.

**What belongs here:** stable cross-client semantics, identifier rules, ownership rules, and payload-shape expectations.

---

## Canonical ownership

- One stable internal `user_id` owns watchlist items, rules, digests, tasks, and report linkage.
- This mission reuses the existing JWT auth contract only.
- WeChat-specific identity binding is explicitly out of scope for this MVP.

## Identifier discipline

- Workers must converge on one documented primary stock identifier shape across create/read/update/delete, rule, digest, and client contracts.
- If compatibility aliases are temporarily supported during migration, they must be explicit and test-covered.
- Canonical watchlist APIs expose `stock_code` as the only client-facing stock identifier field.
- During watchlist migration the backend may read legacy stored aliases such as `symbol`, but it must normalize them into `stock_code` before returning payloads or persisting canonical watchlist state.
- The Mini home must render at most one card per canonical `stock_code`.

## Payload discipline

- Canonical list and digest payloads must stay presentation-neutral.
- Thin clients should not need browser route context, HTML fragments, or client-specific transforms to interpret core watchlist state.
- Compact home-screen payloads are preferred over many round trips for Mini-first usage.
- The Mini boundary must not require heavy report payloads to render the MVP home experience.

## Mini MVP digest-card baseline

The Mini read-path MVP should treat these digest-card fields as the minimum stable read contract:

- identity: `stock_code`, `stock_name`, `market`
- compact enrichment: `board`, `exchange`, `current_price`, `change_percent`
- digest summary: `digest_status`, `summary`, `risk_level`
- rule/task waiting state: `rule_status`, `task_status`, `task_id`, `updated_at`, `task_updated_at`

Optional extra fields may exist, but the Mini MVP must not depend on browser-only or report-body fields.

## Auth/session discipline

- `POST /api/auth/login` is the entry contract for this mission.
- Protected digest reads require `Authorization: Bearer <access_token>`.
- Auth failures must fail closed; Mini clients must not interpret auth failure as an empty successful digest list.
