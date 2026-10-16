/**
 * Firestore security-rules suite for the DEPLOYED, merged ruleset in
 * ./firestore.rules (shared by the Flutter app and this dashboard).
 *
 * Run: `npm run test:rules`. That starts the Firestore emulator under the
 * `demo-noise-rules` project id (a `demo-` id never reaches a real project)
 * with tests/rules/firebase.json, and runs this file through
 * tests/rules/vitest.config.ts. Plain `npm test` never includes it.
 *
 * ALLOW cases replay every row of the writer-compatibility matrix in
 * audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md §4.1, with payloads copied from the
 * app writers (field names, types and the optional-key behaviour):
 *   - online save        APP lib/services/firebase_service.dart _saveToFirebase
 *   - offline sync       APP lib/services/sync_service.dart _saveToFirebase
 *   - email propagation  APP lib/services/profile_sync_service.dart
 *   - anonymization      APP lib/screens/settings_screen_enhanced.dart
 *   - history undo       APP lib/services/firebase_service.dart restoreNoiseReading
 * DENY cases are the attacks from master §7 and playbook 02. Every DENY
 * payload differs from an ALLOWED baseline in exactly the field under test,
 * so a denial can only come from that field.
 *
 * The base fixtures below are the payloads of app builds from before data-1,
 * which never send `syncedAt` and stay in the field. Current builds add
 * `syncedAt: serverTimestamp()` to the online save, the offline upload and
 * the history restore; the data-1 blocks at the end cover those payloads and
 * the forged-syncedAt attacks.
 *
 * The rules are deployed: if a case here fails, report it. Do NOT edit
 * firestore.rules to make the suite pass; a rules change needs the owner's
 * approval, a mirror to the app repo and a redeploy.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'

const PROJECT_ID = 'demo-noise-rules'
const RULES_PATH = fileURLToPath(new URL('../../firestore.rules', import.meta.url))

// Firebase Auth uids are 28 characters, so uid[0:8] always exists.
const ALICE = 'aliceUID7pLm2RtY8vB4kWc9dEf1'
const BOB = 'bobUID00Xq3nA7pLm2RtY8vB4kWc'

const READINGS = 'noise_readings'
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

let testEnv: RulesTestEnvironment

// The test contexts hand back the compat Firestore; the modular API accepts
// it at runtime (it unwraps the compat delegate), only the types differ.
function db(ctx: RulesTestContext): Firestore {
  return ctx.firestore() as unknown as Firestore
}
const as = (uid: string): Firestore => db(testEnv.authenticatedContext(uid))
const anonymous = (): Firestore => db(testEnv.unauthenticatedContext())

async function seed(path: string, data: DocumentData): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), path), data)
  })
}

async function readRaw(path: string): Promise<DocumentData | undefined> {
  let data: DocumentData | undefined
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(db(ctx), path))).data()
  })
  return data
}

function without(data: DocumentData, ...keys: string[]): DocumentData {
  const copy = { ...data }
  for (const key of keys) delete copy[key]
  return copy
}

// APP firebase_service.dart _saveToFirebase: `.add(data)`. `userEmail` is
// authorLabel() (displayName, else a masked email); `timestamp` is
// serverTimestamp(); `createdAt` is the client DateTime.now(); the three
// classification keys are added only when non-null.
function onlineCapture(uid: string): DocumentData {
  return {
    userId: uid,
    userEmail: 'Alice',
    decibelLevel: 67.4,
    latitude: 4.1755,
    longitude: 73.5093,
    locationName: 'Majeedhee Magu, Male',
    timestamp: serverTimestamp(),
    createdAt: Timestamp.fromDate(new Date()),
    deviceInfo: 'Mobile Device',
    soundClass: 'Traffic',
    soundType: 'Pollution',
    confidence: 0.82,
  }
}

// APP sync_service.dart _saveToFirebase: `.doc(recording.id).set(data)`.
// `timestamp` is the true capture time (may be days old), `createdAt` the
// same DateTime, and `userEmail` is `recording.userEmail ?? auth email`,
// which can be null.
function offlineUpload(uid: string, capturedAt: Date): DocumentData {
  return {
    userId: uid,
    userEmail: null,
    decibelLevel: 72.9,
    latitude: 4.1712,
    longitude: 73.5121,
    locationName: 'Unknown Location',
    timestamp: Timestamp.fromDate(capturedAt),
    createdAt: Timestamp.fromDate(capturedAt),
    deviceInfo: 'Mobile Device',
    soundClass: 'Construction',
    soundType: 'Pollution',
    confidence: 0.64,
  }
}

// OfflineRecording.id: '${DateTime.now().millisecondsSinceEpoch}_$userId'.
const offlineId = (uid: string, capturedAt: Date) => `${capturedAt.getTime()}_${uid}`

// A reading as the app left it in Firestore an hour ago (all 12 keys valid).
function storedReading(uid: string): DocumentData {
  const at = new Date(Date.now() - HOUR_MS)
  return {
    ...onlineCapture(uid),
    timestamp: Timestamp.fromDate(at),
    createdAt: Timestamp.fromDate(at),
  }
}

// A pre-validation document: no userEmail, a dB outside [0, 200] and a key
// the 12-key whitelist does not know. It fails validReading() by design.
function legacyReading(uid: string): DocumentData {
  return {
    userId: uid,
    decibelLevel: 250,
    latitude: 4.17,
    longitude: 73.51,
    timestamp: Timestamp.fromDate(new Date(Date.now() - 400 * DAY_MS)),
    deviceInfo: 'Mobile Device',
    accuracy: 12,
  }
}

// settings_screen_enhanced.dart: 'deleted_user_${uid.substring(0, 8)}'.
const anonymizedId = (uid: string) => `deleted_user_${uid.substring(0, 8)}`

// registration_screen.dart: the profile document written at signup.
function registrationProfile(): DocumentData {
  return {
    displayName: 'Alice',
    email: 'alice@example.com',
    photoURL: null,
    createdAt: serverTimestamp(),
    createdAtClient: Timestamp.fromDate(new Date()),
    updatedAt: serverTimestamp(),
    updatedAtClient: Timestamp.fromDate(new Date()),
    totalRecordings: 0,
    preferences: { notifications: true, darkMode: true, language: 'English' },
  }
}

beforeAll(async () => {
  // Permission-denied writes are the expected outcome of half this file.
  setLogLevel('error')
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    // Host and port come from FIRESTORE_EMULATOR_HOST, which
    // `firebase emulators:exec` sets. The rules are loaded here, from the
    // repo's firestore.rules, because tests/rules/firebase.json cannot name
    // a file outside its own directory (see tests/rules/vitest.config.ts).
    firestore: { rules: readFileSync(RULES_PATH, 'utf8') },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

afterAll(async () => {
  await testEnv?.cleanup()
})

// =============================================================================
// ALLOW: every app writer and reader (playbook §4.1 matrix)
// =============================================================================

describe('ALLOW noise_readings: app writers', () => {
  it('online capture: add() with a serverTimestamp() timestamp and all 12 keys', async () => {
    await assertSucceeds(addDoc(collection(as(ALICE), READINGS), onlineCapture(ALICE)))
  })

  it('online capture with no classification (the optional keys omitted)', async () => {
    const data = without(onlineCapture(ALICE), 'soundClass', 'soundType', 'confidence')
    await assertSucceeds(addDoc(collection(as(ALICE), READINGS), data))
  })

  it('offline-sync first write: set() on the deterministic id, capture time 3 days old, userEmail null', async () => {
    const capturedAt = new Date(Date.now() - 3 * DAY_MS)
    const ref = doc(as(ALICE), READINGS, offlineId(ALICE, capturedAt))
    await assertSucceeds(setDoc(ref, offlineUpload(ALICE, capturedAt)))
  })

  it('offline-sync first write from a device clock running 2 hours fast', async () => {
    const capturedAt = new Date(Date.now() + 2 * HOUR_MS)
    const ref = doc(as(ALICE), READINGS, offlineId(ALICE, capturedAt))
    await assertSucceeds(setDoc(ref, offlineUpload(ALICE, capturedAt)))
  })

  it('offline-sync retry of the same doc id (an UPDATE) with userEmail null', async () => {
    const capturedAt = new Date(Date.now() - 6 * HOUR_MS)
    const ref = doc(as(ALICE), READINGS, offlineId(ALICE, capturedAt))
    const data = offlineUpload(ALICE, capturedAt)
    await assertSucceeds(setDoc(ref, data))
    // Lost ack: the queue re-sends the identical set() on the existing id.
    await assertSucceeds(setDoc(ref, data))
  })

  it('offline-sync retry of the same doc id with a string author label', async () => {
    const capturedAt = new Date(Date.now() - 6 * HOUR_MS)
    const ref = doc(as(ALICE), READINGS, offlineId(ALICE, capturedAt))
    const data = { ...offlineUpload(ALICE, capturedAt), userEmail: 'ali***@example.com' }
    await assertSucceeds(setDoc(ref, data))
    await assertSucceeds(setDoc(ref, data))
  })

  it('offline-sync retry after the label was propagated (writes null back over it)', async () => {
    const capturedAt = new Date(Date.now() - 6 * HOUR_MS)
    const alice = as(ALICE)
    const ref = doc(alice, READINGS, offlineId(ALICE, capturedAt))
    const data = offlineUpload(ALICE, capturedAt)
    await assertSucceeds(setDoc(ref, data))
    await assertSucceeds(updateDoc(ref, { userEmail: 'Alice' }))
    await assertSucceeds(setDoc(ref, data))
  })

  it("email propagation: batch.update of only userEmail across the owner's readings", async () => {
    await seed(`${READINGS}/r1`, storedReading(ALICE))
    await seed(`${READINGS}/r2`, offlineUpload(ALICE, new Date(Date.now() - 2 * DAY_MS)))
    const alice = as(ALICE)
    const batch = writeBatch(alice)
    batch.update(doc(alice, READINGS, 'r1'), { userEmail: 'ali***@example.com' })
    batch.update(doc(alice, READINGS, 'r2'), { userEmail: 'ali***@example.com' })
    await assertSucceeds(batch.commit())
  })

  it('email propagation on a legacy reading that fails validReading()', async () => {
    await seed(`${READINGS}/legacy`, legacyReading(ALICE))
    const alice = as(ALICE)
    const batch = writeBatch(alice)
    batch.update(doc(alice, READINGS, 'legacy'), { userEmail: 'Alice' })
    await assertSucceeds(batch.commit())
  })

  it('delete-account anonymization: deleted_user_<own uid[0:8]> and Deleted User', async () => {
    await seed(`${READINGS}/r1`, storedReading(ALICE))
    await seed(`${READINGS}/r2`, offlineUpload(ALICE, new Date(Date.now() - 2 * DAY_MS)))
    const alice = as(ALICE)
    const batch = writeBatch(alice)
    for (const id of ['r1', 'r2']) {
      batch.update(doc(alice, READINGS, id), {
        userEmail: 'Deleted User',
        userId: anonymizedId(ALICE),
      })
    }
    await assertSucceeds(batch.commit())
    expect((await readRaw(`${READINGS}/r1`))?.userId).toBe('deleted_user_aliceUID')
  })

  it('anonymization of a legacy reading with no userEmail and out-of-range values', async () => {
    await seed(`${READINGS}/legacy`, legacyReading(ALICE))
    const alice = as(ALICE)
    const batch = writeBatch(alice)
    batch.update(doc(alice, READINGS, 'legacy'), {
      userEmail: 'Deleted User',
      userId: anonymizedId(ALICE),
    })
    await assertSucceeds(batch.commit())
  })

  it("history undo: set() of the deleted doc's own data under its id lands as a create", async () => {
    const alice = as(ALICE)
    const ref = await assertSucceeds(addDoc(collection(alice, READINGS), onlineCapture(ALICE)))
    const snap = await getDoc(ref)
    expect(snap.exists()).toBe(true)
    const original = snap.data() as DocumentData
    await assertSucceeds(deleteDoc(ref))
    await assertSucceeds(setDoc(ref, original))
  })

  it('owner delete: single-row delete and the clear-history batch delete', async () => {
    await seed(`${READINGS}/r1`, storedReading(ALICE))
    await seed(`${READINGS}/r2`, storedReading(ALICE))
    await seed(`${READINGS}/r3`, legacyReading(ALICE))
    const alice = as(ALICE)
    await assertSucceeds(deleteDoc(doc(alice, READINGS, 'r1')))
    const batch = writeBatch(alice)
    batch.delete(doc(alice, READINGS, 'r2'))
    batch.delete(doc(alice, READINGS, 'r3'))
    await assertSucceeds(batch.commit())
  })
})

describe('ALLOW noise_readings: signed-in reads', () => {
  it('any signed-in user reads every reading (feed, map, history, dashboard sync)', async () => {
    await seed(`${READINGS}/a1`, storedReading(ALICE))
    const bob = as(BOB)
    const since = Timestamp.fromDate(new Date(Date.now() - DAY_MS))
    await assertSucceeds(getDoc(doc(bob, READINGS, 'a1')))
    const feed = await assertSucceeds(
      getDocs(query(collection(bob, READINGS), orderBy('timestamp', 'desc'), limit(50))),
    )
    expect(feed.size).toBe(1)
    await assertSucceeds(
      getDocs(query(collection(bob, READINGS), where('timestamp', '>', since), orderBy('timestamp'))),
    )
    await assertSucceeds(
      getDocs(
        query(collection(bob, READINGS), where('userId', '==', BOB), orderBy('timestamp', 'desc')),
      ),
    )
  })
})

describe('ALLOW users: owner profile reads and writes', () => {
  it('registration: owner create of the signup profile', async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), 'users', ALICE), registrationProfile()))
  })

  it('owner read of their own profile, and of a profile that does not exist', async () => {
    await seed(`users/${ALICE}`, registrationProfile())
    await assertSucceeds(getDoc(doc(as(ALICE), 'users', ALICE)))
    const missing = await assertSucceeds(getDoc(doc(as(BOB), 'users', BOB)))
    expect(missing.exists()).toBe(false)
  })

  it('edit-profile merge write: displayName, email, updatedAt', async () => {
    await seed(`users/${ALICE}`, registrationProfile())
    await assertSucceeds(
      setDoc(
        doc(as(ALICE), 'users', ALICE),
        {
          displayName: 'Alice B',
          email: 'alice@example.com',
          updatedAt: serverTimestamp(),
          updatedAtClient: Timestamp.fromDate(new Date()),
        },
        { merge: true },
      ),
    )
  })

  it('email-reconcile merge write, on an existing profile and as a create on a missing one', async () => {
    const reconcile = {
      email: 'alice.new@example.com',
      updatedAt: serverTimestamp(),
      updatedAtClient: Timestamp.fromDate(new Date()),
    }
    await assertSucceeds(setDoc(doc(as(BOB), 'users', BOB), reconcile, { merge: true }))
    await seed(`users/${ALICE}`, registrationProfile())
    await assertSucceeds(setDoc(doc(as(ALICE), 'users', ALICE), reconcile, { merge: true }))
  })

  it('owner merge write that leaves a console-provisioned role untouched', async () => {
    await seed(`users/${ALICE}`, { ...registrationProfile(), role: 'admin' })
    await assertSucceeds(
      setDoc(doc(as(ALICE), 'users', ALICE), { displayName: 'Alice B' }, { merge: true }),
    )
  })
})

describe('ALLOW app_config', () => {
  it('signed-in read of app_config/donations', async () => {
    await seed('app_config/donations', {
      paypalBusinessEmail: 'donate@example.com',
      sandbox: true,
      buyMeACoffeeUrl: 'https://example.com/coffee',
    })
    await assertSucceeds(getDoc(doc(as(ALICE), 'app_config', 'donations')))
  })
})

// =============================================================================
// DENY: attacks (master §7, playbook 02)
// =============================================================================

describe('DENY noise_readings: create attacks', () => {
  const createAs = (uid: string, data: DocumentData) =>
    addDoc(collection(as(uid), READINGS), data)

  it('a map-typed soundClass', async () => {
    const data = { ...onlineCapture(ALICE), soundClass: { label: 'Traffic', html: '<b>x</b>' } }
    await assertFails(createAs(ALICE, data))
  })

  it('decibelLevel 1e300', async () => {
    await assertFails(createAs(ALICE, { ...onlineCapture(ALICE), decibelLevel: 1e300 }))
  })

  it('decibelLevel -5', async () => {
    await assertFails(createAs(ALICE, { ...onlineCapture(ALICE), decibelLevel: -5 }))
  })

  it('a 1 MB locationName', async () => {
    const data = { ...onlineCapture(ALICE), locationName: 'x'.repeat(1_000_000) }
    await assertFails(createAs(ALICE, data))
  })

  it('an extra unknown key', async () => {
    await assertFails(createAs(ALICE, { ...onlineCapture(ALICE), isVerified: true }))
  })

  it('a timestamp 2 days in the future', async () => {
    const capturedAt = new Date(Date.now() + 2 * DAY_MS)
    const ref = doc(as(ALICE), READINGS, offlineId(ALICE, capturedAt))
    await assertFails(setDoc(ref, offlineUpload(ALICE, capturedAt)))
  })

  it("a reading stamped with another user's uid", async () => {
    await assertFails(createAs(ALICE, onlineCapture(BOB)))
  })

  it('an unauthenticated create', async () => {
    await assertFails(addDoc(collection(anonymous(), READINGS), onlineCapture(ALICE)))
  })

  it.each([
    { name: 'latitude 91', patch: { latitude: 91 } },
    { name: 'longitude -181', patch: { longitude: -181 } },
    { name: 'a string decibelLevel', patch: { decibelLevel: '67.4' } },
    { name: 'decibelLevel NaN', patch: { decibelLevel: NaN } },
    { name: 'decibelLevel Infinity', patch: { decibelLevel: Infinity } },
    { name: "soundType 'Hazard'", patch: { soundType: 'Hazard' } },
    { name: 'confidence 1.5', patch: { confidence: 1.5 } },
    { name: 'a 121-character userEmail', patch: { userEmail: 'a'.repeat(121) } },
    { name: 'a 201-character locationName', patch: { locationName: 'x'.repeat(201) } },
    { name: 'a 65-character soundClass', patch: { soundClass: 'x'.repeat(65) } },
    { name: 'a map-typed deviceInfo', patch: { deviceInfo: { model: 'x' } } },
    { name: 'a string timestamp', patch: { timestamp: '2026-10-16T00:00:00Z' } },
    { name: 'a string createdAt', patch: { createdAt: '2026-10-16T00:00:00Z' } },
  ])('$name', async ({ patch }) => {
    await assertFails(createAs(ALICE, { ...onlineCapture(ALICE), ...patch }))
  })
})

describe('DENY noise_readings: update and delete attacks', () => {
  const ref = (fs: Firestore) => doc(fs, READINGS, 'r1')

  beforeEach(async () => {
    await seed(`${READINGS}/r1`, storedReading(ALICE))
  })

  it('userId reassigned to another uid', async () => {
    await assertFails(updateDoc(ref(as(ALICE)), { userId: BOB }))
  })

  it("a rewrite to deleted_user_<another uid's prefix>", async () => {
    await assertFails(
      updateDoc(ref(as(ALICE)), { userEmail: 'Deleted User', userId: anonymizedId(BOB) }),
    )
  })

  it('a rewrite to an arbitrary deleted_user_ id', async () => {
    await assertFails(
      updateDoc(ref(as(ALICE)), { userEmail: 'Deleted User', userId: 'deleted_user_anything' }),
    )
  })

  it('the deleted_user rewrite with another field changed too', async () => {
    await assertFails(
      updateDoc(ref(as(ALICE)), {
        userEmail: 'Deleted User',
        userId: anonymizedId(ALICE),
        decibelLevel: 140,
      }),
    )
  })

  it("the deleted_user rewrite with a userEmail other than 'Deleted User'", async () => {
    await assertFails(
      updateDoc(ref(as(ALICE)), { userEmail: 'Alice', userId: anonymizedId(ALICE) }),
    )
  })

  it('the deleted_user rewrite that drops a field', async () => {
    await assertFails(
      updateDoc(ref(as(ALICE)), {
        userEmail: 'Deleted User',
        userId: anonymizedId(ALICE),
        latitude: deleteField(),
      }),
    )
  })

  it('an owner update that leaves an invalid reading (decibelLevel 1e300)', async () => {
    await assertFails(updateDoc(ref(as(ALICE)), { decibelLevel: 1e300 }))
  })

  it('an owner update that adds an unknown key', async () => {
    await assertFails(updateDoc(ref(as(ALICE)), { isVerified: true }))
  })

  it('an author-label update longer than 120 characters', async () => {
    await assertFails(updateDoc(ref(as(ALICE)), { userEmail: 'a'.repeat(121) }))
  })

  it('a non-owner update', async () => {
    await assertFails(updateDoc(ref(as(BOB)), { userEmail: 'Bob' }))
  })

  it('a non-owner delete', async () => {
    await assertFails(deleteDoc(ref(as(BOB))))
  })

  it('an unauthenticated update or delete', async () => {
    await assertFails(updateDoc(ref(anonymous()), { userEmail: 'x' }))
    await assertFails(deleteDoc(ref(anonymous())))
  })

  it('any write by the former owner once the reading is anonymized', async () => {
    const alice = as(ALICE)
    await assertSucceeds(
      updateDoc(ref(alice), { userEmail: 'Deleted User', userId: anonymizedId(ALICE) }),
    )
    await assertFails(updateDoc(ref(alice), { userEmail: 'Alice' }))
    await assertFails(deleteDoc(ref(alice)))
  })
})

describe('DENY unauthenticated reads', () => {
  it('an unauthenticated get or list of noise_readings', async () => {
    await seed(`${READINGS}/r1`, storedReading(ALICE))
    const anon = anonymous()
    await assertFails(getDoc(doc(anon, READINGS, 'r1')))
    await assertFails(getDocs(query(collection(anon, READINGS), orderBy('timestamp'))))
  })

  it('an unauthenticated read of users and app_config', async () => {
    await seed(`users/${ALICE}`, registrationProfile())
    await seed('app_config/donations', { sandbox: true })
    const anon = anonymous()
    await assertFails(getDoc(doc(anon, 'users', ALICE)))
    await assertFails(getDoc(doc(anon, 'app_config', 'donations')))
  })
})

describe('DENY users: cross-user access and role escalation', () => {
  beforeEach(async () => {
    await seed(`users/${ALICE}`, registrationProfile())
  })

  it("a read of another user's profile", async () => {
    await assertFails(getDoc(doc(as(BOB), 'users', ALICE)))
  })

  it('a users list by a non-owner', async () => {
    await assertFails(getDocs(collection(as(BOB), 'users')))
  })

  it('a users list even by a console-provisioned admin', async () => {
    await seed(`users/${BOB}`, { ...registrationProfile(), role: 'admin' })
    await assertFails(getDocs(collection(as(BOB), 'users')))
  })

  it("a create of another user's profile", async () => {
    const CAROL = 'carolUID00Xq3nA7pLm2RtY8vB4k'
    await assertFails(setDoc(doc(as(BOB), 'users', CAROL), registrationProfile()))
  })

  it('setting role on create', async () => {
    await assertFails(
      setDoc(doc(as(BOB), 'users', BOB), { ...registrationProfile(), role: 'admin' }),
    )
  })

  it('setting role on update', async () => {
    await assertFails(
      setDoc(doc(as(ALICE), 'users', ALICE), { role: 'admin' }, { merge: true }),
    )
  })

  it('changing or removing a provisioned role', async () => {
    await seed(`users/${BOB}`, { ...registrationProfile(), role: 'admin' })
    const bob = as(BOB)
    await assertFails(setDoc(doc(bob, 'users', BOB), { role: 'superadmin' }, { merge: true }))
    await assertFails(updateDoc(doc(bob, 'users', BOB), { role: deleteField() }))
  })

  it("a write to another user's profile", async () => {
    await assertFails(
      setDoc(doc(as(BOB), 'users', ALICE), { displayName: 'pwned' }, { merge: true }),
    )
  })
})

// =============================================================================
// syncedAt (data-1): the server upload time, the dashboard's second delta cursor
// =============================================================================

// What a current app build sends: the same payload plus
// `syncedAt: FieldValue.serverTimestamp()` (APP FirebaseService.withSyncedAt).
const stamped = (data: DocumentData): DocumentData => ({ ...data, syncedAt: serverTimestamp() })

function millis(value: unknown): number {
  return (value as Timestamp).toMillis()
}

describe('ALLOW noise_readings: syncedAt = serverTimestamp() (data-1)', () => {
  it('online capture: add() with all 13 keys, syncedAt a serverTimestamp()', async () => {
    const ref = await assertSucceeds(
      addDoc(collection(as(ALICE), READINGS), stamped(onlineCapture(ALICE))),
    )
    const stored = await readRaw(ref.path)
    expect(Object.keys(stored ?? {})).toHaveLength(13)
    expect(millis(stored?.syncedAt)).toBe(millis(stored?.timestamp))
  })

  it('offline-sync first write: capture time 3 days old, userEmail null, syncedAt the upload time', async () => {
    const capturedAt = new Date(Date.now() - 3 * DAY_MS)
    const ref = doc(as(ALICE), READINGS, offlineId(ALICE, capturedAt))
    await assertSucceeds(setDoc(ref, stamped(offlineUpload(ALICE, capturedAt))))
    const stored = await readRaw(ref.path)
    expect(stored?.userEmail).toBeNull()
    // The point of data-1: the upload time is days after the capture time.
    expect(millis(stored?.syncedAt) - millis(stored?.timestamp)).toBeGreaterThan(2 * DAY_MS)
  })

  it('offline-sync retry of the same doc id (an UPDATE) re-stamps syncedAt', async () => {
    const capturedAt = new Date(Date.now() - 6 * HOUR_MS)
    const ref = doc(as(ALICE), READINGS, offlineId(ALICE, capturedAt))
    const data = stamped(offlineUpload(ALICE, capturedAt))
    await assertSucceeds(setDoc(ref, data))
    // Lost ack: the queue re-sends the same set(), with a fresh serverTimestamp().
    await assertSucceeds(setDoc(ref, data))
  })

  it('offline-sync retry after the label was propagated (writes null back over it)', async () => {
    const capturedAt = new Date(Date.now() - 6 * HOUR_MS)
    const alice = as(ALICE)
    const ref = doc(alice, READINGS, offlineId(ALICE, capturedAt))
    const data = stamped(offlineUpload(ALICE, capturedAt))
    await assertSucceeds(setDoc(ref, data))
    await assertSucceeds(updateDoc(ref, { userEmail: 'Alice' }))
    await assertSucceeds(setDoc(ref, data))
  })

  it('history undo: restore overrides the original syncedAt with serverTimestamp() (a create)', async () => {
    const alice = as(ALICE)
    const ref = await assertSucceeds(
      addDoc(collection(alice, READINGS), stamped(onlineCapture(ALICE))),
    )
    const original = (await getDoc(ref)).data() as DocumentData
    expect(original.syncedAt).toBeDefined()
    await assertSucceeds(deleteDoc(ref))
    await assertSucceeds(setDoc(ref, { ...original, syncedAt: serverTimestamp() }))
  })

  it('history undo of a pre-data-1 reading: restore adds syncedAt (a create)', async () => {
    const alice = as(ALICE)
    const ref = await assertSucceeds(addDoc(collection(alice, READINGS), onlineCapture(ALICE)))
    const original = (await getDoc(ref)).data() as DocumentData
    expect('syncedAt' in original).toBe(false)
    await assertSucceeds(deleteDoc(ref))
    await assertSucceeds(setDoc(ref, stamped(original)))
  })

  it('email propagation and anonymization leave a stored syncedAt untouched', async () => {
    await seed(`${READINGS}/r1`, stamped(storedReading(ALICE)))
    const before = await readRaw(`${READINGS}/r1`)
    const alice = as(ALICE)
    // Neither path runs validReading(), so a syncedAt that no longer equals
    // request.time does not block them.
    await assertSucceeds(updateDoc(doc(alice, READINGS, 'r1'), { userEmail: 'ali***@example.com' }))
    const batch = writeBatch(alice)
    batch.update(doc(alice, READINGS, 'r1'), {
      userEmail: 'Deleted User',
      userId: anonymizedId(ALICE),
    })
    await assertSucceeds(batch.commit())
    const after = await readRaw(`${READINGS}/r1`)
    expect(millis(after?.syncedAt)).toBe(millis(before?.syncedAt))
  })

  it('a legacy doc with no syncedAt stays updatable by the author-label and anonymization paths', async () => {
    await seed(`${READINGS}/legacy`, legacyReading(ALICE))
    await seed(`${READINGS}/old`, storedReading(ALICE))
    const alice = as(ALICE)
    const label = writeBatch(alice)
    label.update(doc(alice, READINGS, 'legacy'), { userEmail: 'Alice' })
    label.update(doc(alice, READINGS, 'old'), { userEmail: 'Alice' })
    await assertSucceeds(label.commit())
    const anonymize = writeBatch(alice)
    for (const id of ['legacy', 'old']) {
      anonymize.update(doc(alice, READINGS, id), {
        userEmail: 'Deleted User',
        userId: anonymizedId(ALICE),
      })
    }
    await assertSucceeds(anonymize.commit())
    for (const id of ['legacy', 'old']) {
      expect('syncedAt' in ((await readRaw(`${READINGS}/${id}`)) ?? {})).toBe(false)
    }
  })

  it("the dashboard's syncedAt delta finds a back-dated upload the timestamp delta misses", async () => {
    const capturedAt = new Date(Date.now() - 3 * DAY_MS)
    await assertSucceeds(
      setDoc(
        doc(as(ALICE), READINGS, offlineId(ALICE, capturedAt)),
        stamped(offlineUpload(ALICE, capturedAt)),
      ),
    )
    const bob = as(BOB)
    const since = Timestamp.fromMillis(Date.now() - HOUR_MS)
    const bySyncedAt = await assertSucceeds(
      getDocs(query(collection(bob, READINGS), where('syncedAt', '>', since), orderBy('syncedAt'))),
    )
    const byTimestamp = await assertSucceeds(
      getDocs(query(collection(bob, READINGS), where('timestamp', '>', since))),
    )
    expect(bySyncedAt.size).toBe(1)
    expect(byTimestamp.size).toBe(0)
  })
})

describe('DENY noise_readings: a client-supplied syncedAt (data-1)', () => {
  const createAs = (uid: string, data: DocumentData) =>
    addDoc(collection(as(uid), READINGS), data)

  it.each([
    { name: 'one minute ago', offsetMs: -60_000 },
    { name: 'three days ago', offsetMs: -3 * DAY_MS },
    { name: 'one minute ahead', offsetMs: 60_000 },
    { name: 'one day ahead', offsetMs: DAY_MS },
  ])('an explicit Timestamp $name on an online create', async ({ offsetMs }) => {
    const syncedAt = Timestamp.fromMillis(Date.now() + offsetMs)
    await assertFails(createAs(ALICE, { ...onlineCapture(ALICE), syncedAt }))
  })

  it('an offline upload stamped with its own capture time', async () => {
    const capturedAt = new Date(Date.now() - 3 * DAY_MS)
    const ref = doc(as(ALICE), READINGS, offlineId(ALICE, capturedAt))
    const data = { ...offlineUpload(ALICE, capturedAt), syncedAt: Timestamp.fromDate(capturedAt) }
    await assertFails(setDoc(ref, data))
  })

  it('an offline-sync retry (an UPDATE) with an explicit Timestamp', async () => {
    const capturedAt = new Date(Date.now() - 6 * HOUR_MS)
    const ref = doc(as(ALICE), READINGS, offlineId(ALICE, capturedAt))
    const data = stamped(offlineUpload(ALICE, capturedAt))
    await assertSucceeds(setDoc(ref, data))
    await assertFails(setDoc(ref, { ...data, syncedAt: Timestamp.fromMillis(Date.now() - 60_000) }))
  })

  it('a restore that re-sends the original syncedAt', async () => {
    const alice = as(ALICE)
    const ref = await assertSucceeds(
      addDoc(collection(alice, READINGS), stamped(onlineCapture(ALICE))),
    )
    const original = (await getDoc(ref)).data() as DocumentData
    await assertSucceeds(deleteDoc(ref))
    await assertFails(setDoc(ref, original))
  })

  it('an owner update that changes a field but keeps the stored syncedAt', async () => {
    await seed(`${READINGS}/r1`, stamped(storedReading(ALICE)))
    const ref = doc(as(ALICE), READINGS, 'r1')
    await assertFails(updateDoc(ref, { decibelLevel: 70 }))
    // Control: the same update re-stamping syncedAt passes validReading().
    await assertSucceeds(updateDoc(ref, { decibelLevel: 70, syncedAt: serverTimestamp() }))
  })

  it.each([
    { name: 'an ISO string', syncedAt: '2026-10-16T00:00:00Z' },
    { name: 'epoch milliseconds', syncedAt: 1_760_572_800_000 },
    { name: 'a { seconds, nanoseconds } map', syncedAt: { seconds: 1_760_572_800, nanoseconds: 0 } },
    { name: 'null', syncedAt: null },
    { name: 'a boolean', syncedAt: true },
  ])('a syncedAt of the wrong type: $name', async ({ syncedAt }) => {
    await assertFails(createAs(ALICE, { ...onlineCapture(ALICE), syncedAt }))
  })
})

describe('DENY app_config and unnamed collections', () => {
  it('an app_config write: set, update or delete', async () => {
    await seed('app_config/donations', { sandbox: true })
    const alice = as(ALICE)
    const ref = doc(alice, 'app_config', 'donations')
    await assertFails(setDoc(doc(alice, 'app_config', 'evil'), { sandbox: false }))
    await assertFails(updateDoc(ref, { paypalBusinessEmail: 'attacker@example.com' }))
    await assertFails(deleteDoc(ref))
  })

  it('any access to a collection the rules do not name (cache/noise_readings_full)', async () => {
    const alice = as(ALICE)
    await assertFails(getDoc(doc(alice, 'cache', 'noise_readings_full')))
    await assertFails(setDoc(doc(alice, 'cache', 'noise_readings_full'), { dump: [] }))
  })
})
