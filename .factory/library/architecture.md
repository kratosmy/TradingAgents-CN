# Watchlist Mission Architecture

## What belongs here

This document captures the high-level architecture for the watchlist mission: the shared watch domain, the Mini client boundary, the publish-shell composition, and the release/readiness scaffolding that workers must preserve. It is intentionally architectural rather than task-by-task.

## Mission-scope callout

The first Mini milestone is already complete: the repo has a real top-level `mini/` app, JWT login reuse, and a protected digest read path. The current continuation upgrades that thin MVP into a publish-facing shell while keeping the same contract-first backend boundary and staying honest about deferred runtime/upload validation.

## Components

### Canonical watchlist domain

The core domain remains one user-scoped watchlist keyed by stable stock identity and one stable internal user account. Membership, rule state, and digest summaries stay backend-owned and presentation-neutral.

### Watchlist API surface

The watchlist API remains the contract layer over the canonical domain. It owns membership, projection shape, and user isolation. Clients consume it; they do not reinterpret ownership rules locally.

### Digest projection boundary

The digest read path remains a compact projection over canonical watch membership plus digest/rule/task enrichment. This boundary still exposes canonical `stock_code`, compact quote context, summary, risk, and status fields suitable for thin mobile rendering.

### Auth/session boundary

The Mini shell still reuses the existing JWT login contract. Authentication yields a bearer session, and protected digest reads consume that bearer session. Auth failures clear or block protected watch content rather than falling through to mock or stale cards.

### Mini runtime configuration boundary

The checked-in Mini app now needs a repo-owned runtime/configuration boundary instead of hardcoded local URLs. That boundary should:

- preserve shared AppID / project identity in checked-in config
- keep a safe placeholder or preview-mode default under versioned source
- allow later operator/runtime override through configuration rather than page/business-logic edits
- separate checked-in shared config from local/private operator artifacts

### Mini publish shell

The polish shell is organized around distinct user-facing responsibilities:

- **Home**: product entry and overview, with optional highlight-level watch summary
- **Watch**: the primary protected detailed digest/watch surface
- **Account**: identity state plus entry into settings, about, privacy, and help

Secondary pages (`Settings`, `About`, `Privacy`, `Help`) are part of the publish shell, not dead links or out-of-app documentation placeholders.

### Visual system

The shell adopts an objective dark-premium design system rather than ad hoc page styling. Workers should think in reusable surface rules:

- dark root canvas/backgrounds
- restrained accent usage for active navigation and primary actions
- elevated cards/containers for content grouping
- shared spacing and typography tokens across primary surfaces

### Release/readiness scaffolding

The repo now also needs a release boundary that stays honest:

- offline manual-upload preflight for repo-owned config only
- checked-in runtime/release handoff guidance for later operator steps
- secret-gated `miniprogram-ci` scaffold that refuses to run without injected credentials
- local/private WeChat artifacts kept outside versioned source

This layer validates import-shell and release-shell readiness without claiming live upload, audit approval, or runtime success.

## Data Flows

### 1. Login to protected digest flow

1. The user signs in through the existing JWT login endpoint.
2. The Mini session boundary normalizes and persists the bearer session.
3. The protected digest surface uses that bearer token on `GET /api/watch/digests`.
4. Auth failure clears or blocks protected cards and returns the user to an auth-required state.

### 2. Home / Watch shell flow

1. Home loads first as the product entry surface.
2. Watch owns the primary protected digest-reading experience and its detailed card states.
3. Home may summarize or highlight watch state, but it does not replace Watch as the main protected digest destination.
4. Account exposes signed-in/signed-out identity state and links to secondary product/legal/help pages.

### 3. Placeholder-to-runtime configuration flow

1. The checked-in app boots in a safe placeholder/preview configuration.
2. Shared runtime settings determine the visible backend/runtime posture.
3. Later operator/runtime activation swaps config inputs, not page/business logic.
4. Release/preflight surfaces describe the deferred operator work explicitly.

### 4. Release readiness flow

1. The repo validates checked-in Mini identity/runtime/release config offline.
2. Preflight refuses illegal repo-owned config such as loopback runtime targets or malformed release metadata.
3. If optional `miniprogram-ci` scripts are invoked without injected secrets, they fail closed with actionable guidance.
4. Checked-in handoff material documents what still requires operator login, private keys, IP allowlisting, HTTPS domains, and platform-side approval.

## Invariants

- There is one canonical user-scoped watchlist domain behind all clients.
- The Mini client remains thin and contract-first.
- `Watch` is the primary protected detailed digest surface in the publish shell.
- `Home` can summarize watch state but must remain distinct from `Watch`.
- Checked-in shared runtime config must not point at loopback-only targets.
- Placeholder/preview posture must stay explicit across product UI, preflight output, and release handoff docs.
- Upload keys, operator-private project files, and similar secrets must stay local-only and untracked.
- Release tooling may claim source/build/preflight readiness only; it must not imply live runtime or completed publish validation.

## Validation-relevant boundaries

### Shared contract boundary

Validation should prove the Mini shell still consumes compact shared digest-card fields without browser-only or Mini-only backend semantics.

### Shell responsibility boundary

Validation should prove Home, Watch, and Account are distinct surfaces with appropriate navigation and state behavior.

### Runtime configuration boundary

Validation should prove the checked-in app defaults to a safe placeholder/preview mode, avoids loopback-only targets, and preserves a later config-driven swap path.

### Release honesty boundary

Validation should prove preflight/CI scaffolding, product copy, and checked-in handoff docs tell the same truth about what is ready now versus what is deferred.
