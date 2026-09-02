// ============================================================
// TODOS.JS - ToDo-visning og handlinger
// Klassisk script: delte hjelpere og state defineres i app.js.
// ============================================================

let todoPanelAssigneeOverridden = false;
const TODO_SORT_STEP = 1000;
const TODO_SORT_MIN_GAP = 0.001;
const TODO_TOUCH_HOLD_MS = 200;
let todoDragState = null;
let todoOrderSaving = false;
let todoOrderRenderDeferred = false;
let todoAutoScrollFrame = null;
let todoConversionInProgress = false;

function todoCreatedAtMillis(todo) {
  const createdAt = todo && todo.createdAt;
  if (!createdAt) return 0;
  if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
  const date = toDate(createdAt);
  return date ? date.getTime() : 0;
}

function compareTodosByManualOrder(a, b) {
  const aHasOrder = Number.isFinite(a && a.sortOrder);
  const bHasOrder = Number.isFinite(b && b.sortOrder);
  if (aHasOrder && bHasOrder && a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
  return todoCreatedAtMillis(b) - todoCreatedAtMillis(a) || String(a.id).localeCompare(String(b.id));
}

function todoOrderInteractionActive() {
  return Boolean(todoOrderSaving || (todoDragState && todoDragState.active));
}

function scopedTodos() {
  return state.dashboardScope === 'mine'
    ? state.todos.filter(isMineItem)
    : state.todos;
}

function todoCardHtml(todo, options = {}) {
  const sortable = options.sortable !== false;
  const priority = ['høy', 'medium', 'lav'].includes(todo.priority) ? todo.priority : 'medium';
  const dateClass = dueDateClass(todo.dueDate);
  const assignee = state.users.find(u => u.id === todo.assignedTo);
  const relativeDue = dueDateRelativeLabel(todo);
  const dueDateHtml = todo.dueDate ? `
    <span class="due-date ${dateClass}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      ${formatDate(todo.dueDate)}${relativeDue ? ` · ${relativeDue}` : ''}
    </span>` : '';
  const assigneeHtml = assignee ? `
    <span class="assignee-chip">
      ${assignee.photoURL
        ? `<img src="${esc(assignee.photoURL)}" class="assignee-avatar" alt="" />`
        : `<span class="assignee-avatar">${initials(assignee.displayName || assignee.email)}</span>`}
      <span>${esc(assignee.displayName || assignee.email)}</span>
    </span>` : '';
  const signalHtml = taskSignals(todo).map(s => `<span class="risk-badge ${s.key}">${s.label}</span>`).join('');
  const canChange = canEdit() || isMineItem(todo);
  const canReorder = sortable && canEdit() && !isDoneItem(todo);
  const description = (todo.description || '').trim();
  const descriptionHtml = description ? `
    <div class="todo-description-preview">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="14" y2="18"/></svg>
      <span>${esc(description)}</span>
    </div>` : '';

  return `
    <div class="todo-card priority-${priority}" role="button" tabindex="0" data-todo-id="${esc(todo.id)}"
      onclick="openTodoEditModal(${inlineJsArg(todo.id)}, event)"
      onkeydown="handleTodoCardKey(event, ${inlineJsArg(todo.id)})"
      aria-label="Åpne ToDo: ${esc(todo.title)}">
      <button class="todo-check-btn ${isDoneItem(todo) ? 'checked' : ''}"
        type="button"
        onclick="toggleTodoDone(${inlineJsArg(todo.id)}, event)"
        ${!canChange ? 'disabled' : ''}
        title="${isDoneItem(todo) ? 'Angre fullført' : 'Marker som fullført'}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <div class="todo-card-main">
        <div class="todo-title">${esc(todo.title)}</div>
        ${descriptionHtml}
        <div class="todo-meta">
          ${signalHtml}
          <span class="priority-badge ${priority}">
            <span class="priority-dot ${priority}"></span>
            ${priority === 'høy' ? 'Haster' : priority === 'lav' ? 'Lav' : 'Normal'}
          </span>
          ${assigneeHtml}
          ${dueDateHtml}
        </div>
      </div>
      ${canEdit() ? `
        <div class="todo-actions">
          ${canReorder ? `
            <button class="todo-drag-handle" type="button"
              onclick="handleTodoDragHandleClick(event)"
              onkeydown="handleTodoDragHandleKey(event, ${inlineJsArg(todo.id)})"
              aria-label="Flytt ToDo: ${esc(todo.title)}" title="Flytt ToDo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>
            </button>` : ''}
          <button class="btn-icon-danger todo-delete-btn" type="button" onclick="handleDeleteTodo(${inlineJsArg(todo.id)}, event)" title="Slett ToDo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>` : ''}
    </div>`;
}

async function handleAddTodo(e) {
  e.preventDefault();
  if (!canEdit()) {
    showToast('Du må være Admin eller Teamleder for å legge til ToDo.', 'error');
    return;
  }

  const form = e.currentTarget;
  const titleEl = form.querySelector('[data-todo-title]');
  const assigneeEl = form.querySelector('[data-todo-assignee]');
  const dueDateEl = form.querySelector('[data-todo-due-date]');
  const priorityEl = form.querySelector('[data-todo-priority]');
  const assigneeId = assigneeEl ? assigneeEl.value : '';
  const dueStr = dueDateEl ? dueDateEl.value : '';
  const priority = priorityEl ? priorityEl.value : 'medium';
  const title = titleEl.value.trim();
  if (!title) return;

  const assignee = state.users.find(u => u.id === assigneeId);
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;

  try {
    await createTodo({
      title,
      description: '',
      priority,
      assignedTo: assigneeId || null,
      assignedToName: assignee ? (assignee.displayName || assignee.email) : null,
      dueDate: dueStr ? firebase.firestore.Timestamp.fromDate(new Date(dueStr)) : null,
    });
    form.reset();
    if (priorityEl) priorityEl.value = 'medium';
    if (form.id === 'quick-todo-form') {
      form.classList.remove('is-open');
    } else if (form.id === 'todo-panel-form') {
      todoPanelAssigneeOverridden = false;
      syncTodoPanelAssigneeControls();
    }
    titleEl.focus();
    showToast('ToDo lagt til');
  } catch(e) {
    console.error('Todo create error:', e);
    const message = e && e.code === 'permission-denied'
      ? 'Kunne ikke lagre ToDo. Firestore-reglene må oppdateres først.'
      : 'Feil ved lagring av ToDo.';
    showToast(message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function toggleTodoDone(todoId, event) {
  if (event) event.stopPropagation();
  const todo = state.todos.find(t => t.id === todoId);
  if (!todo) return;
  if (!canEdit() && todo.assignedTo !== state.user.uid) return;

  try {
    await updateTodo(todoId, {
      status: isDoneItem(todo) ? 'apen' : 'fullfort',
      completedAt: isDoneItem(todo) ? null : firebase.firestore.FieldValue.serverTimestamp(),
      completedBy: isDoneItem(todo) ? null : state.user.uid,
    });
    showToast(isDoneItem(todo) ? 'ToDo åpnet igjen' : 'ToDo fullført');
  } catch(e) {
    console.error('Todo status error:', e);
    showToast('Feil ved oppdatering av ToDo.', 'error');
  }
}

async function handleDeleteTodo(todoId, event) {
  if (event) event.stopPropagation();
  const todo = state.todos.find(t => t.id === todoId);
  const confirmed = await showConfirm('Slett ToDo', `Er du sikker på at du vil slette "${todo ? todo.title : 'denne ToDo-en'}"?`);
  if (!confirmed) return;

  try {
    await deleteTodo(todoId);
    showTodoDeletedToast(todoId);
  } catch(e) {
    console.error('Todo delete error:', e);
    showToast('Feil ved sletting av ToDo.', 'error');
  }
}

function showTodoDeletedToast(todoId) {
  showToast('ToDo slettet', 'success', {
    actionLabel: 'Angre',
    onAction: async () => {
      try {
        await restoreTodo(todoId);
        showToast('ToDo gjenopprettet');
      } catch (error) {
        console.error('Todo restore error:', error);
        showToast('Kunne ikke gjenopprette ToDo-en.', 'error');
      }
    }
  });
}

function renderTodosView() {
  if (todoOrderInteractionActive()) {
    todoOrderRenderDeferred = true;
    return;
  }
  document.querySelectorAll('.todo-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.todoStatus === state.todoViewFilter);
  });

  const priorityEl = document.getElementById('todo-filter-priority');
  const assigneeEl = document.getElementById('todo-filter-assignee');
  if (priorityEl) priorityEl.value = state.todoViewPriority;
  if (assigneeEl) assigneeEl.value = state.todoViewAssignee;

  let todos = state.todos;
  if (state.todoViewFilter === 'open') {
    todos = todos.filter(t => !isDoneItem(t));
  } else {
    todos = todos.filter(t => isDoneItem(t));
  }
  if (state.todoViewPriority) todos = todos.filter(t => t.priority === state.todoViewPriority);
  if (state.todoViewAssignee) todos = todos.filter(t => t.assignedTo === state.todoViewAssignee);
  todos.sort(state.todoViewFilter === 'open' ? compareTodosByManualOrder : compareTasksByUrgency);

  const el = document.getElementById('todos-view-list');
  if (!el) return;

  if (!todos.length) {
    const hasFilters = state.todoViewPriority || state.todoViewAssignee;
    el.innerHTML = hasFilters
      ? `<div class="empty-state">
           <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
           <strong>Ingen treff</strong>
           <p>Ingen ToDo-er matcher filteret. Prøv å endre filter.</p>
         </div>`
      : state.todoViewFilter === 'done'
        ? `<div class="empty-state"><p>Ingen fullførte ToDo-er ennå</p></div>`
        : `<div class="empty-state">
             <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
             <strong>Ingen åpne ToDo-er</strong>
             <p>Legg til en ny kort ToDo for å komme i gang.</p>
             ${canEdit() ? `<button class="btn btn-primary" onclick="document.getElementById('quick-todo-form').classList.add('is-open');document.getElementById('todo-title').focus()">+ Legg til ToDo</button>` : ''}
           </div>`;
    return;
  }
  el.innerHTML = todos.map(todoCardHtml).join('');
}

function openTodoEditModal(todoId, event) {
  if (event) event.stopPropagation();
  const todo = state.todos.find(t => t.id === todoId);
  if (!todo) return;

  document.getElementById('todo-edit-id').value = todoId;
  document.getElementById('todo-edit-title-input').value = todo.title || '';
  document.getElementById('todo-edit-description').value = todo.description || '';

  const formOpts = ['<option value="">Ingen tildelt</option>',
    ...state.users.map(u => `<option value="${esc(u.id)}">${esc(u.displayName || u.email)}</option>`)
  ].join('');
  const assigneeEl = document.getElementById('todo-edit-assignee');
  assigneeEl.innerHTML = formOpts;
  assigneeEl.value = todo.assignedTo || '';

  const dueDate = toDate(todo.dueDate);
  document.getElementById('todo-edit-due-date').value = dueDate
    ? dueDate.toISOString().slice(0, 10)
    : '';

  document.getElementById('todo-edit-priority').value = todo.priority || 'medium';

  const editable = canEdit();
  document.getElementById('todo-edit-title-input').readOnly = !editable;
  document.getElementById('todo-edit-description').readOnly = !editable;
  assigneeEl.disabled = !editable;
  document.getElementById('todo-edit-due-date').disabled = !editable;
  document.getElementById('todo-edit-priority').disabled = !editable;
  document.getElementById('todo-edit-save').classList.toggle('hidden', !editable);
  const deleteButton = document.getElementById('todo-edit-delete');
  deleteButton.classList.toggle('hidden', !editable);
  deleteButton.disabled = false;
  const convertButton = document.getElementById('todo-edit-convert');
  convertButton.classList.toggle('hidden', !editable || isDoneItem(todo));
  convertButton.disabled = false;

  document.getElementById('todo-edit-modal').classList.remove('hidden');
  document.getElementById('todo-edit-title-input').focus();
}

function closeTodoEditModal() {
  document.getElementById('todo-edit-modal').classList.add('hidden');
}

async function handleSaveTodoEdit() {
  if (!canEdit()) return;
  const todoId = document.getElementById('todo-edit-id').value;
  const title = document.getElementById('todo-edit-title-input').value.trim();
  const description = document.getElementById('todo-edit-description').value.trim();
  if (!title) {
    showToast('Tittel kan ikke være tom.', 'error');
    return;
  }

  const assigneeId = document.getElementById('todo-edit-assignee').value;
  const dueStr = document.getElementById('todo-edit-due-date').value;
  const priority = document.getElementById('todo-edit-priority').value;
  const assignee = state.users.find(u => u.id === assigneeId);

  const saveBtn = document.getElementById('todo-edit-save');
  saveBtn.disabled = true;

  try {
    await updateTodo(todoId, {
      title,
      description,
      priority,
      assignedTo: assigneeId || null,
      assignedToName: assignee ? (assignee.displayName || assignee.email) : null,
      dueDate: dueStr ? firebase.firestore.Timestamp.fromDate(new Date(dueStr)) : null,
    });
    closeTodoEditModal();
    showToast('ToDo oppdatert');
  } catch (e) {
    console.error('Todo update error:', e);
    const message = e && e.code === 'permission-denied'
      ? 'Ingen tilgang til å redigere ToDo.'
      : 'Feil ved lagring av ToDo.';
    showToast(message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

async function handleDeleteTodoFromModal() {
  if (!canEdit()) return;
  const todoId = document.getElementById('todo-edit-id').value;
  const todo = state.todos.find(item => item.id === todoId);
  const confirmed = await showConfirm('Slett ToDo', `Er du sikker på at du vil slette "${todo ? todo.title : 'denne ToDo-en'}"?`);
  if (!confirmed) return;

  const deleteButton = document.getElementById('todo-edit-delete');
  deleteButton.disabled = true;
  try {
    await deleteTodo(todoId);
    closeTodoEditModal();
    showTodoDeletedToast(todoId);
  } catch (error) {
    console.error('Todo modal delete error:', error);
    showToast('Feil ved sletting av ToDo.', 'error');
  } finally {
    deleteButton.disabled = false;
  }
}

async function handleConvertTodoToTask() {
  if (!canEdit() || todoConversionInProgress) return;

  const todoId = document.getElementById('todo-edit-id').value;
  const title = document.getElementById('todo-edit-title-input').value.trim();
  const description = document.getElementById('todo-edit-description').value.trim();
  if (!title) {
    showToast('Tittel kan ikke være tom.', 'error');
    return;
  }

  const assigneeId = document.getElementById('todo-edit-assignee').value;
  const assignee = state.users.find(user => user.id === assigneeId);
  const dueStr = document.getElementById('todo-edit-due-date').value;
  const priority = document.getElementById('todo-edit-priority').value;
  const convertButton = document.getElementById('todo-edit-convert');

  todoConversionInProgress = true;
  convertButton.disabled = true;
  let conversionCommitted = false;

  try {
    const confirmed = await showConfirm(
      'Konverter til oppgave',
      `Vil du konvertere "${title}" til en oppgave? ToDo-en arkiveres når oppgaven er opprettet.`,
      { confirmText: 'Konverter', confirmStyle: 'primary' }
    );
    if (!confirmed) return;

    const taskId = await convertTodoToTask(todoId, {
      title,
      description,
      priority,
      categoryId: null,
      categoryName: null,
      categoryColor: null,
      status: 'ikke_startet',
      assignedTo: assigneeId || null,
      assignedToName: assignee ? (assignee.displayName || assignee.email) : null,
      startDate: null,
      dueDate: dueStr ? firebase.firestore.Timestamp.fromDate(new Date(dueStr)) : null,
      dependencies: '',
      subtasks: [],
    });
    conversionCommitted = true;

    closeTodoEditModal();
    showToast('ToDo konvertert til oppgave');
    const createdTask = await getTask(taskId);
    if (!createdTask) throw new Error('CREATED_TASK_NOT_FOUND');
    await openTaskModal(taskId, createdTask);
  } catch (error) {
    console.error('Todo conversion error:', error);
    if (conversionCommitted) {
      showToast('ToDo-en ble konvertert, men oppgaven kunne ikke åpnes automatisk.', 'error');
    } else if (error && error.message === 'TODO_NOT_FOUND') {
      closeTodoEditModal();
      showToast('ToDo-en finnes ikke lenger. Ingen oppgave ble opprettet.', 'error');
    } else if (error && error.message === 'TODO_NOT_OPEN') {
      closeTodoEditModal();
      showToast('ToDo-en er allerede fullført og kan ikke konverteres.', 'error');
    } else {
      showToast('Kunne ikke konvertere ToDo-en. Ingen endringer ble lagret.', 'error');
    }
  } finally {
    todoConversionInProgress = false;
    convertButton.disabled = false;
  }
}

function todoPanelIsOverlay() {
  return window.matchMedia('(max-width: 1280px)').matches;
}

function todoPanelIsAvailable() {
  return canEdit() && ['dashboard', 'tasks'].includes(state.currentView);
}

function todoPanelDefaultAssigneeId() {
  return state.currentView === 'dashboard' && state.dashboardScope === 'mine'
    ? state.user?.uid || ''
    : '';
}

function todoPanelAssigneeOptions(forChip = false) {
  const currentUserId = state.user?.uid || '';
  const users = [...state.users];
  if (currentUserId && !users.some(user => user.id === currentUserId)) {
    users.unshift({
      id: currentUserId,
      displayName: state.profile?.displayName || state.user?.displayName || state.user?.email || 'Meg'
    });
  }

  return [
    `<option value="">${forChip ? 'Ikke tildelt' : 'Ingen tildelt'}</option>`,
    ...users.map(user => {
      const label = user.id === currentUserId ? 'Meg' : (user.displayName || user.email);
      return `<option value="${esc(user.id)}">${esc(label)}</option>`;
    })
  ].join('');
}

function syncTodoPanelAssigneeControls() {
  const chip = document.getElementById('todo-panel-assignee-chip');
  const field = document.getElementById('todo-panel-assignee');
  if (!chip || !field) return;

  const selected = todoPanelAssigneeOverridden
    ? (field.value || chip.value || '')
    : todoPanelDefaultAssigneeId();

  chip.innerHTML = todoPanelAssigneeOptions(true);
  field.innerHTML = todoPanelAssigneeOptions(false);
  chip.value = selected;
  field.value = selected;
}

function handleTodoPanelAssigneeChange(event) {
  todoPanelAssigneeOverridden = true;
  const selected = event.currentTarget.value;
  document.getElementById('todo-panel-assignee-chip').value = selected;
  document.getElementById('todo-panel-assignee').value = selected;
}

function renderTodoPanel() {
  if (todoOrderInteractionActive()) {
    todoOrderRenderDeferred = true;
    return;
  }
  const layer = document.getElementById('todo-panel-layer');
  const launcher = document.getElementById('todo-panel-launcher');
  const list = document.getElementById('todo-panel-list');
  if (!layer || !launcher || !list) return;

  const available = todoPanelIsAvailable();
  const overlay = todoPanelIsOverlay();
  const openTodos = scopedTodos().filter(todo => !isDoneItem(todo)).sort(compareTodosByManualOrder);
  const countText = `${openTodos.length} åpne`;
  document.getElementById('todo-panel-count').textContent = countText;
  document.getElementById('todo-panel-launcher-count').textContent = openTodos.length;
  syncTodoPanelAssigneeControls();

  layer.classList.toggle('is-overlay', overlay);
  layer.classList.toggle('is-collapsed', !overlay && state.todoPanelCollapsed);
  layer.classList.toggle('hidden', !available || (overlay && !state.todoPanelOpen));
  layer.setAttribute('aria-hidden', String(!available || (overlay && !state.todoPanelOpen)));
  launcher.classList.toggle('hidden', !available || !overlay || state.todoPanelOpen);

  const collapseButton = document.getElementById('todo-panel-collapse');
  collapseButton.setAttribute('aria-label', overlay ? 'Lukk ToDo-panel' : (state.todoPanelCollapsed ? 'Utvid ToDo-panel' : 'Kollaps ToDo-panel'));
  collapseButton.title = collapseButton.getAttribute('aria-label');

  list.innerHTML = openTodos.length
    ? openTodos.map(todoCardHtml).join('')
    : '<div class="empty-state compact-empty"><p>Ingen åpne ToDo-er i denne visningen</p></div>';
}

function toggleTodoPanelCollapsed() {
  if (todoPanelIsOverlay()) {
    closeTodoPanel();
    return;
  }
  state.todoPanelCollapsed = !state.todoPanelCollapsed;
  localStorage.setItem('todoPanelCollapsed', String(state.todoPanelCollapsed));
  renderTodoPanel();
}

function openTodoPanel() {
  if (!todoPanelIsAvailable()) return;
  state.todoPanelOpen = true;
  renderTodoPanel();
  document.getElementById('todo-panel-title-input')?.focus();
}

function closeTodoPanel() {
  if (!todoPanelIsOverlay()) return;
  state.todoPanelOpen = false;
  renderTodoPanel();
}

function isTodoPanelOverlayOpen() {
  return todoPanelIsOverlay() && state.todoPanelOpen && todoPanelIsAvailable();
}

function toggleTodoPanelOptions() {
  const options = document.getElementById('todo-panel-options');
  const button = document.getElementById('todo-panel-more');
  const expanding = options.classList.contains('hidden');
  options.classList.toggle('hidden', !expanding);
  button.setAttribute('aria-expanded', String(expanding));
  button.textContent = expanding ? 'Færre valg' : 'Flere valg';
}

function openTodosViewFromPanel() {
  state.todoPanelOpen = false;
  showView('todos');
}

function handleTodoCardKey(event, todoId) {
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  openTodoEditModal(todoId, event);
}

// ============================================================
// MANUELL TODO-REKKEFØLGE
// ============================================================

function todoListCards(list) {
  return list
    ? Array.from(list.children).filter(child => child.classList.contains('todo-card') && child.dataset.todoId)
    : [];
}

function todoListIds(list) {
  return todoListCards(list).map(card => card.dataset.todoId);
}

function sameTodoOrder(a, b) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function announceTodoOrder(message) {
  const live = document.getElementById('todo-order-live');
  if (!live) return;
  live.textContent = '';
  window.setTimeout(() => { live.textContent = message; }, 20);
}

function animateTodoListMutation(list, mutate) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const before = new Map(todoListCards(list).map(card => [card, card.getBoundingClientRect().top]));
  mutate();
  if (reduceMotion) return;

  todoListCards(list).forEach(card => {
    if (card.classList.contains('is-dragging')) return;
    const previousTop = before.get(card);
    if (previousTop == null) return;
    const delta = previousTop - card.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) return;
    card.animate(
      [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
      { duration: 140, easing: 'ease-out' }
    );
  });
}

function restoreTodoListOrder(list, orderedIds) {
  const cards = new Map(todoListCards(list).map(card => [card.dataset.todoId, card]));
  orderedIds.forEach(id => {
    const card = cards.get(id);
    if (card) list.appendChild(card);
  });
}

function renderTodoOrderingSurfaces() {
  todoOrderRenderDeferred = false;
  if (state.currentView === 'todos') renderTodosView();
  renderTodoPanel();
}

function setLocalTodoSortOrders(orderedIds) {
  orderedIds.forEach((id, index) => {
    const todo = state.todos.find(item => item.id === id);
    if (todo) todo.sortOrder = (index + 1) * TODO_SORT_STEP;
  });
}

async function normalizeOpenTodoOrder() {
  const ordered = state.todos.filter(todo => !isDoneItem(todo)).sort(compareTodosByManualOrder);
  const orderedIds = ordered.map(todo => todo.id);
  await normalizeTodoSortOrders(orderedIds, TODO_SORT_STEP);
  setLocalTodoSortOrders(orderedIds);
  return orderedIds;
}

function todoSortAnchors(todoId, visibleOrderIds) {
  const globalIds = state.todos
    .filter(todo => !isDoneItem(todo) && todo.id !== todoId)
    .sort(compareTodosByManualOrder)
    .map(todo => todo.id);
  const visibleIndex = visibleOrderIds.indexOf(todoId);
  const previousVisibleId = visibleIndex > 0 ? visibleOrderIds[visibleIndex - 1] : null;
  const nextVisibleId = visibleIndex >= 0 && visibleIndex < visibleOrderIds.length - 1
    ? visibleOrderIds[visibleIndex + 1]
    : null;

  if (nextVisibleId && globalIds.includes(nextVisibleId)) {
    const nextIndex = globalIds.indexOf(nextVisibleId);
    return {
      previousId: nextIndex > 0 ? globalIds[nextIndex - 1] : null,
      nextId: nextVisibleId
    };
  }
  if (previousVisibleId && globalIds.includes(previousVisibleId)) {
    const previousIndex = globalIds.indexOf(previousVisibleId);
    return {
      previousId: previousVisibleId,
      nextId: globalIds[previousIndex + 1] || null
    };
  }
  return { previousId: null, nextId: globalIds[0] || null };
}

function todoOrderFromAnchors(anchors) {
  const previous = anchors.previousId
    ? state.todos.find(todo => todo.id === anchors.previousId)
    : null;
  const next = anchors.nextId
    ? state.todos.find(todo => todo.id === anchors.nextId)
    : null;
  const previousOrder = Number.isFinite(previous && previous.sortOrder) ? previous.sortOrder : null;
  const nextOrder = Number.isFinite(next && next.sortOrder) ? next.sortOrder : null;

  if (previousOrder != null && nextOrder != null) return (previousOrder + nextOrder) / 2;
  if (previousOrder != null) return previousOrder + TODO_SORT_STEP;
  if (nextOrder != null) return nextOrder - TODO_SORT_STEP;
  return TODO_SORT_STEP;
}

function todoAnchorGapTooSmall(anchors) {
  if (!anchors.previousId || !anchors.nextId) return false;
  const previous = state.todos.find(todo => todo.id === anchors.previousId);
  const next = state.todos.find(todo => todo.id === anchors.nextId);
  return !Number.isFinite(previous && previous.sortOrder)
    || !Number.isFinite(next && next.sortOrder)
    || next.sortOrder - previous.sortOrder <= TODO_SORT_MIN_GAP;
}

async function persistTodoReorder(todoId, visibleOrderIds) {
  const openTodos = state.todos.filter(todo => !isDoneItem(todo));
  if (openTodos.some(todo => !Number.isFinite(todo.sortOrder))) {
    await normalizeOpenTodoOrder();
  }

  let anchors = todoSortAnchors(todoId, visibleOrderIds);
  if (todoAnchorGapTooSmall(anchors)) {
    await normalizeOpenTodoOrder();
    anchors = todoSortAnchors(todoId, visibleOrderIds);
  }

  const todo = state.todos.find(item => item.id === todoId);
  if (!todo || isDoneItem(todo)) throw new Error('todo-not-available');
  const previousOrder = todo.sortOrder;
  const nextOrder = todoOrderFromAnchors(anchors);
  todo.sortOrder = nextOrder;

  try {
    await updateTodoSortOrder(todoId, nextOrder);
  } catch (error) {
    const currentTodo = state.todos.find(item => item.id === todoId);
    if (currentTodo) currentTodo.sortOrder = previousOrder;
    throw error;
  }
}

async function commitTodoReorder(todoId, originalIds, visibleOrderIds) {
  if (sameTodoOrder(originalIds, visibleOrderIds)) {
    todoDragState = null;
    if (todoOrderRenderDeferred) renderTodoOrderingSurfaces();
    announceTodoOrder('Rekkefølgen er uendret.');
    return;
  }

  todoOrderSaving = true;
  todoDragState = null;
  try {
    await persistTodoReorder(todoId, visibleOrderIds);
    announceTodoOrder(`ToDo flyttet til plass ${visibleOrderIds.indexOf(todoId) + 1}.`);
  } catch (error) {
    console.error('Todo reorder error:', error);
    showToast('Kunne ikke lagre ny rekkefølge. Forrige rekkefølge er gjenopprettet.', 'error');
    announceTodoOrder('Flyttingen mislyktes. Forrige rekkefølge er gjenopprettet.');
  } finally {
    todoOrderSaving = false;
    renderTodoOrderingSurfaces();
  }
}

function handleTodoDragHandleClick(event) {
  event.preventDefault();
  event.stopPropagation();
}

function cancelPendingTodoDrag() {
  if (!todoDragState || todoDragState.active) return;
  window.clearTimeout(todoDragState.holdTimer);
  todoDragState = null;
}

function beginPointerTodoDrag(event) {
  const drag = todoDragState;
  if (!drag || drag.active) return;
  const rect = drag.card.getBoundingClientRect();
  const placeholder = document.createElement('div');
  placeholder.className = 'todo-drag-placeholder';
  placeholder.style.height = `${rect.height}px`;

  drag.active = true;
  drag.placeholder = placeholder;
  drag.offsetX = event.clientX - rect.left;
  drag.offsetY = event.clientY - rect.top;
  drag.width = rect.width;
  drag.height = rect.height;
  drag.lastClientX = event.clientX;
  drag.lastClientY = event.clientY;

  drag.list.replaceChild(placeholder, drag.card);
  document.body.appendChild(drag.card);
  drag.card.classList.add('is-dragging');
  drag.card.setAttribute('aria-hidden', 'true');
  drag.card.style.width = `${rect.width}px`;
  drag.card.style.height = `${rect.height}px`;
  positionPointerTodoCard(event.clientX, event.clientY);
  document.body.classList.add('todo-is-dragging');
  try { drag.handle.setPointerCapture(event.pointerId); } catch (_) {}
  announceTodoOrder(`Flytter ${drag.title}. Dra opp eller ned og slipp for å plassere.`);
}

function positionPointerTodoCard(clientX, clientY) {
  const drag = todoDragState;
  if (!drag || !drag.active || drag.mode !== 'pointer') return;
  drag.card.style.left = `${clientX - drag.offsetX}px`;
  drag.card.style.top = `${clientY - drag.offsetY}px`;
}

function updatePointerTodoTarget(clientY) {
  const drag = todoDragState;
  if (!drag || !drag.active || drag.mode !== 'pointer') return;
  const siblings = Array.from(drag.list.children).filter(child => child.classList.contains('todo-card'));
  const target = siblings.find(card => clientY < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2);
  const currentNext = drag.placeholder.nextElementSibling;
  if ((target && currentNext === target) || (!target && !currentNext)) return;
  animateTodoListMutation(drag.list, () => {
    drag.list.insertBefore(drag.placeholder, target || null);
  });
}

function todoAutoScrollSpeed(clientY) {
  const drag = todoDragState;
  if (!drag || !drag.active || drag.mode !== 'pointer') return { target: null, speed: 0 };
  const threshold = 52;
  const listRect = drag.list.getBoundingClientRect();
  if (drag.list.scrollHeight > drag.list.clientHeight + 1) {
    if (clientY < listRect.top + threshold && drag.list.scrollTop > 0) return { target: drag.list, speed: -12 };
    if (clientY > listRect.bottom - threshold && drag.list.scrollTop + drag.list.clientHeight < drag.list.scrollHeight) {
      return { target: drag.list, speed: 12 };
    }
  }
  if (clientY < threshold && window.scrollY > 0) return { target: window, speed: -12 };
  if (clientY > window.innerHeight - threshold) return { target: window, speed: 12 };
  return { target: null, speed: 0 };
}

function runTodoAutoScroll() {
  todoAutoScrollFrame = null;
  const drag = todoDragState;
  if (!drag || !drag.active || drag.mode !== 'pointer') return;
  const scroll = todoAutoScrollSpeed(drag.lastClientY);
  if (!scroll.target || !scroll.speed) return;
  if (scroll.target === window) window.scrollBy(0, scroll.speed);
  else scroll.target.scrollTop += scroll.speed;
  updatePointerTodoTarget(drag.lastClientY);
  todoAutoScrollFrame = window.requestAnimationFrame(runTodoAutoScroll);
}

function ensureTodoAutoScroll() {
  if (todoAutoScrollFrame == null) todoAutoScrollFrame = window.requestAnimationFrame(runTodoAutoScroll);
}

function cleanupPointerTodoDrag(commit, event) {
  const drag = todoDragState;
  if (!drag || !drag.active || drag.mode !== 'pointer') return;
  if (todoAutoScrollFrame != null) window.cancelAnimationFrame(todoAutoScrollFrame);
  todoAutoScrollFrame = null;
  try { drag.handle.releasePointerCapture(drag.pointerId); } catch (_) {}

  drag.placeholder.replaceWith(drag.card);
  drag.card.classList.remove('is-dragging');
  drag.card.removeAttribute('aria-hidden');
  drag.card.removeAttribute('style');
  document.body.classList.remove('todo-is-dragging');

  if (!commit) {
    restoreTodoListOrder(drag.list, drag.originalIds);
    todoDragState = null;
    if (todoOrderRenderDeferred) renderTodoOrderingSurfaces();
    announceTodoOrder('Flyttingen ble avbrutt.');
    drag.handle.focus();
    return;
  }

  const visibleOrderIds = todoListIds(drag.list);
  commitTodoReorder(drag.todoId, drag.originalIds, visibleOrderIds);
  event?.preventDefault();
}

function handleTodoPointerDown(event) {
  const handle = event.target.closest('.todo-drag-handle');
  if (!handle || event.button !== 0 || !event.isPrimary || todoOrderInteractionActive() || todoDragState) return;
  const card = handle.closest('.todo-card');
  const list = card && card.parentElement;
  const todo = card && state.todos.find(item => item.id === card.dataset.todoId);
  if (!card || !list || !list.matches('[data-todo-sort-list]') || !todo || isDoneItem(todo) || !canEdit()) return;

  event.stopPropagation();
  todoDragState = {
    mode: 'pointer',
    active: false,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    handle,
    card,
    list,
    todoId: todo.id,
    title: todo.title || 'ToDo',
    originalIds: todoListIds(list),
    startX: event.clientX,
    startY: event.clientY,
    holdTimer: null
  };

  if (event.pointerType === 'touch' || event.pointerType === 'pen') {
    todoDragState.holdTimer = window.setTimeout(() => beginPointerTodoDrag(event), TODO_TOUCH_HOLD_MS);
  } else {
    event.preventDefault();
    beginPointerTodoDrag(event);
  }
}

function handleTodoPointerMove(event) {
  const drag = todoDragState;
  if (!drag || drag.mode !== 'pointer' || event.pointerId !== drag.pointerId) return;
  if (!drag.active) {
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance > 10) cancelPendingTodoDrag();
    return;
  }
  event.preventDefault();
  drag.lastClientX = event.clientX;
  drag.lastClientY = event.clientY;
  positionPointerTodoCard(event.clientX, event.clientY);
  updatePointerTodoTarget(event.clientY);
  ensureTodoAutoScroll();
}

function handleTodoPointerUp(event) {
  const drag = todoDragState;
  if (!drag || drag.mode !== 'pointer' || event.pointerId !== drag.pointerId) return;
  if (!drag.active) {
    cancelPendingTodoDrag();
    return;
  }
  const rect = drag.list.getBoundingClientRect();
  const insideList = event.clientX >= rect.left && event.clientX <= rect.right
    && event.clientY >= rect.top && event.clientY <= rect.bottom;
  cleanupPointerTodoDrag(insideList, event);
}

function handleTodoPointerCancel(event) {
  const drag = todoDragState;
  if (!drag || drag.mode !== 'pointer' || event.pointerId !== drag.pointerId) return;
  if (drag.active) cleanupPointerTodoDrag(false, event);
  else cancelPendingTodoDrag();
}

function beginKeyboardTodoDrag(handle, todoId) {
  const card = handle.closest('.todo-card');
  const list = card && card.parentElement;
  const todo = state.todos.find(item => item.id === todoId);
  if (!card || !list || !todo || isDoneItem(todo) || !canEdit()) return;
  todoDragState = {
    mode: 'keyboard',
    active: true,
    handle,
    card,
    list,
    todoId,
    title: todo.title || 'ToDo',
    originalIds: todoListIds(list)
  };
  card.classList.add('is-keyboard-dragging');
  handle.setAttribute('aria-pressed', 'true');
  announceTodoOrder(`Flyttemodus for ${todoDragState.title}. Bruk pil opp eller ned, Enter for å lagre, Escape for å avbryte.`);
}

function finishKeyboardTodoDrag(commit) {
  const drag = todoDragState;
  if (!drag || !drag.active || drag.mode !== 'keyboard') return;
  if (!commit) restoreTodoListOrder(drag.list, drag.originalIds);
  drag.card.classList.remove('is-keyboard-dragging');
  drag.handle.removeAttribute('aria-pressed');
  const visibleOrderIds = todoListIds(drag.list);
  if (!commit) {
    todoDragState = null;
    if (todoOrderRenderDeferred) renderTodoOrderingSurfaces();
    announceTodoOrder('Flyttingen ble avbrutt.');
    drag.handle.focus();
    return;
  }
  commitTodoReorder(drag.todoId, drag.originalIds, visibleOrderIds);
}

function handleTodoDragHandleKey(event, todoId) {
  if (!['Enter', ' ', 'ArrowUp', 'ArrowDown', 'Escape'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();

  if (!todoDragState) {
    if (event.key === 'Enter' || event.key === ' ') beginKeyboardTodoDrag(event.currentTarget, todoId);
    return;
  }
  if (todoDragState.mode !== 'keyboard' || todoDragState.todoId !== todoId) return;
  if (event.key === 'Escape') {
    finishKeyboardTodoDrag(false);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    finishKeyboardTodoDrag(true);
    return;
  }

  const drag = todoDragState;
  const cards = todoListCards(drag.list);
  const index = cards.indexOf(drag.card);
  const nextIndex = event.key === 'ArrowUp' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= cards.length) {
    announceTodoOrder(`ToDo-en er allerede ${event.key === 'ArrowUp' ? 'øverst' : 'nederst'}.`);
    return;
  }
  const target = cards[nextIndex];
  animateTodoListMutation(drag.list, () => {
    if (event.key === 'ArrowUp') drag.list.insertBefore(drag.card, target);
    else drag.list.insertBefore(drag.card, target.nextSibling);
  });
  drag.handle.focus();
  announceTodoOrder(`Plass ${todoListCards(drag.list).indexOf(drag.card) + 1} av ${cards.length}.`);
}

document.addEventListener('pointerdown', handleTodoPointerDown);
document.addEventListener('pointermove', handleTodoPointerMove, { passive: false });
document.addEventListener('pointerup', handleTodoPointerUp);
document.addEventListener('pointercancel', handleTodoPointerCancel);

// ============================================================
// TABS
