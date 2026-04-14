# Contracts

Shared contract notes for workers touching watchlist-related APIs.

**What belongs here:** stable cross-client semantics, identifier rules, ownership rules, and payload-shape expectations.

---

## Canonical ownership

- One stable internal `user_id` owns watchlist items, rules, digests, tasks, and report linkage.
- WeChat identities are bindings to that internal account, not separate owners.

## Identifier discipline

- Workers must converge on one documented primary stock identifier shape across create/read/update/delete, rule, digest, and client contracts.
- If compatibility aliases are temporarily supported during migration, they must be explicit and test-covered.
- Canonical watchlist APIs expose `stock_code` as the only client-facing stock identifier field.
- During watchlist migration the backend may read legacy stored aliases such as `symbol`, but it must normalize them into `stock_code` before returning payloads or persisting canonical watchlist state.

## Payload discipline

- Canonical list and digest payloads must stay presentation-neutral.
- Thin clients should not need browser route context, HTML fragments, or client-specific transforms to interpret core watchlist state.
- Compact home-screen payloads are preferred over many round trips for Mini-first usage.
