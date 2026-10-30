#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DEFAULT_BATCH_SIZE = 20;

function fail(message) {
  throw new Error(message);
}

function finiteNonNegative(value, where) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${where} must be a finite nonnegative number`);
  }
  return value;
}

function roundedKm(value, where) {
  finiteNonNegative(value, where);
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
  if (value > 0 && rounded === 0) fail(`${where} rounds to 0.0 km`);
  return rounded;
}

function formatDistance(value, where) {
  return `${roundedKm(value, where).toFixed(1)}km`;
}

function formatDuration(minutes, where) {
  finiteNonNegative(minutes, where);
  const seconds = Math.round(minutes * 60);
  if (seconds <= 0) fail(`${where} must be at least one second`);
  return seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
}

function paceSeconds(pace) {
  const [minutes, seconds] = pace.split(':').map(Number);
  if (seconds >= 60) return null;
  return minutes * 60 + seconds;
}

function paceTarget(step, where) {
  if (step.pace_per_km != null) {
    if (typeof step.pace_per_km === 'object' && !Array.isArray(step.pace_per_km)) {
      const { min, max } = step.pace_per_km;
      if (typeof min !== 'string' || !/^\d+:\d{2}$/.test(min) || typeof max !== 'string' || !/^\d+:\d{2}$/.test(max)) {
        fail(`${where}.pace_per_km range endpoints must use m:ss format`);
      }
      const minSeconds = paceSeconds(min);
      const maxSeconds = paceSeconds(max);
      if (minSeconds === null || maxSeconds === null || minSeconds > maxSeconds) {
        fail(`${where}.pace_per_km range must have a faster min and slower max in m:ss format`);
      }
      return `${min}-${max}/km pace`;
    }
    if (typeof step.pace_per_km !== 'string' || !/^\d+:\d{2}$/.test(step.pace_per_km)) {
      fail(`${where}.pace_per_km must use m:ss format`);
    }
    if (paceSeconds(step.pace_per_km) === null) fail(`${where}.pace_per_km seconds must be less than 60`);
    return `${step.pace_per_km}/km pace`;
  }
  if (step.type === 'run' && step.intensity === 'ST' && step.reference_pace_per_km != null) {
    if (typeof step.reference_pace_per_km !== 'string' || !/^\d+:\d{2}$/.test(step.reference_pace_per_km)) {
      fail(`${where}.reference_pace_per_km must use m:ss format`);
    }
    if (paceSeconds(step.reference_pace_per_km) === null) fail(`${where}.reference_pace_per_km seconds must be less than 60`);
    return `${step.reference_pace_per_km}/km pace`;
  }
  if (step.type === 'run' && step.intensity === 'ST') return 'Z7 Pace';
  if (step.type === 'recovery' && step.mode !== 'rest') return 'Z1 Pace';
  fail(`${where} has no prescribed pace and no fallback applies`);
}

function formatAtomicStep(step, where) {
  if (!step || typeof step !== 'object') fail(`${where} must be a step object`);
  if (step.type !== 'run' && step.type !== 'recovery') fail(`${where}.type must be run or recovery`);
  if (step.type === 'recovery' && step.mode === 'rest') {
    return `- ${formatDuration(step.duration_min, `${where}.duration_min`)} intensity=rest`;
  }

  const target = paceTarget(step, where);
  if (step.distance_km != null) {
    return `- ${formatDistance(step.distance_km, `${where}.distance_km`)} ${target}`;
  }
  return `- ${formatDuration(step.duration_min, `${where}.duration_min`)} ${target}`;
}

function repeatBlocks(step, where) {
  if (!Number.isInteger(step.count) || step.count < 1) fail(`${where}.count must be a positive integer`);
  if (!Array.isArray(step.steps) || step.steps.length === 0) fail(`${where}.steps must be a non-empty array`);
  const workLines = step.steps.map((inner, index) => {
    if (inner.type === 'repeat') fail(`${where}/steps/${index}: nested repeats are not supported by Intervals.icu syntax`);
    return formatAtomicStep(inner, `${where}/steps/${index}`);
  });
  const recovery = step.recovery;

  if (!recovery) return [`Main ${step.count}x\n${workLines.join('\n')}`];
  if (recovery.placement !== 'between' && recovery.placement !== 'after_each') {
    fail(`${where}.recovery.placement must be between or after_each`);
  }
  const expectedRecoveryCount = recovery.placement === 'between' ? step.count - 1 : step.count;
  if (recovery.count !== expectedRecoveryCount) {
    fail(`${where}.recovery.count must be ${expectedRecoveryCount} for ${recovery.placement} placement`);
  }
  const recoveryLine = formatAtomicStep(recovery.step, `${where}/recovery/step`);

  if (recovery.placement === 'after_each') {
    return [`Main ${step.count}x\n${[...workLines, recoveryLine].join('\n')}`];
  }
  if (step.count === 1) return [`Main\n${workLines.join('\n')}`];
  return [
    `Main ${step.count - 1}x\n${[...workLines, recoveryLine].join('\n')}`,
    `Main\n${workLines.join('\n')}`,
  ];
}

function renderWorkoutSteps(steps, where = 'run.steps') {
  if (!Array.isArray(steps) || steps.length === 0) fail(`${where} must be a non-empty array`);
  const blocks = [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (step.type === 'repeat') {
      for (const text of repeatBlocks(step, `${where}/${index}`)) blocks.push({ text, section: null });
      continue;
    }

    const line = formatAtomicStep(step, `${where}/${index}`);
    const previous = blocks[blocks.length - 1];
    if (previous && previous.section === 'Main') previous.lines.push(line);
    else blocks.push({ section: 'Main', lines: [line] });
  }

  return blocks.map((block) => block.section === null ? block.text : `${block.section}\n${block.lines.join('\n')}`).join('\n\n');
}

function weekdayIndex(value) {
  if (typeof value !== 'string') fail('athlete.week_start must name a weekday');
  const key = value.trim().toLowerCase();
  const index = WEEKDAYS.findIndex((day) => day === key || day.slice(0, 3) === key);
  if (index < 0) fail(`unknown athlete.week_start: ${value}`);
  return index;
}

function validatePlan(plan) {
  if (!plan || plan.schema_version !== 1) fail('plan.schema_version must be 1');
  if (!plan.athlete || !plan.athlete.name || !plan.framework || !plan.framework.title) {
    fail('plan must include athlete.name and framework.title');
  }
  weekdayIndex(plan.athlete.week_start);
  if (!Array.isArray(plan.days) || plan.days.length === 0) fail('plan.days must be a non-empty array');

  const days = new Map();
  for (const day of plan.days) {
    if (!day || !Number.isInteger(day.before_race) || day.before_race < 0) {
      fail('every plan day must have a nonnegative integer before_race');
    }
    if (days.has(day.before_race)) fail(`duplicate plan day before_race=${day.before_race}`);
    if (!Array.isArray(day.runs)) fail(`day before_race=${day.before_race} must have a runs array`);
    days.set(day.before_race, day);
  }

  const firstBeforeRace = Math.max(...days.keys());
  if (firstBeforeRace < 1) fail('plan must include at least one pre-race day');
  for (let beforeRace = firstBeforeRace; beforeRace >= 0; beforeRace -= 1) {
    if (!days.has(beforeRace)) fail(`plan.days is missing before_race=${beforeRace}`);
  }
  return { days: [...days.values()].sort((a, b) => b.before_race - a.before_race), firstBeforeRace };
}

function convertPlan(plan, folderId) {
  if (!Number.isInteger(folderId) || folderId < 1) fail('--folder-id must be a positive integer');
  const { days, firstBeforeRace } = validatePlan(plan);
  const raceWeekday = weekdayIndex(plan.athlete.week_start);
  const workouts = [];

  for (const day of days) {
    const offset = firstBeforeRace - day.before_race;
    const weekday = WEEKDAYS[(raceWeekday - (day.before_race % 7) + 7) % 7];
    for (let index = 0; index < day.runs.length; index += 1) {
      const run = day.runs[index];
      if (!run || !Array.isArray(run.steps) || run.steps.length === 0) {
        fail(`day before_race=${day.before_race}, run ${index + 1} must have non-empty steps`);
      }
      finiteNonNegative(run.duration_min, `day ${day.before_race} run ${index + 1}.duration_min`);
      if (run.duration_min === 0) fail(`day ${day.before_race} run ${index + 1}.duration_min must be positive`);
      const distanceKm = roundedKm(run.distance_km, `day ${day.before_race} run ${index + 1}.distance_km`);
      const week = day.week == null ? 'Race week' : `W${day.week}`;
      const session = run.session_id || (run.kind === 'easy' ? 'Easy' : run.kind || 'Run');
      const suffix = day.runs.length > 1 ? ` #${index + 1}` : '';

      workouts.push({
        folder_id: folderId,
        name: `${week} ${session} - ${weekday[0].toUpperCase()}${weekday.slice(1)} (D-${day.before_race})${suffix}`,
        description: renderWorkoutSteps(run.steps, `day ${day.before_race} run ${index + 1}.steps`),
        workout_type: 'Run',
        day: offset,
        duration_seconds: Math.round(run.duration_min * 60),
        distance_meters: Math.round(distanceKm * 1000),
        target: 'PACE',
      });
    }
  }
  return workouts;
}

function parseArgs(argv) {
  const options = { folderId: null, batchSize: DEFAULT_BATCH_SIZE, batchIndex: null, input: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--folder-id') options.folderId = Number(argv[++index]);
    else if (arg === '--batch-size') options.batchSize = Number(argv[++index]);
    else if (arg === '--batch-index') options.batchIndex = Number(argv[++index]);
    else if (arg.startsWith('--')) fail(`unknown option: ${arg}`);
    else if (options.input === null) options.input = arg;
    else fail(`unexpected argument: ${arg}`);
  }
  if (options.help) return options;
  if (!options.input) fail('missing personalized plan JSON path');
  if (!Number.isInteger(options.folderId) || options.folderId < 1) fail('--folder-id must be a positive integer');
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > DEFAULT_BATCH_SIZE) {
    fail(`--batch-size must be between 1 and ${DEFAULT_BATCH_SIZE}`);
  }
  if (options.batchIndex !== null && (!Number.isInteger(options.batchIndex) || options.batchIndex < 0)) {
    fail('--batch-index must be a nonnegative integer');
  }
  return options;
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: node export-plan.js <plan.json> --folder-id <id> [--batch-size 20] [--batch-index 0]');
    return 0;
  }
  const plan = JSON.parse(fs.readFileSync(options.input, 'utf8'));
  const workouts = convertPlan(plan, options.folderId);
  if (options.batchIndex !== null) {
    const start = options.batchIndex * options.batchSize;
    if (start >= workouts.length) fail(`batch index ${options.batchIndex} is out of range`);
    const batch = workouts.slice(start, start + options.batchSize);
    console.log(JSON.stringify({ workouts: JSON.stringify(batch) }));
    return 0;
  }
  for (let start = 0; start < workouts.length; start += options.batchSize) {
    const batch = workouts.slice(start, start + options.batchSize);
    console.log(JSON.stringify({ workouts: JSON.stringify(batch) }));
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { convertPlan, formatAtomicStep, renderWorkoutSteps, roundedKm, validatePlan };