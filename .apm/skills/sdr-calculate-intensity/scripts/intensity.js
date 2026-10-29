#!/usr/bin/env node
'use strict';
// Deterministic session intensity using Daniels' points-per-minute by zone (method.md, "Tracking Training Intensities").

const ZONES = {
  E: { name: 'Easy / Long', pointsPerMin: 0.2 },
  M: { name: 'Marathon pace', pointsPerMin: 0.4 },
  T: { name: 'Threshold', pointsPerMin: 0.6 },
  '10K': { name: '10K pace', pointsPerMin: 0.8 },
  I: { name: 'Interval', pointsPerMin: 1.0 },
  R: { name: 'Repetition', pointsPerMin: 1.5 },
  FR: { name: 'Fast repetition', pointsPerMin: 2.0 },
};
const ZONE_ALIASES = {
  E: 'E', L: 'E', EASY: 'E',
  M: 'M', MP: 'M', T: 'T', '10K': '10K', I: 'I', H: 'I', R: 'R', FR: 'FR',
};
const UNIT_MINUTES = [
  [/^(h|hr|hrs|hour|hours)$/i, 60],
  [/^(min|mins|minute|minutes)$/i, 1],
  [/^(s|sec|secs|second|seconds)$/i, 1 / 60],
];

// ---------- parsing ----------
// session := term ('+' term)*
// term    := [N x] ( '(' session ')' | duration zone ) [w/ duration ...]
// duration: number + unit (h, min, s), e.g. "20 min", "1 hour", "90s", "1.5h".
// Recoveries ("w/ ...") are not scored, whether rest or jog.

function tokenize(session) {
  return session
    .replace(/×/g, 'x')
    .replace(/(\d)\s*x\s*(?=[\d(])/gi, '$1 x ')
    .replace(/(\d)(?!k\b)([a-z])/gi, '$1 $2')
    .replace(/([()+])/g, ' $1 ')
    .replace(/\bw\//gi, ' w/ ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function parseSession(session) {
  const tokens = tokenize(session);
  let i = 0;
  const peek = (k = 0) => tokens[i + k];
  const next = () => tokens[i++];
  const fail = (msg) => { throw new Error(`${msg} (at "${tokens.slice(i).join(' ') || 'end'}" in "${session}")`); };

  function parseDuration() {
    const num = next();
    if (!/^\d+(\.\d+)?$/.test(num ?? '')) fail(`Expected a duration, got "${num ?? 'end'}"`);
    const unitTok = peek();
    const unit = UNIT_MINUTES.find(([re]) => re.test(unitTok ?? ''));
    if (!unit) {
      if (/^(m|km|k|mi|mile|miles|meters?|metres?)$/i.test(unitTok ?? '')) fail('Distances are not accepted; convert to a duration');
      fail(`Duration "${num}" needs a time unit (h, min, s)`);
    }
    next();
    return { minutes: Number(num) * unit[1], text: `${num} ${unitTok}` };
  }

  function parseZone() {
    const tok = peek();
    const zone = ZONE_ALIASES[(tok ?? '').toUpperCase()];
    if (!zone) fail(`Unknown intensity "${tok ?? 'end'}" (use E/L, M/MP, T, 10K, I/H, R, FR)`);
    next();
    return { zone, tok };
  }

  function parseRecovery() {
    next(); // w/
    parseDuration();
    while (i < tokens.length && peek() !== '+' && peek() !== ')') next();
    return [];
  }

  function parseExpr() {
    const segs = [...parseTerm()];
    while (peek() === '+') { next(); segs.push(...parseTerm()); }
    return segs;
  }

  function parseTerm() {
    let reps = 1;
    if (/^\d+$/.test(peek() ?? '') && peek(1)?.toLowerCase() === 'x') { reps = Number(next()); next(); }
    let segs;
    if (peek() === '(') {
      next();
      segs = parseExpr();
      if (peek()?.toLowerCase() === 'w/') segs.push(...parseRecovery());
      if (next() !== ')') fail('Expected ")"');
    } else {
      const d = parseDuration();
      const { zone, tok } = parseZone();
      segs = [{ minutes: d.minutes, zone, reps: 1, text: `${d.text} ${tok}` }];
      if (peek()?.toLowerCase() === 'w/') segs.push(...parseRecovery());
    }
    return segs.map((s) => ({ ...s, reps: s.reps * reps }));
  }

  const segs = parseExpr();
  if (i < tokens.length) fail('Unexpected input');
  return segs;
}

// ---------- calculation ----------

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function intensity(session) {
  const byZone = {};
  let totalMin = 0;
  let totalPts = 0;
  const segments = parseSession(session).map((s) => {
    const minutes = s.minutes * s.reps;
    const points = minutes * ZONES[s.zone].pointsPerMin;
    totalMin += minutes;
    totalPts += points;
    const z = (byZone[s.zone] ??= { minutes: 0, points: 0 });
    z.minutes += minutes;
    z.points += points;
    return { segment: s.text, reps: s.reps, zone: s.zone, pointsPerMin: ZONES[s.zone].pointsPerMin, minutes: round(minutes), points: round(points) };
  });
  for (const z of Object.values(byZone)) { z.minutes = round(z.minutes); z.points = round(z.points); }
  return { session, segments, byZone, total: { minutes: round(totalMin), points: round(totalPts) } };
}

// ---------- CLI ----------

function usage() {
  return [
    'Usage: node intensity.js "<session>" [--json]',
    '',
    'Segments are "<duration> <zone>" joined by "+"; "N x (...)" repeats; "w/ ..." recoveries are ignored.',
    'Durations need a unit: h/hr/hour, min/mins/minutes, s/sec. Zones: E/L, M/MP, T, 10K, I/H, R, FR.',
    '',
    'Examples:',
    '  node intensity.js "30 min E + 30 min T"',
    '  node intensity.js "1 hour E + 4 x 4 min R"',
    '  node intensity.js "20 min E + 5 x (3 min I w/ 2 min jg) + 15 min E" --json',
  ].join('\n');
}

function printText(r) {
  const lines = [`Session: ${r.session}`, '', ['Segment', 'Reps', 'Zone', 'Pts/min', 'Min', 'Points'].join('\t')];
  for (const s of r.segments) lines.push([s.segment, s.reps, s.zone, s.pointsPerMin, s.minutes, s.points].join('\t'));
  lines.push('', ['Zone', 'Min', 'Points'].join('\t'));
  for (const [z, v] of Object.entries(r.byZone)) lines.push([z, v.minutes, v.points].join('\t'));
  lines.push('', `Total: ${r.total.minutes} min, ${r.total.points} points`);
  console.log(lines.join('\n'));
}

function main(argv) {
  const json = argv.includes('--json');
  if (argv.includes('-h') || argv.includes('--help')) { console.log(usage()); return 0; }
  const args = argv.filter((a) => a !== '--json');
  if (args.length !== 1) { console.error(usage()); return 2; }
  const result = intensity(args[0]);
  if (json) console.log(JSON.stringify(result, null, 2));
  else printText(result);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`Error: ${e.message}`); process.exitCode = 1; }
}

module.exports = { intensity, parseSession, ZONES };
