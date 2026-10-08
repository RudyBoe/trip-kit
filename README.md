# Trip Kit

A small, phone-first web app for a road trip through Japan: **Osaka → Shiga → Gifu → the Hida mountains (Tōkai-Hokuriku Expressway) → Toyama**. It drills the signs and place names you see at a glance from the driver's seat, and keeps a pocket of polite phrases for hosts, neighbours, petrol stations and emergencies.

**Open it:** https://rudyboe.github.io/trip-kit/

It is a sibling of [Kanji Trainer](https://rudyboe.github.io/kanji-trainer/): same look, light/dark following the phone, no login, no backend. Everything you do stays on your phone. After the first visit it works offline (for example in a tunnel or in the mountains). On iPhone use *Share → Add to Home Screen*, on Android *Install app*, to get it as an app.

## The four tabs

### 止 Signs

143 real signs along the route, in route order, in 11 categories: road, parking, fuel, toll/ETC, train/bus, shop/hours, house rules, garbage, onsen/bath, emergency/weather and place names.

- **Flash**: the sign shows for 2 seconds (1–5 s under ⋯), then you pick its meaning from 4 choices. Tap the sign to answer sooner. A wrong answer shows the reading, meaning and a note, and the sign comes back a few cards later.
- **Reveal**: tap the sign to see the reading and meaning, then mark it ✓ or ✗. Swipe left to skip.
- **Look-alikes**: signs that are easy to mix up (出口/入口/非常口, 駐車場/駐輪場, 満車/空車, 右折/左折, 徐行/通行止め/冬季閉鎖, 禁止/許可, 軽油/灯油/レギュラー/ハイオク, 燃えるごみ/燃えないごみ/資源ごみ/粗大ごみ, 男湯/女湯, 警報/注意報 …) side by side; pick the one that matches the English.
- **Route**: every sign in route order, grouped by leg (Osaka, Shiga, Gifu, Hida, Toyama). Tap a sign to see it; *Drill* a leg to flash just that leg.

Filters at the top: category, leg, and **✗** for the signs you missed last time. Place names show prefecture and town; many have irregular readings (郡上 ぐじょう, 白川郷 しらかわごう, 南砺 なんと, 城端 じょうはな, 砺波 となみ, 荘川 しょうかわ, 関ケ原 せきがはら).

### 話 Pocket

105 phrases in polite です/ます form, using *Minna no Nihongo* grammar up to lesson 33 where possible, in 8 groups: arrival & check-in, house, neighbours & small talk, driving, shops & hours, food & dietary, emergency, thanks & leaving.

- **Cards**: phrases meant to be shown (dietary lines, breakdown, "I'm renting the house at …", the address of your stay). Tap one for a full-screen card in large Japanese to hold up to someone; ‹ › flips to the next card. The screen stays on while a card is open.
- **All phrases**: tap a phrase for the reading and English; *Show card* makes any phrase full-screen.
- **Addresses**: your name, your country (in Japanese) and your stays (address, host, phone). These fill the blanks in phrases such as 「{address}の家を借りています。」. *Use in cards* picks the stay the cards talk about. Stored only on your phone (and in your backup file).

### 記 Diary

A dated trip diary and schedule that works offline, so you can log things in a car park in the mountains. Stored on the phone and included in the backup.

- **Days**: tap *+ Stop*, paste a Google Maps link (the *Paste* button reads your clipboard), pick the date, an optional time, a type (stay, eat, see, drive, shop) and an area. The place name is taken from long links; short `maps.app.goo.gl` links have no name, so type it. *Open in Maps* opens the place in the Maps app. Stops are grouped by date.
- **Trip day**: mark a date as a *day trip, back home* (from your house to a place and back) or a *move from A to B*. It shows as a banner above that day's stops.
- **Schedule**: houses (with the number of nights), car rental, trains and plans with from/to dates. The current item is marked *Now*, past ones are dimmed.
- **Import from web diary**: reads the JSON written by *Export backup* in the Tabi Diary web page and merges it (same id = updated, nothing is deleted).
- **Share as text**: the whole diary as a plain text file, for Notes or mail.

Google Maps links need a connection to open. Download the areas you will drive through in the Google Maps app (*Offline maps*) so the places still open without signal.

### ⇪ Export

- **Anki export**: choose signs (*Missed now*, *Ever missed*, *All*, or one by one) and export them as an Anki import file. See below.
- **Back up / Restore** your progress, addresses and diary as a JSON file, like in Kanji Trainer. Use it before changing phones or clearing the browser.

Progress per sign (seen, right, missed) and the day streak are kept in the browser's local storage.

## Anki export

The file is UTF-8, tab-separated, one sign per line, for a note type with 6 fields plus tags:

```
#separator:tab
#html:false
#tags column:7
English	Kanji Japanese	(empty)	(empty)	Hiragana	Notes	tags
```

Notes, with `<br>` between lines:

```
例: 「止まれ」の所では止まってください。
止 stop とまる・シ
止まる…止まります…止まって…止まらない　自動詞 ↔ 止める（他動詞）
Note: Red inverted triangle. Imperative of 止まる.
```

- line 1: an example sentence;
- line 2: each kanji with its keyword (Heisig) and a kun reading in hiragana・an on reading in katakana, preferring the readings this word uses;
- line 3, for verbs: 辞書形…ます形…て形…ない形, with *する動詞* in front for する verbs and the 自動詞 ↔ 他動詞 partner when there is one;
- line 4: the note (and, for place names, the prefecture and town), only when there is one.

Tags: `trip`, the category, the leg (`osaka` `shiga` `gifu` `hida` `toyama`), `Lxx` for the *Minna no Nihongo* lesson if given, and the JLPT level `N5`…`N1` (`N0` if the word is on no list).

To import: on the phone the export button opens the share sheet (send it to AnkiMobile/AnkiDroid, Files or mail); on a computer it downloads. In Anki: *File → Import*, pick your 6-field note type and deck. If the notes show a literal `<br>` instead of line breaks, tick *Allow HTML in fields* in the import dialog (or change `#html:false` to `#html:true` in the file's header).

## Adding signs and phrases

Edit the JSON files in `data/` and push; GitHub Pages publishes within a minute or two. Then bump the version (see *Updating* below) so phones fetch the new data.

### data/signs.json

One object per sign. Required: `id`, `ja`, `reading`, `en`, `category`, `leg`, `route_order`.

| field | example | meaning |
|---|---|---|
| `id` | `"tomare"` | unique, never change it (progress is stored per id) |
| `ja` | `"止まれ"` | the sign as written |
| `reading` | `"とまれ"` | hiragana (katakana for loanwords) |
| `en` | `"Stop"` | short English, used as an answer choice |
| `category` | `"road"` | `road` `parking` `fuel` `toll` `transit` `shop` `house` `garbage` `onsen` `emergency` `place` |
| `leg` | `"osaka"` | where you'll first meet it: `osaka` `shiga` `gifu` `hida` `toyama` |
| `route_order` | `390` | sort order along the route (steps of 10, so you can insert between) |
| `where` | `"Gifu Prefecture · Gujō city"` | place names: prefecture and town |
| `lookalike_group` | `"stop"` | signs with the same group are drilled together (2 or more) |
| `lesson` | `33` | *Minna no Nihongo* lesson that teaches the word |
| `jlpt` | `"N5"` | set by the build script from Waller's lists, don't edit |
| `note` | `"Red inverted triangle."` | usage, nuance, irregular reading |
| `example` | `"「止まれ」の所では止まってください。"` | example sentence for the Anki notes |
| `verb` | `{"forms": ["止まる", "止まります", "止まって", "止まらない"], "type": "自動詞", "pair": "止める"}` | for the Anki verb line; する verbs: `{"forms": ["給油する", …], "suru": true}` |

### data/phrases.json

Required: `id`, `ja`, `reading`, `en`, `group`. Optional: `show_card` (`true` to list it under *Cards*), `lesson`.

Groups: `arrival` `house` `neighbours` `driving` `shops` `food` `emergency` `thanks`.

Placeholders filled from *Addresses*: `{name}`, `{country}`, `{host}`, `{address}`. Use the same placeholders in `ja`, `reading` and `en`.

### Check the data

With [Node.js](https://nodejs.org/) installed:

```
node build/build.mjs
```

It checks the JSON (required fields, unique ids, known categories/legs/groups, kana-only readings, look-alike groups of 2+), checks every reading against JMdict and kanji by kanji against KANJIDIC2, sets `jlpt`, rebuilds `data/kanji.json` (keywords and readings for the Anki notes) and writes [build/report.md](build/report.md) with the readings to check by hand. The dictionaries are downloaded once into `build/.cache/`.

To try the app on your computer: `node build/serve.mjs`, then open http://localhost:8080/ (the offline cache is off on localhost so edits show at once; add `?sw` to the address to test it).

### Updating

Phones keep the cached copy until the version changes. When you change any file, bump `VERSION` in `sw.js` (now `v3`, so next `v4`) and the `?v=3` tags in `index.html` and `store.js` to match.

## Credits

- [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) and [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) © the Electronic Dictionary Research and Development Group, used under [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html), via the npm packages [kotobako-data](https://www.npmjs.com/package/kotobako-data) (CC BY-SA 4.0) and [kanji-data](https://www.npmjs.com/package/kanji-data) (MIT).
- JLPT word and kanji levels: [Jonathan Waller's JLPT lists](https://www.tanos.co.uk/jlpt/).
- Kanji keywords: James W. Heisig, *Remembering the Kanji* (via kanji-data).
- Lesson numbers refer to *Minna no Nihongo* (3A Corporation).
- Signs, notes and phrases were written for this trip. Rules differ per town (garbage days especially): check the sheet in your house.
