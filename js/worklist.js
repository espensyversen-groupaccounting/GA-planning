// Shared dashboard/task ordering: workRank belongs to a person, never to a time/priority group.
const DASHBOARD_RANK_SECTIONS = ['overdue-today-list', 'next-seven-list', 'in-progress-list', 'later-list'];
let rankDrag = null;
let rankSaving = false;
let rankRenderPending = false;
let rankScrollFrame = null;
let rankClickUntil = 0;

function dashboardRankingAvailable() {
  return state.dashboardScope === 'mine' && canEdit() && !state.dashboardFilter;
}
function deferRankRender() {
  if (!rankSaving && !rankDrag) return false;
  rankRenderPending = true;
  return true;
}
function rankEntryKey(entry) { return entry.type + ':' + entry.item.id; }
function rankValue(entry, personId = state.user?.uid) {
  const rank = entry.item.workRank?.[personId];
  return Number.isFinite(rank) ? rank : null;
}
function compareDashboardRanks(a, b, personId = state.user?.uid) {
  const before = rankValue(a, personId), after = rankValue(b, personId);
  if (before !== null && after !== null) {
    return before - after || String(a.item.title || '').localeCompare(String(b.item.title || ''), 'nb') ||
      rankEntryKey(a).localeCompare(rankEntryKey(b));
  }
  if (before !== null || after !== null) return before !== null ? -1 : 1;
  return compareTasksByUrgency(a.item, b.item);
}
function rankHandleHtml(entry) {
  return '<button type="button" class="dashboard-rank-handle" data-dashboard-rank-handle title="Endre rekkefølge" aria-pressed="false" aria-label="' +
    esc('Flytt ' + entry.item.title + ' i rekkefølgen') +
    '"><svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="4" r="1.4"/><circle cx="11" cy="4" r="1.4"/><circle cx="5" cy="9" r="1.4"/><circle cx="11" cy="9" r="1.4"/><circle cx="5" cy="14" r="1.4"/><circle cx="11" cy="14" r="1.4"/></svg></button>';
}
function dashboardRankGroupEntries(section, priority) {
  const entries = dashboardEntries(
    scopedTasks().filter(item => !item.deletedAt && !isDoneItem(item)),
    scopedTodos().filter(item => !item.deletedAt && !isDoneItem(item))
  );
  const sections = { 'overdue-today-list': 'overdueToday', 'next-seven-list': 'nextSeven',
    'in-progress-list': 'inProgress', 'later-list': 'later' };
  return entries.filter(entry => {
    const candidate = section === 'later-list' && state.dashboardLaterExpanded && entry.section !== 'later'
      ? extendedLaterEntry(entry) : entry;
    if (candidate !== entry && entry.item.status === 'til_review') return false;
    return candidate && candidate.section === sections[section] && (entry.item.priority || 'medium') === priority;
  });
}
function rankItems(list) {
  return [...list.children].filter(el => el.matches('.dashboard-item'));
}
function rankDomKey(card) {
  return card.dataset.dashboardItemType + ':' + card.dataset.dashboardItemId;
}
function rankAnnounce(list, card, context) {
  const items = [...list.children].filter(el => el.matches('.dashboard-item, .dashboard-rank-placeholder'));
  document.getElementById(context?.liveId || 'dashboard-rank-live').textContent =
    'Plass ' + (items.indexOf(card) + 1) + ' av ' + items.length;
}
function flushRankRender() {
  rankRenderPending = false;
  if (state.currentView === 'tasks') renderTasksList();
  else if (state.currentView === 'dashboard') renderDashboard();
}
function focusRankHandle(section, key) {
  if (!key) return;
  const [type, ...id] = key.split(':');
  document.querySelector('#' + section + ' [data-dashboard-item-type="' + type +
    '"][data-dashboard-item-id="' + CSS.escape(id.join(':')) + '"] [data-dashboard-rank-handle]')?.focus({ preventScroll: true });
}
function localRank(change, personId) {
  const item = state[change.type].find(item => item.id === change.id);
  if (!item) return;
  item.workRank = { ...(item.workRank || {}) };
  if (change.rank === null) delete item.workRank[personId];
  else item.workRank[personId] = change.rank;
}
function rankChange(entry, rank) {
  return { type: entry.type === 'task' ? 'tasks' : 'todos', id: entry.item.id, rank };
}

function rankChanges(ordered, key, personId = state.user?.uid) {
  const index = ordered.findIndex(entry => rankEntryKey(entry) === key);
  if (index < 0) throw new Error('Oppgaven er endret. Se over rekkefølgen og prøv igjen.');
  const ranked = entry => rankValue(entry, personId) !== null;
  const prefix = ordered.slice(0, index);
  const moved = ordered[index];
  const normalize = entries => entries.map((entry, i) => rankChange(entry, (i + 1) * 1000));
  if (prefix.every(ranked)) {
    const before = index ? rankValue(ordered[index - 1], personId) : null;
    const after = index + 1 < ordered.length ? rankValue(ordered[index + 1], personId) : null;
    const rank = before === null && after === null ? 1000 : before === null ? after - 1000 :
      after === null ? before + 1000 : before + (after - before) / 2;
    if (!Number.isFinite(rank) || (before !== null && rank - before < 0.001) ||
      (after !== null && after - rank < 0.001)) {
      return normalize(ordered.filter(entry => ranked(entry) || entry === moved));
    }
    return [rankChange(moved, rank)];
  }
  // Only the ranked prefix remains above the unranked part; exclude the moved old rank.
  const firstUnranked = prefix.findIndex(entry => !ranked(entry));
  const base = firstUnranked ? rankValue(ordered[firstUnranked - 1], personId) : 0;
  const promoted = ordered.slice(firstUnranked, index + 1);
  const changes = promoted.map((entry, i) => rankChange(entry, base + (i + 1) * 1000));
  if (changes.some((change, i) => !Number.isFinite(change.rank) ||
    change.rank <= (i ? changes[i - 1].rank : base))) return normalize(ordered.slice(0, index + 1));
  return changes;
}

async function saveGroupRanks(section, priority, keys, movedKey, reset = false, context = dashboardRankingContext(section, priority)) {
  if (!context.available() || rankSaving) { flushRankRender(); return; }
  const personId = context.personId;
  const fresh = context.getEntries();
  let changes;
  try {
    if (reset) changes = fresh.filter(entry => rankValue(entry, personId) !== null).map(entry => rankChange(entry, null));
    else {
      const ordered = keys.map(key => fresh.find(entry => rankEntryKey(entry) === key));
      if (fresh.length !== keys.length || ordered.some(entry => !entry) || new Set(keys).size !== keys.length) {
        throw new Error('Oppgaven er endret. Se over rekkefølgen og prøv igjen.');
      }
      changes = rankChanges(ordered, movedKey, personId);
    }
    if (changes.length > 500) throw new Error('Gruppen har mer enn 500 rangeringer som må endres. Ingen endringer er lagret.');
  } catch (error) {
    flushRankRender(); showToast(error.message, 'error'); return;
  }
  if (!changes.length) { flushRankRender(); return; }
  const old = changes.map(change => ({ ...change, rank: rankValue(fresh.find(entry =>
    entry.item.id === change.id && (entry.type === 'task' ? 'tasks' : 'todos') === change.type), personId) }));
  changes.forEach(change => localRank(change, personId));
  rankSaving = true;
  try {
    await writeWorkRanks(changes, personId);
  } catch (error) {
    old.forEach(change => localRank(change, personId));
    try {
      const actual = await readWorklistItems(changes);
      actual.forEach(entry => {
        const items = state[entry.type], index = items.findIndex(item => item.id === entry.id);
        if (index >= 0 && entry.data) items[index] = { id: entry.id, ...entry.data };
        else if (index >= 0) items.splice(index, 1);
      });
    } catch (readError) { console.warn('Kunne ikke hente rangeringen på nytt', readError); }
    showToast('Kunne ikke lagre rekkefølgen. ' + (error.message || 'Prøv igjen.'), 'error');
  } finally {
    rankSaving = false;
    flushRankRender();
    if (context.available() && state.currentView === context.view) focusRankHandle(section, movedKey);
  }
}
function beginGroupRankDrag(drag, keyboard = false) {
  drag.active = true; drag.keyboard = keyboard;
  drag.handle.setAttribute('aria-pressed', 'true');
  if (keyboard) drag.card.classList.add('dashboard-rank-moving');
  else {
    const rect = drag.card.getBoundingClientRect();
    drag.offsetX = drag.x - rect.left; drag.offsetY = drag.y - rect.top;
    drag.placeholder = document.createElement('div');
    drag.placeholder.className = 'dashboard-rank-placeholder';
    drag.placeholder.style.height = rect.height + 'px';
    drag.card.replaceWith(drag.placeholder);
    document.body.appendChild(drag.card);
    Object.assign(drag.card.style, { position: 'fixed', width: rect.width + 'px', height: rect.height + 'px',
      left: rect.left + 'px', top: rect.top + 'px' });
    drag.card.classList.add('dashboard-rank-dragging');
    document.body.classList.add('dashboard-is-ranking');
    try { drag.handle.setPointerCapture(drag.pointerId); } catch (_) {}
    updateGroupRankPointer(drag);
    rankScrollFrame = requestAnimationFrame(scrollGroupRankDrag);
  }
  rankAnnounce(drag.list, keyboard ? drag.card : drag.placeholder, drag.context);
}
function updateGroupRankPointer(drag) {
  drag.card.style.left = (drag.x - drag.offsetX) + 'px';
  drag.card.style.top = (drag.y - drag.offsetY) + 'px';
  const next = rankItems(drag.list).find(card => {
    const rect = card.getBoundingClientRect();
    return drag.y < rect.top + rect.height / 2;
  });
  drag.list.insertBefore(drag.placeholder, next || null);
}
function scrollGroupRankDrag() {
  const drag = rankDrag;
  if (!drag?.active || drag.keyboard) return;
  const content = document.getElementById('content-area');
  const internal = content.scrollHeight > content.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(content).overflowY);
  const scroller = internal ? content : document.scrollingElement;
  const bounds = internal ? content.getBoundingClientRect() : { top: 60, bottom: innerHeight - (innerWidth < 768 ? 64 : 0) };
  const speed = drag.y < bounds.top + 50 ? -14 : drag.y > bounds.bottom - 50 ? 14 : 0;
  scroller.scrollTop += speed;
  if (speed) updateGroupRankPointer(drag);
  rankScrollFrame = requestAnimationFrame(scrollGroupRankDrag);
}
function endGroupRankDrag(commit, render = true) {
  const drag = rankDrag;
  if (!drag) return;
  clearTimeout(drag.timer); cancelAnimationFrame(rankScrollFrame);
  if (drag.active) {
    if (!drag.keyboard) {
      try { drag.handle.releasePointerCapture(drag.pointerId); } catch (_) {}
      drag.placeholder.replaceWith(drag.card); drag.card.removeAttribute('style');
    }
    drag.card.classList.remove('dashboard-rank-dragging', 'dashboard-rank-moving');
    drag.handle.setAttribute('aria-pressed', 'false');
    document.body.classList.remove('dashboard-is-ranking');
    rankClickUntil = Date.now() + 250;
  }
  const keys = rankItems(drag.list).map(rankDomKey);
  rankDrag = null;
  if (drag.active && commit) void saveGroupRanks(drag.section, drag.priority, keys, drag.key, false, drag.context);
  else {
    if (render) flushRankRender();
    if (render && drag.keyboard) focusRankHandle(drag.section, drag.key);
  }
}
function initRanking() {
  const root = document.getElementById('content-area');
  document.addEventListener('click', event => {
    if (Date.now() < rankClickUntil && event.target.closest('.dashboard-item')) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  root.addEventListener('click', event => {
    if (event.target.closest('[data-dashboard-rank-handle]')) { event.preventDefault(); event.stopPropagation(); return; }
    const reset = event.target.closest('[data-dashboard-rank-reset]');
    if (!reset) return;
    event.preventDefault(); event.stopPropagation();
    const group = reset.closest('[data-rank-priority]');
    const context = rankingContextForGroup(group);
    void saveGroupRanks(group.dataset.rankSection, group.dataset.rankPriority, [], null, true, context);
  });
  root.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-dashboard-rank-handle]');
    if (!handle || rankDrag || rankSaving || !event.isPrimary || event.button !== 0) return;
    const card = handle.closest('.dashboard-item'), group = card.closest('[data-rank-priority]');
    const context = rankingContextForGroup(group);
    if (!context.available()) return;
    const drag = rankDrag = { context, card, handle, list: card.parentElement, key: rankDomKey(card),
      section: group.dataset.rankSection, priority: group.dataset.rankPriority, x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, active: false };
    if (event.pointerType === 'mouse') { event.preventDefault(); beginGroupRankDrag(drag); }
    else drag.timer = setTimeout(() => { if (rankDrag === drag) beginGroupRankDrag(drag); }, 200);
  });
  document.addEventListener('pointermove', event => {
    const drag = rankDrag;
    if (!drag || drag.keyboard || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.active) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 10) endGroupRankDrag(false);
      return;
    }
    event.preventDefault(); updateGroupRankPointer(drag);
  }, { passive: false });
  document.addEventListener('pointerup', event => {
    if (rankDrag && !rankDrag.keyboard && rankDrag.pointerId === event.pointerId) endGroupRankDrag(true);
  });
  document.addEventListener('pointercancel', event => {
    if (rankDrag?.pointerId === event.pointerId) endGroupRankDrag(false);
  });
  document.addEventListener('keydown', event => {
    const drag = rankDrag;
    if (drag && event.key === 'Escape') { event.preventDefault(); endGroupRankDrag(false); return; }
    const handle = event.target.closest('[data-dashboard-rank-handle]');
    if (!handle || rankSaving) return;
    const context = rankingContextForGroup(handle.closest('[data-rank-priority]'));
    if (!context.available()) return;
    if (['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (drag?.keyboard) endGroupRankDrag(true);
      else if (!drag) {
        const card = handle.closest('.dashboard-item'), group = card.closest('[data-rank-priority]');
        rankDrag = { context, card, handle, list: card.parentElement, key: rankDomKey(card),
          section: group.dataset.rankSection, priority: group.dataset.rankPriority };
        beginGroupRankDrag(rankDrag, true);
      }
    } else if (drag?.keyboard && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const card = drag.card, list = drag.list;
      if (event.key === 'ArrowUp' && card.previousElementSibling) list.insertBefore(card, card.previousElementSibling);
      if (event.key === 'ArrowDown' && card.nextElementSibling) list.insertBefore(card.nextElementSibling, card);
      if (event.key === 'Home') list.prepend(card);
      if (event.key === 'End') list.append(card);
      drag.handle.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
      rankAnnounce(list, card, drag.context);
    }
  });
  window.addEventListener('blur', () => { if (rankDrag) endGroupRankDrag(false); });
}

const TASK_RANK_FILTER_IDS = ['filter-status', 'filter-priority', 'filter-assignee', 'filter-category', 'task-search'];
let taskRankSavedFilters = null;

function dashboardRankingContext(section, priority) {
  const personId = state.user?.uid;
  return { view: 'dashboard', personId, liveId: 'dashboard-rank-live',
    available: () => dashboardRankingAvailable() && state.user?.uid === personId,
    getEntries: () => dashboardRankGroupEntries(section, priority) };
}
function taskRankGroupEntries(priority, personId) {
  return state.tasks.filter(task => task.assignedTo === personId && !task.deletedAt &&
    !isDoneItem(task) && task.status !== 'til_review' && (task.priority || 'medium') === priority)
    .map(item => ({ type: 'task', item }));
}
function rankingContextForGroup(group) {
  const priority = group.dataset.rankPriority;
  if (!group.closest('#view-tasks')) return dashboardRankingContext(group.dataset.rankSection, priority);
  const personId = state.taskRankPersonId;
  return { view: 'tasks', personId, liveId: 'task-rank-live',
    available: () => canEdit() && !!personId && state.taskRankPersonId === personId,
    getEntries: () => taskRankGroupEntries(priority, personId) };
}
function updateTaskRankingControls() {
  const active = !!state.taskRankPersonId;
  TASK_RANK_FILTER_IDS.forEach(id => { document.getElementById(id).disabled = active; });
  document.querySelectorAll('#quick-filters .quick-filter').forEach(button => { button.disabled = active; });
  const personId = document.getElementById('filter-assignee').value;
  const person = state.users.find(user => user.id === personId);
  const button = document.getElementById('task-rank-start');
  button.classList.toggle('hidden', active || !canEdit() || !personId || personId === '__unassigned' || !person);
  button.textContent = 'Sett rekkefølge for ' + (person?.displayName || person?.email || '');
  document.getElementById('task-rank-banner').classList.toggle('hidden', !active);
  if (active) {
    const rankedPerson = state.users.find(user => user.id === state.taskRankPersonId);
    const name = rankedPerson?.displayName || rankedPerson?.email || state.taskRankPersonId;
    document.getElementById('task-rank-message').textContent = 'Rekkefølge for ' + name +
      '. Dra for å endre. Rekkefølgen er felles: ' + name.split(' ')[0] +
      ' ser den samme rekkefølgen under «Mine» på dashboardet.';
  }
}
function startTaskRanking() {
  const personId = document.getElementById('filter-assignee').value;
  if (!canEdit() || rankDrag || rankSaving || !personId || personId === '__unassigned' ||
    !state.users.some(user => user.id === personId)) return;
  taskRankSavedFilters = { quickFilter: state.quickFilter, fields: TASK_RANK_FILTER_IDS.map(id => {
    const field = document.getElementById(id);
    return { id, value: field.value, label: field.selectedOptions?.[0]?.textContent };
  }) };
  state.taskRankPersonId = personId;
  renderTasksList();
}
function stopTaskRanking(render = true) {
  if (rankDrag?.context.view === 'tasks') endGroupRankDrag(false, false);
  state.taskRankPersonId = null;
  if (taskRankSavedFilters) {
    state.quickFilter = taskRankSavedFilters.quickFilter;
    taskRankSavedFilters.fields.forEach(({ id, value, label }) => {
      const field = document.getElementById(id);
      if (field.tagName === 'SELECT' && value && ![...field.options].some(option => option.value === value)) {
        field.add(new Option(label || value, value));
      }
      field.value = value;
    });
    taskRankSavedFilters = null;
  }
  updateTaskRankingControls();
  if (render) renderTasksList();
}
function leaveRankingView(name) {
  if (name === state.currentView) return;
  if (rankDrag) endGroupRankDrag(false, false);
  if (state.taskRankPersonId && name !== 'tasks') stopTaskRanking(false);
}
function renderTaskRankingList() {
  const personId = state.taskRankPersonId;
  const groups = [{ key: 'høy', label: 'Høy prioritet' }, { key: 'medium', label: 'Medium prioritet' },
    { key: 'lav', label: 'Lav prioritet' }];
  const list = document.getElementById('tasks-list');
  list.innerHTML = groups.map(group => {
    const entries = taskRankGroupEntries(group.key, personId).sort((a, b) => compareDashboardRanks(a, b, personId));
    if (!entries.length) return '';
    let number = 0;
    const cards = entries.map(entry => {
      const template = document.createElement('template');
      template.innerHTML = taskCardHtml(entry.item, false);
      if (rankValue(entry, personId) !== null) {
        const badge = document.createElement('span');
        badge.className = 'task-rank-number';
        badge.textContent = String(++number);
        template.content.querySelector('.task-title').prepend(badge);
      }
      return '<div class="dashboard-item dashboard-rankable task-rank-item" data-dashboard-item-type="task" data-dashboard-item-id="' +
        esc(entry.item.id) + '">' + template.innerHTML + rankHandleHtml(entry) + '</div>';
    }).join('');
    const reset = number ? '<button type="button" class="dashboard-rank-reset" data-dashboard-rank-reset title="Gå tilbake til sortering etter frist og hastegrad" aria-label="Gå tilbake til sortering etter frist og hastegrad">Nullstill rekkefølge</button>' : '';
    return '<div class="priority-group" data-rank-section="tasks-list" data-rank-priority="' + group.key +
      '"><div class="priority-group-title"><span class="priority-dot ' + group.key + '"></span><span>' +
      group.label + '</span><span class="priority-group-count">' + entries.length + '</span>' + reset +
      '</div><div class="task-list-compact">' + cards + '</div></div>';
  }).join('') || '<div class="empty-state"><strong>Ingen åpne oppgaver å rangere</strong></div>';
}
