const fs = require('node:fs');
const path = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-strawberry-plan';
const ADMIN = { uid: 'admin-uid', email: 'admin@strawberry.no', role: 'admin' };
const LEADER = { uid: 'leader-uid', email: 'leader@strawberry.no', role: 'teamleder' };
const MEMBER = { uid: 'member-uid', email: 'member@strawberry.no', role: 'medlem' };
const OTHER = { uid: 'other-uid', email: 'other@strawberry.no', role: 'medlem' };
const UNKNOWN = { uid: 'unknown-uid', email: 'unknown@example.com' };

let env;

function emailKey(email) {
  return email.trim().toLowerCase().replace(/[.]/g, '_dot_').replace('@', '_at_');
}

function loadClientSanitizeEmail() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'firestore.js'), 'utf8');
  const start = source.indexOf('function sanitizeEmail');
  const end = source.indexOf('\n}', start) + 2;
  if (start < 0 || end < 2) throw new Error('Fant ikke sanitizeEmail() i firestore.js');
  return new Function(source.slice(start, end) + '; return sanitizeEmail;')();
}

function authed(user, extraClaims = {}) {
  return env.authenticatedContext(user.uid, {
    email: user.email,
    email_verified: true,
    ...extraClaims,
  }).firestore();
}

function taskData(assignedTo = MEMBER.uid) {
  return {
    title: 'Testoppgave',
    priority: 'medium',
    status: 'ikke_startet',
    assignedTo,
    createdAt: new Date(),
  };
}

function todoData(assignedTo = MEMBER.uid) {
  return {
    title: 'Test-ToDo',
    priority: 'medium',
    status: 'apen',
    assignedTo,
    createdAt: new Date(),
  };
}

async function seedAllowed(users) {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const user of users) {
      await setDoc(doc(db, 'allowedUsers', emailKey(user.email)), {
        email: user.email.toLowerCase(),
        role: user.role,
      });
    }
  });
}

async function seedBaseData() {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'tasks', 'task-member'), taskData(MEMBER.uid));
    await setDoc(doc(db, 'tasks', 'task-other'), taskData(OTHER.uid));
    await setDoc(doc(db, 'todos', 'todo-member'), todoData(MEMBER.uid));
    await setDoc(doc(db, 'categories', 'category-1'), {
      name: 'Rapportering',
      active: true,
      sortOrder: 1,
    });
    await setDoc(doc(db, 'comments', 'comment-1'), {
      taskId: 'task-member',
      userId: MEMBER.uid,
      text: 'Kommentar',
      createdAt: new Date(),
    });
    await setDoc(doc(db, 'users', MEMBER.uid), {
      email: MEMBER.email,
      role: MEMBER.role,
      displayName: 'Medlem',
    });
    await setDoc(doc(db, 'users', OTHER.uid), {
      email: OTHER.email,
      role: OTHER.role,
      displayName: 'Annet medlem',
    });
    await setDoc(doc(db, 'users', MEMBER.uid, 'notifications', 'notification-1'), {
      read: false,
    });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

after(async () => {
  await env.cleanup();
});

test('e-postnøkkel erstatter alle punktum og matcher også store bokstaver', async () => {
  const email = 'espen.syversen@strawberry.no';
  if (emailKey(email) !== 'espen_dot_syversen_at_strawberry_dot_no') {
    throw new Error('Testens e-postnøkkel er feil');
  }
  await seedAllowed([{ uid: 'espen-uid', email, role: 'admin' }]);
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'tasks', 'visible-task'), taskData('espen-uid'));
  });

  const upperCaseDb = authed({
    uid: 'espen-uid',
    email: 'ESPEN.SYVERSEN@STRAWBERRY.NO',
  });
  await assertSucceeds(getDoc(doc(upperCaseDb, 'tasks', 'visible-task')));
});

test('klientens sanitizeEmail bruker samme trim-, lowercase- og ID-format', () => {
  const sanitizeEmail = loadClientSanitizeEmail();
  const actual = sanitizeEmail('  ESPEN.SYVERSEN@STRAWBERRY.NO  ');
  if (actual !== 'espen_dot_syversen_at_strawberry_dot_no') {
    throw new Error('Klientens sanitizeEmail() produserte feil dokument-ID: ' + actual);
  }
});

test('uverifisert e-post får ingen tilgang', async () => {
  await seedAllowed([MEMBER]);
  const db = env.authenticatedContext(MEMBER.uid, {
    email: MEMBER.email,
    email_verified: false,
  }).firestore();
  await assertFails(getDoc(doc(db, 'allowedUsers', emailKey(MEMBER.email))));
});

test('ikke-allowlistet bruker kan ikke lese noen beskyttet collection', async () => {
  await seedAllowed([ADMIN, MEMBER]);
  await seedBaseData();
  const db = authed(UNKNOWN);
  const reads = [
    getDoc(doc(db, 'tasks', 'task-member')),
    getDoc(doc(db, 'todos', 'todo-member')),
    getDoc(doc(db, 'users', MEMBER.uid)),
    getDocs(collection(db, 'allowedUsers')),
    getDoc(doc(db, 'categories', 'category-1')),
    getDoc(doc(db, 'comments', 'comment-1')),
    getDoc(doc(db, 'users', MEMBER.uid, 'notifications', 'notification-1')),
  ];
  for (const read of reads) await assertFails(read);
  await assertFails(addDoc(
    collection(db, 'users', MEMBER.uid, 'notifications'),
    { read: false },
  ));
});

test('ikke-allowlistet bruker kan ikke opprette egen adminprofil eller oppgave', async () => {
  const db = authed(UNKNOWN);
  await assertFails(setDoc(doc(db, 'users', UNKNOWN.uid), {
    email: UNKNOWN.email,
    role: 'admin',
  }));
  await assertFails(addDoc(collection(db, 'tasks'), taskData(UNKNOWN.uid)));
});

test('medlem kan lese og endre status på egen oppgave', async () => {
  await seedAllowed([MEMBER]);
  await seedBaseData();
  const db = authed(MEMBER);
  await assertSucceeds(getDoc(doc(db, 'tasks', 'task-member')));
  await assertSucceeds(updateDoc(doc(db, 'tasks', 'task-member'), {
    status: 'i_gang',
  }));
});

test('medlem kan ikke endre beskrivelse, prioritet eller ansvarlig', async () => {
  await seedAllowed([MEMBER]);
  await seedBaseData();
  const db = authed(MEMBER);
  await assertFails(updateDoc(doc(db, 'tasks', 'task-member'), { title: 'Endret' }));
  await assertFails(updateDoc(doc(db, 'tasks', 'task-member'), { priority: 'høy' }));
  await assertFails(updateDoc(doc(db, 'tasks', 'task-member'), { assignedTo: OTHER.uid }));
});

test('medlem kan ikke endre status på andres oppgave', async () => {
  await seedAllowed([MEMBER]);
  await seedBaseData();
  await assertFails(updateDoc(doc(authed(MEMBER), 'tasks', 'task-other'), {
    status: 'i_gang',
  }));
});

test('medlem kan bare endre tillatte statusfelt på egen ToDo', async () => {
  await seedAllowed([MEMBER]);
  await seedBaseData();
  const db = authed(MEMBER);
  await assertSucceeds(updateDoc(doc(db, 'todos', 'todo-member'), {
    status: 'fullfort',
    completedBy: MEMBER.uid,
  }));
  await assertFails(updateDoc(doc(db, 'todos', 'todo-member'), {
    title: 'Endret',
  }));
});

test('medlem kan ikke opprette oppgave, ToDo eller kategori', async () => {
  await seedAllowed([MEMBER]);
  const db = authed(MEMBER);
  await assertFails(addDoc(collection(db, 'tasks'), taskData()));
  await assertFails(addDoc(collection(db, 'todos'), todoData()));
  await assertFails(addDoc(collection(db, 'categories'), {
    name: 'Ny kategori',
    active: true,
  }));
});

test('medlem kan ikke forfalske adminrolle eller e-post i profilkopien', async () => {
  await seedAllowed([MEMBER]);
  await seedBaseData();
  const db = authed(MEMBER);
  await assertFails(updateDoc(doc(db, 'users', MEMBER.uid), { role: 'admin' }));
  await assertFails(updateDoc(doc(db, 'users', MEMBER.uid), { email: 'other@strawberry.no' }));
  await assertFails(addDoc(collection(db, 'tasks'), taskData()));
});

test('innloggingsskriving med korrekt rolle fungerer for Admin, Teamleder og Medlem', async () => {
  const users = [ADMIN, LEADER, MEMBER];
  await seedAllowed(users);

  for (const user of users) {
    const db = authed(user);
    const profile = doc(db, 'users', user.uid);
    await assertSucceeds(setDoc(profile, {
      email: user.email,
      role: user.role,
      displayName: user.role,
      createdAt: new Date(),
      lastLogin: new Date(),
    }));
    await assertSucceeds(updateDoc(profile, {
      role: user.role,
      lastLogin: new Date(),
    }));
  }
});

test('rolleendring i allowlisten styrer neste egen profilskriving', async () => {
  await seedAllowed([ADMIN, MEMBER]);
  await seedBaseData();
  const adminDb = authed(ADMIN);
  await assertSucceeds(updateDoc(
    doc(adminDb, 'allowedUsers', emailKey(MEMBER.email)),
    { role: 'teamleder' },
  ));

  const promotedDb = authed(MEMBER);
  await assertSucceeds(updateDoc(doc(promotedDb, 'users', MEMBER.uid), {
    role: 'teamleder',
    lastLogin: new Date(),
  }));
  await assertFails(updateDoc(doc(promotedDb, 'users', MEMBER.uid), {
    role: 'medlem',
    lastLogin: new Date(),
  }));
});

test('Teamleder kan administrere arbeid, men ikke allowlisten', async () => {
  await seedAllowed([LEADER, MEMBER]);
  await seedBaseData();
  const db = authed(LEADER);
  await assertSucceeds(addDoc(collection(db, 'tasks'), taskData()));
  await assertSucceeds(updateDoc(doc(db, 'tasks', 'task-member'), { title: 'Leders endring' }));
  await assertSucceeds(addDoc(collection(db, 'todos'), todoData()));
  await assertSucceeds(updateDoc(doc(db, 'todos', 'todo-member'), { title: 'Leders ToDo-endring' }));
  await assertSucceeds(addDoc(collection(db, 'categories'), {
    name: 'Ny',
    active: true,
  }));
  await assertSucceeds(updateDoc(doc(db, 'categories', 'category-1'), {
    name: 'Oppdatert kategori',
  }));
  await assertFails(setDoc(doc(db, 'allowedUsers', emailKey(UNKNOWN.email)), {
    email: UNKNOWN.email,
    role: 'medlem',
  }));
});

test('Admin kan skrive til allowlisten', async () => {
  await seedAllowed([ADMIN]);
  const db = authed(ADMIN);
  await assertSucceeds(setDoc(doc(db, 'allowedUsers', emailKey(UNKNOWN.email)), {
    email: UNKNOWN.email,
    role: 'medlem',
  }));
});

test('tasks, todos og comments kan ikke slettes', async () => {
  await seedAllowed([ADMIN]);
  await seedBaseData();
  const db = authed(ADMIN);
  await assertFails(deleteDoc(doc(db, 'tasks', 'task-member')));
  await assertFails(deleteDoc(doc(db, 'todos', 'todo-member')));
  await assertFails(deleteDoc(doc(db, 'comments', 'comment-1')));
});

test('kommentar må bruke innlogget brukers uid', async () => {
  await seedAllowed([MEMBER]);
  const db = authed(MEMBER);
  await assertSucceeds(addDoc(collection(db, 'comments'), {
    taskId: 'task-member',
    userId: MEMBER.uid,
    text: 'Gyldig',
  }));
  await assertFails(addDoc(collection(db, 'comments'), {
    taskId: 'task-member',
    userId: OTHER.uid,
    text: 'Forfalsket',
  }));
});

test('varsler kan bare leses og endres av mottakeren', async () => {
  await seedAllowed([MEMBER, OTHER]);
  await seedBaseData();
  const memberDb = authed(MEMBER);
  const otherDb = authed(OTHER);
  await assertSucceeds(getDoc(doc(memberDb, 'users', MEMBER.uid, 'notifications', 'notification-1')));
  await assertSucceeds(updateDoc(
    doc(memberDb, 'users', MEMBER.uid, 'notifications', 'notification-1'),
    { read: true },
  ));
  await assertFails(getDoc(doc(otherDb, 'users', MEMBER.uid, 'notifications', 'notification-1')));
  await assertFails(updateDoc(
    doc(otherDb, 'users', MEMBER.uid, 'notifications', 'notification-1'),
    { read: true },
  ));
});

test('slettet allowlist-oppføring stopper både lesing og skriving', async () => {
  await seedAllowed([ADMIN, MEMBER]);
  await seedBaseData();
  const memberDb = authed(MEMBER);
  await assertSucceeds(getDoc(doc(memberDb, 'tasks', 'task-member')));

  await assertSucceeds(deleteDoc(
    doc(authed(ADMIN), 'allowedUsers', emailKey(MEMBER.email)),
  ));
  await assertFails(getDoc(doc(memberDb, 'tasks', 'task-member')));
  await assertFails(updateDoc(doc(memberDb, 'tasks', 'task-member'), {
    status: 'i_gang',
  }));
});
