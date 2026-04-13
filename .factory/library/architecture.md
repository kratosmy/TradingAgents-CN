# Watchlist Mission Architecture

## What belongs here

This document captures the high-level architecture for the watchlist mission: the system components, their responsibilities, the main data flows between them, the canonical watchlist domain model, and the cross-client boundaries that must stay stable for web, WeChat Mini Program, and a future iOS client. It intentionally does not include an implementation checklist.

## Components

### Canonical watchlist domain

The core domain is a single user-scoped watchlist. Each watchlist item represents a user’s intent to follow one stock and carries the stock identity plus lightweight user metadata such as tags, notes, and alert thresholds. This canonical watchlist is the source of truth for membership across all clients and downstream watch features.

The domain must expose one stable stock identifier shape, one stable user ownership model, and presentation-neutral fields that can be rendered by different clients without client-specific reinterpretation.

### Watchlist API surface

The watchlist API is the contract layer over the canonical watchlist domain. It is responsible for:

- listing the caller’s watchlist entries
- adding, updating, checking, and removing watchlist membership
- returning compact quote and market context fields needed by thin clients
- preserving caller-supplied metadata

This layer replaces any client assumption that "favorites" and "watchlist" are separate stores. Compatibility can exist during migration, but the exposed contract should behave as one watchlist system.

### Quote and market enrichment

Quote and market enrichment supplies compact snapshot data for each watched stock, such as current price, change percentage, board, and exchange. It enriches canonical watchlist items for home-screen style consumption while remaining non-authoritative for membership itself.

Its responsibility is to attach current market context to watchlist items without creating or removing watchlist state.

### Watch rule domain

Watch rules define whether and how a watched stock should produce digest updates. A rule is user-scoped and keyed to a canonical watched stock. It carries schedule semantics, status, and any scheduler-facing configuration required to trigger digest work.

Rules are configuration layered on top of watchlist membership, not a separate ownership system.

### Digest domain

The digest domain stores lightweight, user-scoped analysis summaries for watched stocks. A digest is the compact monitoring view of analysis output: summary, recommendation, risk level, timestamps, and task/report linkage where available.

Digests are derived state. They should never become the source of truth for watchlist membership. The digest list is therefore a projection over the canonical watchlist plus the latest digest/rule state.

### Analysis and task execution

Analysis execution is the asynchronous worker path that creates or refreshes digest content. It receives a request to analyze one watched stock or many watched stocks, creates durable task-oriented work, and later writes digest/report-linked outputs back to the digest domain.

This component is responsible for long-running analysis and report generation, not for immediate client rendering logic.

### Scheduler

The scheduler turns active watch rules into timed refresh events. It binds schedule configuration to task creation and ensures digest generation can happen without direct client interaction.

Its responsibility is operational orchestration of active rules; it must not own business identity or watchlist membership.

### Auth and bind identity layer

The auth layer issues application sessions and resolves the caller’s stable internal user identity. The bind model adds an external Mini Program identity to that same internal account rather than creating a parallel watchlist owner model.

The key responsibility here is preserving one stable internal `user_id` across:

- existing web login
- WeChat Mini Program login
- later iOS login/bind variants

External identities are bindings onto an internal account, not replacements for it.

### Web client

The web client has two primary watch surfaces:

- canonical watchlist management (`favorites`)
- digest-oriented monitoring dashboard (`watch`)

The web client is responsible for rendering and mutating canonical watchlist state through backend contracts, not for embedding alternate watchlist logic in the UI.

### Mini skeleton / mobile contract boundary

The Mini Program client is intentionally thin. Its home view is optimized around compact watchlist snapshot cards and digest summaries with minimal round trips. The mobile boundary should depend on aggregated, platform-neutral backend payloads instead of recreating business rules in client code.

The same boundary should remain reusable for a future iOS client, so the backend contract must avoid web-only assumptions such as route context, HTML fragments, or UI-coupled field shapes.

## Data Flows

### 1. Watchlist membership flow

1. An authenticated user calls the canonical watchlist API.
2. The API resolves the stable internal `user_id`.
3. The watchlist domain creates, updates, checks, lists, or removes user-scoped watchlist items.
4. The response returns canonical watchlist fields plus compact enrichment fields when available.

This flow establishes the membership source of truth used by all other watch features.

### 2. Watchlist snapshot flow

1. The caller requests the watchlist list or digest list.
2. The backend loads canonical watchlist membership first.
3. Quote and market enrichment attach current snapshot fields.
4. The backend returns compact, presentation-neutral payloads suitable for web cards and Mini home views.

The enrichment step may degrade gracefully, but membership still returns.

### 3. Rule configuration flow

1. A caller configures or updates a watch rule for a watched stock.
2. The backend associates the rule with the same `user_id` and canonical stock identity used by the watchlist.
3. The scheduler reads active rule state and turns it into executable jobs.

Rule state augments canonical membership; it does not create hidden membership.

### 4. Digest refresh flow

1. A caller or scheduler requests a digest refresh for one stock or for the full current watchlist.
2. The backend creates durable task-oriented analysis work.
3. The analysis pipeline produces report-linked results asynchronously.
4. The digest domain stores the latest compact summary for that user and stock.
5. The digest list projects canonical watchlist membership plus latest digest plus current rule status.

This keeps heavy analysis asynchronous while the read path remains compact.

### 5. Cross-login identity flow

1. A user authenticates through web login or WeChat Mini Program login.
2. The auth layer resolves or binds the external identity onto one internal account.
3. Protected watchlist, rule, and digest APIs authorize against that stable internal `user_id`.
4. The same watchlist state remains visible regardless of login entry point.

This flow ensures account binding changes the authentication path, not the owned watchlist state.

### 6. Web and Mini consumption flow

1. The web client consumes canonical watchlist management and digest APIs for full management and dashboard views.
2. The Mini client consumes compact aggregated contracts for mobile-first watchlist home rendering.
3. A future iOS client reuses the same backend contracts and identity model.

Backend contracts therefore serve as the system boundary between shared watchlist behavior and client-specific presentation.

## Invariants

- There is one canonical watchlist membership domain per internal user account.
- Watchlist membership is user-scoped and must never leak across users.
- One stable internal `user_id` is the owner of watchlist items, rules, and digests.
- External identities such as WeChat are bindings to the internal account, not separate owners.
- Watch rules are attached to canonical watchlist items and do not silently create hidden watchlist membership.
- Digest cards are derived from the canonical watchlist and latest digest/rule state; they are not an independent source of membership.
- The stock identifier shape exposed to clients stays stable across create, read, update, delete, rule, and digest contracts.
- Snapshot enrichment may be partial or stale, but absent enrichment must not drop otherwise valid watchlist membership.
- Mobile and web clients consume presentation-neutral fields; backend payloads must not require browser-only context or Mini-only custom semantics.
- The Mini Program and future iOS clients share the same backend ownership and contract model even if their UI composition differs.

## Validation-relevant boundaries

### Canonical domain boundary

Validation should prove that list, add, update, check, and delete operations all act on the same canonical watchlist membership and keep user isolation intact.

### Digest and rule boundary

Validation should prove that:

- rules are user-scoped and stock-scoped
- digest cards are derived from current canonical watchlist membership
- add/remove mutations are reflected consistently across favorites and digest surfaces

### Auth and bind boundary

Validation should prove that:

- protected watch endpoints authorize through one stable internal `user_id`
- WeChat login/bind preserves account identity rather than splitting ownership
- watchlist, rule, and digest state survive bind and cross-login transitions

### Web contract boundary

Validation should treat the web client as a consumer of canonical watchlist and digest contracts. The web `favorites` and `watch` surfaces must remain consistent with backend membership, rule, and digest state.

### Mini/mobile boundary

Validation should treat the Mini client as a thin consumer of compact aggregated contracts. Build/source verification can confirm the boundary exists, but runtime claims must remain limited to the tooling actually available. The same contract shape should remain suitable for future iOS reuse.
