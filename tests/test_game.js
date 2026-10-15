// node tests/test_game.js
const fs = require("fs"), path = require("path");
// the names in an object
function namesOf(obj) { const out = []; for (const k in obj) out.push(k); return out; }
const js = (f) => fs.readFileSync(path.join(__dirname, "..", "qml", "js", f), "utf8")
  .replace(/^\.pragma.*$/m, "").replace(/^\.import.*$/mg, "");
const Words = new Function(js("Words.js") + "; return { categories, languages, keys, labelOf, clean, parseList, parseCustom, parseBundle, pool, letterCount, fitsLength, toText };")();
const Game = new Function("Words", js("Game.js") + "; return { touched, pick, start, guess, hint, canHint, cells, masked, state, revive, emptyStats, reviveStats, record, letters };")(Words);
const Schema = new Function("Words", js("Schema.js") + "; return { groups, defaults, clean, resolve, categoryOptions, isSetting };")(Words);
const Lang = new Function(js("Lang.js") + "; return { texts, t, tOr, optionLabels };")();

let fails = 0;
function check(c, m) { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) fails++; }

console.log("== words");
const dir = path.join(__dirname, "..", "words");
const langs = Words.languages.map(l => l.key);
check(langs.join() === "en,fr,nl,ro", "Words.languages has all four");
let total = 0;
for (const lang of langs) {
  let bundle = "", count = 0;
  for (const key of Words.keys) {
    const file = path.join(dir, lang, key + "-" + lang + ".txt");
    check(fs.existsSync(file), "words/" + lang + "/" + key + "-" + lang + ".txt exists");
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n").filter(l => l.trim() && !l.startsWith("#"));
    const words = Words.parseList(text, 5000);
    if (words.length !== lines.length) console.log("    dropped in", key, lang, lines.filter(l => !Words.clean(l)));
    check(words.length === lines.length && words.length >= 50, key + "-" + lang + ": " + words.length + " words, all usable");
    count += words.length;
    bundle += "@@ " + key + "\n" + text + "\n";
  }
  const lists = Words.parseBundle(bundle + "@@ constructor\nabc\n@@ ../../x\nabc\n");
  check(namesOf(lists).length === Words.keys.length, lang + ": bundle parsed, unknown names ignored");
  check(Words.pool("mixed", lists).length === count && Words.pool("food", lists).every(p => p.category === "food"), lang + ": pools");
  console.log("    " + lang + ": " + count + " words");
  total += count;
}
check(total > 6000, total + " words in total");
check(Words.clean("  bruxelles ") === "BRUXELLES", "clean trims and upper-cases");
check(Words.clean("ţară") === "TARA" && Words.clean("Spânzurătoarea") === "SPANZURATOAREA", "romanian letters, both comma and cedilla");
check(Words.clean("Brașov") === "BRASOV" && Words.clean("bœuf") === "BOEUF" && Words.clean("Straße") === "STRASSE", "clean drops accents and ligatures");
check(Words.clean("x") === "" && Words.clean("a/b") === "" && Words.clean("../etc") === "" && Words.clean("abc1") === "", "clean rejects junk");
check(Words.clean("chute d’eau") === "CHUTE D'EAU" && Words.clean("l'") === "" && Words.clean("a' b") === "", "apostrophes kept inside words only");
check(Words.clean("Łódź") === "LODZ" && Words.clean("Søren") === "SOREN", "l and o with a stroke");
check(Words.clean("a".repeat(31)) === "" && Words.clean({}) === "" && Words.clean(null) === "", "clean rejects long words and non-text");
const custom = Words.parseCustom("# my list\nbruges\nBRUGES\n\nnew york  # city\n<b>bold</b>\nok-ish\n" + "zz\n".repeat(5000));
check(JSON.stringify(custom.slice(0, 4)) === JSON.stringify(["BRUGES", "NEW YORK", "OK-ISH", "ZZ"]), "custom words parsed: " + custom.slice(0, 4));
check(Words.pool("custom", {}, ["ABC"]).length === 1 && Words.pool("custom", {}, []).length === 0, "custom pool");
check(Words.pool("constructor", { animals: ["CAT"] }).length === 1, "odd category falls back to everything");
check(Words.fitsLength("CAT", "short") && !Words.fitsLength("ELEPHANT", "short") && Words.fitsLength("NEW YORK", "medium"), "length filter");

console.log("== game");
let g = Game.start({ word: "NEW YORK", category: "cities" }, { lives: 3, hints: 1 }, 5);
check(g.status === "playing" && g.wrong === 0, "starts playing");
check(Game.masked(g) === "_ _ _  _ _ _ _", "masked: " + Game.masked(g));
let g2 = Game.guess(g, "e");
check(g2 !== g && g2.guessed === "E" && g2.wrong === 0 && g.guessed === "", "hit, old game untouched");
check(Game.guess(g2, "E") === g2, "repeat letter does nothing");
check(Game.guess(g2, "1") === g2 && Game.guess(g2, "AB") === g2 && Game.guess(g2, "é") === g2, "non letters ignored");
let g3 = Game.guess(g2, "Z");
check(g3.wrong === 1 && Game.state(g3, "Z") === "miss" && Game.state(g3, "E") === "hit" && Game.state(g3, "Q") === "", "miss counted");
let w = g; for (const c of "NEWYORK") w = Game.guess(w, c);
check(w.status === "won", "won when all letters are found");
check(Game.guess(w, "Q") === w, "no guesses after the end");
let l = g; for (const c of "QXZ") l = Game.guess(l, c);
check(l.status === "lost" && l.wrong === 3, "lost after the last life");
let h = Game.hint(g, () => 0);
check(h.hints === 1 && h.wrong === 1 && h.guessed.length === 1 && g.word.indexOf(h.guessed) >= 0, "hint shows a letter and costs a life");
check(!Game.canHint(h) && Game.hint(h) === h, "only one hint");
let last = Game.guess(Game.guess(g, "Q"), "X");
check(!Game.canHint(last), "no hint on the last life");
let r = Game.start({ word: "BRUGES", category: "cities" }, { reveal: true });
check(r.guessed === "B" && r.given === "B" && !Game.touched(r) && Game.touched(Game.guess(r, "Z")), "reveal gives the first letter, not counted as a move");
check(Game.revive({ word: "BRUGES", guessed: "B", given: "B" }).given === "B" && Game.revive({ word: "BRUGES", guessed: "", given: "B" }).given === "", "given survives a reload only if guessed");

console.log("== revive");
check(Game.revive(null) === null && Game.revive({ word: "abc" }) === null && Game.revive({ word: "A/B" }) === null, "bad saves rejected");
let rv = Game.revive({ word: "BRUGES", guessed: "BXQQ1", lives: 99, hints: 1, maxHints: 1 });
check(rv && rv.guessed === "BXQ" && rv.lives === 12 && rv.wrong === 3, "save cleaned: " + JSON.stringify(rv));
let rv2 = Game.revive({ word: "BRUGES", guessed: "BRUGES" });
check(rv2.status === "won", "finished save stays finished");

console.log("== stats");
let s = Game.emptyStats();
s = Game.record(s, w);
s = Game.record(s, l);
s = Game.record(s, w);
check(s.played === 3 && s.won === 2 && s.streak === 1 && s.best === 1 && s.perfect === 2, "stats counted " + JSON.stringify([s.played, s.won, s.streak, s.best, s.perfect]));
check(s.byCategory.cities.played === 3 && s.byCategory.cities.won === 2, "per category");
check(s.recent.length === 3 && s.recent[0].word === "NEW YORK", "recent list");
check(Game.record(s, g).played === 3, "unfinished games don't count");
let rs = Game.reviveStats({ played: "5", won: 9, streak: -1, byCategory: JSON.parse('{"__proto__": {"played": 1}, "constructor": {"played": 4}, "food": {"played": 2, "won": 5}, "Bad Key": {}}'), recent: [{ word: "<b>", won: true }, { word: "CAT", won: "yes" }] });
check(rs.played === 5 && rs.won === 5 && rs.streak === 0, "stats numbers cleaned");
check(namesOf(rs.byCategory).join() === "food" && rs.byCategory.food.won === 2, "stats keys cleaned");
check(rs.recent.length === 1 && rs.recent[0].won === false, "recent cleaned");
check(({}).played === undefined && ({}).lives === undefined, "nothing leaked onto plain objects");
for (let i = 0; i < 40; i++) s = Game.record(s, w);
check(s.recent.length === 30, "recent capped at 30");

console.log("== pick");
const pool = [{ word: "A1" }, { word: "B1" }, { word: "C1" }];
check(Game.pick(pool, ["A1", "B1"], () => 0.99).word === "C1", "skips recent words");
check(Game.pick(pool, ["A1", "B1", "C1"], () => 0).word === "A1", "falls back when all are recent");
check(Game.pick([], [], Math.random) === null, "empty pool -> null");

console.log("== schema");
const d = Schema.defaults;
check(Schema.resolve({}).lives === 6 && Schema.resolve({ lives: 99 }).lives === 10 && Schema.resolve({ lives: "x" }).lives === 6, "ints clamped");
check(Schema.resolve({ category: "constructor" }).category === "mixed" && Schema.resolve({ language: "de" }).language === "en" && Schema.resolve({ language: "nl" }).language === "nl", "unknown enum -> default");
check(Schema.resolve({ customBg: "red" }).customBg === "#141414" && Schema.resolve({ customBg: "#ABCDEF" }).customBg === "#abcdef", "colors checked");
check(Schema.resolve({ barText: "a\u0007b" + "x".repeat(40) }).barText === "abxxxxxxxxxx", "strings cleaned and capped");
check(Schema.clean("__proto__", 1) === undefined, "unknown keys ignored");
check(Schema.categoryOptions.length === Words.keys.length + 2, "category options");

check(Schema.resolve(JSON.parse('{"lives": "7", "hints": {"x": 1}, "opacity": "1e999", "constructor": 5, "__proto__": {"lives": 9}}')).lives === 7, "settings: numbers from text, junk ignored");
check(Schema.resolve({ hints: { x: 1 } }).hints === 1 && Schema.resolve({ opacity: "1e999" }).opacity === 96, "settings: objects and odd numbers -> default");
check(Schema.clean("barText", "<img src=x>") === "img src=x", "bar text can't hold markup");
check(Schema.isSetting("lives") && Schema.isSetting("customBg") && !Schema.isSetting("__proto__") && !Schema.isSetting("constructor"), "only real setting names");
check(Schema.clean("constructor", 1) === undefined && Schema.clean("toString", 1) === undefined, "prototype names are not settings");
check(Game.revive({ word: "CAT", category: "constructor" }).category === "", "saved game with odd category");
check(Game.start({ word: "CAT", category: "x" }, { lives: "x" }).lives === 6, "bad lives option -> 6");

console.log("== texts");
const en = namesOf(Lang.texts.en);
for (const l of ["fr", "nl", "ro"]) {
  const missing = en.filter(k => !(k in Lang.texts[l]));
  const extra = namesOf(Lang.texts[l]).filter(k => !(k in Lang.texts.en));
  check(missing.length === 0 && extra.length === 0, l + " has every text " + missing.concat(extra).join(","));
}
const noText = [];
for (const g of Schema.groups) {
  if (!("group." + g.title.toLowerCase() in Lang.texts.en)) noText.push("group " + g.title);
  for (const it of g.items) {
    if (!("set." + it.key in Lang.texts.en)) noText.push("set." + it.key);
    if (!("hint." + it.key in Lang.texts.en)) noText.push("hint." + it.key);
    if (it.kind === "enum" && it.key !== "language" && it.key !== "category" && !(it.key === "keyboard"))
      for (const o of it.options) if (!("opt." + it.key + "." + o in Lang.texts.en) && !(it.key === "uiLanguage" && o !== "auto")) noText.push("opt." + it.key + "." + o);
  }
}
for (const k of Words.keys) if (!("cat." + k in Lang.texts.en)) noText.push("cat." + k);
check(noText.length === 0, "every setting and category has its texts " + noText.join(","));
check(Lang.t("fr", "head.won", 3, 5) === "3 sur 5 gagnés" && Lang.t("de", "tab.play") === "Play" && Lang.t("ro", "nope") === "nope", "t() fills in, falls back");
check(Lang.optionLabels("nl", "length", ["short"], {}).short === "Kort" && Lang.optionLabels("ro", "category", ["food"], {}).food === "Mâncare", "option labels translated");

console.log(fails ? "\nFAILURES: " + fails : "\nALL OK");
process.exit(fails ? 1 : 0);
