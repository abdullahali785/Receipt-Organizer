/** Local receipt storage (expo-sqlite). The phone is the only copy of the data.
 *
 * A receipt starts as a `draft` right after extraction and becomes `saved`
 * once the user confirms it on the Review screen. */
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Confidence, ExtractedReceipt, LineItem } from '@/api/schemas';
import { deleteImage } from '@/lib/image';
import type { ReviewedReceipt } from '@/lib/review';

export const DB_NAME = 'receipts.db';
const DATABASE_VERSION = 1;

export type Receipt = {
  id: string;
  status: 'draft' | 'saved';
  vendor: string | null;
  date: string | null;
  totalAmount: number | null;
  currency: string | null;
  category: string;
  categorySource: string;
  lineItems: LineItem[];
  confidence: Confidence;
  needsReview: boolean;
  reviewReason: string | null;
  imageUri: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReceiptRow = {
  id: string;
  status: 'draft' | 'saved';
  vendor: string | null;
  date: string | null;
  total_amount: number | null;
  currency: string | null;
  category: string;
  category_source: string;
  line_items: string;
  confidence: Confidence;
  needs_review: number;
  review_reason: string | null;
  image_uri: string | null;
  created_at: string;
  updated_at: string;
};

function fromRow(row: ReceiptRow): Receipt {
  return {
    id: row.id,
    status: row.status,
    vendor: row.vendor,
    date: row.date,
    totalAmount: row.total_amount,
    currency: row.currency,
    category: row.category,
    categorySource: row.category_source,
    lineItems: JSON.parse(row.line_items) as LineItem[],
    confidence: row.confidence,
    needsReview: row.needs_review === 1,
    reviewReason: row.review_reason,
    imageUri: row.image_uri,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function migrate(db: SQLiteDatabase) {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = result?.user_version ?? 0;

  if (version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY NOT NULL,
        status TEXT NOT NULL,
        vendor TEXT,
        date TEXT,
        total_amount REAL,
        currency TEXT,
        category TEXT NOT NULL,
        category_source TEXT NOT NULL,
        line_items TEXT NOT NULL DEFAULT '[]',
        confidence TEXT NOT NULL,
        needs_review INTEGER NOT NULL,
        review_reason TEXT,
        image_uri TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS receipts_status_date ON receipts (status, date);
    `);
  }
  if (version < DATABASE_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }

  await discardDrafts(db);
}

/** Drafts left behind when the app closed mid-review are never shown again. */
async function discardDrafts(db: SQLiteDatabase) {
  const drafts = await db.getAllAsync<{ image_uri: string | null }>(
    "SELECT image_uri FROM receipts WHERE status = 'draft'",
  );
  drafts.forEach((d) => deleteImage(d.image_uri));
  await db.runAsync("DELETE FROM receipts WHERE status = 'draft'");
}

export async function insertDraft(
  db: SQLiteDatabase,
  id: string,
  r: ExtractedReceipt,
  imageUri: string,
) {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO receipts (id, status, vendor, date, total_amount, currency, category,
       category_source, line_items, confidence, needs_review, review_reason, image_uri,
       created_at, updated_at)
     VALUES (?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    r.vendor,
    r.date,
    r.total_amount,
    r.currency ? r.currency.toUpperCase() : null,
    r.category,
    r.category_source,
    JSON.stringify(r.line_items),
    r.confidence,
    r.needs_review ? 1 : 0,
    r.review_reason,
    imageUri,
    now,
    now,
  );
}

export async function getReceipt(db: SQLiteDatabase, id: string): Promise<Receipt | null> {
  const row = await db.getFirstAsync<ReceiptRow>('SELECT * FROM receipts WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export async function saveReceipt(
  db: SQLiteDatabase,
  id: string,
  fields: ReviewedReceipt,
  originalCategory: string,
) {
  await db.runAsync(
    `UPDATE receipts SET status = 'saved', vendor = ?, date = ?, total_amount = ?, currency = ?,
       category = ?,
       category_source = CASE WHEN ? = ? THEN category_source ELSE 'user' END,
       updated_at = ?
     WHERE id = ?`,
    fields.vendor,
    fields.date,
    fields.totalAmount,
    fields.currency,
    fields.category,
    fields.category,
    originalCategory,
    new Date().toISOString(),
    id,
  );
}

export async function deleteReceipt(db: SQLiteDatabase, id: string) {
  const row = await db.getFirstAsync<{ image_uri: string | null }>(
    'SELECT image_uri FROM receipts WHERE id = ?',
    id,
  );
  await db.runAsync('DELETE FROM receipts WHERE id = ?', id);
  deleteImage(row?.image_uri ?? null);
}

export async function listSavedReceipts(db: SQLiteDatabase): Promise<Receipt[]> {
  const rows = await db.getAllAsync<ReceiptRow>(
    "SELECT * FROM receipts WHERE status = 'saved' ORDER BY date DESC, created_at DESC",
  );
  return rows.map(fromRow);
}
