// Classifier regression tests.  Run:  node test-classify.js
// Asserts that tricky game-dev titles map to the right discipline. Whenever you fix a
// miscategorization, add a case here so a later classifier edit can't silently regress it.
// (Departments are left null, so these test the TITLE rules — which must win over the department.)

const { mapDiscipline } = require("./scrape.js");

// [title, expected]  — prefix expected with "!" to assert it is NOT that discipline.
const CASES = [
  // --- Development leadership = Production ---
  ["Development Director II", "Production"],
  ["Development Director - NHL", "Production"],
  ["Senior External Development Manager", "Production"],
  ["Senior Development Manager", "Production"],
  ["Senior Director, Product - Live Game", "Production"],
  ["Senior Producer", "Production"],
  // ...but HR "Learning & Development" and "Business Development" (sales) are NOT Production
  ["Learning & Development Manager", "!Production"],
  ["Business Development Manager", "!Production"],
  ["Talent Development Director", "!Production"],

  // --- Creative leadership = Design ---
  ["Studio Creative Director", "Design"],
  ["Creative Director", "Design"],
  ["Directeur créatif", "Design"],
  ["Gameplay Designer", "Design"],
  ["Game Director", "Design"],          // creative/vision lead — Design, not Production
  ["Game Lead", "Design"],              // owns the game's design/direction — Design, not Production
  ["Game Lead - Flappy Dunk", "Design"],
  ["Game Manager", "Production"],       // live-ops / product management stays Production

  // --- Technical lead = Engineering; real software stays Engineering ---
  ["Technical Lead, Backend", "Engineering"],
  ["Game Technical Lead", "Engineering"],
  ["Software Engineer", "Engineering"],
  ["Gameplay Programmer", "Engineering"],
  ["Senior Game Developer", "Engineering"],

  // --- Animation ---
  ["MoCap Supervisor", "Animation"],
  ["Senior Animator", "Animation"],

  // --- Art (incl. outsourcing) ---
  ["Character Outsource Lead", "Art"],
  ["Environment Outsource Lead", "Art"],
  ["3D Character Art internship", "Art"],
  ["3D Environment art internship", "Art"],
  ["Art Director", "Art"],

  // --- Data analysts ---
  ["Senior Data Analyst", "Data & Analytics"],
  ["Experienced Strategy & Growth Data Analyst", "Data & Analytics"],
  ["Analytics Developer", "Data & Analytics"],

  // --- "developer" that isn't software must NOT be Engineering (strong rule AND fallback) ---
  ["Senior Business Developer", "!Engineering"],
  ["Developer Program Manager, Compliance", "!Engineering"],
  ["Product Developer Hardlines", "!Engineering"],
  ["Developer Relations Manager", "!Engineering"],

  // --- QA ---
  ["Senior QA Engineer", "QA"],
  ["QA Analyst", "QA"],

  // --- Creative direction = Design (title beats department) ---
  ["Senior Manager, Creative Direction - Wild Rift", "Design", "Art"],

  // --- Department word-boundary: a substring must not hijack the discipline ---
  // (3rd element is the department.) "partner" must not match "art", "digital" must not match "it".
  ["Brand Partnerships Specialist", "!Art", "Brand Partnerships"],
  ["Business Development Manager", "!Art", "Product – AdTech: Partner Network"],
  ["Office Coordinator", "!Art", "Partner Network"],
  ["Systems Admin", "!IT & Security", "Digital Marketing"],
  ["HR Manager", "People & Ops", "Human Resources – HR Business Partners"],
  // ...while legit multi-word departments still map correctly
  ["Some Role", "Engineering", "Software Engineering"],
  ["Some Role", "Data & Analytics", "Data Science"],
  ["Some Role", "People & Ops", "Human Resources"],
];

let pass = 0, fail = 0;
for (const [title, exp, dept] of CASES) {
  const got = mapDiscipline(dept || null, title);
  const neg = exp[0] === "!";
  const ok = neg ? got !== exp.slice(1) : got === exp;
  if (ok) pass++;
  else { fail++; console.log(`FAIL  "${title}"${dept ? " [dept: " + dept + "]" : ""}  =>  ${got}  (expected ${exp})`); }
}
console.log(`\n${pass}/${CASES.length} passed${fail ? `  —  ${fail} FAILED` : "  ✓"}`);
process.exit(fail ? 1 : 0);
