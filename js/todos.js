// ============================================================
// TODOS.JS - ToDo-visning og handlinger
// Klassisk script: delte hjelpere og state defineres i app.js.
// ============================================================

function scopedTodos() {
  return state.dashboardScope === 'mine'
    ? state.todos.filter(isMineItem)
    : state.todos;
}

function todoCardHtml(todo) {
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
    </span>` : `<span class="unassigned-chip">Ikke tildelt</span>`;
  const signalHtml = taskSignals(todo).map(s => `<span class="risk-badge ${s.key}">${s.label}</span>`).join('');
  const canChange = canEdit() || isMineItem(todo);
  const description = (todo.description || '').trim();
  const descriptionHtml = description ? `
    <div class="todo-description-preview">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="14" y2="18"/></svg>
      <span>${esc(description)}</span>
    </div>` : '';

  return `
    <div class="todo-card priority-${priority}" role="button" tabindex="0"
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
          <button class="btn-icon-danger todo-delete-btn" type="button" onclick="handleDeleteTodo(${inlineJsArg(todo.id)}, event)" title="Slett ToDo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
    if (form.id === 'quick-todo-form') form.classList.remove('is-open');
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
    showToast('ToDo slettet');
  } catch(e) {
    console.error('Todo delete error:', e);
    showToast('Feil ved sletting av ToDo.', 'error');
  }
}

function renderTodosView() {
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
  todos.sort(compareTasksByUrgency);

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

function todoPanelIsOverlay() {
  return window.matchMedia('(max-width: 1280px)').matches;
}

function todoPanelIsAvailable() {
  return canEdit() && ['dashboard', 'tasks'].includes(state.currentView);
}

function renderTodoPanel() {
  const layer = document.getElementById('todo-panel-layer');
  const launcher = document.getElementById('todo-panel-launcher');
  const list = document.getElementById('todo-panel-list');
  if (!layer || !launcher || !list) return;

  const available = todoPanelIsAvailable();
  const overlay = todoPanelIsOverlay();
  const openTodos = scopedTodos().filter(todo => !isDoneItem(todo)).sort(compareTasksByUrgency);
  const countText = `${openTodos.length} åpne`;
  document.getElementById('todo-panel-count').textContent = countText;
  document.getElementById('todo-panel-launcher-count').textContent = openTodos.length;

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
// TABS
