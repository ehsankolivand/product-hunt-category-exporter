# Product Hunt Category Exporter

A Chrome extension that collects products from a Product Hunt category and exports descriptions, ratings, reviews and launch discussions as JSON. Supports **English and فارسی**, with a language selector, saved language preference and right-to-left Persian layout.

[راهنمای فارسی](README.fa.txt)

## Install

1. Download this repository using **Code → Download ZIP** and extract it, or clone it.
2. Open `chrome://extensions` in Chrome 120 or newer.
3. Turn on **Developer mode**, click **Load unpacked**, and select the folder containing `manifest.json`.
4. Open a Product Hunt category page and click the extension icon.
5. Choose **English** or **فارسی** in the dashboard’s language selector.
6. Click **Choose folder and collect**, or save in the extension and download a ZIP later.

No build step, npm installation, server or API key is needed to use the extension. To update an existing installation, pause collection, reload the extension at `chrome://extensions`, and reopen the dashboard.

The initial dashboard language follows your browser language: Persian for `fa`, English otherwise. Your selection is remembered. Changing language updates labels, messages, numbers, dates and saved collection logs without restarting collection. Product names, descriptions, review text and JSON field names keep their original content.

## Collection modes

- **Fast and complete:** collects product details and all accessible reviews, launch comments and replies.
- **Quick catalog:** collects category descriptions and ratings without visiting each product’s review or launch pages. Omitted fields are explicitly marked in `coverage`.

Collection always starts at category page one and preserves URL filters and sorting. Editorial category pages follow their full “Browse all” list. The default is four concurrent collection lanes, configurable from one to six. Direct HTML requests run in the extension’s service worker; pages that require browser rendering use separate tabs.

Temporary rate limits respect `Retry-After`. Without a server duration, precautionary pauses increase by 20 seconds up to 300 seconds. The first limit leaves the request interval unchanged; a newly rate-limited resumption increases it once by 0.1 seconds. Cooldown and pacing survive reopening the dashboard.

## Export

```text
selected-folder/
  Productivity/
    run-id/
      manifest.json
      schema.json
      README.txt
      products-0001.json
      products-0002.json
```

Each product file contains at most 50 products. `manifest.json` records coverage, completeness, settings, errors and SHA-256 file checksums. `schema.json` describes the JSON structure. Data is UTF-8, and missing values are `null`, never invented zeroes.

Star ratings and launch votes are separate: `rating_average` is the exact published average when available, `rating_displayed` is the rounded category value, `rating_count` is the explicitly published number of ratings, and `review_count` counts written reviews. `upvotes_count` sums launch points only when the launch list and all counts are known; it is not a count of unique voters. `upvotes_observed` can be partial.

Sorting applies to the whole collection and exported files. The dashboard previews up to 50 matching products.

## Pause and resume

Keep Chrome and the dashboard open while collecting. Closing the dashboard stops collection; use **Previous collections → Resume collection** to continue from saved data. **Retry incomplete items** retries missing sections. Product and review records are deduplicated when resuming.

Progress is saved locally after each category page and product step. With a destination folder selected, files are updated every 20 category pages, every 250 detailed products, and on completion or pause. A ZIP of the current collection can be downloaded while paused or finished.

Large categories with thousands of products and comments can take hours or days. The extension can only collect content the website makes available to the browser. Human verification, inaccessible data, site limits and future Product Hunt layout changes may prevent a complete export; coverage records the gaps.

## Data and permissions

The extension reads Product Hunt, stores collection data on your device and writes exports to a folder you select or a downloaded ZIP. It sends no reviews, votes or messages, and uses no AI service or external analytics. Public author names and profile links can appear in exports. It uses your existing browser session without reading passwords or cookies directly.

Permissions cover the active tab, collector script injection, local storage, large datasets and downloads. Host access is restricted to `producthunt.com` and `www.producthunt.com`. Uninstalling the extension can delete its local database; keep folder or ZIP exports for long-term storage.

## Development checks

```sh
npm test
```

The Node tests cover collection logic, URL validation, transport behavior, rate limits and localization. For browser integration tests, run a local server from the repository root and open the test page:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/tests/browser.html`. These tests use fixture pages and simulated Chrome APIs rather than real Product Hunt requests.

## Version 1.3.0

- English and Persian dashboard, including validation, collection logs and rate-limit messages.
- Persistent language selection with automatic initial browser-language detection.
- Localized numbers, dates, accessibility labels and page direction.
- English and Persian Chrome extension metadata.
- Existing collection data, export schema and request pacing remain compatible.
