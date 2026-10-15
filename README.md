# IMD Atlas

A read-only bubble map of the IMD ecosystem on Ethereum, built for the SIMD-CHAT assignment. Explore top holders of IMD, sIMD and imdUSD, inspect observed transfers, and filter by holder size, token mintability and connection presence.

The finished static site is in **`dist/`**. Source, the dependency lockfile, local font, favicon, share image and validation records are included. No wallet, account, private key, API key or backend is needed.

## Install, preview and rebuild

Use Node.js 22.12 or newer and npm:

```sh
npm ci
npm run dev
```

For a production preview:

```sh
npm run typecheck
npm run build
npm run preview -- --host 127.0.0.1
```

Open the local URL printed by Vite. To preview the supplied export without installing dependencies:

```sh
python3 -m http.server 4173 --directory dist --bind 127.0.0.1
```

Serve the site over HTTP rather than opening `index.html` as a local file. Vite uses `base: './'`; all bundled asset references are relative, and navigation uses page anchors. The export was tested under `/preview/`, so it can be served at a static gateway subpath without route rewrites. Publishing and domain configuration are outside this delivery.

Dependencies and browser downloads are build tools, not submission artifacts. Do not include `node_modules`, package caches, browser binaries or `test/scratch` in a submission. This worker installed dependencies in a temporary build directory outside the repository, then copied the verified export back. No ignore files were changed.

## Use the map

- Select a token. Token selection loads its latest indexed holders and transfer history.
- Open **Filters** on a phone. Holder sizes are shares of that token’s Ethereum supply: large ≥1%, medium ≥0.1% and <1%, small <0.1%.
- Search the loaded top holders by address or explorer-provided name. The search does not search all Ethereum wallets.
- Hover or focus a bubble for a tooltip; select it for the full address, exact balance and observed peers. Small bubbles display balance rank. The list view provides a larger-target alternative.
- Use the connection filter or show/hide lines. At most 500 recent transfer events are examined. A line is an observed transfer, not evidence of common ownership.
- Refresh explicitly to fetch again. Requests time out after 30 seconds. The refresh control disables immediately while a request is pending.

The initial map uses a **real, dated Blockscout snapshot**, captured on 15 October 2026, while fresh data loads. On request failure it keeps the snapshot and displays the error with a retry action. A successful fetch is labeled live for five minutes, after which its label becomes snapshot. This is a freshness label, not automatic background polling. Partial transfer failures are identified separately and disable the connection filter.

The token directory distinguishes protocol issuance from availability: sIMD shares are issued through staking, and imdUSD through its vault. IMD has no new emissions; bridge minting represents existing cross-chain supply. These are documented classifications, not a real-time simulation of minting eligibility. See [data sources and methodology](artifacts/data-sources.md).

## Validation

The worker ran these checks against the finished production export:

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed; TypeScript strict mode, no emit |
| `npm test` | 13 data tests passed |
| `npm run build` | Passed; Vite production export, no build warnings |
| `npm run test:browser` | 18 Chromium checks passed; 0 failed |
| axe-core | 0 reported violations at 390 and 1440, including selected-holder state |
| Pinned `taste@1` probe | 16/16 checks passed at 320, 390 and 1440 |
| Live Ethereum API | Actual browser requests succeeded for all three tokens; no API mocks in the live inspection |
| Responsive inspection | 320, 390, 768, 1024 and 1440; no horizontal overflow; 200% text enlargement also checked |

The main product and token/filter actions are visible on the first screen at 390 × 844. The title, description, favicon, `og:title`, `og:image` and a real local 1200 × 630 share image are present.

To rerun the local checks:

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run test:browser
```

The browser script starts and closes its own HTTP server, serves `dist/` under `/preview/`, and writes results into `test/scratch/validation/`. Its deterministic API responses come from the real bundled snapshot; it deliberately simulates loading, HTTP failure, malformed responses, partial history and network failure. Its result records clearly separate those tests from live-network verification. WebKit is attempted independently and is reported as unperformed if its runtime cannot launch.

**Limitations:** WebKit downloaded but could not launch because the available runtime lacks its system libraries, including GTK 4, GStreamer and ICU 76. Chromium checks are not Safari or physical-device tests. Native screen-reader sessions, native browser zoom and a physical touch device were not available. The 200% check enlarges root text; it is not native browser zoom. The accessibility scan leaves manual contrast review for the decorative map watermark; passing a scan does not establish full accessibility compliance.

The public Blockscout instance is an external dependency and may rate-limit, lag Ethereum, or change its API. Its documentation announces eventual deprecation of per-instance endpoints. The current endpoints were verified working; the dated snapshot remains useful if they stop responding. See [the full validation record](artifacts/validation.md) and [DESIGN.md](DESIGN.md).

## Maintain the data and assets

`src/tokens.ts` contains the three published contract addresses and issuance sources. `src/api.ts` implements the public Blockscout adapter, bounded pagination, validation and cancellation. `src/data.ts` contains exact balance handling, graph derivation and filters. The client never sends transactions.

To intentionally replace the bundled snapshot with fresh real responses:

```sh
npm run snapshot
npm test
npm run build
```

The snapshot command only replaces the file after all three token fetches succeed, and rejects incomplete transfer requests. Existing regression assertions capture properties of the checked-in snapshot; review them if a new snapshot changes the observed graph. Never substitute invented balances or connections.

The share-card source is `assets/social.svg`; `npm run social` renders `public/social.png` using Chromium. The graph in that share card is a decorative ecosystem illustration, not a holder-data snapshot. Runtime dependency licenses are in `public/third-party-licenses.txt` and are copied into `dist/` by the build. Design-reference attribution and licenses are retained in `artifacts/licenses/design-guides.txt`.
