# Core Values English Word Choice Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained Chinese long-form HTML explaining why 精诚服务 uses Truth, Goodness, Beauty, Care, and Flourishing as its five English value labels.

**Architecture:** One standalone semantic HTML file lives beside the v0.4 VI manual in the adjacent brand workspace. CSS, JavaScript, five wordmarks, and five chapter patterns are embedded; external URLs appear only as optional citations, so the page remains readable and navigable offline.

**Tech Stack:** HTML5, CSS3, minimal vanilla JavaScript, Base64 PNG assets, Node.js static validation, browser screenshot QA.

## Global Constraints

- Formal labels are exactly `Truth · Goodness · Beauty · Care · Flourishing`.
- Formal Chinese term is `致美`, never `至美` except in an explicit correction note.
- The page is Chinese explanatory content, not a full English edition.
- Follow the v0.4 wordmark, pattern, color, opacity, and one-block-one-pattern rules.
- Final file: `../brand-vi-and-training/brand-vi/精诚服务核心价值英文选词说明.html`.
- No runtime fonts, frameworks, stylesheets, scripts, or image dependencies.
- Do not modify the Lighthouse runtime or `docs/brand` knowledge sources.

---

### Task 1: Establish the standalone page contract

**Files:**
- Create: `../brand-vi-and-training/brand-vi/精诚服务核心价值英文选词说明.html`
- Reference: `docs/design/core-values-english-word-choice-design.md`
- Reference: `../brand-vi-and-training/brand-vi/精诚服务新版VI手册.html`

**Interfaces:**
- Consumes: the approved five labels, the whitepaper definitions, and v0.4 asset paths.
- Produces: semantic sections `#overview`, `#truth`, `#goodness`, `#beauty`, `#care`, `#flourishing`, and `#sources`.

- [ ] **Step 1: Run the missing-artifact contract**

```powershell
$target = '..\brand-vi-and-training\brand-vi\精诚服务核心价值英文选词说明.html'
if (Test-Path -LiteralPath $target) { throw 'Expected the target to be absent before implementation.' }
```

Expected: exit 0 because the target does not yet exist.

- [ ] **Step 2: Create the semantic HTML and complete Chinese content**

Use this exact structural outline:

```html
<body>
  <header class="masthead">...</header>
  <main>
    <section class="hero" id="top">...</section>
    <section class="overview" id="overview">...</section>
    <div class="reading-layout">
      <nav class="chapter-nav" aria-label="价值章节">...</nav>
      <article class="chapters">
        <section class="value-chapter" id="truth">...</section>
        <section class="value-chapter" id="goodness">...</section>
        <section class="value-chapter" id="beauty">...</section>
        <section class="value-chapter" id="care">...</section>
        <section class="value-chapter" id="flourishing">...</section>
      </article>
    </div>
    <section class="closing-path">...</section>
    <section class="sources" id="sources">...</section>
  </main>
  <footer>...</footer>
</body>
```

Each value chapter must contain `词源`, `思想背景`, `为什么选择`, `为什么不选`, and `品牌解释` subsections. Copy claims from the user attachment without converting brand interpretation into etymological fact.

- [ ] **Step 3: Verify content invariants**

```powershell
$html = Get-Content -Raw -Encoding UTF8 -LiteralPath '..\brand-vi-and-training\brand-vi\精诚服务核心价值英文选词说明.html'
@('Truth','Goodness','Beauty','Care','Flourishing','求真','尽善','致美','大爱','幸福') | ForEach-Object {
  if (-not $html.Contains($_)) { throw "Missing required term: $_" }
}
if ($html -match 'Excellence\s*·|Compassion\s*·') { throw 'Alternative terms leaked into the primary label.' }
```

Expected: exit 0.

### Task 2: Apply the v0.4 visual system and embed assets

**Files:**
- Modify: `../brand-vi-and-training/brand-vi/精诚服务核心价值英文选词说明.html`
- Consume: `../brand-vi-and-training/brand-vi/vi-assets/value-wordmarks/*-wordmark-seal.png`
- Consume: `../brand-vi-and-training/brand-vi/vi-assets/pattern-backgrounds/{huiwen,ruyi,juancao,fangsheng,panchang}-mask.png`

**Interfaces:**
- Consumes: asset placeholder tokens in the HTML template.
- Produces: Base64 `data:image/png` values and chapter-level CSS custom properties.

- [ ] **Step 1: Add the v0.4 token layer**

```css
:root {
  --ink-green: #183a34;
  --paper: #f3e9d7;
  --paper-light: #fffdf8;
  --gold: #bfa76a;
  --seal: #722912;
  --jade: #aebb9e;
  --water: #315b6a;
  --silk: #d8d2c8;
  --ink: #0b130f;
}
```

Use paper colors for at least 60% of visible area, gold only as thin rules, and seal red only for small markers. Do not add orange or multicolor value coding.

- [ ] **Step 2: Add one pattern per chapter**

```css
.value-chapter::after {
  content: "";
  position: absolute;
  inline-size: clamp(240px, 28vw, 300px);
  aspect-ratio: 1;
  background: var(--ink-green);
  opacity: .15;
  -webkit-mask: var(--pattern) center / contain no-repeat;
  mask: var(--pattern) center / contain no-repeat;
  pointer-events: none;
}
```

Map Truth to huiwen, Goodness to ruyi, Beauty to juancao, Care to fangsheng, and Flourishing to panchang.

- [ ] **Step 3: Embed all ten assets mechanically**

For each wordmark and pattern, replace its explicit token with a Base64 data URL:

```powershell
$bytes = [IO.File]::ReadAllBytes($assetPath)
$data = 'data:image/png;base64,' + [Convert]::ToBase64String($bytes)
$html = $html.Replace($token, $data)
```

After replacement, assert that no token matching `__[A-Z_]+__` remains.

- [ ] **Step 4: Verify runtime independence**

```powershell
$html = Get-Content -Raw -Encoding UTF8 -LiteralPath '..\brand-vi-and-training\brand-vi\精诚服务核心价值英文选词说明.html'
if ($html -match '<(?:script|link|img)[^>]+(?:src|href)=["''](?!data:|#)') { throw 'Runtime dependency detected.' }
if (($html | Select-String -Pattern 'data:image/png;base64,' -AllMatches).Matches.Count -lt 10) { throw 'Not all assets were embedded.' }
```

Expected: exit 0 and at least ten embedded PNG assets.

### Task 3: Add responsive reading behavior and accessibility

**Files:**
- Modify: `../brand-vi-and-training/brand-vi/精诚服务核心价值英文选词说明.html`

**Interfaces:**
- Consumes: section IDs and navigation links from Task 1.
- Produces: active navigation state, reading progress, return-to-top behavior, reduced-motion and print modes.

- [ ] **Step 1: Add minimal navigation JavaScript**

```js
const links = [...document.querySelectorAll('[data-chapter-link]')];
const sections = links.map(link => document.querySelector(link.hash)).filter(Boolean);
const observer = new IntersectionObserver(entries => {
  const current = entries.filter(entry => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!current) return;
  links.forEach(link => link.toggleAttribute('aria-current', link.hash === `#${current.target.id}`));
}, { rootMargin: '-24% 0px -58%', threshold: [0, .2, .5] });
sections.forEach(section => observer.observe(section));
```

Update a CSS custom property `--read-progress` on scroll and avoid any animation when `prefers-reduced-motion: reduce` is active.

- [ ] **Step 2: Add responsive and print rules**

At `max-width: 800px`, collapse the two-column reading layout to one column and make the chapter navigation horizontally scrollable. At `@media print`, hide fixed navigation and interactive controls, remove decorative patterns behind dense text, and display citation URLs after links.

- [ ] **Step 3: Run semantic checks**

```js
const fs = require('node:fs');
const html = fs.readFileSync('../brand-vi-and-training/brand-vi/精诚服务核心价值英文选词说明.html', 'utf8');
for (const token of ['<main', '<nav', '<article', '<footer', 'aria-label=', ':focus-visible', 'prefers-reduced-motion', '@media print']) {
  if (!html.includes(token)) throw new Error(`Missing semantic/accessibility token: ${token}`);
}
```

Expected: exit 0.

### Task 4: Browser QA and final verification

**Files:**
- Verify: `../brand-vi-and-training/brand-vi/精诚服务核心价值英文选词说明.html`

**Interfaces:**
- Consumes: the complete standalone HTML.
- Produces: fresh evidence that the page renders, navigates, prints, and remains readable across required viewports.

- [ ] **Step 1: Open the page in a real browser**

Load the local `file://` URL and confirm no console errors.

- [ ] **Step 2: Capture required viewport evidence**

Check `320×640`, `390×844`, `430×932`, and `1440×900`. At every size verify no horizontal overflow, clipped wordmarks, overlapping navigation, or unreadable citations.

- [ ] **Step 3: Exercise keyboard and navigation states**

Tab through the skip link, chapter links, citations, and return-to-top control. Verify a visible focus state and correct `aria-current` movement while scrolling.

- [ ] **Step 4: Run the final static contract**

```powershell
$path = '..\brand-vi-and-training\brand-vi\精诚服务核心价值英文选词说明.html'
$item = Get-Item -LiteralPath $path
if ($item.Length -lt 100000) { throw 'Expected a self-contained HTML with embedded image assets.' }
$html = Get-Content -Raw -Encoding UTF8 -LiteralPath $path
if ($html -match '__[A-Z_]+__') { throw 'Unreplaced build token found.' }
if ($html -match 'src=["''](?:https?:|\.\.?/)') { throw 'External runtime source found.' }
"VERIFIED_PATH=$($item.FullName)"
"VERIFIED_BYTES=$($item.Length)"
```

Expected: exit 0 with the absolute file path and final byte count.
