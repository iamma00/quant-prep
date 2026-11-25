/**
 * Quant Org OS — application shell.
 *
 * Runs in two modes:
 *   • Tauri (desktop / Android): talks to the Rust backend for content,
 *     settings, updates and diagnostics.
 *   • Browser preview: loads the same seed bundle over HTTP and keeps settings
 *     in localStorage, so the UI can be reviewed without a build.
 *
 * No frameworks, no runtime network access for content, no telemetry.
 */

import { renderMarkdown, escapeHtml as h, toPlainText, slugify, sanitizeSvg } from "./markdown.js";

const APP_VERSION = "0.1.0";
const REPO_URL = "https://github.com/iamma00/quant-prep";
const RELEASES_URL = `${REPO_URL}/releases`;
const ISSUES_URL = `${REPO_URL}/issues`;
const DEFAULT_MANIFEST =
  "https://raw.githubusercontent.com/iamma00/quant-prep/main/updates/manifest.json";

const STORE = {
  settings: "qos.settings.v1",
  read: "qos.read.v1",
  checklists: "qos.checklists.v1",
  last: "qos.last.v1",
  parts: "qos.parts.v1",
};

const DEFAULT_SETTINGS = {
  schema_version: 1,
  theme: "system",
  font_scale: 1,
  density: "comfortable",
  reduce_motion: false,
  default_view: "home",
  manifest_url: DEFAULT_MANIFEST,
  auto_check: true,
};

const THEMES = ["system", "light", "dark", "sepia"];
const DENSITIES = ["comfortable", "compact"];
const VIEWS = [
  "home", "read", "levels", "tracks", "comp", "org",
  "checklists", "glossary", "settings", "about",
];

const DIAGRAMS = [
  { id: "org-current", title: "Current state · <100 people", note: "CEO over six pillars. HR removed; Operations retained. Finance is a lead role at this stage." },
  { id: "org-scaleup", title: "Scale-up · 100–250 people", note: "Functional C-suite, desk heads and platform groups appear as coordination cost rises." },
  { id: "org-multi", title: "Multi-pod / multi-office · 250–500 people", note: "Regional leadership, central risk, and a portfolio of desks and strategies." },
  { id: "desk", title: "A trading desk · 2–5 pods", note: "Desk head, PMs, traders and embedded risk/ops partners." },
  { id: "research-pod", title: "A research pod", note: "Research lead, QR/ML researchers and data engineering support." },
  { id: "platform", title: "Platform architecture", note: "Research, execution, data and control planes with their ownership boundaries." },
];

const PART_LABELS = {
  start: "Start here",
  "part-i": "Firm anatomy",
  "part-ii": "Domains & titles",
  "part-iii": "The unified ladder",
  "part-iv": "Career journeys",
  "part-v": "Executive design",
  "part-vi": "Governance",
  "part-vii": "Promotion & comp",
  "part-viii": "Hiring",
  "part-ix": "Org charts",
  "part-x": "Scaling playbook",
  appendices: "Appendices",
};

const TRACK_MODIFIER = {
  research: "Research",
  trading: "Trading",
  technology: "Technology",
  "data-ml": "Data / ML",
  risk: "Risk",
  "compliance-legal": "Compliance / Legal",
  finance: "Finance / Treasury",
  operations: "Operations",
  "product-business": "Product / Business",
};

const ICON_PATHS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 0 4 23z"/><path d="M4 5.5v15"/>',
  layers: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
  route: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h6a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8h8"/>',
  scale: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 7h6z"/><path d="m19 7 3 7h-6z"/><path d="M8 21h8"/>',
  org: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  glossary: '<path d="M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M18 8h2v12H8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 17h12v4H6z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 3v6h6"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M8 11h6M11 8v6"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M8 11h6"/>',
  maximize: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
  external: '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  github: '<path d="M9 19c-4 1.5-4-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  spark: '<path d="m12 3 2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
  alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 9v5"/><circle cx="12" cy="17.4" r="1" fill="currentColor" stroke="none"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>',
  wifiOff: '<path d="M5 12.5a10 10 0 0 1 5-2.6M14 10.1a10 10 0 0 1 5 2.4"/><path d="M8.5 16a5 5 0 0 1 4-1.3M15 15a5 5 0 0 1 1 .9"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/><path d="M3 3l18 18"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  hash: '<path d="M5 9h14M4 15h14"/><path d="M10 4 8 20M16 4l-2 16"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
};

function icon(name, cls = "") {
  const body = ICON_PATHS[name] || ICON_PATHS.info;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ""}>${body}</svg>`;
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, query) {
  const escaped = h(text);
  const tokens = [...new Set(String(query || "").toLowerCase().split(/\s+/).filter((t) => t.length > 1))];
  if (!tokens.length) return escaped;
  let out = escaped;
  for (const token of tokens) {
    out = out.replace(new RegExp(`(${escapeRegExp(h(token))})`, "gi"), "<mark>$1</mark>");
  }
  return out;
}

function truncate(value, length = 150) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1).trimEnd()}…`;
}

function parseRange(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, "").replace(/[()]/g, " ");
  const numbers = cleaned.match(/-?\d+(?:\.\d+)?/g);
  if (!numbers || !numbers.length) return null;
  const first = Number.parseFloat(numbers[0]);
  const second = numbers.length > 1 ? Number.parseFloat(numbers[1]) : first;
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return {
    min: Math.min(first, second),
    max: Math.max(first, second),
    mid: (first + second) / 2,
  };
}

function rangeLabel(range, suffix = "×") {
  if (!range) return "—";
  const digits = range.min < 1 ? 2 : 1;
  if (Math.abs(range.max - range.min) < 0.001) return `${range.mid.toFixed(digits)}${suffix}`;
  return `${range.min.toFixed(digits)}–${range.max.toFixed(digits)}${suffix}`;
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatUnix(seconds, withTime = false) {
  if (!seconds) return "—";
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function timeAgo(seconds) {
  if (!seconds) return "never";
  const delta = Math.max(0, Math.floor(Date.now() / 1000 - seconds));
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} h ago`;
  if (delta < 86400 * 7) return `${Math.floor(delta / 86400)} d ago`;
  return formatUnix(seconds);
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function readingMinutes(text) {
  return Math.max(1, Math.round(wordCount(text) / 220));
}

function trackShort(title) {
  return String(title || "").split(" (")[0];
}

function sourceLabel(source) {
  switch (source) {
    case "embedded": return "Bundled edition";
    case "seed": return "Bundled edition";
    case "installed": return "Installed update";
    case "update": return "Installed update";
    case "previous": return "Recovered previous edition";
    case "rollback": return "Rolled-back edition";
    default: return "Bundled edition";
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage can be unavailable in hardened webviews; the app still works. */
  }
}

function readLocal(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeLocal(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function sanitizeSettings(input) {
  const value = { ...DEFAULT_SETTINGS, ...(input && typeof input === "object" ? input : {}) };
  value.schema_version = 1;
  if (!THEMES.includes(value.theme)) value.theme = "system";
  const scale = Number(value.font_scale);
  value.font_scale = Number.isFinite(scale) ? clamp(Math.round(scale * 100) / 100, 0.85, 1.4) : 1;
  if (!DENSITIES.includes(value.density)) value.density = "comfortable";
  value.reduce_motion = Boolean(value.reduce_motion);
  if (!VIEWS.includes(value.default_view)) value.default_view = "home";
  value.auto_check = Boolean(value.auto_check);
  if (typeof value.manifest_url !== "string" || !value.manifest_url.trim()) {
    value.manifest_url = DEFAULT_MANIFEST;
  }
  value.manifest_url = value.manifest_url.trim().slice(0, 500);
  return value;
}

function loadLocalSettings() {
  return sanitizeSettings(loadJson(STORE.settings, {}));
}

function validateManifestUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return "That is not a valid URL.";
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    return "Updates must use HTTPS (HTTP is allowed only for localhost).";
  }
  if (url.username || url.password) return "URLs with embedded credentials are not allowed.";
  if (url.port && url.port !== "443" && url.port !== "80") {
    return "Only standard HTTPS/HTTP ports are allowed.";
  }
  return "";
}

async function copyText(text, label = "Copied to clipboard") {
  try {
    await navigator.clipboard.writeText(text);
    toast({ kind: "ok", title: label, timeout: 2400 });
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      toast({ kind: "ok", title: label, timeout: 2400 });
      return true;
    } catch {
      toast({ kind: "err", title: "Could not copy", message: "Select the text and copy it manually." });
      return false;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Backend bridge                                                             */
/* -------------------------------------------------------------------------- */

const TAURI = globalThis.__TAURI__;
const isTauri = Boolean(TAURI?.core?.invoke);

async function invoke(command, args) {
  if (!isTauri) throw new Error("This action is available in the installed app.");
  return TAURI.core.invoke(command, args);
}

function listen(event, handler) {
  if (!isTauri || !TAURI?.event?.listen) return () => {};
  return TAURI.event.listen(event, handler);
}

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

const state = {
  mode: isTauri ? "tauri" : "browser",
  seed: null,
  settings: loadLocalSettings(),
  read: new Set(loadJson(STORE.read, [])),
  checklists: loadJson(STORE.checklists, {}),
  lastChapter: readLocal(STORE.last),
  openParts: new Set(loadJson(STORE.parts, [])),
  update: null,
  updateBusy: false,
  searchIndex: [],
  route: { name: "home", param: null, query: new URLSearchParams() },
  online: navigator.onLine,
  bootstrap: null,
  contentMeta: null,
  viewAbort: null,
  comp: { band: 5, track: "research", perf: 1 },
  bootError: null,
};

let modalState = null;
let modalSeq = 0;
let saveTimer = null;

const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function effectiveTheme() {
  const theme = state.settings.theme;
  if (theme === "system") return darkQuery?.matches ? "dark" : "light";
  return ["light", "dark", "sepia"].includes(theme) ? theme : "light";
}

function applySettings() {
  const root = document.documentElement;
  const theme = effectiveTheme();
  root.dataset.theme = theme;
  root.dataset.density = state.settings.density;
  root.dataset.motion = state.settings.reduce_motion ? "reduce" : "normal";
  root.style.setProperty("--fs", String(state.settings.font_scale));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#081615" : theme === "sepia" ? "#f4ecd8" : "#f7f5ef");
  }
  const themeBtn = $("#theme-btn");
  if (themeBtn) {
    themeBtn.setAttribute("aria-label", `Theme: ${state.settings.theme}. Activate to change.`);
    themeBtn.setAttribute("title", `Theme: ${state.settings.theme}`);
  }
  const scaleLabel = $("#font-scale-value");
  if (scaleLabel) scaleLabel.textContent = `${Math.round(state.settings.font_scale * 100)}%`;
  $$("[data-theme-choice]").forEach((button) => {
    const active = button.dataset.themeChoice === state.settings.theme;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  $$("[data-density-choice]").forEach((button) => {
    const active = button.dataset.densityChoice === state.settings.density;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function persistSettings({ immediate = false } = {}) {
  if (saveTimer) clearTimeout(saveTimer);
  const write = async () => {
    if (isTauri && state.bootstrap) {
      try {
        const saved = await invoke("save_settings", { settings: state.settings });
        state.settings = sanitizeSettings(saved);
      } catch (error) {
        toast({ kind: "err", title: "Could not save settings", message: String(error) });
      }
    } else {
      saveJson(STORE.settings, state.settings);
    }
  };
  if (immediate) write();
  else saveTimer = setTimeout(write, 350);
}

/* -------------------------------------------------------------------------- */
/* Toasts and modals                                                          */
/* -------------------------------------------------------------------------- */

function toast({ title, message = "", kind = "info", timeout = 5200 }) {
  const root = $("#toasts");
  if (!root) return () => {};
  while (root.children.length >= 3) root.firstElementChild.remove();
  const iconName = kind === "ok" ? "checkCircle" : kind === "err" || kind === "warn" ? "alert" : "info";
  const element = document.createElement("div");
  element.className = `toast ${kind}`;
  element.innerHTML = `
    <span class="toast-icon">${icon(iconName)}</span>
    <div class="toast-body">
      <div class="toast-title">${h(title)}</div>
      ${message ? `<div class="toast-msg">${h(message)}</div>` : ""}
    </div>
    <button class="toast-close" type="button" aria-label="Dismiss">×</button>`;
  const remove = () => {
    if (!element.isConnected) return;
    element.classList.add("leaving");
    setTimeout(() => element.remove(), 210);
  };
  element.querySelector(".toast-close").addEventListener("click", remove);
  root.appendChild(element);
  if (timeout) setTimeout(remove, timeout);
  return remove;
}

function trapFocus(event, panel) {
  const focusable = $$(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    panel
  ).filter((element) => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function closeModal() {
  if (!modalState) return;
  const current = modalState;
  modalState = null;
  document.removeEventListener("keydown", current.keyHandler);
  if (current.root) current.root.innerHTML = "";
  document.body.classList.remove("modal-open");
  if (typeof current.onClose === "function") current.onClose();
}

function openModal({ title, sub = "", body = "", actions = [], wide = false, locked = false, onMount, onClose }) {
  closeModal();
  const root = $("#modal-root");
  if (!root) return () => {};
  const id = `modal-title-${++modalSeq}`;
  root.innerHTML = `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal${wide ? " modal-wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="${id}">
        <div class="modal-head">
          <div>
            <div class="modal-title" id="${id}">${h(title)}</div>
            ${sub ? `<div class="modal-sub">${h(sub)}</div>` : ""}
          </div>
          <button class="icon-btn" type="button" data-modal-close aria-label="Close">${icon("close")}</button>
        </div>
        <div class="modal-body">${body}</div>
        ${actions.length ? `<div class="modal-foot">${actions
          .map((action, index) => `<button class="btn ${action.kind || "btn-ghost"}" type="button" data-modal-action="${index}">${action.label}</button>`)
          .join("")}</div>` : ""}
      </div>
    </div>`;

  const panel = $(".modal", root);
  const backdrop = $("[data-modal-backdrop]", root);
  const keyHandler = (event) => {
    if (event.key === "Escape" && !locked) {
      event.preventDefault();
      closeModal();
    } else if (event.key === "Tab") {
      trapFocus(event, panel);
    }
  };
  document.addEventListener("keydown", keyHandler);
  modalState = { root, keyHandler, onClose };
  document.body.classList.add("modal-open");

  const closeButton = $("[data-modal-close]", panel);
  if (closeButton) closeButton.addEventListener("click", () => closeModal());
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop && !locked) closeModal();
  });
  actions.forEach((action, index) => {
    const button = $(`[data-modal-action="${index}"]`, panel);
    if (button) {
      button.addEventListener("click", () => {
        if (typeof action.onClick === "function") action.onClick(closeModal, panel);
        else closeModal();
      });
    }
  });
  if (typeof onMount === "function") onMount(panel, closeModal);
  setTimeout(() => {
    const focusable = $("input, select, textarea, button", panel);
    if (focusable && document.activeElement !== focusable) focusable.focus();
  }, 40);
  return closeModal;
}

function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false, details = "" }) {
  return new Promise((resolve) => {
    let settled = false;
    openModal({
      title,
      body: `<p>${message}</p>${details ? `<div class="callout ${danger ? "red" : "teal"} mt-2">${details}</div>` : ""}`,
      actions: [
        {
          label: "Cancel",
          kind: "btn-ghost",
          onClick: (close) => {
            settled = true;
            close();
            resolve(false);
          },
        },
        {
          label: confirmLabel,
          kind: danger ? "btn-danger" : "btn-primary",
          onClick: (close) => {
            settled = true;
            close();
            resolve(true);
          },
        },
      ],
      onClose: () => {
        if (!settled) resolve(false);
      },
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Content access                                                             */
/* -------------------------------------------------------------------------- */

function flatChapters() {
  if (!state.seed) return [];
  return state.seed.parts.flatMap((part) => part.chapters.map((chapter) => ({ ...chapter, part })));
}

function findChapter(id) {
  return flatChapters().find((chapter) => chapter.id === id) || null;
}

function chapterNeighbours(id) {
  const chapters = flatChapters();
  const index = chapters.findIndex((chapter) => chapter.id === id);
  return {
    index,
    total: chapters.length,
    previous: index > 0 ? chapters[index - 1] : null,
    next: index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : null,
  };
}

function chapterByNumber(number) {
  return flatChapters().find((chapter) => chapter.number === number) || null;
}

function partLabel(part) {
  if (!part) return "";
  if (part.roman) return `Part ${part.roman} · ${PART_LABELS[part.id] || part.title}`;
  return PART_LABELS[part.id] || part.title;
}

function bandBadge(band) {
  return `<span class="band-badge" data-band="${Number(band)}">L${Number(band)}</span>`;
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

const NAV_ITEMS = [
  { key: "home", label: "Home", href: "#/home", icon: "home" },
  { key: "read", label: "Read the manual", href: "#/read", icon: "book" },
  { key: "levels", label: "Levels & bands", href: "#/levels", icon: "layers", badge: "10" },
  { key: "tracks", label: "Career tracks", href: "#/tracks", icon: "route", badge: "9" },
  { key: "comp", label: "Compensation", href: "#/comp", icon: "scale" },
  { key: "org", label: "Org charts", href: "#/org", icon: "org", badge: "6" },
  { key: "checklists", label: "Checklists", href: "#/checklists", icon: "check", badge: "2" },
  { key: "glossary", label: "Glossary", href: "#/glossary", icon: "glossary" },
];

function renderSideNav() {
  const nav = $("#side-nav");
  if (!nav) return;
  const extra = [
    { key: "settings", label: "Settings", href: "#/settings", icon: "settings" },
    { key: "about", label: "About & source", href: "#/about", icon: "info" },
  ];
  nav.innerHTML = [...NAV_ITEMS, ...extra]
    .map((item) => `
      <a class="side-link" href="${item.href}" data-nav="${item.key}">
        ${icon(item.icon)}
        <span>${h(item.label)}</span>
        ${item.badge ? `<span class="side-badge">${h(item.badge)}</span>` : ""}
      </a>`)
    .join("");
}

function renderContents() {
  const container = $("#contents");
  if (!container || !state.seed) return;
  const activeId = state.route.name === "read" ? state.route.param : "";
  if (!state.openParts.size) {
    const active = activeId ? findChapter(activeId) : null;
    state.openParts.add(active?.part?.id || (state.lastChapter && findChapter(state.lastChapter)?.part?.id) || "part-i");
  }
  container.innerHTML = state.seed.parts
    .map((part) => {
      const open = state.openParts.has(part.id) || part.chapters.some((chapter) => chapter.id === activeId);
      return `
        <div class="part-group${open ? " open" : ""}" data-part-group="${h(part.id)}">
          <button class="part-toggle" type="button" data-action="toggle-part" data-part="${h(part.id)}" aria-expanded="${open ? "true" : "false"}">
            <span>${part.roman ? `${h(part.roman)} · ` : ""}${h(PART_LABELS[part.id] || part.title)}</span>
            <span class="part-count">${part.chapters.length}</span>
            <span class="part-chevron">${icon("chevronDown")}</span>
          </button>
          <div class="chapter-list">
            ${part.chapters
              .map((chapter) => `
                <a class="chapter-link${chapter.id === activeId ? " active" : ""}${state.read.has(chapter.id) ? " read" : ""}" href="#/read/${h(chapter.id)}" data-chapter-link="${h(chapter.id)}">
                  <span class="ch-num">${chapter.number ?? "·"}</span>
                  <span>${h(chapter.title)}</span>
                </a>`)
              .join("")}
          </div>
        </div>`;
    })
    .join("");
  const activeLink = $(".chapter-link.active", container);
  if (activeLink) {
    setTimeout(() => activeLink.scrollIntoView({ block: "nearest" }), 30);
  }
}

function updateNavActive() {
  const name = state.route.name;
  $$("#side-nav .side-link").forEach((link) => {
    const active = link.dataset.nav === name;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  $$("#mobile-tabs [data-tab]").forEach((tab) => {
    const key = tab.dataset.tab;
    const active = key === name || (key === "read" && name === "read");
    tab.classList.toggle("active", active);
  });
}

function updateVersionPill() {
  const pill = $("#version-pill");
  if (!pill || !state.seed) return;
  pill.textContent = `v${state.seed.content_version}`;
  const source = state.contentMeta?.source || "embedded";
  pill.title = `${sourceLabel(source)} · ${formatBytes(state.contentMeta?.bytes)} · ${state.seed.stats?.chapters || 0} chapters`;
}

function updateSourceLabel() {
  const label = $("#source-label");
  const dot = $("#source-dot");
  const meta = $("#sidebar-meta");
  if (!state.seed) return;
  const source = state.contentMeta?.source || "embedded";
  if (label) label.textContent = sourceLabel(source);
  if (dot) dot.classList.toggle("seed", source === "embedded" || source === "seed");
  if (meta) {
    const bits = [
      `${state.seed.stats?.chapters || 0} chapters`,
      `${state.seed.stats?.tracks || 9} tracks`,
      state.mode === "browser" ? "browser preview" : "offline ready",
    ];
    meta.textContent = bits.join(" · ");
  }
}

function updateNetPill() {
  const pill = $("#net-pill");
  if (!pill) return;
  pill.classList.toggle("is-offline", !state.online);
  const label = $(".net-label", pill);
  if (label) label.textContent = state.online ? "Offline ready" : "Offline mode";
  pill.title = state.online
    ? "All content is available without a connection"
    : "You are offline. Everything still works.";
}

function updateUpdateButton() {
  const button = $("#update-btn");
  if (!button) return;
  const available = Boolean(state.update?.available);
  button.hidden = !available;
  button.title = available ? `Content update available: v${state.update.remote_version}` : "Content updates";
}

function renderShell() {
  renderSideNav();
  renderContents();
  updateNavActive();
  updateVersionPill();
  updateSourceLabel();
  updateNetPill();
  updateUpdateButton();
}

function openSidebar() {
  const sidebar = $("#sidebar");
  const backdrop = $("#sidebar-backdrop");
  if (!sidebar) return;
  sidebar.classList.add("open");
  if (backdrop) backdrop.hidden = false;
  $("#menu-btn")?.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  const sidebar = $("#sidebar");
  const backdrop = $("#sidebar-backdrop");
  if (!sidebar) return;
  sidebar.classList.remove("open");
  if (backdrop) backdrop.hidden = true;
  $("#menu-btn")?.setAttribute("aria-expanded", "false");
}

/* -------------------------------------------------------------------------- */
/* Routing                                                                    */
/* -------------------------------------------------------------------------- */

function parseRoute() {
  const raw = location.hash || `#/${state.settings.default_view || "home"}`;
  const body = raw.replace(/^#\/?/, "");
  const [pathPart, queryPart = ""] = body.split("?");
  const segments = pathPart.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  const query = new URLSearchParams(queryPart);
  let name = segments[0] || state.settings.default_view || "home";
  if (!VIEWS.includes(name)) name = "home";
  let param = segments[1] || null;
  if (name === "read" && !param) {
    param = state.lastChapter || flatChapters()[0]?.id || null;
  }
  if (name === "org" && !param) param = DIAGRAMS[0].id;
  if (name === "levels" && param) {
    const match = param.match(/l?(\d)/i);
    param = match ? `L${match[1]}` : null;
  }
  return { name, param, query, anchor: query.get("h") || "" };
}

function navigate(hash, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, "", hash);
    renderRoute();
  } else if (location.hash === hash) {
    renderRoute();
  } else {
    location.hash = hash;
  }
}

function scrollToAnchor(anchor) {
  if (!anchor) return;
  const target = document.getElementById(anchor);
  if (!target) return;
  const main = $("#main");
  if (!main) return;
  const top = target.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 90;
  main.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  target.classList.add("anchor-flash");
  setTimeout(() => target.classList.remove("anchor-flash"), 1600);
}

function renderError(container, error) {
  const message = error?.message ? String(error.message) : String(error);
  container.innerHTML = `
    <div class="page">
      <div class="card error-card">
        <div class="card-kicker">Something went wrong</div>
        <h1 class="read-title" style="font-size:1.7rem">This view could not be rendered</h1>
        <p class="muted">The content is still safe on disk. Reload the view, or open the diagnostics in Settings if the problem repeats.</p>
        <pre>${h(message)}</pre>
        <div class="hero-actions">
          <button class="btn btn-primary" type="button" data-action="reload">Reload the app</button>
          <a class="btn btn-ghost" href="#/settings">Open settings</a>
        </div>
      </div>
    </div>`;
}

function renderRoute() {
  if (!state.seed) return;
  if (state.viewAbort) state.viewAbort.abort();
  const controller = new AbortController();
  state.viewAbort = controller;

  const route = parseRoute();
  state.route = route;
  updateNavActive();
  renderContents();
  closeSidebar();

  const main = $("#main");
  if (!main) return;
  let view;
  try {
    switch (route.name) {
      case "read": view = viewRead(route, controller.signal); break;
      case "levels": view = viewLevels(route); break;
      case "tracks": view = viewTracks(route); break;
      case "comp": view = viewComp(route); break;
      case "org": view = viewOrg(route, controller.signal); break;
      case "checklists": view = viewChecklists(controller.signal); break;
      case "glossary": view = viewGlossary(route); break;
      case "settings": view = viewSettings(route, controller.signal); break;
      case "about": view = viewAbout(); break;
      default: view = viewHome();
    }
    main.innerHTML = view.html;
    document.title = view.title ? `${view.title} · Quant Org OS` : "Quant Org OS";
    main.scrollTop = 0;
    if (typeof view.mount === "function") view.mount(main, route, controller.signal);
    if (route.anchor) requestAnimationFrame(() => scrollToAnchor(route.anchor));
    else if (document.activeElement !== document.body) main.focus({ preventScroll: true });
  } catch (error) {
    renderError(main, error);
  }
}

/* -------------------------------------------------------------------------- */
/* Reusable view pieces                                                       */
/* -------------------------------------------------------------------------- */

function pageHead({ eyebrow, title, lede, actions = "", className = "" }) {
  return `
    <header class="${className || "read-head"}">
      ${eyebrow ? `<div class="eyebrow">${h(eyebrow)}</div>` : ""}
      <h1 class="read-title">${h(title)}</h1>
      ${lede ? `<p class="lede">${lede}</p>` : ""}
      ${actions ? `<div class="hero-actions">${actions}</div>` : ""}
    </header>`;
}

function updateBanner() {
  if (!state.update?.available) return "";
  return `
    <div class="banner mb-3">
      <span class="banner-icon">${icon("download")}</span>
      <div class="banner-body">
        <div class="banner-title">Content update available · v${h(state.update.remote_version)}</div>
        <div class="banner-text">${h(truncate(state.update.notes, 140))}</div>
      </div>
      <div class="banner-actions">
        <a class="btn btn-sm btn-ghost" href="#/settings">Details</a>
        <button class="btn btn-sm btn-primary" type="button" data-action="install-update">Install</button>
      </div>
    </div>`;
}

function trackDots(track) {
  return `<span class="track-dots" aria-hidden="true">${[0, 1, 2, 3, 4, 5, 6, 7, 8]
    .map((band) => `<span class="track-dot" data-band="${band}" title="L${band}"></span>`)
    .join("")}</span>`;
}

/* -------------------------------------------------------------------------- */
/* Home                                                                       */
/* -------------------------------------------------------------------------- */

function viewHome() {
  const seed = state.seed;
  const home = seed.home || {};
  const stats = seed.stats || {};
  const continueChapter = state.lastChapter ? findChapter(state.lastChapter) : null;
  const startChapter = continueChapter || flatChapters()[0];
  const facts = (home.facts || []).map((fact) => `
    <div class="card fact-card">
      <div class="fact-label">${h(fact.label)}</div>
      <div class="fact-value">${h(fact.value)}</div>
      <div class="fact-note">${h(fact.note)}</div>
    </div>`).join("");

  const rules = (home.rules || []).map((rule, index) => `
    <div class="card rule-card">
      <span class="rule-num">${index + 1}</span>
      <p>${h(rule)}</p>
    </div>`).join("");

  const journeys = [
    {
      kicker: "Individual contributor",
      title: "Own a signal, a system, or a book",
      text: "Start with the track ladder, then read the band definitions that govern scope and autonomy.",
      href: "#/tracks",
      cta: "Choose your track",
    },
    {
      kicker: "Manager",
      title: "Multiply other people's output",
      text: "The L4 fork, L5 desk leadership and L6 function ownership are where leverage changes shape.",
      href: "#/levels/L5",
      cta: "See the manager bands",
    },
    {
      kicker: "Executive",
      title: "Design the firm, not just the work",
      text: "C-suite scope, committees, capital allocation and succession — with a minimum-viable path.",
      href: "#/levels/L8",
      cta: "See the C-suite",
    },
  ].map((item) => `
    <a class="card card-hover card-link" href="${item.href}">
      <div class="card-kicker">${h(item.kicker)}</div>
      <h3>${h(item.title)}</h3>
      <p>${h(item.text)}</p>
      <span class="link-arrow mt-2">${h(item.cta)} ${icon("arrowRight")}</span>
    </a>`).join("");

  const tracks = seed.tracks.map((track) => `
    <a class="card card-hover card-link track-card" href="#/tracks/${h(track.id)}">
      <div class="track-card-top">
        <span class="track-num">${String(track.number).padStart(2, "0")}</span>
        ${trackDots(track)}
      </div>
      <h3>${h(trackShort(track.title))}</h3>
      <p>${h(truncate(track.entry_points, 130))}</p>
      <span class="link-arrow mt-2">Open the ladder ${icon("arrowRight")}</span>
    </a>`).join("");

  const bands = [...seed.levels].sort((a, b) => b.band - a.band).map((level) => `
    <a class="band-tile" href="#/levels/${level.code}">
      ${bandBadge(level.band)}
      <span class="band-tile-title">${h(level.title)}</span>
      <span class="band-tile-owns">${h(truncate(level.owns, 42))}</span>
    </a>`).join("");

  const html = `
    <div class="page page-wide">
      ${updateBanner()}
      <section class="hero">
        <div class="eyebrow">${h(home.eyebrow || "The Quant Firm Operating System")}</div>
        <h1>${h(home.title || "Nine tracks. Ten bands. One firm.")}</h1>
        <p class="lede">${h(home.lede || "")}</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="#/read/${h(startChapter?.id || "")}">
            ${continueChapter ? "Continue reading" : "Start reading"} ${icon("arrowRight")}
          </a>
          <a class="btn btn-ghost btn-lg" href="#/levels">Find your band</a>
          <a class="btn btn-ghost btn-lg" href="#/comp">Compensation model</a>
        </div>
        <div class="hero-meta">
          <span><strong>${stats.chapters || 0}</strong> chapters</span>
          <span><strong>${stats.tracks || 9}</strong> tracks</span>
          <span><strong>${stats.levels || 10}</strong> bands</span>
          <span><strong>${(stats.words || 0).toLocaleString()}</strong> words</span>
          <span><strong>${stats.glossary || 0}</strong> terms</span>
        </div>
      </section>

      <section class="mt-4">
        <div class="grid grid-4">${facts}</div>
      </section>

      ${continueChapter ? `
        <section class="mt-4">
          <a class="card card-hover card-link continue-card" href="#/read/${h(continueChapter.id)}">
            <div>
              <div class="card-kicker">Pick up where you left off</div>
              <h3>${h(continueChapter.title)}</h3>
              <p>${h(partLabel(continueChapter.part))} · ${readingMinutes(toPlainText(continueChapter.markdown))} min read</p>
            </div>
            <span class="btn btn-soft">Resume ${icon("arrowRight")}</span>
          </a>
        </section>` : ""}

      <section class="mt-4">
        <div class="section-head">
          <div>
            <h2>Three rules for reading it</h2>
            <p>The assumptions that keep the framework honest.</p>
          </div>
        </div>
        <div class="grid grid-3">${rules}</div>
      </section>

      <section class="mt-4">
        <div class="section-head">
          <div>
            <h2>Start with your seat</h2>
            <p>Three entry points into the same system.</p>
          </div>
        </div>
        <div class="grid grid-3">${journeys}</div>
      </section>

      <section class="mt-4">
        <div class="section-head">
          <div>
            <h2>Nine tracks</h2>
            <p>Every function except HR. Operations retained as its own track.</p>
          </div>
          <a class="link-arrow" href="#/tracks">All tracks ${icon("arrowRight")}</a>
        </div>
        <div class="grid grid-3">${tracks}</div>
      </section>

      <section class="mt-4">
        <div class="section-head">
          <div>
            <h2>The ten bands</h2>
            <p>Scope, autonomy and impact horizon — not tenure.</p>
          </div>
          <a class="link-arrow" href="#/levels">Explore the ladder ${icon("arrowRight")}</a>
        </div>
        <div class="band-grid">${bands}</div>
      </section>

      <section class="mt-4">
        <div class="grid grid-2">
          <div class="card card-lg">
            <div class="card-kicker">What's inside</div>
            <h3>An operating manual, not a poster</h3>
            <p class="mt-1">Band definitions, nine track ladders, title translation across firm types, compensation architecture, governance, hiring loops, org charts and edge cases. Every chapter is readable offline.</p>
            <div class="mini-stats mt-3">
              <div><strong>${stats.parts || 12}</strong><span>parts</span></div>
              <div><strong>${seed.checklists?.length || 2}</strong><span>checklists</span></div>
              <div><strong>${Object.keys(seed.diagrams || {}).length || 6}</strong><span>diagrams</span></div>
              <div><strong>${seed.kpis?.rows?.length || 43}</strong><span>KPIs</span></div>
            </div>
          </div>
          <div class="card card-lg">
            <div class="card-kicker">Companion files</div>
            <h3>Take it into the room</h3>
            <p class="mt-1">The repository ships a formula-driven Excel leveling matrix and a printable A3 career map alongside this app.</p>
            <div class="link-list mt-2">
              <a class="link-row" href="${REPO_URL}/blob/main/quant-org-leveling-matrix.xlsx" data-external="1">${icon("download")} Leveling matrix (Excel)<span class="link-row-sub">12 sheets</span></a>
              <a class="link-row" href="${REPO_URL}/blob/main/quant-org-career-map.pdf" data-external="1">${icon("download")} Career map (PDF)<span class="link-row-sub">A3</span></a>
              <a class="link-row" href="${REPO_URL}" data-external="1">${icon("github")} Source on GitHub<span class="link-row-sub">MIT</span></a>
            </div>
          </div>
        </div>
      </section>

      <footer class="page-foot">
        <span>Offline-first · no telemetry · MIT licensed</span>
        <span>Content v${h(seed.content_version)} · app v${APP_VERSION}</span>
      </footer>
    </div>`;

  return { html, title: "" };
}

/* -------------------------------------------------------------------------- */
/* Reader                                                                     */
/* -------------------------------------------------------------------------- */

function viewRead(route, signal) {
  const chapter = findChapter(route.param) || flatChapters()[0];
  if (!chapter) throw new Error("No chapters were found in this content bundle.");
  const { previous, next, index, total } = chapterNeighbours(chapter.id);
  const plain = toPlainText(chapter.markdown);
  const isRead = state.read.has(chapter.id);
  const diagramCount = (chapter.markdown.match(/\[\[diagram:/g) || []).length;

  const html = `
    <div class="page page-reader">
      <div class="read-progress-track"><div class="read-progress-bar" id="read-progress"></div></div>
      <div class="reader-layout">
        <div class="reader-main">
          <header class="read-head">
            <div class="read-part">${h(partLabel(chapter.part))}${chapter.number ? ` · Chapter ${chapter.number}` : ""}</div>
            <h1 class="read-title">${h(chapter.title)}</h1>
            <div class="read-meta">
              <span>${plural(wordCount(plain), "word")}</span>
              <span>${readingMinutes(plain)} min read</span>
              <span>${index + 1} of ${total}</span>
              ${diagramCount ? `<span>${plural(diagramCount, "diagram")}</span>` : ""}
              <span id="read-state">${isRead ? "Read" : "Not yet marked read"}</span>
            </div>
            <div class="read-tools">
              <button class="btn btn-ghost" type="button" data-action="toggle-read" data-id="${h(chapter.id)}">
                ${icon("check")} <span data-read-label>${isRead ? "Mark unread" : "Mark read"}</span>
              </button>
              <button class="btn btn-ghost" type="button" data-action="print">${icon("print")} Print</button>
              <button class="btn btn-ghost" type="button" data-action="copy-link">${icon("link")} Copy link</button>
              <a class="btn btn-ghost" href="#/settings">${icon("settings")} Reading settings</a>
            </div>
          </header>

          <article class="article" id="article">${renderMarkdown(chapter.markdown, state.seed.diagrams || {})}</article>

          <div class="chapter-end">
            <span class="muted small">${isRead ? "You have marked this chapter read." : "Finished? Mark it read to track your progress."}</span>
            <button class="btn btn-soft btn-sm" type="button" data-action="toggle-read" data-id="${h(chapter.id)}">
              ${icon("check")} <span data-read-label>${isRead ? "Mark unread" : "Mark read"}</span>
            </button>
          </div>

          <nav class="reader-nav" aria-label="Chapter navigation">
            ${previous ? `<a href="#/read/${h(previous.id)}"><span class="rn-label">Previous</span><span class="rn-title">${h(previous.title)}</span></a>` : `<span></span>`}
            ${next ? `<a class="next" href="#/read/${h(next.id)}"><span class="rn-label">Next</span><span class="rn-title">${h(next.title)}</span></a>` : `<span></span>`}
          </nav>
        </div>
        <aside class="toc" id="toc" aria-label="On this page"></aside>
      </div>
    </div>`;

  function mount(main, _route, signal) {
    const article = $("#article", main);
    const toc = $("#toc", main);
    if (!article) return;
    state.lastChapter = chapter.id;
    writeLocal(STORE.last, chapter.id);

    const headings = $$("h2, h3", article).filter((heading) => heading.id);
    if (toc) {
      toc.innerHTML = headings.length
        ? `<div class="toc-head">On this page</div><ul class="toc-list">${headings
            .map((heading) => `<li class="${heading.tagName === "H3" ? "toc-h3" : ""}"><a href="#${h(heading.id)}" data-toc="${h(heading.id)}">${h(heading.textContent)}</a></li>`)
            .join("")}</ul>`
        : `<div class="toc-head">On this page</div><p class="faint small">This chapter has no subsections.</p>`;
      toc.addEventListener("click", (event) => {
        const link = event.target.closest("[data-toc]");
        if (!link) return;
        event.preventDefault();
        scrollToAnchor(link.dataset.toc);
        history.replaceState(null, "", `#/read/${chapter.id}?h=${encodeURIComponent(link.dataset.toc)}`);
      }, { signal });
    }

    const progress = $("#read-progress", main);
    const markAtEnd = () => {
      if (!state.read.has(chapter.id)) {
        markRead(chapter.id, true, { quiet: true });
        const stateLabel = $("#read-state", main);
        if (stateLabel) stateLabel.textContent = "Read";
      }
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const max = main.scrollHeight - main.clientHeight;
        const ratio = max > 0 ? clamp(main.scrollTop / max, 0, 1) : 1;
        if (progress) progress.style.width = `${ratio * 100}%`;
        if (ratio >= 0.9) markAtEnd();
        if (toc) {
          let current = null;
          for (const heading of headings) {
            const top = heading.getBoundingClientRect().top - main.getBoundingClientRect().top;
            if (top <= 140) current = heading.id;
            else break;
          }
          $$("[data-toc]", toc).forEach((link) => {
            link.classList.toggle("active", link.dataset.toc === current);
          });
        }
      });
    };
    main.addEventListener("scroll", onScroll, { passive: true, signal });
    onScroll();

    // Open external links in the system browser rather than inside the app.
    article.addEventListener("click", (event) => {
      const link = event.target.closest("a[data-external], a[href^='http']");
      if (!link) return;
      event.preventDefault();
      openExternal(link.href);
    }, { signal });

    // Copy buttons on code blocks.
    article.addEventListener("click", (event) => {
      const button = event.target.closest("[data-copy-code]");
      if (!button) return;
      const code = button.parentElement?.querySelector("code");
      if (code) copyText(code.textContent, "Code copied");
    }, { signal });

    if (route.anchor) setTimeout(() => scrollToAnchor(route.anchor), 60);
  }

  return { html, title: chapter.title, mount };
}

function markRead(id, value, { quiet = false } = {}) {
  if (value) state.read.add(id);
  else state.read.delete(id);
  saveJson(STORE.read, [...state.read]);
  $$(`[data-chapter-link="${CSS.escape(id)}"]`).forEach((link) => link.classList.toggle("read", value));
  $$(`[data-action="toggle-read"][data-id="${CSS.escape(id)}"]`).forEach((button) => {
    const label = $("[data-read-label]", button);
    if (label) label.textContent = value ? "Mark unread" : "Mark read";
  });
  const stateLabel = $("#read-state");
  if (stateLabel) stateLabel.textContent = value ? "Read" : "Not yet marked read";
  if (!quiet) toast({ kind: value ? "ok" : "info", title: value ? "Marked as read" : "Marked unread", timeout: 2200 });
}

/* -------------------------------------------------------------------------- */
/* Levels                                                                     */
/* -------------------------------------------------------------------------- */

function viewLevels(route) {
  const levels = [...state.seed.levels].sort((a, b) => b.band - a.band);
  const selected = levels.find((level) => level.code === route.param) || levels.find((level) => level.band === 4) || levels[0];
  const lower = state.seed.levels.find((level) => level.band === selected.band - 1);
  const higher = state.seed.levels.find((level) => level.band === selected.band + 1);

  const rail = levels.map((level) => `
    <a href="#/levels/${level.code}" class="${level.code === selected.code ? "active" : ""}" aria-current="${level.code === selected.code ? "page" : "false"}">
      <span class="br-code">${level.code}</span>
      <span class="br-title">${h(level.title)}</span>
    </a>`).join("");

  const meta = [
    ["Owns", selected.owns],
    ["People", selected.people],
    ["Horizon", selected.horizon],
    ["Autonomy", selected.autonomy],
    ["Comp shape", selected.comp_shape],
    ["Promotion signal", truncate(selected.promotion, 110)],
  ].filter(([, value]) => value && value !== "—").map(([label, value]) => `
    <div class="meta-item">
      <div class="meta-label">${h(label)}</div>
      <div class="meta-value">${h(value)}</div>
    </div>`).join("");

  const sections = [
    ["Scope", selected.scope],
    ["Deliverables", selected.deliverables],
    ["Decisions", selected.decisions],
    ["What good looks like", selected.good],
    ["Promotion gate", selected.promotion],
  ].filter(([, value]) => value).map(([label, value]) => `
    <div class="level-section">
      <h3>${h(label)}</h3>
      <p>${h(value)}</p>
    </div>`).join("");

  const crossTrack = state.seed.tracks.map((track) => {
    const row = track.ladder.find((item) => item.band === selected.band);
    return { track, row };
  });

  const crossRows = crossTrack.map(({ track, row }) => `
    <tr>
      <td><a href="#/tracks/${h(track.id)}">${h(trackShort(track.title))}</a></td>
      <td>${row ? `<span class="ladder-title">${h(row.title)}</span>` : `<span class="faint">No ladder row at this band</span>`}</td>
      <td>${row ? h(row.scope) : "—"}</td>
      <td>${row ? h(row.gate) : "—"}</td>
    </tr>`).join("");

  const fork = selected.band === 4
    ? `<div class="fork-note"><span class="fork-icon">L4</span><p><strong>The IC / management fork.</strong> L4 is the first band where a person can lead through a platform, a strategy cluster or a small desk without becoming a full-time people manager. The dual track continues upward; management is not the only form of seniority.</p></div>`
    : selected.band === 7
      ? `<div class="fork-note"><span class="fork-icon">L7</span><p><strong>The bridge band.</strong> L7 is a deputy or SVP layer between function ownership (L6) and the C-suite (L8). It exists to carry scope that is too broad for one function but not yet a firm-level office.</p></div>`
      : "";

  const html = `
    <div class="page page-wide">
      ${pageHead({
        eyebrow: "The unified ladder",
        title: "Ten bands. One language.",
        lede: "A band describes scope, decision rights and impact horizon. Titles are local; the band is what travels between firms, markets and stages.",
        actions: `<button class="btn btn-ghost" type="button" data-action="compare-levels">${icon("list")} Compare all bands</button>
          <a class="btn btn-ghost" href="#/read/ch-12">${icon("book")} Read the definitions</a>`,
        className: "read-head",
      })}
      <div class="level-layout">
        <nav class="band-rail" aria-label="Bands">${rail}</nav>
        <div>
          <section class="level-hero" data-code="${selected.code}">
            <div class="level-code">${selected.code} · Band ${selected.band}</div>
            <h1 class="level-title">${h(selected.title)}</h1>
            <p class="level-mission">${h(selected.mission)}</p>
            <div class="level-meta">
              ${bandBadge(selected.band)}
              <span class="badge badge-teal">${h(selected.horizon)}</span>
              <span class="badge badge-amber">${h(selected.comp_shape)}</span>
            </div>
            <div class="meta-grid">${meta}</div>
          </section>
          ${fork}
          ${sections}
          <div class="level-section">
            <h3>Titles in the wild</h3>
            <p>${h(selected.titles)}</p>
          </div>
          <div class="card mt-3">
            <div class="card-kicker">Same band, different track</div>
            <h3>What L${selected.band} looks like across the nine tracks</h3>
            <p>Band definitions are common. The work, KPIs and promotion gate are track-specific.</p>
            <div class="table-wrap mt-2">
              <table class="ladder-table">
                <thead><tr><th>Track</th><th>Title at ${selected.code}</th><th>Scope</th><th>Promotion gate</th></tr></thead>
                <tbody>${crossRows}</tbody>
              </table>
            </div>
          </div>
          <div class="reader-nav mt-3">
            ${lower ? `<a href="#/levels/${lower.code}"><span class="rn-label">Previous band</span><span class="rn-title">${lower.code} · ${h(lower.title)}</span></a>` : "<span></span>"}
            ${higher ? `<a class="next" href="#/levels/${higher.code}"><span class="rn-label">Next band</span><span class="rn-title">${higher.code} · ${h(higher.title)}</span></a>` : "<span></span>"}
          </div>
        </div>
      </div>
    </div>`;

  return { html, title: `${selected.code} · ${selected.title}` };
}

function openCompareLevels() {
  const rows = [...state.seed.levels].sort((a, b) => b.band - a.band).map((level) => `
    <tr>
      <td>${bandBadge(level.band)}</td>
      <td><span class="ladder-title">${h(level.title)}</span></td>
      <td>${h(level.owns)}</td>
      <td>${h(level.people)}</td>
      <td>${h(level.horizon)}</td>
      <td>${h(level.comp_shape)}</td>
    </tr>`).join("");
  openModal({
    title: "The ten bands at a glance",
    sub: "Scope, people and horizon. Open any band from the ladder for the full definition.",
    wide: true,
    body: `<div class="table-wrap"><table class="ladder-table"><thead><tr><th>Band</th><th>Title</th><th>Owns</th><th>People</th><th>Horizon</th><th>Comp shape</th></tr></thead><tbody>${rows}</tbody></table></div>`,
  });
}

/* -------------------------------------------------------------------------- */
/* Tracks                                                                     */
/* -------------------------------------------------------------------------- */

function viewTracks(route) {
  const tracks = state.seed.tracks;
  const track = route.param ? tracks.find((item) => item.id === route.param) : null;
  if (!track) return viewTrackIndex();
  return viewTrackDetail(track);
}

function viewTrackIndex() {
  const cards = state.seed.tracks.map((track) => `
    <a class="card card-hover card-link track-card" href="#/tracks/${h(track.id)}">
      <div class="track-card-top">
        <span class="track-num">${String(track.number).padStart(2, "0")}</span>
        ${trackDots(track)}
      </div>
      <h3>${h(trackShort(track.title))}</h3>
      <p>${h(truncate(track.entry_points, 150))}</p>
      <span class="link-arrow mt-2">Open the ladder ${icon("arrowRight")}</span>
    </a>`).join("");

  const html = `
    <div class="page page-wide">
      ${pageHead({
        eyebrow: "Career journeys",
        title: "Nine tracks. One ladder.",
        lede: "Each track has its own titles, competencies and promotion evidence. The bands stay constant, so a Senior QR and a Senior QD can be compared without pretending they do the same job.",
        actions: `<a class="btn btn-ghost" href="#/read/ch-15">${icon("book")} Read Part IV</a>
          <a class="btn btn-ghost" href="#/levels">${icon("layers")} See the bands</a>`,
      })}
      <div class="callout teal mb-3">
        <span class="callout-icon">${icon("info")}</span>
        <div><strong>HR and HR-adjacent roles are intentionally excluded.</strong> Operations is retained as its own track because it carries real P&amp;L-adjacent risk: settlements, reconciliations, corporate actions, vendor and exchange operations. The original “Head of HR &amp; Operations” role is split; only the Operations half appears here.</div>
      </div>
      <div class="grid grid-3">${cards}</div>
      <div class="card card-lg mt-4">
        <div class="card-kicker">How to read a track ladder</div>
        <div class="grid grid-3 mt-2">
          <div>
            <h3>Entry points</h3>
            <p>Where people join, from campus and internships to lateral hires. Entry band is set by evidence, not by previous title.</p>
          </div>
          <div>
            <h3>Ladder</h3>
            <p>Each band has a mission, scope, primary KPIs and a promotion gate. The gate is the evidence a calibration committee should expect.</p>
          </div>
          <div>
            <h3>Branches &amp; exits</h3>
            <p>Specialisms, lateral moves and the failure modes that most often stop progression. Use them in development conversations.</p>
          </div>
        </div>
      </div>
    </div>`;
  return { html, title: "Career tracks" };
}

function viewTrackDetail(track) {
  const index = state.seed.tracks.findIndex((item) => item.id === track.id);
  const previous = index > 0 ? state.seed.tracks[index - 1] : null;
  const next = index < state.seed.tracks.length - 1 ? state.seed.tracks[index + 1] : null;
  const chapter = chapterByNumber(track.number);
  const narrative = Array.isArray(track.narrative) ? track.narrative : [];

  const chips = state.seed.tracks.map((item) => `
    <a class="chip${item.id === track.id ? " active" : ""}" href="#/tracks/${h(item.id)}">${h(trackShort(item.title))}</a>`).join("");

  const rows = track.ladder.map((row) => `
    <tr>
      <td>${bandBadge(row.band)}</td>
      <td><span class="ladder-title">${h(row.title)}</span></td>
      <td>${h(row.mission)}</td>
      <td>${h(row.scope)}</td>
      <td>${h(row.kpis)}</td>
      <td>${h(row.gate)}</td>
    </tr>`).join("");

  const timeline = narrative.map((phase) => `
    <div class="timeline-item">
      <div class="timeline-phase">${h(phase.phase)}</div>
      <div class="timeline-text">${h(phase.text)}</div>
    </div>`).join("");

  const html = `
    <div class="page page-wide">
      <div class="chip-row mb-3">${chips}</div>
      ${pageHead({
        eyebrow: `Track ${String(index + 1).padStart(2, "0")} · Chapter ${track.number}`,
        title: track.title,
        lede: h(track.entry_points),
        actions: `${chapter ? `<a class="btn btn-primary" href="#/read/${h(chapter.id)}">${icon("book")} Read the chapter</a>` : ""}
          <a class="btn btn-ghost" href="#/tracks">${icon("arrowLeft")} All tracks</a>`,
      })}

      <div class="card card-lg">
        <div class="card-kicker">The ladder</div>
        <h2 class="section-title">From intern to C-suite in this track</h2>
        <p class="muted small mb-2">Each row is a band, not a job description. The promotion gate is the evidence to look for, not a checklist to game.</p>
        <div class="table-wrap">
          <table class="ladder-table">
            <thead><tr><th>Band</th><th>Title</th><th>Mission</th><th>Scope</th><th>Primary KPIs</th><th>Promotion gate</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>

      ${timeline ? `
        <div class="card card-lg mt-3">
          <div class="card-kicker">The journey</div>
          <h2 class="section-title">What growth feels like</h2>
          <div class="timeline mt-2">${timeline}</div>
        </div>` : ""}

      <div class="split-3 mt-3">
        <div class="split-card">
          <h4>Branches</h4>
          <p>${h(track.branches)}</p>
        </div>
        <div class="split-card">
          <h4>Lateral moves</h4>
          <p>${h(track.lateral)}</p>
        </div>
        <div class="split-card warn">
          <h4>Failure modes</h4>
          <p>${h(track.failure_modes)}</p>
        </div>
      </div>

      <div class="callout teal mt-3">
        <span class="callout-icon">${icon("flag")}</span>
        <div><strong>Promotion evidence at the gate.</strong> ${h(track.promotion_evidence)}</div>
      </div>

      ${chapter ? `
        <a class="card card-hover card-link mt-3 continue-card" href="#/read/${h(chapter.id)}">
          <div>
            <div class="card-kicker">Go deeper</div>
            <h3>${h(chapter.title)}</h3>
            <p>Entry points, ladder detail, branches, lateral moves, failure modes and promotion evidence in the full text.</p>
          </div>
          <span class="btn btn-soft">Read the chapter ${icon("arrowRight")}</span>
        </a>` : ""}

      <div class="reader-nav mt-3">
        ${previous ? `<a href="#/tracks/${h(previous.id)}"><span class="rn-label">Previous track</span><span class="rn-title">${h(trackShort(previous.title))}</span></a>` : "<span></span>"}
        ${next ? `<a class="next" href="#/tracks/${h(next.id)}"><span class="rn-label">Next track</span><span class="rn-title">${h(trackShort(next.title))}</span></a>` : "<span></span>"}
      </div>
    </div>`;
  return { html, title: trackShort(track.title) };
}

/* -------------------------------------------------------------------------- */
/* Compensation                                                               */
/* -------------------------------------------------------------------------- */

function compSnapshot(band, perf) {
  const rows = state.seed.comp.bands;
  const row = rows.find((item) => item.band === band) || rows[0];
  const base = parseRange(row.base);
  const total = parseRange(row.total);
  const bonus = parseRange(row.bonus);
  const lti = parseRange(row.lti);
  const baseMid = base?.mid ?? 1;
  const totalMid = total?.mid ?? baseMid;
  const variableMid = Math.max(0, totalMid - baseMid);
  const computed = baseMid + variableMid * perf;
  return { row, base, total, bonus, lti, baseMid, totalMid, variableMid, computed };
}

function modifierFor(trackId) {
  const name = TRACK_MODIFIER[trackId];
  return state.seed.comp.modifiers.find((item) => item.track === name) || null;
}

function perfLabel(value) {
  if (value <= 0.8) return "below target";
  if (value < 1.05) return "at target";
  if (value < 1.4) return "exceeds target";
  return "outstanding";
}

function updateCompUI(root = document) {
  const { band, track, perf } = state.comp;
  const snapshot = compSnapshot(band, perf);
  const modifier = modifierFor(track);
  const level = state.seed.levels.find((item) => item.band === band);
  const setText = (selector, text) => {
    const element = $(selector, root);
    if (element) element.textContent = text;
  };
  setText("#comp-base", rangeLabel(snapshot.base));
  setText("#comp-variable", snapshot.variableMid > 0 ? `+${snapshot.variableMid.toFixed(1)}×` : "—");
  setText("#comp-variable-note", snapshot.variableMid > 0
    ? `bonus ${snapshot.row.bonus}${snapshot.row.lti && snapshot.row.lti !== "—" ? ` · LTI ${snapshot.row.lti}` : ""}`
    : "Stipend only");
  setText("#comp-total", `~${snapshot.computed.toFixed(1)}×`);
  setText("#comp-total-note", `${perfLabel(perf)} · L1 midpoint = 1.0`);
  setText("#comp-stack-label", `L${band} · ${level?.title || "Band"}`);
  const baseBar = $("#comp-stack-base", root);
  const varBar = $("#comp-stack-var", root);
  const baseShare = snapshot.computed > 0 ? clamp((snapshot.baseMid / snapshot.computed) * 100, 0, 100) : 100;
  if (baseBar) baseBar.style.width = `${baseShare}%`;
  if (varBar) varBar.style.width = `${100 - baseShare}%`;
  const modifierBox = $("#comp-modifier", root);
  if (modifierBox && modifier) {
    modifierBox.innerHTML = `
      <div class="card-kicker">Track modifier · ${h(modifier.track)}</div>
      <div class="modifier-grid">
        <div><span class="meta-label">Base vs firm median</span><span class="modifier-value">${h(modifier.base)}</span></div>
        <div><span class="meta-label">Variable share</span><span class="modifier-value">${h(modifier.variable)}</span></div>
      </div>
      <p class="small muted mt-2">${h(modifier.notes)}</p>`;
  }
  $$("[data-comp-band]", root).forEach((row) => {
    row.classList.toggle("active", Number(row.dataset.compBand) === band);
  });
  const bandSelect = $("#comp-band", root);
  if (bandSelect && Number(bandSelect.value) !== band) bandSelect.value = String(band);
  const trackSelect = $("#comp-track", root);
  if (trackSelect && trackSelect.value !== track) trackSelect.value = track;
  const perfSelect = $("#comp-perf", root);
  if (perfSelect && Number(perfSelect.value) !== perf) perfSelect.value = String(perf);
}

function viewComp(route) {
  const bandParam = Number(route.query.get("band"));
  const trackParam = route.query.get("track");
  const perfParam = Number(route.query.get("perf"));
  state.comp = {
    band: Number.isInteger(bandParam) && bandParam >= 0 && bandParam <= 9 ? bandParam : state.comp.band,
    track: state.seed.tracks.some((track) => track.id === trackParam) ? trackParam : state.comp.track,
    perf: [0.75, 1, 1.25, 1.5].includes(perfParam) ? perfParam : state.comp.perf,
  };

  const bandOptions = state.seed.levels.map((level) => `
    <option value="${level.band}"${level.band === state.comp.band ? " selected" : ""}>${level.code} · ${h(level.title)}</option>`).join("");
  const trackOptions = state.seed.tracks.map((track) => `
    <option value="${h(track.id)}"${track.id === state.comp.track ? " selected" : ""}>${h(trackShort(track.title))}</option>`).join("");
  const perfOptions = [
    [0.75, "Below target · 0.75× variable"],
    [1, "At target · 1.0× variable"],
    [1.25, "Exceeds · 1.25× variable"],
    [1.5, "Outstanding · 1.5× variable"],
  ].map(([value, label]) => `<option value="${value}"${value === state.comp.perf ? " selected" : ""}>${h(label)}</option>`).join("");

  const maxTotal = Math.max(...state.seed.comp.bands.map((row) => parseRange(row.total)?.mid || 0));
  const chart = [...state.seed.comp.bands].reverse().map((row) => {
    const total = parseRange(row.total);
    const width = maxTotal > 0 && total ? (total.mid / maxTotal) * 100 : 0;
    return `
      <div class="comp-row${row.band === state.comp.band ? " active" : ""}" data-comp-band="${row.band}" role="button" tabindex="0" aria-label="Select L${row.band}">
        <span class="cr-label">L${row.band}</span>
        <span class="comp-track"><span class="comp-bar" style="width:${width.toFixed(1)}%"></span></span>
        <span class="cr-value">${total ? `${total.mid.toFixed(1)}×` : "—"}</span>
      </div>`;
  }).join("");

  const tableRows = state.seed.comp.bands.map((row) => `
    <tr data-comp-band="${row.band}" class="${row.band === state.comp.band ? "active" : ""}">
      <td>${bandBadge(row.band)}</td>
      <td>${h(row.base)}</td>
      <td>${h(row.bonus)}</td>
      <td>${h(row.lti)}</td>
      <td><strong>${h(row.total)}</strong></td>
    </tr>`).join("");

  const principles = state.seed.comp.principles.map((principle) => `<li>${h(principle)}</li>`).join("");

  const html = `
    <div class="page page-wide">
      ${pageHead({
        eyebrow: "Compensation architecture",
        title: "Relative, not absolute.",
        lede: "The model expresses pay as a multiple of the L1 midpoint. It is a design tool for structure, mix and progression — not a salary survey, and not a promise.",
        actions: `<a class="btn btn-primary" href="#/read/ch-38">${icon("book")} Read the chapter</a>
          <button class="btn btn-ghost" type="button" data-action="print">${icon("print")} Print summary</button>`,
      })}
      <div class="callout mb-3">
        <span class="callout-icon">${icon("alert")}</span>
        <div><strong>No absolute salaries appear anywhere in this model.</strong> Ranges are indexed to L1 = 1.0 and vary by market, strategy, firm size and year. Use them to reason about shape and relativities, then price the market locally with real data.</div>
      </div>

      <div class="card card-lg">
        <div class="card-kicker">Build a view</div>
        <div class="comp-controls">
          <div class="field">
            <label for="comp-band">Band</label>
            <select class="select" id="comp-band">${bandOptions}</select>
          </div>
          <div class="field">
            <label for="comp-track">Track</label>
            <select class="select" id="comp-track">${trackOptions}</select>
          </div>
          <div class="field">
            <label for="comp-perf">Performance</label>
            <select class="select" id="comp-perf">${perfOptions}</select>
          </div>
          <div class="field">
            <span class="field-label">Index basis</span>
            <div class="input" style="display:flex;align-items:center;color:var(--muted)">L1 midpoint = 1.0</div>
          </div>
        </div>
      </div>

      <div class="comp-summary mt-3">
        <div class="comp-stat">
          <div class="cs-label">Base index</div>
          <div class="cs-value" id="comp-base">—</div>
          <div class="cs-note">fixed component, midpoint</div>
        </div>
        <div class="comp-stat">
          <div class="cs-label">Variable at target</div>
          <div class="cs-value" id="comp-variable">—</div>
          <div class="cs-note" id="comp-variable-note">bonus and long-term incentive</div>
        </div>
        <div class="comp-stat highlight">
          <div class="cs-label">Illustrative total</div>
          <div class="cs-value" id="comp-total">—</div>
          <div class="cs-note" id="comp-total-note">L1 midpoint = 1.0</div>
        </div>
      </div>

      <div class="grid grid-2 mt-3">
        <div class="card">
          <div class="card-kicker">Pay mix</div>
          <h3 id="comp-stack-label">Band</h3>
          <p class="small muted mb-2">Base versus variable at the selected performance level. Variable includes bonus and, above L4, long-term incentive.</p>
          <div class="stack-bar" aria-hidden="true">
            <div class="stack-base" id="comp-stack-base" style="width:60%"></div>
            <div class="stack-variable" id="comp-stack-var" style="width:40%"></div>
          </div>
          <div class="stack-legend">
            <span><span class="legend-dot" style="background:var(--teal)"></span>Base</span>
            <span><span class="legend-dot" style="background:var(--amber)"></span>Variable</span>
          </div>
        </div>
        <div class="card" id="comp-modifier"></div>
      </div>

      <div class="grid grid-2 mt-3">
        <div class="card">
          <div class="card-kicker">The shape of the ladder</div>
          <h3>Total comp multiple by band</h3>
          <p class="small muted mb-2">Click a band to load it. Bars show the midpoint of the total multiple, not a maximum.</p>
          <div class="comp-chart">${chart}</div>
        </div>
        <div class="card">
          <div class="card-kicker">Principles</div>
          <h3>What the model is trying to do</h3>
          <ol class="principle-list mt-2">${principles}</ol>
        </div>
      </div>

      <div class="card card-lg mt-3">
        <div class="card-kicker">The full table</div>
        <h2 class="section-title">Ten bands, one relative scale</h2>
        <div class="table-wrap mt-2">
          <table class="comp-table">
            <thead><tr><th>Band</th><th>Base index</th><th>Bonus target</th><th>Long-term incentive</th><th>Total multiple</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
        <p class="field-hint mt-2">Total multiple is the midpoint of total comp expressed as a multiple of the L1 midpoint. It is not additive with the base index; it is the all-in figure.</p>
      </div>

      <div class="grid grid-2 mt-3">
        <div class="card">
          <div class="card-kicker">Desk economics</div>
          <h3>How variable pay is actually calculated</h3>
          <pre><code>${h(state.seed.comp.formula)}</code></pre>
          <p class="small muted mt-2">The formula is illustrative. Firms differ on hurdle, deferral, high-water marks and clawbacks. What matters is that the structure is written down, applied consistently and risk-adjusted.</p>
        </div>
        <div class="card">
          <div class="card-kicker">Guardrails</div>
          <h3>What this model deliberately does not do</h3>
          <ul class="plain-list mt-2">
            <li>It does not set absolute salaries or guarantee a range.</li>
            <li>It does not replace local market data or legal advice.</li>
            <li>It does not tie risk and compliance pay to desk P&amp;L.</li>
            <li>It does not assume one comp shape fits every strategy or region.</li>
            <li>It does not treat title as the only input; scope and contribution set the position in the band.</li>
          </ul>
        </div>
      </div>
    </div>`;

  function mount(main) {
    updateCompUI(main);
    const onChange = () => {
      state.comp = {
        band: Number($("#comp-band", main).value),
        track: $("#comp-track", main).value,
        perf: Number($("#comp-perf", main).value),
      };
      updateCompUI(main);
      history.replaceState(null, "", `#/comp?band=${state.comp.band}&track=${encodeURIComponent(state.comp.track)}&perf=${state.comp.perf}`);
    };
    ["#comp-band", "#comp-track", "#comp-perf"].forEach((selector) => {
      $(selector, main)?.addEventListener("change", onChange);
    });
    main.addEventListener("click", (event) => {
      const row = event.target.closest("[data-comp-band]");
      if (!row) return;
      state.comp.band = Number(row.dataset.compBand);
      updateCompUI(main);
      history.replaceState(null, "", `#/comp?band=${state.comp.band}&track=${encodeURIComponent(state.comp.track)}&perf=${state.comp.perf}`);
    });
    main.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest(".comp-row[data-comp-band]");
      if (!row) return;
      event.preventDefault();
      state.comp.band = Number(row.dataset.compBand);
      updateCompUI(main);
      history.replaceState(null, "", `#/comp?band=${state.comp.band}&track=${encodeURIComponent(state.comp.track)}&perf=${state.comp.perf}`);
    });
  }

  return { html, title: "Compensation", mount };
}

/* -------------------------------------------------------------------------- */
/* Org charts                                                                 */
/* -------------------------------------------------------------------------- */

function orgControls() {
  return `
    <div class="org-controls">
      <button class="icon-btn" type="button" data-org-action="in" title="Zoom in" aria-label="Zoom in">${icon("zoomIn")}</button>
      <button class="icon-btn" type="button" data-org-action="out" title="Zoom out" aria-label="Zoom out">${icon("zoomOut")}</button>
      <button class="icon-btn" type="button" data-org-action="focus" title="Focus the root" aria-label="Focus the root">${icon("target")}</button>
      <button class="icon-btn" type="button" data-org-action="fit" title="Fit the whole chart" aria-label="Fit the whole chart">${icon("maximize")}</button>
      <button class="icon-btn" type="button" data-org-action="full" title="Fullscreen" aria-label="Fullscreen">${icon("expand")}</button>
      <button class="icon-btn" type="button" data-org-action="download" title="Download SVG" aria-label="Download SVG">${icon("download")}</button>
      <button class="icon-btn" type="button" data-org-action="print" title="Print" aria-label="Print">${icon("print")}</button>
    </div>`;
}

function viewOrg(route, signal) {
  const id = DIAGRAMS.some((diagram) => diagram.id === route.param) ? route.param : DIAGRAMS[0].id;
  const meta = DIAGRAMS.find((diagram) => diagram.id === id) || DIAGRAMS[0];
  const raw = state.seed.diagrams?.[id] || "";
  const svg = sanitizeSvg(raw);

  const options = DIAGRAMS.map((diagram) => `<option value="${h(diagram.id)}"${diagram.id === id ? " selected" : ""}>${h(diagram.title)}</option>`).join("");
  const cards = DIAGRAMS.map((diagram) => `
    <a class="card card-hover card-link diagram-card${diagram.id === id ? " active" : ""}" href="#/org/${h(diagram.id)}">
      <div class="card-kicker">Org chart</div>
      <h3>${h(diagram.title)}</h3>
      <p>${h(diagram.note)}</p>
      <span class="link-arrow mt-2">Open viewer ${icon("arrowRight")}</span>
    </a>`).join("");

  const html = `
    <div class="page page-wide">
      ${pageHead({
        eyebrow: "Organization design",
        title: "See the firm, not just the boxes.",
        lede: "Six views: the current state, two scaling stages, and three internal views. Pan, zoom, print or take the SVG with you.",
        actions: `<a class="btn btn-ghost" href="#/read/ch-44">${icon("book")} Read Part IX</a>
          <button class="btn btn-ghost" type="button" data-org-action="print">${icon("print")} Print this chart</button>`,
      })}
      <div class="org-toolbar">
        <div class="field" style="max-width:420px;width:100%">
          <label for="org-select">Diagram</label>
          <select class="select" id="org-select">${options}</select>
        </div>
        <div class="chip-row">
          <button class="chip" type="button" data-org-action="focus">${icon("target")} Focus</button>
          <button class="chip" type="button" data-org-action="fit">${icon("maximize")} Fit all</button>
          <button class="chip" type="button" data-org-action="full">${icon("expand")} Fullscreen</button>
          <button class="chip" type="button" data-org-action="download">${icon("download")} SVG</button>
        </div>
      </div>
      <div class="org-print-area">
        ${svg ? `
          <div class="org-viewer" id="org-viewer" data-diagram="${h(id)}">
            <div class="org-stage">${svg}</div>
            ${orgControls()}
            <div class="org-hint">Drag to pan · scroll to zoom · double-click to zoom in</div>
          </div>` : `
          <div class="empty-state card">
            <div class="es-icon">${icon("org")}</div>
            <h2>This diagram is not in the bundle</h2>
            <p>The content edition you are running was built without the <code>${h(id)}</code> diagram. Restore the bundled edition in Settings, or update the content.</p>
          </div>`}
      </div>
      <div class="org-caption">
        <div>${h(meta.note)}</div>
        <div class="small faint">Rendered from the content bundle · no external image requests</div>
      </div>
      <div class="grid grid-3 mt-3">${cards}</div>
    </div>`;

  function mount(main, _route, signal) {
    const viewer = $("#org-viewer", main);
    const api = viewer ? initOrgViewer(viewer, id, signal) : null;
    if (api) {
      const portrait = api.height > api.width * 1.15;
      if (portrait) api.focus();
      else api.fit();
    }

    main.addEventListener("click", (event) => {
      const button = event.target.closest("[data-org-action]");
      if (!button) return;
      event.preventDefault();
      handleOrgAction(button.dataset.orgAction, api, { name: id, svg });
    }, { signal });

    const select = $("#org-select", main);
    if (select) {
      select.addEventListener("change", () => navigate(`#/org/${select.value}`), { signal });
    }
  }

  return { html, title: meta.title, mount };
}

function initOrgViewer(viewer, name, signal) {
  if (!viewer) return null;
  const stage = $(".org-stage", viewer);
  const svg = stage ? $("svg", stage) : null;
  if (!stage || !svg) return null;

  const box = svg.viewBox?.baseVal;
  const width = box && box.width ? box.width : 800;
  const height = box && box.height ? box.height : 600;
  const view = { scale: 1, x: 0, y: 0, min: 0.05, max: 5 };
  const pointerOptions = signal ? { signal } : {};

  // The root of an org chart is the leftmost node. Used to open tall charts
  // on a readable view of the leadership column instead of a thumbnail.
  let root = { x: width * 0.18, y: height * 0.5 };
  const rects = Array.from(svg.querySelectorAll("rect"));
  if (rects.length) {
    let best = null;
    for (const rect of rects) {
      const x = Number(rect.getAttribute("x") || 0);
      const y = Number(rect.getAttribute("y") || 0);
      const w = Number(rect.getAttribute("width") || 0);
      const h = Number(rect.getAttribute("height") || 0);
      if (!w || !h) continue;
      if (!best || x < best.x) best = { x, y, w, h };
    }
    if (best) root = { x: best.x + best.w / 2, y: best.y + best.h / 2 };
  }

  const apply = () => {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  };

  const fit = () => {
    const rect = viewer.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;
    const padding = 26;
    const scale = clamp(
      Math.min((rect.width - padding * 2) / width, (rect.height - padding * 2) / height),
      view.min,
      1.4
    );
    view.scale = scale;
    view.x = (rect.width - width * scale) / 2;
    view.y = (rect.height - height * scale) / 2;
    apply();
  };

  const focus = () => {
    const rect = viewer.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;
    const fitScale = Math.min((rect.width - 52) / width, (rect.height - 52) / height);
    const scale = clamp(Math.max(fitScale * 2.2, 0.9), 0.75, 1.3);
    view.scale = scale;
    view.x = rect.width * 0.36 - root.x * scale;
    view.y = rect.height / 2 - root.y * scale;
    apply();
  };

  const zoomAt = (clientX, clientY, factor) => {
    const rect = viewer.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const next = clamp(view.scale * factor, view.min, view.max);
    if (!Number.isFinite(next) || next === view.scale) return;
    const ratio = next / view.scale;
    view.x = px - (px - view.x) * ratio;
    view.y = py - (py - view.y) * ratio;
    view.scale = next;
    apply();
  };

  const zoomCenter = (factor) => {
    const rect = viewer.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  const pointers = new Map();
  let drag = null;
  let pinch = null;

  viewer.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    if (event.button !== undefined && event.button !== 0) return;
    try {
      viewer.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      drag = { x: event.clientX, y: event.clientY, ox: view.x, oy: view.y };
      viewer.classList.add("dragging");
    } else if (pointers.size === 2) {
      drag = null;
      pinch = null;
    }
  }, pointerOptions);

  viewer.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1 && drag) {
      view.x = drag.ox + event.clientX - drag.x;
      view.y = drag.oy + event.clientY - drag.y;
      apply();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch && pinch.distance > 0) {
        const factor = distance / pinch.distance;
        if (Number.isFinite(factor) && factor > 0) {
          zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, factor);
        }
      }
      pinch = { distance };
    }
  }, pointerOptions);

  const endPointer = (event) => {
    pointers.delete(event.pointerId);
    pinch = null;
    if (pointers.size === 0) {
      drag = null;
      viewer.classList.remove("dragging");
    }
  };
  viewer.addEventListener("pointerup", endPointer, pointerOptions);
  viewer.addEventListener("pointercancel", endPointer, pointerOptions);

  viewer.addEventListener("wheel", (event) => {
    if (event.ctrlKey) return;
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false, ...(signal ? { signal } : {}) });

  viewer.addEventListener("dblclick", (event) => {
    if (event.target.closest("button")) return;
    zoomAt(event.clientX, event.clientY, 1.5);
  }, pointerOptions);

  let resizeObserver = null;
  if (typeof ResizeObserver !== "undefined") {
    let firstResize = true;
    resizeObserver = new ResizeObserver(debounce(() => {
      // The observer fires once on attach; do not overwrite the opening view.
      if (firstResize) {
        firstResize = false;
        return;
      }
      fit();
    }, 140));
    resizeObserver.observe(viewer);
  }

  const api = {
    viewer,
    width,
    height,
    fit,
    focus,
    zoomIn: () => zoomCenter(1.2),
    zoomOut: () => zoomCenter(1 / 1.2),
    download: () => downloadSvg(name, svg.outerHTML),
    copy: () => copyText(svg.outerHTML, "Diagram SVG copied"),
    print: printOrg,
    destroy: () => resizeObserver?.disconnect(),
  };
  if (signal) signal.addEventListener("abort", () => resizeObserver?.disconnect(), { once: true });
  return api;
}

function handleOrgAction(action, api, meta = {}) {
  if (action === "full") {
    openOrgFullscreen(meta.name, meta.svg);
    return;
  }
  if (!api) {
    toast({ kind: "warn", title: "Diagram unavailable", message: "Restore the bundled edition in Settings." });
    return;
  }
  switch (action) {
    case "in": api.zoomIn(); break;
    case "out": api.zoomOut(); break;
    case "fit":
    case "reset": api.fit(); break;
    case "focus": api.focus(); break;
    case "download": api.download(); break;
    case "copy": api.copy(); break;
    case "print": api.print(); break;
    default: break;
  }
}

function downloadSvg(name, svgText) {
  try {
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast({ kind: "ok", title: "Diagram downloaded", message: `${name}.svg`, timeout: 3000 });
  } catch {
    copyText(svgText, "SVG copied instead");
  }
}

function printOrg() {
  document.body.classList.add("print-org");
  const cleanup = () => {
    document.body.classList.remove("print-org");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(() => {
    window.print();
    setTimeout(cleanup, 4000);
  }, 80);
}

function openOrgFullscreen(name, svg) {
  const meta = DIAGRAMS.find((diagram) => diagram.id === name);
  let apiRef = null;
  openModal({
    title: meta?.title || "Org chart",
    sub: "Drag to pan · scroll to zoom · Esc to close",
    wide: true,
    body: `
      <div class="org-viewer org-viewer-modal" id="org-modal-viewer">
        <div class="org-stage">${svg || ""}</div>
        ${orgControls()}
        <div class="org-hint">Drag to pan · scroll to zoom</div>
      </div>`,
    onMount: (panel) => {
      const viewer = $("#org-modal-viewer", panel);
      apiRef = initOrgViewer(viewer, name, null);
      if (apiRef) {
        if (apiRef.height > apiRef.width * 1.15) apiRef.focus();
        else apiRef.fit();
      }
      panel.addEventListener("click", (event) => {
        const button = event.target.closest("[data-org-action]");
        if (!button) return;
        event.preventDefault();
        handleOrgAction(button.dataset.orgAction, apiRef, { name, svg });
      });
    },
    onClose: () => apiRef?.destroy(),
  });
}

/* -------------------------------------------------------------------------- */
/* Checklists                                                                 */
/* -------------------------------------------------------------------------- */

function checklistState(index) {
  return state.checklists[String(index)] || {};
}

function checklistProgress(index) {
  const checklist = state.seed.checklists[index];
  if (!checklist) return { count: 0, total: 0, pct: 0 };
  const done = checklistState(index);
  const count = checklist.items.reduce((total, _item, itemIndex) => total + (done[itemIndex] ? 1 : 0), 0);
  const pct = checklist.items.length ? Math.round((count / checklist.items.length) * 100) : 0;
  return { count, total: checklist.items.length, pct };
}

function updateChecklistProgress(main, index) {
  const progress = checklistProgress(index);
  const bar = $(`#check-bar-${index}`, main);
  const count = $(`#check-count-${index}`, main);
  if (bar) bar.style.width = `${progress.pct}%`;
  if (count) count.textContent = `${progress.count} / ${progress.total}`;
}

function viewChecklists(signal) {
  const cards = state.seed.checklists.map((checklist, index) => {
    const progress = checklistProgress(index);
    const done = checklistState(index);
    const items = checklist.items.map((item, itemIndex) => `
      <label class="check-item${done[itemIndex] ? " done" : ""}">
        <input type="checkbox" data-check-index="${index}" data-item-index="${itemIndex}"${done[itemIndex] ? " checked" : ""}>
        <span>${h(item)}</span>
      </label>`).join("");
    return `
      <div class="check-card">
        <div class="check-head">
          <div>
            <div class="card-kicker">Checklist ${index + 1}</div>
            <h2 class="check-title">${h(checklist.title)}</h2>
          </div>
          <span class="check-count" id="check-count-${index}">${progress.count} / ${progress.total}</span>
        </div>
        <div class="check-progress"><div class="check-progress-bar" id="check-bar-${index}" style="width:${progress.pct}%"></div></div>
        <div class="check-items">${items}</div>
        <div class="check-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-action="checklist-reset" data-index="${index}">${icon("rotate")} Reset</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="checklist-copy" data-index="${index}">${icon("copy")} Copy as Markdown</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="checklist-print">${icon("print")} Print</button>
        </div>
      </div>`;
  }).join("");

  const html = `
    <div class="page page-wide">
      ${pageHead({
        eyebrow: "Operating rhythm",
        title: "Two checklists that keep the firm honest.",
        lede: "The manager's monthly pass and the CEO's quarterly pass. Tick items as you go; progress is stored on this device only.",
        actions: `<a class="btn btn-ghost" href="#/read/ch-29">${icon("book")} Read the operating cadence</a>
          <button class="btn btn-ghost" type="button" data-action="checklist-print">${icon("print")} Print both</button>`,
      })}
      <div class="callout teal mb-3">
        <span class="callout-icon">${icon("check")}</span>
        <div><strong>Use them as prompts, not rituals.</strong> If an item never produces a decision or a change, delete it. A checklist that is always green is not being used.</div>
      </div>
      <div class="check-grid">${cards}</div>
      <p class="field-hint mt-3">Progress is saved locally. Nothing is sent anywhere. Reset a list at any time.</p>
    </div>`;

  function mount(main, _route, signal) {
    main.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-check-index]");
      if (!input) return;
      const index = Number(input.dataset.checkIndex);
      const itemIndex = Number(input.dataset.itemIndex);
      const current = state.checklists[String(index)] || {};
      current[itemIndex] = input.checked;
      state.checklists[String(index)] = current;
      saveJson(STORE.checklists, state.checklists);
      input.closest(".check-item")?.classList.toggle("done", input.checked);
      updateChecklistProgress(main, index);
    }, { signal });
  }

  return { html, title: "Checklists", mount };
}

function resetChecklist(index) {
  state.checklists[String(index)] = {};
  saveJson(STORE.checklists, state.checklists);
  $$(`input[data-check-index="${index}"]`).forEach((input) => {
    input.checked = false;
    input.closest(".check-item")?.classList.remove("done");
  });
  updateChecklistProgress(document, index);
  toast({ kind: "info", title: "Checklist reset", timeout: 2200 });
}

function copyChecklist(index) {
  const checklist = state.seed.checklists[index];
  if (!checklist) return;
  const done = checklistState(index);
  const text = `# ${checklist.title}\n\n${checklist.items
    .map((item, itemIndex) => `- [${done[itemIndex] ? "x" : " "}] ${item}`)
    .join("\n")}\n`;
  copyText(text, "Checklist copied as Markdown");
}

/* -------------------------------------------------------------------------- */
/* Glossary                                                                   */
/* -------------------------------------------------------------------------- */

function glossaryGroups(query) {
  const needle = String(query || "").trim().toLowerCase();
  const terms = [...state.seed.glossary]
    .sort((a, b) => a.term.localeCompare(b.term))
    .filter((term) => !needle || term.term.toLowerCase().includes(needle) || term.meaning.toLowerCase().includes(needle));
  const groups = new Map();
  for (const term of terms) {
    const letter = /^[a-z]/i.test(term.term) ? term.term[0].toUpperCase() : "#";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(term);
  }
  return { terms, groups };
}

function glossaryListHtml(query) {
  const { terms, groups } = glossaryGroups(query);
  if (!terms.length) {
    return `<div class="empty-state"><div class="es-icon">${icon("search")}</div><h2>No terms match</h2><p>Try a shorter search, or clear the filter to see all ${state.seed.glossary.length} terms.</p></div>`;
  }
  return [...groups.entries()].map(([letter, list]) => `
    <div class="glossary-letter" id="glossary-letter-${h(letter)}">${h(letter)}</div>
    ${list.map((term) => `
      <div class="glossary-item">
        <div class="glossary-term">${highlightText(term.term, query)}</div>
        <div class="glossary-meaning">${highlightText(term.meaning, query)}</div>
      </div>`).join("")}`).join("");
}

function glossaryCountHtml(query) {
  const { terms } = glossaryGroups(query);
  return `${terms.length} of ${state.seed.glossary.length} terms`;
}

function viewGlossary(route) {
  const initial = route.query.get("q") || "";
  const letters = [...new Set(state.seed.glossary.map((term) => (/^[a-z]/i.test(term.term) ? term.term[0].toUpperCase() : "#")))].sort();
  const letterChips = letters.map((letter) => `<button class="chip" type="button" data-letter="${h(letter)}">${h(letter)}</button>`).join("");

  const html = `
    <div class="page page-wide">
      ${pageHead({
        eyebrow: "Reference",
        title: "The vocabulary of the firm.",
        lede: "Bands, tracks, pods, PnL share, model risk, calibration and the rest. Search it offline, from any device.",
        actions: `<a class="btn btn-ghost" href="#/read/app-b">${icon("book")} Read Appendix B</a>`,
      })}
      <div class="glossary-tools">
        <input class="input" id="glossary-search" type="search" placeholder="Search terms and definitions…" autocomplete="off" spellcheck="false" value="${h(initial)}">
        <button class="btn btn-ghost btn-sm" type="button" id="glossary-clear">Clear</button>
        <span class="glossary-count" id="glossary-count">${h(glossaryCountHtml(initial))}</span>
      </div>
      <div class="chip-row mb-3">${letterChips}</div>
      <div class="glossary-list" id="glossary-list">${glossaryListHtml(initial)}</div>
    </div>`;

  function mount(main, _route, signal) {
    const input = $("#glossary-search", main);
    const list = $("#glossary-list", main);
    const count = $("#glossary-count", main);
    if (!input || !list) return;

    const apply = debounce(() => {
      const query = input.value;
      list.innerHTML = glossaryListHtml(query);
      if (count) count.textContent = glossaryCountHtml(query);
      history.replaceState(null, "", query ? `#/glossary?q=${encodeURIComponent(query)}` : "#/glossary");
    }, 90);

    input.addEventListener("input", apply, { signal });
    $("#glossary-clear", main)?.addEventListener("click", () => {
      input.value = "";
      list.innerHTML = glossaryListHtml("");
      if (count) count.textContent = glossaryCountHtml("");
      history.replaceState(null, "", "#/glossary");
      input.focus();
    }, { signal });

    main.addEventListener("click", (event) => {
      const letter = event.target.closest("[data-letter]");
      if (!letter) return;
      const target = document.getElementById(`glossary-letter-${letter.dataset.letter}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, { signal });

    if (initial) setTimeout(() => input.focus(), 80);
  }

  return { html, title: "Glossary", mount };
}

/* -------------------------------------------------------------------------- */
/* Updates                                                                    */
/* -------------------------------------------------------------------------- */

function compareVersions(a, b) {
  const parse = (value) => String(value || "0").split(/[.+-]/).map((part) => {
    const number = parseInt(part, 10);
    return Number.isFinite(number) ? number : 0;
  });
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const one = left[index] || 0;
    const other = right[index] || 0;
    if (one > other) return 1;
    if (one < other) return -1;
  }
  return 0;
}

function updateStatusText() {
  const update = state.update;
  if (!update) return "Not checked yet. The bundled edition always works offline.";
  if (update.blocked_reason) return update.blocked_reason;
  if (update.available) return `Content v${update.remote_version} is available. You are on v${update.current_version}.`;
  if (update.not_modified) return "Already up to date — the server reported no change.";
  return `You are on the latest edition (v${update.current_version}).`;
}

function setUpdateBusy(busy, phase = "") {
  state.updateBusy = Boolean(busy);
  const buttons = $$("[data-action='check-updates'], [data-action='install-update'], [data-action='rollback-content'], [data-action='reset-content']");
  buttons.forEach((button) => {
    if (button.dataset.action === "install-update" && !state.update?.available) return;
    button.disabled = Boolean(busy);
  });
  const status = $("#update-status");
  if (status && busy && phase) status.textContent = phase;
}

function setProgress(progress) {
  const wrap = $("#update-progress");
  const bar = $("#update-progress-bar");
  const label = $("#update-progress-label");
  if (!wrap || !bar) return;
  wrap.hidden = false;
  if (label) label.hidden = false;
  const percent = Number.isFinite(progress?.percent) ? progress.percent : null;
  bar.style.width = `${percent ?? 0}%`;
  bar.classList.toggle("indeterminate", percent === null);
  if (label) {
    const received = formatBytes(progress?.received || 0);
    const total = formatBytes(progress?.total || 0);
    const phase = progress?.phase ? String(progress.phase).replace(/_/g, " ") : "Working";
    label.textContent = percent === null ? `${phase}…` : `${phase} · ${received} of ${total} · ${percent}%`;
  }
}

function hideProgress() {
  const wrap = $("#update-progress");
  const label = $("#update-progress-label");
  if (wrap) wrap.hidden = true;
  if (label) label.hidden = true;
}

function refreshUpdateUI() {
  updateUpdateButton();
  const status = $("#update-status");
  if (status) status.textContent = updateStatusText();

  const details = $("#update-details");
  if (details) {
    const update = state.update;
    if (!update) {
      details.innerHTML = `<p class="muted small">Checking contacts only the manifest URL. Nothing else is sent.</p>`;
    } else {
      const rows = [
        ["Installed", `v${update.current_version}`],
        ["Remote", update.remote_version ? `v${update.remote_version}` : "—"],
        ["Bundle size", update.bundle_size ? formatBytes(update.bundle_size) : "—"],
        ["Published", update.published_at ? h(update.published_at) : "—"],
        ["Checked", update.checked_at ? timeAgo(update.checked_at) : "—"],
        ["Manifest", h(update.manifest_url || state.settings.manifest_url)],
      ];
      if (update.app_min_version) rows.push(["Requires app", `v${update.app_min_version}`]);
      details.innerHTML = `
        <dl class="kv-list">${rows.map(([key, value]) => `<div><dt>${h(key)}</dt><dd>${value}</dd></div>`).join("")}</dl>
        ${update.notes ? `<p class="update-notes">${h(update.notes)}</p>` : ""}`;
    }
  }

  const install = $("#install-update-btn");
  if (install) {
    install.hidden = !state.update?.available;
    install.disabled = state.updateBusy;
  }
  const rollback = $("#rollback-btn");
  if (rollback) {
    const hasPrevious = Boolean(state.bootstrap?.meta?.previous_version || state.contentMeta?.previous_version);
    rollback.disabled = state.updateBusy || !hasPrevious;
    rollback.title = hasPrevious ? "Return to the previous edition" : "No previous edition is stored";
  }
  const dot = $("#update-dot-status");
  if (dot) dot.dataset.state = state.update?.available ? "available" : state.update ? "current" : "idle";
}

async function checkForUpdates({ force = true, silent = false } = {}) {
  if (state.updateBusy) return;
  if (!isTauri) {
    await checkForUpdatesInBrowser({ silent });
    return;
  }
  setUpdateBusy(true, "Checking the manifest…");
  try {
    const info = await invoke("check_updates", { force });
    state.update = info;
    if (!silent) {
      if (info.available) toast({ kind: "ok", title: `Update available: v${info.remote_version}`, message: "Open Settings to install it." });
      else if (info.blocked_reason) toast({ kind: "warn", title: "Update check blocked", message: info.blocked_reason });
      else toast({ kind: "info", title: "Already up to date", message: `Content v${info.current_version}` });
    }
    refreshUpdateUI();
    if (state.route.name === "home") renderRoute();
  } catch (error) {
    if (!silent) toast({ kind: "err", title: "Could not check for updates", message: String(error) });
    const status = $("#update-status");
    if (status) status.textContent = `Check failed: ${String(error)}`;
  } finally {
    setUpdateBusy(false);
    hideProgress();
    refreshUpdateUI();
  }
}

async function checkForUpdatesInBrowser({ silent }) {
  const url = state.settings.manifest_url;
  setUpdateBusy(true, "Checking the manifest…");
  try {
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Manifest returned HTTP ${response.status}`);
    const manifest = await response.json();
    const remote = String(manifest.content_version || "");
    if (!remote) throw new Error("The manifest has no content_version.");
    const current = state.seed?.content_version || "0.0.0";
    state.update = {
      available: compareVersions(remote, current) > 0,
      current_version: current,
      remote_version: remote,
      notes: String(manifest.notes || ""),
      bundle_size: Number(manifest.bundle_size) || 0,
      published_at: manifest.published_at || null,
      app_min_version: String(manifest.app_min_version || ""),
      checked_at: Math.floor(Date.now() / 1000),
      not_modified: false,
      manifest_url: url,
      blocked_reason: null,
    };
    if (!silent) toast({ kind: "info", title: "Update check finished", message: "Browser preview cannot install updates; the installed app can." });
    refreshUpdateUI();
    if (state.route.name === "home") renderRoute();
  } catch (error) {
    if (!silent) toast({ kind: "warn", title: "Update check failed", message: String(error) });
    const status = $("#update-status");
    if (status) status.textContent = `Check failed: ${String(error)}`;
  } finally {
    setUpdateBusy(false);
    hideProgress();
    refreshUpdateUI();
  }
}

function applyContentPayload(payload) {
  const seed = safeParse(payload?.json);
  if (!seed || !Array.isArray(seed.parts)) throw new Error("The installed content bundle is not valid.");
  state.seed = seed;
  state.contentMeta = {
    version: payload.version,
    source: payload.source,
    sha256: payload.sha256,
    bytes: payload.bytes,
    installed_at: payload.installed_at,
    path: payload.path,
  };
  state.searchIndex = buildSearchIndex();
  renderShell();
  renderRoute();
  refreshUpdateUI();
}

async function reloadContent() {
  const payload = await invoke("get_content");
  applyContentPayload(payload);
}

async function installUpdate() {
  if (!isTauri) {
    toast({ kind: "info", title: "Install from the desktop app", message: "Browser preview is read-only. Download the installer from GitHub Releases." });
    return;
  }
  if (state.updateBusy) return;
  setUpdateBusy(true, "Downloading the content bundle…");
  try {
    const outcome = await invoke("install_update");
    toast({ kind: "ok", title: `Content v${outcome.version} installed`, message: outcome.message || "The previous edition is kept for rollback.", timeout: 6000 });
    await reloadContent();
    state.update = null;
    if (state.bootstrap) {
      try {
        const info = await invoke("bootstrap");
        state.bootstrap = info;
        state.contentMeta = {
          version: info.content.version,
          source: info.content.source,
          sha256: info.content.sha256,
          bytes: info.content.bytes,
          installed_at: info.content.installed_at,
          path: info.content.path,
        };
      } catch {
        /* The content is already live; bootstrap details are cosmetic. */
      }
    }
  } catch (error) {
    toast({ kind: "err", title: "Update failed", message: String(error), timeout: 8000 });
  } finally {
    setUpdateBusy(false);
    hideProgress();
    refreshUpdateUI();
  }
}

async function rollbackContent() {
  if (!isTauri) {
    toast({ kind: "info", title: "Rollback needs the installed app" });
    return;
  }
  const ok = await confirmDialog({
    title: "Roll back to the previous edition?",
    message: "The current edition is replaced by the one stored before it. Your settings and reading progress are kept.",
    confirmLabel: "Roll back",
  });
  if (!ok) return;
  setUpdateBusy(true, "Restoring the previous edition…");
  try {
    const status = await invoke("rollback_content");
    toast({ kind: "ok", title: `Rolled back to v${status.version}` });
    await reloadContent();
    state.update = null;
  } catch (error) {
    toast({ kind: "err", title: "Rollback failed", message: String(error) });
  } finally {
    setUpdateBusy(false);
    hideProgress();
    refreshUpdateUI();
  }
}

async function restoreBundled() {
  if (!isTauri) {
    toast({ kind: "info", title: "Restore needs the installed app" });
    return;
  }
  const ok = await confirmDialog({
    title: "Restore the bundled edition?",
    message: "This replaces the installed content with the edition shipped inside the app. Your reading progress and settings stay.",
    confirmLabel: "Restore",
    danger: true,
  });
  if (!ok) return;
  setUpdateBusy(true, "Restoring the bundled edition…");
  try {
    const status = await invoke("reset_content");
    toast({ kind: "ok", title: `Bundled edition restored (v${status.version})` });
    await reloadContent();
    state.update = null;
  } catch (error) {
    toast({ kind: "err", title: "Restore failed", message: String(error) });
  } finally {
    setUpdateBusy(false);
    hideProgress();
    refreshUpdateUI();
  }
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

const VIEW_LABELS = {
  home: "Home",
  read: "Read the manual",
  levels: "Levels & bands",
  tracks: "Career tracks",
  comp: "Compensation",
  org: "Org charts",
  checklists: "Checklists",
  glossary: "Glossary",
};

function choiceButton(group, value, label, active) {
  return `<button class="choice${active ? " active" : ""}" type="button" data-${group}-choice="${h(value)}" aria-pressed="${active ? "true" : "false"}">${h(label)}</button>`;
}

function kvRow(key, value, mono = false) {
  return `<div><dt>${h(key)}</dt><dd${mono ? ' class="mono"' : ""}>${value}</dd></div>`;
}

function readProgressSummary() {
  const total = flatChapters().length;
  const read = state.read.size;
  return { total, read, pct: total ? Math.round((read / total) * 100) : 0 };
}

function checklistSummary() {
  let done = 0;
  let total = 0;
  state.seed.checklists.forEach((_checklist, index) => {
    const progress = checklistProgress(index);
    done += progress.count;
    total += progress.total;
  });
  return { done, total };
}

function viewSettings(route, signal) {
  const s = state.settings;
  const content = state.contentMeta || {};
  const info = state.bootstrap || {};
  const reading = readProgressSummary();
  const checks = checklistSummary();
  const source = content.source || "embedded";
  const isDesktop = isTauri;

  const html = `
    <div class="page page-wide">
      ${pageHead({
        eyebrow: "Settings",
        title: "Make it yours, keep it offline.",
        lede: "Appearance, reading defaults, content updates and diagnostics. Everything here is stored on this device; nothing is sent anywhere except the update manifest you choose.",
        actions: `<a class="btn btn-ghost" href="#/about">${icon("info")} About &amp; source</a>`,
      })}

      <div class="settings-grid">
        <section class="card settings-card" aria-labelledby="set-appearance-title">
          <div class="card-kicker">Appearance</div>
          <h2 id="set-appearance-title">How it reads</h2>
          <p class="muted small">The manual is designed to be read for an hour at a time. Pick the setting that keeps your eyes fresh.</p>

          <div class="setting">
            <div class="setting-label">Theme</div>
            <div class="choice-row" role="group" aria-label="Theme">
              ${choiceButton("theme", "system", "System", s.theme === "system")}
              ${choiceButton("theme", "light", "Light", s.theme === "light")}
              ${choiceButton("theme", "dark", "Dark", s.theme === "dark")}
              ${choiceButton("theme", "sepia", "Sepia", s.theme === "sepia")}
            </div>
            <p class="field-hint">System follows your operating system. Dark and sepia keep the diagrams on a light canvas for legibility.</p>
          </div>

          <div class="setting">
            <div class="setting-label-row">
              <span class="setting-label">Text size</span>
              <span class="setting-value" id="font-scale-value">${Math.round(s.font_scale * 100)}%</span>
            </div>
            <input class="range" type="range" id="font-scale" min="0.85" max="1.3" step="0.05" value="${s.font_scale}" aria-label="Text size">
            <div class="range-scale"><span>85%</span><span>100%</span><span>130%</span></div>
          </div>

          <div class="setting">
            <div class="setting-label">Density</div>
            <div class="choice-row" role="group" aria-label="Density">
              ${choiceButton("density", "comfortable", "Comfortable", s.density === "comfortable")}
              ${choiceButton("density", "compact", "Compact", s.density === "compact")}
            </div>
          </div>

          <label class="switch-row">
            <input type="checkbox" id="reduce-motion"${s.reduce_motion ? " checked" : ""}>
            <span>
              <span class="switch-title">Reduce motion</span>
              <span class="switch-sub">Removes transitions, parallax and smooth scrolling.</span>
            </span>
          </label>
        </section>

        <section class="card settings-card" aria-labelledby="set-reading-title">
          <div class="card-kicker">Reading</div>
          <h2 id="set-reading-title">Where you left off</h2>
          <p class="muted small">Progress is local to this device. It is never uploaded and never used for analytics.</p>

          <div class="mini-stats">
            <div><strong>${reading.read}</strong><span>of ${reading.total} read</span></div>
            <div><strong>${checks.done}</strong><span>of ${checks.total} checks</span></div>
            <div><strong>${reading.pct}%</strong><span>manual</span></div>
          </div>
          <div class="progress"><div class="progress-bar" style="width:${reading.pct}%"></div></div>

          <div class="setting mt-3">
            <label class="setting-label" for="default-view">Opening view</label>
            <select class="select" id="default-view">
              ${VIEWS.filter((view) => VIEW_LABELS[view]).map((view) => `<option value="${h(view)}"${s.default_view === view ? " selected" : ""}>${h(VIEW_LABELS[view])}</option>`).join("")}
            </select>
            <p class="field-hint">Used when the app opens without a saved location.</p>
          </div>

          <div class="button-row">
            <button class="btn btn-ghost btn-sm" type="button" data-action="reset-read">${icon("rotate")} Reset read marks</button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="reset-checklists">${icon("rotate")} Reset checklists</button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="export-progress">${icon("download")} Export progress</button>
          </div>
        </section>

        <section class="card settings-card settings-span" id="set-content" aria-labelledby="set-content-title">
          <div class="card-kicker">Content</div>
          <h2 id="set-content-title">The edition you are reading</h2>
          <p class="muted small">The app ships with a complete edition and can fetch newer editions from GitHub. Downloads are checked against a SHA-256 hash and installed atomically; the previous edition is kept for rollback.</p>

          <dl class="kv-list">
            ${kvRow("Installed version", `<span class="pill-inline">v${h(content.version || state.seed.content_version)}</span>`)}
            ${kvRow("Source", h(sourceLabel(source)))}
            ${kvRow("Size", h(formatBytes(content.bytes || state.seed._bytes || 0)))}
            ${kvRow("SHA-256", `<code class="hash">${h(String(content.sha256 || state.seed._sha256 || "").slice(0, 24))}…</code>`, true)}
            ${kvRow("Installed", content.installed_at ? h(formatUnix(content.installed_at, true)) : "Bundled with the app")}
            ${kvRow("Stored at", content.path ? `<code class="path">${h(content.path)}</code>` : "Embedded in the binary", true)}
            ${info.embedded_version ? kvRow("Bundled fallback", `v${h(info.embedded_version)}`) : ""}
          </dl>

          <div class="update-box">
            <div class="update-box-head">
              <span class="status-dot" id="update-dot-status" data-state="idle" aria-hidden="true"></span>
              <strong id="update-status">${h(updateStatusText())}</strong>
            </div>
            <div id="update-details"></div>
            <div class="progress" id="update-progress" hidden><div class="progress-bar" id="update-progress-bar"></div></div>
            <div class="progress-label" id="update-progress-label" hidden></div>
            <div class="button-row">
              <button class="btn btn-soft btn-sm" type="button" data-action="check-updates">${icon("refresh")} Check now</button>
              <button class="btn btn-primary btn-sm" type="button" data-action="install-update" id="install-update-btn" hidden>${icon("download")} Install update</button>
              <button class="btn btn-ghost btn-sm" type="button" data-action="rollback-content" id="rollback-btn">${icon("rotate")} Roll back</button>
              <button class="btn btn-ghost btn-sm" type="button" data-action="reset-content">${icon("layers")} Restore bundled</button>
            </div>
          </div>

          <div class="setting">
            <label class="setting-label" for="manifest-url">Update manifest URL</label>
            <div class="inline-field">
              <input class="input" id="manifest-url" type="url" spellcheck="false" value="${h(s.manifest_url)}" aria-describedby="manifest-hint">
              <button class="btn btn-soft btn-sm" type="button" data-action="save-manifest">Save</button>
            </div>
            <p class="field-hint" id="manifest-hint">HTTPS only (localhost HTTP is allowed for development). The default points at the project's GitHub repository.</p>
            <button class="btn btn-link btn-sm" type="button" data-action="reset-manifest">Use the default manifest</button>
          </div>

          <label class="switch-row">
            <input type="checkbox" id="auto-check"${s.auto_check ? " checked" : ""}>
            <span>
              <span class="switch-title">Check for content updates on launch</span>
              <span class="switch-sub">One small request to the manifest. Nothing else. Skipped when offline.</span>
            </span>
          </label>

          ${isDesktop ? "" : `<div class="callout amber mt-2"><span class="callout-icon">${icon("info")}</span><div><strong>Browser preview.</strong> Settings save locally and the manifest can be read, but installing, rolling back and restoring need the installed desktop or mobile app.</div></div>`}
        </section>

        <section class="card settings-card" aria-labelledby="set-diagnostics-title">
          <div class="card-kicker">Diagnostics</div>
          <h2 id="set-diagnostics-title">If something goes wrong</h2>
          <p class="muted small">A report contains app, platform and content details. It contains no personal data.</p>
          <dl class="kv-list" id="diagnostics-list">
            ${kvRow("App version", `v${h(info.app_version || APP_VERSION)}`)}
            ${kvRow("Identifier", h(info.identifier || "com.quantorg.os"))}
            ${kvRow("Platform", `${h(info.platform || navigator.platform || "web")} · ${h(info.arch || "unknown")}`)}
            ${kvRow("Mode", isDesktop ? "Installed app" : "Browser preview")}
            ${kvRow("Data folder", info.data_dir ? `<code class="path">${h(info.data_dir)}</code>` : "localStorage", true)}
          </dl>
          <div class="button-row">
            <button class="btn btn-ghost btn-sm" type="button" data-action="copy-diagnostics">${icon("copy")} Copy report</button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="save-diagnostics">${icon("download")} Save report</button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="open-data-dir">${icon("folder")} Open data folder</button>
          </div>
          <p class="field-hint">Diagnostics are generated locally. Reporting a problem is optional and always manual.</p>
        </section>

        <section class="card settings-card" aria-labelledby="set-privacy-title">
          <div class="card-kicker">Privacy &amp; data</div>
          <h2 id="set-privacy-title">Nothing leaves this device</h2>
          <p class="muted small">No accounts, no telemetry, no crash reporting, no analytics. The only network request is the update manifest, and only when you ask for it or leave the launch check on.</p>
          <ul class="plain-list">
            <li><strong>Stored locally:</strong> theme, text size, read marks, checklist ticks, last chapter.</li>
            <li><strong>Stored in the app folder:</strong> the installed content edition and its rollback copy.</li>
            <li><strong>Never stored:</strong> identity, location, device identifiers, usage history.</li>
          </ul>
          <div class="button-row">
            <button class="btn btn-danger btn-sm" type="button" data-action="clear-data">${icon("trash")} Clear local data</button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="reload">${icon("refresh")} Reload the app</button>
          </div>
          <p class="field-hint">Clearing local data removes read marks, checklist ticks and preferences. Content stays installed.</p>
        </section>
      </div>
    </div>`;

  function mount(main, _route, signal) {
    const save = () => {
      applySettings();
      persistSettings();
    };

    main.addEventListener("click", (event) => {
      const theme = event.target.closest("[data-theme-choice]");
      if (theme) {
        state.settings.theme = theme.dataset.themeChoice;
        save();
        return;
      }
      const density = event.target.closest("[data-density-choice]");
      if (density) {
        state.settings.density = density.dataset.densityChoice;
        save();
      }
    }, { signal });

    $("#font-scale", main)?.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      state.settings.font_scale = Math.round(clamp(value, 0.85, 1.3) * 100) / 100;
      save();
    }, { signal });

    $("#reduce-motion", main)?.addEventListener("change", (event) => {
      state.settings.reduce_motion = event.target.checked;
      save();
    }, { signal });

    $("#default-view", main)?.addEventListener("change", (event) => {
      state.settings.default_view = event.target.value;
      save();
    }, { signal });

    $("#auto-check", main)?.addEventListener("change", (event) => {
      state.settings.auto_check = event.target.checked;
      persistSettings({ immediate: true });
    }, { signal });

    refreshUpdateUI();
    if (isTauri) {
      loadDiagnostics().catch(() => {});
    }
  }

  return { html, title: "Settings", mount };
}

/* -------------------------------------------------------------------------- */
/* Diagnostics                                                                */
/* -------------------------------------------------------------------------- */

async function buildDiagnostics() {
  if (isTauri) {
    try {
      return await invoke("diagnostics");
    } catch {
      /* Fall through to the local report. */
    }
  }
  return {
    generated_at: Math.floor(Date.now() / 1000),
    app_version: APP_VERSION,
    identifier: "com.quantorg.os",
    platform: navigator.platform || "web",
    arch: "browser",
    data_dir: "localStorage",
    content: {
      version: state.seed?.content_version || "unknown",
      source: state.contentMeta?.source || "embedded",
      sha256: state.contentMeta?.sha256 || state.seed?._sha256 || "",
      bytes: state.contentMeta?.bytes || state.seed?._bytes || 0,
      previous_version: state.contentMeta?.previous_version || null,
    },
    settings: state.settings,
    update_busy: state.updateBusy,
    browser: {
      user_agent: navigator.userAgent,
      language: navigator.language,
      online: navigator.onLine,
    },
  };
}

function diagnosticsText(report) {
  return `Quant Org OS — diagnostics\n==========================\n\n${JSON.stringify(report, null, 2)}\n\nThis report contains no personal data and no telemetry.\n`;
}

async function loadDiagnostics() {
  const report = await buildDiagnostics();
  const list = $("#diagnostics-list");
  if (!list) return report;
  const content = report.content || {};
  list.innerHTML = [
    kvRow("App version", `v${h(report.app_version)}`),
    kvRow("Identifier", h(report.identifier)),
    kvRow("Platform", `${h(report.platform)} · ${h(report.arch)}`),
    kvRow("Mode", isTauri ? "Installed app" : "Browser preview"),
    kvRow("Content", `v${h(content.version || "unknown")} · ${h(sourceLabel(content.source))}`),
    kvRow("Content size", h(formatBytes(content.bytes || 0))),
    kvRow("Data folder", report.data_dir ? `<code class="path">${h(report.data_dir)}</code>` : "localStorage", true),
  ].join("");
  return report;
}

async function copyDiagnostics() {
  const report = await buildDiagnostics();
  copyText(diagnosticsText(report), "Diagnostics copied");
}

async function saveDiagnostics() {
  if (!isTauri) {
    const report = await buildDiagnostics();
    downloadText(`quant-org-os-diagnostics-${Date.now()}.txt`, diagnosticsText(report));
    return;
  }
  try {
    const path = await invoke("save_diagnostics");
    toast({ kind: "ok", title: "Diagnostics saved", message: path, timeout: 6000 });
  } catch (error) {
    toast({ kind: "err", title: "Could not save diagnostics", message: String(error) });
  }
}

/* -------------------------------------------------------------------------- */
/* About                                                                      */
/* -------------------------------------------------------------------------- */

function viewAbout() {
  const version = state.bootstrap?.app_version || APP_VERSION;
  const contentVersion = state.seed?.content_version || "1.0.0";
  const stats = state.seed?.stats || {};

  const html = `
    <div class="page page-wide">
      ${pageHead({
        eyebrow: "About",
        title: "A firm in a file.",
        lede: "Quant Org OS is an offline-first operating manual for how an algorithmic trading firm is structured, how people grow, and how decisions get made. The app is a small shell around a large document.",
      })}

      <div class="grid grid-3">
        <a class="card card-hover card-link" href="${REPO_URL}" data-external="1">
          <div class="card-kicker">Source</div>
          <h3>Everything is on GitHub</h3>
          <p>The app, the document, the Excel matrix, the career map and the content pipeline. Fork it, adapt it, correct it.</p>
          <span class="link-arrow mt-2">${icon("github")} iamma00/quant-prep ${icon("arrowRight")}</span>
        </a>
        <a class="card card-hover card-link" href="${RELEASES_URL}" data-external="1">
          <div class="card-kicker">Download</div>
          <h3>Installers and content editions</h3>
          <p>Windows and macOS installers, Android APK, and signed content bundles. Each release lists its SHA-256.</p>
          <span class="link-arrow mt-2">${icon("download")} Open releases ${icon("arrowRight")}</span>
        </a>
        <a class="card card-hover card-link" href="${ISSUES_URL}" data-external="1">
          <div class="card-kicker">Corrections</div>
          <h3>Tell us what is wrong</h3>
          <p>Compensation shapes, band definitions and promotion gates are opinions. Disagreement is useful when it is specific.</p>
          <span class="link-arrow mt-2">${icon("info")} Open an issue ${icon("arrowRight")}</span>
        </a>
      </div>

      <div class="grid grid-2 mt-4">
        <section class="card card-lg">
          <div class="card-kicker">What is inside</div>
          <h3>${stats.chapters || 61} chapters across ${stats.parts || 12} parts</h3>
          <ul class="plain-list">
            <li><strong>Firm anatomy:</strong> the seven pillars, the C-suite, the committees and the operating cadence.</li>
            <li><strong>Bands and tracks:</strong> ten bands (L0–L9) and nine tracks, with promotion gates and failure modes.</li>
            <li><strong>Money:</strong> relative compensation architecture, PnL share, drawdowns, clawbacks and vesting.</li>
            <li><strong>Translation:</strong> the same band at an HFT prop shop, a multi-strat, a bank, big tech and crypto.</li>
            <li><strong>Operations:</strong> hiring loops, calibration, governance, scaling, edge cases and checklists.</li>
          </ul>
        </section>

        <section class="card card-lg">
          <div class="card-kicker">Companion files</div>
          <h3>Take it into the room</h3>
          <div class="link-list mt-2">
            <a class="link-row" href="${REPO_URL}/blob/main/quant-org-leveling-matrix.xlsx" data-external="1">${icon("download")} Leveling matrix (Excel)<span class="link-row-sub">12 sheets, formula-driven</span></a>
            <a class="link-row" href="${REPO_URL}/blob/main/quant-org-career-map.pdf" data-external="1">${icon("download")} Career map (PDF)<span class="link-row-sub">A3 landscape</span></a>
            <a class="link-row" href="${REPO_URL}/blob/main/quant-org-career-framework.md" data-external="1">${icon("book")} Source document (Markdown)<span class="link-row-sub">~30,000 words</span></a>
            <a class="link-row" href="${REPO_URL}/tree/main/docs" data-external="1">${icon("folder")} Calibration guide &amp; build docs<span class="link-row-sub">docs/</span></a>
          </div>
        </section>
      </div>

      <div class="grid grid-2 mt-3">
        <section class="card">
          <div class="card-kicker">Keyboard</div>
          <h3>Move without the mouse</h3>
          <dl class="kv-list compact">
            ${kvRow("Search", '<kbd class="kbd">Ctrl</kbd> <kbd class="kbd">K</kbd>')}
            ${kvRow("Close search / modal", '<kbd class="kbd">Esc</kbd>')}
            ${kvRow("Next / previous result", '<kbd class="kbd">↓</kbd> <kbd class="kbd">↑</kbd>')}
            ${kvRow("Open result", '<kbd class="kbd">Enter</kbd>')}
            ${kvRow("Zoom org chart", "Scroll or pinch")}
            ${kvRow("Pan org chart", "Drag")}
          </dl>
        </section>

        <section class="card">
          <div class="card-kicker">Version</div>
          <h3>What you are running</h3>
          <dl class="kv-list compact">
            ${kvRow("App", `v${h(version)}`)}
            ${kvRow("Content", `v${h(contentVersion)}`)}
            ${kvRow("Source", h(sourceLabel(state.contentMeta?.source || "embedded")))}
            ${kvRow("License", "MIT (code) · CC BY 4.0 (text)")}
            ${kvRow("Build", h(state.bootstrap ? `${state.bootstrap.platform}-${state.bootstrap.arch}` : "web preview"))}
          </dl>
        </section>
      </div>

      <section class="card card-lg mt-3">
        <div class="card-kicker">How to use it well</div>
        <h3>Three honest caveats</h3>
        <div class="grid grid-3 mt-2">
          <div>
            <h4>It is a default, not a law</h4>
            <p class="muted small">Every firm is a set of local compromises. Use the bands to compare scope, then rewrite the gates to match your strategy, market and regulatory footprint.</p>
          </div>
          <div>
            <h4>Compensation is relative</h4>
            <p class="muted small">The model uses multipliers and mix, never absolute salaries. Absolute numbers date instantly and differ by city, firm and year.</p>
          </div>
          <div>
            <h4>HR is deliberately absent</h4>
            <p class="muted small">People operations, recruiting and compensation administration are out of scope. Operations remains a track in its own right.</p>
          </div>
        </div>
        <p class="field-hint mt-3">Nothing in this manual is legal, tax or investment advice. Employment law and market rules vary by jurisdiction; take local counsel before acting.</p>
      </section>

      <footer class="page-foot">
        <span>Quant Org OS · offline-first · MIT licensed code</span>
        <span>Built with Rust, Tauri and vanilla web technology</span>
      </footer>
    </div>`;

  return { html, title: "About" };
}

/* -------------------------------------------------------------------------- */
/* Search palette                                                             */
/* -------------------------------------------------------------------------- */

const paletteState = { open: false, items: [], index: 0 };

function buildSearchIndex() {
  if (!state.seed) return [];
  const entries = [];
  const seen = new Set();

  const push = (entry) => {
    const key = `${entry.type}:${entry.id}:${entry.anchor || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  for (const chapter of flatChapters()) {
    const plain = toPlainText(chapter.markdown);
    push({
      type: "chapter",
      icon: "book",
      id: chapter.id,
      title: chapter.title,
      kicker: partLabel(chapter.part),
      text: plain,
      href: `#/read/${chapter.id}`,
    });
  }

  for (const block of state.seed.search || []) {
    if (!block.heading) continue;
    push({
      type: "section",
      icon: "hash",
      id: block.chapter,
      anchor: slugify(block.heading),
      title: block.heading,
      kicker: block.title,
      text: block.text,
      href: `#/read/${block.chapter}?h=${encodeURIComponent(slugify(block.heading))}`,
    });
  }

  for (const level of state.seed.levels || []) {
    push({
      type: "band",
      icon: "layers",
      id: level.code,
      title: `${level.code} · ${level.title}`,
      kicker: `Band ${level.band} · ${level.comp_shape || "scope and autonomy"}`,
      text: [level.mission, level.scope, level.owns, level.people, level.horizon].filter(Boolean).join(" "),
      href: `#/levels/${level.code}`,
    });
  }

  for (const track of state.seed.tracks || []) {
    push({
      type: "track",
      icon: "route",
      id: track.id,
      title: track.title,
      kicker: `Track ${String(track.number).padStart(2, "0")}`,
      text: [track.entry_points, track.branches, track.lateral, ...(track.ladder || []).map((step) => `${step.band} ${step.title} ${step.mission}`)].filter(Boolean).join(" "),
      href: `#/tracks/${track.id}`,
    });
  }

  for (const term of state.seed.glossary || []) {
    push({
      type: "term",
      icon: "glossary",
      id: term.term,
      title: term.term,
      kicker: "Glossary",
      text: term.meaning,
      href: `#/glossary?q=${encodeURIComponent(term.term)}`,
    });
  }

  for (const diagram of DIAGRAMS) {
    push({
      type: "chart",
      icon: "org",
      id: diagram.id,
      title: diagram.title,
      kicker: "Org chart",
      text: diagram.note,
      href: `#/org/${diagram.id}`,
    });
  }

  return entries;
}

function scoreEntry(entry, query) {
  if (!query) return 0;
  const needle = query.toLowerCase();
  const title = entry.title.toLowerCase();
  const kicker = (entry.kicker || "").toLowerCase();
  const text = (entry.text || "").toLowerCase();
  let score = 0;
  if (title === needle) score += 120;
  else if (title.startsWith(needle)) score += 70;
  else if (title.includes(needle)) score += 40;
  if (kicker.includes(needle)) score += 14;
  if (text.includes(needle)) score += 8;
  const tokens = needle.split(/\s+/).filter((token) => token.length > 1);
  for (const token of tokens) {
    if (title.includes(token)) score += 6;
    else if (text.includes(token)) score += 2;
  }
  if (score > 0) {
    if (entry.type === "chapter") score += 3;
    if (entry.type === "section") score += 2;
  }
  return score;
}

function searchResults(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    const recent = state.lastChapter ? findChapter(state.lastChapter) : null;
    const items = [];
    if (recent) {
      items.push({
        type: "chapter", icon: "book", title: recent.title, kicker: "Continue reading",
        text: toPlainText(recent.markdown).slice(0, 160), href: `#/read/${recent.id}`,
      });
    }
    for (const item of [
      { icon: "layers", title: "The ten bands", kicker: "Reference", text: "L0 to L9: scope, autonomy and impact horizon.", href: "#/levels" },
      { icon: "route", title: "Nine career tracks", kicker: "Reference", text: "Research, trading, technology, data, risk, legal, finance, operations, product.", href: "#/tracks" },
      { icon: "scale", title: "Compensation model", kicker: "Reference", text: "Base, bonus, PnL share and equity by band and track.", href: "#/comp" },
      { icon: "org", title: "Org charts", kicker: "Reference", text: "Current state and two scaling stages.", href: "#/org" },
    ]) items.push(item);
    return items.slice(0, 8);
  }
  return state.searchIndex
    .map((entry) => ({ entry, score: scoreEntry(entry, trimmed) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, 24)
    .map((row) => row.entry);
}

function snippetFor(entry, query) {
  const text = String(entry.text || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const needle = String(query || "").trim();
  if (!needle) return truncate(text, 130);
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return truncate(text, 130);
  const start = Math.max(0, index - 48);
  const piece = text.slice(start, start + 150);
  return `${start > 0 ? "…" : ""}${highlightText(piece, needle)}${start + 150 < text.length ? "…" : ""}`;
}

function paletteItemsHtml(items, query) {
  if (!items.length) {
    return `<div class="palette-empty">No matches. Try a band (L5), a track (research), or a term (PnL share).</div>`;
  }
  return items.map((entry, index) => `
    <a class="palette-item${index === paletteState.index ? " active" : ""}" href="${h(entry.href)}" data-palette-index="${index}" role="option" aria-selected="${index === paletteState.index}">
      <span class="palette-item-icon">${icon(entry.icon || "search")}</span>
      <span class="palette-item-body">
        <span class="palette-item-title">${highlightText(entry.title, query)}</span>
        <span class="palette-item-meta">${h(entry.kicker || "")}</span>
        ${entry.text ? `<span class="palette-item-snippet">${snippetFor(entry, query)}</span>` : ""}
      </span>
      <span class="palette-type">${h(entry.type || "")}</span>
    </a>`).join("");
}

function renderPalette() {
  const input = $("#palette-input");
  const results = $("#palette-results");
  const hint = $("#palette-hint");
  if (!input || !results) return;
  const query = input.value;
  paletteState.items = searchResults(query);
  paletteState.index = Math.min(paletteState.index, Math.max(0, paletteState.items.length - 1));
  results.innerHTML = paletteItemsHtml(paletteState.items, query);
  if (hint) {
    hint.textContent = query
      ? `${paletteState.items.length} result${paletteState.items.length === 1 ? "" : "s"} for “${query}”`
      : "Search the whole manual, offline";
  }
  results.scrollTop = 0;
}

function movePalette(delta) {
  if (!paletteState.items.length) return;
  paletteState.index = (paletteState.index + delta + paletteState.items.length) % paletteState.items.length;
  $$("#palette-results .palette-item").forEach((item, index) => {
    const active = index === paletteState.index;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", active ? "true" : "false");
    if (active) item.scrollIntoView({ block: "nearest" });
  });
}

function openPalette() {
  const palette = $("#palette");
  if (!palette) return;
  palette.hidden = false;
  paletteState.open = true;
  paletteState.index = 0;
  document.body.classList.add("palette-open");
  const input = $("#palette-input");
  if (input) {
    input.value = "";
    input.focus();
  }
  renderPalette();
}

function closePalette() {
  const palette = $("#palette");
  if (!palette) return;
  palette.hidden = true;
  paletteState.open = false;
  document.body.classList.remove("palette-open");
}

function activatePalette(index = paletteState.index) {
  const entry = paletteState.items[index];
  if (!entry) return;
  closePalette();
  navigate(entry.href);
}

/* -------------------------------------------------------------------------- */
/* Boot and global bindings                                                   */
/* -------------------------------------------------------------------------- */

function openExternal(url) {
  if (!url) return;
  if (isTauri) {
    invoke("open_external", { url }).catch((error) => {
      toast({ kind: "err", title: "Could not open the link", message: String(error) });
    });
    return;
  }
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) copyText(url, "Link copied (popup blocked)");
}

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  try {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch {
    copyText(text, "Download unavailable — copied instead");
  }
}

function exportProgress() {
  const payload = {
    exported_at: new Date().toISOString(),
    content_version: state.seed?.content_version || "",
    read: [...state.read],
    checklists: state.checklists,
    last_chapter: state.lastChapter,
    settings: state.settings,
  };
  downloadText(`quant-org-os-progress-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
  toast({ kind: "ok", title: "Progress exported", message: "A JSON file was downloaded." });
}

async function resetReadMarks() {
  const ok = await confirmDialog({
    title: "Reset all read marks?",
    message: "Chapter ticks are removed. Your last chapter stays so you can keep reading.",
    confirmLabel: "Reset",
    danger: true,
  });
  if (!ok) return;
  state.read.clear();
  saveJson(STORE.read, []);
  renderContents();
  if (state.route.name === "read") renderRoute();
  toast({ kind: "info", title: "Read marks cleared" });
}

async function resetAllChecklists() {
  const ok = await confirmDialog({
    title: "Reset both checklists?",
    message: "All ticks are removed. The items themselves are unchanged.",
    confirmLabel: "Reset",
    danger: true,
  });
  if (!ok) return;
  state.checklists = {};
  saveJson(STORE.checklists, {});
  if (state.route.name === "checklists") renderRoute();
  toast({ kind: "info", title: "Checklists reset" });
}

async function clearLocalData() {
  const ok = await confirmDialog({
    title: "Clear local data?",
    message: "Theme, text size, read marks, checklist ticks and your last chapter are removed. The installed content is not touched.",
    confirmLabel: "Clear data",
    danger: true,
  });
  if (!ok) return;
  try {
    for (const key of Object.values(STORE)) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  state.settings = { ...DEFAULT_SETTINGS };
  state.read = new Set();
  state.checklists = {};
  state.lastChapter = "";
  applySettings();
  persistSettings({ immediate: true });
  renderShell();
  renderRoute();
  toast({ kind: "ok", title: "Local data cleared" });
}

function showBootError(error) {
  const main = $("#main");
  if (!main) return;
  const message = error?.message ? String(error.message) : String(error);
  main.innerHTML = `
    <div class="page">
      <div class="card error-card">
        <div class="card-kicker">Could not open the manual</div>
        <h1 class="read-title" style="font-size:1.8rem">The content bundle did not load</h1>
        <p class="muted">The app itself is fine. The offline edition could not be read from disk, and the browser preview could not fetch it.</p>
        <pre>${h(message)}</pre>
        <div class="hero-actions">
          <button class="btn btn-primary" type="button" data-action="retry-boot">${icon("refresh")} Try again</button>
          <a class="btn btn-ghost" href="#/about">About &amp; source</a>
          <a class="btn btn-ghost" href="${RELEASES_URL}" data-external="1">${icon("download")} Reinstall</a>
        </div>
        <p class="field-hint mt-3">If this is the installed app, open Settings → Content → Restore bundled. If it is the browser preview, serve the repository root and open <code>ui/index.html</code>.</p>
      </div>
    </div>`;
}

async function fetchSeed() {
  const candidates = [
    new URL("../../src-tauri/resources/seed.json", import.meta.url).href,
    "resources/seed.json",
    "seed.json",
  ];
  const errors = [];
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        errors.push(`${url} → HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      if (data && Array.isArray(data.parts)) return data;
      errors.push(`${url} → not a content bundle`);
    } catch (error) {
      errors.push(`${url} → ${error.message}`);
    }
  }
  throw new Error(`No content bundle found. Tried:\n${errors.join("\n")}`);
}

async function loadContent() {
  if (isTauri) {
    const info = await invoke("bootstrap");
    state.bootstrap = info;
    state.settings = sanitizeSettings(info.settings);
    state.contentMeta = {
      version: info.content.version,
      source: info.content.source,
      sha256: info.content.sha256,
      bytes: info.content.bytes,
      installed_at: info.content.installed_at,
      path: info.content.path,
      previous_version: info.meta?.previous_version || null,
    };
    const seed = safeParse(info.content.json);
    if (!seed || !Array.isArray(seed.parts)) throw new Error("The Rust backend returned an invalid content bundle.");
    if (info.last_error) console.warn("Content store:", info.last_error);
    return seed;
  }

  const seed = await fetchSeed();
  state.contentMeta = {
    version: seed.content_version,
    source: "embedded",
    sha256: seed._sha256 || "",
    bytes: seed._bytes || 0,
    installed_at: null,
    path: null,
    previous_version: null,
  };
  return seed;
}

async function boot() {
  applySettings();
  bindGlobalEvents();
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  try {
    const seed = await loadContent();
    state.seed = seed;
    state.searchIndex = buildSearchIndex();
    if (state.settings.default_view && !location.hash) {
      const start = `#/${state.settings.default_view}`;
      history.replaceState(null, "", start);
    }
    renderShell();
    renderRoute();
    document.body.classList.add("ready");
    refreshUpdateUI();

    if (state.settings.auto_check && state.online) {
      setTimeout(() => checkForUpdates({ force: false, silent: true }), 1400);
    }
  } catch (error) {
    state.bootError = error;
    showBootError(error);
  }
}

function bindGlobalEvents() {
  document.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (actionEl) {
      const action = actionEl.dataset.action;
      switch (action) {
        case "toggle-read": {
          event.preventDefault();
          const id = actionEl.dataset.id;
          if (id) markRead(id, !state.read.has(id));
          break;
        }
        case "print":
          event.preventDefault();
          window.print();
          break;
        case "copy-link": {
          event.preventDefault();
          copyText(location.href, "Link copied");
          break;
        }
        case "reload":
          event.preventDefault();
          location.reload();
          break;
        case "retry-boot":
          event.preventDefault();
          boot();
          break;
        case "toggle-part": {
          event.preventDefault();
          const part = actionEl.dataset.part;
          const group = actionEl.closest(".part-group");
          if (!part || !group) break;
          const open = !group.classList.contains("open");
          group.classList.toggle("open", open);
          actionEl.setAttribute("aria-expanded", open ? "true" : "false");
          if (open) state.openParts.add(part);
          else state.openParts.delete(part);
          saveJson(STORE.parts, [...state.openParts]);
          break;
        }
        case "compare-levels":
          event.preventDefault();
          openCompareLevels();
          break;
        case "checklist-reset":
          event.preventDefault();
          resetChecklist(Number(actionEl.dataset.index));
          break;
        case "checklist-copy":
          event.preventDefault();
          copyChecklist(Number(actionEl.dataset.index));
          break;
        case "checklist-print":
          event.preventDefault();
          window.print();
          break;
        case "check-updates":
          event.preventDefault();
          checkForUpdates({ force: true });
          break;
        case "install-update":
          event.preventDefault();
          installUpdate();
          break;
        case "rollback-content":
          event.preventDefault();
          rollbackContent();
          break;
        case "reset-content":
          event.preventDefault();
          restoreBundled();
          break;
        case "save-manifest": {
          event.preventDefault();
          const input = $("#manifest-url");
          if (!input) break;
          const error = validateManifestUrl(input.value);
          if (error) {
            toast({ kind: "err", title: "That manifest URL is not allowed", message: error });
            break;
          }
          state.settings.manifest_url = input.value.trim();
          persistSettings({ immediate: true });
          state.update = null;
          refreshUpdateUI();
          toast({ kind: "ok", title: "Manifest saved" });
          break;
        }
        case "reset-manifest": {
          event.preventDefault();
          const input = $("#manifest-url");
          if (input) input.value = DEFAULT_MANIFEST;
          state.settings.manifest_url = DEFAULT_MANIFEST;
          persistSettings({ immediate: true });
          state.update = null;
          refreshUpdateUI();
          toast({ kind: "info", title: "Default manifest restored" });
          break;
        }
        case "reset-read":
          event.preventDefault();
          resetReadMarks();
          break;
        case "reset-checklists":
          event.preventDefault();
          resetAllChecklists();
          break;
        case "export-progress":
          event.preventDefault();
          exportProgress();
          break;
        case "clear-data":
          event.preventDefault();
          clearLocalData();
          break;
        case "copy-diagnostics":
          event.preventDefault();
          copyDiagnostics();
          break;
        case "save-diagnostics":
          event.preventDefault();
          saveDiagnostics();
          break;
        case "open-data-dir":
          event.preventDefault();
          if (isTauri) {
            invoke("open_data_dir").catch((error) => toast({ kind: "err", title: "Could not open the folder", message: String(error) }));
          } else {
            toast({ kind: "info", title: "Browser preview", message: "Settings and progress live in localStorage in this browser." });
          }
          break;
        default:
          break;
      }
      return;
    }

    const external = event.target.closest("a[data-external], a[href^='http']");
    if (external && external.href) {
      event.preventDefault();
      openExternal(external.href);
      return;
    }

    if (event.target.closest("#menu-btn")) {
      openSidebar();
      return;
    }
    if (event.target.closest("#sidebar-backdrop")) {
      closeSidebar();
      return;
    }
    if (event.target.closest("#theme-btn")) {
      const order = THEMES;
      const next = order[(order.indexOf(state.settings.theme) + 1) % order.length];
      state.settings.theme = next;
      applySettings();
      persistSettings();
      toast({ kind: "info", title: `Theme: ${next}`, timeout: 1600 });
      return;
    }
    if (event.target.closest("#search-trigger")) {
      openPalette();
      return;
    }
    if (event.target.closest("#update-btn")) {
      navigate("#/settings");
      setTimeout(() => $("#set-content")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      return;
    }
    if (event.target.closest("#more-btn")) {
      openSidebar();
      return;
    }
    if (event.target.closest("#collapse-contents")) {
      state.openParts.clear();
      saveJson(STORE.parts, []);
      renderContents();
      return;
    }

    const paletteClose = event.target.closest("[data-close-palette]");
    if (paletteClose) {
      closePalette();
      return;
    }
    const paletteItem = event.target.closest("[data-palette-index]");
    if (paletteItem) {
      event.preventDefault();
      activatePalette(Number(paletteItem.dataset.paletteIndex));
    }
  });

  document.addEventListener("keydown", (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (paletteState.open) closePalette();
      else openPalette();
      return;
    }
    if (event.key === "Escape") {
      if (paletteState.open) {
        event.preventDefault();
        closePalette();
        return;
      }
      if (modalState) {
        event.preventDefault();
        closeModal();
        return;
      }
      closeSidebar();
      return;
    }
    if (paletteState.open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        movePalette(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        movePalette(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        activatePalette();
      }
      return;
    }
    if (event.key === "/" && !event.ctrlKey && !event.metaKey) {
      const tag = document.activeElement?.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        event.preventDefault();
        openPalette();
      }
    }
  });

  const palette = $("#palette");
  palette?.addEventListener("input", (event) => {
    if (event.target.id === "palette-input") {
      paletteState.index = 0;
      renderPalette();
    }
  });

  window.addEventListener("hashchange", () => {
    renderRoute();
    closePalette();
  });

  window.addEventListener("online", () => {
    state.online = true;
    updateNetPill();
    toast({ kind: "info", title: "Back online", message: "Content updates are available again.", timeout: 2600 });
  });
  window.addEventListener("offline", () => {
    state.online = false;
    updateNetPill();
    toast({ kind: "warn", title: "Offline", message: "Everything in the manual still works. Updates are paused.", timeout: 4200 });
  });

  darkQuery?.addEventListener?.("change", () => {
    if (state.settings.theme === "system") applySettings();
  });

  if (isTauri) {
    listen("update:progress", (event) => setProgress(event.payload)).catch(() => {});
    listen("content:changed", () => {
      reloadContent().catch(() => {});
    }).catch(() => {});
  }
}

boot();
