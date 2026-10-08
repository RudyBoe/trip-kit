// Shared state, saved in localStorage, and small helpers.

export const STORE = "trip-kit";
export const VERSION = "v=4";

export const CATEGORIES = {
  road: "Road", parking: "Parking", fuel: "Fuel", toll: "Toll / ETC", transit: "Train / bus",
  shop: "Shop / hours", house: "House rules", garbage: "Garbage", onsen: "Onsen / bath",
  emergency: "Emergency / weather", place: "Place names",
};
export const LEGS = { osaka: "Osaka", shiga: "Shiga", gifu: "Gifu", hida: "Hida", toyama: "Toyama" };
export const GROUPS = {
  arrival: "Arrival & check-in", house: "House", neighbours: "Neighbours & small talk",
  driving: "Driving", shops: "Shops & hours", food: "Food & dietary", emergency: "Emergency",
  thanks: "Thanks & leaving",
};

export const data = { signs: [], phrases: [], byId: new Map() };

export const state = {
  progress: {},          // id -> {seen, correct, missed, last: "ok" | "x"}
  days: {},              // "YYYY-MM-DD" -> answers that day
  mode: "flash",
  cat: "",
  leg: "",
  missedOnly: false,
  flashSec: 2,
  pview: "cards",
  me: { name: "", country: "" },
  stays: [],             // [{label, address, host, phone}]
  stay: 0,               // index of the current stay
  exportSel: [],
  dview: "days",         // Diary tab: "days" or "plan"
  diary: { stops: [], days: {}, plans: [] },
};

export function load() {
  try {
    Object.assign(state, JSON.parse(localStorage.getItem(STORE)) || {});
  } catch { /* private mode or broken data: start fresh */ }
}

export function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); }
  catch { toast("Couldn't save progress on this device"); }
}

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const prog = (id) => state.progress[id] || { seen: 0, correct: 0, missed: 0 };
export const isMissed = (id) => state.progress[id]?.last === "x";

// ok: true/false records an answer; null only marks the sign as seen.
export function record(id, ok) {
  const p = (state.progress[id] ||= { seen: 0, correct: 0, missed: 0 });
  p.seen++;
  if (ok === true) { p.correct++; p.last = "ok"; }
  if (ok === false) { p.missed++; p.last = "x"; }
  if (ok !== null) state.days[today()] = (state.days[today()] || 0) + 1;
  save();
  updateScore();
}

// Days in a row with at least one answer, counting back from today
// (or yesterday, so the streak doesn't look lost in the morning).
export function streak() {
  const d = new Date();
  if (!state.days[today(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (state.days[today(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function updateScore() {
  const n = streak();
  const t = state.days[today()] || 0;
  $("score").innerHTML = (n ? `<b>🔥 ${n}</b> day${n > 1 ? "s" : ""} · ` : "") + `today ${t}`;
  const missed = data.signs.filter((s) => isMissed(s.id)).length;
  $("missed-n").textContent = missed;
}

let toastTimer;
export function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2200);
}

// On phones the share sheet can hand the file to Anki, Files, mail …;
// elsewhere it's a normal download.
export async function saveFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Sign text size: shrinks with the number of characters.
export const plateLen = (ja) => Math.min(Math.max([...ja].length, 2), 7);
