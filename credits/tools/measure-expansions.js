#!/usr/bin/env node
/*
 * DevQuest Credits — phase 3a research spike: measure Wikidata expansion coverage.
 * ------------------------------------------------------------------------------
 * READ-ONLY. Runs a handful of SPARQL COUNT queries against Wikidata to decide
 * whether auto-capturing expansion->base links (via property P8646 "expansion of")
 * is worth building into the catalogue pull. Writes nothing. No npm deps.
 * Node 18+ (global fetch), same runtime as pull-wikidata.js.
 *
 *   node credits/tools/measure-expansions.js
 *
 * Read the "Decision guide" it prints at the end.
 */
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "DevQuestCredits/0.1 (https://devquest.gg; studios@devquest.gg)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query, tries = 3) {
  const url = ENDPOINT + "?format=json&query=" + encodeURIComponent(query);
  for (let a = 1; a <= tries; a++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/sparql-results+json" }, signal: ctrl.signal });
      clearTimeout(t);
      if (res.status === 429 || res.status === 503) throw new Error("busy " + res.status);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return (await res.json()).results.bindings;
    } catch (e) {
      clearTimeout(t);
      if (a === tries) throw e;
      console.warn("  retry " + a + "/" + tries + ": " + e.message);
      await sleep(2000 * a);
    }
  }
}
const num = (rows) => (rows && rows[0] ? Number(Object.values(rows[0])[0].value) : 0);
const EN = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }';

(async function () {
  console.log("Phase 3a spike — Wikidata 'expansion of' (P8646) coverage\n");

  const total = num(await sparql('SELECT (COUNT(DISTINCT ?e) AS ?c) WHERE { ?e wdt:P8646 ?base . }'));
  console.log('1) Items with an "expansion of" (P8646) link:               ' + total);
  await sleep(1200);

  const baseIsGame = num(await sparql('SELECT (COUNT(DISTINCT ?e) AS ?c) WHERE { ?e wdt:P8646 ?base . ?base wdt:P31 wd:Q7889 . }'));
  console.log('2)   ...whose base is a video game (Q7889):                  ' + baseIsGame);
  await sleep(1200);

  const expIsGame = num(await sparql('SELECT (COUNT(DISTINCT ?e) AS ?c) WHERE { ?e wdt:P8646 ?base . ?e wdt:P31 wd:Q7889 . }'));
  console.log('3)   ...where the expansion itself is a Q7889 video game:    ' + expIsGame + '   <- ALREADY in our catalogue, ready to link');
  await sleep(1200);

  const expNotGame = num(await sparql('SELECT (COUNT(DISTINCT ?e) AS ?c) WHERE { ?e wdt:P8646 ?base . FILTER NOT EXISTS { ?e wdt:P31 wd:Q7889 } }'));
  console.log('4)   ...expansion NOT typed Q7889 (missing from catalogue):  ' + expNotGame + '   <- only captured if we also pull expansion/DLC classes\n');
  await sleep(1200);

  console.log('How the P8646 expansions are typed (top "instance of" classes):');
  const types = await sparql('SELECT ?typeLabel (COUNT(DISTINCT ?e) AS ?c) WHERE { ?e wdt:P8646 ?base ; wdt:P31 ?type . ' + EN + ' } GROUP BY ?typeLabel ORDER BY DESC(?c) LIMIT 12');
  types.forEach((r) => console.log('  ' + String(r.c.value).padStart(6) + '  ' + (r.typeLabel ? r.typeLabel.value : '?')));
  await sleep(1200);

  console.log('\nSample expansion -> base pairs (eyeball the quality):');
  const samples = await sparql('SELECT ?eLabel ?baseLabel WHERE { ?e wdt:P8646 ?base . ?base wdt:P31 wd:Q7889 . ' + EN + ' } LIMIT 25');
  samples.forEach((r) => console.log('  ' + ((r.eLabel && r.eLabel.value) || '?') + '  ->  ' + ((r.baseLabel && r.baseLabel.value) || '?')));

  console.log('\n--- Decision guide ---');
  console.log(' Line 3  = expansions we can link with essentially ZERO pull changes (just add P8646 to the games query).');
  console.log(' Line 4  = extra expansions we would ALSO capture only if we broaden the pull to ingest expansion/DLC classes.');
  console.log(' Line 2  = how many links land on a real base game (the ones worth showing).');
  console.log(' Rule of thumb: if line 3 is a few thousand+, 3a is clearly worth building. If it is tiny, defer 3a and lean on user-added links.');
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
