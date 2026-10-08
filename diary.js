// Diary tab: dated stops (Google Maps links), trip days and a schedule.
// Everything lives in state.diary, so it is saved on the phone and is part of the backup.
import { state, save, $, esc, today, toast, saveFile, LEGS } from "./store.js";

const KINDS = { stay: "Stay", eat: "Eat", see: "See", drive: "Drive", shop: "Shop", other: "Other" };
const PKINDS = { house: "House", car: "Car", travel: "Transport", plan: "Plan" };
const MODES = { day: "Day trip, back home", move: "Move from A to B", "": "Stay put" };

const D = () => {
  const d = (state.diary ||= {});
  d.stops ||= [];
  d.days ||= {};
  d.plans ||= [];
  return d;
};
const view = () => $("diary-view");
let leg = "";
let lastDate = "";
const uid = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const upsert = (list, rec) => {
  const i = list.findIndex((x) => x.id === rec.id);
  if (i < 0) list.push(rec); else list[i] = rec;
};
const dt = (d) => new Date(`${d}T00:00:00`);
const fmtDay = (d) => dt(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
const fmtShort = (d) => dt(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const nights = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
const opts = (obj, sel, blank) =>
  (blank ? `<option value="">${blank}</option>` : "") +
  Object.entries(obj).map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${v}</option>`).join("");

// ---------------------------------------------------------------- Google Maps links

function parseMaps(raw) {
  let s = (raw || "").trim();
  if (!s) return { ok: false, msg: "Paste a Google Maps link." };
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { return { ok: false, msg: "That doesn't look like a link." }; }
  const h = u.hostname.toLowerCase();
  // Real Google hosts only (google.com, google.co.jp, google.com.au, google.de,
  // with www. or maps.), not e.g. google.example.com.
  const google = /^((www|maps)\.)?google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(h);
  const ok = (google && (h.startsWith("maps.") || /^\/maps/.test(u.pathname))) || h === "maps.app.goo.gl" || (h === "goo.gl" && /^\/maps/.test(u.pathname));
  if (!ok) return { ok: false, msg: "This isn't a Google Maps link." };
  let title = "";
  const m = u.pathname.match(/\/place\/([^/@]+)/);
  if (m) {
    try { title = decodeURIComponent(m[1].replace(/\+/g, " ")); } catch { title = m[1].replace(/\+/g, " "); }
  } else title = u.searchParams.get("q") || u.searchParams.get("query") || "";
  if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(title)) title = "";
  return { ok: true, url: u.href, title };
}

// ---------------------------------------------------------------- init + render

export function initDiary() {
  document.querySelectorAll("[data-dview]").forEach((b) => {
    b.onclick = () => { state.dview = b.dataset.dview; save(); renderDiary(); };
  });
  $("d-import-file").onchange = importFile;
  renderDiary();
}

export function renderDiary() {
  const v = state.dview === "plan" ? "plan" : "days";
  document.querySelectorAll("[data-dview]").forEach((b) => b.setAttribute("aria-selected", b.dataset.dview === v));
  (v === "plan" ? plan : days)();
}

function bindCommon() {
  const el = view();
  el.querySelectorAll("[data-d]").forEach((b) => {
    b.onclick = () => {
      const a = b.dataset.d;
      if (a === "add") stopForm(null);
      else if (a === "day") tripForm(lastDate || today());
      else if (a === "trip") tripForm(b.dataset.date);
      else if (a === "edit") stopForm(D().stops.find((s) => s.id === b.dataset.id));
      else if (a === "padd") planForm(null);
      else if (a === "pedit") planForm(D().plans.find((s) => s.id === b.dataset.id));
      else if (a === "import") $("d-import-file").click();
      else if (a === "text") exportText();
    };
  });
}

function tools() {
  return `<div class="row d-tools"><button data-d="import">Import from web diary</button><button data-d="text">Share as text</button></div>`;
}

function days() {
  const d = D();
  const by = {};
  d.stops.filter((s) => !leg || s.leg === leg).forEach((s) => (by[s.date] ||= []).push(s));
  if (!leg) Object.keys(d.days).forEach((k) => (by[k] ||= []));
  const keys = Object.keys(by).sort();
  const t = today();
  let html = `<div class="d-actions"><button class="primary" data-d="add">+ Stop</button><button data-d="day">Trip day</button>
    <select id="d-leg" aria-label="Area">${opts(LEGS, leg, "All areas")}</select></div>`;
  if (!keys.length) {
    html += `<p class="empty">${d.stops.length ? "No stops in this area." : "No stops yet.<br>In Google Maps open a place, tap Share, copy the link, then tap + Stop and paste it."}</p>`;
  }
  for (const k of keys) {
    const trip = d.days[k];
    html += `<div class="leg-head"><h3>${fmtDay(k)}${k === t ? ` <span class="d-today">Today</span>` : ""}</h3>
      <button class="d-mini" data-d="trip" data-date="${k}">${trip?.mode ? "Edit trip" : "Set trip"}</button></div>`;
    if (trip?.mode === "move") html += `<p class="d-banner move"><small>Moving</small> <b>${esc(trip.from || "?")} → ${esc(trip.to || "?")}</b></p>`;
    else if (trip?.mode === "day") html += `<p class="d-banner"><small>Day trip</small> <b>${esc(trip.from || "Home")} → ${esc(trip.to || "?")} → back</b></p>`;
    const list = by[k].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || (a.createdAt || 0) - (b.createdAt || 0));
    html += `<ul class="list">${list.map((s) => `<li class="d-item">
      <div class="d-time">${esc(s.time || "")}</div>
      <div class="d-main">
        <p class="d-title">${esc(s.title)}</p>
        <p class="d-tags"><span class="tag">${KINDS[s.kind] || "Other"}</span>${s.leg ? ` <span class="tag">${LEGS[s.leg]}</span>` : ""}</p>
        ${s.note ? `<p class="d-note">${esc(s.note)}</p>` : ""}
        <div class="row"><a class="btn" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Open in Maps</a><button data-d="edit" data-id="${esc(s.id)}">Edit</button></div>
      </div></li>`).join("")}</ul>`;
  }
  view().innerHTML = html + tools();
  $("d-leg").onchange = (e) => { leg = e.target.value; days(); };
  bindCommon();
}

function plan() {
  const t = today();
  const list = [...D().plans].sort((a, b) => (a.start + (a.end || "")).localeCompare(b.start + (b.end || "")) || (a.createdAt || 0) - (b.createdAt || 0));
  let html = `<div class="d-actions"><button class="primary" data-d="padd">+ Add to schedule</button></div>`;
  if (!list.length) html += `<p class="empty">Nothing scheduled yet.<br>Add your houses, car rental and trains with dates.</p>`;
  html += `<ul class="list">${list.map((s) => {
    const end = s.end && s.end > s.start ? s.end : "";
    const last = end || s.start;
    const now = s.start <= t && t <= last;
    return `<li class="d-item d-plan${last < t ? " past" : ""}${now ? " now" : ""}">
      <div class="d-time"><b>${fmtShort(s.start)}${end ? ` → ${fmtShort(end)}` : ""}</b>${end && s.kind === "house" ? `<br>${nights(s.start, end)} nights` : ""}${now ? `<br><span class="d-today">Now</span>` : ""}</div>
      <div class="d-main">
        <p class="d-title">${esc(s.title)}</p>
        <p class="d-tags"><span class="tag">${PKINDS[s.kind] || "Plan"}</span></p>
        ${s.place ? `<p class="d-note" lang="ja">${esc(s.place)}</p>` : ""}
        ${s.note ? `<p class="d-note">${esc(s.note)}</p>` : ""}
        <div class="row">${safeUrl(s.url) ? `<a class="btn" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Open in Maps</a>` : ""}<button data-d="pedit" data-id="${esc(s.id)}">Edit</button></div>
      </div></li>`;
  }).join("")}</ul>`;
  view().innerHTML = html + tools();
  bindCommon();
}

// Link helpers (the import section below adds the rest).
const str = (x) => (typeof x === "string" ? x : "");
const isDate = (x) => /^\d{4}-\d{2}-\d{2}$/.test(str(x));
const safeUrl = (x) => (/^https?:\/\//i.test(str(x)) ? str(x) : "");

