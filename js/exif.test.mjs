// Self-check for exif.js — run: node js/exif.test.mjs
// Builds a minimal big-endian JPEG/EXIF buffer with a DateTimeOriginal in the
// Exif sub-IFD, then asserts readExif() recovers it. Exercises the full
// segment walk + IFD0 -> sub-IFD traversal + ASCII date parse. No framework.
import assert from "node:assert";
import { readExif } from "./exif.js";

function buildJpeg() {
  const tiff = [];
  const w8 = b => tiff.push(b & 0xff);
  const w16 = v => { w8(v >> 8); w8(v); };
  const w32 = v => { w8(v >> 24); w8(v >> 16); w8(v >> 8); w8(v); };
  // Offsets below are TIFF-relative and hand-checked to line up.
  w8(0x4D); w8(0x4D); w16(0x002A); w32(8);          // "MM", magic, IFD0 @8
  w16(1);                                            // IFD0: 1 entry           @8
  w16(0x8769); w16(4); w32(1); w32(26);             // ExifIFDPointer -> @26    @10
  w32(0);                                            // next IFD = 0            @22
  w16(1);                                            // Exif IFD: 1 entry       @26
  w16(0x9003); w16(2); w32(20); w32(44);            // DateTimeOriginal -> @44  @28
  w32(0);                                            // next IFD = 0            @40
  for (const ch of "2021:06:15 09:30:00\0") w8(ch.charCodeAt(0)); // ascii[20]  @44

  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];   // "Exif\0\0" + TIFF
  const size = app1.length + 2;
  const jpeg = [0xFF, 0xD8, 0xFF, 0xE1, size >> 8, size & 0xff, ...app1, 0xFF, 0xD9];
  return new Blob([new Uint8Array(jpeg)]);
}

const r = await readExif(buildJpeg());
assert.strictEqual(r.date, "2021-06-15", `date parse failed: ${JSON.stringify(r)}`);

// Garbage / non-JPEG returns {} rather than throwing.
assert.deepStrictEqual(await readExif(new Blob([new Uint8Array([1, 2, 3, 4])])), {});

console.log("exif.js ok:", r);
