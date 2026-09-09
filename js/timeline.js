// ============================================================
// TIMELINE.JS - read-only task timeline
// Classic script: shared helpers and state are defined in app.js.
// ============================================================

const TIMELINE_WINDOW_KEY = 'timelineWindow';
const TIMELINE_FILTERS_COLLAPSED_KEY = 'timelineFiltersCollapsed';
const TIMELINE_DEFAULT_WINDOW = '3m';
const TIMELINE_VALID_WINDOWS = new Set(['3m', '12m', '18m', 'workyear']);
const TIMELINE_NEUTRAL_COLOR = '#9CA3AF';
const TIMELINE_CLUSTER_THRESHOLD_PX = 20;

const timelineViewState = {
  window: TIMELINE_VALID_WINDOWS.has(localStorage.getItem(TIMELINE_WINDOW_KEY))
    ? localStorage.getItem(TIMELINE_WINDOW_KEY)
    : TIMELINE_DEFAULT_WINDOW,
  workYearOffset: 0,
  person: '',
  category: '',
  status: '',
  sort: 'start',
  showSubtasks: false,
  filtersCollapsed: localStorage.getItem(TIMELINE_FILTERS_COLLAPSED_KEY) === 'true',
};

function timelineDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return dateStringToUtc(value);
  return value ? dateStringToUtc(timestampToDateString(value)) : null;
}

function timelineAddDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function timelineAddMonths(date, months) {
  const day = date.getUTCDate();
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function timelineDayDiff(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function timelineWindowBounds(mode, todayValue = todayDateString(), workYearOffset = 0) {
  const today = timelineDate(todayValue);
  if (!today) return null;
  if (mode === 'workyear') {
    const currentStartYear = today.getUTCMonth() >= 7 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
    const startYear = currentStartYear + Number(workYearOffset || 0);
    return {
      start: new Date(Date.UTC(startYear, 7, 1)),
      end: new Date(Date.UTC(startYear + 1, 6, 31)),
    };
  }
  const months = mode === '18m' ? 18 : mode === '12m' ? 12 : 3;
  return { start: today, end: timelineAddDays(timelineAddMonths(today, months), -1) };
}

function timelineTaskRange(task) {
  const due = timelineDate(task?.dueDate);
  if (!due) return null;
  const start = timelineDate(task?.startDate);
  const invalid = Boolean(start && start > due);
  return { start: start && !invalid ? start : due, due, marker: !start || invalid, invalid };
}

function timelineRangeOverlaps(range, bounds) {
  return Boolean(range && bounds && range.due >= bounds.start && range.start <= bounds.end);
}

function timelineCategoryKey(task) {
  if (task.categoryId) return String(task.categoryId);
  if (task.categoryName) return `snapshot:${task.categoryName}`;
  return '__none';
}

function timelineColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : TIMELINE_NEUTRAL_COLOR;
}

function timelineCategoryDetails(task) {
  return {
    key: timelineCategoryKey(task),
    name: task.categoryName || 'Uten kategori',
    color: timelineColor(task.categoryColor),
  };
}

function timelineIsOpenTask(task) {
  return task && !task.deletedAt && task.status !== 'fullfort';
}

function timelineBaseEntries(bounds) {
  return state.tasks
    .filter(timelineIsOpenTask)
    .map(task => ({ task, range: timelineTaskRange(task) }))
    .filter(entry => timelineRangeOverlaps(entry.range, bounds));
}

function timelineFilteredEntries(entries) {
  return entries.filter(({ task }) => {
    if (timelineViewState.person && !taskInvolvement(task, timelineViewState.person).involved) return false;
    if (timelineViewState.category && timelineCategoryKey(task) !== timelineViewState.category) return false;
    if (timelineViewState.status && task.status !== timelineViewState.status) return false;
    return true;
  });
}

function timelineSortEntries(entries) {
  return [...entries].sort((a, b) => {
    const dateDiff = a.range.start - b.range.start || a.range.due - b.range.due;
    return dateDiff || String(a.task.title || '').localeCompare(String(b.task.title || ''), 'no');
  });
}

function timelineCategoryGroup(entry) {
  const { task } = entry;
  if (!task.categoryId && !task.categoryName) {
    return { key: '__none', name: 'Uten kategori', type: 'none', sortOrder: Number.MAX_SAFE_INTEGER };
  }
  const master = task.categoryId
    ? state.categories.find(category => String(category.id) === String(task.categoryId))
    : null;
  if (master) {
    const order = Number(master.sortOrder);
    return {
      key: `master:${master.id}`,
      name: master.name || task.categoryName || 'Uten navn',
      type: 'master',
      sortOrder: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER,
    };
  }
  return {
    key: `snapshot:${task.categoryId || task.categoryName}`,
    name: task.categoryName || 'Tidligere kategori',
    type: 'snapshot',
    sortOrder: Number.MAX_SAFE_INTEGER,
  };
}

function timelineAssigneeGroup(entry) {
  const { task } = entry;
  if (!task.assignedTo) return { key: '__unassigned', name: 'Ikke tildelt', type: 'none' };
  const user = state.users.find(candidate => candidate.id === task.assignedTo);
  return {
    key: String(task.assignedTo),
    name: user?.displayName || user?.email || task.assignedToName || 'Ukjent bruker',
    type: user ? 'active' : 'snapshot',
  };
}

function timelineGroupedEntries(entries) {
  if (timelineViewState.sort === 'start') return null;
  const groupFor = timelineViewState.sort === 'category' ? timelineCategoryGroup : timelineAssigneeGroup;
  const groups = new Map();
  entries.forEach(entry => {
    const details = groupFor(entry);
    if (!groups.has(details.key)) groups.set(details.key, { ...details, entries: [] });
    groups.get(details.key).entries.push(entry);
  });
  const result = [...groups.values()];
  result.forEach(group => { group.entries = timelineSortEntries(group.entries); });
  if (timelineViewState.sort === 'category') {
    return result.sort((a, b) => {
      const rank = type => type === 'master' ? 0 : type === 'snapshot' ? 1 : 2;
      return rank(a.type) - rank(b.type)
        || a.sortOrder - b.sortOrder
        || a.name.localeCompare(b.name, 'no');
    });
  }
  return result.sort((a, b) => {
    if (a.type === 'none') return 1;
    if (b.type === 'none') return -1;
    return a.name.localeCompare(b.name, 'no');
  });
}

function timelineMonthSegments(bounds) {
  const totalDays = timelineDayDiff(bounds.start, bounds.end) + 1;
  const result = [];
  let cursor = new Date(Date.UTC(bounds.start.getUTCFullYear(), bounds.start.getUTCMonth(), 1));
  const names = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
  while (cursor <= bounds.end) {
    const monthStart = cursor < bounds.start ? bounds.start : cursor;
    const monthEndDate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const monthEnd = monthEndDate > bounds.end ? bounds.end : monthEndDate;
    result.push({
      left: timelineDayDiff(bounds.start, monthStart) / totalDays * 100,
      width: (timelineDayDiff(monthStart, monthEnd) + 1) / totalDays * 100,
      label: `${names[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return result;
}

function timelinePercent(bounds, date, center = false) {
  const totalDays = timelineDayDiff(bounds.start, bounds.end) + 1;
  const offset = timelineDayDiff(bounds.start, date) + (center ? 0.5 : 0);
  return Math.max(0, Math.min(100, offset / totalDays * 100));
}

function timelineVisualGeometry(range, bounds) {
  if (range.marker) {
    return { marker: true, left: timelinePercent(bounds, range.due, true), width: 0, continuesBefore: false, continuesAfter: false };
  }
  const clippedStart = range.start < bounds.start ? bounds.start : range.start;
  const clippedEnd = range.due > bounds.end ? bounds.end : range.due;
  const totalDays = timelineDayDiff(bounds.start, bounds.end) + 1;
  return {
    marker: false,
    left: timelineDayDiff(bounds.start, clippedStart) / totalDays * 100,
    width: (timelineDayDiff(clippedStart, clippedEnd) + 1) / totalDays * 100,
    continuesBefore: range.start < bounds.start,
    continuesAfter: range.due > bounds.end,
  };
}

function timelineFormatDate(date) {
  return formatDate(date);
}

function timelinePeriodLabel(bounds) {
  return `${timelineFormatDate(bounds.start)} - ${timelineFormatDate(bounds.end)}`;
}

function timelineSelectedOptionLabel(id) {
  const select = document.getElementById(id);
  return select?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function timelineFilterSummaryText() {
  const parts = [];
  if (timelineViewState.person) parts.push(`Person: ${timelineSelectedOptionLabel('timeline-person-filter')}`);
  if (timelineViewState.category) parts.push(`Kategori: ${timelineSelectedOptionLabel('timeline-category-filter')}`);
  if (timelineViewState.status) parts.push(`Status: ${timelineSelectedOptionLabel('timeline-status-filter')}`);
  if (timelineViewState.sort !== 'start') parts.push(`Sortert: ${timelineSelectedOptionLabel('timeline-sort')}`);
  if (timelineViewState.showSubtasks) parts.push('Deloppgavefrister vises');
  return parts.length ? parts.join(' · ') : 'Ingen aktive filtre';
}

function updateTimelineFilterPanel() {
  const panel = document.getElementById('timeline-filter-panel');
  const toggle = document.getElementById('timeline-filter-toggle');
  const summary = document.getElementById('timeline-filter-summary');
  const collapsed = timelineViewState.filtersCollapsed;
  if (panel) panel.hidden = collapsed;
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.classList.toggle('is-collapsed', collapsed);
    const label = toggle.querySelector('span');
    if (label) label.textContent = collapsed ? 'Vis filtre' : 'Skjul filtre';
  }
  if (summary) {
    summary.textContent = timelineFilterSummaryText();
    summary.classList.toggle('hidden', !collapsed);
  }
}

function toggleTimelineFilters() {
  timelineViewState.filtersCollapsed = !timelineViewState.filtersCollapsed;
  localStorage.setItem(TIMELINE_FILTERS_COLLAPSED_KEY, String(timelineViewState.filtersCollapsed));
  updateTimelineFilterPanel();
}

function timelineTaskPeople(task) {
  const ids = [
    task.assignedTo,
    ...(Array.isArray(task.collaborators) ? task.collaborators : []),
    ...(Array.isArray(task.subtasks) ? task.subtasks.filter(subtask => !subtask.completed).map(subtask => subtask.assignedTo) : []),
  ].filter(Boolean);
  return [...new Set(ids)].map(id => state.users.find(user => user.id === id)).filter(Boolean);
}

function timelineAvatarHtml(user) {
  const name = user.displayName || user.email || 'Ukjent';
  return user.photoURL
    ? `<img class="timeline-avatar" src="${esc(user.photoURL)}" alt="" title="${esc(name)}" />`
    : `<span class="timeline-avatar timeline-avatar-fallback" title="${esc(name)}">${esc(initials(name))}</span>`;
}

function timelineTooltip(task, range) {
  const owner = state.users.find(user => user.id === task.assignedTo);
  const ownerName = task.assignedToName || owner?.displayName || owner?.email || 'Ikke tildelt';
  const period = range.marker ? `Frist ${timelineFormatDate(range.due)}` : `${timelineFormatDate(range.start)} - ${timelineFormatDate(range.due)}`;
  return `${task.title || 'Uten tittel'} · ${ownerName} · ${period} · ${task.categoryName || 'Uten kategori'}${range.invalid ? ' · Ugyldig periode' : ''}`;
}

function timelineSubtaskTooltip(subtask) {
  const assignee = subtaskAssigneeInfo(subtask);
  const dueLabel = subtask.completed
    ? formatDateString(subtask.dueDate)
    : subtaskDueLabel(subtask);
  const status = subtask.completed
    ? 'Fullført'
    : subtaskDueClass(subtask) === 'overdue' ? 'Forfalt' : 'Åpen';
  return `${subtask.title || 'Uten tittel'} · ${dueLabel} · ${status} · ${assignee?.name || 'Ingen ansvarlig'}`;
}

function timelineSubtaskClusters(task, bounds) {
  const axisWidth = timelineAxisWidth(timelineViewState.window);
  const points = (Array.isArray(task.subtasks) ? task.subtasks : [])
    .map((subtask, index) => ({ subtask, index, due: timelineDate(subtask.dueDate) }))
    .filter(point => point.due && point.due >= bounds.start && point.due <= bounds.end)
    .map(point => ({
      ...point,
      left: timelinePercent(bounds, point.due, true),
      pixel: timelinePercent(bounds, point.due, true) / 100 * axisWidth,
    }))
    .sort((a, b) => a.pixel - b.pixel || a.index - b.index);
  const clusters = [];
  points.forEach(point => {
    const current = clusters[clusters.length - 1];
    if (current && point.pixel - current.lastPixel <= TIMELINE_CLUSTER_THRESHOLD_PX) {
      current.points.push(point);
      current.lastPixel = point.pixel;
      current.left = current.points.reduce((sum, item) => sum + item.left, 0) / current.points.length;
    } else {
      clusters.push({ points: [point], left: point.left, lastPixel: point.pixel });
    }
  });
  return clusters;
}

function timelineSubtaskMarkersHtml(task, bounds) {
  if (!timelineViewState.showSubtasks) return '';
  return timelineSubtaskClusters(task, bounds).map(cluster => {
    const allCompleted = cluster.points.every(({ subtask }) => subtask.completed);
    const hasOverdue = cluster.points.some(({ subtask }) => !subtask.completed && subtaskDueClass(subtask) === 'overdue');
    const tooltip = cluster.points.map(({ subtask }) => timelineSubtaskTooltip(subtask)).join('\n');
    const label = cluster.points.length > 1
      ? `${cluster.points.length} deloppgaver. ${tooltip.replace(/\n/g, '. ')}`
      : tooltip;
    const classes = [
      'timeline-subtask-marker',
      cluster.points.length > 1 ? 'is-cluster' : '',
      allCompleted ? 'is-completed' : '',
      hasOverdue ? 'is-overdue' : '',
    ].filter(Boolean).join(' ');
    return `<button class="${classes}" type="button" data-timeline-subtask-task-id="${esc(task.id)}" data-subtask-count="${cluster.points.length}" style="left:${cluster.left}%"
      aria-label="${esc(label)}" data-tooltip="${esc(tooltip)}">
      <span aria-hidden="true">${cluster.points.length > 1 ? cluster.points.length : allCompleted ? '✓' : ''}</span>
    </button>`;
  }).join('');
}

function timelineCategoryOptions(entries) {
  const categories = new Map();
  state.categories.forEach(category => categories.set(String(category.id), {
    key: String(category.id),
    name: category.name || 'Uten navn',
    active: category.active !== false,
    snapshotOnly: false,
  }));
  entries.forEach(({ task }) => {
    const details = timelineCategoryDetails(task);
    if (details.key !== '__none' && !categories.has(details.key)) {
      categories.set(details.key, { key: details.key, name: details.name, active: false, snapshotOnly: true });
    }
  });
  return [...categories.values()].sort((a, b) => a.name.localeCompare(b.name, 'no'));
}

function updateTimelineFilters(entries) {
  const person = document.getElementById('timeline-person-filter');
  const category = document.getElementById('timeline-category-filter');
  if (!person || !category) return;
  person.innerHTML = ['<option value="">Hele teamet</option>', ...state.users.map(user =>
    `<option value="${esc(user.id)}">${esc(user.displayName || user.email)}</option>`
  )].join('');
  if (state.users.some(user => user.id === timelineViewState.person)) person.value = timelineViewState.person;
  else timelineViewState.person = '';

  const categories = timelineCategoryOptions(entries);
  category.innerHTML = [
    '<option value="">Alle kategorier</option>',
    '<option value="__none">Uten kategori</option>',
    ...categories.map(item => {
      const suffix = item.snapshotOnly ? ' (ikke aktiv)' : item.active ? '' : ' (skjult)';
      return `<option value="${esc(item.key)}">${esc(item.name + suffix)}</option>`;
    }),
  ].join('');
  if (timelineViewState.category && ['__none', ...categories.map(item => item.key)].includes(timelineViewState.category)) {
    category.value = timelineViewState.category;
  } else timelineViewState.category = '';
}

function timelineLegendHtml(entries) {
  const categories = new Map();
  entries.forEach(({ task }) => {
    const details = timelineCategoryDetails(task);
    if (!categories.has(details.key)) categories.set(details.key, details);
  });
  if (!categories.size) return '';
  return `<div class="timeline-legend" aria-label="Kategorier i tidslinjen">${[...categories.values()].map(item => `
    <span class="timeline-legend-item"><span class="timeline-legend-swatch" style="--timeline-color:${esc(item.color)}"></span>${esc(item.name)}</span>
  `).join('')}</div>`;
}

function timelineAxisHeaderHtml(bounds, today) {
  const todayInside = today >= bounds.start && today <= bounds.end;
  return `<div class="timeline-axis-header timeline-axis-grid" aria-hidden="true">
    ${timelineMonthSegments(bounds).map(month => `<span class="timeline-month" style="left:${month.left}%;width:${month.width}%">${esc(month.label)}</span>`).join('')}
    ${todayInside ? `<span class="timeline-today-line timeline-today-line-header" style="left:${timelinePercent(bounds, today, true)}%"><span>I dag</span></span>` : ''}
  </div>`;
}

function timelineRowHtml(entry, bounds, today) {
  const { task, range } = entry;
  const geometry = timelineVisualGeometry(range, bounds);
  const category = timelineCategoryDetails(task);
  const overdue = range.due < today;
  const people = timelineTaskPeople(task);
  const tooltip = timelineTooltip(task, range);
  const classes = [
    'timeline-item', geometry.marker ? 'timeline-marker' : 'timeline-bar',
    range.invalid ? 'is-invalid' : '', overdue ? 'is-overdue' : '',
    geometry.continuesBefore ? 'continues-before' : '', geometry.continuesAfter ? 'continues-after' : '',
  ].filter(Boolean).join(' ');
  const owner = state.users.find(user => user.id === task.assignedTo);
  const ownerName = task.assignedToName || owner?.displayName || owner?.email || 'Ikke tildelt';
  return `
    <div class="timeline-task-cell">
      <button class="timeline-task-title" type="button" data-timeline-task-id="${esc(task.id)}" title="${esc(task.title || 'Uten tittel')}">${esc(task.title || 'Uten tittel')}</button>
      <div class="timeline-task-meta">
        <span class="timeline-category-dot" style="--timeline-color:${esc(category.color)}"></span><span>${esc(ownerName)}</span>
        ${range.invalid ? '<span class="timeline-invalid-badge">Ugyldig periode</span>' : ''}
        ${overdue ? '<span class="timeline-overdue-badge">Forfalt</span>' : ''}
        ${people.length ? `<span class="timeline-avatars" aria-label="${people.length} involverte">${people.slice(0, 4).map(timelineAvatarHtml).join('')}</span>` : ''}
      </div>
    </div>
    <div class="timeline-axis-cell timeline-axis-grid">
      ${today >= bounds.start && today <= bounds.end ? `<span class="timeline-today-line" style="left:${timelinePercent(bounds, today, true)}%"></span>` : ''}
      <button class="${classes}" type="button" data-timeline-task-id="${esc(task.id)}" aria-label="${esc(tooltip)}" data-tooltip="${esc(tooltip)}"
        style="--timeline-color:${esc(category.color)};left:${geometry.left}%;${geometry.marker ? '' : `width:max(${geometry.width}%, 8px)`}">
        ${range.invalid ? '<span class="sr-only">Ugyldig periode.</span>' : ''}
      </button>
      ${timelineSubtaskMarkersHtml(task, bounds)}
    </div>`;
}

function timelineGroupHeaderHtml(group) {
  const inactive = group.type === 'snapshot' && timelineViewState.sort === 'category';
  return `
    <div class="timeline-group-title-cell">
      <span>${esc(group.name)}</span>
      ${inactive ? '<small>Ikke aktiv</small>' : ''}
      <strong>${group.entries.length}</strong>
    </div>
    <div class="timeline-group-axis-cell" aria-hidden="true"></div>`;
}

function timelineRowsHtml(entries, bounds, today) {
  const groups = timelineGroupedEntries(entries);
  if (!groups) return entries.map(entry => timelineRowHtml(entry, bounds, today)).join('');
  return groups.map(group => `${timelineGroupHeaderHtml(group)}${group.entries.map(entry => timelineRowHtml(entry, bounds, today)).join('')}`).join('');
}

function timelineAxisWidth(mode) {
  return mode === '3m' ? 720 : mode === '18m' ? 1440 : 1080;
}

function timelineGridColumns(mode) {
  return mode === '3m' ? 13 : mode === '18m' ? 18 : 12;
}

function renderTimeline() {
  const root = document.getElementById('timeline-root');
  const legend = document.getElementById('timeline-legend-container');
  if (!root || !legend) return;
  const bounds = timelineWindowBounds(timelineViewState.window, todayDateString(), timelineViewState.workYearOffset);
  if (!bounds) return;
  const today = timelineDate(todayDateString());
  const baseEntries = timelineBaseEntries(bounds);
  updateTimelineFilters(baseEntries);
  const entries = timelineSortEntries(timelineFilteredEntries(baseEntries));

  document.querySelectorAll('[data-timeline-window]').forEach(button => {
    const active = button.dataset.timelineWindow === timelineViewState.window;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.getElementById('timeline-status-filter').value = timelineViewState.status;
  document.getElementById('timeline-person-filter').value = timelineViewState.person;
  document.getElementById('timeline-category-filter').value = timelineViewState.category;
  document.getElementById('timeline-sort').value = timelineViewState.sort;
  document.getElementById('timeline-show-subtasks').checked = timelineViewState.showSubtasks;
  document.getElementById('timeline-period-label').textContent = timelinePeriodLabel(bounds);
  document.getElementById('timeline-workyear-nav').classList.toggle('hidden', timelineViewState.window !== 'workyear');
  document.getElementById('timeline-result-count').textContent = `${entries.length} ${entries.length === 1 ? 'oppgave' : 'oppgaver'}`;
  legend.innerHTML = timelineLegendHtml(entries);
  updateTimelineFilterPanel();

  root.innerHTML = entries.length ? `
    <div class="timeline-frame"><div class="timeline-scroll" tabindex="0" aria-label="Tidslinje. Rull vannrett for å se flere datoer.">
      <div class="timeline-grid" style="--timeline-axis-width:${timelineAxisWidth(timelineViewState.window)}px;--timeline-grid-columns:${timelineGridColumns(timelineViewState.window)}">
        <div class="timeline-header-row">
          <div class="timeline-corner">Oppgave</div>${timelineAxisHeaderHtml(bounds, today)}
        </div>
        ${timelineRowsHtml(entries, bounds, today)}
      </div>
    </div></div>
  ` : '<div class="empty-state timeline-empty"><p>Ingen oppgaver finnes i dette tidsvinduet med valgte filtre.</p></div>';
}

function setTimelineWindow(mode) {
  if (!TIMELINE_VALID_WINDOWS.has(mode)) return;
  timelineViewState.window = mode;
  timelineViewState.workYearOffset = 0;
  localStorage.setItem(TIMELINE_WINDOW_KEY, mode);
  renderTimeline();
}

function shiftTimelineWorkYear(direction) {
  timelineViewState.workYearOffset += direction < 0 ? -1 : 1;
  renderTimeline();
}

function initTimeline() {
  document.getElementById('timeline-filter-toggle')?.addEventListener('click', toggleTimelineFilters);
  document.querySelectorAll('[data-timeline-window]').forEach(button => button.addEventListener('click', () => setTimelineWindow(button.dataset.timelineWindow)));
  document.getElementById('timeline-workyear-prev')?.addEventListener('click', () => shiftTimelineWorkYear(-1));
  document.getElementById('timeline-workyear-next')?.addEventListener('click', () => shiftTimelineWorkYear(1));
  document.getElementById('timeline-person-filter')?.addEventListener('change', event => { timelineViewState.person = event.target.value; renderTimeline(); });
  document.getElementById('timeline-category-filter')?.addEventListener('change', event => { timelineViewState.category = event.target.value; renderTimeline(); });
  document.getElementById('timeline-status-filter')?.addEventListener('change', event => { timelineViewState.status = event.target.value; renderTimeline(); });
  document.getElementById('timeline-sort')?.addEventListener('change', event => { timelineViewState.sort = event.target.value; renderTimeline(); });
  document.getElementById('timeline-show-subtasks')?.addEventListener('change', event => { timelineViewState.showSubtasks = event.target.checked; renderTimeline(); });
  document.getElementById('timeline-root')?.addEventListener('click', event => {
    const subtaskMarker = event.target.closest('.timeline-subtask-marker');
    if (subtaskMarker) {
      event.preventDefault();
      event.stopPropagation();
      const wasOpen = subtaskMarker.classList.contains('is-tooltip-open');
      document.querySelectorAll('.timeline-subtask-marker.is-tooltip-open').forEach(marker => marker.classList.remove('is-tooltip-open'));
      if (!wasOpen) subtaskMarker.classList.add('is-tooltip-open');
      return;
    }
    document.querySelectorAll('.timeline-subtask-marker.is-tooltip-open').forEach(marker => marker.classList.remove('is-tooltip-open'));
    const target = event.target.closest('[data-timeline-task-id]');
    if (target) openTaskModal(target.dataset.timelineTaskId);
  });
}
