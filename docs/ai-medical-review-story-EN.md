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

- Describe the reason for the visit in natural language.
- Pick symptoms from a visual grid (fever, chest pain, shortness of breath, abdominal pain...) or type your own.
- Report a pain level on a 0–10 scale.
- Optionally log known vital signs (heart rate, blood pressure, temperature, SpO₂).
- Review and edit a summary before submitting — a deliberate **human-in-the-loop checkpoint**.

This data goes to the **Qwen model, running on Alibaba Cloud**, which **reasons over the whole picture** (symptoms + pain + vital signs + time course) and returns: the priority color, the estimated wait time, recommendations, and alert flags. Critical signals trigger a **"possible emergency — seek immediate care"** warning right during data entry.

**For the care team** — a real-time **Admin Dashboard** showing incoming triages, sorted by priority, with metrics (daily volume, average time, accuracy in identifying emergencies, cases in processing). The hospital gains visibility into *who needs to be seen first* before the person even arrives.

It's a **closed loop**: patient → agent → classification → team dashboard.

## 🛠️ How we built it

The architecture cleanly separates responsibilities:

- **Frontend** — a responsive, mobile-first conversational interface with light/dark themes and the data-collection components (symptom grid, pain and vitals sliders, editable review screen).
- **Agent layer (Qwen / Alibaba Cloud)** — the core of the project. Instead of `if/else` rules, the classification reasoning is delegated to Qwen via Qwen Cloud's OpenAI-compatible API (`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`). The agent:
  - interprets ambiguous inputs (the patient's free-text description),
  - weighs multiple clinical factors in a structured way,
  - **justifies** the assigned priority (explainability, not a black box),
  - calls external tools (*function calling*) for tasks like checking room availability and estimating wait time.
- **Backend on Alibaba Cloud** — orchestrates the calls, persists triages, and feeds the real-time dashboard.

> 🎯 **Chosen track: Autopilot Agent (Track 4).** AI Medical Review automates a real end-to-end business workflow, handles ambiguous inputs, invokes external tools, and keeps human-in-the-loop checkpoints at critical decision points — exactly what the category rewards, with a focus on production-readiness over toy demos.

## 🧗 Challenges we ran into

- **Safety first.** Building something in healthcare demands a clear line: this is **pre-triage and guidance**, not diagnosis. Designing the warnings, disclaimers, and the "seek immediate care" escalation was as important as the classification itself.
- **Moving from "wizard" to "agent."** The risk was shipping a step-by-step form disguised as AI. The turning point was moving the classification logic into Qwen's reasoning, with real justification and *function calling*.
- **Fidelity to the Manchester system.** Mapping colors, wait times, and discriminators onto a language model — without inventing severity or underestimating emergencies — required careful prompt calibration and validating edge cases (the headache that's a migraine *vs.* the one that's a stroke).
- **Proof of Alibaba Cloud deployment.** Making sure the backend and the Qwen calls actually run on Alibaba infrastructure — and are demonstrable — was a structural requirement from day one.

## 📚 What we learned

- The hard part of a healthcare agent **isn't the model, it's the flow** — where to put the human back in the loop, how to communicate uncertainty, when to shout "go to the hospital now."
- How to turn an established clinical protocol (Manchester) into an explainable reasoning system instead of an opaque classifier.
- How to get the most out of Qwen Cloud with the OpenAI-compatible API, *function calling*, and agent orchestration on Alibaba Cloud infrastructure.

## 🚀 What's next

- Significantly refine the triage screen to make it even faster and simpler to fill out.
- Split the logic into **specialized sub-agents** (symptom collector → risk classifier → scheduler), strengthening the multi-agent architecture.
- **MCP** integration to connect the agent to real hospital systems.
- Accessibility and multi-language support, to reach more patients.

---

> ⚠️ **Disclaimer:** AI Medical Review is a **pre-triage and decision-support** tool. It does not replace medical evaluation and does not provide a diagnosis. In an emergency, seek immediate care.
