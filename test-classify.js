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

  // --- Program management = Production (sibling of project management) ---
  ["Program Manager", "Production"],
  ["Staff Program Manager", "Production"],
  ["Senior Technical Program Manager", "Production"],
  ["Developer Program Manager, Compliance", "!Production"],   // DevRel/ops, not Production
  ["Marketing Program Manager", "!Production"],               // marketing, not Production
  // --- Localization = Production (but localization QA stays QA) ---
  ["Localization Manager", "Production"],
  ["Localization Specialist", "Production"],
  ["Localization QA Tester", "QA"],

  // --- Product management = Production, but product ANALYST = Data, economist = Data ---
  ["Director of Product", "Production"],
  ["Senior Manager, Product - Creator Platform", "Production"],
  ["Senior Director, Product - Live Game", "Production"],
  ["Senior Product Analyst", "Data & Analytics"],
  ["Senior Product Analyst - Monopoly GO!", "Data & Analytics"],
  ["Principal Game Economist", "Data & Analytics"],
  ["Product Marketing Manager", "Marketing"],          // product marketing stays Marketing, not Production
  // --- 3D modelers are artists (incl. FR forms); data/financial modelers are NOT art ---
  ["Modeleur.se - Modeler - Iron Man", "Art"],
  ["3D Modeler", "Art"],
  ["Character Modeler", "Art"],
  ["Senior Environment Modeller", "Art"],
  ["Data Modeler", "Data & Analytics"],
  ["Financial Modeling Analyst", "!Art"],

  // --- LiveOps stays in the Business & Ops catch-all (maps to "Other") ---
  ["LiveOps Specialist - MONOPOLY GO!", "Other"],
  ["LiveOps Configuration Manager - Scrabble", "Other"],

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
