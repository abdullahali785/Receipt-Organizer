"""Minimal, clean Flask web UI for the Receipt & Expense Organizer.

A single page: pick a receipt image/PDF, it previews, then on submit the file is
sent to /api/receipts, where Claude extracts the data, the expense is
categorized (rules first, Claude fallback), the row is appended to Google
Sheets, and the parsed info is rendered back on the page.

Run:
    python app.py                 # http://127.0.0.1:5000  (or set PORT)
"""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from werkzeug.utils import secure_filename

import sheets
from agent import (
    ExtractionError,
    SUPPORTED_EXTENSIONS,
    UnsupportedFileType,
    categorize,
    extract_receipt,
)

load_dotenv()

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 15 * 1024 * 1024  # 15 MB cap on uploads


# --------------------------------------------------------------------------- #
# Single-page UI
# --------------------------------------------------------------------------- #

PAGE_HTML = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt Organizer</title>
<style>
  :root {
    color-scheme: light dark;
    --bg:#f5f6f8; --glow:rgba(99,102,241,.10);
    --surface:#ffffff; --surface-2:#fbfbfd;
    --text:#111318; --muted:#6b7280; --faint:#9ca3af;
    --border:#eceef2; --border-strong:#dfe2e8;
    --accent:#5b5bf0; --accent-2:#7c3aed; --accent-ink:#ffffff; --accent-soft:rgba(91,91,240,.08);
    --ok-bg:#e7f7ee; --ok-ink:#15803d; --warn-bg:#fef4e0; --warn-ink:#b45309;
    --err-bg:#fdecec; --err-ink:#c02626; --chip-bg:#eef0ff; --chip-ink:#4338ca;
    --shadow:0 1px 2px rgba(16,18,24,.04), 0 12px 32px -12px rgba(16,18,24,.12);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#0a0c10; --glow:rgba(124,92,246,.14);
      --surface:#14171e; --surface-2:#171b23;
      --text:#e9ebef; --muted:#9aa1ad; --faint:#6b7280;
      --border:#232833; --border-strong:#2c323e;
      --accent:#7c8bff; --accent-2:#a78bfa; --accent-ink:#0b0d12; --accent-soft:rgba(124,139,255,.12);
      --ok-bg:#0f2a1c; --ok-ink:#7ee2a8; --warn-bg:#332809; --warn-ink:#fbd38d;
      --err-bg:#3a1717; --err-ink:#f7a8a8; --chip-bg:#1e2350; --chip-ink:#c7d2fe;
      --shadow:0 1px 2px rgba(0,0,0,.3), 0 18px 40px -16px rgba(0,0,0,.6);
    }
  }
  :root[data-theme="dark"] { color-scheme: dark; }
  * { box-sizing:border-box; }
  html { -webkit-text-size-adjust:100%; }
  body {
    margin:0; background:var(--bg); color:var(--text);
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    line-height:1.55; -webkit-font-smoothing:antialiased;
    background-image:radial-gradient(60% 40% at 50% -8%, var(--glow), transparent 70%);
    background-repeat:no-repeat;
  }
  .wrap { max-width:520px; margin:0 auto; padding:3rem 1.1rem 4rem; }

  header { text-align:center; margin-bottom:1.5rem; }
  .logo {
    width:44px; height:44px; margin:0 auto .7rem; border-radius:12px;
    display:grid; place-items:center; color:var(--accent-ink);
    background:linear-gradient(135deg,var(--accent),var(--accent-2));
    box-shadow:0 6px 16px -6px var(--accent);
  }
  .logo svg { width:24px; height:24px; }
  header h1 { font-size:1.5rem; font-weight:700; letter-spacing:-.02em; margin:0 0 .3rem; }
  header p { color:var(--muted); margin:0 auto; font-size:.95rem; max-width:38ch; }

  .card {
    background:var(--surface); border:1px solid var(--border);
    border-radius:18px; padding:1.15rem; box-shadow:var(--shadow);
  }
  .card + .card { margin-top:1rem; }

  .banner {
    display:flex; align-items:center; gap:.5rem;
    padding:.7rem .85rem; border-radius:12px; font-size:.9rem; font-weight:500;
  }
  .banner svg { width:16px; height:16px; flex:none; }
  .banner.ok{background:var(--ok-bg);color:var(--ok-ink);}
  .banner.error{background:var(--err-bg);color:var(--err-ink);}
  .banner.skipped{background:var(--surface-2);color:var(--muted);border:1px solid var(--border);}
  .banner a{color:inherit;font-weight:700;text-decoration:none;margin-left:auto;white-space:nowrap;}
  .banner a:hover{text-decoration:underline;}
  #notice:not(:empty){ margin-bottom:1rem; }

  /* Dropzone */
  .drop {
    display:block; position:relative; cursor:pointer; text-align:center;
    border:1.5px dashed var(--border-strong); border-radius:14px; padding:1.9rem 1rem;
    background:var(--surface-2); transition:border-color .18s,background .18s,transform .18s;
  }
  .drop:hover { border-color:var(--accent); }
  .drop.drag { border-color:var(--accent); background:var(--accent-soft); }
  .drop:focus-within { outline:2px solid var(--accent); outline-offset:2px; }
  .drop input { position:absolute; inset:0; opacity:0; cursor:pointer; }
  .drop .up-ico { width:34px; height:34px; margin:0 auto .6rem; color:var(--accent); }
  .drop-title { font-weight:600; font-size:.98rem; }
  .drop-title .link { color:var(--accent); }
  .drop-hint { color:var(--faint); font-size:.82rem; margin-top:.25rem; letter-spacing:.01em; }

  .drop-filled { display:none; align-items:center; gap:.85rem; text-align:left; }
  .drop.has-file .drop-empty { display:none; }
  .drop.has-file .drop-filled { display:flex; }
  .drop.has-file { padding:.9rem; border-style:solid; border-color:var(--border-strong); background:var(--surface); }
  .thumb {
    width:56px; height:56px; border-radius:10px; object-fit:cover;
    border:1px solid var(--border); background:var(--surface-2); flex:none;
  }
  .thumb.pdf { display:grid; place-items:center; color:var(--accent); font-weight:800; font-size:.72rem; }
  .fmeta { min-width:0; flex:1; }
  .fname { font-weight:600; font-size:.92rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .fsize { color:var(--faint); font-size:.8rem; }
  .change { color:var(--accent); font-size:.82rem; font-weight:600; flex:none; }

  button.submit {
    width:100%; margin-top:.9rem; padding:.8rem 1rem; font-size:1rem; font-weight:600;
    color:var(--accent-ink); border:none; border-radius:12px; cursor:pointer;
    background:linear-gradient(135deg,var(--accent),var(--accent-2));
    box-shadow:0 8px 20px -10px var(--accent); transition:transform .12s,opacity .15s,box-shadow .15s;
  }
  button.submit:hover:not(:disabled){ transform:translateY(-1px); }
  button.submit:active:not(:disabled){ transform:translateY(0); }
  button.submit:disabled{ opacity:.55; cursor:not-allowed; box-shadow:none; }
  button.submit:focus-visible{ outline:2px solid var(--accent); outline-offset:2px; }
  .spinner {
    width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;
    border-radius:50%;display:inline-block;vertical-align:-3px;margin-right:.5rem;
    animation:spin .6s linear infinite;
  }
  @keyframes spin { to { transform:rotate(360deg); } }
  #msg:not(:empty){ margin-top:.9rem; }

  /* Result */
  #result { display:none; }
  #result.show { display:block; animation:rise .28s ease both; }
  @keyframes rise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
  #result .banner { margin-bottom:1rem; }
  .rc-head { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; }
  .rc-vendor { font-size:1.15rem; font-weight:700; letter-spacing:-.01em; }
  .rc-date { color:var(--muted); font-size:.88rem; margin-top:.1rem; }
  .rc-total { font-size:2.3rem; font-weight:800; letter-spacing:-.03em; margin:.5rem 0 1rem; }
  .chip {
    display:inline-block; padding:.28rem .7rem; border-radius:999px; font-size:.82rem; font-weight:700;
    background:var(--chip-bg); color:var(--chip-ink); white-space:nowrap;
  }
  .chip .via { font-weight:500; opacity:.7; }
  .rc-grid { border-top:1px solid var(--border); }
  .row { display:flex; justify-content:space-between; gap:1rem; padding:.6rem 0; border-bottom:1px solid var(--border); }
  .row .k { color:var(--muted); font-size:.9rem; }
  .row .v { text-align:right; font-weight:600; font-size:.92rem; }
  .badge { display:inline-block; padding:.14rem .55rem; border-radius:999px; font-size:.74rem; font-weight:700; margin-left:.35rem; }
  .badge.review{background:var(--warn-bg);color:var(--warn-ink);}
  .badge.clean{background:var(--ok-bg);color:var(--ok-ink);}
  .items { margin-top:1.1rem; }
  .items h3 { font-size:.72rem; text-transform:uppercase; letter-spacing:.08em; color:var(--faint); margin:0 0 .3rem; }
  .li { display:flex; justify-content:space-between; gap:1rem; padding:.4rem 0; border-top:1px solid var(--border); font-size:.9rem; }
  .li .amt { font-variant-numeric:tabular-nums; color:var(--muted); }
  .muted { color:var(--muted); }

  footer { text-align:center; color:var(--faint); font-size:.8rem; margin-top:1.75rem; }

  @media (prefers-reduced-motion: reduce) { * { animation:none !important; transition:none !important; } }
</style>
</head>
<body>
  <main class="wrap">
    <header>
      <div class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 3v18l2-1.2L8 21l2-1.2L12 21l2-1.2L16 21l2-1.2L20 21V3l-2 1.2L16 3l-2 1.2L12 3l-2 1.2L8 3 6 4.2 4 3Z"/>
          <path d="M8 8h8M8 12h8M8 16h5"/>
        </svg>
      </div>
      <h1>Receipt Organizer</h1>
      <p>Upload a receipt — Claude reads the vendor, date, total, and items, categorizes it, and logs it to your Google Sheet.</p>
    </header>

    <div id="notice" aria-live="polite"></div>

    <section class="card">
      <form id="form">
        <label class="drop" id="drop">
          <input type="file" id="file" name="receipt" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf" required aria-label="Choose a receipt file">
          <div class="drop-empty">
            <svg class="up-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/>
              <path d="M12 3v13M7 8l5-5 5 5"/>
            </svg>
            <div class="drop-title">Drop a receipt, or <span class="link">browse</span></div>
            <div class="drop-hint">JPG · PNG · GIF · WEBP · PDF — up to 15 MB</div>
          </div>
          <div class="drop-filled">
            <img class="thumb" id="thumb" alt="Receipt preview">
            <div class="fmeta">
              <div class="fname" id="fname"></div>
              <div class="fsize" id="fsize"></div>
            </div>
            <span class="change">Change</span>
          </div>
        </label>
        <button type="submit" class="submit" id="submit" disabled>Extract &amp; log</button>
      </form>
      <div id="msg" aria-live="polite"></div>
    </section>

    <section class="card" id="result" aria-live="polite"></section>

    <footer>Rule-based + Claude categorization · logged to Google Sheets</footer>
  </main>

<script>
const SHEETS_OK = __SHEETS_OK__;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ICON = {
  ok:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  error:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>',
  skipped:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
};

function money(v, cur) {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (cur && /^[A-Za-z]{3}$/.test(cur)) {
    try { return new Intl.NumberFormat(undefined, {style:'currency', currency:cur.toUpperCase()}).format(n); } catch (e) {}
  }
  return n.toFixed(2) + (cur ? " " + cur : "");
}
function fmtSize(b) {
  return b < 1024 ? b + " B" : b < 1048576 ? Math.round(b/1024) + " KB" : (b/1048576).toFixed(1) + " MB";
}

if (!SHEETS_OK) {
  $("notice").innerHTML = '<div class="banner skipped">' + ICON.skipped +
    " Google Sheets isn't configured — receipts will be extracted but not logged.</div>";
}

const fileInput = $("file"), drop = $("drop"), submit = $("submit");

function showPreview(file) {
  if (!file) return;
  $("fname").textContent = file.name;
  $("fsize").textContent = fmtSize(file.size);
  const img = $("thumb");
  if (file.type.startsWith("image/")) {
    img.classList.remove("pdf"); img.textContent = "";
    const r = new FileReader();
    r.onload = e => { img.src = e.target.result; };
    r.readAsDataURL(file);
  } else {
    img.removeAttribute("src"); img.classList.add("pdf"); img.textContent = "PDF";
  }
  drop.classList.add("has-file");
  submit.disabled = false;
}

fileInput.addEventListener("change", () => showPreview(fileInput.files[0]));
["dragenter","dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); }));
["dragleave","dragend","drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("drag"); }));
drop.addEventListener("drop", e => { if (e.dataTransfer.files[0]) { fileInput.files = e.dataTransfer.files; showPreview(fileInput.files[0]); } });

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!fileInput.files[0]) return;
  submit.disabled = true;
  submit.innerHTML = '<span class="spinner"></span>Reading receipt…';
  $("msg").innerHTML = "";
  $("result").classList.remove("show");

  try {
    const fd = new FormData();
    fd.append("receipt", fileInput.files[0]);
    const res = await fetch("/api/receipts", { method: "POST", body: fd });
    const data = await res.json();
    if (!data.ok) {
      $("msg").innerHTML = '<div class="banner error">' + ICON.error + " " + esc(data.error) + "</div>";
    } else {
      renderResult(data);
    }
  } catch (err) {
    $("msg").innerHTML = '<div class="banner error">' + ICON.error + " Network error: " + esc(err.message) + "</div>";
  } finally {
    submit.disabled = false;
    submit.textContent = "Extract & log";
  }
});

function renderResult(d) {
  const r = d.receipt, sheet = d.sheet || {};
  const sheetBanner = sheet.status
    ? '<div class="banner ' + sheet.status + '">' + (ICON[sheet.status] || "") + " " + esc(sheet.message) +
      (sheet.url ? '<a href="' + esc(sheet.url) + '" target="_blank" rel="noopener">Open sheet ↗</a>' : "") + "</div>"
    : "";
  const badge = r.needs_review
    ? '<span class="badge review">Needs review</span>'
    : '<span class="badge clean">Looks good</span>';
  const items = (r.line_items && r.line_items.length)
    ? '<div class="items"><h3>Line items</h3>' + r.line_items.map(li =>
        '<div class="li"><span>' + esc(li.description) + '</span><span class="amt">' +
        (li.amount == null ? "" : Number(li.amount).toFixed(2)) + "</span></div>").join("") + "</div>"
    : "";

  $("result").innerHTML =
    sheetBanner +
    '<div class="rc-head">' +
      '<div><div class="rc-vendor">' + esc(r.vendor || "Unknown vendor") + "</div>" +
      '<div class="rc-date">' + esc(r.date || "Date not found") + "</div></div>" +
      '<span class="chip">' + esc(d.category) + ' <span class="via">· ' + esc(d.source) + "</span></span>" +
    "</div>" +
    '<div class="rc-total">' + money(r.total_amount, r.currency) + "</div>" +
    '<div class="rc-grid">' +
      '<div class="row"><span class="k">Confidence</span><span class="v">' + esc(r.confidence) + badge + "</span></div>" +
      (r.needs_review && r.review_reason ? '<div class="row"><span class="k">Why review</span><span class="v">' + esc(r.review_reason) + "</span></div>" : "") +
      '<div class="row"><span class="k">Source file</span><span class="v muted">' + esc(d.source_filename) + "</span></div>" +
    "</div>" +
    items;
  $("result").classList.add("show");
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
</script>
</body>
</html>
"""


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #

@app.get("/")
def index():
    return PAGE_HTML.replace("__SHEETS_OK__", "true" if sheets.is_configured() else "false")


@app.post("/api/receipts")
def api_receipts():
    file = request.files.get("receipt")
    if file is None or not file.filename:
        return jsonify(ok=False, error="No file was uploaded."), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        return jsonify(ok=False, error=f"Unsupported file type '{ext}'. Supported: {supported}."), 400

    original_filename = file.filename
    safe_name = secure_filename(original_filename) or f"receipt{ext}"
    stamped = f"{datetime.now():%Y%m%d-%H%M%S}-{safe_name}"
    saved_path = UPLOAD_DIR / stamped
    file.save(saved_path)

    # 1) Extract
    try:
        receipt = extract_receipt(saved_path)
    except UnsupportedFileType as exc:
        return jsonify(ok=False, error=str(exc)), 400
    except ExtractionError as exc:
        return jsonify(ok=False, error=f"Extraction failed: {exc}"), 502
    except Exception as exc:  # noqa: BLE001 - return a clean message for anything else
        return jsonify(ok=False, error=f"Unexpected error during extraction: {exc}"), 500

    # 2) Categorize (rules first, Claude fallback; never raises)
    result = categorize(receipt.vendor, receipt.line_items)

    # 3) Log to Sheets (best-effort — extraction is still returned if this fails)
    if sheets.is_configured():
        try:
            sheets.append_receipt(receipt, result.category, original_filename)
            sheet = {"status": "ok", "message": "Logged to your Google Sheet."}
            sheet_id = os.getenv("GOOGLE_SHEET_ID")
            if sheet_id:
                sheet["url"] = f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit"
        except sheets.SheetsError as exc:
            sheet = {"status": "error", "message": f"Extracted OK, but logging to Sheets failed: {exc}"}
    else:
        sheet = {"status": "skipped", "message": "Google Sheets not configured — not logged."}

    return jsonify(
        ok=True,
        receipt=receipt.model_dump(),
        category=result.category,
        source=result.source,
        source_filename=original_filename,
        sheet=sheet,
    )


@app.errorhandler(413)
def too_large(_exc):
    return jsonify(ok=False, error="That file is too large (limit is 15 MB)."), 413


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(debug=True, port=port)
