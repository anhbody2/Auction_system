# Image upload

Sellers upload item images from their device. Typed image URLs are no longer accepted (SRS: Customer -
Create Auction, Req-1, Req-2). Code: be/src/lib/images.ts, be/src/routes/uploads.ts,
fe/src/components/ImageUpload.tsx.

## API

`POST /api/uploads`, signed in, `multipart/form-data` with one file in the field `image`.

| Case | Response |
|---|---|
| JPEG, PNG or WebP of 5 MB or less | 201, stored unchanged |
| JPEG, PNG or WebP over 5 MB, up to 20 MB | 201, resized so the stored file is 5 MB or less; `resized: true` |
| Over 20 MB (hard cap) | 413 "Image must be 20 MB or smaller"; multer stops reading at the cap |
| Anything else (text, GIF, a text file named .png) | 400 "Only JPEG, PNG and WebP images are accepted" |
| No file | 400 "Choose an image to upload" |
| Not signed in | 401; sign-in is checked before the body is read |

The 201 body is `{ url, bytes, originalBytes, width, height, resized }`.

The type is decided from the file's bytes (sharp reads the header). The file name and MIME type the
client sends are ignored.

## How the resize works

`fitImage(buffer, limit = 5 MB)`:

1. If the image is at or under the limit, it is returned byte for byte.
2. Otherwise it is re-encoded **in its own format**, with EXIF rotation applied:
   - JPEG and WebP: first at the original size with quality 85, then 70, then 55;
   - PNG is lossless, so only the size step below helps (compression level 9).
3. If that is still too big, the long edge is reduced to 80% (the aspect ratio is kept) and step 2 repeats.
4. It stops at the first encoding that fits. If the long edge would drop under 320 px, the upload is
   refused with "Image could not be reduced below 5 MB". With the 20 MB cap this does not happen in practice.

Example: a 12 MB 2600x1600 PNG of noise ends up about 2080x1280 and under 5 MB; a photo-like JPEG usually
fits after the first quality step at full size.

## Storage

- Files are written to `UPLOAD_DIR`, by default `be/uploads/` (gitignored). The e2e server uses
  `be/uploads/e2e`; the vitest suites use a temp folder.
- Name on disk: 32 random hex characters plus `.jpg` / `.png` / `.webp`. The client's filename is never used.
- Served at `/uploads/<name>` by the API (Vite proxies `/uploads` in dev), with `X-Content-Type-Options: nosniff`
  and a 30-day immutable cache, since a name never gets new content. Unknown names return 404.
- `isStoredUpload(url)` accepts only `/uploads/<32 hex>.<ext>` URLs whose file exists. `POST /api/auctions`
  uses it for `imageUrl` ("Upload the image instead of linking to it"); gds-001 uses it for goods images.
- Files are not deleted when unused (nothing cleans up abandoned uploads yet).

## UI

`ImageUpload` (label, name, value: string[], onChange, max): a file input limited to JPEG/PNG/WebP. Each
picked file is uploaded at once and shown as a preview with a Remove button. Files over 20 MB are refused
in the browser before uploading. A resized file shows "Resized from X MB to Y MB to fit the 5 MB limit".
For now it replaces the 'Image URL' field on the create-auction form; sell-003 moves images to goods.

## Tests

- be/tests/upload.resize.test.ts: unchanged under 5 MB; PNG and JPEG over 5 MB end at or under 5 MB with the
  same aspect ratio and format; other limits; non-images refused
- be/tests/upload.api.test.ts: 201 small/large, 400 text, 413 over the cap, 401, served as image/png,
  random names, auction imageUrl rules
- e2e/upl-001-image-upload.spec.ts: file input, preview, auction page image, resize note
