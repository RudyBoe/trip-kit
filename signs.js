// Signs tab: Flash, Reveal, Look-alikes and Route.
import { data, state, save, $, esc, shuffle, record, isMissed, prog, plateLen, updateScore, CATEGORIES, LEGS } from "./store.js";

const view = () => $("signs-view");
let queue = [];
let queueKey = "";
let last = null;
let timer = null;
let lastGroup = null;
const open = new Set();   // expanded rows in Route

export function initSigns() {
  $("f-cat").innerHTML = `<option value="">All categories</option>` +
    Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  $("f-leg").innerHTML = `<option value="">Whole route</option>` +
    Object.entries(LEGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  $("f-cat").value = state.cat;
  $("f-leg").value = state.leg;
  $("f-cat").onchange = (e) => { state.cat = e.target.value; save(); renderSigns(); };
  $("f-leg").onchange = (e) => { state.leg = e.target.value; save(); renderSigns(); };
  $("f-missed").onclick = () => { state.missedOnly = !state.missedOnly; save(); renderSigns(); };
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.onclick = () => { state.mode = b.dataset.mode; save(); renderSigns(); };
  });
  renderSigns();
}

export function renderSigns() {
  clearTimeout(timer);
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-selected", b.dataset.mode === state.mode));
  $("f-missed").setAttribute("aria-pressed", state.missedOnly);
  (({ flash, reveal, look, route })[state.mode] || flash)();
}

const filtered = () => data.signs.filter((s) =>
  (!state.cat || s.category === state.cat) &&
  (!state.leg || s.leg === state.leg) &&
  (!state.missedOnly || isMissed(s.id)));

function empty() {
  view().innerHTML = `<p class="empty">${state.missedOnly
    ? "No missed signs here. 🎉<br>Tap ✗ to see all signs again."
    : "No signs match these filters."}</p>`;
}

// Next sign for Flash and Reveal: a shuffled pass through the filtered
// signs; a missed sign comes back a few cards later.
function nextSign() {
  const pool = filtered();
  if (!pool.length) return null;
  const key = [state.cat, state.leg, state.missedOnly].join("|");
  const ids = new Set(pool.map((s) => s.id));
  queue = key === queueKey ? queue.filter((id) => ids.has(id)) : [];
  queueKey = key;
  if (!queue.length) {
    queue = shuffle([...ids]);
    if (queue.length > 1 && queue[0] === last) queue.push(queue.shift());
  }
  last = queue.shift();
  return data.byId.get(last);
}
const comeBack = (id) => { if (!queue.includes(id)) queue.splice(Math.min(3, queue.length), 0, id); };

const meta = (s) => `${CATEGORIES[s.category]} · ${LEGS[s.leg]}`;
const plate = (s, extra = "") => `<div class="plate ${extra}" lang="ja" style="--n:${plateLen(s.ja)}">${esc(s.ja)}</div>`;

export function answerHtml(s) {
  const tags = [s.lesson && `L${s.lesson}`, s.jlpt, s.lookalike_group && "look-alike"].filter(Boolean);
  return `<p class="rd" lang="ja">${esc(s.reading)}</p>
    <p class="en">${esc(s.en)}</p>
    ${s.where ? `<p class="where">${esc(s.where)}</p>` : ""}
    ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
    ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}`;
}

// ---------------------------------------------------------------- Flash

function distractors(s) {
  const others = data.signs.filter((o) => o.id !== s.id && o.en !== s.en);
  const same = (f) => shuffle(others.filter(f));
  const picks = [];
  for (const o of [
    ...(s.lookalike_group ? same((o) => o.lookalike_group === s.lookalike_group) : []),
    ...same((o) => o.category === s.category),
    ...shuffle(others),
  ]) {
    if (picks.length === 3) break;
    if (!picks.some((p) => p.en === o.en)) picks.push(o);
  }
  return picks;
}

function flash() {
  const s = nextSign();
  if (!s) return empty();
  const sec = Math.min(5, Math.max(1, Number(state.flashSec) || 2));
  view().innerHTML = `
    <div class="stage">
      <p class="meta">${meta(s)}</p>
      ${plate(s)}
      <div class="timer"><i></i></div>
      <div class="answer"></div>
    </div>
    <div class="choices"></div>
    <p class="hint">Tap the sign to answer early</p>`;
  const bar = view().querySelector(".timer i");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.transition = `transform ${sec}s linear`;
    bar.style.transform = "scaleX(0)";
  }));
  let shown = false;
  const plateEl = view().querySelector(".plate");
  const show = () => {
    // Ignore a late timer after the view has moved on.
    if (shown || !plateEl.isConnected) return;
    shown = true;
    clearTimeout(timer);
    view().querySelector(".plate").classList.add("blank");
    view().querySelector(".timer").style.visibility = "hidden";
    view().querySelector(".hint").remove();
    const opts = shuffle([s, ...distractors(s)]);
    const box = view().querySelector(".choices");
    box.innerHTML = opts.map((o, i) => `<button data-i="${i}">${esc(o.en)}</button>`).join("");
    box.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        const pick = opts[b.dataset.i];
        box.querySelectorAll("button").forEach((x) => (x.disabled = true, x.style.opacity = 1));
        box.querySelector(`[data-i="${opts.indexOf(s)}"]`).classList.add("right");
        view().querySelector(".plate").classList.remove("blank");
        if (pick === s) {
          record(s.id, true);
          view().querySelector(".answer").innerHTML = `<p class="rd" lang="ja">${esc(s.reading)}</p>`;
          timer = setTimeout(flash, 900);
        } else {
          b.classList.add("wrong");
          record(s.id, false);
          comeBack(s.id);
          view().querySelector(".answer").innerHTML = answerHtml(s);
          // Keep only your pick and the right answer, so Next stays in reach.
          box.querySelectorAll("button:not(.right):not(.wrong)").forEach((x) => x.remove());
          box.insertAdjacentHTML("beforeend", `<button class="primary" id="next">Next</button>`);
          $("next").onclick = flash;
          $("next").scrollIntoView({ block: "nearest" });
        }
      };
    });
  };
  view().querySelector(".plate").onclick = show;
  timer = setTimeout(show, sec * 1000);
}

// ---------------------------------------------------------------- Reveal

function reveal() {
  const s = nextSign();
  if (!s) return empty();
  view().innerHTML = `
    <div class="stage">
      <p class="meta">${meta(s)}</p>
      ${plate(s)}
      <div class="answer" hidden>${answerHtml(s)}</div>
    </div>
    <div class="bar"><button class="primary" id="show">Show</button></div>
    <p class="hint">Tap the sign to show · swipe left to skip</p>`;
  const stage = view().querySelector(".stage");
  const show = () => {
    if (!view().querySelector(".answer").hidden) return;
    view().querySelector(".answer").hidden = false;
    view().querySelector(".bar").innerHTML = `<button class="x" id="r-x">✗ Missed</button><button class="ok" id="r-ok">✓ Knew it</button>`;
    $("r-x").onclick = () => { record(s.id, false); comeBack(s.id); reveal(); };
    $("r-ok").onclick = () => { record(s.id, true); reveal(); };
  };
  $("show").onclick = show;
  stage.onclick = show;
  swipe(stage, () => reveal());
}

function swipe(el, onLeft) {
  let x0 = null, y0 = null;
  el.addEventListener("pointerdown", (e) => { x0 = e.clientX; y0 = e.clientY; });
  el.addEventListener("pointerup", (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if (dx < -60 && Math.abs(dy) < Math.abs(dx)) onLeft();
  });
}

// ---------------------------------------------------------------- Look-alikes

function look() {
  const pool = filtered();
  const groups = {};
  for (const s of data.signs) if (s.lookalike_group) (groups[s.lookalike_group] ||= []).push(s);
  const usable = [...new Set(pool.filter((s) => s.lookalike_group).map((s) => s.lookalike_group))];
  if (!usable.length) {
    view().innerHTML = `<p class="empty">No look-alike groups match these filters.<br>Try all categories or the whole route.</p>`;
    return;
  }
  let g = usable[Math.floor(Math.random() * usable.length)];
  if (usable.length > 1 && g === lastGroup) g = usable[(usable.indexOf(g) + 1) % usable.length];
  lastGroup = g;
  const members = shuffle([...groups[g]]);
  const targets = members.filter((s) => pool.includes(s));
  const t = targets[Math.floor(Math.random() * targets.length)];
  view().innerHTML = `
    <div class="stage">
      <p class="meta">Which sign means…</p>
      <p class="prompt">${esc(t.en)}</p>
      <div class="answer"></div>
    </div>
    <div class="choices ja">${members.map((s, i) => `<button data-i="${i}" lang="ja">${esc(s.ja)}</button>`).join("")}</div>`;
  const box = view().querySelector(".choices");
  box.querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      const pick = members[b.dataset.i];
      box.querySelectorAll("button").forEach((x, i) => {
        x.disabled = true;
        x.style.opacity = 1;
        x.innerHTML = `${esc(members[i].ja)}<small>${esc(members[i].reading)} · ${esc(members[i].en)}</small>`;
        if (members[i] === t) x.classList.add("right");
      });
      if (pick !== t) b.classList.add("wrong");
      record(t.id, pick === t);
      view().querySelector(".answer").innerHTML = pick === t ? "" : `<p class="note">${esc(t.note || "")}</p>`;
      box.insertAdjacentHTML("beforeend", `<button class="primary" id="next">Next</button>`);
      $("next").onclick = look;
      $("next").scrollIntoView({ block: "nearest" });
    };
  });
}

// ---------------------------------------------------------------- Route

const mark = (id) => {
  const p = prog(id);
  return p.last === "x" ? `<span class="st x">✗</span>` : p.last === "ok" ? `<span class="st ok">✓</span>` : `<span class="st">·</span>`;
};

function route() {
  const pool = filtered().sort((a, b) => a.route_order - b.route_order);
  if (!pool.length) return empty();
  let html = "";
  for (const leg of Object.keys(LEGS)) {
    const items = pool.filter((s) => s.leg === leg);
    if (!items.length) continue;
    html += `<div class="leg-head"><h3>${LEGS[leg]} <small>${items.length}</small></h3>
      ${state.leg ? "" : `<button data-drill="${leg}">Drill ${LEGS[leg]}</button>`}</div>
      <ul class="list">${items.map((s) => `<li data-id="${s.id}">${routeRow(s)}</li>`).join("")}</ul>`;
  }
  view().innerHTML = html;
  view().querySelectorAll("[data-drill]").forEach((b) => {
    b.onclick = () => { state.leg = b.dataset.drill; state.mode = "flash"; $("f-leg").value = state.leg; save(); renderSigns(); };
  });
  view().querySelectorAll(".list > li").forEach(bindRow);
}

function routeRow(s) {
  return `<button class="row-btn" aria-expanded="${open.has(s.id)}">${mark(s.id)}<span class="ja" lang="ja">${esc(s.ja)}</span></button>
    ${open.has(s.id) ? `<div class="more">
      <p class="rd" lang="ja">${esc(s.reading)}</p>
      <p>${esc(s.en)}</p>
      ${s.where ? `<p class="where">${esc(s.where)}</p>` : ""}
      ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
      <div class="row"><button class="x" data-ok="0">✗ Missed</button><button class="ok" data-ok="1">✓ Knew it</button></div>
    </div>` : ""}`;
}

function bindRow(li) {
  const s = data.byId.get(li.dataset.id);
  const redraw = () => { li.innerHTML = routeRow(s); bindRow(li); };
  li.querySelector(".row-btn").onclick = () => {
    open.has(s.id) ? open.delete(s.id) : open.add(s.id);
    redraw();
  };
  li.querySelectorAll("[data-ok]").forEach((b) => {
    b.onclick = () => {
      record(s.id, b.dataset.ok === "1");
      open.delete(s.id);
      redraw();
      updateScore();
    };
  });
}
