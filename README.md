# 🧾 Receipt & Expense Organizer

An **AI agent** that turns a photo or PDF of a receipt into a clean, categorized
row in your Google Sheet. Upload a receipt and the agent *reads* it with Claude's
vision, *decides* what expense category it belongs to, and *acts* by logging it —
flagging anything it isn't confident about for manual review instead of guessing.

It's a small, practical agent loop: **perceive → categorize → store**, wrapped in
a minimal web UI.

---

## What it does

- **Extracts** vendor, date, total, currency, and line items from messy, rotated,
  or low-quality receipt images (JPG/PNG/GIF/WEBP) and PDFs, using Claude's vision
  + **structured outputs** (so the JSON is always schema-valid).
- **Categorizes** each expense with fast, editable keyword **rules** first
  (e.g. `starbucks → Food & Drink`, `uber → Transportation`), falling back to
  **Claude** when no rule matches.
- **Logs** each receipt as a row in **Google Sheets** (date, vendor, amount,
  currency, category, review flag, source file).
- **Flags low-confidence** extractions for manual review rather than inventing
  values, and **validates + retries** the model response before writing.

## How the agent works

```
   upload ──▶ agent.extract_receipt()      # Claude vision → strict JSON (Receipt schema)
                    │
                    ▼
             agent.categorize()            # 1) categorizer.py rules
                    │                       # 2) Claude fallback if no rule hits
                    ▼
             sheets.append_receipt()       # gspread → one row in your Sheet
                    │
                    ▼
        confirmation rendered on the page  # vendor, total, category, review badge
```

## Project structure

```
Receipt-Organizer/
├── app.py            # Flask single-page UI + JSON API (/ and /api/receipts)
├── agent.py          # Claude vision extraction + categorization orchestration
├── categorizer.py    # Pure rule engine (no Claude)
├── categories.json   # ← Edit this to add vendors/categories, no code changes
├── sheets.py         # Google Sheets read/write (service-account OR OAuth)
├── requirements.txt
├── .env.example      # Copy to .env and fill in
└── .gitignore        # Ignores .env, credentials, uploads, venv
```

---

## Setup

### 1. Install

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Anthropic API key

Copy the template and add your key (keep it in `.env`, **not** `.env.example`):

```bash
cp .env.example .env
# then edit .env:  ANTHROPIC_API_KEY=sk-ant-...
```

Get a key at <https://console.anthropic.com/settings/keys>. The default model is
`claude-opus-4-8` (best receipt accuracy); set `CLAUDE_MODEL=claude-haiku-4-5` in
`.env` for lower cost at high volume.

### 3. Google Sheets

You need a way for the app to write to a sheet. Two options — the app **auto-detects**
whichever credentials file it finds.

**A) Service account (default).** Best when key downloads are allowed:

1. In [Google Cloud Console](https://console.cloud.google.com), create a project.
2. **Enable the Google Sheets API** (APIs & Services → Library).
3. Create a **service account** → create a **JSON key** → save it as
   `credentials.json` in this folder.
4. Copy the `client_email` from that JSON and **share your sheet** with it (Editor).
5. Put your sheet's ID in `.env` as `GOOGLE_SHEET_ID` (the `<ID>` in
   `docs.google.com/spreadsheets/d/<ID>/edit`).

> **If your org blocks service-account keys** (`iam.disableServiceAccountKeyCreation`),
> either do the above under a **personal Google account**, or use OAuth (option B).

**B) OAuth (sign in as yourself).** No key file, no sheet sharing needed:

1. Create an **OAuth client ID** of type **Desktop app** (APIs & Services →
   Credentials) → download it as `oauth_client.json` in this folder.
2. Set `GOOGLE_SHEET_ID` in `.env`, then run `python sheets.py` — a browser opens
   once to authorize; the token caches to `authorized_user.json`.

**Verify the connection:**

```bash
python sheets.py          # appends a TEST row you can delete
```

---

## Run

```bash
python app.py             # → http://127.0.0.1:5000
```

Open the URL, drop in a receipt, and click **Extract & log**.

> **macOS note:** port 5000 is often used by AirPlay Receiver. The app honors a
> `PORT` env var — e.g. `PORT=5001 python app.py` → <http://127.0.0.1:5001>.

## Try it without API credits (mock mode)

To exercise the full flow (UI → categorizer → Sheets) without calling — or paying
for — the Claude API, enable the offline demo:

```bash
MOCK_EXTRACTION=1 python app.py
```

Every upload returns a sample receipt and logs it, so you can demo the app or test
your Sheets setup before adding credits. Mock mode is off by default.

## Customize categories

Edit [`categories.json`](categories.json) — add categories and vendor-keyword
rules with no code changes. Matching is case-insensitive substring; the **longest**
matching keyword wins (so `uber eats` beats `uber`). Test a match:

```bash
python categorizer.py "Trader Joe's #451"     # → Groceries (rule match)
```

## Test the pieces standalone

```bash
python agent.py path/to/receipt.jpg           # extract + categorize → JSON
python categorizer.py "Shell Oil"             # rule lookup only
python sheets.py                              # Sheets connectivity
```

---

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | — | Claude access (extraction + categorization) |
| `CLAUDE_MODEL` | — | `claude-opus-4-8` | Override the model |
| `GOOGLE_SHEET_ID` | for logging | — | Target sheet ID |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | one of | `credentials.json` | Service-account key path |
| `GOOGLE_OAUTH_CLIENT_FILE` | one of | `oauth_client.json` | OAuth client secret path |
| `GOOGLE_SHEET_WORKSHEET` | — | `Sheet1` | Worksheet/tab name |
| `GOOGLE_AUTH_MODE` | — | `auto` | `auto` \| `service_account` \| `oauth` |
| `MOCK_EXTRACTION` | — | off | `1` to use the offline sample receipt |
| `PORT` | — | `5000` | Flask port |
| `UPLOAD_DIR` | — | `uploads` | Where uploads are saved |

## Troubleshooting

- **"credit balance is too low"** — add credits at
  <https://console.anthropic.com/settings/billing>. Everything else works; only
  the live vision call needs credits. Use mock mode meanwhile.
- **"Permission denied" (Sheets)** — share the sheet with the service account's
  `client_email` as Editor, or authorize OAuth with an account that can edit it.
- **"Sheets API is not enabled"** — enable it in the *same* project the credentials
  belong to.

## Tech stack

Python · [Anthropic SDK](https://docs.anthropic.com) (Messages API + structured
outputs) · Flask · gspread + google-auth · python-dotenv
