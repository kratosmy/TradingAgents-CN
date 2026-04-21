---
name: mobile-contract-worker
description: Build the Mini publish shell, mobile contract boundary, and honest release scaffolding without overstating runtime validation.
---

# mobile-contract-worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for Mini Program shell work, shared mobile-facing contract adapters, runtime configuration boundaries, release-preflight scaffolding, and platform-neutral client tasks intended to keep future iOS reuse clean.

## Required Skills

None.

## Work Procedure

1. Read `mission.md`, `AGENTS.md`, `.factory/library/architecture.md`, `.factory/library/contracts.md`, `.factory/library/environment.md`, `.factory/library/user-testing.md`, and the assigned feature.
2. Confirm exactly what can be honestly validated in this environment. Do not assume WeChat runtime, device, DevTools upload, or live backend support unless the evidence is actually available.
3. Add or extend Mini source/build validation first for the surface you are changing. For shell work, this means failing checks or preview/static proof for page registration, navigation, state handling, or preflight behavior before implementation.
4. When working on shell structure, preserve the agreed responsibilities: `Home` is overview, `Watch` is the primary protected detailed digest surface, and `Account` owns identity/legal/help entry points.
5. Keep runtime configuration repo-owned and explicit. Checked-in defaults must stay non-loopback and placeholder-safe; local/private operator overrides and upload secrets must stay untracked.
6. Treat auth as a real contract boundary: reuse `POST /api/auth/login`, persist the bearer session, and fail closed on missing or invalid auth instead of showing mock or stale watch cards.
7. Preserve placeholder/waiting-state digest behavior and distinguish signed-out, authenticated-empty, loading, waiting, ready, and preview/deferred-runtime states honestly.
8. Reuse a shared dark-premium visual system across primary shell surfaces rather than styling pages independently.
9. For release-tooling work, implement offline preflight and secret-gated upload scaffolding that fail closed with actionable output; never fake a successful upload path when secrets or platform prerequisites are missing.
10. Run the affected Mini scripts (`test`, `build`, `validate`, and any new preflight/upload dry-run command you add) plus any relevant focused backend checks if the shared contract boundary changed.
11. In the handoff, explicitly separate source/build/preflight evidence from runtime evidence and call out deferred operator/runtime steps honestly.

## Example Handoff

```json
{
  "salientSummary": "Expanded the Mini app into a publish-facing shell with distinct Home/Watch/Account surfaces, added a non-loopback placeholder runtime config boundary, and scaffolded a gated release preflight path. Verified only source/build/preflight evidence; no DevTools runtime or live upload claim was made.",
  "whatWasImplemented": "Added checked-in Mini shell configuration, shared dark-premium tokens, page registration/navigation, and release scaffolding that keeps operator-private files local-only. Watch remains the primary protected digest surface, Account links to settings/about/privacy/help, and the release path now fails closed without injected secrets.",
  "whatWasLeftUndone": "Real WeChat runtime, live backend verification, DevTools login, IP allowlisting, and final publish execution still require operator-controlled setup outside this environment.",
  "verification": {
    "commandsRun": [
      {
        "command": "npm --prefix mini run test",
        "exitCode": 0,
        "observation": "Mini source-level contract and state regressions passed."
      },
      {
        "command": "npm --prefix mini run build",
        "exitCode": 0,
        "observation": "Generated updated local proof for the shipped shell."
      },
      {
        "command": "npm --prefix mini run preflight",
        "exitCode": 0,
        "observation": "Offline release preflight passed for checked-in config and documented deferred operator steps."
      },
      {
        "command": "npm --prefix mini run upload:wechat -- --dry-run",
        "exitCode": 1,
        "observation": "Expected failure without injected upload secrets; secret gate is working."
      }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "mini/tests/publish-shell.test.mjs",
        "cases": [
          {
            "name": "watch stays auth-gated while shell remains navigable",
            "verifies": "signed-out users can navigate Home and Account while Watch blocks protected digest content"
          },
          {
            "name": "release preflight fails on loopback runtime defaults",
            "verifies": "checked-in release config cannot pass with localhost or missing required identity/runtime fields"
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The requested feature would require claiming WeChat runtime/device/upload success without actual tooling or credentials.
- The backend contract is unstable enough that the mobile boundary would be guesswork.
- The feature requires secrets, DevTools access, IP allowlisting, or platform-side publish actions that are not available in this session.
- The requested shell behavior conflicts with the agreed Home / Watch / Account responsibilities or other mission artifacts.
