---
name: backend-worker
description: Implement backend watchlist, digest, and auth contract features with API-first verification.
---

# backend-worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for backend/domain/API features involving the canonical watchlist model, digest/rule APIs, auth/bind flows, migrations, and backend validation/setup needed to make those contracts executable.

## Required Skills

None.

## Work Procedure

1. Read `mission.md`, `AGENTS.md`, `.factory/library/architecture.md`, `.factory/library/contracts.md`, and the assigned feature.
2. Confirm the contract assertions listed in the feature's `fulfills` field and write/adjust failing automated tests first.
3. Implement the smallest backend change set that makes those tests pass while preserving existing user data.
4. If the feature changes API contracts, verify request/response shapes with `curl` against the local backend on `8001`.
5. For migration-sensitive work, verify both fresh data and legacy/pre-existing shapes when applicable.
6. When the feature changes shared identifiers, auth ownership, or router/service/model interactions, do an explicit self-review before handoff: verify the contract fields, ownership boundaries, and route/service/model consistency all still match `mission.md`, `AGENTS.md`, and `.factory/library/contracts.md`.
7. Run relevant validators from `.factory/services.yaml` and any focused tests added for the feature.
8. Do not hand off until you have concrete evidence for each fulfilled assertion or an explicit blocker.

## Example Handoff

```json
{
  "salientSummary": "Stabilized the backend watch API on port 8001, mounted `/api/watch` routes, and hardened auth gating plus task-oriented digest refresh semantics. Added targeted pytest coverage and verified representative contract paths with curl.",
  "whatWasImplemented": "Mounted the watch router in the backend startup path, aligned protected watchlist and digest endpoints with the canonical auth boundary, and updated refresh responses to return durable caller-scoped task metadata. Preserved existing favorites behavior while making the watch contract reachable for web and API validators.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": ".venv-mission/bin/python -m pytest tests/services/test_favorites_service.py -v",
        "exitCode": 0,
        "observation": "Focused favorites service regression tests passed."
      },
      {
        "command": "curl -sf http://localhost:8001/api/health",
        "exitCode": 0,
        "observation": "Backend health endpoint responded successfully on mission port 8001."
      },
      {
        "command": "curl -i http://localhost:8001/api/watch/digests",
        "exitCode": 0,
        "observation": "Unauthenticated request returned 401 as expected."
      }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "tests/services/test_favorites_service.py",
        "cases": [
          {
            "name": "watch endpoints stay caller scoped",
            "verifies": "authenticated callers only see their own watchlist data"
          },
          {
            "name": "digest refresh returns task metadata",
            "verifies": "refresh stays asynchronous and caller scoped"
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The feature requires a new external credential, WeChat integration secret, or third-party setup the worker cannot obtain.
- Existing data shape ambiguity makes migration behavior unsafe without a mission-level decision.
- The feature cannot be completed without changing a validation contract assumption.
