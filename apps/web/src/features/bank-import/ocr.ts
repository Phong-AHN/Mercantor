import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';

/**
 * Bundled with the deployment (`apps/web/tessdata/`, force-included in
 * `next.config.ts`'s `outputFileTracingIncludes`) rather than left to
 * tesseract.js's default of fetching each language's ~4-11MB trained-data
 * file from a CDN on first use. A cold serverless invocation doing that
 * network fetch before OCR can even start is exactly the kind of latency
 * this app already spent a whole pass eliminating - see RUNBOOK.md's
 * region entry. `gzip: true` (the default) matches the `.traineddata.gz`
 * files as downloaded, no local decompression step needed.
 *
 * Read-only - this sits inside the deployed function bundle. `cachePath`
 * below is deliberately a *different*, writable directory: tesseract.js
 * decompresses/caches the language data there, and on Vercel only `/tmp`
 * is writable at runtime. Pointing `cachePath` at this same read-only
 * directory worked locally (a real filesystem, writable) and would have
 * crashed the first real request in production - caught by actually
 * running the pipeline end to end before shipping, not just building it.
 */
const TESSDATA_PATH = path.join(process.cwd(), 'tessdata');
const CACHE_PATH = path.join(os.tmpdir(), 'tesseract-cache');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export class ImageTooLargeError extends Error {
  constructor() {
    super('That image is too large (max 10MB). Screenshots are already well under this.');
    this.name = 'ImageTooLargeError';
  }
}

/**
 * Grayscale + contrast normalization + upscaling. VietinBank's screenshot
 * has a gradient blue header (irrelevant, OCR mangles it either way) but
 * the transaction rows themselves are plain black-on-white at a fairly
 * small point size - this is what actually moves OCR accuracy for those
 * rows, not the header.
 */
async function preprocess(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer).rotate(); // respects a phone screenshot's EXIF orientation
  const metadata = await image.metadata();
  const width = metadata.width ?? 1000;
  // Upscale small screenshots; never shrink a large one - more pixels only
  // help small text, and shrinking a 3x-density phone screenshot would hurt.
  const targetWidth = Math.max(width, 1600);

  return image
    .resize({ width: targetWidth, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .toBuffer();
}

/**
 * Runs OCR against one bank-app screenshot and returns the raw text -
 * `parseVietinbankOcrText` in `@relay/core` turns that into structured
 * rows. Kept as a thin, single-purpose wrapper so the parsing logic itself
 * (the part worth unit testing) never has to import a Node-only OCR engine.
 */
export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new ImageTooLargeError();

  const processed = await preprocess(buffer);
  const worker = await Tesseract.createWorker(['vie', 'eng'], Tesseract.OEM.LSTM_ONLY, {
    langPath: TESSDATA_PATH,
    cachePath: CACHE_PATH,
  });
  try {
    const { data } = await worker.recognize(processed);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
