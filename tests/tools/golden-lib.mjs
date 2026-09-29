// ============================================================================
// tests/tools/golden-lib.mjs — 黄金基线共享库（PNG 解码 + 感知哈希）
// ----------------------------------------------------------------------------
// 零依赖：PNG 解码用 node:zlib inflate + 逐行反滤波（IHDR/IDAT/IEND，8-bit
// colorType 2/6，非隔行）。dHash（9×8 相邻差分）+ aHash（8×8 均值）各 64 位。
// 供 golden-render.mjs（写基线）与 golden-diff.mjs（比对）共用。
// ============================================================================

import { inflateSync, deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * 解码 PNG（8-bit RGB/RGBA，非隔行）→ { width, height, channels, data }。
 * @param {Buffer|Uint8Array} buf
 */
export function decodePng(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for (let i = 0; i < 8; i++) {
    if (b[i] !== PNG_SIG[i]) throw new Error("不是 PNG（签名不匹配）");
  }
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < b.length) {
    const len = readU32(b, off);
    const tag = String.fromCharCode(b[off + 4], b[off + 5], b[off + 6], b[off + 7]);
    const dataOff = off + 8;
    if (tag === "IHDR") {
      width = readU32(b, dataOff);
      height = readU32(b, dataOff + 4);
      bitDepth = b[dataOff + 8];
      colorType = b[dataOff + 9];
      interlace = b[dataOff + 12];
    } else if (tag === "IDAT") {
      idat.push(b.subarray(dataOff, dataOff + len));
    } else if (tag === "IEND") {
      break;
    }
    off = dataOff + len + 4; // + CRC
  }
  if (bitDepth !== 8) throw new Error(`仅支持 8-bit PNG（实际 ${bitDepth}）`);
  if (interlace !== 0) throw new Error("不支持隔行 PNG");
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 0 ? 1 : null;
  if (!channels) throw new Error(`不支持的 PNG colorType ${colorType}`);

  const raw = inflateSync(Buffer.from(concat(idat)));
  const stride = width * channels;
  const out = new Uint8Array(stride * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const cur = raw[p + x];
      const a = x >= channels ? row[x - channels] : 0;
      const bb = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let val;
      switch (filter) {
        case 0: val = cur; break;
        case 1: val = cur + a; break;
        case 2: val = cur + bb; break;
        case 3: val = cur + ((a + bb) >> 1); break;
        case 4: val = cur + paeth(a, bb, c); break;
        default: throw new Error(`未知 PNG 滤波类型 ${filter}`);
      }
      row[x] = val & 0xff;
    }
    p += stride;
  }
  return { width, height, channels, data: out };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function readU32(b, o) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function concat(arrs) {
  let n = 0;
  for (const a of arrs) n += a.length;
  const out = new Uint8Array(n);
  let p = 0;
  for (const a of arrs) { out.set(a, p); p += a.length; }
  return out;
}

/** 灰度 + 方框缩放：img → tw×th 灰度矩阵（0..255）。 */
export function grayResize(img, tw, th) {
  const { width: W, height: H, channels: C, data } = img;
  const out = new Float64Array(tw * th);
  for (let ty = 0; ty < th; ty++) {
    const y0 = Math.floor((ty * H) / th);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * H) / th));
    for (let tx = 0; tx < tw; tx++) {
      const x0 = Math.floor((tx * W) / tw);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * W) / tw));
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * C;
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          n++;
        }
      }
      out[ty * tw + tx] = n ? sum / n : 0;
    }
  }
  return out;
}

const hex64 = (bits) => {
  let h = "";
  for (let i = 0; i < 64; i += 4) {
    let v = 0;
    for (let k = 0; k < 4; k++) if (bits[i + k]) v |= 1 << (3 - k);
    h += v.toString(16);
  }
  return h;
};

/** dHash：缩放 9×8，逐行相邻比较（左>右 = 1）→ 64 位 hex。 */
export function dHash(img) {
  const g = grayResize(img, 9, 8);
  const bits = new Array(64).fill(0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits[y * 8 + x] = g[y * 9 + x] > g[y * 9 + x + 1] ? 1 : 0;
    }
  }
  return hex64(bits);
}

/** aHash：缩放 8×8，与均值比较（> 均值 = 1）→ 64 位 hex。 */
export function aHash(img) {
  const g = grayResize(img, 8, 8);
  let mean = 0;
  for (let i = 0; i < 64; i++) mean += g[i];
  mean /= 64;
  const bits = new Array(64).fill(0);
  for (let i = 0; i < 64; i++) bits[i] = g[i] > mean ? 1 : 0;
  return hex64(bits);
}

/** 两个 64 位 hex 的汉明距离。 */
export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/** 文件 sha256（小写 hex）。 */
export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** 一页 PNG 的完整指纹：{ w, h, bytes, sha256, dHash, aHash }。 */
export function imageFingerprint(buf) {
  const img = decodePng(buf);
  return {
    w: img.width,
    h: img.height,
    bytes: buf.length,
    sha256: sha256(buf),
    dHash: dHash(img),
    aHash: aHash(img),
  };
}

// ---------------------------------------------------------------------------
// 最小 PNG 编码（仅用于把漂移可视化落 tests/golden/out/，filter 0 + deflate）
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(tag, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(tag, "latin1"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
/** RGB 字节（w*h*3）→ PNG Buffer。 */
export function encodePng(width, height, rgb) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter None
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from(PNG_SIG),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * 像素差可视化：|a-b| * amp，返回 { width, height, rgb, changed }。
 * 尺寸不一致时以较小画布为准并标 changed=-1（结构变化）。
 */
export function pixelDiff(imgA, imgB, amp = 3) {
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return { width: imgA.width, height: imgA.height, rgb: toRgb(imgA), changed: -1 };
  }
  const { width: w, height: h } = imgA;
  const rgb = new Uint8Array(w * h * 3);
  let changed = 0;
  for (let i = 0, p = 0; i < w * h; i++, p += 3) {
    const ca = imgA.channels, cb = imgB.channels;
    const ia = i * ca, ib = i * cb;
    let d = 0;
    for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(imgA.data[ia + k] - imgB.data[ib + k]));
    if (d > 0) changed++;
    const v = Math.min(255, d * amp);
    rgb[p] = v; rgb[p + 1] = v; rgb[p + 2] = v;
  }
  return { width: w, height: h, rgb, changed };
}

/** 图像 → RGB 字节（去 alpha）。 */
export function toRgb(img) {
  const { width: w, height: h, channels: c, data } = img;
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, p = 0; i < w * h; i++, p += 3) {
    const s = i * c;
    rgb[p] = data[s]; rgb[p + 1] = data[s + 1]; rgb[p + 2] = data[s + 2];
  }
  return rgb;
}

