// ============================================================
// FIRESTORE.JS – Alle database-operasjoner
// ============================================================

const CLIENT_APP_VERSION = '1.19.2';
const CLIENT_BUILD = 11902;
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
  return email.trim().toLowerCase().replace(/[.]/g, '_dot_').replace('@', '_at_');
}

function taskLinkUrl(value, addProtocol = false) {
  let input = typeof value === 'string' ? value.trim() : '';
  if (!input || input.length > 2048) throw new Error('LINK_URL_INVALID');
  if (addProtocol && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(input)) {
    input = 'https://' + input;
  }
  let url;
  try { url = new URL(input); } catch (_) { throw new Error('LINK_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) {
    throw new Error('LINK_URL_INVALID');
  }
  return url.href;
}

function taskLinkInfo(link) {
  let url;
  try { url = new URL(taskLinkUrl(link?.url)); } catch (_) {
    return { safe: false, label: String(link?.title || link?.url || 'Ugyldig lenke'), type: 'link' };
  }
  let type = 'link';
  let label = url.hostname;
  const types = url.hostname === 'docs.google.com'
    ? [['document', 'Google Dokument', 'document'], ['spreadsheets', 'Google Regneark', 'sheet'],
       ['presentation', 'Google Presentasjon', 'presentation'], ['forms', 'Google Skjema', 'form']]
    : url.hostname === 'drive.google.com'
      ? [['drive/folders', 'Drive-mappe', 'folder'], ['file', 'Drive-fil', 'file']] : [];
  for (const [path, name, icon] of types) {
    if (url.pathname === '/' + path || url.pathname.startsWith('/' + path + '/')) {
      label = name;
      type = icon;
      break;
    }
  }
  return { safe: true, url: url.href, label: String(link?.title || label), type };
}

function taskLinkValue(link) {
  const title = typeof link.title === 'string' ? link.title.trim() : '';
  if (title.length > 200) throw new Error('LINK_TITLE_TOO_LONG');
  return { id: link.id, url: taskLinkUrl(link.url, true), title };
}

// ---- Allowed Users (tilgangskontroll) ----

async function initializeAllowedUsers(initialUsers) {
  try {
    const snap = await db.collection('allowedUsers').limit(1).get();
    if (!snap.empty) return;
    const batch = db.batch();
    initialUsers.forEach(u => {
      const normalizedEmail = u.email.trim().toLowerCase();
      const ref = db.collection('allowedUsers').doc(sanitizeEmail(normalizedEmail));
      batch.set(ref, {
        email: normalizedEmail,
        role: u.role,
        invitedBy: 'system',
        invitedAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...writeMeta()
      });
    });
    await batch.commit();
  } catch (e) {
    if (e && e.code === 'permission-denied') return;
    throw e;
  }
}

async function checkAllowedUser(email) {
  try {
    const doc = await db.collection('allowedUsers').doc(sanitizeEmail(email)).get();
    return doc.exists ? doc.data() : null;
  } catch (e) {
    if (e && e.code === 'permission-denied') return null;
    throw e;
  }
}

async function getAllowedUsers() {
  const snap = await db.collection('allowedUsers').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function subscribeToAllowedUsers(callback, onError) {
  return db.collection('allowedUsers').onSnapshot(snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onError);
}

async function addAllowedUser(email, role) {
  const normalizedEmail = email.trim().toLowerCase();
  await db.collection('allowedUsers').doc(sanitizeEmail(normalizedEmail)).set({
    email: normalizedEmail,
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

// ---- Export ----

async function getAllDataForExport() {
  const collectionNames = ['tasks', 'todos', 'categories', 'users', 'allowedUsers', 'comments'];
  const snapshots = await Promise.all(
    collectionNames.map(name => db.collection(name).get())
  );

  return Object.fromEntries(collectionNames.map((name, index) => [
    name,
    snapshots[index].docs.map(doc => ({ id: doc.id, ...doc.data() }))
  ]));
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

function taskCreateData(data) {
  if (data.status === 'til_review') throw new Error('REVIEW_REQUIRED');
  return {
    ...data,
    subtasks: data.subtasks || [],
    createdBy: auth.currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    detailsUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastEditedBy: auth.currentUser.uid,
    ...writeMeta()
  };
}

function todoArchiveData() {
  return {
    deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
    deletedBy: auth.currentUser.uid,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastEditedBy: auth.currentUser.uid,
    ...writeMeta()
  };
}

async function createTask(data) {
  const ref = await db.collection('tasks').add(taskCreateData(data));
  return ref.id;
}

function recurrenceInstanceDocumentId(templateId, instanceDate) {
  return `${templateId}__${String(instanceDate).replace(/-/g, '')}`;
}

async function generateRecurringTaskInstances(templateId, horizonDate, buildPlan, buildInstanceData, maxInstancesPerRun = Infinity) {
  let created = 0;
  let candidatesProcessed = 0;
  let hasMore = true;
  let batches = 0;

  while (hasMore && batches < 100 && candidatesProcessed < maxInstancesPerRun) {
    const batchLimit = Math.min(100, maxInstancesPerRun - candidatesProcessed);
    const result = await db.runTransaction(async tx => {
      const templateRef = db.collection('tasks').doc(templateId);
      const templateDoc = await tx.get(templateRef);
      if (!templateDoc.exists) return { created: 0, hasMore: false };

      const template = { id: templateDoc.id, ...templateDoc.data() };
      if (template.deletedAt || !template.recurrence) return { created: 0, hasMore: false };

      const plan = buildPlan(template, horizonDate, batchLimit);
      const instanceRefs = plan.occurrences.map(instanceDate =>
        db.collection('tasks').doc(recurrenceInstanceDocumentId(templateId, instanceDate))
      );
      const instanceDocs = await Promise.all(instanceRefs.map(ref => tx.get(ref)));

      let batchCreated = 0;
      plan.occurrences.forEach((instanceDate, index) => {
        if (instanceDocs[index].exists) return;
        tx.set(instanceRefs[index], taskCreateData(buildInstanceData(template, instanceDate)));
        batchCreated += 1;
      });

      if (plan.generatedUntil && plan.generatedUntil !== template.recurrenceGeneratedUntil) {
        tx.update(templateRef, {
          recurrenceGeneratedUntil: plan.generatedUntil,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastEditedBy: auth.currentUser.uid,
          ...writeMeta()
        });
      }
      return { created: batchCreated, candidates: plan.occurrences.length, hasMore: plan.hasMore };
    });

    created += result.created;
    candidatesProcessed += result.candidates || 0;
    hasMore = result.hasMore;
    batches += 1;
  }

  if (hasMore && batches >= 100) throw new Error('RECURRENCE_GENERATION_LIMIT');
  return created;
}

function taskReviewState(task) {
  return {
    status: task?.status || 'ikke_startet',
    reviewerId: task?.reviewerId || null,
    reviewRequestedAt: task?.reviewRequestedAt?.seconds !== undefined
      ? `${task.reviewRequestedAt.seconds}:${task.reviewRequestedAt.nanoseconds}`
      : task?.reviewRequestedAt?.toMillis?.() ?? null,
  };
}

function assertTaskReviewState(task, expected) {
  const actual = taskReviewState(task);
  if (expected && Object.keys(actual).some(key => actual[key] !== expected[key])) {
    throw new Error('REVIEW_CHANGED');
  }
}

function assertOrdinaryTaskStatus(task, status) {
  if (status === 'til_review' && task.status !== 'til_review') throw new Error('REVIEW_REQUIRED');
  if (task.status === 'til_review' && status !== 'til_review') throw new Error('REVIEW_REQUIRED');
}

function taskCompletionChanges(task, status, confirmedOpenIds = null) {
  if (status !== 'fullfort') return {};
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const open = subtasks.filter(item => item.completed !== true);
  if (confirmedOpenIds !== null) {
    const actual = new Set(open.map(item => item.id));
    const expected = new Set(confirmedOpenIds);
    if (actual.size !== expected.size || open.length !== actual.size ||
        [...actual].some(id => !id || !expected.has(id))) throw new Error('SUBTASKS_CHANGED');
    if (!canEdit()) throw new Error('SUBTASKS_FORBIDDEN');
    return { subtasks: subtasks.map(item => expected.has(item.id) ? { ...item, completed: true } : item) };
  }
  if (open.length) {
    const error = new Error('OPEN_SUBTASKS');
    error.openSubtaskIds = open.map(item => item.id);
    throw error;
  }
  return {};
}

async function updateTask(taskId, data, expectedReview = null, confirmedOpenIds = null) {
  if (Object.prototype.hasOwnProperty.call(data, 'status')) {
    const ref = db.collection('tasks').doc(taskId);
    return db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists || doc.data().deletedAt) throw new Error('TASK_NOT_FOUND');
      assertTaskReviewState(doc.data(), expectedReview);
      assertOrdinaryTaskStatus(doc.data(), data.status);
      const completion = taskCompletionChanges(doc.data(), data.status, confirmedOpenIds);
      tx.update(ref, {
        ...data,
        ...completion,
        ...(canEdit() ? { detailsUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() } : {}),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastEditedBy: auth.currentUser.uid,
        ...writeMeta(),
      });
    });
  }
  await db.collection('tasks').doc(taskId).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastEditedBy: auth.currentUser.uid,
    ...writeMeta()
  });
}

async function updateTaskIfUnchanged(taskId, data, expectedUpdatedAt, confirmedOpenIds = null) {
  const ref = db.collection('tasks').doc(taskId);
  await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists || doc.data().deletedAt) throw new Error('TASK_NOT_FOUND');

    const current = doc.data();
    if (Object.prototype.hasOwnProperty.call(data, 'status')) assertOrdinaryTaskStatus(current, data.status);
    const currentUpdatedAt = current.detailsUpdatedAt || current.updatedAt;
    const expectedMs = expectedUpdatedAt?.toMillis ? expectedUpdatedAt.toMillis() : null;
    const currentMs = currentUpdatedAt?.toMillis ? currentUpdatedAt.toMillis() : null;

    if (expectedMs && currentMs && expectedMs !== currentMs) {
      throw new Error('TASK_CHANGED');
    }

    const completion = taskCompletionChanges(current, data.status, confirmedOpenIds);
    tx.update(ref, {
      ...data,
      ...completion,
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
      ...(!doc.data().detailsUpdatedAt ? { detailsUpdatedAt: doc.data().updatedAt || null } : {}),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastEditedBy: auth.currentUser.uid,
      ...writeMeta()
    });
  });

  return nextSubtasks;
}

async function updateTaskLinksSafely(taskId, change) {
  const ref = db.collection('tasks').doc(taskId);
  let links = [];
  await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists || doc.data().deletedAt) throw new Error('TASK_NOT_FOUND');
    const data = doc.data();
    links = Array.isArray(data.links) ? [...data.links] : [];
    const index = links.findIndex(link => link.id === change.id);
    if (change.action === 'add') {
      const added = taskLinkValue(change);
      if (!added.id || links.some(link => link.id === added.id)) throw new Error('LINK_DUPLICATE');
      if (links.some(link => taskLinkInfo(link).url === added.url)) throw new Error('LINK_DUPLICATE');
      links.push(added);
    } else {
      if (index < 0) throw new Error('LINK_NOT_FOUND');
      if (change.action === 'remove') links.splice(index, 1);
      else if (change.action === 'rename') {
        const title = typeof change.title === 'string' ? change.title.trim() : '';
        if (title.length > 200) throw new Error('LINK_TITLE_TOO_LONG');
        taskLinkUrl(links[index].url);
        links[index] = { ...links[index], title };
      } else throw new Error('LINK_CHANGE_INVALID');
    }
    tx.update(ref, {
      links,
      ...(!data.detailsUpdatedAt ? { detailsUpdatedAt: data.updatedAt || null } : {}),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastEditedBy: auth.currentUser.uid,
      ...writeMeta()
    });
  });
  return links;
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

// ---- ToDos ----

function subscribeToTodos(callback, onError) {
  return db.collection('todos')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.deletedAt));
    }, onError);
}

async function createTodo(data) {
  const ref = await db.collection('todos').add({
    ...data,
    status: data.status || 'apen',
    createdBy: auth.currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastEditedBy: auth.currentUser.uid,
    ...writeMeta()
  });
  return ref.id;
}

async function updateTodo(todoId, data) {
  await db.collection('todos').doc(todoId).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastEditedBy: auth.currentUser.uid,
    ...writeMeta()
  });
}

async function updateTodoSortOrder(todoId, sortOrder) {
  await db.collection('todos').doc(todoId).update({
    sortOrder,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastEditedBy: auth.currentUser.uid,
    ...writeMeta()
  });
}

async function normalizeTodoSortOrders(orderedTodoIds, step = 1000) {
  const batch = db.batch();
  orderedTodoIds.forEach((todoId, index) => {
    batch.update(db.collection('todos').doc(todoId), {
      sortOrder: (index + 1) * step,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastEditedBy: auth.currentUser.uid,
      ...writeMeta()
    });
  });
  await batch.commit();
}

async function deleteTodo(todoId) {
  await db.collection('todos').doc(todoId).update(todoArchiveData());
}

async function restoreTodo(todoId) {
  await db.collection('todos').doc(todoId).update({
    deletedAt: firebase.firestore.FieldValue.delete(),
    deletedBy: firebase.firestore.FieldValue.delete(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastEditedBy: auth.currentUser.uid,
    ...writeMeta()
  });
}

async function convertTodoToTask(todoId, taskData) {
  const todoRef = db.collection('todos').doc(todoId);
  const taskRef = db.collection('tasks').doc();
  const newTaskData = taskCreateData(taskData);
  const archiveData = todoArchiveData();

  await db.runTransaction(async tx => {
    const todoDoc = await tx.get(todoRef);
    if (!todoDoc.exists || todoDoc.data().deletedAt) {
      throw new Error('TODO_NOT_FOUND');
    }
    if (todoDoc.data().status === 'fullfort') {
      throw new Error('TODO_NOT_OPEN');
    }

    tx.set(taskRef, newTaskData);
    tx.update(todoRef, archiveData);
  });

  return taskRef.id;
}

// ---- Comments ----

function subscribeToComments(taskId, callback, onError) {
  return db.collection('comments')
    .where('taskId', '==', taskId)
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, onError);
}

function commentCreateData(taskId, text) {
  const u = auth.currentUser;
  return {
    taskId,
    userId: u.uid,
    userDisplayName: u.displayName || u.email || u.uid,
    userPhotoURL: u.photoURL || null,
    text,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...writeMeta()
  };
}

async function addComment(taskId, text) {
  await db.collection('comments').add(commentCreateData(taskId, text));
}

async function performTaskReview(taskId, action, expected, options = {}) {
  const uid = auth.currentUser.uid;
  const text = String(options.message || '').trim();
  if (!canEdit()) throw new Error('REVIEW_FORBIDDEN');
  if (action === 'return' && !text) throw new Error('REVIEW_FEEDBACK_REQUIRED');
  if (!['send', 'approve', 'return', 'withdraw'].includes(action)) throw new Error('REVIEW_FORBIDDEN');
  if (action === 'send' && (!options.reviewerId || options.reviewerId === uid)) throw new Error('REVIEW_REVIEWER_INVALID');
  const prefix = { send: 'Sendt til review:', approve: 'Godkjent:', return: 'Sendt tilbake:' }[action];
  // Allocate outside the callback so retries cannot create extra comments.
  const commentRef = text && prefix ? db.collection('comments').doc() : null;
  const ref = db.collection('tasks').doc(taskId);
  return db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists || doc.data().deletedAt) throw new Error('TASK_NOT_FOUND');
    const current = doc.data();
    assertTaskReviewState(current, expected);
    let reviewer = null;
    if (action === 'send') {
      if (current.status === 'fullfort') throw new Error('REVIEW_CHANGED');
      const userDoc = await tx.get(db.collection('users').doc(options.reviewerId));
      if (!userDoc.exists || !['admin', 'teamleder'].includes(userDoc.data().role)) throw new Error('REVIEW_REVIEWER_INVALID');
      reviewer = userDoc.data();
    } else {
      if (current.status !== 'til_review') throw new Error('REVIEW_CHANGED');
      if (action !== 'withdraw' && current.reviewerId !== uid) throw new Error('REVIEW_FORBIDDEN');
    }
    const timestamp = firebase.firestore.FieldValue.serverTimestamp();
    let changes;
    if (action === 'send') {
      changes = {
        status: 'til_review', reviewerId: options.reviewerId,
        reviewerName: reviewer.displayName || reviewer.email || options.reviewerId,
        reviewRequestedBy: uid, reviewRequestedAt: timestamp,
        reviewedBy: null, reviewedAt: null, reviewOutcome: null,
      };
    } else if (action === 'withdraw') {
      changes = {
        status: 'i_gang', reviewerId: null, reviewerName: null,
        reviewRequestedBy: null, reviewRequestedAt: null,
        reviewedBy: null, reviewedAt: null, reviewOutcome: null,
      };
    } else {
      changes = {
        status: 'i_gang',
        reviewedBy: uid, reviewedAt: timestamp,
        reviewOutcome: action === 'approve' ? 'approved' : 'returned',
      };
    }
    tx.update(ref, {
      ...changes, detailsUpdatedAt: timestamp, updatedAt: timestamp,
      lastEditedBy: uid, ...writeMeta(),
    });
    if (commentRef) tx.set(commentRef, commentCreateData(taskId, `${prefix} ${text}`));
    return { before: current, changes };
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

