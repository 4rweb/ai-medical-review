#!/usr/bin/env python3
"""Generate the AI Medical Review architecture diagram as a standalone SVG."""

import os

W, H = 1560, 940
parts = []

def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def box(x, y, w, h, fill, stroke, rx=14):
    parts.append(
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
        f'fill="{fill}" stroke="{stroke}" stroke-width="2"/>'
    )

def text(x, y, s, size=16, weight="700", fill="#0f172a", anchor="middle", family="Helvetica"):
    parts.append(
        f'<text x="{x}" y="{y}" font-family="{family},Arial,sans-serif" '
        f'font-size="{size}" font-weight="{weight}" fill="{fill}" '
        f'text-anchor="{anchor}">{esc(s)}</text>'
    )

def lines(cx, top, items, size=12, weight="500", fill="#334155", gap=18, anchor="middle"):
    for i, s in enumerate(items):
        text(cx, top + i * gap, s, size=size, weight=weight, fill=fill, anchor=anchor)

# titled(): body starts at y+60 (with subtitle) or y+44 (without).
# Minimum heights: sub+2lines=90, sub+3lines=108, nosub+2lines=76, nosub+3lines=92
def titled(x, y, w, h, title, subtitle, body, fill, stroke, tcolor):
    box(x, y, w, h, fill, stroke)
    text(x + w / 2, y + 26, title, size=15, weight="800", fill=tcolor)
    if subtitle:
        text(x + w / 2, y + 42, subtitle, size=11, weight="600", fill="#64748b")
    lines(x + w / 2, y + (60 if subtitle else 44), body)

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

# ── defs / background ────────────────────────────────────────────────────────
parts.append(
    '<defs><marker id="arrow" markerWidth="12" markerHeight="12" refX="9" refY="5" '
    'orient="auto" markerUnits="userSpaceOnUse">'
    '<path d="M0,0 L10,5 L0,10 z" fill="#475569"/></marker></defs>'
)
parts.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="#f8fafc"/>')

# ── Title ────────────────────────────────────────────────────────────────────
text(W / 2, 44, "AI Medical Review — System Architecture", size=26, weight="800")
text(W / 2, 66, "Track 4 · Autopilot Agent · powered by Qwen Cloud (Alibaba DashScope)",
     size=14, weight="600", fill="#64748b")

# ── Frontend  (subtitle + 2 body lines → h≥90) ───────────────────────────────
titled(60, 104, 340, 90, "Patient Browser", "apps/web · React + Vite + DaisyUI",
       ["voice / text report · adaptive questions",
        "review · scheduling · live queue"],
       "#eff6ff", "#3b82f6", "#1d4ed8")

# ── BFF  (no subtitle + 2 body lines → h≥76) ─────────────────────────────────
titled(60, 232, 340, 76, "BFF Proxy (same origin)", "",
       ["/api/*  ·  injects x-internal-api-key",
        "server-side secret (never in browser)"],
       "#f1f5f9", "#94a3b8", "#334155")

# ── Backend container ─────────────────────────────────────────────────────────
# Layout:
#   py = 406  (pipeline row)        cards h=92
#   sy = 522  (safety row)          safety h=76, manchester h=90
#   ry = 630  (bottom row)          cards h=110
#   container bottom = 754          bh = 754 - 346 = 408
bx, by, bw = 60, 346, 680
bh = 408
box(bx, by, bw, bh, "#ffffff", "#0ea5e9")
text(bx + bw / 2, by + 27, "Backend — apps/apis · NestJS · Alibaba Function Compute",
     size=16, weight="800", fill="#0369a1")
text(bx + bw / 2, by + 44, "ApiKeyGuard · CORS · Throttler · Helmet",
     size=12, weight="600", fill="#64748b")

# pipeline row  (no subtitle + 2-3 body lines → h=92 uniform)
py = by + 60   # = 406
titled(bx + 20,  py, 196, 92, "Collector",  "", ["symptoms +", "adaptive questions"],
       "#ecfeff", "#06b6d4", "#0e7490")
titled(bx + 240, py, 196, 92, "Classifier", "",
       ["Manchester level +", "structured output +", "function calling"],
       "#ecfeff", "#06b6d4", "#0e7490")
titled(bx + 460, py, 196, 92, "Scheduler",  "", ["appointment via", "function calling"],
       "#ecfeff", "#06b6d4", "#0e7490")
arrow(bx + 216, py + 46, bx + 240, py + 46)
arrow(bx + 436, py + 46, bx + 460, py + 46)
text(bx + bw / 2, py + 108, "3-agent pipeline", size=11, weight="700", fill="#0e7490")

# safety row  (safety: no sub + 2 lines h=76 / manchester: sub + 2 lines h=90)
sy = py + 120   # = 526
titled(bx + 20, sy, 420, 76, "Deterministic Red-Flag Validator", "",
       ["overrides AI on critical sign  ·  auditable code",
        "every escalation written to audit_logs"],
       "#fef2f2", "#ef4444", "#b91c1c")
titled(bx + 460, sy, 196, 90, "Manchester", "grounding (static)",
       ["anchors the", "classifier prompt"],
       "#fffbeb", "#f59e0b", "#b45309")

# bottom row  (subtitle + 3 lines → h=110 / subtitle + 2 lines → h=90)
ry = sy + 108   # = 634
titled(bx + 20,  ry, 210, 110, "QwenService", "+ TranscriptionService",
       ["structured output", "function calling", "Qwen-ASR (voice)"],
       "#f5f3ff", "#8b5cf6", "#6d28d9")
titled(bx + 250, ry, 210, 110, "Clinical Tools", "Gateway",
       ["MCP-first execution", "in-process fallback", "cooldown circuit"],
       "#f5f3ff", "#8b5cf6", "#6d28d9")
titled(bx + 480, ry, 176, 90, "DbModule", "Drizzle + pg",
       ["persists queue", "+ audit trail"],
       "#f5f3ff", "#8b5cf6", "#6d28d9")

# ── Right column: Qwen Cloud / MCP / ApsaraDB (subtitle + 2 lines → h=90, padded to 130) ──
titled(848, 118, 612, 130, "Qwen Cloud — Alibaba DashScope", "OpenAI-compatible API",
       ["qwen3.6-flash  ·  reasoning, structured output, tools",
        "qwen3-asr-flash  ·  speech-to-text"],
       "#fff7ed", "#f97316", "#c2410c")

titled(848, 286, 612, 130, "MCP Server — apps/mcp", "Model Context Protocol",
       ["tools: verificarFaixaVital · buscarDisponibilidade",
        "stdio (Inspector) + Streamable HTTP (always-on)"],
       "#ecfdf5", "#10b981", "#047857")

titled(848, 454, 612, 130, "ApsaraDB for PostgreSQL", "Alibaba Cloud · Drizzle ORM",
       ["triage_queue  ·  persisted patient queue",
        "audit_logs  ·  red-flag escalation trail"],
       "#eef2ff", "#6366f1", "#4338ca")

# ── Shared packages footer (no subtitle + 2 lines → h=76, padded to 80) ────
titled(60, 776, 1440, 80, "Shared packages — single source of truth", "",
       ["@medical/contracts — typed Zod schema shared by frontend + backend (no drift)",
        "@medical/clinical — deterministic clinical tool logic reused by the backend AND the MCP server"],
       "#f8fafc", "#cbd5e1", "#334155")

# ── Arrows ────────────────────────────────────────────────────────────────────
arrow(230, 194, 230, 232)          # frontend → bff
label(310, 214, "HTTPS")
arrow(230, 308, 230, 346)          # bff → backend

# backend right edge = bx+bw = 740 / right col left = 848
arrow(740, py + 46, 848, 183, color="#ea580c")   # pipeline → Qwen Cloud
label(794, 318, "DashScope")

arrow(740, ry + 55, 848, 351, color="#059669")   # tools gateway → MCP
label(794, 488, "MCP / HTTP")

arrow(740, ry + 75, 848, 519, color="#4f46e5")   # db module → ApsaraDB
label(794, 618, "Drizzle")

# ── SVG output ────────────────────────────────────────────────────────────────
out_dir = os.path.dirname(os.path.abspath(__file__))
out_path = os.path.join(out_dir, "architecture.svg")

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
    f'viewBox="0 0 {W} {H}">' + ''.join(parts) + '</svg>'
)
with open(out_path, 'w') as f:
    f.write(svg)
print(f"wrote {out_path} ({len(svg)} bytes)")
