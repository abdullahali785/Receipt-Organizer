import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { Receipt } from '@/db/receipts';
import { csvFileName, receiptsToCsv } from '@/lib/csv';

/** Writes the receipts to a CSV in the cache folder and opens the share sheet. */
export async function shareReceiptsCsv(receipts: readonly Receipt[]) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  const file = new File(Paths.cache, csvFileName());
  file.create({ overwrite: true });
  file.write(receiptsToCsv(receipts));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Export receipts',
  });
}
