#!/usr/bin/env node
'use strict';
// Deterministic VDOT estimator: reads the "VDOT estimate" sheet of
// VDOT/VDOT system estimates.xlsx and linearly interpolates between rows.
// Zero dependencies (uses node:zlib to read the xlsx zip).

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DEFAULT_XLSX = path.resolve(__dirname, '../resources/VDOT system estimates.xlsx');
const SHEET_NAME = 'VDOT estimate';

const DISTANCE_ALIASES = {
  '1500 m': ['1500', '1500m', '1.5k', '1500 meters', 'metric mile'],
  '1 mile': ['mile', '1mi', '1 mi', '1mile'],
  '3000 m': ['3000', '3000m', '3k', '3 km'],
  '2 miles': ['2 mile', '2mi', '2 mi', '2miles'],
  '5000 m': ['5000', '5000m', '5k', '5 km'],
  '10000 m': ['10000', '10000m', '10k', '10 km'],
  '15000 m': ['15000', '15000m', '15k', '15 km'],
  'half marathon': ['half', 'hm', 'half-marathon', '21.1k', '21k', '13.1'],
  'marathon': ['full', 'fm', 'full marathon', '42.2k', '42k', '26.2'],
};

// ---------- xlsx reading ----------

function readZip(buf) {
  const entries = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid xlsx (zip) file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + compSize);
    entries[name] = () => (method === 0 ? data : zlib.inflateRawSync(data)).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const decodeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

function loadSheet(xlsxPath, sheetName = SHEET_NAME) {
  const zip = readZip(fs.readFileSync(xlsxPath));

  const shared = [];
  if (zip['xl/sharedStrings.xml']) {
    for (const si of zip['xl/sharedStrings.xml']().match(/<si>[\s\S]*?<\/si>/g) || []) {
      const texts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
      shared.push(texts.join(''));
    }
  }

  const stylesXml = zip['xl/styles.xml']();
  const cellXfs = stylesXml.match(/<cellXfs[\s\S]*?<\/cellXfs>/)[0];
  const styleNumFmt = [...cellXfs.matchAll(/<xf\b[^>]*>/g)].map((m) => Number(attr(m[0], 'numFmtId') || 0));

  const workbook = zip['xl/workbook.xml']();
  const sheetTag = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0])
    .find((t) => decodeXml(attr(t, 'name')) === sheetName);
  if (!sheetTag) throw new Error(`Sheet "${sheetName}" not found`);
  const rid = attr(sheetTag, 'r:id');
  const rels = zip['xl/_rels/workbook.xml.rels']();
  const relTag = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'Id') === rid);
  const target = attr(relTag, 'Target').replace(/^\/?(xl\/)?/, '');
  const sheetXml = zip[`xl/${target}`]();

  const rows = [];
  for (const rowM of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const cM of rowM[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cM[1];
      const col = attr(tag, 'r').replace(/\d+/g, '');
      const v = (cM[2] || '').match(/<v>([\s\S]*?)<\/v>/);
      if (!v) continue;
      const type = attr(tag, 't');
      const numFmt = styleNumFmt[Number(attr(tag, 's') || 0)];
      cells[col] = type === 's' ? { text: shared[Number(v[1])] } : { num: Number(v[1]), numFmt };
    }
    rows.push(cells);
  }
  return rows;
}

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
  const s = tenths % 60;
  const ss = (Number.isInteger(s) ? String(s) : s.toFixed(1)).padStart(Number.isInteger(s) ? 2 : 4, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// The sheet stores times inconsistently: numFmt 21 (h:mm:ss) cells are true
// Excel day fractions; numFmt 20/46 (h:mm, [h]:mm) cells hold min:sec typed as
// h:mm, so the value is 60x too large; text cells hold "m:ss.s" strings.
function cellSeconds(cell) {
  if (cell.text !== undefined) return parseTime(cell.text);
  if (cell.numFmt === 21) return cell.num * 86400;
  if (cell.numFmt === 20 || cell.numFmt === 46) return cell.num * 1440;
  throw new Error(`Unexpected number format ${cell.numFmt} for time cell`);
}

function buildTable(xlsxPath) {
  const rows = loadSheet(xlsxPath);
  const header = rows[0];
  const cols = Object.keys(header).filter((c) => c !== 'A');
  const distances = cols.map((c) => header[c].text.trim());
  const table = [];
  for (const r of rows.slice(1)) {
    if (!r.A) continue;
    const vdot = r.A.num ?? Number(r.A.text);
    const times = {};
    cols.forEach((c, i) => { if (r[c]) times[distances[i]] = Math.round(cellSeconds(r[c]) * 10) / 10; });
    table.push({ vdot, times });
  }
  table.sort((a, b) => a.vdot - b.vdot);
  // Sanity check: time must strictly decrease as VDOT increases.
  for (const d of distances) {
    for (let i = 1; i < table.length; i++) {
      if (!(table[i].times[d] < table[i - 1].times[d])) {
        throw new Error(`Table not monotonic for ${d} at VDOT ${table[i].vdot}; check the spreadsheet`);
      }
    }
  }
  return { distances, table };
}

// ---------- estimation ----------

function resolveDistance(input, distances) {
  const key = String(input).trim().toLowerCase().replace(/\s+/g, ' ');
  for (const d of distances) {
    if (d.toLowerCase() === key) return d;
    if ((DISTANCE_ALIASES[d] || []).includes(key)) return d;
  }
  throw new Error(`Unknown distance "${input}". Supported: ${distances.join(', ')}`);
}

function estimate({ distance, time, xlsx = DEFAULT_XLSX }) {
  const { distances, table } = buildTable(xlsx);
  const dist = resolveDistance(distance, distances);
  const seconds = parseTime(time);
  const first = table[0];
  const last = table[table.length - 1];
  const base = { distance: dist, time: formatTime(seconds), seconds };

  if (seconds > first.times[dist]) {
    return { ...base, vdot: null, status: 'below-table', message: `Slower than VDOT ${first.vdot} (${formatTime(first.times[dist])}); table minimum is ${first.vdot}` };
  }
  if (seconds < last.times[dist]) {
    return { ...base, vdot: null, status: 'above-table', message: `Faster than VDOT ${last.vdot} (${formatTime(last.times[dist])}); table maximum is ${last.vdot}` };
  }
  for (let i = 1; i < table.length; i++) {
    const lo = table[i - 1];
    const hi = table[i];
    const tLo = lo.times[dist];
    const tHi = hi.times[dist];
    if (seconds <= tLo && seconds >= tHi) {
      const frac = (tLo - seconds) / (tLo - tHi);
      const vdot = lo.vdot + frac * (hi.vdot - lo.vdot);
      return {
        ...base,
        vdot: Math.round(vdot * 10) / 10,
        vdotExact: vdot,
        status: 'ok',
        bracket: [
          { vdot: lo.vdot, time: formatTime(tLo) },
          { vdot: hi.vdot, time: formatTime(tHi) },
        ],
      };
    }
  }
  throw new Error('Interpolation failed');
}

// ---------- CLI ----------

function usage() {
  return [
    'Usage:',
    '  node vdot.js <distance> <time> [--json] [--xlsx <path>]',
    '  node vdot.js --table [--xlsx <path>]',
    '',
    'Examples:',
    '  node vdot.js "half marathon" 1:39:13',
    '  node vdot.js 5k 22:30 --json',
  ].join('\n');
}

function main(argv) {
  const args = [];
  let json = false;
  let showTable = false;
  let xlsx = DEFAULT_XLSX;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--table') showTable = true;
    else if (a === '--xlsx') xlsx = path.resolve(argv[++i]);
    else if (a === '-h' || a === '--help') { console.log(usage()); return 0; }
    else args.push(a);
  }

  if (showTable) {
    const { distances, table } = buildTable(xlsx);
    console.log(['VDOT', ...distances].join('\t'));
    for (const r of table) console.log([r.vdot, ...distances.map((d) => formatTime(r.times[d]))].join('\t'));
    return 0;
  }
  if (args.length !== 2) { console.error(usage()); return 2; }

  const result = estimate({ distance: args[0], time: args[1], xlsx });
  if (json) console.log(JSON.stringify(result, null, 2));
  else if (result.status === 'ok') {
    console.log(`VDOT ${result.vdot.toFixed(1)}  (${result.distance} in ${result.time}; between VDOT ${result.bracket[0].vdot} @ ${result.bracket[0].time} and VDOT ${result.bracket[1].vdot} @ ${result.bracket[1].time})`);
  } else console.log(`VDOT out of range: ${result.message}`);
  return result.status === 'ok' ? 0 : 3;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`Error: ${e.message}`); process.exitCode = 1; }
}

module.exports = { estimate, buildTable, loadSheet, parseTime, formatTime, DEFAULT_XLSX };
