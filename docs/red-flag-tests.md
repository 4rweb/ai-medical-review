# Red-Flag Test Script (§14)

The clinical safety layer (`ClinicalSafetyService`) is a **deterministic
validator** that runs *after* the AI and **overrides** the classification when it
detects a critical sign — the safety net against under-triage.

This script validates calibration with edge cases **without depending on the
AI** (it runs directly against the validator). Executable test:
[`apps/apis/src/triage/red-flag-roteiro.test.ts`](../apps/apis/src/triage/red-flag-roteiro.test.ts).

> Inputs are in Portuguese (the product language); expected outcomes and notes
> are in English.

## Critical cases — MUST escalate to red

| Input (PT) | Rule fired | Forced level |
|---|---|---|
| "Dor de cabeça súbita e explosiva, a pior da minha vida." (sudden thunderclap headache) | `CEFALEIA_THUNDERCLAP` | 🔴 Red |
| "Dor no peito que irradia pro braço, com suor frio." (chest pain radiating to arm, cold sweat) | `DOR_TORACICA_ISQUEMICA` | 🔴 Red |
| "Falta de ar intensa, não consigo completar frases." (severe dyspnea, can't finish sentences) | `DISPNEIA_INTENSA` | 🔴 Red |
| "Fraqueza súbita de um lado do corpo e fala arrastada." (sudden one-sided weakness, slurred speech) | `AVC_FAST` | 🔴 Red |

## Mild complaints — MUST NOT be escalated by code

The validator never invents severity: these pass **without escalation** and the
color is left to the classifier (AI + Manchester grounding).

| Input (PT) | Deterministic escalation |
|---|---|
| "Febre alta há 1 dia, sem outros sinais." (high fever for 1 day, no other signs) | none (AI decides → yellow/green) |
| "Dor de garganta leve há 2 dias." (mild sore throat for 2 days) | none (AI decides → green/blue) |

## Vital signs

| Input | Result |
|---|---|
| Mild report + SpO₂ **87%** | 🔴 Red (`HIPOXEMIA`) |
| Mild report + SpO₂ **88–91%** | 🟠 Orange (`HIPOXEMIA`) |
| Mild report, **no vitals provided** | no escalation (absent ≠ normal) |

## Result

```
✓ src/triage/red-flag-roteiro.test.ts (8 tests)
  Tests  8 passed (8)
```

Run: `pnpm --filter apis exec vitest run src/triage/red-flag-roteiro.test.ts`

> Golden rule: if any red case falls to yellow/green it is **under-triage** —
> fix the prompt + validator before proceeding. Review by a healthcare
> professional is recommended before the demo.
