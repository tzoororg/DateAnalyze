// Minimal EXIF reader: pulls { date, lat, lon } out of a JPEG File/Blob by
// walking the APP1/TIFF segment directly — no dependency. Tolerant by design:
// any missing or malformed field just comes back undefined so the caller can
// fall back (e.g. to file.lastModified).
// ponytail: reads only the first 128KB (EXIF lives at the file head); bump the
// slice if a vendor is ever found burying it deeper.

export async function readExif(file) {
  const view = new DataView(await file.slice(0, 131072).arrayBuffer());
  if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return {}; // not a JPEG
  let off = 2;
  while (off + 4 < view.byteLength) {
    if (view.getUint8(off) !== 0xFF) break;
    const marker = view.getUint8(off + 1);
    if (marker === 0xDA) break;                                       // start of scan
    const size = view.getUint16(off + 2);
    if (marker === 0xE1 && view.getUint32(off + 4) === 0x45786966) {  // "Exif"
      return parseTiff(view, off + 10);
    }
    off += 2 + size;
  }
  return {};
}

function parseTiff(view, start) {
  if (start + 8 > view.byteLength) return {};
  const little = view.getUint16(start) === 0x4949;                   // "II" vs "MM"
  const u16 = o => view.getUint16(o, little);
  const u32 = o => view.getUint32(o, little);
  const out = {};
  let exifPtr, gpsPtr;
  for (const e of entries(view, start + u32(start + 4), u16, u32)) {
    if (e.tag === 0x8769) exifPtr = start + u32(e.valOff);           // Exif sub-IFD
    else if (e.tag === 0x8825) gpsPtr = start + u32(e.valOff);       // GPS sub-IFD
  }
  if (exifPtr) for (const e of entries(view, exifPtr, u16, u32)) {
    // DateTimeOriginal / DateTimeDigitized — ASCII "YYYY:MM:DD HH:MM:SS"
    if ((e.tag === 0x9003 || e.tag === 0x9004) && !out.date) {
      out.date = asciiDate(view, start + u32(e.valOff), e.count);
    }
  }
  if (gpsPtr) {
    let lat, lon, latRef = "N", lonRef = "E";
    for (const e of entries(view, gpsPtr, u16, u32)) {
      if (e.tag === 0x0001) latRef = String.fromCharCode(view.getUint8(e.valOff));
      else if (e.tag === 0x0003) lonRef = String.fromCharCode(view.getUint8(e.valOff));
      else if (e.tag === 0x0002) lat = dms(view, start + u32(e.valOff), little);
      else if (e.tag === 0x0004) lon = dms(view, start + u32(e.valOff), little);
    }
    if (lat != null && lon != null) {
      out.lat = latRef === "S" ? -lat : lat;
      out.lon = lonRef === "W" ? -lon : lon;
    }
  }
  return out;
}

// Each IFD is a uint16 count followed by 12-byte entries:
// tag(2) type(2) count(4) value-or-offset(4).
function* entries(view, ifd, u16, u32) {
  if (ifd + 2 > view.byteLength) return;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > view.byteLength) return;
    yield { tag: u16(e), type: u16(e + 2), count: u32(e + 4), valOff: e + 8 };
  }
}

function asciiDate(view, at, count) {
  let s = "";
  for (let i = 0; i < count - 1 && at + i < view.byteLength; i++) {
    s += String.fromCharCode(view.getUint8(at + i));
  }
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

// GPS coordinate = 3 rationals (degrees, minutes, seconds), each num/den u32.
function dms(view, at, little) {
  const r = o => {
    const den = view.getUint32(o + 4, little);
    return den ? view.getUint32(o, little) / den : 0;
  };
  return r(at) + r(at + 8) / 60 + r(at + 16) / 3600;
}
