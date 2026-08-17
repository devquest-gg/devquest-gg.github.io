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

// ---------- Cyborn: markup copied verbatim from cyborn.be (2026-08-17) ----------
// Real page shape: gtag snippet in <head>, then main.detail > div.job > div.text with p.title (CAPS),
// p.date (ordinal suffix), div.description, p.extra, and an a.mail mailto.
const CY_HEAD = `<!DOCTYPE html><html><head><script>
  window.dataLayer = window.dataLayer || []; function gtag() { dataLayer.push(arguments); }
</script></head><body><div class="logo"><a href="./index.html"><img src="./images/logo.png"></a></div>`;
const cyJob = (title, date) => `${CY_HEAD}
<main class="detail"><div class="job"><div class="image"><img src="./images/games/Hubris_still_02.jpg" alt="${title}"></div>
<div class="text"><p class="title">${title}</p><p class="date">${date}</p>
<div class="description"><p class="summary">Cyborn is looking for someone experienced in Unreal Engine 5 for our VR action adventure.</p>
<div class="part"><p class="header">What you bring</p><ul class="list"><li>5+ years of professional game development experience.</li>
<li>Strong C++ and Blueprints knowledge.</li><li>You are willing to work on location in Antwerp, Belgium.</li></ul></div></div>
<p class="extra">Please send your CV, motivation letter and portfolio or relevant work examples.</p>
<a class="mail" href="mailto:jobs@cyborn.be?subject=Application: ${title}">jobs@cyborn.be</a></div></div></main>
<footer><div class="links"><a href="./job.html">JOBS</a><a href="./contact.html">CONTACT</a></div></footer>
<script>console.log('footer');</script></body></html>`;
const CY_LIST = `${CY_HEAD}<main class="overview">
<a href="./jobs/senior-gameplay-developer.html"><div class="job"><p class="title">SENIOR GAMEPLAY DEVELOPER</p></div></a>
<a href="./jobs/senior-prop-artist.html"><div class="job"><p class="title">SENIOR PROP ARTIST</p></div></a>
<a href="./jobs/senior-prop-artist.html"><div class="job"><p class="title">duplicate link, must dedupe</p></div></a>
<a href="mailto:jobs@cyborn.be?subject=Application Internship: {put function here}"><div class="job"><p class="title">INTERNSHIP</p></div></a>
</main><footer><div class="links"><a href="./job.html">JOBS</a></div></footer></body></html>`;
const CY_STUDIO = { name: 'Cyborn', type: 'cyborn', careersUrl: 'https://cyborn.be/job.html', city: 'Antwerp, Belgium' };

t('cyborn.slugs', M.cybornSlugs(CY_LIST), ['senior-gameplay-developer','senior-prop-artist']);  // dedupes; mailto internship + nav job.html never match
// ALL-CAPS titles are title-cased for display, acronyms preserved; mixed case is left as authored
t('cyborn.title.caps', M.cybornTitle('SENIOR GAMEPLAY DEVELOPER (NPC BEHAVIOUR &amp; ANIMATION SYSTEMS)'), 'Senior Gameplay Developer (NPC Behaviour & Animation Systems)');
t('cyborn.title.hyphen', M.cybornTitle('SENIOR PROP ARTIST (HARD-SURFACE &amp; SCULPTING)'), 'Senior Prop Artist (Hard-Surface & Sculpting)');
t('cyborn.title.acronyms', M.cybornTitle('UE5 VFX ARTIST (VR / XR)'), 'UE5 VFX Artist (VR / XR)');
t('cyborn.title.mixed-left-alone', M.cybornTitle('Senior Gameplay Developer (NPC)'), 'Senior Gameplay Developer (NPC)');
// Date.parse cannot read "July 17th, 2026" (ordinal suffix) — that is why cybornDate exists
t('cyborn.date.stdlib-fails', isNaN(Date.parse('July 17th, 2026')), true);
t('cyborn.date.th', M.cybornDate('July 17th, 2026'), '2026-07-17T00:00:00.000Z');
t('cyborn.date.st', M.cybornDate('March 1st, 2026'), '2026-03-01T00:00:00.000Z');
t('cyborn.date.rd', M.cybornDate('August 3rd, 2026'), '2026-08-03T00:00:00.000Z');
t('cyborn.date.plain', M.cybornDate('December 9 2026'), '2026-12-09T00:00:00.000Z');
t('cyborn.date.empty', M.cybornDate(''), null);
t('cyborn.date.notamonth', M.cybornDate('Smarch 4th, 2026'), null);

const cy = M.parseCybornJob(cyJob('SENIOR GAMEPLAY DEVELOPER (NPC BEHAVIOUR &amp; ANIMATION SYSTEMS)', 'July 17th, 2026'), 'senior-gameplay-developer', CY_STUDIO);
t('cyborn.id', cy.id, 'cyborn-senior-gameplay-developer');
t('cyborn.url', cy.url, 'https://cyborn.be/jobs/senior-gameplay-developer.html');   // page, not a mailto — keeps the link checker able to verify it
t('cyborn.posted', cy.postedAt, '2026-07-17T00:00:00.000Z');
t('cyborn.loc', cy.location, 'Antwerp, Belgium');
t('cyborn.region', cy.region, 'Europe');
t('cyborn.sen', cy.seniority, 'Senior');
t('cyborn.disc', cy.discipline, 'Engineering');
t('cyborn.yoe', cy.yoe, 5);
t('cyborn.nosalary', cy.salary, null);                             // they publish none — must not invent one
// The description is cut to the authored block: stripHtml removes TAGS but not <script> CONTENTS,
// and it must stop before the mailto anchor (a partial `<a class="mail"` would survive as text).
t('cyborn.desc.nomarkup', /[<>]/.test(cy.desc), false);
t('cyborn.desc.noanalytics', /dataLayer|gtag/.test(cy.desc), false);
t('cyborn.desc.nomailto', /mailto|jobs@cyborn/.test(cy.desc), false);
t('cyborn.desc.nofooter', /CONTACT/.test(cy.desc), false);
t('cyborn.desc.start', /^Cyborn is looking for/.test(cy.desc), true);
t('cyborn.desc.end', /work examples\.$/.test(cy.desc), true);
t('cyborn.tech', cy.tech.includes('Unreal') && cy.tech.includes('C++') && cy.tech.includes('VR'), true);
// Degrade, don't throw: no title -> no row; no date -> row without postedAt; no description block ->
// falls back to <main> and still must not leak the analytics snippet
t('cyborn.notitle', M.parseCybornJob('<html><p class="date">July 17th, 2026</p></html>', 'x', CY_STUDIO), null);
const cyNoDate = M.parseCybornJob(cyJob('SENIOR PROP ARTIST', 'July 17th, 2026').replace(/<p class="date">[\s\S]*?<\/p>/, ''), 'senior-prop-artist', CY_STUDIO);
t('cyborn.nodate.posted', cyNoDate.postedAt, null);
t('cyborn.nodate.title', cyNoDate.title, 'Senior Prop Artist');
t('cyborn.nodate.disc', cyNoDate.discipline, 'Art');
const cyBare = M.parseCybornJob(`${CY_HEAD}<main class="detail"><p class="title">SENIOR TOOLS PROGRAMMER</p></main></body></html>`, 'y', CY_STUDIO);
t('cyborn.nodesc.noanalytics', /dataLayer/.test(cyBare.desc), false);
t('cyborn.nodesc.title', cyBare.title, 'Senior Tools Programmer');

// mapDiscipline guard added with Cyborn: a GENERALIST PROGRAMMER is not an artist. Before this,
// 16 live rows (EA Sports, Respawn, Ubisoft, Behaviour, Snowed In…) sat in Art.
t('disc.generalist.ue-programmer', M.mapDiscipline(null, 'Senior Generalist Unreal Engine Programmer'), 'Engineering');
t('disc.generalist.software-eng', M.mapDiscipline(null, 'Generalist Software Engineer - EA Sports FC'), 'Engineering');
t('disc.generalist.fr', M.mapDiscipline(null, 'Senior Generalist Game Programmer | Programmeur(-euse) Généraliste de Jeux Vidéo'), 'Engineering');
t('disc.generalist.3d-still-art', M.mapDiscipline(null, '3D Generalist'), 'Art');
t('disc.generalist.artist-still-art', M.mapDiscipline(null, 'Generalist Artist'), 'Art');
t('disc.generalist.cg-still-art', M.mapDiscipline(null, 'CG Generalist'), 'Art');
t('disc.generalist.hr-unchanged', M.mapDiscipline(null, 'Senior HR Generalist'), 'People & Ops');

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
