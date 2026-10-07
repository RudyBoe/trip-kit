// Pocket tab: phrase list, show-cards and my addresses.
import { data, state, save, $, esc, toast, GROUPS } from "./store.js";

const view = () => $("pocket-view");
const open = new Set();

export function initPocket() {
  document.querySelectorAll("[data-pview]").forEach((b) => {
    b.onclick = () => { state.pview = b.dataset.pview; save(); renderPocket(); };
  });
  $("card-close").onclick = () => $("card").close();
  $("card-prev").onclick = () => step(-1);
  $("card-next").onclick = () => step(1);
  $("card").addEventListener("close", releaseWake);
  $("card").querySelector(".card-body").onclick = () => $("card").close();
  renderPocket();
}

export function renderPocket() {
  document.querySelectorAll("[data-pview]").forEach((b) => b.setAttribute("aria-selected", b.dataset.pview === state.pview));
  (({ cards, all, me })[state.pview] || cards)();
}

// ---------------------------------------------------------------- placeholders

const LABEL = { name: "your name", country: "country", host: "host", address: "address" };
const current = () => state.stays[state.stay] || {};
function value(key) {
  if (key === "name" || key === "country") return (state.me[key] || "").trim();
  return (current()[key] || "").trim();
}
// For lists: missing values show as [address] in the accent colour.
const fillHtml = (t) => esc(t).replace(/\{(\w+)\}/g, (m, k) => value(k) ? esc(value(k)) : `<span class="ph">[${LABEL[k] || k}]</span>`);
// For cards: missing values become a blank line to fill in by hand.
const fillText = (t) => t.replace(/\{(\w+)\}/g, (m, k) => value(k) || "＿＿＿＿");
const fillEn = (t) => t.replace(/\{(\w+)\}/g, (m, k) => value(k) || `[${LABEL[k] || k}]`);

const groupOrder = Object.keys(GROUPS);
const sorted = (list) => [...list].sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group));

// ---------------------------------------------------------------- views

const stayCard = (s, i) => ({
  ja: s.address.trim() + (s.host?.trim() ? `\n（${s.host.trim()}さん）` : ""),
  en: [s.label || `Stay ${i + 1}`, s.phone].filter(Boolean).join(" · "),
  title: `📍 ${s.label || "Address"}`,
});
const stayCards = () => state.stays.map((s, i) => s.address?.trim() && stayCard(s, i)).filter(Boolean);

function cards() {
  const list = [
    ...stayCards(),
    ...sorted(data.phrases.filter((p) => p.show_card)).map((p) => ({ ja: fillText(p.ja), en: fillEn(p.en), html: fillHtml(p.ja), group: p.group })),
  ];
  let html = `<p class="muted">Tap a card to show it full-screen. Add your houses under <b>Addresses</b> to fill in the blanks.</p><ul class="list">`;
  let g = null;
  list.forEach((c, i) => {
    if (c.group && c.group !== g) { g = c.group; html += `</ul><h3 class="group-head">${GROUPS[g]}</h3><ul class="list">`; }
    html += `<li class="phrase"><button class="row-btn" data-i="${i}">
      <span class="ja" lang="ja">${c.title ? esc(c.title) + "<br>" : ""}${c.html || esc(c.ja).replace(/\n/g, "<br>")}</span>
      <span class="icon" aria-hidden="true">⛶</span></button></li>`;
  });
  view().innerHTML = html + "</ul>";
  view().querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => showCard(list, Number(b.dataset.i))));
}

function all() {
  let html = "";
  for (const g of groupOrder) {
    const items = data.phrases.filter((p) => p.group === g);
    if (!items.length) continue;
    html += `<h3 class="group-head">${GROUPS[g]}</h3><ul class="list">${items.map((p) => `<li class="phrase" data-id="${p.id}">${row(p)}</li>`).join("")}</ul>`;
  }
  view().innerHTML = html;
  view().querySelectorAll("li[data-id]").forEach(bindRow);
}

function row(p) {
  return `<button class="row-btn" aria-expanded="${open.has(p.id)}"><span class="ja" lang="ja">${fillHtml(p.ja)}</span>${p.show_card ? `<span class="icon" aria-label="card">⛶</span>` : ""}</button>
    ${open.has(p.id) ? `<div class="more">
      <p class="rd" lang="ja">${fillHtml(p.reading)}</p>
      <p>${esc(fillEn(p.en))}${p.lesson ? ` <span class="tag">L${p.lesson}</span>` : ""}</p>
      <div class="row"><button data-card>Show card</button></div>
    </div>` : ""}`;
}

function bindRow(li) {
  const p = data.phrases.find((x) => x.id === li.dataset.id);
  li.querySelector(".row-btn").onclick = () => {
    open.has(p.id) ? open.delete(p.id) : open.add(p.id);
    li.innerHTML = row(p);
    bindRow(li);
  };
  const b = li.querySelector("[data-card]");
  if (b) b.onclick = () => showCard([{ ja: fillText(p.ja), en: fillEn(p.en) }], 0);
}

function me() {
  if (!state.stays.length) state.stays.push({ label: "", address: "", host: "", phone: "" });
  view().innerHTML = `
    <div class="me-form">
      <p class="muted">Stored only on this phone. Write names and addresses in Japanese as you want them shown, e.g. 岐阜県高山市…</p>
      <label>Your name (as you say it, e.g. in katakana)<input type="text" data-me="name" value="${esc(state.me.name || "")}" lang="ja" autocomplete="off"></label>
      <label>Your country in Japanese (e.g. ベルギー, オランダ)<input type="text" data-me="country" value="${esc(state.me.country || "")}" lang="ja" autocomplete="off"></label>
      <h3 class="group-head">Stays</h3>
      ${state.stays.map((s, i) => `
        <div class="stay ${i === state.stay ? "current" : ""}" data-stay="${i}">
          <label>Name for this stay<input type="text" data-k="label" value="${esc(s.label || "")}" placeholder="e.g. Takayama house" autocomplete="off"></label>
          <label>Address (Japanese)<textarea data-k="address" lang="ja" placeholder="岐阜県高山市…">${esc(s.address || "")}</textarea></label>
          <label>Host's name (Japanese, without さん)<input type="text" data-k="host" value="${esc(s.host || "")}" lang="ja" autocomplete="off"></label>
          <label>Phone<input type="text" data-k="phone" value="${esc(s.phone || "")}" inputmode="tel" autocomplete="off"></label>
          <div class="row">
            <button data-act="use" ${i === state.stay ? "disabled" : ""}>${i === state.stay ? "✓ In cards" : "Use in cards"}</button>
            <button data-act="card">Show card</button>
            <button data-act="del" class="danger">Delete</button>
          </div>
        </div>`).join("")}
      <button id="add-stay">+ Add a stay</button>
    </div>`;
  view().querySelectorAll("[data-me]").forEach((inp) => {
    inp.oninput = () => { state.me[inp.dataset.me] = inp.value; save(); };
  });
  view().querySelectorAll("[data-stay]").forEach((box) => {
    const i = Number(box.dataset.stay);
    box.querySelectorAll("[data-k]").forEach((inp) => {
      inp.oninput = () => { state.stays[i][inp.dataset.k] = inp.value; save(); };
    });
    box.querySelector('[data-act="use"]').onclick = () => { state.stay = i; save(); me(); };
    box.querySelector('[data-act="card"]').onclick = () => {
      if (state.stays[i].address?.trim()) showCard([stayCard(state.stays[i], i)], 0);
      else toast("Write the address first");
    };
    box.querySelector('[data-act="del"]').onclick = () => {
      const s = state.stays[i];
      if ((s.address || s.label) && !confirm(`Delete ${s.label || "this stay"}?`)) return;
      state.stays.splice(i, 1);
      if (state.stay >= state.stays.length) state.stay = Math.max(0, state.stays.length - 1);
      save();
      me();
    };
  });
  $("add-stay").onclick = () => {
    state.stays.push({ label: "", address: "", host: "", phone: "" });
    save();
    me();
  };
}

// ---------------------------------------------------------------- full-screen card

let deck = [];
let at = 0;
let wake = null;

function showCard(list, i) {
  deck = list;
  at = i;
  drawCard();
  if (!$("card").open) $("card").showModal();
  navigator.wakeLock?.request("screen").then((w) => (wake = w)).catch(() => {});
}

function drawCard() {
  const c = deck[at];
  const ja = $("card-ja");
  ja.textContent = c.ja;
  ja.style.whiteSpace = "pre-line";
  // Biggest size at which the text fits about 60% of the screen.
  const n = Math.max([...c.ja.replace(/\s/g, "")].length, 1);
  const w = Math.min(innerWidth, 900) - 40;
  const h = innerHeight * 0.6;
  const size = Math.min(w / 4.2, 140, Math.sqrt((w * h) / (n * 1.5)));
  ja.style.setProperty("--size", `${Math.max(28, Math.floor(size))}px`);
  $("card-en").textContent = c.en;
  $("card-prev").disabled = at === 0;
  $("card-next").disabled = at === deck.length - 1;
}

function step(d) {
  at = Math.min(deck.length - 1, Math.max(0, at + d));
  drawCard();
}

function releaseWake() {
  wake?.release?.().catch(() => {});
  wake = null;
}
