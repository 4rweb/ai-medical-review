#!/usr/bin/env python3
"""Generate the AI Medical Review architecture diagram as a standalone SVG."""

W, H = 1480, 1000
parts = []

def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def box(x, y, w, h, fill, stroke, rx=14):
    parts.append(
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
        f'fill="{fill}" stroke="{stroke}" stroke-width="2"/>'
    )

def text(x, y, s, size=17, weight="700", fill="#0f172a", anchor="middle", family="Helvetica"):
    parts.append(
        f'<text x="{x}" y="{y}" font-family="{family},Arial,sans-serif" '
        f'font-size="{size}" font-weight="{weight}" fill="{fill}" '
        f'text-anchor="{anchor}">{esc(s)}</text>'
    )

def lines(cx, top, items, size=14, weight="500", fill="#334155", gap=22, anchor="middle"):
    for i, s in enumerate(items):
        text(cx, top + i * gap, s, size=size, weight=weight, fill=fill, anchor=anchor)

def titled(x, y, w, h, title, subtitle, body, fill, stroke, tcolor):
    box(x, y, w, h, fill, stroke)
    text(x + w / 2, y + 30, title, size=18, weight="800", fill=tcolor)
    if subtitle:
        text(x + w / 2, y + 52, subtitle, size=13, weight="600", fill="#64748b")
    lines(x + w / 2, y + (78 if subtitle else 58), body)

def arrow(x1, y1, x2, y2, color="#475569", dash=False, width=2.5):
    d = ' stroke-dasharray="7 6"' if dash else ''
    parts.append(
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" '
        f'stroke-width="{width}"{d} marker-end="url(#arrow)"/>'
    )

def label(x, y, s, color="#475569"):
    parts.append(
        f'<rect x="{x - len(s)*4 - 8}" y="{y - 14}" width="{len(s)*8 + 16}" height="22" '
        f'rx="6" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>'
    )
    text(x, y + 1, s, size=12, weight="700", fill=color)

# defs / background
parts.append(
    '<defs><marker id="arrow" markerWidth="12" markerHeight="12" refX="9" refY="5" '
    'orient="auto" markerUnits="userSpaceOnUse">'
    '<path d="M0,0 L10,5 L0,10 z" fill="#475569"/></marker></defs>'
)
parts.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="#f8fafc"/>')

# title
text(W / 2, 46, "AI Medical Review — System Architecture", size=27, weight="800")
text(W / 2, 72, "Track 4 · Autopilot Agent · powered by Qwen Cloud (Alibaba DashScope)",
     size=15, weight="600", fill="#64748b")

# ---- Frontend ----
titled(60, 110, 330, 120, "Patient Browser", "apps/web · React + Vite + DaisyUI",
       ["voice / text report · adaptive questions",
        "review · scheduling · live queue"],
       "#eff6ff", "#3b82f6", "#1d4ed8")

# ---- BFF ----
titled(60, 270, 330, 84, "BFF Proxy (same origin)", "",
       ["/api/*  ·  injects x-internal-api-key",
        "server-side secret (never in browser)"],
       "#f1f5f9", "#94a3b8", "#334155")

# ---- Backend container ----
bx, by, bw, bh = 60, 396, 660, 470
box(bx, by, bw, bh, "#ffffff", "#0ea5e9")
text(bx + bw / 2, by + 30, "Backend — apps/apis · NestJS · Alibaba Function Compute", size=18, weight="800", fill="#0369a1")
text(bx + bw / 2, by + 52, "ApiKeyGuard · CORS · Throttler · Helmet", size=13, weight="600", fill="#64748b")

# pipeline row
py = by + 72
titled(bx + 24, py, 190, 78, "Collector", "", ["symptoms +", "adaptive questions"], "#ecfeff", "#06b6d4", "#0e7490")
titled(bx + 236, py, 190, 96, "Classifier", "", ["Manchester level +", "structured output +", "function calling"], "#ecfeff", "#06b6d4", "#0e7490")
titled(bx + 448, py, 190, 78, "Scheduler", "", ["appointment via", "function calling"], "#ecfeff", "#06b6d4", "#0e7490")
arrow(bx + 214, py + 39, bx + 236, py + 39)
arrow(bx + 426, py + 48, bx + 448, py + 48)
text(bx + bw/2, py + 116, "3-agent pipeline", size=12, weight="700", fill="#0e7490")

# safety + grounding
sy = by + 210
titled(bx + 24, sy, 402, 92, "Deterministic Red-Flag Validator", "",
       ["overrides the AI when a critical sign appears",
        "auditable code · every escalation logged"], "#fef2f2", "#ef4444", "#b91c1c")
titled(bx + 448, sy, 190, 92, "Manchester", "grounding (static)", ["anchors the", "classifier prompt"], "#fffbeb", "#f59e0b", "#b45309")

# bottom row: qwen client, tools gateway, db module
ry = by + 322
titled(bx + 24, ry, 200, 120, "QwenService", "+ TranscriptionService",
       ["structured output", "function calling", "Qwen-ASR (voice)"], "#f5f3ff", "#8b5cf6", "#6d28d9")
titled(bx + 236, ry, 200, 120, "Clinical Tools", "Gateway",
       ["MCP-first", "+ in-process", "fallback"], "#f5f3ff", "#8b5cf6", "#6d28d9")
titled(bx + 448, ry, 190, 120, "DbModule", "Drizzle + pg",
       ["persists queue", "+ audit trail"], "#f5f3ff", "#8b5cf6", "#6d28d9")

# ---- Right column: Qwen Cloud, MCP, Postgres ----
titled(820, 130, 600, 150, "Qwen Cloud — Alibaba DashScope", "OpenAI-compatible API",
       ["qwen3.6-flash  ·  reasoning, structured output, tools",
        "qwen3-asr-flash  ·  speech-to-text"], "#fff7ed", "#f97316", "#c2410c")

titled(820, 360, 600, 150, "MCP Server — apps/mcp", "Model Context Protocol",
       ["tools: verificarFaixaVital · buscarDisponibilidade",
        "stdio (Inspector) + Streamable HTTP (always-on)"], "#ecfdf5", "#10b981", "#047857")

titled(820, 590, 600, 150, "ApsaraDB for PostgreSQL", "Alibaba Cloud · Drizzle ORM",
       ["triage_queue  ·  persisted patient queue",
        "audit_logs  ·  red-flag escalation trail"], "#eef2ff", "#6366f1", "#4338ca")

# ---- Shared packages footer (full width = shared by all) ----
titled(60, 888, 1360, 96, "Shared packages — single source of truth", "",
       ["@medical/contracts — typed Zod schema shared by frontend + backend (no drift)",
        "@medical/clinical — deterministic clinical tool logic reused by the backend AND the MCP server"],
       "#f8fafc", "#cbd5e1", "#334155")

# ---- Arrows ----
arrow(225, 230, 225, 270)                  # frontend -> bff
label(300, 252, "HTTPS")
arrow(225, 354, 225, 396)                  # bff -> backend

# backend -> qwen cloud
arrow(720, 470, 820, 250, color="#ea580c")
label(792, 360, "DashScope")
# backend tools gateway -> MCP
arrow(720, 600, 820, 470, color="#059669")
label(792, 545, "MCP / HTTP")
# backend db -> postgres
arrow(720, 700, 820, 665, color="#4f46e5")
label(792, 690, "Drizzle")

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
    f'viewBox="0 0 {W} {H}">' + ''.join(parts) + '</svg>'
)
with open('/tmp/arch/architecture.svg', 'w') as f:
    f.write(svg)
print("wrote svg", len(svg), "bytes")
