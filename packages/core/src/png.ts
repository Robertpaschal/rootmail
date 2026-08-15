// A minimal PNG encoder and an RGB drawing surface, built on nothing but node's
// zlib.
//
// WHY HAND-ROLLED
// ---------------
// This exists to render live-at-open images (see live-image.ts), which means it
// runs inside the API container. That container is `node:22-alpine`, and the
// obvious library for the job — sharp — is a native module that isn't even
// resolvable from apps/api today. Adding a native image dependency to a musl
// image is exactly the kind of thing that builds fine locally and fails on
// deploy. A PNG writer is ~100 lines of zlib and CRC, so we own it instead and
// the image path has no native surface at all.
//
// The surface is deliberately small: opaque RGB, integer rectangles, and text
// from a bundled bitmap font. Everything is drawn at a supersampled scale and
// box-downsampled on the way out, which is what keeps edges smooth without a
// real rasterizer.

import { deflateSync } from "node:zlib";

export type RGB = readonly [number, number, number];

export function rgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// --- CRC32 (PNG chunk checksums) --------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// --- Drawing surface ---------------------------------------------------------

/** An opaque RGB raster. Coordinates are integers; out-of-bounds writes clip. */
export class Surface {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number, background: RGB = [255, 255, 255]) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 3);
    this.clear(background);
  }

  clear(color: RGB): void {
    for (let i = 0; i < this.data.length; i += 3) {
      this.data[i] = color[0];
      this.data[i + 1] = color[1];
      this.data[i + 2] = color[2];
    }
  }

  rect(x: number, y: number, w: number, h: number, color: RGB): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let py = y0; py < y1; py++) {
      let i = (py * this.width + x0) * 3;
      for (let px = x0; px < x1; px++) {
        this.data[i++] = color[0];
        this.data[i++] = color[1];
        this.data[i++] = color[2];
      }
    }
  }

  /** Rounded rectangle — corners are stepped, which the downsample smooths. */
  roundRect(x: number, y: number, w: number, h: number, r: number, color: RGB): void {
    const radius = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)));
    if (radius === 0) return this.rect(x, y, w, h, color);
    this.rect(x + radius, y, w - 2 * radius, h, color);
    this.rect(x, y + radius, radius, h - 2 * radius, color);
    this.rect(x + w - radius, y + radius, radius, h - 2 * radius, color);
    for (let dy = 0; dy < radius; dy++) {
      // Horizontal extent of the corner arc at this row.
      const dx = radius - Math.floor(Math.sqrt(radius * radius - (radius - dy - 0.5) ** 2) + 0.5);
      const inset = Math.max(0, dx);
      this.rect(x + inset, y + dy, w - 2 * inset, 1, color);
      this.rect(x + inset, y + h - dy - 1, w - 2 * inset, 1, color);
    }
  }

  /**
   * Box-downsample by an integer factor. Rendering at 3–4x and reducing is what
   * gives text and rounded corners smooth edges without a real rasterizer.
   */
  downsample(factor: number): Surface {
    if (factor <= 1) return this;
    const w = Math.floor(this.width / factor);
    const h = Math.floor(this.height / factor);
    const out = new Surface(w, h);
    const n = factor * factor;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let sy = 0; sy < factor; sy++) {
          let i = ((y * factor + sy) * this.width + x * factor) * 3;
          for (let sx = 0; sx < factor; sx++) {
            r += this.data[i++];
            g += this.data[i++];
            b += this.data[i++];
          }
        }
        const o = (y * w + x) * 3;
        out.data[o] = Math.round(r / n);
        out.data[o + 1] = Math.round(g / n);
        out.data[o + 2] = Math.round(b / n);
      }
    }
    return out;
  }

  toPng(): Buffer {
    return encodePng(this.width, this.height, this.data);
  }
}

// --- Encoder ------------------------------------------------------------------

/** Encode raw RGB bytes (width*height*3) as an 8-bit truecolor PNG. */
export function encodePng(width: number, height: number, rgbData: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type. Filter 0 (None) keeps this
  // simple; these images are flat color blocks, so deflate handles them well.
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgbData.buffer, rgbData.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
