// Dashboard ordering: workRank belongs to a person, never to a time/priority group.
const DASHBOARD_RANK_SECTIONS = ['overdue-today-list', 'next-seven-list', 'in-progress-list', 'later-list'];
let dashboardRankDrag = null;
let dashboardRankSaving = false;
let dashboardRankRenderPending = false;
let dashboardRankScrollFrame = null;
let dashboardRankClickUntil = 0;

function dashboardRankingAvailable() {
  return state.dashboardScope === 'mine' && canEdit() && !state.dashboardFilter;
}
function deferDashboardRankRender() {
  if (!dashboardRankSaving && !dashboardRankDrag) return false;
  dashboardRankRenderPending = true;
  return true;
}
function dashboardRankKey(entry) { return entry.type + ':' + entry.item.id; }
function dashboardRankValue(entry) {
  const rank = entry.item.workRank?.[state.user?.uid];
  return Number.isFinite(rank) ? rank : null;
}
function compareDashboardRanks(a, b) {
  const before = dashboardRankValue(a), after = dashboardRankValue(b);
  if (before !== null && after !== null) {
    return before - after || String(a.item.title || '').localeCompare(String(b.item.title || ''), 'nb') ||
      dashboardRankKey(a).localeCompare(dashboardRankKey(b));
  }
  if (before !== null || after !== null) return before !== null ? -1 : 1;
  return compareTasksByUrgency(a.item, b.item);
}
function dashboardRankHandleHtml(entry) {
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
function dashboardRankItems(list) {
  return [...list.children].filter(el => el.matches('.dashboard-item'));
}
function dashboardRankDomKey(card) {
  return card.dataset.dashboardItemType + ':' + card.dataset.dashboardItemId;
}
function dashboardRankAnnounce(list, card) {
  const items = [...list.children].filter(el => el.matches('.dashboard-item, .dashboard-rank-placeholder'));
  document.getElementById('dashboard-rank-live').textContent =
    'Plass ' + (items.indexOf(card) + 1) + ' av ' + items.length;
}
function dashboardRankFlush() {
  dashboardRankRenderPending = false;
  renderDashboard();
}
function focusDashboardRankHandle(section, key) {
  if (!key) return;
  const [type, ...id] = key.split(':');
  document.querySelector('#' + section + ' [data-dashboard-item-type="' + type +
    '"][data-dashboard-item-id="' + CSS.escape(id.join(':')) + '"] [data-dashboard-rank-handle]')?.focus({ preventScroll: true });
}
function localDashboardRank(change, personId) {
  const item = state[change.type].find(item => item.id === change.id);
  if (!item) return;
  item.workRank = { ...(item.workRank || {}) };
  if (change.rank === null) delete item.workRank[personId];
  else item.workRank[personId] = change.rank;
}
function dashboardRankChange(entry, rank) {
  return { type: entry.type === 'task' ? 'tasks' : 'todos', id: entry.item.id, rank };
}

function dashboardRankChanges(ordered, key) {
  const index = ordered.findIndex(entry => dashboardRankKey(entry) === key);
  if (index < 0) throw new Error('Oppgaven er endret. Se over rekkefølgen og prøv igjen.');
  const ranked = entry => dashboardRankValue(entry) !== null;
  const prefix = ordered.slice(0, index);
  const moved = ordered[index];
  const normalize = entries => entries.map((entry, i) => dashboardRankChange(entry, (i + 1) * 1000));
  if (prefix.every(ranked)) {
    const before = index ? dashboardRankValue(ordered[index - 1]) : null;
    const after = index + 1 < ordered.length ? dashboardRankValue(ordered[index + 1]) : null;
    const rank = before === null && after === null ? 1000 : before === null ? after - 1000 :
      after === null ? before + 1000 : before + (after - before) / 2;
    if (!Number.isFinite(rank) || (before !== null && rank - before < 0.001) ||
      (after !== null && after - rank < 0.001)) {
      return normalize(ordered.filter(entry => ranked(entry) || entry === moved));
    }
    return [dashboardRankChange(moved, rank)];
  }
  // Only the ranked prefix remains above the unranked part; exclude the moved old rank.
  const firstUnranked = prefix.findIndex(entry => !ranked(entry));
  const base = firstUnranked ? dashboardRankValue(ordered[firstUnranked - 1]) : 0;
  const promoted = ordered.slice(firstUnranked, index + 1);
  const changes = promoted.map((entry, i) => dashboardRankChange(entry, base + (i + 1) * 1000));
  if (changes.some((change, i) => !Number.isFinite(change.rank) ||
    change.rank <= (i ? changes[i - 1].rank : base))) return normalize(ordered.slice(0, index + 1));
  return changes;
}

async function saveDashboardRanks(section, priority, keys, movedKey, reset = false) {
  if (!dashboardRankingAvailable() || dashboardRankSaving) { dashboardRankFlush(); return; }
  const personId = state.user.uid;
  const fresh = dashboardRankGroupEntries(section, priority);
  let changes;
  try {
    if (reset) changes = fresh.filter(entry => dashboardRankValue(entry) !== null).map(entry => dashboardRankChange(entry, null));
    else {
      const ordered = keys.map(key => fresh.find(entry => dashboardRankKey(entry) === key));
      if (fresh.length !== keys.length || ordered.some(entry => !entry) || new Set(keys).size !== keys.length) {
        throw new Error('Oppgaven er endret. Se over rekkefølgen og prøv igjen.');
      }
      changes = dashboardRankChanges(ordered, movedKey);
    }
    if (changes.length > 500) throw new Error('Gruppen har mer enn 500 rangeringer som må endres. Ingen endringer er lagret.');
  } catch (error) {
    dashboardRankFlush(); showToast(error.message, 'error'); return;
  }
  if (!changes.length) { dashboardRankFlush(); return; }
  const old = changes.map(change => ({ ...change, rank: dashboardRankValue(fresh.find(entry =>
    entry.item.id === change.id && (entry.type === 'task' ? 'tasks' : 'todos') === change.type)) }));
  changes.forEach(change => localDashboardRank(change, personId));
  dashboardRankSaving = true;
  try {
    await writeWorkRanks(changes, personId);
  } catch (error) {
    old.forEach(change => localDashboardRank(change, personId));
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
    dashboardRankSaving = false;
    dashboardRankFlush();
    focusDashboardRankHandle(section, movedKey);
  }
}
function beginDashboardRankDrag(drag, keyboard = false) {
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
    updateDashboardRankPointer(drag);
    dashboardRankScrollFrame = requestAnimationFrame(scrollDashboardRankDrag);
  }
  dashboardRankAnnounce(drag.list, keyboard ? drag.card : drag.placeholder);
}
function updateDashboardRankPointer(drag) {
  drag.card.style.left = (drag.x - drag.offsetX) + 'px';
  drag.card.style.top = (drag.y - drag.offsetY) + 'px';
  const next = dashboardRankItems(drag.list).find(card => {
    const rect = card.getBoundingClientRect();
    return drag.y < rect.top + rect.height / 2;
  });
  drag.list.insertBefore(drag.placeholder, next || null);
}
function scrollDashboardRankDrag() {
  const drag = dashboardRankDrag;
  if (!drag?.active || drag.keyboard) return;
  const content = document.getElementById('content-area');
  const internal = content.scrollHeight > content.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(content).overflowY);
  const scroller = internal ? content : document.scrollingElement;
  const bounds = internal ? content.getBoundingClientRect() : { top: 60, bottom: innerHeight - (innerWidth < 768 ? 64 : 0) };
  const speed = drag.y < bounds.top + 50 ? -14 : drag.y > bounds.bottom - 50 ? 14 : 0;
  scroller.scrollTop += speed;
  if (speed) updateDashboardRankPointer(drag);
  dashboardRankScrollFrame = requestAnimationFrame(scrollDashboardRankDrag);
}
function endDashboardRankDrag(commit) {
  const drag = dashboardRankDrag;
  if (!drag) return;
  clearTimeout(drag.timer); cancelAnimationFrame(dashboardRankScrollFrame);
  if (drag.active) {
    if (!drag.keyboard) {
      try { drag.handle.releasePointerCapture(drag.pointerId); } catch (_) {}
      drag.placeholder.replaceWith(drag.card); drag.card.removeAttribute('style');
    }
    drag.card.classList.remove('dashboard-rank-dragging', 'dashboard-rank-moving');
    drag.handle.setAttribute('aria-pressed', 'false');
    document.body.classList.remove('dashboard-is-ranking');
    dashboardRankClickUntil = Date.now() + 250;
  }
  const keys = dashboardRankItems(drag.list).map(dashboardRankDomKey);
  dashboardRankDrag = null;
  if (drag.active && commit) void saveDashboardRanks(drag.section, drag.priority, keys, drag.key);
  else {
    dashboardRankFlush();
    if (drag.keyboard) focusDashboardRankHandle(drag.section, drag.key);
  }
}
function initDashboardRanking() {
  const root = document.getElementById('view-dashboard');
  document.addEventListener('click', event => {
    if (Date.now() < dashboardRankClickUntil && event.target.closest('.dashboard-item')) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  root.addEventListener('click', event => {
    if (event.target.closest('[data-dashboard-rank-handle]')) { event.preventDefault(); event.stopPropagation(); return; }
    const reset = event.target.closest('[data-dashboard-rank-reset]');
    if (!reset) return;
    event.preventDefault(); event.stopPropagation();
    const group = reset.closest('[data-rank-priority]');
    void saveDashboardRanks(group.dataset.rankSection, group.dataset.rankPriority, [], null, true);
  });
  root.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-dashboard-rank-handle]');
    if (!handle || !dashboardRankingAvailable() || dashboardRankDrag || dashboardRankSaving || !event.isPrimary || event.button !== 0) return;
    const card = handle.closest('.dashboard-item'), group = card.closest('[data-rank-priority]');
    const drag = dashboardRankDrag = { card, handle, list: card.parentElement, key: dashboardRankDomKey(card),
      section: group.dataset.rankSection, priority: group.dataset.rankPriority, x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, active: false };
    if (event.pointerType === 'mouse') { event.preventDefault(); beginDashboardRankDrag(drag); }
    else drag.timer = setTimeout(() => { if (dashboardRankDrag === drag) beginDashboardRankDrag(drag); }, 200);
  });
  document.addEventListener('pointermove', event => {
    const drag = dashboardRankDrag;
    if (!drag || drag.keyboard || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.active) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 10) endDashboardRankDrag(false);
      return;
    }
    event.preventDefault(); updateDashboardRankPointer(drag);
  }, { passive: false });
  document.addEventListener('pointerup', event => {
    if (dashboardRankDrag && !dashboardRankDrag.keyboard && dashboardRankDrag.pointerId === event.pointerId) endDashboardRankDrag(true);
  });
  document.addEventListener('pointercancel', event => {
    if (dashboardRankDrag?.pointerId === event.pointerId) endDashboardRankDrag(false);
  });
  document.addEventListener('keydown', event => {
    const drag = dashboardRankDrag;
    if (drag && event.key === 'Escape') { event.preventDefault(); endDashboardRankDrag(false); return; }
    const handle = event.target.closest('[data-dashboard-rank-handle]');
    if (!handle || !dashboardRankingAvailable() || dashboardRankSaving) return;
    if (['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (drag?.keyboard) endDashboardRankDrag(true);
      else if (!drag) {
        const card = handle.closest('.dashboard-item'), group = card.closest('[data-rank-priority]');
        dashboardRankDrag = { card, handle, list: card.parentElement, key: dashboardRankDomKey(card),
          section: group.dataset.rankSection, priority: group.dataset.rankPriority };
        beginDashboardRankDrag(dashboardRankDrag, true);
      }
    } else if (drag?.keyboard && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const card = drag.card, list = drag.list;
      if (event.key === 'ArrowUp' && card.previousElementSibling) list.insertBefore(card, card.previousElementSibling);
      if (event.key === 'ArrowDown' && card.nextElementSibling) list.insertBefore(card.nextElementSibling, card);
      if (event.key === 'Home') list.prepend(card);
      if (event.key === 'End') list.append(card);
      drag.handle.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
      dashboardRankAnnounce(list, card);
    }
  });
  window.addEventListener('blur', () => { if (dashboardRankDrag) endDashboardRankDrag(false); });
}
