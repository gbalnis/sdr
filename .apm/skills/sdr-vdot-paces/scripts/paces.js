#!/usr/bin/env node
'use strict';
// Deterministic Daniels VDOT training-pace calculator (seconds per km).

const VDOT_MIN = 30;
const VDOT_MAX = 85;
const ZONES = ['Emin', 'Emax', 'M', 'T', 'I', 'R'];
const STRIDE = ZONES.length;

// Row-major, one row per whole VDOT from VDOT_MIN to VDOT_MAX: Emin, Emax, M, T, I, R.
const TABLE = Uint16Array.of(
  447, 494, 423, 383, 355, 336, // 30
  436, 482, 412, 375, 345, 326,
  425, 472, 400, 365, 335, 316,
  415, 461, 390, 357, 328, 306,
  405, 451, 380, 348, 320, 300,
  396, 441, 370, 340, 313, 291, // 35
  387, 431, 361, 333, 305, 284,
  379, 422, 353, 326, 299, 276,
  371, 414, 345, 318, 292, 270,
  363, 406, 337, 312, 287, 266,
  356, 398, 329, 306, 281, 260, // 40
  349, 391, 322, 300, 276, 256,
  342, 383, 316, 293, 271, 250,
  335, 376, 309, 288, 266, 246,
  329, 370, 303, 283, 261, 240,
  323, 363, 297, 278, 256, 236, // 45
  317, 357, 291, 273, 251, 230,
  312, 351, 286, 268, 246, 226,
  307, 345, 281, 263, 241, 222,
  301, 340, 276, 259, 238, 220,
  296, 334, 271, 254, 234, 216, // 50
  292, 329, 267, 251, 230, 214,
  287, 324, 262, 246, 227, 212,
  283, 319, 258, 243, 224, 210,
  278, 314, 254, 239, 221, 206,
  274, 310, 250, 236, 217, 202, // 55
  270, 305, 246, 233, 215, 200,
  266, 301, 243, 229, 212, 196,
  262, 297, 239, 226, 208, 192,
  259, 293, 236, 223, 205, 190,
  255, 289, 232, 220, 203, 186, // 60
  251, 285, 229, 216, 200, 185,
  248, 281, 226, 213, 197, 181,
  245, 278, 223, 211, 195, 179,
  242, 274, 220, 208, 192, 176,
  239, 271, 217, 206, 190, 175, // 65
  236, 268, 214, 203, 188, 171,
  233, 264, 211, 201, 185, 170,
  230, 261, 209, 198, 183, 166,
  227, 258, 206, 196, 180, 165,
  224, 255, 204, 193, 178, 161, // 70
  222, 252, 201, 191, 176, 160,
  220, 250, 199, 190, 174, 156,
  217, 247, 196, 188, 173, 156,
  214, 244, 194, 186, 171, 154,
  212, 241, 192, 185, 168, 152, // 75
  210, 238, 190, 182, 167, 150,
  208, 236, 188, 180, 165, 148,
  205, 233, 186, 178, 163, 147,
  203, 231, 183, 176, 161, 146,
  201, 229, 181, 175, 160, 145, // 80
  199, 226, 180, 173, 158, 143,
  197, 224, 178, 171, 157, 141,
  195, 222, 176, 170, 156, 140,
  193, 220, 174, 168, 154, 138,
  191, 218, 172, 166, 153, 137, // 85
);

function parseVdot(input) {
  const str = String(input).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) throw new Error(`Invalid VDOT "${input}" (expected a number)`);
  const v = Number(str);
  if (v < VDOT_MIN || v > VDOT_MAX) throw new Error(`VDOT ${v} out of range (${VDOT_MIN}-${VDOT_MAX})`);
  return v;
}

function formatPace(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Linear interpolation between neighbouring whole-VDOT rows.
function paces(vdot) {
  const offset = vdot - VDOT_MIN;
  const lo = Math.min(Math.floor(offset), VDOT_MAX - VDOT_MIN - 1);
  const frac = offset - lo;
  const a = lo * STRIDE;
  const b = a + STRIDE;
  const sec = {};
  for (let i = 0; i < STRIDE; i++) {
    const v = TABLE[a + i] + (TABLE[b + i] - TABLE[a + i]) * frac;
    sec[ZONES[i]] = Math.round(v * 10) / 10;
  }
  return {
    vdot,
    unit: 's/km',
    interpolated: frac !== 0 && frac !== 1,
    E: { min: sec.Emin, max: sec.Emax, pace: `${formatPace(sec.Emin)}-${formatPace(sec.Emax)}` },
    M: { sec: sec.M, pace: formatPace(sec.M) },
    T: { sec: sec.T, pace: formatPace(sec.T) },
    I: { sec: sec.I, pace: formatPace(sec.I) },
    R: { sec: sec.R, pace: formatPace(sec.R) },
    status: 'ok',
  };
}

function usage() {
  return [
    'Usage:',
    `  node paces.js <vdot> [--json]     (${VDOT_MIN} <= vdot <= ${VDOT_MAX})`,
    '',
    'Examples:',
    '  node paces.js 50',
    '  node paces.js 47.3 --json',
  ].join('\n');
}

function main(argv) {
  const args = [];
  let json = false;
  for (const a of argv) {
    if (a === '--json') json = true;
    else if (a === '-h' || a === '--help') { console.log(usage()); return 0; }
    else args.push(a);
  }
  if (args.length !== 1) { console.error(usage()); return 2; }

  const r = paces(parseVdot(args[0]));
  if (json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`VDOT ${r.vdot}${r.interpolated ? ' (interpolated)' : ''} - paces per km`);
    console.log(`  E  ${r.E.pace}`);
    for (const z of ['M', 'T', 'I', 'R']) console.log(`  ${z}  ${r[z].pace}`);
  }
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`Error: ${e.message}`); process.exitCode = 1; }
}

module.exports = { paces, parseVdot, formatPace, TABLE, ZONES, VDOT_MIN, VDOT_MAX };
