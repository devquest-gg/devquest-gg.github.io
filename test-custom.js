const M = require('./scrape.js');
let pass=0, fail=0;
const t=(l,g,w)=>{ if(JSON.stringify(g)===JSON.stringify(w)){pass++;} else {fail++;console.log(`FAIL ${l}:\n  got  ${JSON.stringify(g)}\n  want ${JSON.stringify(w)}`);} };

// ---------- Welevel: markup copied verbatim from career.welevel.com (2026-08-05) ----------
const WELEVEL = `<div class="jobs">
<a class="job-card" href="/jobs/art-lead-m-f-d"><div><div class="title">Art Lead (m/f/d)</div><div class="meta">M&uuml;nchen, Germany &middot; Full-time &middot; Onsite</div></div><span class="arrow">&rarr;</span></a>
<a class="job-card" href="/jobs/senior-foliage-artist"><div><div class="title">Senior Foliage Artist (m/f/d)</div><div class="meta">Munich &middot; Full-Time &middot; Onsite</div></div><span class="arrow">&rarr;</span></a>
<a class="job-card" href="/jobs/senior-gameplay-programmer-m-f-d"><div><div class="title">Senior Gameplay Programmer (m/f/d)</div><div class="meta">M&uuml;nchen, Germany &middot; Full-time &middot; Onsite</div></div><span class="arrow">&rarr;</span></a>
<a class="job-card" href="/jobs/senior-game-qa-tester-m-f-d"><div><div class="title">Senior Game QA Tester (m/f/d)</div><div class="meta">M&uuml;nchen, Germany &middot; Full-time &middot; Onsite</div></div><span class="arrow">&rarr;</span></a>
<a class="job-card" href="/jobs/art-lead-m-f-d"><div><div class="title">Art Lead (m/f/d)</div><div class="meta">duplicate card, must be deduped</div></div></a>
</div>`;
const w = M.parseWelevel(WELEVEL, {name:'Welevel', city:'Munich, Germany'});
t('welevel.count', w.length, 4);                                   // 5 anchors, one a dup
t('welevel.title', w[0].title, 'Art Lead (m/f/d)');
t('welevel.umlaut', w[0].location, 'München, Germany');            // &uuml; must decode
t('welevel.url', w[0].url, 'https://career.welevel.com/jobs/art-lead-m-f-d');
t('welevel.id', w[0].id, 'welevel-art-lead-m-f-d');
t('welevel.region', w[0].region, 'Europe');
t('welevel.region2', w[1].region, 'Europe');                       // bare "Munich" must also resolve
t('welevel.disc.art', w[0].discipline, 'Art');
t('welevel.disc.eng', w[2].discipline, 'Engineering');
t('welevel.disc.qa', w[3].discipline, 'QA');
t('welevel.sen', w[2].seniority, 'Senior');
t('welevel.worktype', w[0].workType, 'Onsite');                    // explicit third meta field
t('welevel.noDate', w[0].postedAt, null);

// ---------- Bohemia: markup copied verbatim from careers.bohemia.net (2026-08-05) ----------
const card = (href, band, title, project, disc, loc) =>
 `<a class="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md" href="${href}" data-discover="true"><span class="text-text-secondary careers-label-text-sm">${band}</span><h3 class="text-text-primary mb-2 text-lg leading-tight font-semibold">${title}</h3><div class="flex flex-col gap-2"><div class="text-text-secondary flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" class="lucide"><path d="m6 9 6 6 6-6"></path></svg><span class="careers-label-text-sm">${project}</span></div><div class="text-text-secondary flex items-center gap-1.5"><svg class="lucide"><path d="M1"></path></svg><p class="careers-label-text-sm">${disc}</p></div><div class="text-text-secondary flex items-center gap-1.5"><svg class="lucide"><path d="M2"></path></svg><span class="careers-label-text-sm"><span>${loc}</span></span></div></div></a>`;
const BOHEMIA = [
  card('/en/open-positions/animation-programmer-ms90fctz','Medior','Programmer','Enfusion','Programming','Prague, CZ'),
  card('/en/open-positions/senior-technical-artist-mryqmhqz','Senior','Senior Technical Artist','Arma 4','Art &amp; Animation','Prague, CZ'),
  card('/en/open-positions/intermediate-qa-tester-mrw3ndbo','Medior','Intermediate QA Tester','DayZ','Quality Assurance','Brno, CZ'),
  card('/en/open-positions/technical-animator-mrlyb698','Medior','Technical Animator (Rigging/Skinning)','Arma 4','Art &amp; Animation','Prague / Brno, CZ'),
  card('/en/open-positions/senior-ux-designer-x','Senior','UI/UX Designer','Arma 4','Design','Prague, CZ'),
  card('/en/open-positions/animation-programmer-ms90fctz','Medior','Programmer','Enfusion','Programming','Prague, CZ'), // dup
].join('\n');
const b = M.parseBohemia(BOHEMIA, {name:'Bohemia Interactive', city:'Prague, Czechia'});
t('bohemia.count', b.length, 5);
t('bohemia.title', b[3].title, 'Technical Animator (Rigging/Skinning)');
t('bohemia.url', b[0].url, 'https://careers.bohemia.net/en/open-positions/animation-programmer-ms90fctz');
t('bohemia.id', b[0].id, 'bohemia-animation-programmer-ms90fctz');
t('bohemia.loc', b[2].location, 'Brno, CZ');
t('bohemia.multiloc', b[3].location, 'Prague / Brno, CZ');
t('bohemia.band.medior', b[0].seniority, 'Mid');                   // their band, not inferSeniority
t('bohemia.band.senior', b[1].seniority, 'Senior');
t('bohemia.disc.eng', b[0].discipline, 'Engineering');
t('bohemia.disc.art', b[1].discipline, 'Art');
t('bohemia.disc.qa', b[2].discipline, 'QA');
t('bohemia.disc.anim', b[3].discipline, 'Animation');
t('bohemia.disc.design', b[4].discipline, 'Design');
t('bohemia.entities', /&amp;|&#/.test(JSON.stringify(b)), false);  // no raw entities leak anywhere
// Czech locations must not fall into "Other"
t('bohemia.region', [...new Set(b.map(x=>x.region))], ['Europe']);

// ---------- decodeEnt / inferRegion: shared-code changes made for these fetchers ----------
t('ent.uuml', M.decodeEnt('M&uuml;nchen'), 'München');
t('ent.numeric', M.decodeEnt('caf&#233;'), 'café');
t('ent.hex', M.decodeEnt('na&#xEF;ve'), 'naïve');
t('ent.unknown-left-alone', M.decodeEnt('a &notarealentity; b'), 'a &notarealentity; b');
t('ent.existing-still-work', M.decodeEnt('A &amp; B &quot;C&quot; &nbsp;D'), 'A & B "C"  D');
// cities that used to fall into "Other"
for (const [loc, want] of [['Munich','Europe'],['München, Germany','Europe'],['Brno, CZ','Europe'],
                           ['Vilnius, Lithuania','Europe'],['Warsaw','Europe'],['Dnipro','Europe'],
                           ['Prague, CZ','Europe'],['Sofia, BG','Europe']])
  t('region:'+loc, M.inferRegion(loc), want);
// ...and places that must NOT have been dragged into Europe by the new city list
for (const [loc, want] of [['Austin, TX','North America'],['Cambridge, MA','North America'],
                           ['Seattle, WA','North America'],['Vancouver, BC','North America'],
                           ['Tokyo, Japan','Asia-Pacific'],['Shanghai, China','Asia-Pacific'],
                           ['Melbourne, Australia','Asia-Pacific'],['Tel Aviv, Israel','Middle East & Africa'],
                           ['São Paulo, Brazil','Latin America'],['Remote','Remote']])
  t('region-guard:'+loc, M.inferRegion(loc), want);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
