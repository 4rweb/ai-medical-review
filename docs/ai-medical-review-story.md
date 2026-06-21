# AI Medical Review — Smart pre-triage for emergency rooms

## 💡 Inspiration

Anyone who has been to an emergency room in Brazil knows the scene: you walk in with a fever, a headache, maybe a chest pain you can't quite explain — and you sit in a line with no idea whether you'll wait ten minutes or four hours. At the front, a nurse has to look at each person, take vital signs, listen to symptoms, and decide, in just a few minutes, which colored wristband you get.

That process has a name: the **Manchester Triage System (MTS)**, mandatory by law across Brazil's urgent-care services since 2008. It sorts patients into five colors — **red** (emergency, immediate care), **orange** (very urgent, 10 min), **yellow** (urgent, 60 min), **green** (low urgency, 120 min), and **blue** (non-urgent, 240 min). It works. But there's a bottleneck: everything starts *after* the patient has already arrived and joined the queue. Classification happens on the spot, in person, and each triage consumes the time of a scarce professional.

The question that sparked **AI Medical Review** was simple:

> What if triage could begin *before* the patient walks through the hospital door?

While someone is on their way — in the car, on the bus, in the waiting room — they could describe what they're feeling on their phone. By the time they arrive, the system would already have a **risk pre-classification** ready, the data organized, and the nurse would only need to confirm what matters (check the fever, take the blood pressure) instead of collecting everything from scratch. Less time in line for those at risk. Less overload for the staff. That pre-triage is what AI Medical Review delivers.

## 🩺 What it does

AI Medical Review is a **pre-triage agent** that talks with the patient and produces a Manchester-style risk classification — always as **clinical decision support, never as a diagnosis**.

**For the patient** — a fast, friendly conversational flow (designed mobile-first):

- Describe the reason for the visit in natural language — by **typing or by voice**. Spoken reports are transcribed in real time by **Qwen-ASR** and dropped into an **editable field** the patient can correct before continuing.
- Answer **adaptive follow-up questions** the agent generates from that specific report (the question set changes with the complaint).
- Report a pain level on a 0–10 scale, and optionally log known vital signs (heart rate, blood pressure, temperature, SpO₂). Skipped vitals are sent as *absent* — never as a fake default.
- Review and edit a summary before submitting — a deliberate **human-in-the-loop checkpoint**.
- Receive a priority color, an estimated wait time, plain-language recommendations, and — when appropriate — a **suggested appointment slot** to confirm or adjust (another human checkpoint).

This data flows through a **multi-agent pipeline running on Qwen Cloud (Alibaba's DashScope)**, which **reasons over the whole picture** (symptoms + answers + pain + vital signs + time course). Critical signals trigger a **"possible emergency — seek immediate care"** warning right during data entry, and a SAMU **192** shortcut is present on every screen.

**For the care team** — a real-time **queue panel** showing incoming triages, ordered by severity (ties broken by arrival time), with masked patient names and live status. Every deterministic safety escalation is written to an **audit trail**. The hospital gains visibility into *who needs to be seen first* before the person even arrives.

It's a **closed loop**: patient → agent → classification → scheduling → team queue.

## 🛠️ How we built it

A pnpm monorepo with a strict separation of concerns and a **single typed contract** (`@medical/contracts`, Zod) shared front-to-back, so the API and the UI never drift.

- **Frontend (`apps/web`, React + Vite + DaisyUI)** — a responsive, mobile-first flow: voice/text report, adaptive questions, pain and vitals inputs, an editable review screen, the results screen, and the live queue. It only ever calls `/api/*` on the same origin; a **BFF proxy injects a server-side secret**, so the API key never reaches the browser.
- **Backend (`apps/apis`, NestJS — deployed on Alibaba Function Compute)** — hardened with an internal-key guard, CORS allowlist, rate limiting, and Helmet. It orchestrates a **three-agent pipeline**:
  - **Collector** — extracts symptoms and preliminary red-flags and generates the adaptive questions.
  - **Classifier** — produces the Manchester color **with an explicit, auditable rationale**, using **structured output** (a JSON schema) and **function calling** for verifiable facts (vital-sign ranges, room availability).
  - **Scheduler** — proposes an appointment slot via function calling; the value is read from the **tool-executor trail**, not copied from model text.
- **Qwen Cloud (Alibaba DashScope)** — the reasoning core, via the OpenAI-compatible API (`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`): structured output, function calling, and **Qwen-ASR** for voice transcription.
- **MCP server (`apps/mcp`)** — the same clinical tools are exposed over the **Model Context Protocol** (stdio for the Inspector, Streamable HTTP for an always-on service). The backend consumes them **MCP-first, with an in-process fallback** if the MCP host is down — so the protocol is genuinely in the request path, not a side demo.
- **Shared clinical logic (`@medical/clinical`)** — the tool implementations live in one place, consumed by both the backend's function calling and the MCP server. No duplication.
- **Persistence (Drizzle + ApsaraDB for PostgreSQL)** — the queue and the audit trail are persisted on Alibaba Cloud's managed PostgreSQL.

### The safety net that makes it trustworthy

The biggest engineering bet isn't the prompt — it's a **deterministic red-flag validator** that runs *after* the model and **overrides** its decision when it detects a critical sign (thunderclap headache, ischemic chest pain, FAST stroke signs, severe dyspnea, critical SpO₂…). Dangerous clinical knowledge lives in **auditable code**, not model memory. Combined with **static Manchester grounding** in the prompt, this is our layered anti-hallucination strategy — every escalation is logged and testable.

> 🎯 **Chosen track: Autopilot Agent (Track 4).** AI Medical Review automates a real end-to-end business workflow, handles ambiguous inputs (free text *and* voice), invokes external tools (function calling + MCP), and keeps human-in-the-loop checkpoints at critical decision points — exactly what the category rewards, with a focus on production-readiness over toy demos.

## 🧗 Challenges we ran into

- **Safety first.** Healthcare demands a clear line: this is **pre-triage and guidance**, not diagnosis. The deterministic override, the disclaimers, and the "seek immediate care" escalation mattered as much as the classification itself.
- **From "wizard" to "agent."** The risk was shipping a step-by-step form disguised as AI. The turning point was moving the classification into Qwen's reasoning — with real justification, structured output, and function calling.
- **Making MCP real.** It would have been easy to ship a standalone MCP server as a demo. Wiring the backend to actually *consume* its tools over MCP — with a safe fallback and a failure cooldown — took more care but made the integration genuine.
- **Voice input that actually works.** Browser audio (webm/opus) isn't what the ASR service expects; we re-encode to 16 kHz mono WAV in the browser and send it as a base64 data URI to Qwen-ASR's dedicated task format.
- **Fidelity to Manchester.** Mapping colors, wait times, and discriminators onto a language model — without inventing severity or underestimating emergencies — required careful grounding and an edge-case test script (the headache that's a migraine *vs.* the one that's a stroke).

## 📚 What we learned

- The hard part of a healthcare agent **isn't the model, it's the flow** — where to put the human back in the loop, how to communicate uncertainty, when to shout "go to the hospital now."
- How to turn an established clinical protocol (Manchester) into an **explainable** reasoning system guarded by deterministic code, instead of an opaque classifier.
- How to get the most out of Qwen Cloud: structured output, function calling, **MCP**, and **Qwen-ASR**, composed into a multi-agent pipeline.

## 🚀 What's next

- **Real hospital integration via MCP** — connect the tool layer to live EHR/scheduling systems instead of mocked availability.
- **Async ASR** for longer recordings (submit-and-poll) alongside the real-time path.
- **Per-task model tiering** — a stronger Qwen model for the high-stakes classifier, a lighter one for cheap steps.
- Accessibility and multi-language support, to reach more patients.

---

> ⚠️ **Disclaimer:** AI Medical Review is a **pre-triage and decision-support** tool. It does not replace medical evaluation and does not provide a diagnosis. In an emergency, seek immediate care.
