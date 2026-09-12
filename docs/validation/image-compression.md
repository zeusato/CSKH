# Automatic image compression — 2026-09-12

## Rule and integration

- Input up to and including 300 × 1024 bytes is kept byte-for-byte unchanged.
- Larger files go through a local Web Worker before attachment metadata is inserted or bytes are uploaded. Both ticket creation and adding images to existing tickets use the same upload helper.
- Preserve original decoded dimensions: no resize or cropping. Preserve orientation using the browser's EXIF-aware decoder.
- For PNG, compare lossless PNG re-encoding and real lossless WebP (jSquash/libwebp, lossless=1, near_lossless=100, exact=1, quality=25, method=0). In lossless mode this quality parameter controls compression effort, not visual quality.
- Also try native WebP qualities 95%, 92%, 88%. Decode candidates and apply conservative sampled pixel checks: PSNR >= 38 dB, mean absolute RGB error at detected edges <= 5, sampled alpha unchanged. This is a quality guard, not a perceptual guarantee/OCR test.
- Use the smallest passing candidate that saves at least 5%. Prefer a lossless candidate if it is within 20% of that smallest file.
- Do not force the output below 300 KB. Keep the original if compression is unhelpful or unsupported. APNG/animated WebP remain unchanged; images over 16 megapixels or either side over 16,000 pixels fall back to the original to bound memory use. Worker timeout is 15 seconds.
- Process selected images sequentially; cache the result per File so an upload retry does not recompress it. UI distinguishes optimizing/uploading and reports stored size/savings for newly created ticket images.
- Store only the chosen file, with matching MIME type, extension and actual byte count. Existing files and bucket/RLS policies are unchanged.

The small worker and its codec/WASM load on demand from the application host; image bytes are not sent to another compression service. Pinned dependency: `@jsquash/webp` 1.5.0; npm audit reported zero vulnerabilities at installation. Browser APIs can normalize source color profiles/metadata during decode/re-encode; lossless here means preserving the decoded pixels.

## Validation

26 tests passed, including threshold boundaries, worker timeout/original fallback, same-File retry cache, animation bypass, quality rejection, lossless preference and exact agreement between uploaded bytes and attachment metadata. Build and public-bundle privileged-key scan passed.

Production browser harness (synthetic data, no Supabase upload/account creation):

| Sample | Input bytes | Output bytes | Dimensions | Compression time | Pixel comparison |
|---|---:|---:|---|---:|---|
| PNG text screenshot with noise | 2,542,199 | 1,680,948 | 1920 × 1200 | 4,544 ms | Max RGB/alpha error 0 |
| Long PNG screenshot | 5,921,106 | 3,808,830 | 900 × 5000 | 9,533 ms | Max RGB/alpha error 0 |
| Transparent PNG | 961,267 | 627,320 | 1200 × 800 | 1,911 ms | Max RGB/alpha error 0 |
| JPEG sample | 1,076,938 | 254,450 | 1920 × 1200 | 3,159 ms | Passed quality gate; max RGB error 32, alpha error 0 |

Timings and savings are illustrative, not a guarantee for real screenshots or other machines. PNG text crop inspected at 100%. Actual browser PDF exporter embedded the compressed WebP and produced a 1,668,422-byte PDF. Metadata/upload orchestration uses a mocked transport in tests; real business images were not modified.

Sources: [OffscreenCanvas convertToBlob](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/convertToBlob), [jSquash source](https://github.com/jamsinclair/jSquash).
