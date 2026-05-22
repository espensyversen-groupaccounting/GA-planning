// ============================================================
// APP.JS – Strawberry Planleggingsapp
// ============================================================

const state = {
  user: null,
  profile: null,
  tasks: [],
  users: [],
  notifications: [],
  currentView: 'dashboard',
  unsubscribers: [],
  activeTaskId: null,
  commentUnsub: null,
  editMode: false,
};

// ============================================================
// UTILITIES
// ============================================================

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('no-NO', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Akkurat nå';
  if (m < 60) return `${m} min siden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t siden`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d siden`;
  return formatDate(ts);
}

function dueDateClass(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = d.getTime() - Date.now();
  const days = diff / 86400000;
  if (days < 0)  return 'overdue';
  if (days < 3)  return 'soon';
  return '';
}

function priorityLabel(p) {
  return { høy:'Høy', medium:'Medium', lav:'Lav' }[p] || p;
}

function statusLabel(s) {
  return { ikke_startet:'Ikke startet', i_gang:'I gang', fullfort:'Fullført' }[s] || s;
}

function roleLabel(r) {
  return { admin:'Admin', teamleder:'Teamleder', medlem:'Medlem' }[r] || r;
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
}

function canEdit() {
  return state.profile && ['admin','teamleder'].includes(state.profile.role);
}

function isAdmin() {
  return state.profile && state.profile.role === 'admin';
}

function subtaskProgress(subtasks) {
  if (!subtasks || subtasks.length === 0) return null;
  const done = subtasks.filter(s => s.completed).length;
  return { done, total: subtasks.length, pct: Math.round((done / subtasks.length) * 100) };
}

// ============================================================
// TOAST
// ============================================================

function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ============================================================
// LOADING
// ============================================================

function showLoading() { document.getElementById('loading-overlay').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); }

// ============================================================
// CONFIRM DIALOG
// ============================================================

function showConfirm(title, message) {
  return new Promise(resolve => {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const dialog = document.getElementById('confirm-dialog');
    dialog.classList.remove('hidden');

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    function cleanup() {
      dialog.classList.add('hidden');
      document.getElementById('confirm-ok').removeEventListener('click', onOk);
      document.getElementById('confirm-cancel').removeEventListener('click', onCancel);
    }
    document.getElementById('confirm-ok').addEventListener('click', onOk);
    document.getElementById('confirm-cancel').addEventListener('click', onCancel);
  });
}

// ============================================================
// NAVIGATION / VIEWS
// ============================================================

function showView(name) {
  state.currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.bottom-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));

  const view = document.getElementById(`view-${name}`);
  if (view) view.classList.add('active');

  if (name === 'dashboard')     renderDashboard();
  if (name === 'tasks')         renderTasksList();
  if (name === 'notifications') renderNotifications();
  if (name === 'admin')         renderAdmin();
}

// ============================================================
// AUTH
// ============================================================

async function signIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    const errEl = document.getElementById('login-error');
    errEl.textContent = 'Innlogging feilet. Prøv igjen.';
    errEl.classList.remove('hidden');
  }
}

async function signOutUser() {
  state.unsubscribers.forEach(u => u());
  state.unsubscribers = [];
  if (state.commentUnsub) { state.commentUnsub(); state.commentUnsub = null; }
  await auth.signOut();
}

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    showLoading();
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    hideLoading();
    return;
  }

  showLoading();
  try {
    await initializeAllowedUsers(INITIAL_USERS);

    const allowed = await checkAllowedUser(user.email);
    if (!allowed) {
      await auth.signOut();
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('login-error').textContent = 'Du har ikke tilgang til denne appen. Kontakt Admin.';
      document.getElementById('login-error').classList.remove('hidden');
      hideLoading();
      return;
    }

    await createOrUpdateUser(user.uid, {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: allowed.role,
    });

    state.user = user;
    state.profile = await getUser(user.uid);

    setupUI();
    subscribeToRealtime();

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    showView('dashboard');
  } catch (e) {
    console.error('Auth error:', e);
    // Vis login-siden igjen i stedet for blank side
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-error').textContent = 'Det oppstod en feil. Prøv å laste siden på nytt.';
    document.getElementById('login-error').classList.remove('hidden');
  } finally {
    hideLoading();
  }
});

function setupUI() {
  // Bruk profile hvis tilgjengelig, ellers fall tilbake på Firebase auth-bruker
  const p = state.profile || {};
  const u = state.user || {};
  const displayName = p.displayName || u.displayName || '';
  const email       = p.email      || u.email      || '';
  const photoURL    = p.photoURL   || u.photoURL   || '';
  const role        = p.role       || 'medlem';

  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) avatarEl.src = photoURL;

  const nameEl = document.getElementById('user-name-short');
  if (nameEl) nameEl.textContent = displayName.split(' ')[0];

  const dropdownNameEl = document.getElementById('dropdown-name');
  if (dropdownNameEl) dropdownNameEl.textContent = displayName || email;

  const roleEl = document.getElementById('dropdown-role');
  if (roleEl) {
    roleEl.textContent = roleLabel(role);
    roleEl.className = `role-badge ${role}`;
  }

  const showAdmin = ['admin','teamleder'].includes(role);
  document.getElementById('nav-admin-li')?.classList.toggle('hidden', !showAdmin);
  document.getElementById('bottom-admin-btn')?.classList.toggle('hidden', !showAdmin);

  const showCreate = canEdit();
  document.getElementById('btn-add-task')?.classList.toggle('hidden', !showCreate);
  document.getElementById('btn-add-task-dashboard')?.classList.toggle('hidden', !showCreate);
}

function subscribeToRealtime() {
  state.unsubscribers.push(
    subscribeToTasks(tasks => {
      state.tasks = tasks;
      if (state.currentView === 'dashboard') renderDashboard();
      if (state.currentView === 'tasks') renderTasksList();
    }),
    subscribeToUsers(users => {
      state.users = users;
      populateAssigneeSelects();
      if (state.currentView === 'admin') renderAdmin();
    }),
    subscribeToNotifications(state.user.uid, notifs => {
      state.notifications = notifs;
      updateNotifBadge();
      if (state.currentView === 'notifications') renderNotifications();
    })
  );
}

// ============================================================
// DASHBOARD
// ============================================================

function renderDashboard() {
  const tasks = state.tasks;
  const mine  = tasks.filter(t => t.assignedTo === state.user.uid && t.status !== 'fullfort');
  const high  = tasks.filter(t => t.priority === 'høy' && t.status !== 'fullfort');
  const done  = tasks.filter(t => t.status === 'fullfort');
  const going = tasks.filter(t => t.status === 'i_gang');

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card stat-total">
      <div class="stat-number">${tasks.length}</div>
      <div class="stat-label">Totalt oppgaver</div>
    </div>
    <div class="stat-card stat-high">
      <div class="stat-number">${high.length}</div>
      <div class="stat-label">Høy prioritet</div>
    </div>
    <div class="stat-card stat-active">
      <div class="stat-number">${going.length}</div>
      <div class="stat-label">I gang</div>
    </div>
    <div class="stat-card stat-done">
      <div class="stat-number">${done.length}</div>
      <div class="stat-label">Fullført</div>
    </div>
  `;

  renderCompactList('my-tasks-list', mine.slice(0,5), 'Ingen tildelte oppgaver til deg');
  renderCompactList('high-priority-list', high.slice(0,5), 'Ingen oppgaver med høy prioritet');
}

function renderCompactList(containerId, tasks, emptyMsg) {
  const el = document.getElementById(containerId);
  if (!tasks.length) {
    el.innerHTML = `<div class="empty-state"><p>${emptyMsg}</p></div>`;
    return;
  }
  el.innerHTML = tasks.map(t => taskCardHtml(t, true)).join('');
}

// ============================================================
// TASK CARDS HTML
// ============================================================

function taskCardHtml(task, compact = false) {
  const prog = subtaskProgress(task.subtasks);
  const dateClass = dueDateClass(task.dueDate);
  const assignee = state.users.find(u => u.id === task.assignedTo);
  const isDone = task.status === 'fullfort';

  const progressHtml = prog ? `
    <div class="subtask-progress">
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${prog.pct}%"></div></div>
      <div class="progress-label">${prog.done} av ${prog.total} deloppgaver</div>
    </div>` : '';

  const assigneeHtml = assignee ? `
    <span class="assignee-chip">
      ${assignee.photoURL
        ? `<img src="${esc(assignee.photoURL)}" class="assignee-avatar" alt="" />`
        : `<span class="assignee-avatar" style="background:var(--coral);font-size:.6rem;display:flex;align-items:center;justify-content:center;">${initials(assignee.displayName)}</span>`}
      <span>${esc(assignee.displayName || assignee.email)}</span>
    </span>` : '';

  const dueDateHtml = task.dueDate ? `
    <span class="due-date ${dateClass}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      ${formatDate(task.dueDate)}${dateClass === 'overdue' ? ' · Forfalt' : dateClass === 'soon' ? ' · Snart' : ''}
    </span>` : '';

  if (compact) {
    return `
      <div class="task-card priority-${task.priority} ${isDone ? 'done' : ''}" data-task-id="${task.id}" onclick="openTaskModal('${task.id}')">
        <div class="task-card-top">
          <span class="task-card-title">${esc(task.title)}</span>
          <span class="status-badge ${task.status}">${statusLabel(task.status)}</span>
        </div>
        <div class="task-card-meta">
          ${assigneeHtml}
          ${dueDateHtml}
        </div>
        ${progressHtml}
      </div>`;
  }

  return `
    <div class="task-card-full priority-${task.priority} ${isDone ? 'done' : ''}" data-task-id="${task.id}" onclick="openTaskModal('${task.id}')">
      <div class="task-row-top">
        <div class="task-title-row">
          <div class="task-title">${esc(task.title)}</div>
          ${task.description ? `<div class="task-desc">${esc(task.description)}</div>` : ''}
        </div>
      </div>
      <div class="task-row-bottom">
        <span class="status-badge ${task.status}">${statusLabel(task.status)}</span>
        <span class="priority-badge ${task.priority}">
          <span class="priority-dot ${task.priority}"></span>
          ${priorityLabel(task.priority)}
        </span>
        ${assigneeHtml}
        ${dueDateHtml}
        ${prog ? `<span style="font-size:.75rem;color:var(--text-2)">${prog.done}/${prog.total} deloppgaver</span>` : ''}
      </div>
      ${progressHtml}
    </div>`;
}

// ============================================================
// TASKS LIST
// ============================================================

function renderTasksList() {
  const status   = document.getElementById('filter-status').value;
  const priority = document.getElementById('filter-priority').value;
  const assignee = document.getElementById('filter-assignee').value;
  const search   = (document.getElementById('task-search').value || '').toLowerCase();

  let tasks = [...state.tasks];
  if (status)   tasks = tasks.filter(t => t.status === status);
  if (priority) tasks = tasks.filter(t => t.priority === priority);
  if (assignee) tasks = tasks.filter(t => t.assignedTo === assignee);
  if (search)   tasks = tasks.filter(t =>
    t.title.toLowerCase().includes(search) ||
    (t.description || '').toLowerCase().includes(search));

  // Sort: priority then date
  const pOrd = { høy:0, medium:1, lav:2 };
  tasks.sort((a,b) => {
    if (a.status === 'fullfort' && b.status !== 'fullfort') return 1;
    if (b.status === 'fullfort' && a.status !== 'fullfort') return -1;
    return (pOrd[a.priority] || 1) - (pOrd[b.priority] || 1);
  });

  const el = document.getElementById('tasks-list');
  if (!tasks.length) {
    el.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p>Ingen oppgaver funnet</p>
    </div>`;
    return;
  }
  el.innerHTML = tasks.map(t => taskCardHtml(t, false)).join('');
}

function populateAssigneeSelects() {
  const opts = ['<option value="">Alle ansvarlige</option>',
    ...state.users.map(u => `<option value="${u.id}">${esc(u.displayName || u.email)}</option>`)
  ].join('');
  const filterEl = document.getElementById('filter-assignee');
  if (filterEl) filterEl.innerHTML = opts;

  const formOpts = ['<option value="">Ingen tildelt</option>',
    ...state.users.map(u => `<option value="${u.id}">${esc(u.displayName || u.email)}</option>`)
  ].join('');
  const formEl = document.getElementById('task-assignee');
  if (formEl) formEl.innerHTML = formOpts;
}

// ============================================================
// NOTIFICATIONS
// ============================================================

function updateNotifBadge() {
  const unread = state.notifications.filter(n => !n.read).length;
  const badge = count => {
    if (count === 0) return 'hidden';
    return '';
  };
  ['notif-badge','sidebar-notif-badge','bottom-notif-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = unread > 99 ? '99+' : unread;
    el.classList.toggle('hidden', unread === 0);
  });
}

function renderNotifications() {
  const el = document.getElementById('notifications-list');
  if (!state.notifications.length) {
    el.innerHTML = `<div class="empty-state"><p>Ingen varsler ennå</p></div>`;
    return;
  }
  el.innerHTML = state.notifications.map(n => `
    <div class="notif-item ${n.read ? 'read' : 'unread'}" onclick="handleNotifClick('${n.id}','${n.taskId || ''}')">
      <div class="notif-dot"></div>
      <div class="notif-content">
        <div class="notif-message">${esc(n.message)}</div>
        <div class="notif-time">${timeAgo(n.createdAt)}</div>
      </div>
    </div>`).join('');
}

async function handleNotifClick(notifId, taskId) {
  await markNotificationRead(state.user.uid, notifId);
  if (taskId) openTaskModal(taskId);
}

async function handleMarkAllRead() {
  await markAllNotificationsRead(state.user.uid);
  showToast('Alle varsler markert som lest');
}

// ============================================================
// TASK MODAL
// ============================================================

async function openTaskModal(taskId = null) {
  state.activeTaskId = taskId;
  state.editMode = !taskId;

  const modal = document.getElementById('task-modal');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  switchTab('details');
  document.getElementById('subtasks-tab-count').textContent = '';
  document.getElementById('comments-tab-count').textContent = '';

  if (taskId) {
    const task = state.tasks.find(t => t.id === taskId) || await getTask(taskId);
    document.getElementById('modal-title').textContent = task.title;
    fillTaskForm(task);
    updateModalButtons(task);
    renderSubtasks(task.subtasks || []);
    startCommentListener(taskId);
  } else {
    document.getElementById('modal-title').textContent = 'Ny oppgave';
    document.getElementById('task-form').reset();
    document.getElementById('task-id').value = '';
    document.getElementById('subtasks-list').innerHTML = '';
    document.getElementById('comments-list').innerHTML = '';
    updateModalButtons(null);
  }

  setFormReadOnly(!state.editMode && !canEdit());
  // Existing tasks: if can edit, show form editable directly
  if (taskId && canEdit()) setFormReadOnly(false);

  document.getElementById('task-modal').setAttribute('data-task-id', taskId || '');
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.add('hidden');
  document.body.style.overflow = '';
  if (state.commentUnsub) { state.commentUnsub(); state.commentUnsub = null; }
  state.activeTaskId = null;
}

function fillTaskForm(task) {
  document.getElementById('task-id').value = task.id;
  document.getElementById('task-title').value = task.title || '';
  document.getElementById('task-description').value = task.description || '';
  document.getElementById('task-priority').value = task.priority || 'medium';
  document.getElementById('task-status').value = task.status || 'ikke_startet';
  document.getElementById('task-assignee').value = task.assignedTo || '';
  document.getElementById('task-dependencies').value = task.dependencies || '';

  if (task.startDate) {
    const d = task.startDate.toDate ? task.startDate.toDate() : new Date(task.startDate);
    document.getElementById('task-start-date').value = d.toISOString().split('T')[0];
  } else {
    document.getElementById('task-start-date').value = '';
  }
  if (task.dueDate) {
    const d = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
    document.getElementById('task-due-date').value = d.toISOString().split('T')[0];
  } else {
    document.getElementById('task-due-date').value = '';
  }
}

function updateModalButtons(task) {
  const deleteBtn = document.getElementById('btn-delete-task');
  const saveBtn   = document.getElementById('btn-save-task');
  const cancelBtn = document.getElementById('btn-cancel-task');

  deleteBtn.classList.toggle('hidden', !task || !canEdit());
  saveBtn.textContent  = task ? 'Lagre endringer' : 'Opprett oppgave';

  // Membres can only change status on their own tasks
  if (task && !canEdit()) {
    if (task.assignedTo === state.user.uid) {
      saveBtn.textContent = 'Oppdater status';
    } else {
      saveBtn.classList.add('hidden');
    }
  } else {
    saveBtn.classList.remove('hidden');
  }
}

function setFormReadOnly(readonly) {
  ['task-title','task-description','task-priority','task-assignee','task-start-date','task-due-date','task-dependencies']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = readonly;
    });
  const statusEl = document.getElementById('task-status');
  if (statusEl) statusEl.disabled = false; // status always editable for assigned
}

async function handleSaveTask() {
  const form = document.getElementById('task-form');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const taskId    = document.getElementById('task-id').value;
  const title     = document.getElementById('task-title').value.trim();
  const desc      = document.getElementById('task-description').value.trim();
  const priority  = document.getElementById('task-priority').value;
  const status    = document.getElementById('task-status').value;
  const assigneeId = document.getElementById('task-assignee').value;
  const startStr  = document.getElementById('task-start-date').value;
  const dueStr    = document.getElementById('task-due-date').value;
  const deps      = document.getElementById('task-dependencies').value.trim();

  const assignee = state.users.find(u => u.id === assigneeId);

  const data = {
    title,
    description: desc,
    priority,
    status,
    assignedTo: assigneeId || null,
    assignedToName: assignee ? (assignee.displayName || assignee.email) : null,
    startDate: startStr ? firebase.firestore.Timestamp.fromDate(new Date(startStr)) : null,
    dueDate:   dueStr   ? firebase.firestore.Timestamp.fromDate(new Date(dueStr))   : null,
    dependencies: deps,
  };

  const saveBtn = document.getElementById('btn-save-task');
  saveBtn.disabled = true;

  try {
    if (taskId) {
      const oldTask = state.tasks.find(t => t.id === taskId);

      // If role is Medlem, only allow status update
      if (!canEdit()) {
        await updateTask(taskId, { status });
      } else {
        await updateTask(taskId, data);
        // Notify if assignee changed
        if (assigneeId && oldTask && oldTask.assignedTo !== assigneeId) {
          await createNotification(assigneeId, {
            type: 'task_assigned',
            taskId,
            taskTitle: title,
            message: `Du ble tildelt oppgaven: "${title}"`,
          });
        }
        // Notify status change to creator if different user
        if (oldTask && oldTask.status !== status && oldTask.createdBy && oldTask.createdBy !== state.user.uid) {
          await createNotification(oldTask.createdBy, {
            type: 'status_changed',
            taskId,
            taskTitle: title,
            message: `Status på "${title}" endret til: ${statusLabel(status)}`,
          });
        }
      }
      showToast('Oppgave oppdatert');
    } else {
      const newId = await createTask(data);
      if (assigneeId && assigneeId !== state.user.uid) {
        await createNotification(assigneeId, {
          type: 'task_assigned',
          taskId: newId,
          taskTitle: title,
          message: `Du ble tildelt en ny oppgave: "${title}"`,
        });
      }
      showToast('Oppgave opprettet');
    }
    closeTaskModal();
  } catch(e) {
    console.error(e);
    showToast('Feil ved lagring. Prøv igjen.', 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

async function handleDeleteTask() {
  const taskId = document.getElementById('task-id').value;
  if (!taskId) return;
  const task = state.tasks.find(t => t.id === taskId);
  const confirmed = await showConfirm('Slett oppgave', `Er du sikker på at du vil slette "${task ? task.title : 'denne oppgaven'}"? Dette kan ikke angres.`);
  if (!confirmed) return;

  try {
    await deleteTask(taskId);
    closeTaskModal();
    showToast('Oppgave slettet');
  } catch(e) {
    showToast('Feil ved sletting.', 'error');
  }
}

// ============================================================
// TABS
// ============================================================

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
}

// ============================================================
// SUBTASKS
// ============================================================

function renderSubtasks(subtasks) {
  const el = document.getElementById('subtasks-list');
  const countEl = document.getElementById('subtasks-tab-count');
  if (!subtasks.length) {
    el.innerHTML = '<p style="color:var(--text-3);font-size:.875rem;text-align:center;padding:20px 0">Ingen deloppgaver ennå</p>';
    countEl.textContent = '';
    return;
  }
  const done = subtasks.filter(s => s.completed).length;
  countEl.textContent = `${done}/${subtasks.length}`;

  el.innerHTML = subtasks.map((s, i) => `
    <div class="subtask-item">
      <input type="checkbox" class="subtask-checkbox" ${s.completed ? 'checked' : ''}
        onchange="toggleSubtask(${i}, this.checked)" />
      <span class="subtask-title ${s.completed ? 'done' : ''}">${esc(s.title)}</span>
      ${canEdit() ? `<button class="btn-remove-subtask" onclick="removeSubtask(${i})" title="Fjern">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>` : ''}
    </div>`).join('');

  document.getElementById('add-subtask-wrap').classList.toggle('hidden', !canEdit() && !state.profile?.role === 'member');
}

async function toggleSubtask(index, completed) {
  const taskId = state.activeTaskId;
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  const subtasks = [...task.subtasks];
  subtasks[index] = { ...subtasks[index], completed };
  await updateTask(taskId, { subtasks });
  renderSubtasks(subtasks);
  // Update progress in task card if dashboard/tasks view visible
  if (state.currentView === 'dashboard') renderDashboard();
}

async function handleAddSubtask() {
  const input = document.getElementById('new-subtask-input');
  const title = input.value.trim();
  if (!title) return;
  const taskId = state.activeTaskId;
  if (!taskId) return;
  const task = state.tasks.find(t => t.id === taskId);
  const subtasks = [...(task ? task.subtasks : []), { id: Date.now().toString(), title, completed: false }];
  await updateTask(taskId, { subtasks });
  input.value = '';
  renderSubtasks(subtasks);
}

async function removeSubtask(index) {
  const taskId = state.activeTaskId;
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  const subtasks = task.subtasks.filter((_, i) => i !== index);
  await updateTask(taskId, { subtasks });
  renderSubtasks(subtasks);
}

// ============================================================
// COMMENTS
// ============================================================

function startCommentListener(taskId) {
  if (state.commentUnsub) state.commentUnsub();
  state.commentUnsub = subscribeToComments(taskId, comments => {
    renderComments(comments);
    document.getElementById('comments-tab-count').textContent = comments.length || '';
  });
}

function renderComments(comments) {
  const el = document.getElementById('comments-list');
  if (!comments.length) {
    el.innerHTML = '<p style="color:var(--text-3);font-size:.875rem;text-align:center;padding:20px 0">Ingen kommentarer ennå</p>';
    return;
  }
  el.innerHTML = comments.map(c => `
    <div class="comment-item">
      ${c.userPhotoURL
        ? `<img src="${esc(c.userPhotoURL)}" class="comment-avatar" alt="" />`
        : `<div class="comment-avatar" style="background:var(--coral);display:flex;align-items:center;justify-content:center;color:white;font-size:.7rem;font-weight:700">${initials(c.userDisplayName)}</div>`}
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-author">${esc(c.userDisplayName || 'Ukjent')}</span>
          <span class="comment-time">${timeAgo(c.createdAt)}</span>
        </div>
        <div class="comment-bubble">
          <div class="comment-text">${esc(c.text)}</div>
        </div>
      </div>
    </div>`).join('');
  el.scrollTop = el.scrollHeight;
}

async function handleAddComment() {
  const input = document.getElementById('new-comment-input');
  const text = input.value.trim();
  if (!text || !state.activeTaskId) return;

  const btn = document.getElementById('btn-add-comment');
  btn.disabled = true;
  try {
    await addComment(state.activeTaskId, text);
    input.value = '';

    // Notify task creator / assignee
    const task = state.tasks.find(t => t.id === state.activeTaskId);
    if (task) {
      const toNotify = new Set();
      if (task.createdBy && task.createdBy !== state.user.uid) toNotify.add(task.createdBy);
      if (task.assignedTo && task.assignedTo !== state.user.uid) toNotify.add(task.assignedTo);
      for (const uid of toNotify) {
        await createNotification(uid, {
          type: 'comment_added',
          taskId: task.id,
          taskTitle: task.title,
          message: `${state.profile.displayName || 'Noen'} kommenterte på "${task.title}"`,
        });
      }
    }
  } catch(e) {
    showToast('Feil ved sending av kommentar.', 'error');
  } finally {
    btn.disabled = false;
  }
}

// ============================================================
// ADMIN
// ============================================================

function renderAdmin() {
  const el = document.getElementById('users-list');
  if (!state.users.length) {
    el.innerHTML = '<p style="color:var(--text-2);font-size:.875rem">Ingen brukere ennå</p>';
    return;
  }

  el.innerHTML = state.users.map(u => `
    <div class="user-item">
      ${u.photoURL
        ? `<img src="${esc(u.photoURL)}" class="user-item-avatar" alt="" />`
        : `<div class="user-item-avatar">${initials(u.displayName || u.email)}</div>`}
      <div class="user-item-info">
        <div class="user-item-name">${esc(u.displayName || u.email)}</div>
        <div class="user-item-email">${esc(u.email)}</div>
      </div>
      <div class="user-item-actions">
        ${isAdmin() ? `
          <select class="role-select" onchange="handleRoleChange('${u.id}', '${u.email}', this.value)">
            <option value="admin"     ${u.role==='admin'     ?'selected':''}>Admin</option>
            <option value="teamleder" ${u.role==='teamleder' ?'selected':''}>Teamleder</option>
            <option value="medlem"    ${u.role==='medlem'    ?'selected':''}>Medlem</option>
          </select>
          ${u.id !== state.user.uid ? `
          <button class="btn-icon-danger" onclick="handleRemoveUser('${u.id}','${u.email}')" title="Fjern bruker">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>` : ''}
        ` : `<span class="role-badge ${u.role}">${roleLabel(u.role)}</span>`}
      </div>
    </div>`).join('');
}

async function handleAddUser(e) {
  e.preventDefault();
  const email = document.getElementById('new-user-email').value.trim().toLowerCase();
  const role  = document.getElementById('new-user-role').value;
  if (!email) return;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    await addAllowedUser(email, role);
    document.getElementById('new-user-email').value = '';
    showToast(`${email} lagt til som ${roleLabel(role)}`);
  } catch(err) {
    showToast('Feil ved tillegging av bruker.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function handleRoleChange(uid, email, newRole) {
  try {
    await updateUserRole(uid, newRole);
    await updateAllowedUserRole(email, newRole);
    showToast('Rolle oppdatert');
  } catch(e) {
    showToast('Feil ved rolleendring.', 'error');
  }
}

async function handleRemoveUser(uid, email) {
  const confirmed = await showConfirm('Fjern bruker', `Er du sikker på at du vil fjerne tilgangen til ${email}?`);
  if (!confirmed) return;
  try {
    await removeUser(uid);
    await removeAllowedUser(email);
    showToast('Bruker fjernet');
  } catch(e) {
    showToast('Feil ved fjerning av bruker.', 'error');
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }

  // Login
  document.getElementById('btn-signin').addEventListener('click', signIn);

  // Sign out
  document.getElementById('btn-signout').addEventListener('click', signOutUser);

  // User menu toggle
  document.getElementById('user-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('user-dropdown').classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    document.getElementById('user-dropdown')?.classList.add('hidden');
  });

  // Notification bell
  document.getElementById('btn-notif').addEventListener('click', () => showView('notifications'));

  // Nav buttons (sidebar + bottom)
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Add task buttons
  document.getElementById('btn-add-task').addEventListener('click', () => openTaskModal());
  document.getElementById('btn-add-task-dashboard').addEventListener('click', () => openTaskModal());

  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeTaskModal);
  document.getElementById('btn-cancel-task').addEventListener('click', closeTaskModal);
  document.getElementById('task-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTaskModal();
  });

  // Modal tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Task form save / delete
  document.getElementById('btn-save-task').addEventListener('click', handleSaveTask);
  document.getElementById('btn-delete-task').addEventListener('click', handleDeleteTask);

  // Subtask add
  document.getElementById('btn-add-subtask').addEventListener('click', handleAddSubtask);
  document.getElementById('new-subtask-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); }
  });

  // Comment add
  document.getElementById('btn-add-comment').addEventListener('click', handleAddComment);
  document.getElementById('new-comment-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment();
  });

  // Notifications mark all read
  document.getElementById('btn-mark-all-read').addEventListener('click', handleMarkAllRead);

  // Admin add user
  document.getElementById('add-user-form').addEventListener('submit', handleAddUser);

  // Filters + search
  ['filter-status','filter-priority','filter-assignee'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderTasksList);
  });
  document.getElementById('task-search').addEventListener('input', renderTasksList);

  // Keyboard: Escape closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!document.getElementById('task-modal').classList.contains('hidden')) closeTaskModal();
      if (!document.getElementById('confirm-dialog').classList.contains('hidden')) {
        document.getElementById('confirm-dialog').classList.add('hidden');
      }
    }
  });
});
