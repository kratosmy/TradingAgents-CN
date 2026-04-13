---
name: frontend-worker
description: Implement and verify web watchlist features against canonical backend contracts.
---

# frontend-worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for web watchlist/favorites/dashboard/screening/detail UI work, API-client refactors, and browser-visible regressions that must stay aligned with canonical backend contracts.

## Required Skills

- `agent-browser` — invoke for browser-visible verification of every fulfilled web assertion.
- `check-cross-layer` — invoke before handoff when frontend work changes shared contract assumptions or identifier usage.

## Work Procedure

1. Read `mission.md`, `AGENTS.md`, `.factory/library/architecture.md`, `.factory/library/contracts.md`, and the assigned feature.
2. Identify the exact user-visible assertions in `fulfills` and add or update automated checks first where the repo supports them.
3. Implement the UI/API-client changes while preserving the current navigation model and user feedback patterns unless the feature says otherwise.
4. Run frontend validators from `.factory/services.yaml` (`lint`, `typecheck`, and `build`) before handoff.
5. Launch the app and use `agent-browser` to exercise each fulfilled browser assertion end-to-end.
6. Invoke `check-cross-layer` when changing shared identifiers, contract mapping, or cross-page watchlist behavior.
7. Record every browser flow in `interactiveChecks` with the exact action sequence and what was observed.
8. Do not hand off with vague statements like “UI works”; include concrete routes, actions, and results.

## Example Handoff

```json
{
  "salientSummary": "Refactored `/favorites` to the canonical watchlist contract and preserved secondary entry-point toggles from screening and stock detail. Browser checks confirmed add/edit/remove flows and secondary-entry updates remain visible.",
  "whatWasImplemented": "Updated the web favorites views and API client mappings to the canonical identifier shape, preserved the existing feedback flows for add/edit/remove, and aligned dashboard, screening, and stock-detail entry points to the same watchlist membership source.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "npm --prefix frontend run lint",
        "exitCode": 0,
        "observation": "Frontend lint completed successfully."
      },
      {
        "command": "npm --prefix frontend run type-check",
        "exitCode": 0,
        "observation": "Vue type-check passed."
      },
      {
        "command": "npm --prefix frontend run build",
        "exitCode": 0,
        "observation": "Production build completed successfully."
      }
    ],
    "interactiveChecks": [
      {
        "action": "Logged in, opened /favorites, added a stock, edited tags, then removed it.",
        "observed": "Success toasts appeared, the row updated in place, and removal kept the user on /favorites."
      },
      {
        "action": "Opened screening and stock detail pages and toggled favorite membership.",
        "observed": "Both entry points reflected the canonical membership state and showed visible feedback."
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "frontend/src/api/favorites.ts",
        "cases": [
          {
            "name": "canonical identifier mapping stays stable",
            "verifies": "web API client uses the documented watchlist identifier contract"
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Browser-visible behavior depends on backend routes or payloads that are still missing or contradictory.
- A feature requires a Mini Program runtime claim that cannot be honestly validated through the web surface.
- The UI requires a product decision that changes the accepted validation contract.
