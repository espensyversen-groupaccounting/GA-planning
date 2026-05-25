// ============================================================
// FIRESTORE.JS – Alle database-operasjoner
// ============================================================

const CLIENT_APP_VERSION = '1.1.8';
const CLIENT_BUILD = 1108;
const WRITE_SCHEMA_VERSION = 1;

function writeMeta() {
  return {
    clientAppVersion: CLIENT_APP_VERSION,
    clientBuild: CLIENT_BUILD,
    clientWriteId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    writeSchemaVersion: WRITE_SCHEMA_VERSION
  };
}

function sanitizeEmail(email) {
  return email.replace(/\./g, '_dot_').replace('@', '_at_');
}

// ---- Allowed Users (tilgangskontroll) ----

async function initializeAllowedUsers(initialUsers) {
  const snap = await db.collection('allowedUsers').limit(1).get();
  if (!snap.empty) return;
  const batch = db.batch();
  initialUsers.forEach(u => {
    const ref = db.collection('allowedUsers').doc(sanitizeEmail(u.email));
    batch.set(ref, {
      email: u.email,
      role: u.role,
      invitedBy: 'system',
      invitedAt: firebase.firestore.FieldValue.serverTimestamp(),
      ...writeMeta()
    });
  });
  await batch.commit();
}

async function checkAllowedUser(email) {
  const doc = await db.collection('allowedUsers').doc(sanitizeEmail(email)).get();
  if (doc.exists) return doc.data();
  const snap = await db.collection('allowedUsers').where('email', '==', email).limit(1).get();
  return snap.empty ? null : snap.docs[0].data();
}

async function getAllowedUsers() {
  const snap = await db.collection('allowedUsers').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function addAllowedUser(email, role) {
  await db.collection('allowedUsers').doc(sanitizeEmail(email)).set({
    email,
    role,
    invitedBy: auth.currentUser.uid,
    invitedAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...writeMeta()
  });
}

async function removeAllowedUser(email) {
  await db.collection('allowedUsers').doc(sanitizeEmail(email)).delete();
}

async function updateAllowedUserRole(email, role) {
  await db.collection('allowedUsers').doc(sanitizeEmail(email)).update({ role, ...writeMeta() });
}

// ---- Users ----

async function createOrUpdateUser(uid, data) {
  const ref = db.collection('users').doc(uid);
  const doc = await ref.get();
  if (!doc.exists) {
    await ref.set({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
      ...writeMeta()
    });
  } else {
    await ref.update({
      ...data,
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
      ...writeMeta()
    });
  }
}

async function getUser(uid) {
  const doc = await db.collection('users').doc(uid).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function getAllUsers() {
  const snap = await db.collection('users').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function subscribeToUsers(callback, onError) {
  return db.collection('users').onSnapshot(snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onError);
}

async function updateUserRole(uid, role) {
  await db.collection('users').doc(uid).update({ role, ...writeMeta() });
}

async function removeUser(uid) {
  await db.collection('users').doc(uid).delete();
}

// ---- Categories ----

function subscribeToCategories(callback, onError) {
  return db.collection('categories')
    .orderBy('sortOrder', 'asc')
    .onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, onError);
}

async function createCategory(data) {
  await db.collection('categories').add({
    name: data.name,
    color: data.color || '#FF5A5F',
    icon: data.icon || '',
    sortOrder: data.sortOrder || Date.now(),
    active: true,
    createdBy: auth.currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...writeMeta()
  });
}

async function updateCategory(categoryId, data) {
  await db.collection('categories').doc(categoryId).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...writeMeta()
  });
}

async function deleteCategory(categoryId) {
  await db.collection('categories').doc(categoryId).delete();
}

// ---- Tasks ----

function subscribeToTasks(callback, onError) {
  return db.collection('tasks')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.deletedAt));
    }, onError);
}

async function getTask(taskId) {
  const doc = await db.collection('tasks').doc(taskId).get();
  if (!doc.exists || doc.data().deletedAt) return null;
  return { id: doc.id, ...doc.data() };
}

async function createTask(data) {
  const ref = await db.collection('tasks').add({
    ...data,
    subtasks: data.subtasks || [],
    createdBy: auth.currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    detailsUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastEditedBy: auth.currentUser.uid,
    ...writeMeta()
  });
  return ref.id;
}

async function updateTask(taskId, data) {
  await db.collection('tasks').doc(taskId).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastEditedBy: auth.currentUser.uid,
    ...writeMeta()
  });
}

async function updateTaskIfUnchanged(taskId, data, expectedUpdatedAt) {
  const ref = db.collection('tasks').doc(taskId);
  await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error('TASK_NOT_FOUND');

    const current = doc.data();
    const currentUpdatedAt = current.detailsUpdatedAt || current.updatedAt;
    const expectedMs = expectedUpdatedAt?.toMillis ? expectedUpdatedAt.toMillis() : null;
    const currentMs = currentUpdatedAt?.toMillis ? currentUpdatedAt.toMillis() : null;

    if (expectedMs && currentMs && expectedMs !== currentMs) {
      throw new Error('TASK_CHANGED');
    }

    tx.update(ref, {
      ...data,
      detailsUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastEditedBy: auth.currentUser.uid,
      ...writeMeta()
    });
  });
}

async function updateSubtasksSafely(taskId, transform) {
  const ref = db.collection('tasks').doc(taskId);
  let nextSubtasks = [];

  await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error('TASK_NOT_FOUND');

    const currentSubtasks = doc.data().subtasks || [];
    nextSubtasks = transform(currentSubtasks);

    tx.update(ref, {
      subtasks: nextSubtasks,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastEditedBy: auth.currentUser.uid,
      ...writeMeta()
    });
  });

  return nextSubtasks;
}

async function deleteTask(taskId) {
  await db.collection('tasks').doc(taskId).update({
    deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
    deletedBy: auth.currentUser.uid,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastEditedBy: auth.currentUser.uid,
    ...writeMeta()
  });
}

// ---- Comments ----

function subscribeToComments(taskId, callback) {
  return db.collection('comments')
    .where('taskId', '==', taskId)
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

async function addComment(taskId, text) {
  const u = auth.currentUser;
  await db.collection('comments').add({
    taskId,
    userId: u.uid,
    userDisplayName: u.displayName,
    userPhotoURL: u.photoURL,
    text,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...writeMeta()
  });
}

// ---- Notifications ----

function subscribeToNotifications(userId, callback, onError) {
  return db.collection('users').doc(userId)
    .collection('notifications')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, onError);
}

async function createNotification(userId, data) {
  await db.collection('users').doc(userId).collection('notifications').add({
    ...data,
    read: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...writeMeta()
  });
}

async function markNotificationRead(userId, notifId) {
  await db.collection('users').doc(userId).collection('notifications').doc(notifId).update({ read: true, ...writeMeta() });
}

async function markAllNotificationsRead(userId) {
  const snap = await db.collection('users').doc(userId).collection('notifications').where('read', '==', false).get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.update(d.ref, { read: true, ...writeMeta() }));
  await batch.commit();
}
