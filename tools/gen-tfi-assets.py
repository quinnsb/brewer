#!/usr/bin/env python3
"""
Generate TFI case-study design assets as SVG.

Taste references (studied July 2026):
  - Smith & Diction  -> identity shown as PHYSICAL OBJECTS with real shadow and
                        material. Pins, matchbooks, hang tags, style-guide
                        covers, welcome kits. Almost never a flat diagram.
  - Pentagram        -> scale and restraint. One enormous image, tight grid,
                        minimal caption. Confidence instead of explanation.
  - Trust Design Shop-> full-bleed header, one statement, warm and human.
                        (Also Degular + Mackinac, same stack as this portfolio.)

Rules this file follows as a result:
  - No numbered boxes, no bullet lists, no progress bars, no infographic tropes.
  - Every "deliverable" asset is rendered as a real object on a surface, with
    a cast shadow, a spine or an edge, and slight optical imperfection.
  - Type is big. Whitespace is generous. One idea per asset.

Palette is sampled from TFI's own logo-horizontal.png, not invented.
Output: images/projects/the-forgotten-initiative/generated/*.svg
"""
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "images", "projects", "the-forgotten-initiative", "generated")

# --- Sampled brand ---------------------------------------------------------
INK = "#063042"
DEEP = "#041f2c"
GOLD = "#fdb414"
MINT = "#cae4db"
TAN = "#d1c7bb"
GOLD_DEEP = "#b28d35"
SAGE = "#aab9a8"
PAPER = "#f1ece2"
PAPER_DIM = "#e2dbcd"

SANS = "Helvetica Neue, Helvetica, Arial, sans-serif"
MONO = "Space Mono, ui-monospace, SFMono-Regular, Menlo, monospace"


# ---------------------------------------------------------------------------
# Shared defs: real shadows, paper grain, print texture
# ---------------------------------------------------------------------------
def defs():
    return f"""
  <defs>
    <filter id="cast" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="26" stdDeviation="30" flood-color="#000000" flood-opacity="0.30"/>
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.16"/>
    </filter>
    <filter id="castsm" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000000" flood-opacity="0.24"/>
    </filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="n"/>
      <feColorMatrix in="n" type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.055"/></feComponentTransfer>
      <feComposite operator="over" in2="SourceGraphic"/>
    </filter>
    <linearGradient id="gutter" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="42%" stop-color="#000" stop-opacity="0.16"/>
      <stop offset="50%" stop-color="#000" stop-opacity="0.26"/>
      <stop offset="58%" stop-color="#000" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.22"/>
      <stop offset="55%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>"""


# Precomputed multiply results. The two-bar overlaps are the values actually
# sampled out of logo-horizontal.png; the rest are true multiply products.
# Using explicit geometry instead of mix-blend-mode means every renderer -
# browser, cairosvg, Illustrator, print RIP - produces identical output.
GOLD_MINT = "#c8a111"      # gold x mint
GOLD_MINT_TAN = "#a47e0c"  # all three

_MARK_UID = [0]


def mark(x, y, size, on_dark=False, opacity=1.0):
    """The TFI mark: three crossing bars with real overlap colors.

    Geometry taken from logo-horizontal.png - a gold horizontal bar, a mint
    vertical bar, and a tan bar at -45deg. Overlaps are drawn as explicitly
    clipped shapes rather than blend modes, so the mark is deterministic.

    on_dark is accepted for call-site clarity but no longer changes anything:
    every bar and overlap colour is mid-tone or lighter, so the mark reads on
    both paper and near-black without a reversed variant.
    """
    _MARK_UID[0] += 1
    u = _MARK_UID[0]
    bw, bh = size * 0.92, size * 0.24
    cx, cy = x + size / 2, y + size / 2
    gx, gy = cx - bw / 2, cy - bh / 2          # gold bar rect
    mx, my = cx - bh / 2, cy - bw / 2          # mint bar rect
    rot = f"rotate(-45 {cx:.2f} {cy:.2f})"
    tan_rect = (f'<rect x="{gx:.2f}" y="{gy:.2f}" width="{bw:.2f}" '
                f'height="{bh:.2f}" transform="{rot}"')
    return f"""
  <g opacity="{opacity}">
    <clipPath id="cg{u}"><rect x="{gx:.2f}" y="{gy:.2f}" width="{bw:.2f}" height="{bh:.2f}"/></clipPath>
    <clipPath id="cm{u}"><rect x="{mx:.2f}" y="{my:.2f}" width="{bh:.2f}" height="{bw:.2f}"/></clipPath>
    <clipPath id="cc{u}"><rect x="{mx:.2f}" y="{gy:.2f}" width="{bh:.2f}" height="{bh:.2f}"/></clipPath>
    <rect x="{gx:.2f}" y="{gy:.2f}" width="{bw:.2f}" height="{bh:.2f}" fill="{GOLD}"/>
    <rect x="{mx:.2f}" y="{my:.2f}" width="{bh:.2f}" height="{bw:.2f}" fill="{MINT}"/>
    <rect x="{mx:.2f}" y="{gy:.2f}" width="{bh:.2f}" height="{bh:.2f}" fill="{GOLD_MINT}"/>
    {tan_rect} fill="{TAN}"/>
    <g clip-path="url(#cg{u})">{tan_rect} fill="{GOLD_DEEP}"/></g>
    <g clip-path="url(#cm{u})">{tan_rect} fill="{SAGE}"/></g>
    <g clip-path="url(#cc{u})">{tan_rect} fill="{GOLD_MINT_TAN}"/></g>
  </g>"""


def svg(w, h, body, bg=None):
    bgr = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'width="{w}" height="{h}" font-family="{SANS}">{defs()}\n{bgr}{body}\n</svg>\n')


def t(x, y, s, size, fill, weight=400, ls=0, anchor="start", family=None, op=1.0):
    fam = f' font-family="{family}"' if family else ""
    o = f' opacity="{op}"' if op != 1.0 else ""
    return (f'<text x="{x:.0f}" y="{y:.0f}" font-size="{size}" font-weight="{weight}" '
            f'letter-spacing="{ls}" fill="{fill}" text-anchor="{anchor}"{fam}{o}>{s}</text>')


def kicker(x, y, s, fill, size=17, anchor="start"):
    # Real letter-spacing, not space-injection. Injecting spaces between
    # characters looked right until XML whitespace collapsing ate the word
    # gaps and produced THEFORGOTTENINITIATIVE.
    return t(x, y, s.upper(), size, fill, 400, size * 0.30, anchor, MONO)


def write(name, content):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w") as f:
        f.write(content)
    print(f"  {name:30s} {len(content):>7,d} b")


# ===========================================================================
# The podcast cover is NOT generated here.
#
# It is the real released artwork, pulled from the show's own RSS feed
# (The-Forgotten-Podcast-Cover-July-2022.jpg, 2000x2000, July 2022 - inside
# Quinn's tenure) and committed as podcast-cover.webp one directory up. A
# generated stand-in used to live here; a real file always beats a redrawing
# of one, so it was deleted rather than kept as a fallback.
# ===========================================================================


# ===========================================================================
# 1. Primary campaign identity - the Pentagram move. Scale, restraint.
# ===========================================================================
def campaign_identity():
    W, H = 2000, 1500
    b = [f'<rect width="{W}" height="{H}" fill="{PAPER}"/>']
    # Kept clear of the wordmark - at r400/cy450 the gold disc collided with
    # the descender line of "& The Church".
    b.append(f'<circle cx="{W*0.84}" cy="{H*0.22}" r="330" fill="{MINT}" opacity="0.62"/>')
    b.append(f'<circle cx="{W*0.95}" cy="{H*0.40}" r="175" fill="{GOLD}" opacity="0.45"/>')
    b.append(mark(130, 140, 210))
    # one enormous lockup, nothing else competing
    b.append(t(130, 720, "Foster Care", 216, INK, 700, -9))
    b.append(t(130, 930, "&amp; The Church", 216, INK, 700, -9))
    b.append(f'<rect x="130" y="1010" width="640" height="7" fill="{GOLD}"/>')
    b.append(t(130, 1130, "Growing awareness for meaningful engagement.", 44, INK, 400, -0.5, op=0.72))
    b.append(kicker(130, 1330, "the forgotten initiative   /   four-part resource", INK, 19))
    b.append(f'<rect width="{W}" height="{H}" filter="url(#grain)" fill="none"/>')
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 3. Mark study
# ===========================================================================
def mark_study():
    W, H = 1200, 1200
    b = [f'<rect width="{W}" height="{H}" fill="#0a0909"/>']
    b.append(mark(W / 2 - 350, H / 2 - 400, 700, on_dark=True))
    b.append(kicker(80, H - 96, "the forgotten initiative", "#ffffff", 20))
    b.append(kicker(80, H - 54, "identity mark", "rgba(255,255,255,0.42)", 18))
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 4. Type specimen - foundry page, not a slide
# ===========================================================================
def type_specimen():
    W, H = 2100, 1300
    b = [f'<rect width="{W}" height="{H}" fill="{PAPER}"/>']
    b.append(kicker(90, 108, "campaign typography", INK, 19))
    b.append(f'<line x1="90" y1="146" x2="{W-90}" y2="146" stroke="{INK}" stroke-opacity="0.14"/>')
    # oversized glyph pair, cropped by the frame like a real specimen
    b.append(t(70, 560, "Aa", 440, INK, 700, -22))
    b.append(t(700, 300, "ABCDEFGHIJKLM", 96, INK, 700, -2))
    b.append(t(700, 410, "NOPQRSTUVWXYZ", 96, INK, 700, -2))
    b.append(t(700, 520, "abcdefghijklmnopqrstuvwxyz", 96, GOLD_DEEP, 400, -2))
    b.append(t(700, 630, "0123456789 &amp; ? !", 96, INK, 400, -2, op=0.45))
    b.append(f'<line x1="90" y1="700" x2="{W-90}" y2="700" stroke="{INK}" stroke-opacity="0.14"/>')
    # a waterfall, the way specimens actually show hierarchy
    waterfall = [
        (104, 700, "Awareness had to lead somewhere."),
        (64, 600, "Make people feel seen, help them understand."),
        (38, 400, "A moving story could create attention, but the communication still needed to guide action."),
    ]
    y = 810
    for size, wt, s in waterfall:
        b.append(t(90, y, s, size, INK, wt, -1.5))
        y += size + 62
    b.append(f'<rect width="{W}" height="{H}" filter="url(#grain)" fill="none"/>')
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 5. Color system - printed chips on a surface, not a chart
# ===========================================================================
def color_system():
    W, H = 1150, 1450
    b = [f'<rect width="{W}" height="{H}" fill="#0a0909"/>']
    b.append(kicker(72, 104, "color", "#ffffff", 20))
    b.append(kicker(72, 142, "sampled from the mark", "rgba(255,255,255,0.4)", 16))
    chips = [(INK, "Ink", "#063042", "#ffffff"), (GOLD, "Gold", "#fdb414", INK),
             (MINT, "Mint", "#cae4db", INK), (TAN, "Tan", "#d1c7bb", INK),
             (GOLD_DEEP, "Gold / Tan", "#b28d35", "#ffffff"),
             (SAGE, "Mint / Tan", "#aab9a8", INK)]
    y = 210
    for hexv, name, code, tc in chips:
        # each chip is a physical card, slightly rotated, with a real shadow
        rot = (-0.5 if y % 3 else 0.4)
        b.append(f'<g transform="rotate({rot} {W/2} {y+90})" filter="url(#castsm)">'
                 f'<rect x="72" y="{y}" width="{W-144}" height="180" rx="3" fill="{hexv}"/>'
                 f'<rect x="72" y="{y}" width="{W-144}" height="180" rx="3" fill="url(#sheen)"/>'
                 f'{t(110, y+80, name, 46, tc, 700, -1)}'
                 f'{t(110, y+130, code.upper(), 22, tc, 400, 2.2, family=MONO, op=0.72)}</g>')
        y += 200
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 6. Social campaign - printed posts pinned to a surface
# ===========================================================================
def social_campaign():
    W, H = 1700, 1150
    b = [f'<rect width="{W}" height="{H}" fill="{PAPER_DIM}"/>']
    cards = [(INK, "#ffffff", GOLD, ["You don't have", "to foster to", "make a", "difference."], -1.4),
             (GOLD, INK, INK, ["Awareness is", "where it", "starts. Not", "where it ends."], 0.8),
             (MINT, INK, GOLD_DEEP, ["Your church is", "closer to this", "than you", "think."], -0.6)]
    cw, gap = 460, 60
    x0 = (W - (cw * 3 + gap * 2)) / 2
    for i, (bg, fg, accent, lines, rot) in enumerate(cards):
        x = x0 + i * (cw + gap)
        cx, cy = x + cw / 2, 130 + cw / 2
        b.append(f'<g transform="rotate({rot} {cx} {cy})" filter="url(#cast)">')
        b.append(f'<rect x="{x}" y="130" width="{cw}" height="{cw}" rx="4" fill="{bg}"/>')
        for j, ln in enumerate(lines):
            b.append(t(x + 42, 238 + j * 62, ln, 50, fg, 700, -1.6))
        b.append(f'<rect x="{x+42}" y="{130+cw-96}" width="76" height="6" fill="{accent}"/>')
        b.append(f'{mark(x+cw-104, 130+cw-108, 62, on_dark=(bg==INK))}')
        b.append("</g>")
    b.append(kicker(x0, 1070, "social campaign system", INK, 19))
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 7. Participant guide - a real printed book on a surface
# ===========================================================================
def guide_cover():
    W, H = 1200, 1500
    b = [f'<rect width="{W}" height="{H}" fill="{PAPER_DIM}"/>']
    bw, bh, bx, by = 700, 940, 250, 290
    b.append(f'<g transform="rotate(-2.2 {bx+bw/2} {by+bh/2})" filter="url(#cast)">')
    b.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="5" fill="{GOLD}"/>')
    # spine
    b.append(f'<rect x="{bx}" y="{by}" width="26" height="{bh}" fill="#000" opacity="0.14"/>')
    b.append(f'<rect x="{bx+26}" y="{by}" width="6" height="{bh}" fill="#fff" opacity="0.22"/>')
    b.append(f'<circle cx="{bx+bw*0.52}" cy="{by+330}" r="215" fill="{MINT}" opacity="0.5"/>')
    b.append(mark(bx + bw * 0.52 - 105, by + 225, 210))
    b.append(t(bx + 88, by + 690, "Foster Care", 78, INK, 700, -2.5))
    b.append(t(bx + 88, by + 772, "&amp; The Church", 78, INK, 700, -2.5))
    b.append(f'<rect x="{bx+88}" y="{by+812}" width="130" height="5" fill="{INK}" opacity="0.55"/>')
    b.append(kicker(bx + 88, by + 878, "participant guide", INK, 19))
    b.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="5" fill="url(#sheen)"/>')
    b.append("</g>")
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 8. Guide spread - open book, real gutter
# ===========================================================================
def guide_spread():
    W, H = 1900, 1200
    b = [f'<rect width="{W}" height="{H}" fill="#c7d8db"/>']
    pw, ph, y0 = 780, 980, 110
    x0 = (W - pw * 2) / 2
    b.append(f'<g transform="rotate(-0.8 {W/2} {y0+ph/2})" filter="url(#cast)">')
    b.append(f'<rect x="{x0}" y="{y0}" width="{pw*2}" height="{ph}" rx="3" fill="{PAPER}"/>')
    # left page
    b.append(kicker(x0 + 70, y0 + 110, "session two", GOLD_DEEP, 18))
    b.append(t(x0 + 70, y0 + 208, "Belief into", 74, INK, 700, -2.5))
    b.append(t(x0 + 70, y0 + 286, "action.", 74, INK, 700, -2.5))
    b.append(f'<rect x="{x0+70}" y="{y0+326}" width="132" height="6" fill="{GOLD}"/>')
    for j in range(10):
        w = pw - 140 - (110 if j in (4, 9) else 0)
        b.append(f'<rect x="{x0+70}" y="{y0+390+j*40}" width="{w}" height="11" rx="5" fill="{INK}" opacity="0.12"/>')
    b.append(f'<rect x="{x0+70}" y="{y0+810}" width="{pw-140}" height="112" rx="6" fill="{MINT}" opacity="0.65"/>')
    b.append(kicker(x0 + 104, y0 + 866, "discuss", INK, 16))
    for j in range(2):
        b.append(f'<rect x="{x0+104}" y="{y0+888+j*24}" width="{pw-240-(90*j)}" height="9" rx="4" fill="{INK}" opacity="0.2"/>')
    # right page
    rx = x0 + pw
    b.append(kicker(rx + 70, y0 + 110, "notes", GOLD_DEEP, 18))
    for j in range(15):
        b.append(f'<line x1="{rx+70}" y1="{y0+170+j*46}" x2="{rx+pw-70}" y2="{y0+170+j*46}" stroke="{INK}" stroke-opacity="0.12" stroke-width="2"/>')
    b.append(f'<rect x="{rx+70}" y="{y0+862}" width="{pw-140}" height="104" rx="6" fill="{GOLD}"/>')
    b.append(t(rx + 104, y0 + 928, "What is my next step?", 40, INK, 700, -1))
    # gutter last, over both pages
    b.append(f'<rect x="{x0+pw-90}" y="{y0}" width="180" height="{ph}" fill="url(#gutter)"/>')
    b.append("</g>")
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 9. Four-part series - screens, restrained
# ===========================================================================
def video_stills():
    W, H = 1700, 1200
    b = [f'<rect width="{W}" height="{H}" fill="{INK}"/>']
    b.append(kicker(90, 108, "four-part video series", MINT, 19))
    titles = [("01", "Understanding", "foster care"), ("02", "Belief into", "action"),
              ("03", "Just", "neighbors"), ("04", "Your", "next step")]
    cw, ch, gap = 740, 430, 44
    for i, (num, l1, l2) in enumerate(titles):
        x = 90 + (i % 2) * (cw + gap)
        y = 170 + (i // 2) * (ch + gap)
        b.append(f'<g filter="url(#castsm)">')
        b.append(f'<rect x="{x}" y="{y}" width="{cw}" height="{ch}" rx="6" fill="{DEEP}"/>')
        b.append(f'<circle cx="{x+cw*0.80}" cy="{y+ch*0.34}" r="118" fill="{[MINT,GOLD,TAN,MINT][i]}" opacity="0.20"/>')
        b.append(kicker(x + 44, y + 72, f"part {num}", GOLD, 17))
        b.append(t(x + 44, y + 190, l1, 58, "#ffffff", 700, -2))
        b.append(t(x + 44, y + 254, l2, 58, "#ffffff", 700, -2))
        # play glyph
        b.append(f'<circle cx="{x+cw-76}" cy="{y+ch-76}" r="34" fill="{GOLD}"/>')
        b.append(f'<path d="M{x+cw-86} {y+ch-94} L{x+cw-86} {y+ch-58} L{x+cw-54} {y+ch-76} Z" fill="{INK}"/>')
        b.append("</g>")
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 10. Next step - one idea, big
# ===========================================================================
def next_steps():
    W, H = 1400, 1100
    b = [f'<rect width="{W}" height="{H}" fill="{GOLD}"/>']
    b.append(kicker(90, 130, "awareness had to lead somewhere", INK, 19))
    b.append(t(90, 340, "Pick", 210, INK, 700, -8))
    b.append(t(90, 540, "one next", 210, INK, 700, -8))
    b.append(t(90, 740, "step.", 210, INK, 700, -8))
    b.append(f'<rect x="90" y="820" width="360" height="8" fill="{INK}" opacity="0.5"/>')
    b.append(t(90, 930, "Advocate. Host the series. Support a caseworker. Give.", 34, INK, 500, -0.5, op=0.75))
    b.append(mark(W - 300, H - 300, 200))
    b.append(f'<rect width="{W}" height="{H}" filter="url(#grain)" fill="none"/>')
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 11. Campaign in context - screens as objects
# ===========================================================================
def campaign_in_context():
    W, H = 2100, 1200
    b = [f'<rect width="{W}" height="{H}" fill="#223d48"/>']
    dx, dy, dw, dh = 210, 150, 1230, 790
    b.append('<g filter="url(#cast)">')
    b.append(f'<rect x="{dx}" y="{dy}" width="{dw}" height="{dh}" rx="14" fill="{PAPER}"/>')
    b.append(f'<path d="M{dx} {dy+14} a14,14 0 0 1 14,-14 h{dw-28} a14,14 0 0 1 14,14 v44 h-{dw} z" fill="{PAPER_DIM}"/>')
    for i in range(3):
        b.append(f'<circle cx="{dx+36+i*28}" cy="{dy+29}" r="7" fill="{INK}" opacity="0.28"/>')
    b.append(mark(dx + 48, dy + 104, 74))
    b.append(t(dx + 156, dy + 158, "Foster Care &amp; The Church", 38, INK, 700, -1))
    b.append(f'<rect x="{dx+48}" y="{dy+240}" width="{dw-96}" height="310" rx="8" fill="{INK}"/>')
    b.append(f'<circle cx="{dx+dw/2}" cy="{dy+395}" r="50" fill="{GOLD}"/>')
    b.append(f'<path d="M{dx+dw/2-15} {dy+370} L{dx+dw/2-15} {dy+420} L{dx+dw/2+28} {dy+395} Z" fill="{INK}"/>')
    for i in range(3):
        x = dx + 48 + i * ((dw - 96) / 3)
        b.append(f'<rect x="{x}" y="{dy+590}" width="{(dw-96)/3-26}" height="150" rx="8" fill="{[MINT,TAN,GOLD][i]}" opacity="0.9"/>')
    b.append("</g>")
    # phone, overlapping the desktop like a real mockup
    px, py, pw, ph = 1540, 300, 320, 650
    b.append('<g transform="rotate(2.5 1700 620)" filter="url(#cast)">')
    b.append(f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="38" fill="#0d1b21"/>')
    b.append(f'<rect x="{px+11}" y="{py+11}" width="{pw-22}" height="{ph-22}" rx="29" fill="{GOLD}"/>')
    b.append(mark(px + pw / 2 - 48, py + 92, 96))
    # 38px overflowed the 320px bezel; 29 keeps both lines inside the screen.
    b.append(t(px + pw / 2, py + 300, "Foster Care", 29, INK, 700, -1, "middle"))
    b.append(t(px + pw / 2, py + 338, "&amp; The Church", 29, INK, 700, -1, "middle"))
    b.append(f'<rect x="{px+44}" y="{py+412}" width="{pw-88}" height="60" rx="30" fill="{INK}"/>')
    b.append(t(px + pw / 2, py + 452, "Get the kit", 25, "#ffffff", 600, 0, "middle"))
    b.append("</g>")
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 12. Guiding principle - typographic, full stop
# ===========================================================================
def campaign_detail():
    W, H = 1150, 1150
    b = [f'<rect width="{W}" height="{H}" fill="{TAN}"/>']
    b.append(f'<circle cx="{W*0.74}" cy="{H*0.22}" r="215" fill="{GOLD}" opacity="0.6"/>')
    b.append(kicker(80, 132, "guiding principle", INK, 18))
    for i, (ln, col) in enumerate([("Feel", INK), ("seen.", INK), ("Understand.", INK), ("Respond.", GOLD_DEEP)]):
        b.append(t(80, 340 + i * 138, ln, 122, col, 700, -5))
    b.append(f'<rect x="80" y="940" width="280" height="7" fill="{INK}" opacity="0.32"/>')
    b.append(kicker(80, 1020, "the forgotten initiative", INK, 17))
    b.append(f'<rect width="{W}" height="{H}" filter="url(#grain)" fill="none"/>')
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 13. Call sheet - a real printed document
# ===========================================================================
def production_plan():
    W, H = 1350, 1080
    b = [f'<rect width="{W}" height="{H}" fill="{SAGE}"/>']
    dw, dh, dx, dy = 1050, 900, 150, 90
    b.append(f'<g transform="rotate(-1.4 {dx+dw/2} {dy+dh/2})" filter="url(#cast)">')
    b.append(f'<rect x="{dx}" y="{dy}" width="{dw}" height="{dh}" rx="3" fill="{PAPER}"/>')
    b.append(kicker(dx + 60, dy + 90, "field production   /   kentucky", GOLD_DEEP, 17))
    b.append(t(dx + 60, dy + 186, "Two days inside", 62, INK, 700, -2))
    b.append(t(dx + 60, dy + 254, "Florence Baptist.", 62, INK, 700, -2))
    b.append(f'<line x1="{dx+60}" y1="{dy+300}" x2="{dx+dw-60}" y2="{dy+300}" stroke="{INK}" stroke-opacity="0.2"/>')
    rows = [("01", "Pastor interview", "Ministry context, the church's own beginning"),
            ("01", "B-roll, sanctuary", "Space, light, the ordinary week"),
            ("02", "Advocate interview", "The local agency relationship"),
            ("02", "Pickups + stills", "Assets for social, email, and the launch film")]
    y = dy + 372
    for day, title, note in rows:
        b.append(kicker(dx + 60, y, f"day {day}", GOLD_DEEP, 15))
        b.append(t(dx + 220, y + 4, title, 38, INK, 600, -0.8))
        b.append(t(dx + 220, y + 42, note, 24, INK, 400, 0, op=0.55))
        b.append(f'<line x1="{dx+60}" y1="{y+72}" x2="{dx+dw-60}" y2="{y+72}" stroke="{INK}" stroke-opacity="0.1"/>')
        y += 122
    b.append(f'<rect x="{dx+60}" y="{y+16}" width="{dw-120}" height="92" rx="6" fill="{MINT}" opacity="0.7"/>')
    b.append(t(dx + 98, y + 74, "Emotionally honest, never exploitative.", 30, INK, 600, -0.5))
    b.append("</g>")
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 14. Final frames - contact sheet
# ===========================================================================
def video_frames():
    W, H = 1700, 1050
    b = [f'<rect width="{W}" height="{H}" fill="#0a0909"/>']
    b.append(kicker(80, 100, "final frames", "rgba(255,255,255,0.55)", 18))
    fw, fh, gap = 362, 204, 28
    tones = [("#1d3a44", MINT), ("#2a4b3a", GOLD), ("#3a2f2a", TAN), ("#123440", MINT),
             ("#33414a", TAN), ("#4a3b28", GOLD), ("#1a2c33", MINT), ("#2e3a30", TAN)]
    for i, (bg, accent) in enumerate(tones):
        x = 80 + (i % 4) * (fw + gap)
        y = 165 + (i // 4) * (fh + gap + 62)
        b.append(f'<rect x="{x}" y="{y}" width="{fw}" height="{fh}" rx="3" fill="{bg}"/>')
        b.append(f'<circle cx="{x+fw*0.70}" cy="{y+fh*0.36}" r="{fh*0.19}" fill="{accent}" opacity="0.42"/>')
        b.append(f'<rect x="{x}" y="{y+fh*0.64}" width="{fw}" height="{fh*0.36}" fill="#000" opacity="0.3"/>')
        b.append(t(x, y + fh + 32, f"TC 00:{i*3+2:02d}:14", 15, "rgba(255,255,255,0.4)", 400, 1.6, family=MONO))
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 15. Year-end campaign - one line, big
# ===========================================================================
def fundraising():
    W, H = 1250, 1250
    b = [f'<rect width="{W}" height="{H}" fill="{PAPER}"/>']
    b.append(f'<circle cx="{W*0.82}" cy="{H*0.84}" r="300" fill="{GOLD}" opacity="0.45"/>')
    b.append(kicker(80, 128, "year-end   +   giving tuesday", GOLD_DEEP, 18))
    for i, (ln, col) in enumerate([("Give so", INK), ("no one is", INK), ("forgotten.", GOLD_DEEP)]):
        b.append(t(80, 350 + i * 158, ln, 142, col, 700, -6))
    b.append(f'<rect x="80" y="820" width="300" height="8" fill="{INK}" opacity="0.3"/>')
    b.append(t(80, 930, "Donor email, social, launch film, event, and the", 32, INK, 400, 0, op=0.65))
    b.append(t(80, 976, "recurring ask - run as one system.", 32, INK, 400, 0, op=0.65))
    b.append(mark(80, 1050, 130))
    b.append(f'<rect width="{W}" height="{H}" filter="url(#grain)" fill="none"/>')
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 16. Workstreams - restrained index, no boxes
# ===========================================================================
def workstreams():
    W, H = 1250, 1250
    b = [f'<rect width="{W}" height="{H}" fill="#9a513e"/>']
    b.append(kicker(80, 120, "communications system", "rgba(255,255,255,0.6)", 18))
    items = [("01", "Strategy + campaigns"), ("02", "Podcast + long-form"),
             ("03", "Video + field storytelling"), ("04", "Launches + activation"),
             ("05", "Fundraising + leadership")]
    y = 260
    for num, txt in items:
        b.append(f'<line x1="80" y1="{y-34}" x2="{W-80}" y2="{y-34}" stroke="#ffffff" stroke-opacity="0.22"/>')
        b.append(t(80, y + 32, num, 40, GOLD, 700, 0))
        b.append(t(196, y + 32, txt, 42, "#ffffff", 600, -1.2))
        y += 132
    b.append(f'<line x1="80" y1="{y-34}" x2="{W-80}" y2="{y-34}" stroke="#ffffff" stroke-opacity="0.22"/>')
    b.append(t(80, y + 62, "Direct reports, contractors, briefs,", 32, "rgba(255,255,255,0.78)", 400))
    b.append(t(80, y + 108, "creative review, and deadlines.", 32, "rgba(255,255,255,0.78)", 400))
    b.append(mark(W - 270, H - 270, 180, on_dark=True))
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 17. Signage in context - the Smith & Diction move
# ===========================================================================
def signage():
    W, H = 1900, 1150
    b = [f'<rect width="{W}" height="{H}" fill="#8d9a91"/>']
    # wall
    b.append(f'<rect x="0" y="0" width="{W}" height="{H*0.78}" fill="#9aa79d"/>')
    b.append(f'<rect x="0" y="{H*0.78}" width="{W}" height="{H*0.22}" fill="#6f7c74"/>')
    # tall hanging banner
    bx, by, bw, bh = 250, 90, 460, 830
    b.append('<g filter="url(#cast)">')
    b.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" fill="{INK}"/>')
    b.append(mark(bx + bw / 2 - 110, by + 110, 220, on_dark=True))
    b.append(t(bx + bw / 2, by + 470, "Foster Care", 52, "#ffffff", 700, -1.6, "middle"))
    b.append(t(bx + bw / 2, by + 530, "&amp; The Church", 52, "#ffffff", 700, -1.6, "middle"))
    b.append(f'<rect x="{bx+bw/2-50}" y="{by+570}" width="100" height="5" fill="{GOLD}"/>')
    b.append(t(bx + bw / 2, by + 660, "Starts Sunday", 34, MINT, 400, 0, "middle"))
    b.append("</g>")
    # wide horizontal sign
    sx, sy, sw, sh = 830, 300, 880, 400
    b.append('<g filter="url(#cast)">')
    b.append(f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="5" fill="{GOLD}"/>')
    b.append(t(sx + 56, sy + 150, "Awareness", 92, INK, 700, -3.5))
    b.append(t(sx + 56, sy + 248, "leads", 92, INK, 700, -3.5))
    b.append(t(sx + 56, sy + 346, "somewhere.", 92, INK, 700, -3.5))
    b.append(mark(sx + sw - 150, sy + sh - 150, 100))
    b.append("</g>")
    b.append(kicker(250, H - 60, "environmental   /   church signage", "rgba(255,255,255,0.75)", 18))
    return svg(W, H, "\n".join(b))


# ===========================================================================
# 18. Episode graphics system - the repeatable weekly deliverable
# ===========================================================================
def episode_system():
    W, H = 1700, 1150
    b = [f'<rect width="{W}" height="{H}" fill="{PAPER}"/>']
    b.append(kicker(80, 106, "episode graphics system", GOLD_DEEP, 18))
    b.append(t(80, 196, "296 episodes, one grid.", 62, INK, 700, -2.2))
    # three 16:9 thumbnails, stacked with real offset like printed proofs
    tw, th = 1160, 250
    specs = [("296", "Coping with a", "Dangerous Child", INK, "#ffffff"),
             ("295", "Overcoming Fears of", "Saying Yes to Autism", GOLD, INK),
             ("294", "Supporting My Child's", "Sensory Needs", MINT, INK)]
    for i, (num, l1, l2, bg, fg) in enumerate(specs):
        x, y = 80 + i * 60, 280 + i * 280
        b.append(f'<g filter="url(#castsm)">')
        b.append(f'<rect x="{x}" y="{y}" width="{tw}" height="{th}" rx="5" fill="{bg}"/>')
        # left rail carries the mark, right side the title - a real system rule
        b.append(f'<rect x="{x}" y="{y}" width="200" height="{th}" rx="5" fill="#000" opacity="0.10"/>')
        b.append(mark(x + 46, y + th / 2 - 54, 108))
        b.append(t(x + 250, y + 88, f"EPISODE {num}", 22, fg, 400, 5.5, family=MONO, op=0.7))
        b.append(t(x + 250, y + 152, l1, 44, fg, 700, -1.4))
        b.append(t(x + 250, y + 204, l2, 44, fg, 700, -1.4))
        b.append(f'<circle cx="{x+tw-78}" cy="{y+th/2}" r="34" fill="{fg}" opacity="0.9"/>')
        b.append(f'<path d="M{x+tw-88} {y+th/2-17} L{x+tw-88} {y+th/2+17} L{x+tw-58} {y+th/2} Z" fill="{bg}"/>')
        b.append("</g>")
    b.append(kicker(80, 1090, "youtube  /  spotify  /  apple  /  social", INK, 17))
    return svg(W, H, "\n".join(b))


ASSETS = {
    "episode-system.svg": episode_system,
    "campaign-identity.svg": campaign_identity,
    "mark-study.svg": mark_study,
    "type-specimen.svg": type_specimen,
    "color-system.svg": color_system,
    "social-campaign.svg": social_campaign,
    "guide-cover.svg": guide_cover,
    "guide-spread.svg": guide_spread,
    "video-stills.svg": video_stills,
    "next-steps.svg": next_steps,
    "campaign-in-context.svg": campaign_in_context,
    "campaign-detail.svg": campaign_detail,
    "production-plan.svg": production_plan,
    "video-frames.svg": video_frames,
    "fundraising.svg": fundraising,
    "workstreams.svg": workstreams,
    "signage.svg": signage,
}

if __name__ == "__main__":
    print(f"Generating {len(ASSETS)} assets -> {OUT}")
    for name, fn in ASSETS.items():
        write(name, fn())
    print("Done.")
