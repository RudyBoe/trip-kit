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
      else if (a === "link") stopForm(D().stops.find((s) => s.id === b.dataset.id), true);
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
        <div class="row">${safeUrl(s.url)
          ? `<a class="btn" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Open in Maps</a>`
          : `<button data-d="link" data-id="${esc(s.id)}">Add link</button>`}<button data-d="edit" data-id="${esc(s.id)}">Edit</button></div>
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

// ---------------------------------------------------------------- forms (one dialog)

function openForm(title, fields, submit, del, delLabel) {
  const form = $("d-form");
  form.innerHTML = `<h2>${title}</h2>${fields}<p class="d-err" id="d-err" role="alert"></p>
    <div class="row"><button type="button" id="d-cancel2">Cancel</button><button type="submit" class="primary">Save</button></div>
    ${del ? `<button type="button" class="danger wide" id="d-del">${delLabel || "Delete"}</button>` : ""}`;
  $("d-cancel2").onclick = () => $("d-dlg").close();
  form.onsubmit = (e) => {
    e.preventDefault();
    const msg = submit(new FormData(form));
    if (msg) { $("d-err").textContent = msg; return; }
    save();
    $("d-dlg").close();
    renderDiary();
    toast("Saved");
  };
  if (del) {
    $("d-del").onclick = () => {
      if (!confirm(`${delLabel || "Delete"}?`)) return;
      del();
      save();
      $("d-dlg").close();
      renderDiary();
    };
  }
  $("d-dlg").showModal();
}

const field = (label, id, inner) => `<label for="${id}">${label}${inner}</label>`;

// focusLink: opened from "Add link", so start in the link field.
function stopForm(s, focusLink) {
  const v = s || { date: lastDate || today(), kind: "see" };
  openForm(s ? "Edit stop" : "New stop", `
    ${field("Google Maps link (optional)", "df-url", `<span class="d-inline"><input id="df-url" name="url" type="url" inputmode="url" autocomplete="off" placeholder="https://maps.app.goo.gl/…" value="${esc(v.url || "")}"><button type="button" id="d-paste">Paste</button></span>`)}
    ${field("Place name", "df-title", `<input id="df-title" name="title" type="text" autocomplete="off" placeholder="Taken from the link when possible" value="${esc(v.title || "")}">`)}
    <div class="row2">
      ${field("Date", "df-date", `<input id="df-date" name="date" type="date" value="${esc(v.date)}">`)}
      ${field("Time (optional)", "df-time", `<input id="df-time" name="time" type="time" value="${esc(v.time || "")}">`)}
    </div>
    <div class="row2">
      ${field("Type", "df-kind", `<select id="df-kind" name="kind">${opts(KINDS, v.kind)}</select>`)}
      ${field("Area", "df-leg", `<select id="df-leg" name="leg">${opts(LEGS, v.leg, "No area")}</select>`)}
    </div>
    ${field("Note", "df-note", `<textarea id="df-note" name="note" placeholder="Parking, opening hours, who you met…">${esc(v.note || "")}</textarea>`)}`,
  (fd) => {
    // The link is optional, but a filled-in link must be a Google Maps link.
    const raw = (fd.get("url") || "").trim();
    const r = raw ? parseMaps(raw) : { ok: true, url: "", title: "" };
    if (!r.ok) return r.msg;
    const date = fd.get("date");
    if (!date) return "Pick a date.";
    const title = (fd.get("title") || "").trim() || r.title;
    if (!title) return r.url ? "Add a place name. Short links don't contain one." : "Add a place name or a Maps link.";
    upsert(D().stops, { id: s?.id || uid(), url: r.url, title, date, time: fd.get("time") || "", kind: fd.get("kind") || "other", leg: fd.get("leg") || "", note: (fd.get("note") || "").trim(), createdAt: s?.createdAt || Date.now() });
    lastDate = date;
  },
  s && (() => { D().stops = D().stops.filter((x) => x.id !== s.id); }),
  "Delete this stop");
  let touched = !!v.title;
  $("df-title").oninput = () => (touched = true);
  $("df-url").oninput = (e) => {
    const r = parseMaps(e.target.value);
    if (r.ok && r.title && !touched) $("df-title").value = r.title;
  };
  $("d-paste").onclick = async () => {
    try {
      $("df-url").value = (await navigator.clipboard.readText()).trim();
      $("df-url").dispatchEvent(new Event("input"));
    } catch { toast("Paste blocked. Long-press the field and paste."); }
  };
  if (focusLink) $("df-url").focus();
}

function tripForm(date) {
  const cur = D().days[date];
  const v = cur || { date, mode: "day" };
  openForm("Trip day", `
    ${field("Date", "dt-date", `<input id="dt-date" name="date" type="date" value="${esc(date)}">`)}
    ${field("Type of day", "dt-mode", `<select id="dt-mode" name="mode">${opts(MODES, v.mode)}</select>`)}
    <div class="row2">
      ${field("From", "dt-from", `<input id="dt-from" name="from" type="text" autocomplete="off" placeholder="Gifu house" value="${esc(v.from || "")}">`)}
      ${field("To", "dt-to", `<input id="dt-to" name="to" type="text" autocomplete="off" placeholder="Takayama" value="${esc(v.to || "")}">`)}
    </div>`,
  (fd) => {
    const dte = fd.get("date");
    if (!dte) return "Pick a date.";
    const mode = fd.get("mode");
    if (dte !== date) delete D().days[date];
    if (!mode) delete D().days[dte];
    else D().days[dte] = { date: dte, mode, from: (fd.get("from") || "").trim(), to: (fd.get("to") || "").trim() };
    lastDate = dte;
  },
  cur && (() => { delete D().days[date]; }),
  "Clear trip info");
}

function planForm(s) {
  const v = s || { start: lastDate || today(), kind: "house" };
  openForm(s ? "Edit schedule item" : "New schedule item", `
    ${field("What", "dp-title", `<input id="dp-title" name="title" type="text" autocomplete="off" placeholder="House in Gifu, rental car pickup…" value="${esc(v.title || "")}">`)}
    <div class="row2">
      ${field("Type", "dp-kind", `<select id="dp-kind" name="kind">${opts(PKINDS, v.kind)}</select>`)}
      ${field("Address or place", "dp-place", `<input id="dp-place" name="place" type="text" lang="ja" autocomplete="off" value="${esc(v.place || "")}">`)}
    </div>
    <div class="row2">
      ${field("From", "dp-start", `<input id="dp-start" name="start" type="date" value="${esc(v.start)}">`)}
      ${field("To (optional)", "dp-end", `<input id="dp-end" name="end" type="date" value="${esc(v.end || "")}">`)}
    </div>
    ${field("Maps link (optional)", "dp-url", `<input id="dp-url" name="url" type="url" inputmode="url" autocomplete="off" value="${esc(v.url || "")}">`)}
    ${field("Note", "dp-note", `<textarea id="dp-note" name="note" placeholder="Check-in time, host name, booking number…">${esc(v.note || "")}</textarea>`)}`,
  (fd) => {
    const title = (fd.get("title") || "").trim();
    const start = fd.get("start");
    const end = fd.get("end") || "";
    if (!title) return "Say what this is.";
    if (!start) return "Pick a start date.";
    if (end && end < start) return "The end date is before the start date.";
    let url = "";
    const mu = (fd.get("url") || "").trim();
    if (mu) {
      const r = parseMaps(mu);
      if (!r.ok) return r.msg;
      url = r.url;
    }
    upsert(D().plans, { id: s?.id || uid(), title, kind: fd.get("kind") || "plan", place: (fd.get("place") || "").trim(), start, end, url, note: (fd.get("note") || "").trim(), createdAt: s?.createdAt || Date.now() });
    lastDate = start;
  },
  s && (() => { D().plans = D().plans.filter((x) => x.id !== s.id); }),
  "Delete this item");
}

// ---------------------------------------------------------------- import and text export

const str = (x) => (typeof x === "string" ? x : "");
const isDate = (x) => /^\d{4}-\d{2}-\d{2}$/.test(str(x));
const safeUrl = (x) => (/^https?:\/\//i.test(str(x)) ? str(x) : "");

// Reads the JSON that "Export backup" in the web diary writes
// ({stops, days, schedule}; an older file is just a list of stops).
async function importFile(e) {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  let j;
  try { j = JSON.parse(await f.text()); } catch { j = null; }
  const stops = Array.isArray(j) ? j : j?.stops;
  const tripDays = j?.days;
  const sched = j?.schedule;
  if (!j || typeof j !== "object" || ![stops, tripDays, sched].some(Array.isArray)) { toast("That isn't a diary export"); return; }
  const d = D();
  let a = 0, b = 0, c = 0;
  for (const s of Array.isArray(stops) ? stops : []) {
    // No link is fine; a link that isn't http(s) makes the row bad.
    if (!s || !str(s.id) || !isDate(s.date) || (str(s.url) && !safeUrl(s.url))) continue;
    upsert(d.stops, { id: str(s.id), url: safeUrl(s.url), title: str(s.title) || "Untitled stop", date: s.date, time: str(s.time), kind: Object.hasOwn(KINDS, s.kind) ? s.kind : "other", leg: Object.hasOwn(LEGS, s.leg) ? s.leg : "", note: str(s.note), createdAt: Number(s.createdAt) || Date.now() });
    a++;
  }
  for (const x of Array.isArray(tripDays) ? tripDays : []) {
    if (!x || !isDate(x.date) || !["day", "move"].includes(x.mode)) continue;
    d.days[x.date] = { date: x.date, mode: x.mode, from: str(x.from), to: str(x.to) };
    b++;
  }
  for (const s of Array.isArray(sched) ? sched : []) {
    if (!s || !str(s.id) || !isDate(s.start) || !str(s.title)) continue;
    upsert(d.plans, { id: str(s.id), title: str(s.title), kind: Object.hasOwn(PKINDS, s.kind) ? s.kind : "plan", place: str(s.place), start: s.start, end: isDate(s.end) ? s.end : "", url: safeUrl(s.url), note: str(s.note), createdAt: Number(s.createdAt) || Date.now() });
    c++;
  }
  save();
  renderDiary();
  toast(`Imported ${a} stops, ${b} trip days, ${c} schedule items`);
}

function exportText() {
  const d = D();
  const out = ["TRIP DIARY", ""];
  const plans = [...d.plans].sort((x, y) => x.start.localeCompare(y.start));
  if (plans.length) {
    out.push("SCHEDULE");
    for (const s of plans) {
      const end = s.end && s.end > s.start ? s.end : "";
      out.push(`${fmtShort(s.start)}${end ? ` → ${fmtShort(end)}` : ""} · ${PKINDS[s.kind] || "Plan"} · ${s.title}${end && s.kind === "house" ? ` (${nights(s.start, end)} nights)` : ""}`);
      if (s.place) out.push(`   ${s.place}`);
      if (s.note) out.push(`   ${s.note}`);
      if (s.url) out.push(`   ${s.url}`);
    }
    out.push("");
  }
  const keys = [...new Set([...d.stops.map((s) => s.date), ...Object.keys(d.days)])].sort();
  for (const k of keys) {
    const trip = d.days[k];
    out.push(fmtDay(k).toUpperCase());
    if (trip?.mode === "move") out.push(`Moving: ${trip.from || "?"} → ${trip.to || "?"}`);
    if (trip?.mode === "day") out.push(`Day trip: ${trip.from || "Home"} → ${trip.to || "?"} → back`);
    for (const s of d.stops.filter((x) => x.date === k).sort((x, y) => (x.time || "99").localeCompare(y.time || "99"))) {
      out.push(`${s.time ? s.time + " " : ""}${s.title} [${KINDS[s.kind] || "Other"}${s.leg ? ", " + LEGS[s.leg] : ""}]`);
      if (s.note) out.push(`   ${s.note}`);
      if (s.url) out.push(`   ${s.url}`);
    }
    out.push("");
  }
  if (out.length <= 2) { toast("The diary is empty"); return; }
  saveFile(`trip-diary-${today()}.txt`, out.join("\n"), "text/plain");
}
