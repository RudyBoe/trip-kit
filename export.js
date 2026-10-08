// Export tab: Anki import file, progress backup and restore.
import { data, state, save, $, esc, today, toast, saveFile, prog, isMissed, updateScore, STORE, VERSION, LEGS } from "./store.js";

let kanji = null;
const loadKanji = async () => (kanji ||= await fetch(`data/kanji.json?${VERSION}`).then((r) => r.json()));

export function initExport() {
  document.querySelectorAll("[data-sel]").forEach((b) => {
    b.onclick = () => {
      const pick = {
        missed: (s) => isMissed(s.id),
        ever: (s) => prog(s.id).missed > 0,
        all: () => true,
        none: () => false,
      }[b.dataset.sel];
      state.exportSel = data.signs.filter(pick).map((s) => s.id);
      save();
      renderExport();
      toast(`${state.exportSel.length} selected`);
    };
  });
  $("anki").onclick = exportAnki;
  $("backup").onclick = backup;
  $("restore").onclick = () => $("restore-file").click();
  $("restore-file").onchange = restore;
  $("reset").onclick = () => {
    if (!confirm("Forget all seen, correct and missed counts and the day streak?\n\nAddresses are kept.")) return;
    state.progress = {};
    state.days = {};
    save();
    updateScore();
    renderExport();
  };
  // First visit: preselect the missed signs.
  if (!state.exportSel.length) state.exportSel = data.signs.filter((s) => isMissed(s.id)).map((s) => s.id);
  renderExport();
}

export function renderExport() {
  const sel = new Set(state.exportSel);
  $("sel-n").textContent = sel.size;
  $("anki").textContent = `Export ${sel.size} sign${sel.size === 1 ? "" : "s"} for Anki`;
  $("anki").disabled = !sel.size;
  const box = $("sel-list");
  if ($("sel-box").open || box.childElementCount) {
    box.innerHTML = Object.keys(LEGS).map((leg) => {
      const items = data.signs.filter((s) => s.leg === leg).sort((a, b) => a.route_order - b.route_order);
      return `<h3 class="group-head">${LEGS[leg]}</h3>` + items.map((s) => {
        const p = prog(s.id);
        return `<label class="sel"><input type="checkbox" value="${s.id}" ${sel.has(s.id) ? "checked" : ""}>
          <span><span class="ja" lang="ja">${esc(s.ja)}</span> <small>${esc(s.en)}</small></span>
          <span class="st ${isMissed(s.id) ? "x" : ""}">${p.missed ? `✗${p.missed}` : ""}</span></label>`;
      }).join("");
    }).join("");
    box.querySelectorAll("input").forEach((c) => {
      c.onchange = () => {
        state.exportSel = c.checked ? [...state.exportSel, c.value] : state.exportSel.filter((id) => id !== c.value);
        save();
        $("sel-n").textContent = state.exportSel.length;
        $("anki").textContent = `Export ${state.exportSel.length} signs for Anki`;
        $("anki").disabled = !state.exportSel.length;
      };
    });
  }
  $("sel-box").ontoggle = () => { if ($("sel-box").open && !box.childElementCount) renderExport(); };

  const ps = Object.values(state.progress);
  const seen = ps.filter((p) => p.seen).length;
  const correct = ps.reduce((a, p) => a + p.correct, 0);
  const missed = ps.reduce((a, p) => a + p.missed, 0);
  const days = Object.keys(state.days).length;
  $("stats").textContent = `${seen} of ${data.signs.length} signs seen · ${correct} right, ${missed} missed · practised on ${days} day${days === 1 ? "" : "s"}.`;
}

// ---------------------------------------------------------------- Anki

// One line per sign, tab-separated, for a note type with 6 fields:
//   English | Kanji Japanese | (empty) | (empty) | Hiragana | Notes, then tags.
// Notes: 例: sentence <br> kanji keyword kun・on … <br> verb forms <br> Note: …
const hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const kata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const VOICE = { か: "が", き: "ぎ", く: "ぐ", け: "げ", こ: "ご", さ: "ざ", し: "じ", す: "ず", せ: "ぜ", そ: "ぞ", た: "だ", ち: "ぢ", つ: "づ", て: "で", と: "ど", は: "ば", ひ: "び", ふ: "ぶ", へ: "べ", ほ: "ぼ" };
const SEMI = { は: "ぱ", ひ: "ぴ", ふ: "ぷ", へ: "ぺ", ほ: "ぽ" };

// Forms a reading can take inside a word: rendaku and small っ.
function shapes(r) {
  const out = new Set([r]);
  for (const v of [VOICE[r[0]], SEMI[r[0]]]) if (v) out.add(v + r.slice(1));
  for (const x of [...out]) if (x.length > 1 && "つくちき".includes(x.at(-1))) out.add(x.slice(0, -1) + "っ");
  return [...out];
}
// The candidate reading this word uses: the stem must appear; a kun reading
// whose okurigana also follows (と.まる in とまれ) beats one that doesn't (と.める).
function used(cands, word, isKun) {
  let best = null, score = 0;
  for (const c of cands) {
    const [stem, oku = ""] = isKun ? c.split(".") : [hira(c), ""];
    for (const f of shapes(stem)) {
      const i = word.indexOf(f);
      if (!f || i < 0) continue;
      let n = 1;
      while (n <= oku.length && word.startsWith(oku.slice(0, n), i + f.length)) n++;
      if (n > score) { best = c; score = n; }
    }
  }
  return best;
}

function kanjiLine(s) {
  const word = hira(s.reading);
  const seen = new Set();
  const parts = [];
  for (const k of s.ja) {
    const d = kanji[k];
    if (!d || seen.has(k)) continue;
    seen.add(k);
    // Prefer the reading this word uses; otherwise the first one.
    const kun = used(d.kun, word, true) || d.kun[0];
    const on = used(d.on, word, false) || d.on[0];
    const rd = [kun && kun.replace(".", ""), on && kata(on)].filter(Boolean).join("・");
    parts.push(`${k} ${d.kw}${rd ? ` ${rd}` : ""}`);
  }
  return parts.join("　");
}

function verbLine(v) {
  if (!v) return "";
  const forms = v.forms.join("…");
  if (v.suru) return `する動詞 ${forms}`;
  if (v.pair) return `${forms}　${v.type || "自動詞"} ↔ ${v.pair}（${v.type === "他動詞" ? "自動詞" : "他動詞"}）`;
  return v.type ? `${forms}　${v.type}` : forms;
}

function ankiRow(s) {
  const notes = [
    s.example && `例: ${s.example}`,
    kanjiLine(s),
    verbLine(s.verb),
    (s.where || s.note) && `Note: ${[s.where, s.note].filter(Boolean).join(". ")}`,
  ].filter(Boolean).join("<br>");
  const tags = ["trip", s.category, s.leg, s.lesson && `L${String(s.lesson).padStart(2, "0")}`, s.jlpt || "N0"].filter(Boolean).join(" ");
  // Quote a field only when it needs it (Anki reads CSV-style quotes).
  const q = (f) => (/[\t\n"]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f);
  return [s.en, s.ja, "", "", s.reading, notes, tags].map((f) => q(String(f))).join("\t");
}

export async function ankiText(ids) {
  await loadKanji();
  const rows = ids.map((id) => data.byId.get(id)).filter(Boolean).sort((a, b) => a.route_order - b.route_order).map(ankiRow);
  return ["#separator:tab", "#html:false", "#tags column:7", ...rows].join("\n") + "\n";
}

async function exportAnki() {
  try {
    await saveFile(`trip-kit-anki-${today()}.txt`, await ankiText(state.exportSel), "text/plain");
  } catch {
    toast("Couldn't build the file (offline before the first full load?)");
  }
}

// ---------------------------------------------------------------- backup

function backup() {
  save();
  const payload = { app: "trip-kit", format: 1, saved: new Date().toISOString(), state };
  saveFile(`trip-kit-backup-${today()}.json`, JSON.stringify(payload, null, 1), "application/json");
}

async function restore(e) {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  let d;
  try { d = JSON.parse(await f.text()); } catch { d = null; }
  if (d?.app !== "trip-kit" || typeof d.state !== "object") { toast("That isn't a Trip Kit backup"); return; }
  const seen = Object.keys(d.state.progress || {}).length;
  if (!confirm(`Restore the backup from ${String(d.saved).slice(0, 10)}? (${seen} signs seen)\n\nThis replaces progress, addresses and the diary on this device.`)) return;
  try { localStorage.setItem(STORE, JSON.stringify(d.state)); } catch { toast("Couldn't save the backup here"); return; }
  location.reload();
}
