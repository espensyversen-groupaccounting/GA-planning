// ============================================================
// FIRESTORE.JS – Alle database-operasjoner
// ============================================================

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
      invitedAt: firebase.firestore.FieldValue.serverTimestamp()
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
    invitedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function removeAllowedUser(email) {
  await db.collection('allowedUsers').doc(sanitizeEmail(email)).delete();
}

async function updateAllowedUserRole(email, role) {
  await db.collection('allowedUsers').doc(sanitizeEmail(email)).update({ role });
}

// ---- Users ----

async function createOrUpdateUser(uid, data) {
  const ref = db.collection('users').doc(uid);
  const doc = await ref.get();
  if (!doc.exists) {
    await ref.set({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp(), lastLogin: firebase.firestore.FieldValue.serverTimestamp() });
  } else {
    await ref.update({ ...data, lastLogin: firebase.firestore.FieldValue.serverTimestamp() });
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

function subscribeToUsers(callback) {
  return db.collection('users').onSnapshot(snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

async function updateUserRole(uid, role) {
  await db.collection('users').doc(uid).update({ role });
}

async function removeUser(uid) {
  await db.collection('users').doc(uid).delete();
}

// ---- Tasks ----

function subscribeToTasks(callback) {
  return db.collection('tasks')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

async function getTask(taskId) {
  const doc = await db.collection('tasks').doc(taskId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function createTask(data) {
  const ref = await db.collection('tasks').add({
    ...data,
    subtasks: data.subtasks || [],
    createdBy: auth.currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

async function updateTask(taskId, data) {
  await db.collection('tasks').doc(taskId).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function deleteTask(taskId) {
  const batch = db.batch();
  batch.delete(db.collection('tasks').doc(taskId));
  const commentsSnap = await db.collection('comments').where('taskId', '==', taskId).get();
  commentsSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
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
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ---- Notifications ----

function subscribeToNotifications(userId, callback) {
  return db.collection('users').doc(userId)
    .collection('notifications')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

async function createNotification(userId, data) {
  await db.collection('users').doc(userId).collection('notifications').add({
    ...data,
    read: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function markNotificationRead(userId, notifId) {
  await db.collection('users').doc(userId).collection('notifications').doc(notifId).update({ read: true });
}

async function markAllNotificationsRead(userId) {
  const snap = await db.collection('users').doc(userId).collection('notifications').where('read', '==', false).get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.update(d.ref, { read: true }));
  await batch.commit();
}
