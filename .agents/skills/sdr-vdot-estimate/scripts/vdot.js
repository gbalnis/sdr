#!/usr/bin/env node
'use strict';
// Deterministic VDOT estimator. Per-distance functions VDOT = c0 + c1*v + c2*v^2 + c3*v^3
// (v = speed in m/s) were least-squares fitted to resources/VDOT_estimate_data.csv
// (VDOT 30-85) and are hardcoded below; the CSV is not read at runtime.

const VDOT_MIN = 30;
const VDOT_MAX = 85;

const FUNCTIONS = [
  { name: '1500 m', meters: 1500, coef: [-5.82871081708, 12.9072194804, -0.36230373813, 0.0383759781593], aliases: ['1500', '1500m', '1.5k', '1500 meters', 'metric mile'] },
  { name: '1 mile', meters: 1609.344, coef: [-5.58165227911, 12.7949353946, -0.313499195584, 0.0346181956366], aliases: ['mile', '1mi', '1 mi', '1mile'] },
  { name: '3000 m', meters: 3000, coef: [-6.60793759698, 13.5534813943, -0.222955025476, 0.0259944700619], aliases: ['3000', '3000m', '3k', '3 km'] },
  { name: '2 miles', meters: 3218.688, coef: [-7.04909085952, 13.8261566268, -0.254631175041, 0.0282613672653], aliases: ['2 mile', '2mi', '2 mi', '2miles'] },
  { name: '5000 m', meters: 5000, coef: [-6.42506954637, 13.4205811937, -0.0572352760794, 0.0184894465136], aliases: ['5000', '5000m', '5k', '5 km'] },
  { name: '10000 m', meters: 10000, coef: [-5.25989669656, 13.3216179585, 0.00823221342404, 0.0218698125281], aliases: ['10000', '10000m', '10k', '10 km'] },
  { name: '15000 m', meters: 15000, coef: [-6.22514868433, 14.4588487144, -0.175191831601, 0.0345561860587], aliases: ['15000', '15000m', '15k', '15 km'] },
  { name: 'half marathon', meters: 21097.5, coef: [-7.32314449909, 15.4480437854, -0.290733696347, 0.0406737263209], aliases: ['half', 'hm', 'half-marathon', '21.1k', '21k', '13.1'] },
  { name: 'marathon', meters: 42195, coef: [-8.71244928086, 16.1572915917, -0.164981835793, 0.0280832414901], aliases: ['full', 'fm', 'full marathon', '42.2k', '42k', '26.2'] },
];

const UNIT_METERS = { m: 1, meter: 1, meters: 1, k: 1000, km: 1000, mi: 1609.344, mile: 1609.344, miles: 1609.344 };

// ---------- time handling ----------

function parseTime(str) {
  const clean = String(str).trim().replace(/\*+$/, '');
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(clean)) throw new Error(`Invalid time "${str}" (use h:mm:ss, mm:ss or mm:ss.s)`);
  return clean.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

function formatTime(sec) {
  const tenths = Math.round(sec * 10) / 10;
  const h = Math.floor(tenths / 3600);
  const m = Math.floor((tenths % 3600) / 60);
  const s = Math.round((tenths % 60) * 10) / 10;
  const ss = (Number.isInteger(s) ? String(s) : s.toFixed(1)).padStart(Number.isInteger(s) ? 2 : 4, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// ---------- distance handling ----------

function resolveDistance(input) {
  const key = String(input).trim().toLowerCase().replace(/\s+/g, ' ');
  const named = FUNCTIONS.find((f) => f.name === key || f.aliases.includes(key));
  if (named) return { name: named.name, meters: named.meters };

  const m = key.match(/^(\d+(?:\.\d+)?) ?([a-z]*)$/);
  const unit = m && (m[2] === '' ? 1 : UNIT_METERS[m[2]]);
  if (!unit) throw new Error(`Unknown distance "${input}". Use a name (${FUNCTIONS.map((f) => f.name).join(', ')}) or a number with unit m, km/k or mi`);
  const meters = Number(m[1]) * unit;
  const close = FUNCTIONS.find((f) => Math.abs(f.meters - meters) / f.meters < 0.001);
  return close ? { name: close.name, meters: close.meters } : { name: `${meters} m`, meters };
}

// ---------- estimation ----------

const evaluate = (fn, speed) => fn.coef.reduce((acc, c, i) => acc + c * speed ** i, 0);

function computeVdot(meters, seconds) {
  const speed = meters / seconds;
  const exact = FUNCTIONS.find((f) => f.meters === meters);
  if (exact) return { vdot: evaluate(exact, speed), method: 'function' };

  const first = FUNCTIONS[0];
  const last = FUNCTIONS[FUNCTIONS.length - 1];
  if (meters < first.meters || meters > last.meters) {
    throw new Error(`Distance ${meters} m is outside the supported range ${first.meters}-${last.meters} m`);
  }
  const hi = FUNCTIONS.findIndex((f) => f.meters > meters);
  const lower = FUNCTIONS[hi - 1];
  const upper = FUNCTIONS[hi];
  const vLower = evaluate(lower, speed);
  const vUpper = evaluate(upper, speed);
  // Weights use log-distance: much closer to the table than plain distance across wide gaps (e.g. 5k-10k).
  const frac = Math.log(meters / lower.meters) / Math.log(upper.meters / lower.meters);
  return {
    vdot: vLower + frac * (vUpper - vLower),
    method: 'interpolated',
    neighbours: [
      { distance: lower.name, vdot: Math.round(vLower * 10) / 10, weight: Math.round((1 - frac) * 1000) / 1000 },
      { distance: upper.name, vdot: Math.round(vUpper * 10) / 10, weight: Math.round(frac * 1000) / 1000 },
    ],
  };
}

function estimate({ distance, time }) {
  const dist = resolveDistance(distance);
  const seconds = parseTime(time);
  if (!(seconds > 0)) throw new Error(`Invalid time "${time}"`);
  const { vdot: vdotExact, ...detail } = computeVdot(dist.meters, seconds);
  const vdot = Math.round(vdotExact * 10) / 10;
  const base = { distance: dist.name, meters: dist.meters, time: formatTime(seconds), seconds, ...detail };

  if (vdot < VDOT_MIN) {
    return { ...base, vdot: null, vdotExact, status: 'below-range', message: `Slower than VDOT ${VDOT_MIN}; supported range is ${VDOT_MIN}-${VDOT_MAX}` };
  }
  if (vdot > VDOT_MAX) {
    return { ...base, vdot: null, vdotExact, status: 'above-range', message: `Faster than VDOT ${VDOT_MAX}; supported range is ${VDOT_MIN}-${VDOT_MAX}` };
  }
  return { ...base, vdot, vdotExact, status: 'ok' };
}

// ---------- CLI ----------

function usage() {
  return [
    'Usage:',
    '  node vdot.js <distance> <time> [--json]',
    '',
    'Examples:',
    '  node vdot.js "half marathon" 1:39:13',
    '  node vdot.js 5k 22:30 --json',
    '  node vdot.js "10 mi" 1:15:00',
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
  if (args.length !== 2) { console.error(usage()); return 2; }

  const result = estimate({ distance: args[0], time: args[1] });
  if (json) console.log(JSON.stringify(result, null, 2));
  else if (result.status === 'ok') {
    const how = result.method === 'interpolated'
      ? `interpolated between ${result.neighbours.map((n) => `${n.distance} (VDOT ${n.vdot.toFixed(1)}, w=${n.weight})`).join(' and ')}`
      : 'fitted function';
    console.log(`VDOT ${result.vdot.toFixed(1)}  (${result.distance} in ${result.time}; ${how})`);
  } else console.log(`VDOT out of range: ${result.message}`);
  return result.status === 'ok' ? 0 : 3;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`Error: ${e.message}`); process.exitCode = 1; }
}

module.exports = { estimate, parseTime, formatTime, resolveDistance, FUNCTIONS };
