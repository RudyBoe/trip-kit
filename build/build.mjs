#!/usr/bin/env node
// Check the Trip Kit data and build data/kanji.json.
//
// Sources (npm packages, downloaded once into build/.cache):
//   - kotobako-data (CC-BY-SA 4.0): JMdict words with JLPT tags from
//     Jonathan Waller's lists (via open-anki-jlpt-decks),
//   - kanji-data (MIT): KANJIDIC2 readings and meanings, Heisig keywords and
//     Jonathan Waller's JLPT kanji lists.
//
// What it does:
//   1. checks data/signs.json and data/phrases.json (required fields, ids,
//      categories, legs, groups, kana-only readings),
//   2. checks each sign's reading: against JMdict when the word is there,
//      and kanji by kanji against KANJIDIC2 readings (with rendaku and
//      small-tsu changes) so irregular readings stand out,
//   3. sets each sign's "jlpt" from Waller's word lists (absent = on no list),
//   4. writes data/kanji.json (keyword, kun, on, JLPT level for every kanji
//      in the signs) for the Anki notes, and build/report.md.
//
// Usage: node build/build.mjs        (exit code 1 on schema errors)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "build", ".cache", "npm");
const PKGS = { "kotobako-data": "26.7.19", "kanji-data": "1.1.0" };

export const CATEGORIES = ["road", "parking", "fuel", "toll", "transit", "shop", "house", "garbage", "onsen", "emergency", "place"];
export const LEGS = ["osaka", "shiga", "gifu", "hida", "toyama"];
export const GROUPS = ["arrival", "house", "neighbours", "driving", "shops", "food", "emergency", "thanks"];

// ---------------------------------------------------------------- download

function pkgFile(name, member) {
  const dir = join(CACHE, `${name}-${PKGS[name]}`);
  if (!existsSync(join(dir, "package"))) {
    mkdirSync(dir, { recursive: true });
    const tgz = join(CACHE, `${name}.tgz`);
    const url = `https://registry.npmjs.org/${name}/-/${name}-${PKGS[name]}.tgz`;
    console.log("downloading", url);
    execFileSync("curl", ["-sSL", "-o", tgz, url]);
    // Relative paths: GNU tar reads "D:..." as a remote host.
    execFileSync("tar", ["-xzf", `${name}.tgz`, "-C", `${name}-${PKGS[name]}`], { cwd: CACHE });
  }
  return JSON.parse(readFileSync(join(dir, "package", member), "utf8"));
}

// ---------------------------------------------------------------- kana

const hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const isKanji = (c) => (c >= "一" && c <= "鿿") || c === "々" || c === "ヶ" || c === "ケ";
const VOICED = Object.fromEntries([..."かきくけこさしすせそたちつてとはひふへほ"].map((c, i) => [c, "がぎぐげござじずぜぞだぢづでどばびぶべぼ"[i]]));
const SEMI = Object.fromEntries([..."はひふへほ"].map((c, i) => [c, "ぱぴぷぺぽ"[i]]));
const ALT = { ち: "じ", つ: "ず" };

function readingsOf(meta) {
  const out = new Set();
  for (const r of meta?.on_readings || []) out.add(hira(r).replace(/-/g, ""));
  for (const r of [...(meta?.kun_readings || []), ...(meta?.name_readings || [])]) {
    const [stem, oku = ""] = r.replace(/-/g, "").split(".");
    out.add(stem);
    if (oku) out.add(stem + oku);
  }
  out.delete("");
  return out;
}

function forms(base, first) {
  const heads = new Set([base]);
  if (!first) for (const v of [VOICED[base[0]], SEMI[base[0]], ALT[base[0]]]) if (v) heads.add(v + base.slice(1));
  const out = new Set(heads);
  for (const h of heads) {
    if (h.length > 1 && "つくちき".includes(h.at(-1))) out.add(h.slice(0, -1) + "っ");
    out.add(h + "っ");
  }
  return out;
}

// Can the reading be split kanji by kanji using dictionary readings?
function aligns(word, reading, meta) {
  const toks = [];
  for (const c of word) {
    if (isKanji(c) || !toks.length || isKanji(toks.at(-1).at(-1))) toks.push(c);
    else toks[toks.length - 1] += c;
  }
  const r = hira(reading);
  const go = (i, pos, prev) => {
    if (i === toks.length) return pos === r.length;
    const t = toks[i];
    if (!isKanji(t[0])) return r.startsWith(hira(t), pos) && go(i + 1, pos + t.length, null);
    const cands = t === "々" ? (prev ? [prev] : []) : t === "ケ" || t === "ヶ" ? ["け", "が", "か"] : [...readingsOf(meta[t])];
    for (const base of cands) for (const f of forms(base, i === 0)) if (r.startsWith(f, pos) && go(i + 1, pos + f.length, base)) return true;
    return false;
  };
  return go(0, 0, null);
}

// ---------------------------------------------------------------- checks

function main() {
  const signsPath = join(ROOT, "data", "signs.json");
  const signs = JSON.parse(readFileSync(signsPath, "utf8"));
  const phrases = JSON.parse(readFileSync(join(ROOT, "data", "phrases.json"), "utf8"));
  const { vocab, kanji: joyo } = pkgFile("kotobako-data", "kotobako-static.json").datasets;
  // KANJIDIC2 order (main readings first) for the jōyō kanji; kanji-data
  // has every kanji but sorts readings by kana.
  const ordered = new Map(joyo.map((k) => [k.char, k]));
  const meta = pkgFile("kanji-data", "data/kanji-meta.json");
  const klevel = {};
  for (const lv of [5, 4, 3, 2, 1]) for (const k of pkgFile("kanji-data", `data/lists/jlpt-${lv}.json`)) klevel[k] ??= lv;

  const errors = [];
  const warn = [];
  const kanaOnly = /^[ぁ-ゖァ-ヺー・、。！？「」　 A-Za-z0-9{}]+$/;
  const seen = new Set();
  const groups = {};
  for (const s of signs) {
    const at = `sign ${s.id || JSON.stringify(s.ja)}`;
    for (const f of ["id", "ja", "reading", "en", "category", "leg", "route_order"]) if (s[f] == null || s[f] === "") errors.push(`${at}: missing ${f}`);
    if (seen.has(s.id)) errors.push(`${at}: duplicate id`);
    seen.add(s.id);
    if (!CATEGORIES.includes(s.category)) errors.push(`${at}: unknown category ${s.category}`);
    if (!LEGS.includes(s.leg)) errors.push(`${at}: unknown leg ${s.leg}`);
    if (s.reading && !kanaOnly.test(s.reading)) errors.push(`${at}: reading must be kana: ${s.reading}`);
    if (s.verb && (!Array.isArray(s.verb.forms) || s.verb.forms.length !== 4)) errors.push(`${at}: verb.forms needs 4 forms`);
    if (s.lookalike_group) (groups[s.lookalike_group] ||= []).push(s.ja);
  }
  for (const [g, m] of Object.entries(groups)) if (m.length < 2) errors.push(`lookalike group ${g} has only ${m.join("")}`);
  const pseen = new Set();
  for (const p of phrases) {
    const at = `phrase ${p.id || JSON.stringify(p.ja)}`;
    for (const f of ["id", "ja", "reading", "en", "group"]) if (!p[f]) errors.push(`${at}: missing ${f}`);
    if (pseen.has(p.id)) errors.push(`${at}: duplicate id`);
    pseen.add(p.id);
    if (!GROUPS.includes(p.group)) errors.push(`${at}: unknown group ${p.group}`);
    if (p.reading && !kanaOnly.test(p.reading)) errors.push(`${at}: reading must be kana: ${p.reading}`);
    const ph = (t) => (t.match(/\{\w+\}/g) || []).sort().join();
    if (ph(p.ja) !== ph(p.reading)) errors.push(`${at}: placeholders differ between ja and reading`);
  }

  // Readings against JMdict and KANJIDIC2; JLPT word level.
  const byWord = new Map();
  const byReading = new Map();
  for (const v of vocab) {
    for (const w of [v.word, v.altWord]) if (w) (byWord.get(w) || byWord.set(w, []).get(w)).push(v);
    const r = hira(v.reading);
    (byReading.get(r) || byReading.set(r, []).get(r)).push(v);
  }
  const report = [];
  for (const s of signs) {
    const strip = (t) => t.replace(/[・、]/g, "");
    const w = strip(s.ja), r = hira(strip(s.reading));
    const entries = byWord.get(w) || [];
    // Same word with other okurigana counts too: 入口 = 入り口.
    const kanjiOf = (t) => t.replace(/[ぁ-ゖ]/g, "");
    const match = entries.find((v) => hira(v.reading) === r) ||
      (byReading.get(r) || []).find((v) => /[一-鿿]/.test(w) && kanjiOf(v.word) === kanjiOf(w));
    if (entries.length && !match) warn.push(`${s.ja} 「${s.reading}」: JMdict has ${entries.map((v) => v.reading).join(", ")}`);
    const lv = (match || {}).jlpt;
    if (lv) s.jlpt = lv; else delete s.jlpt;
    const ok = !/[一-鿿]/.test(w) || aligns(w, r, meta);
    report.push({ s, jm: match ? "✓" : entries.length ? "≠" : "–", kd: ok ? "✓" : "irregular" });
  }

  // data/kanji.json
  const kanji = {};
  for (const s of signs) for (const k of s.ja) {
    if (!/[一-鿿]/.test(k) || kanji[k]) continue;
    const m = meta[k];
    if (!m) { errors.push(`no KANJIDIC entry for ${k}`); continue; }
    const o = ordered.get(k);
    // Plain readings first, then suffix/prefix forms (-ど.まり, うわ-).
    const clean = (list) => {
      const plain = list.filter((x) => !x.includes("-"));
      return [...plain, ...list.map((x) => x.replace(/-/g, ""))].filter((x, i, a) => x && a.indexOf(x) === i);
    };
    kanji[k] = {
      kw: m.heisig_en || m.meanings[0],
      // "と.まる": the dot marks the okurigana (the app matches on the stem).
      kun: clean(o ? o.kunyomi : m.kun_readings || []),
      on: clean(o ? o.onyomi : m.on_readings || []),
      n: klevel[k] || 0,
    };
  }

  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  const ORDER = ["id", "ja", "reading", "en", "category", "leg", "route_order", "where", "lookalike_group", "lesson", "jlpt", "note", "example", "verb"];
  const tidy = (s) => Object.fromEntries([...ORDER.filter((k) => k in s), ...Object.keys(s).filter((k) => !ORDER.includes(k))].map((k) => [k, s[k]]));
  writeFileSync(signsPath, "[\n" + signs.map((s) => "  " + JSON.stringify(tidy(s))).join(",\n") + "\n]\n");
  writeFileSync(join(ROOT, "data", "kanji.json"), JSON.stringify(kanji) + "\n");

  const irregular = report.filter((x) => x.kd !== "✓");
  const md = [
    "# Data check",
    "",
    `Generated by \`node build/build.mjs\`. ${signs.length} signs, ${phrases.length} phrases, ${Object.keys(kanji).length} kanji.`,
    "",
    "JMdict: ✓ word and reading found · ≠ word found with another reading · – not in the word list (most place names).",
    "KANJIDIC2: ✓ the reading splits into dictionary readings of each kanji · irregular = it doesn't (check by hand).",
    "",
    "## Readings to check by hand",
    "",
    ...(warn.length ? warn.map((w) => `- ${w}`) : ["- none from JMdict"]),
    ...irregular.map((x) => `- ${x.s.ja} 「${x.s.reading}」 does not split into KANJIDIC2 readings${x.s.note ? ` (note: ${x.s.note})` : ""}`),
    "",
    "## All signs",
    "",
    "| # | sign | reading | JMdict | KANJIDIC2 | JLPT |",
    "|---|---|---|---|---|---|",
    ...report.map((x) => `| ${x.s.route_order} | ${x.s.ja} | ${x.s.reading} | ${x.jm} | ${x.kd} | ${x.s.jlpt || "–"} |`),
    "",
  ].join("\n");
  writeFileSync(join(ROOT, "build", "report.md"), md);
  console.log(`${signs.length} signs, ${phrases.length} phrases, ${Object.keys(kanji).length} kanji · ${warn.length} JMdict mismatches · ${irregular.length} irregular readings (see build/report.md)`);
}

main();
