// Zero-dependency QR Code encoder: byte mode, ECC level L, versions 1-10.
// makeQrMatrix(text) -> { size, modules } where modules[row][col] === true means dark.
// The quiet zone is not included; the renderer adds it.

const EXP = new Array(512);
const LOG = new Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

// Generator polynomial prod(x - a^i), i = 0..n-1, highest degree first.
function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

// Reed-Solomon remainder of data * x^n mod generator (returns n ECC codewords).
function rsEncode(data, n) {
  const gen = rsGenerator(n);
  const rem = new Array(n).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem.shift();
    rem.push(0);
    for (let i = 0; i < n; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

// Level L: [ECC codewords per block, [[blockCount, dataCodewordsPerBlock], ...]] for versions 1-10.
const EC_L = [
  null,
  [7, [[1, 19]]],
  [10, [[1, 34]]],
  [15, [[1, 55]]],
  [20, [[1, 80]]],
  [26, [[1, 108]]],
  [18, [[2, 68]]],
  [20, [[2, 78]]],
  [24, [[2, 97]]],
  [30, [[2, 116]]],
  [18, [[2, 68], [2, 69]]],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const REMAINDER_BITS = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

const dataCapacity = (v) => EC_L[v][1].reduce((s, [c, l]) => s + c * l, 0);

function pickVersion(len) {
  for (let v = 1; v <= 10; v++) {
    const countBits = v < 10 ? 8 : 16;
    if (4 + countBits + 8 * len <= dataCapacity(v) * 8) return v;
  }
  throw new Error('QR data too long');
}

// Mode indicator (byte = 0100), character count, data, terminator, byte-align, pad codewords.
function dataCodewords(bytes, version) {
  const bits = [];
  const push = (val, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const cap = dataCapacity(version) * 8;
  push(0, Math.min(4, cap - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    out.push(v);
  }
  for (let pad = 0xec; out.length < dataCapacity(version); pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

// Split data into blocks, add ECC per block, then interleave.
function interleave(data, version) {
  const [eccLen, groups] = EC_L[version];
  const blocks = [];
  let off = 0;
  for (const [count, len] of groups) {
    for (let k = 0; k < count; k++) {
      const d = data.slice(off, off + len);
      off += len;
      blocks.push({ d, e: rsEncode(d, eccLen) });
    }
  }
  const out = [];
  const maxLen = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < eccLen; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

// Format info: 5 data bits (ECL L = 01, then mask), BCH(15,5) with generator 0x537, XOR mask 0x5412.
function formatBits(ecl, mask) {
  const data = (ecl << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}

// Version info (versions 7+): 6 bits, BCH(18,6) with generator 0x1F25.
function versionBits(v) {
  let rem = v << 12;
  for (let i = 17; i >= 12; i--) if ((rem >>> i) & 1) rem ^= 0x1f25 << (i - 12);
  return (v << 12) | rem;
}

// Format-info cell list [row, col, bitIndex] for both copies.
function formatCells(size) {
  const cells = [];
  for (let i = 0; i <= 5; i++) cells.push([i, 8, i]);
  cells.push([7, 8, 6], [8, 8, 7], [8, 7, 8]);
  for (let i = 9; i < 15; i++) cells.push([8, 14 - i, i]);
  for (let i = 0; i < 8; i++) cells.push([8, size - 1 - i, i]);
  for (let i = 8; i < 15; i++) cells.push([size - 15 + i, 8, i]);
  return cells;
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r, _c) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 2)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0,
];

// Penalty rules 1-4 (ISO/IEC 18004 section 8.8.2).
function penalty(m) {
  const n = m.length;
  let score = 0;
  const lines = [];
  for (let i = 0; i < n; i++) lines.push(m[i], m.map((row) => row[i]));
  for (const line of lines) {
    // Rule 1: runs of 5+ same colour.
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    // Rule 3: finder-like 1:1:3:1:1 pattern with 4 light modules on one side.
    const s = line.map((b) => (b ? '1' : '0')).join('');
    for (const pat of ['10111010000', '00001011101']) {
      for (let p = s.indexOf(pat); p !== -1; p = s.indexOf(pat, p + 1)) score += 40;
    }
  }
  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }
  // Rule 4: dark-module proportion, 10 points per 5% away from 50%.
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

function buildMatrix(version, codewords) {
  const size = version * 4 + 17;
  const base = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r, c, v) => {
    base[r][c] = v;
    fn[r][c] = true;
  };
  const inb = (r, c) => r >= 0 && r < size && c >= 0 && c < size;

  // Finder patterns plus separators at three corners.
  for (const [cr, cc] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = cr + dr;
        const c = cc + dc;
        if (!inb(r, c)) continue;
        const d = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        set(r, c, d === 0 || d === 1 || d === 3);
      }
    }
  }

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Alignment patterns, skipping the three that collide with finders.
  const pos = ALIGN[version];
  const last = pos.length - 1;
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          set(pos[i] + dr, pos[j] + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  // Reserve format areas and the fixed dark module.
  const fmtCells = formatCells(size);
  for (const [r, c] of fmtCells) fn[r][c] = true;
  set(size - 8, 8, true);

  // Version info (versions 7+), two 6x3 blocks.
  if (version >= 7) {
    const vb = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((vb >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(b, a, bit);
      set(a, b, bit);
    }
  }

  // Data placement: zigzag from bottom-right, skipping function modules.
  const bits = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1);
  for (let i = 0; i < REMAINDER_BITS[version]; i++) bits.push(0);
  let idx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!fn[r][c]) base[r][c] = idx < bits.length ? bits[idx++] === 1 : false;
      }
    }
  }

  // Try each mask, keep the lowest penalty.
  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = base.map((row, r) => row.map((v, c) => (fn[r][c] ? v : v !== MASKS[mask](r, c))));
    const fb = formatBits(1, mask);
    for (const [r, c, i] of fmtCells) m[r][c] = ((fb >>> i) & 1) === 1;
    const score = penalty(m);
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return { size, modules: best };
}

export function makeQrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text));
  const version = pickVersion(bytes.length);
  const codewords = interleave(dataCodewords(bytes, version), version);
  return buildMatrix(version, codewords);
}

export function buildUpiUri({ upiId, payeeName, amount, invoiceNumber }) {
  const enc = encodeURIComponent;
  return `upi://pay?pa=${enc(upiId)}&pn=${enc(payeeName)}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${enc(invoiceNumber)}`;
}
