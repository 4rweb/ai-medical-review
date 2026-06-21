# Submission Eligibility Checklist — AI Medical Review

**Hackathon:** Global AI Hackathon Series with Qwen Cloud
**Track:** 4 — Autopilot Agent
**Submission deadline:** Jul 9, 2026 · 2:00 pm Pacific (= 6:00 pm Brasília)

Legend: ✅ done · ⚠️ partial / needs final pass · ⬜ owner action (record/upload/submit)

---

## A. Mandatory submission requirements (Official Rules §4)

| # | Requirement (verbatim intent) | Status | Evidence / where |
|---|-------------------------------|--------|------------------|
| 1 | **Built with Qwen models on Qwen Cloud** and fits a Track | ✅ | `qwen3.6-flash` + `qwen3-asr-flash` via DashScope — [`apps/apis/src/qwen/qwen.service.ts`](../apps/apis/src/qwen/qwen.service.ts) |
| 2 | **Public repository**, open-source, with an **open-source license file detectable in the About section** | ⚠️ | [`LICENSE`](../LICENSE) (MIT) committed at root → confirm repo is **Public** on GitHub so the "MIT License" badge shows in About |
| 3 | **Text description** explaining features and functionality | ⚠️ | Source ready: [`docs/ai-medical-review-story.md`](./ai-medical-review-story.md) → condense into the Devpost "text description" field |
| 4 | **Proof of Alibaba Cloud Deployment** — link to a code file using Alibaba Cloud services/APIs | ✅ | [`apps/apis/src/qwen/qwen.service.ts`](../apps/apis/src/qwen/qwen.service.ts) (DashScope client) — backend deployed on Alibaba Function Compute, persistence on ApsaraDB for PostgreSQL |
| 5 | **Architecture diagram** — clear visual of the system | ✅ | [`docs/architecture.png`](./architecture.png) (+ [`.svg`](./architecture.svg), [`architecture.md`](./architecture.md)) |
| 6 | **Demo video < 3 min**, public on YouTube / Vimeo / Youku, link on the form | ⬜ | Record + upload using the prepared shot list |
| 7 | **Identify the Track** | ✅ | Track 4 stated in [`README.md`](../README.md) and the project story |
| 8 | **Testing access** — public URL / functioning demo (or test build + credentials) free for judges through the Judging Period | ⬜ | Provide the live backend + web URL in the testing instructions |
| 9 | **New or significantly-updated project** statement | ✅ | "New project" paragraph in [`README.md`](../README.md) |
| 10 | **Original work**, no third-party IP violations, third-party SDK terms respected | ✅ | OpenAI SDK / DaisyUI / MCP SDK — all permissive licenses; no copyrighted assets in the diagram |

## B. Language requirements (Official Rules §4)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 11 | All materials in **English** (or English translation of video, text description, testing instructions, and all other materials) | ✅ | README, architecture docs, red-flag test script and story are in English. Video must be in English or English-subtitled |

## C. Bonus (optional — Blog Post Prize)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 12 | Public **blog/social post** about the journey building with Qwen Cloud; link included in the submission | ⬜ | Optional — eligible for the separate Blog Post Prize |

---

## D. Judging-criteria coverage (Stage Two — what each artifact earns)

| Criterion (weight) | How this project addresses it |
|---|---|
| **Innovation & AI Creativity (30%)** | Sophisticated Qwen Cloud use: structured output, **function calling**, **MCP integration** (canonical tool host), **Qwen-ASR** voice input. Layered anti-hallucination strategy (static grounding + deterministic red-flag override). |
| **Technical Depth & Engineering (30%)** | pnpm monorepo, single typed contract (Zod) front↔back, three-agent pipeline, MCP-first gateway with in-process fallback + cooldown, Drizzle persistence, hardened BFF (key guard + CORS + throttler + helmet). |
| **Problem Value & Impact (25%)** | Real, legally-mandated clinical workflow (Manchester Protocol). Pre-triage starts *before* arrival; deterministic safety net; auditable escalation trail — production-ready, not a toy. |
| **Presentation & Documentation (15%)** | Architecture diagram + `architecture.md` + red-flag test script + project story, all in English; demo focused on AI reasoning and the closed loop. |

---

## E. Final pre-submit pass (owner actions)

- [ ] Make the GitHub repo **Public**; confirm the **MIT** badge shows in the About section.
- [ ] Confirm the live demo URL is reachable and free to use through the Judging Period.
- [ ] Paste the condensed **text description** into the Devpost form.
- [ ] Upload the **< 3 min video** (English or English-subtitled) and paste its public link.
- [ ] Fill the **architecture diagram**, **repo URL**, **Alibaba proof link**, and **Track 4** fields on the form.
- [ ] (Optional) Publish and link the **blog post** for the bonus prize.
- [ ] Save a **draft submission** on Devpost before the deadline, then submit.
