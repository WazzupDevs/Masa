import { describe, expect, it } from 'vitest';

import {
  base64ToBytes,
  inspectJpeg,
  preparePhotoUpload,
  stripJpegMetadata,
} from './jpegMetadata.ts';

// Minimal JPEG builder: SOI, the given segments, a scan with entropy data, EOI.
function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...payload];
}
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const JFIF_APP0 = segment(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const EXIF_APP1 = segment(0xe1, [...ascii('Exif'), 0, 0, ...ascii('GPS 41.0,28.6')]);
const XMP_APP1 = segment(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii('<x/>')]);
const IPTC_APP13 = segment(0xed, ascii('Photoshop 3.0'));
const COMMENT = segment(0xfe, ascii('taken at home'));
const DQT = segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]);
const SCAN = [...segment(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];

function jpeg(...segs: number[][]): Uint8Array {
  return new Uint8Array([0xff, 0xd8, ...segs.flat(), ...SCAN, 0xff, 0xd9]);
}

describe('inspectJpeg', () => {
  it('accepts a clean JFIF', () => {
    expect(inspectJpeg(jpeg(JFIF_APP0, DQT))).toEqual({ ok: true });
    expect(inspectJpeg(jpeg(DQT))).toEqual({ ok: true });
  });

  it('rejects EXIF, XMP, IPTC, other APPn and comments', () => {
    for (const seg of [EXIF_APP1, XMP_APP1, IPTC_APP13, COMMENT, segment(0xe2, [1, 2, 3])]) {
      expect(inspectJpeg(jpeg(JFIF_APP0, seg, DQT))).toEqual({ ok: false, reason: 'metadata' });
    }
  });

  it('rejects an APP0 that is not JFIF (e.g. a JFXX thumbnail)', () => {
    expect(inspectJpeg(jpeg(segment(0xe0, [...ascii('JFXX'), 0, 0x10])))).toEqual({
      ok: false,
      reason: 'metadata',
    });
  });

  it('finds metadata placed after the scan data', () => {
    const tail = new Uint8Array([0xff, 0xd8, ...DQT, ...SCAN, ...EXIF_APP1, 0xff, 0xd9]);
    expect(inspectJpeg(tail)).toEqual({ ok: false, reason: 'metadata' });
  });

  it('rejects non-JPEG and truncated files', () => {
    expect(inspectJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toEqual({
      ok: false,
      reason: 'not_jpeg',
    });
    const cut = jpeg(JFIF_APP0, DQT).subarray(0, 12);
    expect(inspectJpeg(cut)).toEqual({ ok: false, reason: 'truncated' });
  });
});

describe('stripJpegMetadata', () => {
  it('removes every metadata segment and leaves image data intact', () => {
    const dirty = jpeg(JFIF_APP0, EXIF_APP1, XMP_APP1, IPTC_APP13, COMMENT, DQT);
    const clean = stripJpegMetadata(dirty);
    expect(clean).not.toBeNull();
    expect(inspectJpeg(clean ?? new Uint8Array())).toEqual({ ok: true });
    expect([...(clean ?? [])]).toEqual([...jpeg(JFIF_APP0, DQT)]);
  });

  it('returns a clean file unchanged and refuses malformed ones', () => {
    const clean = jpeg(JFIF_APP0, DQT);
    expect(stripJpegMetadata(clean)).toBe(clean);
    expect(stripJpegMetadata(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('base64ToBytes', () => {
  it('decodes standard base64 with padding', () => {
    expect([...base64ToBytes('/9j/4A==')]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect([...base64ToBytes('TWFu')]).toEqual([77, 97, 110]);
    expect([...base64ToBytes('TWE=')]).toEqual([77, 97]);
  });
});

describe('preparePhotoUpload (the phone, before upload)', () => {
  const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

  it('strips EXIF and GPS left in a re-encoded file, and the result passes the server check', () => {
    const prepared = preparePhotoUpload(toBase64(jpeg(JFIF_APP0, EXIF_APP1, DQT)), 300 * 1024);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(inspectJpeg(prepared.bytes)).toEqual({ ok: true });
    expect(Buffer.from(prepared.bytes).includes(Buffer.from('GPS'))).toBe(false);
  });

  it('passes a clean file through unchanged', () => {
    const clean = jpeg(JFIF_APP0, DQT);
    const prepared = preparePhotoUpload(toBase64(clean), 300 * 1024);
    expect(prepared.ok && [...prepared.bytes]).toEqual([...clean]);
  });

  it('refuses non-JPEG, broken and oversized files', () => {
    expect(preparePhotoUpload(toBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 1000)).toEqual({
      ok: false,
      reason: 'not_jpeg',
    });
    expect(preparePhotoUpload(toBase64(jpeg(DQT).subarray(0, 12)), 1000)).toEqual({
      ok: false,
      reason: 'truncated',
    });
    expect(preparePhotoUpload(toBase64(jpeg(JFIF_APP0, DQT)), 50)).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });
});
