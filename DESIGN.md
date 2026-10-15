# IMD Atlas design system

## Overview

IMD Atlas is an English, read-only Ethereum holder explorer. Its visual idea is a quiet, pale canvas of bubbles, with size showing holdings and restrained color distinguishing wallets, connected wallets and contracts. A compact tool interface keeps token selection, filtering and the map ahead of explanatory content.

The source of truth is `src/styles.css`, with UI patterns in `src/App.tsx` and the map in `src/BubbleMap.tsx`. There is one light theme. The design uses flat surfaces, deliberate spacing and thin structural borders rather than shadows, gradients or marketing decoration.

## Colors

All core colors use semantic CSS custom properties in `src/styles.css`.

| Token | Value | Role |
| --- | --- | --- |
| `--page` | `#f7f8f5` | Page and header background |
| `--surface` | `#ffffff` | Explorer, fields and token cards |
| `--surface-soft` | `#f0f2ed` | Neutral hover, segmented control and counters |
| `--text` | `#202b25` | Main text; inverse tooltip surface |
| `--muted` | `#647067` | Supporting text and metadata |
| `--border` | `#e0e5dc` | Structural separators |
| `--control-border` | `#bdc6bb` | Selects and outlined controls |
| `--accent` / `--accent-hover` | `#244f36` / `#173c2d` | Primary actions and brand |
| `--accent-soft` | `#edf4e5` | Selected token and small brand surfaces |
| `--accent-bright` | `#d3ed9e` | Logo details and text selection |
| `--focus` | `#286644` | Keyboard focus indicator |
| `--wallet-fill` / `--wallet-stroke` / `--wallet-text` | `#e6ede0` / `#9eb593` / `#3d5236` | Wallets with no observed connection |
| `--connected-fill` / `--connected-stroke` / `--connected-text` | `#d5eaa6` / `#729944` / `#32491c` | Wallets with an observed connection |
| `--contract-fill` / `--contract-stroke` / `--contract-text` | `#e6def4` / `#af97ce` / `#5d437d` | Contracts, including connected contracts |
| `--warning-text` / `--warning-fill` | `#8a5219` / `#fcf3e6` | Snapshot/error notices |

The map canvas is `#fafbf8`, with a 20px dot grid in `#dce2d7`. Token emblems use green for IMD, `#e7e0f4` with `#645083` for sIMD, and `#f0e3cb` with `#83602e` for imdUSD. These emblems identify tokens; they do not encode graph connectivity.

Contract classification takes precedence over the connected-wallet color. The legend, tooltips, holder type, connection count and list view carry the same information in text. Fresh/loading/snapshot statuses always have labels as well as dots. The evidence and measured contrast pairs are in `artifacts/validation.md` and `artifacts/contrast.json`.

## Typography

- **Prose and UI:** DM Sans Variable, then DM Sans and sans-serif. The Latin WOFF2 weight-axis font is bundled through `@fontsource-variable/dm-sans`; it loads locally with `font-display: swap`. The browser confirmed the intended face was loaded.
- **Addresses and exact data:** `ui-monospace`, SFMono-Regular, Consolas, Liberation Mono, monospace. No monospace prose.
- **Weights:** 400 for body text, 500 for numeric emphasis and selected controls, 600 for headings and strong labels. The font supports the requested weights; synthesis is disabled.
- **Scale:** `--text-xs` 12px; `--text-sm` 14px; `--text-base` 16px; `--text-lg` 20px; `--text-xl` 28px; `--text-display` 40px, all defined in rem. Decorative token glyphs use a fixed 20px inside fixed-size emblems.
- **Hierarchy:** page heading 40px desktop / 28px below 1000px. Section headings 28px / 20px below 1000px. Dense panel headings 16px. Tool labels and metadata 12–14px. Mobile inputs are 16px to avoid iOS input zoom.
- **Rhythm:** body line height 1.5, longer explanations 1.6–1.7, headings 1.2. Headings use balanced wrapping, paragraphs use pretty wrapping, and reading copy is capped at about 65 characters.
- **Tracking:** display heading −0.04em; small headings typically −0.025em or less. No tracked uppercase eyebrow labels.
- **Numbers:** balances, shares, counters and timestamps use tabular figures. Exact balances remain strings and are available in disclosure. Full wallet addresses wrap and remain selectable.

## Layout

The spacing tokens are 4, 8, 12, 16, 24, 32 and 48px. Small gaps group related controls; 24px and larger gaps separate sections. The outer content width is capped at 1600px. Desktop margins are 40px, reducing to 24px and then 16px on phones (12px at 320px).

| Range | Implemented behavior |
| --- | --- |
| ≥1600px | 230px token sidebar, flexible map, 280px holder panel; 540px map height |
| 1251–1599px | 210px sidebar, flexible map, 256px holder panel; 490px map height |
| 1200–1250px | 190px sidebar and 240px holder panel; reduced outer margins |
| 1000–1199px | 210px sidebar plus map; holder panel moves below both |
| 600–999px | Horizontal token choices, collapsible filters, map, legend and holder list stacked; 460px map |
| ≤599px | Compact token tabs and icon view switch; 400px map; one-column token directory and intro; 16px inputs |

At 390 × 844 the header, one-line title, short intro, token choices, filter control, map controls and usable bubbles appear on the first screen. The map starts around 498px from the top. There is no fixed overlay or sticky chrome covering the content.

The header and token choices can wrap when text is enlarged. Mobile statistics use `auto-fit` and a rem-based minimum so they also reflow under 200% text enlargement. Map labels switch to rank numbers when the user’s font size no longer fits a bubble; full values remain available through selection and the list. The SVG transfer layer has no text. The map uses explicit clipping for its pan/zoom viewport, while addresses and exact balances wrap freely in the detail panel.

Observed widths: 320, 390, 768, 1024 and 1440. The 200% root-text enlargement check passed at 390. Native browser zoom, physical-device behavior and WebKit rendering remain unverified.

## Elevation & Depth

Surfaces use backgrounds and borders only; there are no shadows. Tooltips use a dark opaque surface above bubbles at z-index 5. Map controls sit at z-index 6. Selected bubbles have a 2px ring with a 4px offset; keyboard-focused bubbles use 3px. Other focusable controls have a 2px outline, also offset by 4px.

Tooltip position stays inside the map and moves below a node when there is insufficient room above. It remains open while hovered and closes with Escape. The detail panel is in the document flow, not a modal. On narrow screens selection scrolls to the detail panel, focuses its heading and returns focus to the holder control on close.

## Shapes

`--radius` is 10px for the explorer and token cards; `--radius-small` is 6px for fields and standard controls. Segmented controls use 6px outside and 4px inside. Holder bubbles, token emblems, status dots and brand marks are circular. The usual border is 1px; bubbles use 1.5px and connected highlights use 2.5px.

## Components

| Component / pattern | Source and use | States and behavior |
| --- | --- | --- |
| `Brand`, `TokenMark` | `src/App.tsx`; local CSS shapes, no remote logos | Home link; decorative emblems excluded from accessible names |
| Token choices | `App`; buttons with `aria-pressed` in a named group | Selected fill and dot; mintability filter limits available choices |
| Filters | `App`; native `details`, labeled selects and checkbox | Open on desktop, collapsed on phones; active-filter count; reset; connection filtering disabled when history is incomplete |
| `BubbleMap` | `src/BubbleMap.tsx`; accepts holders, links, token, selected address and callbacks | D3 computes a deterministic settled layout; native buttons provide keyboard selection; hover/focus tooltip; zoom 1–2×, drag/arrow pan, reset; empty state |
| `HolderList` | `App`; top-eight sidebar and full-list variants | Descending balance rank, selected state, expand/collapse; full address available in accessible name and detail view |
| `HolderDetails` | `App`; read-only balance and observed-transfer inspector | Full address, copy feedback/failure, explorer link, exact balance disclosure, peer navigation and transaction evidence |
| `Legend` | `App`; named section with level-two heading | Colors, transfer line, rank explanation and area/minimum-size explanation |
| Data status | `App`; stable live regions and UTC timestamp | Loading preserves a clearly labeled dataset; live ages to snapshot after five minutes; error offers Refresh; partial transfer data is explicit |
| Token directory | `App`; three articles | Issuance label, sourced description, documentation link and Explore holders action |
| Primary action | `.primary-button` | Dark green fill, used for recovery from an empty result |

Controls have visible hover, focus and active treatments. Hover styles are limited to hover-capable pointers. Motion is limited to 150ms color/scale transitions and the refresh spinner; both are enabled only under `prefers-reduced-motion: no-preference`. Press feedback uses scale 0.96. No `transition: all`, page-load entrance animation or moving force simulation is used. Forced-colors CSS preserves visible selected/focus states.

## Do’s and Don’ts

- Start new content inside `.page-shell`, reuse the existing scale, colors and section spacing, and use real headings in logical order.
- Reuse native controls and the existing field/row patterns. Give every icon-only control an accessible name and every state a text cue.
- Treat the three graph colors as data roles. Use the accent action style for a primary recovery action, not to decorate every control.
- Keep full addresses and exact balances reachable. Compact addresses are navigation cues, not replacements for the underlying values.
- Preserve dated provenance. Never label the bundled snapshot as live or invent graph links to make the map look denser.
- For another page, keep the same header, page shell, type scale, section heading and footer; use a hash route or export a real HTML path. Recheck 390px and keyboard behavior before adding another layout pattern.

## Attribution

The six-domain design review applied the pinned Better Interface guidance adapted from Jakub Krehel, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e` (MIT). This document follows the pinned documentation method adapted from Paul Bakaus’s Impeccable, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` (Apache-2.0). The supplied combined license is retained at `artifacts/licenses/design-guides.txt`. These references informed this implementation; they are not runtime dependencies.
