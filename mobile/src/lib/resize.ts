import { MAX_IMAGE_EDGE } from '@/constants/config';

/** Resize target that caps the long edge at `maxEdge`, keeping aspect ratio
 * (one side null), or null when the image is already small enough. */
export function resizeTarget(
  width: number,
  height: number,
  maxEdge: number = MAX_IMAGE_EDGE,
): { width: number | null; height: number | null } | null {
  if (Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge, height: null } : { width: null, height: maxEdge };
}
