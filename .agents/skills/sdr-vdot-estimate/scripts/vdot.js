#!/usr/bin/env node
'use strict';
// Deterministic VDOT estimator using the Daniels/Gilbert equations.

const NAMED_DISTANCES = [
  { name: '1500 m', meters: 1500, aliases: ['1500', '1500m', '1.5k', '1500 meters', 'metric mile'] },
  { name: '1 mile', meters: 1609.344, aliases: ['mile', '1mi', '1 mi', '1mile'] },
  { name: '3000 m', meters: 3000, aliases: ['3000', '3000m', '3k', '3 km'] },
  { name: '2 miles', meters: 3218.688, aliases: ['2 mile', '2mi', '2 mi', '2miles'] },
  { name: '5000 m', meters: 5000, aliases: ['5000', '5000m', '5k', '5 km'] },
  { name: '10000 m', meters: 10000, aliases: ['10000', '10000m', '10k', '10 km'] },
  { name: '15000 m', meters: 15000, aliases: ['15000', '15000m', '15k', '15 km'] },
  { name: 'half marathon', meters: 21097.5, aliases: ['half', 'hm', 'half-marathon', '21.1k', '21k', '13.1'] },
  { name: 'marathon', meters: 42195, aliases: ['full', 'fm', 'full marathon', '42.2k', '42k', '26.2'] },
];

const UNIT_METERS = { m: 1, meter: 1, meters: 1, k: 1000, km: 1000, mi: 1609.344, mile: 1609.344, miles: 1609.344 };

// ---------- input handling ----------

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

function resolveDistance(input) {
  const key = String(input).trim().toLowerCase().replace(/\s+/g, ' ');
  const named = NAMED_DISTANCES.find((d) => d.name === key || d.aliases.includes(key));
  if (named) return { name: named.name, meters: named.meters };

  const m = key.match(/^(\d+(?:\.\d+)?) ?([a-z]*)$/);
  const unit = m && (m[2] === '' ? 1 : UNIT_METERS[m[2]]);
  if (!unit) throw new Error(`Unknown distance "${input}". Use a name (${NAMED_DISTANCES.map((d) => d.name).join(', ')}) or a number with unit m, km/k or mi`);
  return { name: `${Number(m[1]) * unit} m`, meters: Number(m[1]) * unit };
}

// ---------- VDOT equations ----------

// distance in meters, time in minutes
function vdot(distance, time) {
  const velocity = distance / time;
  const vo2 = -4.60 + 0.182258 * velocity + 0.000104 * velocity ** 2;
  const pctVo2max = 0.8 + 0.1894393 * Math.exp(-0.012778 * time) + 0.2989558 * Math.exp(-0.1932605 * time);
  return { velocity, vo2, pctVo2max, vdot: vo2 / pctVo2max };
}

function estimate({ distance, time }) {
  const dist = resolveDistance(distance);
  const seconds = parseTime(time);
  if (!(dist.meters > 0)) throw new Error(`Invalid distance "${distance}"`);
  if (!(seconds > 0)) throw new Error(`Invalid time "${time}"`);
  const minutes = seconds / 60;
  const r = vdot(dist.meters, minutes);
  return {
    distance: dist.name,
    meters: dist.meters,
    time: formatTime(seconds),
    minutes,
    velocity: r.velocity,
    vo2: r.vo2,
    pctVo2max: r.pctVo2max,
    vdot: Math.round(r.vdot * 10) / 10,
    vdotExact: r.vdot,
    status: 'ok',
  };
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
  else console.log(`VDOT ${result.vdot.toFixed(1)}  (${result.distance} in ${result.time}; VO2 ${result.vo2.toFixed(2)}, %VO2max ${(result.pctVo2max * 100).toFixed(1)}%)`);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`Error: ${e.message}`); process.exitCode = 1; }
}

module.exports = { vdot, estimate, parseTime, formatTime, resolveDistance };
