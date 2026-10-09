// Per-person work ordering. Independent of the ToDo panel's sortOrder.
let worklistPersonId = null;
let worklistDrag = null;
let worklistSaving = false;
let worklistScrollFrame = null;
let worklistSuppressClickUntil = 0;

function worklistEntries(personId) {
  const tasks = state.tasks.filter(task => !task.deletedAt && !isDoneItem(task) &&
    task.status !== 'til_review' && taskInvolvement(task, personId).involved);
  const todos = state.todos.filter(todo => !todo.deletedAt && !isDoneItem(todo) && todo.assignedTo === personId);
  return [...tasks.map(item => ({ type: 'tasks', id: item.id, item })),
    ...todos.map(item => ({ type: 'todos', id: item.id, item }))];
}

function worklistKey(entry) { return entry.type + ':' + entry.id; }
function worklistRank(entry, personId) {
  const rank = entry.item.workRank?.[personId];
  return Number.isFinite(rank) ? rank : null;
}
function worklistStableOrder(a, b) {
  return String(a.item.title || '').localeCompare(String(b.item.title || ''), 'nb') ||
    worklistKey(a).localeCompare(worklistKey(b));
}
function worklistParts(personId) {
  const entries = worklistEntries(personId);
  return {
    ranked: entries.filter(entry => worklistRank(entry, personId) !== null)
      .sort((a, b) => worklistRank(a, personId) - worklistRank(b, personId) || worklistStableOrder(a, b)),
    unranked: entries.filter(entry => worklistRank(entry, personId) === null)
      .sort((a, b) => compareTasksByUrgency(a.item, b.item) || worklistStableOrder(a, b))
  };
}
function worklistAnnounce(message) {
  document.getElementById('worklist-live').textContent = message;
}

function worklistCard(entry, number, personId) {
  const item = entry.item;
  const involvement = entry.type === 'tasks' ? taskInvolvement(item, personId) : null;
  const reason = involvement && !involvement.owner
    ? [involvement.collaborator ? 'Deltaker' : '', involvement.subtaskAssignee ? 'Deloppgave: ' +
      involvement.subtaskTitles.slice(0, 2).join(', ') + (involvement.subtaskTitles.length > 2 ? ' +' + (involvement.subtaskTitles.length - 2) : '') : ''].filter(Boolean).join(' · ')
    : '';
  const signals = taskSignals(item).map(signal =>
    '<span class="risk-badge ' + signal.key + '">' + esc(signal.label) + '</span>').join('');
  const due = item.dueDate ? '<span class="due-date ' + dueDateClass(item.dueDate) + '">' +
    esc(formatDate(item.dueDate)) + (dueDateRelativeLabel(item) ? ' · ' + esc(dueDateRelativeLabel(item)) : '') + '</span>' : '';
  const typeIcon = entry.type === 'tasks'
    ? '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6"/>'
    : '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 12 3 3 7-7"/>';
  return '<div class="worklist-card" role="listitem" data-work-key="' + esc(worklistKey(entry)) + '">' +
    '<span class="worklist-number">' + (number || '') + '</span>' +
    '<button type="button" class="worklist-open" data-work-open aria-label="' + esc('Åpne ' + item.title) + '">' +
    '<span class="worklist-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-label="' +
    (entry.type === 'tasks' ? 'Oppgave' : 'ToDo') + '">' + typeIcon + '</svg><span>' + esc(item.title) + '</span></span>' +
    '<span class="worklist-meta">' + due + signals +
    '<span class="status-badge">' + esc(statusLabel(item.status)) + '</span>' +
    (entry.type === 'tasks' && isApprovedOpenTask(item) ? '<span class="risk-badge review-approved-badge">Review godkjent</span>' : '') +
    '</span>' + (reason ? '<span class="worklist-reason">' + esc(reason) + '</span>' : '') + '</button>' +
    (canEdit() ? '<div class="worklist-tools">' +
      '<button type="button" class="worklist-handle" data-work-drag title="Endre rekkefølge" aria-label="' + esc('Flytt ' + item.title) + '" aria-pressed="false">' +
      '<svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="4" r="1.4"/><circle cx="11" cy="4" r="1.4"/><circle cx="5" cy="9" r="1.4"/><circle cx="11" cy="9" r="1.4"/><circle cx="5" cy="14" r="1.4"/><circle cx="11" cy="14" r="1.4"/></svg></button>' +
      (number ? '<button type="button" class="worklist-unrank" data-work-unrank title="Fjern fra rangering" aria-label="' + esc('Fjern ' + item.title + ' fra rangering') +
        '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14"/></svg></button>' : '') +
      '</div>' : '') + '</div>';
}

function renderWorklist() {
  if (!state.user || worklistSaving || worklistDrag) return;
  if (!worklistPersonId || !state.users.some(user => user.id === worklistPersonId)) worklistPersonId = state.user.uid;
  const selector = document.getElementById('worklist-person');
  const users = state.users.slice();
  if (!users.some(user => user.id === state.user.uid)) users.unshift({ id: state.user.uid, displayName: state.profile?.displayName || 'Meg' });
  selector.innerHTML = users.map(user => '<option value="' + esc(user.id) + '">' + esc(user.displayName || user.email || user.id) + '</option>').join('');
  selector.value = worklistPersonId;
  selector.disabled = false;
  const parts = worklistParts(worklistPersonId);
  document.getElementById('worklist-count').textContent = parts.ranked.length + parts.unranked.length;
  const ranked = document.getElementById('worklist-ranked');
  ranked.innerHTML = parts.ranked.map((entry, index) => worklistCard(entry, index + 1, worklistPersonId)).join('');
  ranked.classList.toggle('worklist-drop-empty', !parts.ranked.length);
  if (!parts.ranked.length) ranked.innerHTML = '<span class="worklist-empty">' +
    (parts.unranked.length ? 'Ingen rangering ennå' : 'Ingen åpne oppgaver eller ToDo-er') + '</span>';
  document.getElementById('worklist-unranked').innerHTML = parts.unranked.map(entry => worklistCard(entry, null, worklistPersonId)).join('');
  document.getElementById('worklist-unranked-group').hidden = !parts.unranked.length;
}

function setLocalWorkRank(entry, personId, rank) {
  const item = state[entry.type].find(item => item.id === entry.id);
  if (!item) return;
  item.workRank = { ...(item.workRank || {}) };
  if (rank === null) delete item.workRank[personId];
  else item.workRank[personId] = rank;
}

async function saveWorklistOrder(key, orderedKeys, personId, remove = false) {
  if (worklistSaving || !canEdit()) return;
  const entries = worklistEntries(personId);
  const moved = entries.find(entry => worklistKey(entry) === key);
  if (!moved) { renderWorklist(); showToast('Elementet er endret eller ikke lenger i arbeidslisten.', 'error'); return; }
  const ordered = orderedKeys.map(key => entries.find(entry => worklistKey(entry) === key)).filter(Boolean);
  const index = ordered.findIndex(entry => worklistKey(entry) === key);
  if (!remove && (index < 0 || ordered.length !== orderedKeys.length)) {
    renderWorklist(); showToast('Arbeidslisten er endret. Se over den og prøv igjen.', 'error'); return;
  }
  const before = index > 0 ? worklistRank(ordered[index - 1], personId) : null;
  const after = index + 1 < ordered.length ? worklistRank(ordered[index + 1], personId) : null;
  const rank = remove ? null : before === null && after === null ? 1000 :
    before === null ? after - 1000 : after === null ? before + 1000 : before + (after - before) / 2;
  const normalize = !remove && (!Number.isFinite(rank) ||
    (before !== null && (rank <= before || rank - before < 0.001)) ||
    (after !== null && (rank >= after || after - rank < 0.001)));
  if (normalize && ordered.length > 500) {
    renderWorklist(); showToast('Arbeidslisten har mer enn 500 elementer. Flyttingen kan ikke normaliseres.', 'error'); return;
  }
  const changed = normalize ? ordered : [moved];
  const oldRanks = changed.map(entry => ({ entry, rank: worklistRank(entry, personId) }));
  changed.forEach((entry, i) => setLocalWorkRank(entry, personId, normalize ? (i + 1) * 1000 : rank));
  renderWorklist();
  worklistSaving = true;
  document.getElementById('worklist-person').disabled = true;
  try {
    if (normalize) await normalizeWorkRanks(ordered, personId);
    else await updateWorkRank(moved, personId, rank);
    worklistAnnounce(remove ? 'Fjernet fra rangering.' : 'Rekkefølgen er lagret.');
  } catch (error) {
    oldRanks.forEach(({ entry, rank }) => setLocalWorkRank(entry, personId, rank));
    try {
      const actual = await readWorklistItems(changed);
      actual.forEach(entry => {
        const items = state[entry.type], index = items.findIndex(item => item.id === entry.id);
        if (index >= 0 && entry.data) items[index] = { id: entry.id, ...entry.data };
        else if (index >= 0) items.splice(index, 1);
      });
    } catch (readError) { console.warn('Kunne ikke hente arbeidslisten på nytt', readError); }
    showToast('Kunne ikke lagre rekkefølgen. ' + (error.message || 'Prøv igjen.'), 'error');
  } finally {
    worklistSaving = false;
    renderWorklist();
    document.querySelector('[data-work-key="' + CSS.escape(key) + '"] [data-work-drag]')?.focus({ preventScroll: true });
  }
}

function worklistRankedKeys() {
  return [...document.querySelectorAll('#worklist-ranked [data-work-key]')].map(card => card.dataset.workKey);
}

function startWorklistDrag(drag, keyboard = false) {
  drag.active = true; drag.keyboard = keyboard;
  document.getElementById('worklist-person').disabled = true;
  const ranked = document.getElementById('worklist-ranked');
  ranked.querySelector('.worklist-empty')?.remove();
  ranked.classList.remove('worklist-drop-empty');
  if (keyboard) {
    if (drag.card.parentElement !== ranked) ranked.appendChild(drag.card);
    drag.card.classList.add('worklist-moving');
    drag.handle.setAttribute('aria-pressed', 'true');
    drag.handle.focus();
  } else {
    const rect = drag.card.getBoundingClientRect();
    drag.offsetX = drag.x - rect.left; drag.offsetY = drag.y - rect.top;
    drag.placeholder = document.createElement('div');
    drag.placeholder.className = 'worklist-placeholder';
    drag.placeholder.style.height = rect.height + 'px';
    if (drag.card.parentElement === ranked) drag.card.replaceWith(drag.placeholder);
    else { drag.card.remove(); ranked.appendChild(drag.placeholder); }
    document.body.appendChild(drag.card);
    Object.assign(drag.card.style, { position: 'fixed', width: rect.width + 'px', height: rect.height + 'px', left: rect.left + 'px', top: rect.top + 'px' });
    drag.card.classList.add('worklist-dragging');
    document.body.classList.add('worklist-is-dragging');
    try { drag.handle.setPointerCapture(drag.pointerId); } catch (_) { /* A cancelled pointer has no capture. */ }
    worklistScrollFrame = requestAnimationFrame(worklistAutoScroll);
    moveWorklistPointer(drag);
  }
  worklistAnnounce('Flytting startet: ' + drag.title);
}

function moveWorklistPointer(drag) {
  drag.card.style.left = (drag.x - drag.offsetX) + 'px';
  drag.card.style.top = (drag.y - drag.offsetY) + 'px';
  const ranked = document.getElementById('worklist-ranked');
  const viewport = document.getElementById('worklist-scroll').getBoundingClientRect();
  if (drag.x < viewport.left || drag.x > viewport.right || drag.y < viewport.top - 35 || drag.y > viewport.bottom + 35) return;
  const cards = [...ranked.querySelectorAll('.worklist-card')];
  const next = cards.find(card => { const rect = card.getBoundingClientRect(); return drag.y < rect.top + rect.height / 2; });
  ranked.insertBefore(drag.placeholder, next || null);
}

function worklistAutoScroll() {
  const drag = worklistDrag;
  if (!drag?.active || drag.keyboard) return;
  const scroller = document.getElementById('worklist-scroll'), rect = scroller.getBoundingClientRect();
  if (drag.x >= rect.left && drag.x <= rect.right && drag.y >= rect.top - 35 && drag.y <= rect.bottom + 35) {
    const speed = drag.y < rect.top + 48 ? -14 : drag.y > rect.bottom - 48 ? 14 : 0;
    scroller.scrollTop += speed;
    if (speed) moveWorklistPointer(drag);
  }
  worklistScrollFrame = requestAnimationFrame(worklistAutoScroll);
}

function finishWorklistDrag(commit) {
  const drag = worklistDrag;
  if (!drag) return;
  clearTimeout(drag.timer);
  cancelAnimationFrame(worklistScrollFrame);
  if (drag.active) {
    if (!drag.keyboard) {
      try { drag.handle.releasePointerCapture(drag.pointerId); } catch (_) { /* Capture may already be released. */ }
      drag.placeholder.replaceWith(drag.card);
      drag.card.removeAttribute('style');
    }
    drag.card.classList.remove('worklist-dragging', 'worklist-moving');
    drag.handle.setAttribute('aria-pressed', 'false');
    document.body.classList.remove('worklist-is-dragging');
    worklistSuppressClickUntil = Date.now() + 250;
  }
  const keys = worklistRankedKeys();
  worklistDrag = null;
  if (commit && drag.active) void saveWorklistOrder(drag.key, keys, drag.personId);
  else { renderWorklist(); if (drag.active) worklistAnnounce('Flyttingen er avbrutt.'); }
}

function initWorklist() {
  const section = document.getElementById('worklist-section');
  const toggle = document.getElementById('worklist-toggle'), scroll = document.getElementById('worklist-scroll');
  let collapsed = false;
  try { collapsed = localStorage.getItem('strawberry-worklist-collapsed') === 'true'; } catch (_) {}
  const applyCollapse = () => { scroll.hidden = collapsed; toggle.setAttribute('aria-expanded', String(!collapsed)); };
  applyCollapse();
  toggle.addEventListener('click', () => {
    if (worklistSaving || worklistDrag) return;
    collapsed = !collapsed; applyCollapse();
    try { localStorage.setItem('strawberry-worklist-collapsed', String(collapsed)); } catch (_) {}
  });
  document.getElementById('worklist-person').addEventListener('change', event => {
    worklistPersonId = event.target.value; renderWorklist();
  });
  section.addEventListener('click', event => {
    if (Date.now() < worklistSuppressClickUntil || worklistSaving || worklistDrag) return;
    const card = event.target.closest('[data-work-key]');
    if (!card) return;
    const key = card.dataset.workKey;
    const entry = worklistEntries(worklistPersonId).find(entry => worklistKey(entry) === key);
    if (!entry) return;
    if (event.target.closest('[data-work-unrank]')) void saveWorklistOrder(key, [], worklistPersonId, true);
    else if (event.target.closest('[data-work-open]')) {
      if (entry.type === 'tasks') openTaskModal(entry.id);
      else openTodoEditModal(entry.id, event);
    }
  });
  section.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-work-drag]');
    if (!handle || !canEdit() || worklistSaving || worklistDrag || !event.isPrimary || event.button !== 0) return;
    const card = handle.closest('[data-work-key]');
    const entry = worklistEntries(worklistPersonId).find(entry => worklistKey(entry) === card.dataset.workKey);
    if (!entry) return;
    const drag = worklistDrag = { card, handle, key: card.dataset.workKey, title: entry.item.title,
      personId: worklistPersonId, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY, active: false };
    if (event.pointerType === 'mouse') { event.preventDefault(); startWorklistDrag(drag); }
    else drag.timer = setTimeout(() => { if (worklistDrag === drag) startWorklistDrag(drag); }, 200);
  });
  document.addEventListener('pointermove', event => {
    const drag = worklistDrag;
    if (!drag || drag.keyboard || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.active) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 10) finishWorklistDrag(false);
      return;
    }
    event.preventDefault(); moveWorklistPointer(drag);
  }, { passive: false });
  document.addEventListener('pointerup', event => {
    const drag = worklistDrag;
    if (!drag || drag.keyboard || drag.pointerId !== event.pointerId) return;
    const rect = scroll.getBoundingClientRect();
    finishWorklistDrag(drag.active && event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom);
  });
  document.addEventListener('pointercancel', event => {
    if (worklistDrag?.pointerId === event.pointerId) finishWorklistDrag(false);
  });
  document.addEventListener('keydown', event => {
    const drag = worklistDrag;
    if (event.key === 'Escape' && drag) { event.preventDefault(); finishWorklistDrag(false); return; }
    const handle = event.target.closest('[data-work-drag]');
    if (!handle || !canEdit() || worklistSaving) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (drag?.keyboard) finishWorklistDrag(true);
      else if (!drag) {
        const card = handle.closest('[data-work-key]');
        worklistDrag = { card, handle, key: card.dataset.workKey, title: card.querySelector('.worklist-title').textContent, personId: worklistPersonId };
        startWorklistDrag(worklistDrag, true);
      }
    } else if (drag?.keyboard && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const list = document.getElementById('worklist-ranked'), card = drag.card;
      if (event.key === 'ArrowUp' && card.previousElementSibling) list.insertBefore(card, card.previousElementSibling);
      if (event.key === 'ArrowDown' && card.nextElementSibling) list.insertBefore(card.nextElementSibling, card);
      if (event.key === 'Home') list.prepend(card);
      if (event.key === 'End') list.append(card);
      drag.handle.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
      worklistAnnounce('Plass ' + (worklistRankedKeys().indexOf(drag.key) + 1));
    }
  });
  window.addEventListener('blur', () => { if (worklistDrag) finishWorklistDrag(false); });
}
