---
name: mobile-contract-worker
description: Build the Mini skeleton and shared mobile contract boundary without overstating runtime validation.
---

# mobile-contract-worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for Mini Program skeleton work, shared mobile-facing contract adapters, and platform-neutral client boundary tasks intended to keep future iOS reuse clean.

## Required Skills

- `check-cross-layer` — invoke before handoff when changing shared identifiers, API contract mapping, or ownership semantics relied on by web and mobile clients.

## Work Procedure

1. Read `mission.md`, `AGENTS.md`, `.factory/library/architecture.md`, `.factory/library/contracts.md`, and the assigned feature.
2. Confirm exactly what can be honestly validated in this environment. Do not assume WeChat runtime, device, or simulator support unless it is explicitly present and working.
3. Add or update any build/static validation first for the client surface you are creating.
4. Implement a thin client boundary that consumes canonical watchlist contracts without introducing Mini-only backend semantics.
5. Run the named validation/build command for the Mini/client surface and any affected shared frontend commands.
6. Invoke `check-cross-layer` when modifying shared API shapes or identifier mappings.
7. In the handoff, explicitly separate source/build evidence from runtime evidence.

## Example Handoff

```json
{
  "salientSummary": "Added an in-repo Mini watchlist skeleton wired to canonical digest contracts and verified its named build command. Kept the client thin and did not claim device/runtime success because WeChat tooling is still absent.",
  "whatWasImplemented": "Created the Mini client entry files, watchlist home structure, and API wiring to the canonical watchlist/digest contracts. Documented the shared identifier and payload expectations so the same backend shape remains suitable for future iOS work.",
  "whatWasLeftUndone": "No simulator or device validation was possible because WeChat runtime tooling is not present in this environment.",
  "verification": {
    "commandsRun": [
      {
        "command": "<named mini build command>",
        "exitCode": 0,
        "observation": "Mini skeleton source and API wiring passed the available static validation path."
      }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "<mini-client-path>",
        "cases": [
          {
            "name": "watch home consumes canonical digest shape",
            "verifies": "the thin mobile client maps the shared watchlist contract without Mini-only backend fields"
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The requested feature would require claiming WeChat runtime/device success without actual tooling.
- The backend contract is still unstable enough that the mobile boundary would be guesswork.
- The feature requires a product decision about Mini-first vs shared-contract behavior that is not reflected in the mission artifacts.
