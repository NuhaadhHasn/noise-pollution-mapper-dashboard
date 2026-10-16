// READ-ONLY production probe for the dashboard audit. Performs zero writes.
// Prints only aggregates and categorical enumerations - never emails, uids,
// coordinates, or any key material.
const path = require('path');
const fs = require('fs');
const DASH = 'C:/Users/nuhaa/Downloads/Chatgpt/noise-pollution-mapper-dashboard';
const APP = 'C:/Users/nuhaa/Downloads/Chatgpt/noise_pollution_mapper';
const OUT = process.argv[2];
const admin = require(path.join(DASH, 'functions/node_modules/firebase-admin'));
const { Timestamp, GeoPoint } = require(path.join(DASH, 'functions/node_modules/firebase-admin/lib/firestore'));

admin.initializeApp({ credential: admin.credential.cert(require(path.join(DASH, 'serviceAccountKey.json'))) });
const db = admin.firestore();

const typeOf = (v) => {
  if (v === null) return 'null';
  if (v instanceof Timestamp) return 'Timestamp';
  if (v instanceof GeoPoint) return 'GeoPoint';
  if (Array.isArray(v)) return 'array';
  if (v && typeof v.toDate === 'function') return 'Timestamp*';
  return typeof v;
};
const bump = (m, k, n = 1) => { m[k] = (m[k] || 0) + n; };
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd();

(async () => {
  const report = {};

  // 1. Deployed Firestore ruleset vs the checked-in one.
  try {
    const rs = await admin.securityRules().getFirestoreRuleset();
    const deployed = rs.source[0].content;
    fs.writeFileSync(path.join(OUT, 'deployed_firestore.rules'), deployed);
    report.rules = {
      rulesetName: rs.name,
      createTime: rs.createTime,
      matchesAppRepo: norm(deployed) === norm(fs.readFileSync(path.join(APP, 'firestore.rules'), 'utf8')),
      matchesDashRepo: norm(deployed) === norm(fs.readFileSync(path.join(DASH, 'firestore.rules'), 'utf8')),
    };
  } catch (e) { report.rules = { error: String(e.message || e) }; }

  // 2. users: does ANY doc carry role == 'admin'?
  const users = await db.collection('users').get();
  const roleHist = {}; const userFields = {};
  users.forEach((d) => {
    const data = d.data();
    bump(roleHist, 'role' in data ? `role=${JSON.stringify(data.role)}` : '(no role field)');
    Object.keys(data).forEach((k) => bump(userFields, `${k}:${typeOf(data[k])}`));
  });
  report.users = { count: users.size, roleHistogram: roleHist, fieldTypes: userFields };
  try {
    const authList = await admin.auth().listUsers(1000);
    const docIds = new Set(users.docs.map((d) => d.id));
    report.auth = {
      authUsers: authList.users.length,
      authUsersWithoutProfileDoc: authList.users.filter((u) => !docIds.has(u.uid)).length,
      usersWithCustomClaims: authList.users.filter((u) => u.customClaims && Object.keys(u.customClaims).length).length,
      providers: authList.users.reduce((m, u) => { u.providerData.forEach((p) => bump(m, p.providerId)); return m; }, {}),
    };
  } catch (e) { report.auth = { error: String(e.message || e) }; }

  // 3. noise_readings: schema reality the dashboard must parse.
  const snap = await db.collection('noise_readings').get();
  const fieldTypes = {}; const cat = { soundClass: {}, soundType: {}, category: {}, classificationSource: {}, source: {} };
  const shapes = { deletedUserDocs: 0, userEmailRawLooking: 0, userEmailMasked: 0, userEmailMissing: 0,
    timestampVsCreatedAt: {}, decibelRange: { min: Infinity, max: -Infinity, nonFinite: 0 } };
  const rawEmail = /^[^*\s@]+@[^\s@]+\.[^\s@]+$/;
  snap.forEach((d) => {
    const x = d.data();
    Object.keys(x).forEach((k) => bump(fieldTypes, `${k}:${typeOf(x[k])}`));
    Object.keys(cat).forEach((k) => { if (k in x) bump(cat[k], String(x[k])); });
    if (typeof x.userId === 'string' && x.userId.startsWith('deleted_user_')) shapes.deletedUserDocs++;
    if (!('userEmail' in x)) shapes.userEmailMissing++;
    else if (typeof x.userEmail === 'string' && rawEmail.test(x.userEmail)) shapes.userEmailRawLooking++;
    else shapes.userEmailMasked++;
    bump(shapes.timestampVsCreatedAt, `timestamp:${typeOf(x.timestamp)} createdAt:${typeOf(x.createdAt)}`);
    const db_ = x.decibel ?? x.decibels ?? x.dB ?? x.db ?? x.noiseLevel;
    if (typeof db_ === 'number' && Number.isFinite(db_)) {
      shapes.decibelRange.min = Math.min(shapes.decibelRange.min, db_);
      shapes.decibelRange.max = Math.max(shapes.decibelRange.max, db_);
    } else shapes.decibelRange.nonFinite++;
  });
  report.noise_readings = { count: snap.size, fieldTypes, categoricals: cat, shapes };

  // 4. other collections (ids only)
  const cols = await db.listCollections();
  report.collections = {};
  for (const c of cols) {
    const s = await c.select().get();
    report.collections[c.id] = { docCount: s.size, sampleIds: c.id === 'noise_readings' || c.id === 'users' ? '(omitted)' : s.docs.slice(0, 10).map((d) => d.id) };
  }

  fs.writeFileSync(path.join(OUT, 'prod_probe.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
})().catch((e) => { console.error('PROBE FAILED:', e.message); process.exit(1); });
