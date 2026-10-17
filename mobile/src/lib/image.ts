import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { JPEG_QUALITY } from '@/constants/config';

import { resizeTarget } from './resize';

const receiptsDir = () => new Directory(Paths.document, 'receipts');

/** Downscale + re-encode a picked photo as JPEG (which also converts HEIC),
 * and keep it in app storage as `receipts/<id>.jpg` so the record can show it. */
export async function prepareReceiptImage(
  asset: { uri: string; width: number; height: number },
  id: string,
): Promise<File> {
  const context = ImageManipulator.manipulate(asset.uri);
  const target = resizeTarget(asset.width, asset.height);
  if (target) context.resize(target);
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });

  const dir = receiptsDir();
  dir.create({ idempotent: true, intermediates: true });
  const dest = new File(dir, `${id}.jpg`);
  await new File(saved.uri).copy(dest, { overwrite: true });
  return dest;
}

export function deleteImage(uri: string | null) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best-effort cleanup; a leftover image is harmless.
  }
}
