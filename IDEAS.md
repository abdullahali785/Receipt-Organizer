# Ideas / Later

Deferred from the MVP to ship fast. Roughly in priority order within each group.

## Data & records
- **Tap-to-edit** a saved receipt from the records table (reuse the Review form).
- **Delete** a receipt (swipe or long-press).
- **Search & filter** the table (vendor text, month, category).
- **CSV export** via the share sheet (backup + hand to an accountant).
- **CSV import** (e.g. bring in rows from the old Google Sheet).
- **Backup / multi-device sync**: server DB (Postgres) with the phone as a cache. Receipts already have UUIDs + `updated_at`, so this is additive.
- **Google Sheets sync** as an optional export target (old `sheets.py` lives in git history).
- Inline cell editing in the table (spreadsheet-style).

## Capture & extraction
- **Offline upload queue**: capture without network, auto-retry with exponential backoff + jitter when back online.
- **PDF receipts** via the document picker (backend already supports PDF).
- **Per-field confidence** (`field_confidence` in the extraction schema) for precise highlighting on Review. MVP highlights missing fields + the overall review flag.
- Custom in-app camera (expo-camera) with a receipt-framing overlay.
- Re-categorize endpoint when the vendor is edited on Review.
- Word-boundary rule matching (today "shell" matches "Shellfish Shack" → Transportation).
- Evaluate Claude Opus 5.5 and Anthropic SDK 1.x (currently pinned to `claude-opus-4-8` / SDK 0.118.0).

## Summary & insights
- Convert multi-currency totals into a home currency (MVP shows totals per currency).
- Charts (spend by category over months), budgets per category.

## Platform & quality
- iOS TestFlight build (needs an Apple Developer account). MVP ships an Android APK; iOS works via Expo Go.
- Shared contract fixtures validated by both pytest and Jest to keep Zod ↔ Pydantic in sync.
- Rate limiting per token on the API; per-user accounts instead of one shared token.
- Error reporting (Sentry) for app + backend.
