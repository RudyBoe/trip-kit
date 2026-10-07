// Trip Kit: boot, tabs and settings.
import { data, state, load, save, $, updateScore, toast, VERSION } from "./store.js";
import { initSigns, renderSigns } from "./signs.js";
import { initPocket, renderPocket } from "./pocket.js";
import { initExport, renderExport } from "./export.js";

load();
let tab = location.hash.slice(1) || "signs";

function showTab(t) {
  if (!["signs", "pocket", "export"].includes(t)) t = "signs";
  tab = t;
  document.querySelectorAll(".tab").forEach((s) => (s.hidden = s.id !== `tab-${t}`));
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
  history.replaceState(null, "", `#${t}`);
  ({ signs: renderSigns, pocket: renderPocket, export: renderExport })[t]();
  scrollTo(0, 0);
}

document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

// Settings
$("menu-btn").onclick = () => {
  $("opt-flash").value = state.flashSec;
  $("flash-out").textContent = `${state.flashSec} s`;
  $("menu").showModal();
};
$("opt-flash").oninput = (e) => {
  state.flashSec = Number(e.target.value);
  $("flash-out").textContent = `${state.flashSec} s`;
  save();
};

// Ask the browser not to clear our storage when space runs low.
navigator.storage?.persist?.().catch(() => {});
// Offline support (see sw.js). Off on localhost so edits show at once;
// add ?sw to the address to test it there.
if ("serviceWorker" in navigator && (location.hostname !== "localhost" || location.search.includes("sw"))) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

Promise.all([
  fetch(`data/signs.json?${VERSION}`).then((r) => r.json()),
  fetch(`data/phrases.json?${VERSION}`).then((r) => r.json()),
]).then(([signs, phrases]) => {
  data.signs = signs;
  data.phrases = phrases;
  data.byId = new Map(signs.map((s) => [s.id, s]));
  // Forget progress for signs that were removed from the data.
  for (const id of Object.keys(state.progress)) if (!data.byId.has(id)) delete state.progress[id];
  state.exportSel = state.exportSel.filter((id) => data.byId.has(id));
  updateScore();
  initSigns();
  initPocket();
  initExport();
  showTab(tab);
}).catch(() => toast("Couldn't load the data. Connect once to download it."));
