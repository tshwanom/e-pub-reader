---
name: ui-ux-specialist
description: "Use when designing, refining, or debugging the One Man Revolution EPUB reader UI/UX. Handles: creating new components (Apple-inspired modern style, brand tokens), diagnosing blank/broken UI (browser inspection, network analysis, console errors), responsive layout (mobile/tablet/desktop), accessibility audits (WCAG 2.1 AA, ARIA, keyboard nav), and interaction design (animations, transitions, hover states). Invoke for any page, component, or visual flow in app/, components/, or globals.css. Brand color: #3D737A."
argument-hint: "Describe the component, page, or issue — e.g. 'landing hero needs stronger CTA' or 'reader toolbar is misaligned on mobile'"
---

# UI/UX Specialist — One Man Revolution Reader Platform

## Design System

### Brand Palette

| Token | Value | Use |
|-------|-------|-----|
| `landing-accent` | `#3D737A` | CTAs, links, active states, focus rings |
| `landing-accent-secondary` | `#2f5a61` | Hover state for accent |
| `landing-highlight` | `#6b9ca3` | Decorative tints, subtle borders |
| `landing-bg` | `#f4f6f7` | Page background |
| `landing-text` | `#111827` | Primary body text |
| `landing-text-muted` | `#5f6b76` | Secondary / caption text |
| `landing-border` | `#d8e0e4` | Dividers, card outlines |
| `landing-surface` | `#ffffff` | Card / modal surfaces |
| `landing-surface-muted` | `#edf2f4` | Input backgrounds, chip backgrounds |

Body background also uses:
```css
background-image: radial-gradient(circle at top right, rgba(61, 115, 122, 0.1), transparent 42%);
```
Text selection: `rgba(61, 115, 122, 0.2)`.

### Typography

| Class | Font | Use |
|-------|------|-----|
| `.font-playfair` | Playfair Display, serif | Display headings (H1, H2 hero) |
| `.font-crimson` | Crimson Pro, serif | Long-form reading body text |
| `.font-inter` | Inter, sans-serif | UI controls, captions, labels |

Heading tracking convention: small-caps labels use `tracking-[0.16em]` uppercase.

### Spacing & Shape

- Border radius scale: `rounded-xl` (default interactive), `rounded-2xl` (cards/modals), `rounded-full` (avatars/pills)
- Max content width: `max-w-7xl` inside `.page-container` (`mx-auto w-full px-5 sm:px-8`)
- Reader column: `max-w-6xl` centred inside the viewer area

### Reusable Utility Classes

```css
/* Page scaffold */
.page-shell       /* min-h-screen bg-landing-bg text-landing-text */
.page-container   /* mx-auto max-w-7xl px-5 sm:px-8 */

/* Surfaces */
.surface-card     /* glassmorphism card: white/70, backdrop-blur-xl, ring-1 white/65, shadow-md */
.surface-muted    /* lighter card: white/55, backdrop-blur-lg, ring-1 white/50, shadow-sm */

/* Buttons */
.brand-button     /* filled teal CTA — rounded-xl, bg-landing-accent, focus ring */
.ghost-button     /* outline — border-landing-border hover:border-landing-accent/40 */

/* Animation */
.fade-in-element  /* opacity-0 → 1 over 0.8s; nth-child stagger +0.2s per item */
```

### Visual Style Principles (Apple-inspired)

1. **Whitespace is content** — never fill space for its own sake; generous padding feels premium
2. **Glassmorphism surfaces** — use `surface-card` / `surface-muted` instead of solid flat cards
3. **Subtle depth** — `shadow-sm` / `shadow-md` only; no heavy drop shadows
4. **Micro-motion** — `transition-all duration-200` on interactive elements; `transition-transform duration-300 ease-in-out` for sliding panels
5. **Consistent focus rings** — always `focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2`; never suppress them
6. **Muted hierarchy** — primary text `#111827`, secondary `#5f6b76`; avoid more than two text colours on one surface

---

## Workflow A — Design a New Component

1. **Clarify scope** — identify page/route, viewport target, interaction model (static, animated, user-input)
2. **Scaffold** — use `.page-shell` + `.page-container` for full-page, or `surface-card` for isolated cards
3. **Apply tokens** — use `landing-*` Tailwind classes; no raw hex in JSX
4. **Typography** — display headings → `.font-playfair`; UI controls → `.font-inter`; body prose → `.font-crimson`
5. **Responsiveness** — mobile-first: define base styles, then `sm:`, `md:`, `lg:` overrides; use `flex-col sm:flex-row` patterns
6. **Interactions** — add `transition-colors duration-200` on hover; `transition-transform duration-300` for drawers/modals
7. **Accessibility** — see [Accessibility Checklist](#accessibility-checklist)
8. **Review** — use the browser tool to screenshot at 375 px (mobile) and 1280 px (desktop) widths

---

## Workflow B — Diagnose a Blank / Broken UI

1. **Open the page** in the integrated browser (`open_browser_page`)
2. **Capture console & network** — use `run_playwright_code` to intercept all non-asset requests/responses:
   ```js
   const responses = [];
   page.on('response', r => { if (!r.url().includes('_next')) responses.push({ url: r.url(), status: r.status() }); });
   await page.reload({ waitUntil: 'networkidle' });
   return responses;
   ```
3. **Inspect the DOM** — check target element dimensions and children:
   ```js
   return page.evaluate(() => {
     const el = document.querySelector('[your-selector]');
     return { children: el?.children.length, w: el?.clientWidth, h: el?.clientHeight, html: el?.innerHTML.slice(0, 300) };
   });
   ```
4. **Identify root cause category**:
   - `4xx` on a data/asset URL → access control or missing file
   - Component renders but is `0 × 0` → CSS height/width missing; check parent `h-screen` chain
   - Third-party lib (epub.js, chart) renders nothing → check if URL/data format meets library expectations (e.g. epub.js needs `.epub` extension or an `ArrayBuffer`, not a bare API URL)
   - Empty iframe → library initialised before the container had non-zero dimensions
5. **Fix** → verify by reloading and re-capturing DOM / screenshot
6. **Write a regression test** — add a test that asserts the critical element is non-empty after load

---

## Workflow C — Responsive Layout Audit

1. Test at three widths: **375 px** (iPhone SE), **768 px** (iPad), **1280 px** (laptop)
2. Check: touch targets ≥ 44 × 44 px, no horizontal scroll, font size ≥ 16 px on mobile, correct `flex-col sm:flex-row` collapses
3. Fix by adding missing breakpoint classes; never use fixed pixel widths for layout containers

---

## Workflow D — Interaction & Animation Design

- Hover: `transition-colors duration-200` or `transition-all duration-200`
- Slide-in panels (TOC, drawers): `transition-transform duration-300 ease-in-out` with `translate-x-full` / `translate-x-0`
- Fade-in: use `.fade-in-element` utility (nth-child stagger already baked in)
- Progress bars: `transition-all` (width) so the bar animates smoothly
- Disable animations: always respect `prefers-reduced-motion` — wrap decorative keyframes in `@media (prefers-reduced-motion: no-preference)`

---

## Accessibility Checklist

- [ ] All interactive elements reachable by `Tab` and activatable by `Enter`/`Space`
- [ ] Buttons have visible `aria-label` or inner text (not icon-only without label)
- [ ] Images have `alt` text; decorative images have `alt=""`
- [ ] Colour contrast ≥ 4.5 : 1 for body text, ≥ 3 : 1 for large text (check `#3D737A` on `#f4f6f7` ✓)
- [ ] Focus ring never hidden — use `focus-visible:ring-2` pattern above
- [ ] No content conveyed by colour alone — pair colour with icon or text label
- [ ] ARIA roles: use semantic HTML first; add `role=` only when HTML semantics insufficient
- [ ] Modal/dialog traps focus and restores on close
- [ ] `aria-disabled` instead of removing interactive element when it should remain focusable

---

## Key File Map

| File | Purpose |
|------|---------|
| `app/globals.css` | Design tokens (CSS vars), utility classes (`.surface-card`, `.brand-button`, etc.) |
| `tailwind.config.js` | `landing-*` colour palette, radius vars |
| `app/layout.tsx` | Font loading (`font-playfair`, `font-crimson`, `font-inter`) |
| `components/Reader.tsx` | Full-screen reader — epub.js integration, themes, navigation |
| `components/landing/` | Hero, Header, Footer, BookCard — landing page components |
| `app/read/[bookId]/page.tsx` | Server component that gates access and renders `<Reader>` |

---

## Common Pitfalls in This Codebase

| Pitfall | Fix |
|---------|-----|
| epub.js renders nothing when given an API URL without `.epub` | Pre-fetch as `ArrayBuffer` and pass to `ePub(buffer)` |
| Reader viewer is `0 × 0` | Ensure the parent chain has explicit `h-screen` / `h-full` all the way down |
| TOC items missing | `book.navigation.toc` only populated after `rendition.display()` resolves |
| Glassmorphism invisible on dark screens | Add a fallback `bg-white/70` — `backdrop-blur` needs a background behind it |
| Accent colour on white fails contrast | Use `#2f5a61` (accent-secondary) instead of `#3D737A` for small text on white |
