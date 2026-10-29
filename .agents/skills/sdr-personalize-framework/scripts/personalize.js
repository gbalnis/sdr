#!/usr/bin/env node
'use strict';
// Personalizes a normalized training framework for one athlete. Zero dependencies.
// Reuses the vdot-estimate and vdot-paces engines so all numbers trace to the spreadsheet.

const fs = require('node:fs');
const path = require('node:path');
const { estimate } = require('../../sdr-vdot-estimate/scripts/vdot.js');
const { paces, formatPace } = require('../../sdr-vdot-paces/scripts/paces.js');

const KM_PER_MILE = 1.609344;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MIN_EASY_MIN = 30;

const r3 = (x) => Number(x.toFixed(3));
const r2 = (x) => Number(x.toFixed(2));
// ---------- athlete profile ----------

const unquote = (s) => s.replace(/^(['"])(.*)\1$/, '$2');

function parseAthlete(text) {
  const athlete = { performances: [], preferences: {} };
  let section = null;
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s+)#.*$/, '');
    if (!line.trim()) continue;
    const top = line.match(/^([A-Za-z]\w*):\s*(.*)$/);
    if (top) {
      section = top[1];
      current = null;
      if (top[2].trim()) athlete[section] = unquote(top[2].trim());
      continue;
    }
    const item = line.match(/^\s+-\s+([A-Za-z]\w*):\s*(.*)$/);
    if (item && section === 'performances') {
      current = { [item[1]]: unquote(item[2].trim()) };
      athlete.performances.push(current);
      continue;
    }
    if (item && section === 'preferences') {
      athlete.preferences[item[1]] = unquote(item[2].trim());
      continue;
    }
    const cont = line.match(/^\s+([A-Za-z]\w*):\s*(.*)$/);
    if (cont && section === 'performances' && current) {
      current[cont[1]] = unquote(cont[2].trim());
      continue;
    }
    throw new Error(`Unsupported athlete YAML line: "${raw}"`);
  }
  return athlete;
}

function weekdayIndex(name) {
  const key = name.trim().toLowerCase();
  const i = WEEKDAYS.findIndex((d) => d === key || d.slice(0, 3) === key);
  if (i < 0) throw new Error(`Unknown weekday "${name}"`);
  return i;
}

function peakWeekKm(value) {
  const m = String(value ?? '').match(/^([\d.]+)\s*(km|mi|miles?)?$/i);
  if (!m) throw new Error(`Athlete preferences.peakWeek is missing or invalid: "${value}"`);
  return /^mi/i.test(m[2] ?? '') ? Number(m[1]) * KM_PER_MILE : Number(m[1]);
}

function baselineVdot(athlete) {
  const rows = athlete.performances.map((p) => ({ ...p, ...estimate({ distance: p.event, time: p.time }) }));
  const usable = rows.filter((p) => p.status === 'ok').sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!usable.length) throw new Error('No performance in the athlete file maps to a VDOT inside the table range');
  return { vdot: usable[0].vdot, from: usable[0], performances: rows };
}

// ---------- pace tables ----------

const paceCache = new Map();
function paceTable(vdot) {
  const key = vdot.toFixed(2);
  if (!paceCache.has(key)) {
    let result;
    try {
      result = paces(Number(key));
    } catch (e) {
      throw new Error(`Cannot get paces for VDOT ${key}: ${e.message}`);
    }
    const perKm = { E: result.E.max, M: result.M.sec, T: result.T.sec, I: result.I.sec, R: result.R.sec };
    if (Object.values(perKm).some((pace) => !Number.isFinite(pace))) throw new Error(`No complete pace table for VDOT ${key}`);
    const perZone = {
      E: { min: formatPace(result.E.min), max: formatPace(result.E.max) },
      M: result.M.pace,
      T: result.T.pace,
      I: result.I.pace,
      R: result.R.pace,
    };
    paceCache.set(key, { vdot: Number(key), perKm, perZone });
  }
  return paceCache.get(key);
}

function paceFor(pt, intensity, where) {
  if (!intensity) throw new Error(`Unknown intensity at ${where}`);
  const pace = pt.perKm[intensity];
  if (pace === undefined) throw new Error(`Intensity ${intensity} at ${where} has no Daniels table pace`);
  return pace;
}

// ---------- step conversion ----------

// Ranges resolve to their upper bound; the original range is kept on the step.
function resolveAmount(amount, where) {
  if (!amount) throw new Error(`Unresolved quantity at ${where}; re-run coach-normalize-framework`);
  return { unit: amount.unit, value: amount.max, range: amount.min === amount.max ? null : amount };
}

function distanceAndTime(amount, paceSec, where) {
  const q = resolveAmount(amount, where);
  if (q.unit === 'km') return { km: q.value, min: (q.value * paceSec) / 60, range: q.range };
  return { km: (q.value * 60) / paceSec, min: q.value, range: q.range };
}

function build(step, pt, where) {
  if (step.type === 'run') {
    const pace = paceFor(pt, step.intensity, where);
    const { km, min, range } = distanceAndTime(step.amount, pace, where);
    const node = { type: 'run', intensity: step.intensity, pace_per_km: pt.perZone[step.intensity], distance_km: r3(km), duration_min: r2(min) };
    if (range) node.range = range;
    return { node, km, min };
  }
  if (step.type === 'recovery') {
    if (step.mode === 'rest') {
      const q = resolveAmount(step.amount, where);
      if (q.unit !== 'min') throw new Error(`Rest recovery at ${where} must be a duration`);
      return { node: { type: 'recovery', mode: 'rest', pace_per_km: null, distance_km: 0, duration_min: r2(q.value) }, km: 0, min: q.value };
    }
    const pace = paceFor(pt, 'E', where);
    const { km, min } = distanceAndTime(step.amount, pace, where);
    return { node: { type: 'recovery', mode: step.mode, pace_per_km: pt.perZone.E, distance_km: r3(km), duration_min: r2(min) }, km, min };
  }
  if (step.type === 'repeat') {
    if (!step.count) throw new Error(`Unresolved repeat count at ${where}`);
    const inner = step.steps.map((s, i) => build(s, pt, `${where}/steps/${i}`));
    let km = step.count * inner.reduce((a, n) => a + n.km, 0);
    let min = step.count * inner.reduce((a, n) => a + n.min, 0);
    let recovery = null;
    if (step.recovery) {
      if (step.recovery.placement === 'unspecified') throw new Error(`Unresolved recovery placement at ${where}`);
      const rec = build(step.recovery.step, pt, `${where}/recovery`);
      const count = step.recovery.placement === 'between' ? step.count - 1 : step.count;
      km += count * rec.km;
      min += count * rec.min;
      recovery = { placement: step.recovery.placement, count, step: rec.node };
    }
    return { node: { type: 'repeat', count: step.count, steps: inner.map((n) => n.node), recovery, distance_km: r3(km), duration_min: r2(min) }, km, min };
  }
  throw new Error(`Unsupported step type "${step.type}" at ${where}`);
}

function buildRun(id, session, pt, where) {
  const nodes = session.steps.map((s, i) => build(s, pt, `${where}/steps/${i}`));
  const km = nodes.reduce((a, n) => a + n.km, 0);
  const min = nodes.reduce((a, n) => a + n.min, 0);
  return {
    run: { id, kind: session.kind === 'quality' ? 'quality' : 'support', session_id: session.id, optional: session.optional, distance_km: r3(km), duration_min: r2(min), steps: nodes.map((n) => n.node) },
    km,
  };
}

function buildEasyRun(id, km, pt, strides) {
  const e = pt.perKm.E;
  const run = (distance) => ({ type: 'run', intensity: 'E', pace_per_km: pt.perZone.E, distance_km: r3(distance), duration_min: r2((distance * e) / 60) });
  let steps;
  if (!strides) {
    steps = [run(km)];
  } else {
    // Stride bouts and their jogs are counted at E pace so total time stays distance x E pace.
    const blockSec = strides.count * strides.seconds + (strides.count - 1) * strides.recovery;
    const blockKm = blockSec / e;
    const coolKm = (strides.cooldown * 60) / e;
    const mainKm = km - blockKm - coolKm;
    if (mainKm <= 0) throw new Error(`Easy run ${id} (${km} km) is too short for strides plus a ${strides.cooldown} min cool-down`);
    steps = [
      run(mainKm),
      {
        type: 'repeat',
        count: strides.count,
        steps: [{ type: 'run', intensity: 'ST', pace_per_km: null, reference_pace_per_km: pt.perZone.R, distance_km: null, duration_min: r2(strides.seconds / 60) }],
        recovery: { placement: 'between', count: strides.count - 1, step: { type: 'recovery', mode: 'jog', pace_per_km: null, distance_km: null, duration_min: r2(strides.recovery / 60) } },
        distance_km: r3(blockKm),
        duration_min: r2(blockSec / 60),
        distance_basis: 'e_pace',
      },
      run(coolKm),
    ];
  }
  return { id, kind: 'easy', session_id: null, optional: false, distance_km: r3(km), duration_min: r2((km * e) / 60), steps };
}

// ---------- week layout ----------

const qDayNumbers = (n) => Array.from({ length: n }, (_, j) => Math.floor((7 * j) / n) + 1);

function placeRests(preferred, qDays) {
  const taken = new Set(qDays);
  const rests = [];
  const moved = [];
  for (const d of preferred) {
    if (!taken.has(d)) {
      rests.push(d);
      taken.add(d);
      continue;
    }
    let target = null;
    for (let off = 1; off < 7 && target === null; off++) {
      for (const cand of [d + off, d - off]) {
        if (cand >= 1 && cand <= 7 && !taken.has(cand)) { target = cand; break; }
      }
    }
    if (target !== null) {
      rests.push(target);
      taken.add(target);
      moved.push({ from: d, to: target });
    }
  }
  return { rests, moved };
}

// Extra rest days replace the easy days right after a Q day first, then days from the end of the week.
function keepEasyDays(free, qDays, k) {
  const afterQ = free.filter((d) => qDays.includes(d - 1)).sort((a, b) => a - b);
  const others = free.filter((d) => !afterQ.includes(d)).sort((a, b) => b - a);
  const dropOrder = [...afterQ, ...others];
  const dropped = new Set(dropOrder.slice(0, free.length - k));
  return free.filter((d) => !dropped.has(d));
}

function pickStrideRuns(count, days) {
  if (count === 0) return new Set();
  const picks = new Set();
  for (let i = 0; i < Math.min(days, count); i++) picks.add(Math.min(count - 1, Math.round((i * count) / days)));
  return picks;
}

// ---------- plan ----------

// Collapses a descending list such as [70,69,68,4] into "70-68, 4".
function collapse(list) {
  const parts = [];
  for (let i = 0; i < list.length; ) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] - 1) j++;
    parts.push(j > i ? `${list[i]}-${list[j]}` : `${list[i]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

function plan(framework, athlete, opts) {
  if (framework.schema_version !== 1) throw new Error('Unsupported normalized framework schema_version');
  if (!framework.ready) throw new Error('Normalized framework is not ready (blocking issues); resolve them with coach-normalize-framework first');
  const peakKm = peakWeekKm(athlete.preferences.peakWeek);
  const restWeekdays = String(athlete.preferences.restDays ?? '').split(',').map((s) => s.trim()).filter(Boolean).map(weekdayIndex);
  const weekStart = weekdayIndex(opts.weekStart);
  const restDayNumbers = restWeekdays.map((wd) => ((wd - weekStart + 7) % 7) + 1);
  const base = baselineVdot(athlete);
  const issues = [];
  const warn = (code, where, message) => issues.push({ severity: 'warning', code, where, message });

  const entries = [...framework.entries].sort((a, b) => b.at.before_race * (b.at.unit === 'week' ? 7 : 1) - a.at.before_race * (a.at.unit === 'week' ? 7 : 1));
  const days = new Map();
  const weeks = [];
  const addDay = (day) => {
    if (days.has(day.before_race)) throw new Error(`Framework entries overlap on day ${day.before_race} before the race`);
    days.set(day.before_race, day);
  };

  for (const entry of entries) {
    const label = `${entry.at.before_race}${entry.at.unit === 'week' ? 'w' : 'd'}`;
    let offset = entry.vdot_offset;
    if (offset === null) {
      warn('vdot_offset_missing', label, 'Framework gives no VDOT correction; 0 was used');
      offset = 0;
    }
    const vdot = Number((base.vdot + offset).toFixed(2));
    const pt = paceTable(vdot);

    if (entry.at.unit === 'day') {
      const runs = [];
      let rest = false;
      entry.sessions.forEach((session, i) => {
        if (session.kind === 'rest') { rest = true; return; }
        runs.push(buildRun(`d${entry.at.before_race}-${session.id}`, session, pt, `${label}/sessions/${i}`).run);
      });
      addDay({ before_race: entry.at.before_race, week: null, day_in_week: null, kind: rest && !runs.length ? 'rest' : 'run', vdot, runs });
      continue;
    }

    const w = entry.at.before_race;
    const n = entry.sessions.length;
    const qDays = qDayNumbers(n);
    const built = entry.sessions.map((session, j) => {
      if (session.kind === 'rest') throw new Error(`Rest session inside weekly entry ${label} is not supported`);
      const dayNo = qDays[j];
      return { dayNo, ...buildRun(`d${7 * w - dayNo + 1}-${session.id}`, session, pt, `${label}/sessions/${j}`) };
    });
    const qKm = built.reduce((a, b) => a + b.km, 0);
    const target = entry.peak_fraction === null ? null : peakKm * entry.peak_fraction;
    const { rests, moved } = placeRests(restDayNumbers, qDays);
    for (const m of moved) warn('rest_day_moved', label, `Preferred rest on day ${m.from} holds a Q session; rest moved to day ${m.to}`);
    const free = [1, 2, 3, 4, 5, 6, 7].filter((d) => !qDays.includes(d) && !rests.includes(d));

    let easyDays = [];
    let easyKm = [];
    if (target === null) {
      warn('no_peak_fraction', label, 'No peak_fraction; no easy runs were added');
    } else {
      const remaining = target - qKm;
      const minKm = (MIN_EASY_MIN * 60) / pt.perKm.E;
      const minTenths = Math.ceil(minKm * 10 - 1e-9);
      const tenths = Math.round(remaining * 10);
      if (remaining < -0.05) warn('target_exceeded', label, `Quality sessions (${r2(qKm)} km) exceed the weekly target (${r2(target)} km)`);
      const k = Math.min(free.length, Math.floor(tenths / minTenths));
      if (k < 1 && tenths > 0) warn('volume_shortfall', label, `${r2(remaining)} km remain but less than a ${MIN_EASY_MIN} min easy run; not planned`);
      if (k >= 1) {
        easyDays = keepEasyDays(free, qDays, k);
        const base10 = Math.floor(tenths / k);
        const extra = tenths % k;
        easyKm = easyDays.map((_, i) => (base10 + (i < extra ? 1 : 0)) / 10);
      }
    }

    const stridePicks = opts.strides ? pickStrideRuns(easyDays.length, opts.strides.days) : new Set();
    if (opts.strides && easyDays.length < opts.strides.days) warn('strides_days_short', label, `Only ${easyDays.length} easy run(s); framework asks strides on ${opts.strides.days}`);

    let easyTotal = 0;
    for (let d = 1; d <= 7; d++) {
      const before = 7 * w - d + 1;
      const q = built.find((b) => b.dayNo === d);
      const e = easyDays.indexOf(d);
      const day = { before_race: before, week: w, day_in_week: d, vdot, runs: [] };
      if (q) {
        day.kind = 'run';
        day.runs.push(q.run);
      } else if (e >= 0) {
        day.kind = 'run';
        day.runs.push(buildEasyRun(`d${before}-E`, easyKm[e], pt, stridePicks.has(e) ? opts.strides : null));
        easyTotal += easyKm[e];
      } else {
        day.kind = 'rest';
        day.rest_reason = rests.includes(d) ? 'athlete_rest_day' : 'extra_rest_day';
      }
      addDay(day);
    }
    weeks.push({
      week: w,
      vdot,
      vdot_offset: offset,
      target_km: target === null ? null : r2(target),
      planned_km: r2(qKm + easyTotal),
      quality_km: r2(qKm),
      easy_km: r2(easyTotal),
      easy_runs: easyDays.length,
      rest_days: 7 - qDays.length - easyDays.length,
      paces_per_km: pt.perZone,
    });
  }

  const sequence = [];
  const first = Math.max(...days.keys());
  const gaps = [];
  for (let d = first; d >= 1; d--) {
    if (days.has(d)) sequence.push(days.get(d));
    else {
      gaps.push(d);
      sequence.push({ before_race: d, week: null, day_in_week: null, kind: 'rest', rest_reason: 'framework_gap', runs: [] });
    }
  }
  if (gaps.length) warn('framework_gap_rest', 'days', `Framework does not prescribe days ${collapse(gaps)} before the race; planned as rest`);
  sequence.push({ before_race: 0, week: null, day_in_week: null, kind: 'race', runs: [] });

  return {
    schema_version: 1,
    framework: { title: framework.title, source: framework.source.label },
    athlete: {
      name: athlete.name,
      peak_week_km: r2(peakKm),
      units: athlete.preferences.units ?? 'metric',
      rest_weekdays: restWeekdays.map((i) => WEEKDAYS[i]),
      week_start: WEEKDAYS[weekStart],
      rest_day_numbers: restDayNumbers,
    },
    vdot: {
      baseline: base.vdot,
      from: { date: base.from.date, event: base.from.event, time: base.from.time },
      performances: base.performances.map((p) => ({ date: p.date, event: p.event, time: p.time, vdot: p.vdot })),
    },
    strides: opts.strides ?? null,
    weeks,
    days: sequence,
    issues,
  };
}

// ---------- CLI ----------

function parseStrides(text) {
  const out = {};
  for (const part of text.split(',')) {
    const [k, v] = part.split('=');
    out[k.trim()] = Number(v);
  }
  const strides = { count: out.count, seconds: out.seconds, recovery: out.recovery, days: out.days, cooldown: out.cooldown ?? 10 };
  for (const [k, v] of Object.entries(strides)) {
    if (!Number.isInteger(v) || v <= 0) throw new Error(`--strides needs positive integer ${k} (count,seconds,recovery,days[,cooldown])`);
  }
  return strides;
}

function usage() {
  return `Usage: node personalize.js <normalized.json> <athlete.yaml> [--out <plan.json>] [--json]
       [--week-start Sunday] [--strides count=8,seconds=20,recovery=60,days=2[,cooldown=10]]`;
}

function summary(p) {
  const lines = [`${p.athlete.name}: baseline VDOT ${p.vdot.baseline} (${p.vdot.from.event} ${p.vdot.from.time}, ${p.vdot.from.date})`, 'week  VDOT  target  planned  quality  easy  runs  rest'];
  for (const w of p.weeks) {
    lines.push(`${String(w.week).padStart(4)}  ${String(w.vdot).padStart(4)}  ${String(w.target_km ?? '-').padStart(6)}  ${String(w.planned_km).padStart(7)}  ${String(w.quality_km).padStart(7)}  ${String(w.easy_km).padStart(4)}  ${String(w.easy_runs).padStart(4)}  ${String(w.rest_days).padStart(4)}`);
  }
  for (const i of p.issues) lines.push(`warning ${i.code} [${i.where}]: ${i.message}`);
  return lines.join('\n');
}

function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  if (args.length < 2 || argv.includes('--help')) { console.log(usage()); return args.length < 2 ? 1 : 0; }
  const flagValues = new Set(['--out', '--week-start', '--strides'].map(flag).filter(Boolean));
  const [fwPath, athletePath] = args.filter((a) => !flagValues.has(a));
  const framework = JSON.parse(fs.readFileSync(fwPath, 'utf8'));
  const athlete = parseAthlete(fs.readFileSync(athletePath, 'utf8'));
  const strideText = flag('--strides');
  const result = plan(framework, athlete, { weekStart: flag('--week-start') ?? 'Sunday', strides: strideText ? parseStrides(strideText) : null });
  const out = flag('--out');
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  }
  console.log(argv.includes('--json') ? JSON.stringify(result, null, 2) : summary(result) + (out ? `\nWrote ${out}` : ''));
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`Error: ${e.message}`); process.exitCode = 1; }
}

module.exports = { plan, parseAthlete };
