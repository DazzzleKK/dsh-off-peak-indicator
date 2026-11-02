#!/usr/bin/env node
/**
 * Standalone smoke test for the client bundle. No DSH, no React, no network:
 * the classic script is evaluated with injected globals, its registered cell is
 * rendered against a frozen clock, and every field is compared with an
 * independently written expectation model.
 *
 * Run: node verify.cjs
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CODE = fs.readFileSync(path.join(__dirname, "client.js"), "utf8");
const MIN = 60000;

// ── the published rule, restated independently ────────────────────────────────
// Peak: 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday. Everything else is
// off-peak; weekends are off-peak all day.
const PEAK_BLOCKS = [
  [60, 240],
  [360, 600]
];

function isWeekendMs(ms) {
  const day = new Date(ms).getUTCDay();
  return day === 0 || day === 6;
}

function inPeakMs(ms) {
  if (isWeekendMs(ms)) return false;
  const date = new Date(ms);
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  return PEAK_BLOCKS.some(([start, end]) => minute >= start && minute < end);
}

function expectedState(ms) {
  if (inPeakMs(ms)) return "peak";
  return isWeekendMs(ms) ? "weekend" : "off-peak";
}

/** First minute-aligned instant that flips the state, scanning forward. */
function expectedTarget(ms) {
  const want = !inPeakMs(ms);
  let t = Math.ceil(ms / MIN) * MIN;
  for (let index = 0; index < 60 * 24 * 8; index++) {
    if (inPeakMs(t) === want) return t;
    t += MIN;
  }
  return null;
}

function expectedCountdown(ms) {
  let seconds = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(seconds / 86400);
  seconds -= days * 86400;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  const pad = (value) => (value < 10 ? "0" + value : String(value));
  if (days > 0) return days + "d " + hours + "h";
  if (hours > 0) return hours + "h " + pad(minutes) + "m";
  return minutes + "m " + pad(seconds) + "s";
}

/** The countdown the widget should print for one instant. */
function expectedMeta(ms) {
  const prefix = inPeakMs(ms) ? "off-peak in " : "peak in ";
  return prefix + expectedCountdown(expectedTarget(ms) - ms);
}

/** The label the widget should print for one state. */
function expectedLabel(state) {
  if (state === "peak") return "Peak";
  return state === "weekend" ? "Off-peak weekend" : "Off-peak";
}

// ── assertions ────────────────────────────────────────────────────────────────
let failures = 0;
function check(condition, label) {
  if (condition) return;
  failures += 1;
  console.error("FAIL: " + label);
}
function equal(actual, expected, label) {
  check(actual === expected, label + " (expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual) + ")");
}

// ── a fake clock the bundle cannot bypass ─────────────────────────────────────
let FROZEN = 0;
class FakeDate extends Date {
  constructor(...args) {
    super(...(args.length === 0 ? [FROZEN] : args));
  }
  static now() {
    return FROZEN;
  }
}

// ── a fake React: enough for the one component the bundle defines ─────────────
const fakeReact = {
  useState: (init) => [typeof init === "function" ? init() : init, () => {}],
  useEffect: () => {},
  createElement: (type, props, ...children) => ({ type, props: props || {}, children })
};

// ── load the classic script exactly as the browser would ─────────────────────
let factory = null;
const windowStub = {
  __ModuleLoader__: {
    load: (definition) => {
      factory = definition.factory;
    }
  }
};
const documentStub = {
  createElement: () => ({ dataset: {}, parentNode: null }),
  head: { appendChild: () => {} },
  documentElement: { getAttribute: () => "en" }
};

const run = new Function(
  "window",
  "document",
  "navigator",
  "console",
  "setInterval",
  "clearInterval",
  "Date",
  CODE
);
run(windowStub, documentStub, { language: "en" }, console, () => 0, () => {}, FakeDate);

check(factory !== null, "bundle registered with the module loader");
if (factory === null) process.exit(1);

const mod = factory((specifier) => (specifier === "react" ? fakeReact : undefined));
check(typeof mod.apply === "function", "exports.apply is a function");
check(Array.isArray(mod.inject) && mod.inject.length === 1 && mod.inject[0] === "slots", "exports.inject is ['slots']");

// ── apply against a fake slot service ────────────────────────────────────────
let entry = null;
const slotsStub = {
  inject: (key, callback) => {
    equal(key, "conversation.composer.dock", "slot key");
    callback();
  },
  register: (definition, component) => {
    entry = { definition, component };
  }
};
const ctxStub = {
  get: (name) => (name === "slots" ? slotsStub : undefined),
  effect: (fn) => fn()
};

mod.apply(ctxStub);
check(entry !== null, "exactly one entry was registered");
if (entry === null) process.exit(1);
equal(entry.definition.id, "off-peak-indicator", "entry id");
equal(entry.definition.order, -3, "entry order");

// ── render across eight days and compare every field ─────────────────────────
function render(ms) {
  FROZEN = ms;
  const element = entry.component();
  const pill = element.children[0];
  return {
    state: element.props["data-state"],
    pillClass: pill.props.className,
    dotClass: pill.children[0].props.className,
    label: pill.children[1].children.join(""),
    // createElement collects children into an array; React renders the single
    // string child as text, which is what the countdown carries.
    meta: pill.children[3].children.join(""),
    hint: element.props.title
  };
}

// 2026-09-24T00:00:00Z, stepping 13 minutes for eight days.
const START = Date.UTC(2026, 8, 24, 0, 0, 0);
const STEP = 13 * MIN;
const CASES = Math.floor((8 * 24 * 60) / 13);
let states = { peak: 0, "off-peak": 0, weekend: 0 };

for (let index = 0; index < CASES; index++) {
  const ms = START + index * STEP + 7000; // an off-boundary second, as a live clock would be
  const rendered = render(ms);
  const state = expectedState(ms);
  states[rendered.state] += 1;
  equal(rendered.state, state, "state at " + new Date(ms).toISOString());
  equal(rendered.label, expectedLabel(state), "label at " + new Date(ms).toISOString());
  equal(rendered.meta, expectedMeta(ms), "countdown at " + new Date(ms).toISOString());
  const target = expectedTarget(ms);
  check(target > ms, "target is in the future at " + new Date(ms).toISOString());
}

check(states.peak > 0 && states["off-peak"] > 0 && states.weekend > 0, "all three states were exercised");

// ── the exact boundaries the schedule turns on ───────────────────────────────
const BOUNDARIES = [
  Date.UTC(2026, 8, 24, 0, 59, 59, 0), // Sunday 00:59:59 UTC — weekend
  Date.UTC(2026, 8, 24, 1, 0, 0, 0), // Sunday: still weekend, not peak
  Date.UTC(2026, 8, 25, 1, 0, 0, 0), // Monday 01:00:00 — peak opens
  Date.UTC(2026, 8, 25, 3, 59, 59, 999), // Monday 03:59:59.999 — peak closes in 1ms
  Date.UTC(2026, 8, 25, 4, 0, 0, 0), // Monday 04:00 — gap
  Date.UTC(2026, 8, 25, 6, 0, 0, 0), // Monday 06:00 — second peak opens
  Date.UTC(2026, 8, 25, 10, 0, 0, 0), // Monday 10:00 — off-peak until Tuesday 01:00
  Date.UTC(2026, 8, 26, 0, 59, 59, 0), // Tuesday 00:59:59 — a minute before peak
  Date.UTC(2026, 8, 29, 10, 0, 0, 0) // Friday 10:00 — off-peak until Monday 01:00
];

for (const ms of BOUNDARIES) {
  const rendered = render(ms);
  equal(rendered.state, expectedState(ms), "boundary state at " + new Date(ms).toISOString());
  equal(rendered.meta, expectedMeta(ms), "boundary countdown at " + new Date(ms).toISOString());
  check(typeof rendered.hint === "string" && rendered.hint.length > 0, "tooltip present at " + new Date(ms).toISOString());
}

// ── structure and the tooltip ────────────────────────────────────────────────
const sample = render(START + 7000);
equal(sample.pillClass, "dshOffPeakPill", "pill wrapper class");
equal(sample.dotClass, "dshOffPeakDot", "dot class");

const hint = sample.hint;
check(typeof hint === "string" && hint.length > 0, "tooltip present");
check(hint.indexOf("01:00-04:00, 06:00-10:00") !== -1, "tooltip prints the UTC peak windows");
check(hint.indexOf("local time") !== -1, "tooltip prints the local windows");
check(/\([\w+-]+(?:\/[\w+-]+)+\)|\(UTC[+-]\d\d:\d\d\)/.test(hint), "tooltip names the timezone");

// The local window must be the UTC window shifted by this machine's own offset.
const localMatch = /peak hours: (\d\d):(\d\d)-(\d\d):(\d\d)/.exec(hint);
check(localMatch !== null, "tooltip local window is a HH:MM-HH:MM pair");
if (localMatch !== null) {
  const offsetMinutes = -new Date(START + 7000).getTimezoneOffset();
  const startMinute = (60 + offsetMinutes + 1440) % 1440;
  const expectedStart =
    String(Math.floor(startMinute / 60)).padStart(2, "0") + ":" + String(startMinute % 60).padStart(2, "0");
  equal(localMatch[1] + ":" + localMatch[2], expectedStart, "local window start matches the machine offset");
}

// A resumed page must survive a clock that is already deep in a peak block.
const midPeak = Date.UTC(2026, 8, 25, 7, 30, 0, 0);
const midPeakRendered = render(midPeak);
equal(midPeakRendered.meta, "off-peak in 2h 30m", "mid-peak countdown");

console.log(
  "checked " + CASES + " instants + " + BOUNDARIES.length + " boundaries; states seen: peak=" + states.peak +
    ", off-peak=" + states["off-peak"] + ", weekend=" + states.weekend
);
if (failures > 0) {
  console.error(failures + " check(s) failed");
  process.exit(1);
}
console.log("OK");
