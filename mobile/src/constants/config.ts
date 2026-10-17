export const DEFAULT_API_URL = 'https://receipt-organizer-api.onrender.com';

// Claude reads images up to 2576 px on the long edge; anything larger only
// costs upload time. JPEG re-encoding also converts iPhone HEIC photos.
export const MAX_IMAGE_EDGE = 2576;
export const JPEG_QUALITY = 0.8;

// The free-tier server can take ~1 min to wake up, plus 10-30 s to extract.
export const EXTRACT_TIMEOUT_MS = 120_000;
export const DEFAULT_TIMEOUT_MS = 70_000;
