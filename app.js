// ============================================================
// APP.JS – Strawberry Planleggingsapp
// ============================================================

// Versjon – må matche APP_VERSION i service-worker.js
const APP_VERSION = '1.2.1';

// Service Worker oppdateringsstatus
let swRegistration  = null;
let swUpdateWaiting = false;

const state = {
  user: null,
  profile: null,
  tasks: [],
  users: [],
  allowedUsers: [],
  categories: [],
  notifications: [],
  currentView: 'dashboard',
  unsubscribers: [],
  activeTaskId: null,
  activeTaskDetailsUpdatedAt: null,
  commentUnsub: null,
  editMode: false,
  quickFilter: '',
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
  const days = taskDueDays({ dueDate: ts });
  if (days < 0)  return 'overdue';
  if (days < 3)  return 'soon';
  return '';
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDate(value) {
  if (!value) return null;
  const d = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function taskDueDays(task) {
  const d = toDate(task && task.dueDate);
  if (!d) return Infinity;
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - startOfToday().getTime()) / 86400000);
}

function dueDateRelativeLabel(task) {
  const days = taskDueDays(task);
  if (!Number.isFinite(days)) return '';
  if (days < 0) return `${Math.abs(days)} d over frist`;
  if (days === 0) return 'I dag';
  if (days === 1) return 'I morgen';
  if (days <= 14) return `Om ${days} d`;
  return '';
}

function taskHasSoonSubtask(task, threshold = 7) {
  return (task.subtasks || []).some(s => {
    if (s.completed || !s.dueDate) return false;
    const d = parseDateString(s.dueDate);
    if (!d) return false;
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((d.getTime() - startOfToday().getTime()) / 86400000);
    return diffDays <= threshold;
  });
}

function taskHasSubtaskDueBetween(task, minDays, maxDays) {
  return (task.subtasks || []).some(s => {
    if (s.completed || !s.dueDate) return false;
    const d = parseDateString(s.dueDate);
    if (!d) return false;
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((d.getTime() - startOfToday().getTime()) / 86400000);
    return diffDays >= minDays && diffDays <= maxDays;
  });
}

function dueTodayOrOverdue(task) {
  return taskDueDays(task) <= 0 || taskHasSubtaskDueBetween(task, -999, 0);
}

function dueThisWeek(task) {
  return (taskDueDays(task) >= 1 && taskDueDays(task) <= 7) ||
    taskHasSubtaskDueBetween(task, 1, 7);
}

function dueNext14Days(task) {
  return (taskDueDays(task) >= 0 && taskDueDays(task) <= 14) ||
    taskHasSubtaskDueBetween(task, 0, 14);
}

function taskNeedsAttention(task) {
  if (!task || task.status === 'fullfort') return false;
  const days = taskDueDays(task);
  return days < 0 ||
    days <= 14 ||
    !task.assignedTo ||
    task.priority === 'høy' ||
    taskHasSoonSubtask(task);
}

function taskSignals(task) {
  if (!task || task.status === 'fullfort') return [];
  const days = taskDueDays(task);
  const signals = [];
  if (days < 0) signals.push({ key: 'overdue', label: 'Forfalt' });
  else if (days === 0) signals.push({ key: 'today', label: 'Frist i dag' });
  else if (days <= 7) signals.push({ key: 'soon', label: 'Denne uken' });
  else if (days <= 14) signals.push({ key: 'upcoming', label: 'Neste 14 d' });
  if (!task.assignedTo) signals.push({ key: 'unassigned', label: 'Ikke tildelt' });
  if (taskHasSoonSubtask(task)) signals.push({ key: 'subtask', label: 'Deloppgavefrist' });
  return signals;
}

function taskUrgencyScore(task) {
  if (!task || task.status === 'fullfort') return -1000;
  const days = taskDueDays(task);
  const priority = { høy: 30, medium: 16, lav: 6 }[task.priority] || 10;
  let due = 0;
  if (days < 0) due = 90 + Math.min(Math.abs(days), 30);
  else if (days === 0) due = 82;
  else if (days <= 3) due = 70 - days * 3;
  else if (days <= 7) due = 54 - days;
  else if (days <= 14) due = 34 - days * .5;
  else if (Number.isFinite(days)) due = Math.max(4, 20 - days * .15);
  const unassigned = task.assignedTo ? 0 : 38;
  const started = task.status === 'i_gang' ? 4 : 0;
  const subtaskDue = taskHasSoonSubtask(task) ? 18 : 0;
  return due + priority + unassigned + started + subtaskDue;
}

function compareTasksByUrgency(a, b) {
  if (a.status === 'fullfort' && b.status !== 'fullfort') return 1;
  if (b.status === 'fullfort' && a.status !== 'fullfort') return -1;
  const score = taskUrgencyScore(b) - taskUrgencyScore(a);
  if (score !== 0) return score;
  const due = taskDueDays(a) - taskDueDays(b);
  if (due !== 0) return due;
  const pOrd = { høy: 0, medium: 1, lav: 2 };
  return (pOrd[a.priority] ?? 1) - (pOrd[b.priority] ?? 1);
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

function activeCategories() {
  return state.categories.filter(c => c.active !== false);
}

function categoryForTask(task) {
  if (!task || !task.categoryId) return null;
  return state.categories.find(c => c.id === task.categoryId) || {
    id: task.categoryId,
    name: task.categoryName || 'Ukjent kategori',
    color: task.categoryColor || '#9CA3AF',
    active: true
  };
}

function categoryChipHtml(task) {
  const category = categoryForTask(task);
  if (!category) return '';
  const color = category.color || '#9CA3AF';
  return `
    <span class="category-chip" title="${esc(category.name)}">
      <span class="category-chip-dot" style="background:${esc(color)}"></span>
      <span class="category-chip-label">${esc(category.name)}</span>
    </span>`;
}

function subtaskProgress(subtasks) {
  if (!subtasks || subtasks.length === 0) return null;
  const done = subtasks.filter(s => s.completed).length;
  return { done, total: subtasks.length, pct: Math.round((done / subtasks.length) * 100) };
}

function parseDateString(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDateString(value) {
  const d = parseDateString(value);
  if (!d) return '';
  return d.toLocaleDateString('no-NO', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function subtaskDueClass(subtask) {
  if (!subtask || subtask.completed || !subtask.dueDate) return '';
  const d = parseDateString(subtask.dueDate);
  if (!d) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 3) return 'soon';
  return '';
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
  if (view) {
    view.classList.remove('hidden'); // fjern hidden-klasse om den fins
    view.classList.add('active');
  }

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

async function getAllowedUserFast(email) {
  let allowed = await checkAllowedUser(email);
  if (allowed) return allowed;

  // Første gangs oppsett: seed kun hvis allowlisten faktisk ser tom ut.
  await initializeAllowedUsers(INITIAL_USERS);
  return checkAllowedUser(email);
}

async function finishAppStartup(user, allowed) {
  if (state.user && state.user.uid === user.uid && state.unsubscribers.length === 0) {
    subscribeToRealtime();
  }

  try {
    await createOrUpdateUser(user.uid, {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: allowed.role,
    });

    const freshProfile = await getUser(user.uid);
    if (freshProfile && state.user && state.user.uid === user.uid) {
      state.profile = freshProfile;
      setupUI();
    }
  } catch (e) {
    console.error('Profile sync error:', e);
    showToast('Profilen kunne ikke oppdateres akkurat nå, men data lastes likevel.', 'error');
  }
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
    const allowed = await getAllowedUserFast(user.email);
    if (!allowed) {
      await auth.signOut();
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('login-error').textContent = 'Du har ikke tilgang til denne appen. Kontakt Admin.';
      document.getElementById('login-error').classList.remove('hidden');
      hideLoading();
      return;
    }

    state.user = user;
    state.profile = {
      id: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: allowed.role,
    };

    setupUI();

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    showView('dashboard');
    hideLoading();

    finishAppStartup(user, allowed);
  } catch (e) {
    console.error('Auth error:', e);
    // Vis login-siden igjen i stedet for blank side
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-error').textContent = 'Det oppstod en feil. Prøv å laste siden på nytt.';
    document.getElementById('login-error').classList.remove('hidden');
    hideLoading();
  } finally {
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
  const shownRealtimeErrors = new Set();
  const onRealtimeError = (area, message) => (e) => {
    console.error(`Realtime sync error (${area}):`, e);
    if (shownRealtimeErrors.has(area)) return;
    shownRealtimeErrors.add(area);
    showToast(message, 'error');
  };

  state.unsubscribers.push(
    subscribeToTasks(tasks => {
      state.tasks = tasks;
      if (state.currentView === 'dashboard') renderDashboard();
      if (state.currentView === 'tasks') renderTasksList();
    }, onRealtimeError('tasks', 'Kunne ikke laste oppgaver. Prøv å oppdatere appen.')),
    subscribeToUsers(users => {
      state.users = users;
      populateAssigneeSelects();
      if (state.currentView === 'admin') renderAdmin();
    }, onRealtimeError('users', 'Kunne ikke laste teammedlemmer. Prøv å oppdatere appen.')),
    subscribeToAllowedUsers(allowedUsers => {
      state.allowedUsers = allowedUsers;
      if (state.currentView === 'admin') renderAdmin();
    }, onRealtimeError('allowedUsers', 'Kunne ikke laste inviterte brukere. Prøv å oppdatere appen.')),
    subscribeToCategories(categories => {
      state.categories = categories;
      populateCategorySelects();
      if (state.currentView === 'dashboard') renderDashboard();
      if (state.currentView === 'tasks') renderTasksList();
      if (state.currentView === 'admin') renderAdmin();
    }, onRealtimeError('categories', 'Kategorier kunne ikke lastes. Firestore-reglene må trolig oppdateres.')),
    subscribeToNotifications(state.user.uid, notifs => {
      state.notifications = notifs;
      updateNotifBadge();
      if (state.currentView === 'notifications') renderNotifications();
    }, onRealtimeError('notifications', 'Kunne ikke laste varsler. Prøv å oppdatere appen.'))
  );
}

// ============================================================
// DASHBOARD
// ============================================================

function renderDashboard() {
  const tasks = state.tasks;
  const open = tasks.filter(t => t.status !== 'fullfort');
  const overdue = open.filter(t => taskDueDays(t) < 0);
  const today = open.filter(dueTodayOrOverdue);
  const week = open.filter(t => dueTodayOrOverdue(t) || dueThisWeek(t));
  const unassigned = open.filter(t => !t.assignedTo);
  const high = open.filter(t => t.priority === 'høy');
  const todayPriority = today.sort(compareTasksByUrgency);
  const weekPriority = week
    .filter(t => !todayPriority.some(todayTask => todayTask.id === t.id))
    .sort(compareTasksByUrgency);

  document.getElementById('stats-grid').innerHTML = `
    <button class="stat-card stat-overdue" type="button" onclick="openTasksWithQuickFilter('attention')">
      <div class="stat-number">${overdue.length}</div>
      <div class="stat-label">Forsinket</div>
    </button>
    <button class="stat-card stat-today" type="button" onclick="openTasksWithQuickFilter('today')">
      <div class="stat-number">${today.length}</div>
      <div class="stat-label">I dag</div>
    </button>
    <button class="stat-card stat-soon" type="button" onclick="openTasksWithQuickFilter('week')">
      <div class="stat-number">${week.length}</div>
      <div class="stat-label">Denne uken</div>
    </button>
    <button class="stat-card stat-unassigned" type="button" onclick="openTasksWithQuickFilter('unassigned')">
      <div class="stat-number">${unassigned.length}</div>
      <div class="stat-label">Uten ansvarlig</div>
    </button>
    <button class="stat-card stat-high" type="button" onclick="openTasksWithQuickFilter('high')">
      <div class="stat-number">${high.length}</div>
      <div class="stat-label">Høy prioritet</div>
    </button>
  `;

  renderPriorityGroups('today-priority-list', todayPriority, 'Ingen oppgaver eller deloppgaver har frist i dag');
  renderPriorityGroups('week-priority-list', weekPriority, 'Ingen flere oppgaver har frist denne uken');
  renderCompactList('unassigned-tasks-list', unassigned.sort(compareTasksByUrgency).slice(0, 6), 'Alle åpne oppgaver har ansvarlig');
  renderTeamWorkload(open);
}

function renderTeamWorkload(openTasks) {
  const el = document.getElementById('team-workload-list');
  if (!el) return;

  const assignedUsers = state.users.map(u => {
    const tasks = openTasks.filter(t => t.assignedTo === u.id);
    return {
      user: u,
      total: tasks.length,
      urgent: tasks.filter(taskNeedsAttention).length,
      soon: tasks.filter(t => taskDueDays(t) >= 0 && taskDueDays(t) <= 14).length,
    };
  }).filter(row => row.total > 0 || row.urgent > 0)
    .sort((a, b) => b.urgent - a.urgent || b.total - a.total);

  if (!assignedUsers.length) {
    el.innerHTML = `<div class="empty-state compact-empty"><p>Ingen åpne oppgaver er tildelt ennå</p></div>`;
    return;
  }

  el.innerHTML = assignedUsers.map(row => `
    <button class="workload-row" type="button" onclick="openTasksForAssignee('${row.user.id}')">
      ${row.user.photoURL
        ? `<img src="${esc(row.user.photoURL)}" class="workload-avatar" alt="" />`
        : `<span class="workload-avatar">${initials(row.user.displayName || row.user.email)}</span>`}
      <span class="workload-person">
        <span class="workload-name">${esc(row.user.displayName || row.user.email)}</span>
        <span class="workload-meta">${row.total} åpne${row.soon ? ` · ${row.soon} snart` : ''}</span>
      </span>
      <span class="workload-count ${row.urgent ? 'has-risk' : ''}">${row.urgent}</span>
    </button>`).join('');
}

function renderCompactList(containerId, tasks, emptyMsg) {
  const el = document.getElementById(containerId);
  if (!tasks.length) {
    el.innerHTML = `<div class="empty-state compact-empty"><p>${emptyMsg}</p></div>`;
    return;
  }
  el.innerHTML = tasks.map(t => taskCardHtml(t, true)).join('');
}

function renderPriorityGroups(containerId, tasks, emptyMsg) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!tasks.length) {
    el.innerHTML = `<div class="empty-state compact-empty"><p>${emptyMsg}</p></div>`;
    return;
  }

  const groups = [
    { key: 'høy', label: 'Høy prioritet' },
    { key: 'medium', label: 'Medium prioritet' },
    { key: 'lav', label: 'Lav prioritet' },
  ];

  el.innerHTML = groups.map(group => {
    const groupTasks = tasks.filter(t => t.priority === group.key).sort(compareTasksByUrgency);
    if (!groupTasks.length) return '';
    return `
      <div class="priority-group">
        <div class="priority-group-title">
          <span class="priority-dot ${group.key}"></span>
          <span>${group.label}</span>
          <span class="priority-group-count">${groupTasks.length}</span>
        </div>
        <div class="task-list-compact">
          ${groupTasks.map(t => taskCardHtml(t, true)).join('')}
        </div>
      </div>`;
  }).join('');
}

function openTasksWithQuickFilter(filter) {
  resetTaskFilters();
  state.quickFilter = filter || '';
  showView('tasks');
}

function openTasksForAssignee(userId) {
  resetTaskFilters();
  state.quickFilter = '';
  const assigneeEl = document.getElementById('filter-assignee');
  if (assigneeEl) assigneeEl.value = userId;
  showView('tasks');
}

function resetTaskFilters() {
  ['filter-status', 'filter-priority', 'filter-assignee', 'filter-category'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const searchEl = document.getElementById('task-search');
  if (searchEl) searchEl.value = '';
}

function setQuickFilter(filter) {
  state.quickFilter = filter || '';
  renderTasksList();
}

function updateQuickFilterButtons() {
  document.querySelectorAll('.quick-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.quickFilter === state.quickFilter);
  });
}

// ============================================================
// TASK CARDS HTML
// ============================================================

function taskCardHtml(task, compact = false) {
  const prog = subtaskProgress(task.subtasks);
  const dateClass = dueDateClass(task.dueDate);
  const assignee = state.users.find(u => u.id === task.assignedTo);
  const isDone = task.status === 'fullfort';
  const canQuickChange = canEdit() || (state.user && task.assignedTo === state.user.uid);
  const checkBtn = canQuickChange ? `
    <button class="task-check-btn${isDone ? ' checked' : ''}"
            onclick="quickStatusChange('${task.id}','${isDone ? 'i_gang' : 'fullfort'}',event)"
            title="${isDone ? 'Angre fullføring' : 'Marker som fullført'}">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>` : '';
  const undoDoneBtn = canQuickChange && isDone ? `
    <button class="task-undo-btn" onclick="quickStatusChange('${task.id}','i_gang',event)" title="Angre fullført">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>
      Angre fullført
    </button>` : '';

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
    </span>` : `<span class="unassigned-chip">Ikke tildelt</span>`;

  const relativeDue = dueDateRelativeLabel(task);
  const dueDateHtml = task.dueDate ? `
    <span class="due-date ${dateClass}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      ${formatDate(task.dueDate)}${relativeDue ? ` · ${relativeDue}` : ''}
    </span>` : '';
  const categoryHtml = categoryChipHtml(task);
  const signalHtml = taskSignals(task).map(s => `<span class="risk-badge ${s.key}">${s.label}</span>`).join('');

  if (compact) {
    return `
      <div class="task-card priority-${task.priority} ${isDone ? 'done' : ''}" data-task-id="${task.id}" onclick="openTaskModal('${task.id}')">
        <div class="task-card-top">
          ${checkBtn}
          <span class="task-card-title">${esc(task.title)}</span>
          <span class="status-badge ${task.status}">${statusLabel(task.status)}</span>
        </div>
        <div class="task-card-meta">
          ${signalHtml}
          ${categoryHtml}
          ${assigneeHtml}
          ${dueDateHtml}
          ${undoDoneBtn}
        </div>
        ${progressHtml}
      </div>`;
  }

  return `
    <div class="task-card-full priority-${task.priority} ${isDone ? 'done' : ''}" data-task-id="${task.id}" onclick="openTaskModal('${task.id}')">
      <div class="task-row-top">
        ${checkBtn}
        <div class="task-title-row">
          <div class="task-title">${esc(task.title)}</div>
          ${task.description ? `<div class="task-desc">${esc(task.description)}</div>` : ''}
        </div>
      </div>
      <div class="task-row-bottom">
        ${signalHtml}
        ${categoryHtml}
        <span class="status-badge ${task.status}">${statusLabel(task.status)}</span>
        <span class="priority-badge ${task.priority}">
          <span class="priority-dot ${task.priority}"></span>
          ${priorityLabel(task.priority)}
        </span>
        ${assigneeHtml}
        ${dueDateHtml}
        ${prog ? `<span style="font-size:.75rem;color:var(--text-2)">${prog.done}/${prog.total} deloppgaver</span>` : ''}
        ${undoDoneBtn}
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
  const category = document.getElementById('filter-category').value;
  const search   = (document.getElementById('task-search').value || '').toLowerCase();
  updateQuickFilterButtons();

  let tasks = [...state.tasks];
  if (status)   tasks = tasks.filter(t => t.status === status);
  if (priority) tasks = tasks.filter(t => t.priority === priority);
  if (assignee === '__unassigned') tasks = tasks.filter(t => !t.assignedTo);
  else if (assignee) tasks = tasks.filter(t => t.assignedTo === assignee);
  if (category) tasks = tasks.filter(t => t.categoryId === category);
  if (search)   tasks = tasks.filter(t =>
    t.title.toLowerCase().includes(search) ||
    (t.description || '').toLowerCase().includes(search) ||
    (t.categoryName || '').toLowerCase().includes(search));

  if (state.quickFilter === 'attention') tasks = tasks.filter(t => t.status !== 'fullfort' && (dueTodayOrOverdue(t) || dueThisWeek(t) || !t.assignedTo || t.priority === 'høy'));
  if (state.quickFilter === 'today') tasks = tasks.filter(t => t.status !== 'fullfort' && dueTodayOrOverdue(t));
  if (state.quickFilter === 'week') tasks = tasks.filter(t => t.status !== 'fullfort' && (dueTodayOrOverdue(t) || dueThisWeek(t)));
  if (state.quickFilter === 'unassigned') tasks = tasks.filter(t => t.status !== 'fullfort' && !t.assignedTo);
  if (state.quickFilter === 'soon') tasks = tasks.filter(t => t.status !== 'fullfort' && dueNext14Days(t));
  if (state.quickFilter === 'mine') tasks = tasks.filter(t => t.status !== 'fullfort' && t.assignedTo === state.user.uid);
  if (state.quickFilter === 'high') tasks = tasks.filter(t => t.status !== 'fullfort' && t.priority === 'høy');

  tasks.sort(compareTasksByUrgency);

  const el = document.getElementById('tasks-list');
  if (!tasks.length) {
    const hasFilters = document.getElementById('filter-status').value ||
                       document.getElementById('filter-priority').value ||
                       document.getElementById('filter-assignee').value ||
                       document.getElementById('filter-category').value ||
                       document.getElementById('task-search').value ||
                       state.quickFilter;
    el.innerHTML = hasFilters
      ? `<div class="empty-state">
           <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
           <strong>Ingen treff</strong>
           <p>Ingen oppgaver matcher filteret ditt. Prøv å endre søk eller filter.</p>
         </div>`
      : `<div class="empty-state">
           <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
           <strong>Ingen oppgaver ennå</strong>
           <p>Kom i gang ved å opprette den første oppgaven for teamet.</p>
           ${canEdit() ? `<button class="btn btn-primary" onclick="openTaskModal()">+ Opprett første oppgave</button>` : ''}
         </div>`;
    return;
  }
  el.innerHTML = tasks.map(t => taskCardHtml(t, false)).join('');
}

function populateAssigneeSelects() {
  const opts = ['<option value="">Alle ansvarlige</option>',
    '<option value="__unassigned">Uten ansvarlig</option>',
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

function populateCategorySelects() {
  const active = activeCategories();

  const filterOpts = ['<option value="">Alle kategorier</option>',
    ...state.categories.map(c => `<option value="${c.id}">${c.active === false ? 'Skjult: ' : ''}${esc(c.name)}</option>`)
  ].join('');
  const filterEl = document.getElementById('filter-category');
  if (filterEl) {
    const currentFilter = filterEl.value;
    filterEl.innerHTML = filterOpts;
    if (currentFilter && state.categories.some(c => c.id === currentFilter)) {
      filterEl.value = currentFilter;
    }
  }

  const formOpts = ['<option value="">Ingen kategori</option>',
    ...active.map(c => `<option value="${c.id}">${esc(c.name)}</option>`)
  ].join('');
  const formEl = document.getElementById('task-category');
  if (!formEl) return;

  const currentValue = formEl.value;
  formEl.innerHTML = formOpts;
  if (currentValue && state.categories.some(c => c.id === currentValue)) {
    if (!active.some(c => c.id === currentValue)) {
      const current = state.categories.find(c => c.id === currentValue);
      formEl.insertAdjacentHTML('beforeend', `<option value="${current.id}">Skjult: ${esc(current.name)}</option>`);
    }
    formEl.value = currentValue;
  }
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
    if (!task) {
      showToast('Oppgaven finnes ikke lenger.', 'error');
      closeTaskModal();
      return;
    }
    document.getElementById('modal-title').textContent = task.title;
    state.activeTaskDetailsUpdatedAt = task.detailsUpdatedAt || task.updatedAt || null;
    fillTaskForm(task);
    updateStatusStepper(task.status);
    updateModalButtons(task);
    renderSubtasks(task.subtasks || []);
    renderSubtaskTimeline(task.subtasks || []);
    startCommentListener(taskId);
  } else {
    document.getElementById('modal-title').textContent = 'Ny oppgave';
    document.getElementById('task-form').reset();
    document.getElementById('task-id').value = '';
    state.activeTaskDetailsUpdatedAt = null;
    document.getElementById('subtasks-list').innerHTML = '';
    renderSubtaskTimeline([]);
    document.getElementById('comments-list').innerHTML = '';
    updateStatusStepper('ikke_startet');
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
  state.activeTaskDetailsUpdatedAt = null;
}

function fillTaskForm(task) {
  document.getElementById('task-id').value = task.id;
  document.getElementById('task-title').value = task.title || '';
  document.getElementById('task-description').value = task.description || '';
  document.getElementById('task-priority').value = task.priority || 'medium';
  const categoryEl = document.getElementById('task-category');
  const hasCategoryOption = categoryEl && Array.from(categoryEl.options).some(opt => opt.value === task.categoryId);
  if (categoryEl && task.categoryId && !hasCategoryOption) {
    categoryEl.insertAdjacentHTML('beforeend', `<option value="${esc(task.categoryId)}">Skjult: ${esc(task.categoryName || 'Ukjent kategori')}</option>`);
  }
  if (categoryEl) categoryEl.value = task.categoryId || '';
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
  const undoBtn   = document.getElementById('btn-undo-complete');
  const saveBtn   = document.getElementById('btn-save-task');
  const cancelBtn = document.getElementById('btn-cancel-task');

  deleteBtn.classList.toggle('hidden', !task || !canEdit());
  undoBtn.classList.toggle('hidden', !task || task.status !== 'fullfort' || !(canEdit() || task.assignedTo === state.user.uid));
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
  ['task-title','task-description','task-priority','task-category','task-assignee','task-start-date','task-due-date','task-dependencies']
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
  const categoryId = document.getElementById('task-category').value;
  const status    = document.getElementById('task-status').value;
  const assigneeId = document.getElementById('task-assignee').value;
  const startStr  = document.getElementById('task-start-date').value;
  const dueStr    = document.getElementById('task-due-date').value;
  const deps      = document.getElementById('task-dependencies').value.trim();

  const assignee = state.users.find(u => u.id === assigneeId);
  const category = state.categories.find(c => c.id === categoryId);

  const data = {
    title,
    description: desc,
    priority,
    categoryId: categoryId || null,
    categoryName: category ? category.name : null,
    categoryColor: category ? category.color : null,
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
        await updateTaskIfUnchanged(taskId, data, state.activeTaskDetailsUpdatedAt);
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
    if (e.message === 'TASK_CHANGED') {
      showToast('Oppgaven ble endret av noen andre. Åpne den på nytt og lagre igjen.', 'error');
    } else {
      showToast('Feil ved lagring. Prøv igjen.', 'error');
    }
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
  document.querySelectorAll('.tab-pane').forEach(p => {
    const isActive = p.id === `tab-${name}`;
    p.classList.toggle('active', isActive);
    if (isActive) p.classList.remove('hidden'); // fjern hidden-klasse som blokkerer display
  });
}

// ============================================================
// SUBTASKS
// ============================================================

function renderSubtaskTimeline(subtasks) {
  const el = document.getElementById('subtask-timeline');
  if (!el) return;

  if (!subtasks || subtasks.length === 0) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }

  const progress = subtaskProgress(subtasks);
  const withDates = subtasks
    .filter(s => s.dueDate)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const next = withDates.find(s => !s.completed);
  const overdue = subtasks.filter(s => subtaskDueClass(s) === 'overdue').length;

  const rows = subtasks.map((s, i) => {
    const dueClass = subtaskDueClass(s);
    const stateLabel = s.completed ? 'Fullført' : dueClass === 'overdue' ? 'Forfalt' : dueClass === 'soon' ? 'Snart' : s.dueDate ? formatDateString(s.dueDate) : 'Ingen frist';
    return `
      <div class="subtask-timeline-row ${s.completed ? 'done' : ''} ${dueClass}">
        <div class="subtask-timeline-main">
          <span class="subtask-timeline-index">${i + 1}</span>
          <span class="subtask-timeline-title">${esc(s.title)}</span>
        </div>
        <span class="subtask-timeline-date">${stateLabel}</span>
      </div>`;
  }).join('');

  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="subtask-progress-card">
      <div class="subtask-progress-head">
        <div>
          <div class="subtask-progress-title">Deloppgaver</div>
          <div class="subtask-progress-subtitle">
            ${progress.done} av ${progress.total} fullført${next ? ` · neste frist ${formatDateString(next.dueDate)}` : ''}
          </div>
        </div>
        ${overdue ? `<span class="subtask-alert">${overdue} forfalt</span>` : ''}
      </div>
      <div class="progress-bar-wrap subtask-main-progress">
        <div class="progress-bar-fill" style="width:${progress.pct}%"></div>
      </div>
      <div class="subtask-timeline-rows">${rows}</div>
    </div>`;
}

function renderSubtasks(subtasks) {
  const el = document.getElementById('subtasks-list');
  const countEl = document.getElementById('subtasks-tab-count');
  if (!subtasks.length) {
    el.innerHTML = '<p style="color:var(--text-3);font-size:.875rem;text-align:center;padding:20px 0">Ingen deloppgaver ennå</p>';
    countEl.textContent = '';
    renderSubtaskTimeline([]);
    return;
  }
  const done = subtasks.filter(s => s.completed).length;
  countEl.textContent = `${done}/${subtasks.length}`;

  el.innerHTML = subtasks.map((s, i) => `
    <div class="subtask-item ${subtaskDueClass(s)}">
      <input type="checkbox" class="subtask-checkbox" ${s.completed ? 'checked' : ''}
        onchange="toggleSubtask(${i}, this.checked)" />
      <div class="subtask-content">
        <span class="subtask-title ${s.completed ? 'done' : ''}">${esc(s.title)}</span>
        <div class="subtask-meta">
          ${s.dueDate ? `<span class="subtask-due ${subtaskDueClass(s)}">${formatDateString(s.dueDate)}${subtaskDueClass(s) === 'overdue' ? ' · Forfalt' : subtaskDueClass(s) === 'soon' ? ' · Snart' : ''}</span>` : '<span class="subtask-due muted">Ingen frist</span>'}
        </div>
      </div>
      ${canEdit() ? `<input type="date" class="subtask-date-input" value="${esc(s.dueDate || '')}" onchange="updateSubtaskDueDate(${i}, this.value)" aria-label="Frist for ${esc(s.title)}" />` : ''}
      ${canEdit() ? `<button class="btn-remove-subtask" onclick="removeSubtask(${i})" title="Fjern">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>` : ''}
    </div>`).join('');

  document.getElementById('add-subtask-wrap').classList.toggle('hidden', !canEdit());
  renderSubtaskTimeline(subtasks);
}

async function toggleSubtask(index, completed) {
  const taskId = state.activeTaskId;
  if (!taskId) return;
  const subtasks = await updateSubtasksSafely(taskId, current => {
    const next = [...current];
    if (!next[index]) return current;
    next[index] = { ...next[index], completed };
    return next;
  });
  renderSubtasks(subtasks);
  // Update progress in task card if dashboard/tasks view visible
  if (state.currentView === 'dashboard') renderDashboard();
  if (state.currentView === 'tasks') renderTasksList();
}

async function handleAddSubtask() {
  const input = document.getElementById('new-subtask-input');
  const dueInput = document.getElementById('new-subtask-due-date');
  const title = input.value.trim();
  if (!title) return;
  const taskId = state.activeTaskId;
  if (!taskId) return;
  const subtasks = await updateSubtasksSafely(taskId, current => [
    ...current,
    { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title, completed: false, dueDate: dueInput.value || null }
  ]);
  input.value = '';
  dueInput.value = '';
  renderSubtasks(subtasks);
}

async function updateSubtaskDueDate(index, dueDate) {
  const taskId = state.activeTaskId;
  if (!taskId || !canEdit()) return;
  const subtasks = await updateSubtasksSafely(taskId, current => {
    const next = [...current];
    if (!next[index]) return current;
    next[index] = { ...next[index], dueDate: dueDate || null };
    return next;
  });
  renderSubtasks(subtasks);
}

async function removeSubtask(index) {
  const taskId = state.activeTaskId;
  if (!taskId) return;
  const subtasks = await updateSubtasksSafely(taskId, current => current.filter((_, i) => i !== index));
  renderSubtasks(subtasks);
}

// ============================================================
// QUICK STATUS CHANGE
// ============================================================

// Klikk på check-sirkel direkte på oppgavekortet
async function quickStatusChange(taskId, newStatus, event) {
  if (event) event.stopPropagation();
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (!canEdit() && task.assignedTo !== state.user.uid) return;
  try {
    await updateTask(taskId, { status: newStatus });
    if (newStatus === 'fullfort') {
      showToast('✓ Oppgave fullført!');
      if (task.createdBy && task.createdBy !== state.user.uid) {
        await createNotification(task.createdBy, {
          type: 'status_changed', taskId, taskTitle: task.title,
          message: `"${task.title}" er nå markert som fullført`,
        });
      }
    } else {
      showToast(task.status === 'fullfort' ? 'Fullføring angret' : 'Status oppdatert');
    }
  } catch(e) {
    showToast('Feil ved oppdatering.', 'error');
  }
}

// Klikk på et steg i status-stepperen inne i modal
async function quickSetStatus(newStatus) {
  const sel = document.getElementById('task-status');
  if (sel) sel.value = newStatus;
  updateStatusStepper(newStatus);
  if (!state.activeTaskId) return; // ny oppgave: bare sett form-verdi

  const task = state.tasks.find(t => t.id === state.activeTaskId);
  if (!task) return;
  if (!canEdit() && task.assignedTo !== state.user.uid) return;
  try {
    await updateTask(state.activeTaskId, { status: newStatus });
    if (newStatus === 'fullfort') showToast('✓ Oppgave fullført!');
    else showToast(task.status === 'fullfort' ? 'Fullføring angret' : 'Status oppdatert');
  } catch(e) {
    showToast('Feil ved statusoppdatering.', 'error');
  }
}

async function handleUndoComplete() {
  if (!state.activeTaskId) return;
  await quickSetStatus('i_gang');
}

// Bygg/oppdater status-stepperen øverst i modal-detaljfanen
function updateStatusStepper(currentStatus) {
  const stepper = document.getElementById('status-stepper');
  if (!stepper) return;
  const steps = [
    { key: 'ikke_startet', label: 'Ikke startet' },
    { key: 'i_gang',       label: 'I gang'        },
    { key: 'fullfort',     label: 'Fullført'       },
  ];
  const curIdx = steps.findIndex(s => s.key === currentStatus);
  const canChange = canEdit() || (state.activeTaskId &&
    state.tasks.find(t => t.id === state.activeTaskId)?.assignedTo === state.user?.uid);

  stepper.innerHTML = steps.map((s, i) => `
    <button class="status-step${currentStatus === s.key ? ' active' : ''}${i < curIdx ? ' past' : ''}"
            data-status="${s.key}"
            onclick="quickSetStatus('${s.key}')"
            ${!canChange ? 'disabled' : ''}>
      <span class="step-circle">
        ${i < curIdx ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
      </span>
      <span class="step-label">${s.label}</span>
    </button>
    ${i < steps.length - 1 ? `<div class="step-line${i < curIdx ? ' filled' : ''}"></div>` : ''}
  `).join('');
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
  // Oppdater versjon-UI
  const verEl = document.getElementById('app-version-display');
  if (verEl) verEl.textContent = `v${APP_VERSION}`;
  updateAdminUpdateUI();

  document.getElementById('add-user-card')?.classList.toggle('hidden', !isAdmin());
  updateInviteLinkUI();

  const el = document.getElementById('users-list');
  const users = adminTeamMembers();
  if (!users.length) {
    el.innerHTML = '<p style="color:var(--text-2);font-size:.875rem">Ingen brukere ennå</p>';
    renderCategoriesAdmin();
    return;
  }

  el.innerHTML = users.map(u => `
    <div class="user-item ${u.pending ? 'pending' : ''}">
      ${u.photoURL
        ? `<img src="${esc(u.photoURL)}" class="user-item-avatar" alt="" />`
        : `<div class="user-item-avatar">${initials(u.displayName || u.email)}</div>`}
      <div class="user-item-info">
        <div class="user-item-name">${esc(u.displayName || u.email)}</div>
        <div class="user-item-email">${esc(u.email)}${u.pending ? ' · Invitert' : ''}</div>
      </div>
      <div class="user-item-actions">
        ${u.pending ? '<span class="pending-user-badge">Invitert</span>' : ''}
        ${isAdmin() ? `
          <select class="role-select" onchange="handleRoleChange('${u.userId || ''}', '${u.email}', this.value, ${u.pending ? 'true' : 'false'})">
            <option value="admin"     ${u.role==='admin'     ?'selected':''}>Admin</option>
            <option value="teamleder" ${u.role==='teamleder' ?'selected':''}>Teamleder</option>
            <option value="medlem"    ${u.role==='medlem'    ?'selected':''}>Medlem</option>
          </select>
          ${u.userId !== state.user.uid ? `
          <button class="btn-icon-danger" onclick="handleRemoveUser('${u.userId || ''}','${u.email}', ${u.pending ? 'true' : 'false'})" title="Fjern bruker">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>` : ''}
        ` : `<span class="role-badge ${u.role}">${roleLabel(u.role)}</span>`}
      </div>
    </div>`).join('');

  renderCategoriesAdmin();
}

function adminTeamMembers() {
  const byEmail = new Map();

  state.users.forEach(user => {
    const email = (user.email || '').toLowerCase();
    if (!email) return;
    byEmail.set(email, {
      ...user,
      userId: user.id,
      pending: false
    });
  });

  state.allowedUsers.forEach(allowed => {
    const email = (allowed.email || '').toLowerCase();
    if (!email || byEmail.has(email)) return;
    byEmail.set(email, {
      id: allowed.id,
      userId: '',
      email,
      displayName: allowed.email,
      photoURL: '',
      role: allowed.role,
      pending: true
    });
  });

  return Array.from(byEmail.values()).sort((a, b) => {
    if (a.pending !== b.pending) return a.pending ? 1 : -1;
    return (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '', 'no');
  });
}

function getAppShareLink() {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/index\.html$/, '/');
  return url.toString();
}

function updateInviteLinkUI() {
  const input = document.getElementById('invite-link-input');
  if (!input) return;
  input.value = getAppShareLink();
}

async function handleCopyInviteLink() {
  const link = getAppShareLink();
  const input = document.getElementById('invite-link-input');

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(link);
    } else {
      input.value = link;
      input.focus();
      input.select();
      document.execCommand('copy');
      input.blur();
    }
    showToast('Link kopiert');
  } catch(e) {
    console.error('Copy invite link error:', e);
    showToast('Kunne ikke kopiere linken automatisk. Marker og kopier linken manuelt.', 'error');
  }
}

function renderCategoriesAdmin() {
  const el = document.getElementById('categories-list');
  if (!el) return;

  if (!state.categories.length) {
    el.innerHTML = '<p style="color:var(--text-2);font-size:.875rem">Ingen kategorier ennå</p>';
    return;
  }

  el.innerHTML = state.categories.map(c => `
    <div class="category-item ${c.active === false ? 'inactive' : ''}">
      <span class="category-swatch" style="background:${esc(c.color || '#FF5A5F')}"></span>
      <input class="category-name-input" value="${esc(c.name)}"
        onchange="handleCategoryNameChange('${c.id}', this.value)"
        ${!canEdit() ? 'disabled' : ''}
        aria-label="Kategorinavn" />
      <div class="category-actions">
        <input type="color" class="category-list-color" value="${esc(c.color || '#FF5A5F')}"
          onchange="handleCategoryColorChange('${c.id}', this.value)"
          ${!canEdit() ? 'disabled' : ''}
          aria-label="Kategorifarge" />
        <button class="btn btn-secondary category-status-btn" type="button"
          onclick="handleCategoryActiveToggle('${c.id}', ${c.active === false ? 'true' : 'false'})"
          ${!canEdit() ? 'disabled' : ''}>
          ${c.active === false ? 'Aktiver' : 'Skjul'}
        </button>
        <button class="btn-icon-danger category-delete-btn" type="button"
          onclick="handleDeleteCategory('${c.id}')"
          title="Slett kategori"
          aria-label="Slett kategori"
          ${!canEdit() ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>`).join('');
}

function toggleCategoryPanel() {
  document.getElementById('category-admin-panel')?.classList.toggle('hidden');
}

async function handleAddCategory(e) {
  e.preventDefault();
  const nameEl = document.getElementById('new-category-name');
  const colorEl = document.getElementById('new-category-color');
  const name = nameEl.value.trim();
  if (!name) return;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    await createCategory({ name, color: colorEl.value });
    nameEl.value = '';
    colorEl.value = '#FF5A5F';
    showToast('Kategori lagt til');
  } catch(e) {
    console.error('Category create error:', e);
    const message = e && e.code === 'permission-denied'
      ? 'Kunne ikke lagre kategori. Firestore-reglene må oppdateres først.'
      : 'Feil ved lagring av kategori.';
    showToast(message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function handleCategoryNameChange(categoryId, name) {
  const trimmed = name.trim();
  if (!trimmed) {
    renderCategoriesAdmin();
    return;
  }
  try {
    await updateCategory(categoryId, { name: trimmed });
    showToast('Kategori oppdatert');
  } catch(e) {
    showToast('Feil ved oppdatering av kategori.', 'error');
  }
}

async function handleCategoryColorChange(categoryId, color) {
  try {
    await updateCategory(categoryId, { color });
    showToast('Kategorifarge oppdatert');
  } catch(e) {
    showToast('Feil ved oppdatering av farge.', 'error');
  }
}

async function handleCategoryActiveToggle(categoryId, active) {
  try {
    await updateCategory(categoryId, { active });
    showToast(active ? 'Kategori aktivert' : 'Kategori skjult');
  } catch(e) {
    showToast('Feil ved oppdatering av kategori.', 'error');
  }
}

async function handleDeleteCategory(categoryId) {
  const category = state.categories.find(c => c.id === categoryId);
  const name = category ? category.name : 'denne kategorien';
  const inUse = state.tasks.some(t => t.categoryId === categoryId);
  const warning = inUse
    ? `Kategorien "${name}" er brukt på én eller flere oppgaver. Hvis du sletter den, vil disse oppgavene miste kategorivisningen. Er du sikker?`
    : `Er du sikker på at du vil slette kategorien "${name}"? Dette kan ikke angres.`;
  const confirmed = await showConfirm('Slett kategori', warning);
  if (!confirmed) return;

  try {
    await deleteCategory(categoryId);
    showToast('Kategori slettet');
  } catch(e) {
    console.error('Category delete error:', e);
    showToast('Feil ved sletting av kategori.', 'error');
  }
}

async function handleAddUser(e) {
  e.preventDefault();
  if (!isAdmin()) {
    showToast('Du må være Admin for å legge til brukere.', 'error');
    return;
  }

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
    console.error('Add user error:', err);
    const message = err && err.code === 'permission-denied'
      ? 'Kunne ikke legge til bruker. Sjekk at du er Admin og at Firestore-reglene er oppdatert.'
      : 'Feil ved tillegging av bruker.';
    showToast(message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function handleRoleChange(uid, email, newRole, pending = false) {
  try {
    if (!pending && uid) await updateUserRole(uid, newRole);
    await updateAllowedUserRole(email, newRole);
    showToast('Rolle oppdatert');
  } catch(e) {
    showToast('Feil ved rolleendring.', 'error');
  }
}

async function handleRemoveUser(uid, email, pending = false) {
  const confirmed = await showConfirm('Fjern bruker', `Er du sikker på at du vil fjerne tilgangen til ${email}?`);
  if (!confirmed) return;
  try {
    if (!pending && uid) await removeUser(uid);
    await removeAllowedUser(email);
    showToast('Bruker fjernet');
  } catch(e) {
    showToast('Feil ved fjerning av bruker.', 'error');
  }
}

// ============================================================
// APP-OPPDATERING
// ============================================================

async function handleUpdateApp() {
  const btn = document.getElementById('btn-update-app');
  if (btn) { btn.disabled = true; btn.textContent = 'Oppdaterer…'; }

  try {
    if (swRegistration && swRegistration.waiting) {
      // Aktivér ventende service worker → controllerchange → reload
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // Ingen ventende SW: tøm cache manuelt og last på nytt
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      const regs = 'serviceWorker' in navigator
        ? await navigator.serviceWorker.getRegistrations()
        : [];
      await Promise.all(regs.map(reg => reg.update().catch(() => {})));
      window.location.href = `${window.location.pathname}?v=${Date.now()}${window.location.hash || ''}`;
    }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Oppdater app'; }
    showToast('Feil ved oppdatering. Prøv å laste siden på nytt manuelt.', 'error');
  }
}

function updateAdminUpdateUI() {
  const badge = document.getElementById('update-available-badge');
  const btn   = document.getElementById('btn-update-app');
  if (badge) badge.classList.toggle('hidden', !swUpdateWaiting);
  if (btn && swUpdateWaiting) {
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-secondary');
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Register service worker med oppdateringsdeteksjon
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').then(reg => {
      swRegistration = reg;

      // Sjekk om det allerede ligger en ny SW og venter
      if (reg.waiting) {
        swUpdateWaiting = true;
        updateAdminUpdateUI();
      }

      // Lytt etter nye versjoner
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            swUpdateWaiting = true;
            updateAdminUpdateUI();
            showToast('Ny versjon tilgjengelig! Gå til Administrasjon for å oppdatere.', 'info');
          }
        });
      });

      // Sjekk for oppdateringer ved oppstart (én gang)
      reg.update().catch(() => {});
    }).catch(() => {});

    // Når ny SW overtar kontrollen → last siden på nytt
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
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
  document.getElementById('btn-undo-complete').addEventListener('click', handleUndoComplete);

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
  document.getElementById('btn-copy-invite-link').addEventListener('click', handleCopyInviteLink);
  document.getElementById('btn-toggle-categories').addEventListener('click', toggleCategoryPanel);
  document.getElementById('add-category-form').addEventListener('submit', handleAddCategory);

  // Filters + search
  ['filter-status','filter-priority','filter-assignee','filter-category'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderTasksList);
  });
  document.getElementById('task-search').addEventListener('input', renderTasksList);
  document.querySelectorAll('.quick-filter').forEach(btn => {
    btn.addEventListener('click', () => setQuickFilter(btn.dataset.quickFilter || ''));
  });

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
