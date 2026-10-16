// READ-ONLY production probe #2 for the dashboard audit (answers P8 + P10 in audit/03 §5).
// Performs zero writes. Prints only aggregates — never emails, uids, coordinates or key material.
const path = require('path');
const fs = require('fs');
const DASH = 'C:/Users/nuhaa/Downloads/Chatgpt/noise-pollution-mapper-dashboard';
const OUT = process.argv[2];
const admin = require(path.join(DASH, 'functions/node_modules/firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.join(DASH, 'serviceAccountKey.json'))) });
const db = admin.firestore();

const range = () => ({ min: Infinity, max: -Infinity, n: 0, nonNumber: 0 });
const feed = (r, v) => {
  if (typeof v === 'number' && Number.isFinite(v)) { r.min = Math.min(r.min, v); r.max = Math.max(r.max, v); r.n++; }
  else r.nonNumber++;
};
const maxLen = () => ({ max: 0, nonString: 0, missing: 0 });
const feedLen = (r, v) => {
  if (v === undefined) r.missing++;
  else if (typeof v !== 'string') r.nonString++;
  else r.max = Math.max(r.max, v.length);
};

(async () => {
  const snap = await db.collection('noise_readings').get();
  const now = Date.now();
  const r = {
    count: snap.size,
    // P8 — value ranges a validReading() rules clause must accept
    decibelLevel: range(), latitude: range(), longitude: range(), confidence: range(),
    lenLocationName: maxLen(), lenUserEmail: maxLen(), lenSoundClass: maxLen(), lenDeviceInfo: maxLen(),
    userEmailNull: 0,
    timestampInFutureOver10min: 0,
    timestampBefore2025: 0,
    extraFieldNames: {},
    // P10 — back-dated uploads a `timestamp >` delta sync would miss
    backdated: { over5min: 0, over1h: 0, over1day: 0, maxGapHours: 0 },
  };
  const KNOWN = new Set(['userId', 'userEmail', 'decibelLevel', 'latitude', 'longitude', 'locationName',
    'timestamp', 'createdAt', 'deviceInfo', 'soundClass', 'soundType', 'confidence']);
  snap.forEach((d) => {
    const x = d.data();
    feed(r.decibelLevel, x.decibelLevel);
    feed(r.latitude, x.latitude);
    feed(r.longitude, x.longitude);
    if ('confidence' in x) feed(r.confidence, x.confidence);
    feedLen(r.lenLocationName, x.locationName);
    feedLen(r.lenUserEmail, x.userEmail);
    feedLen(r.lenSoundClass, x.soundClass);
    feedLen(r.lenDeviceInfo, x.deviceInfo);
    if (x.userEmail === null) r.userEmailNull++;
    Object.keys(x).forEach((k) => { if (!KNOWN.has(k)) r.extraFieldNames[k] = (r.extraFieldNames[k] || 0) + 1; });
    if (x.timestamp && typeof x.timestamp.toMillis === 'function') {
      const t = x.timestamp.toMillis();
      if (t > now + 600000) r.timestampInFutureOver10min++;
      if (t < Date.UTC(2025, 0, 1)) r.timestampBefore2025++;
      const gap = d.createTime.toMillis() - t;
      if (gap > 300000) r.backdated.over5min++;
      if (gap > 3600000) r.backdated.over1h++;
      if (gap > 86400000) r.backdated.over1day++;
      r.backdated.maxGapHours = Math.max(r.backdated.maxGapHours, Math.round(gap / 36000) / 100);
    }
  });
  fs.writeFileSync(path.join(OUT, 'prod_probe2.json'), JSON.stringify(r, null, 2));
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
})().catch((e) => { console.error('PROBE2 FAILED:', e.message); process.exit(1); });
