// Profile photos carry no metadata (docs/SPEC_V2.md §5.3, rule 6). The phone re-encodes the photo,
// strips any segment that is not image data, and checks the result before upload; photo-commit
// runs the same check on the server. Accepted: a JPEG (FF D8 FF) whose only APPn segment is a JFIF
// APP0, and no COM segment. EXIF and XMP (APP1), IPTC (APP13) and every other APPn are rejected.

export type JpegCheck = { ok: true } | { ok: false; reason: 'not_jpeg' | 'metadata' | 'truncated' };

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP15 = 0xef;
const COM = 0xfe;
const JFIF = [0x4a, 0x46, 0x49, 0x46, 0x00]; // "JFIF\0"

type Segment = { marker: number; start: number; end: number };

function isStandalone(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

function isJfifApp0(bytes: Uint8Array, seg: Segment): boolean {
  return JFIF.every((b, i) => bytes[seg.start + 4 + i] === b);
}

// Every marker segment of the file, including those after scan data. null if malformed.
function segments(bytes: Uint8Array): Segment[] | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return null;
  const out: Segment[] = [];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    while (bytes[i] === 0xff) i++; // fill bytes
    const marker = bytes[i];
    if (marker === undefined) return null;
    const start = i - 1;
    i++;
    if (marker === EOI) return out;
    if (isStandalone(marker)) continue;
    const hi = bytes[i];
    const lo = bytes[i + 1];
    if (hi === undefined || lo === undefined) return null;
    const length = (hi << 8) | lo;
    if (length < 2 || i + length > bytes.length) return null;
    out.push({ marker, start, end: i + length });
    i += length;
    if (marker === SOS) {
      // Entropy-coded data: runs until a marker that is neither stuffing (FF 00) nor a restart.
      while (i < bytes.length - 1) {
        if (bytes[i] === 0xff) {
          const next = bytes[i + 1] ?? 0;
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) break;
        }
        i++;
      }
      if (i >= bytes.length - 1) return null;
    }
  }
  return null;
}

function isMetadata(bytes: Uint8Array, seg: Segment): boolean {
  if (seg.marker === COM) return true;
  if (seg.marker === APP0) return !isJfifApp0(bytes, seg);
  return seg.marker > APP0 && seg.marker <= APP15;
}

export function inspectJpeg(bytes: Uint8Array): JpegCheck {
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== SOI || bytes[2] !== 0xff) {
    return { ok: false, reason: 'not_jpeg' };
  }
  const segs = segments(bytes);
  if (!segs) return { ok: false, reason: 'truncated' };
  return segs.some((s) => isMetadata(bytes, s)) ? { ok: false, reason: 'metadata' } : { ok: true };
}

// Drops every metadata segment (the phone's safety net after re-encoding). Returns null if the
// file is not a well-formed JPEG.
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  const segs = segments(bytes);
  if (!segs) return null;
  const drop = segs.filter((s) => isMetadata(bytes, s));
  if (drop.length === 0) return bytes;
  const parts: Uint8Array[] = [];
  let from = 0;
  for (const s of drop) {
    parts.push(bytes.subarray(from, s.start));
    from = s.end;
  }
  parts.push(bytes.subarray(from));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// expo-image-manipulator returns the re-encoded file as base64.
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let at = 0;
  for (const ch of clean) {
    value = (value << 6) | BASE64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (value >> bits) & 0xff;
    }
  }
  return out.subarray(0, at);
}

export type PreparedPhoto =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: 'not_jpeg' | 'metadata' | 'truncated' | 'too_large' };

// The phone's last step before uploading: decode the re-encoded file, strip anything left that is
// not image data, then run the same check photo-commit runs. Nothing is uploaded unless this passes.
export function preparePhotoUpload(base64: string, maxBytes: number): PreparedPhoto {
  const bytes = base64ToBytes(base64);
  const check = inspectJpeg(bytes);
  if (!check.ok && check.reason === 'not_jpeg') return check;
  const clean = stripJpegMetadata(bytes);
  if (!clean) return { ok: false, reason: 'truncated' };
  const final = inspectJpeg(clean);
  if (!final.ok) return final;
  if (clean.length > maxBytes) return { ok: false, reason: 'too_large' };
  return { ok: true, bytes: clean };
}
