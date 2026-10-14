/**
 * Student Task Manager - Frontend Controller
 * Connects to Cloudflare Worker REST API backed by Workers KV.
 */

// Helper to detect local development hosts (e.g. localhost, 127.0.0.1, Live Server)
function isLocalHost(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `http://${url}`);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
  } catch {
    return url.includes('localhost') || url.includes('127.0.0.1');
  }
}

// Canonical task statuses
const STATUS_PENDING = 'Pending';
const STATUS_IN_PROGRESS = 'In Progress';
const STATUS_COMPLETED = 'Completed';

// Normalize any status string to canonical casing
function normalizeStatus(status) {
  const s = (status || '').trim().toLowerCase();
  if (s === 'in progress' || s === 'inprogress' || s === 'progress') {
    return STATUS_IN_PROGRESS;
  }
  if (s === 'completed' || s === 'done') {
    return STATUS_COMPLETED;
  }
  return STATUS_PENDING;
}

// State transition rules:
// Pending -> In Progress (Label: 'Start')
// In Progress -> Completed (Label: 'Complete')
// Completed -> Pending (Label: 'Reopen')
function getStatusTransition(status) {
  const current = normalizeStatus(status);
  if (current === STATUS_PENDING) {
    return { nextStatus: STATUS_IN_PROGRESS, label: 'Start' };
  }
  if (current === STATUS_IN_PROGRESS) {
    return { nextStatus: STATUS_COMPLETED, label: 'Complete' };
  }
  if (current === STATUS_COMPLETED) {
    return { nextStatus: STATUS_PENDING, label: 'Reopen' };
  }
  return { nextStatus: STATUS_IN_PROGRESS, label: 'Start' };
}

// State
let tasks = [];
let apiBaseUrl = localStorage.getItem('stm_api_url') || '';


// Clean up any stale localhost values previously stored in localStorage
if (isLocalHost(apiBaseUrl)) {
  apiBaseUrl = '';
  localStorage.removeItem('stm_api_url');
}

// DOM Elements
const apiUrlInput = document.getElementById('apiUrlInput');
const saveApiBtn = document.getElementById('saveApiBtn');
const demoModeBtn = document.getElementById('demoModeBtn');
const apiStatusBadge = document.getElementById('apiStatusBadge');

const taskForm = document.getElementById('taskForm');
const taskTitle = document.getElementById('taskTitle');
const taskCourse = document.getElementById('taskCourse');
const taskDueDate = document.getElementById('taskDueDate');
const taskPriority = document.getElementById('taskPriority');
const taskStatus = document.getElementById('taskStatus');
const taskDescription = document.getElementById('taskDescription');

const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const priorityFilter = document.getElementById('priorityFilter');

const tasksList = document.getElementById('tasksList');
const emptyState = document.getElementById('emptyState');
const loadingIndicator = document.getElementById('loadingIndicator');

const metricTotal = document.getElementById('metricTotal');
const metricPending = document.getElementById('metricPending');
const metricInProgress = document.getElementById('metricInProgress');
const metricCompleted = document.getElementById('metricCompleted');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  // Only auto-bind origin if the application is running directly on a Cloudflare Worker / Pages domain
  if (!apiBaseUrl && window.location.hostname) {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith('.workers.dev') || host.endsWith('.pages.dev')) {
      apiBaseUrl = window.location.origin;
    }
  }

  if (apiBaseUrl) {
    apiUrlInput.value = apiBaseUrl;
  } else {
    apiUrlInput.value = '';
  }

  checkApiHealth();
  fetchTasks();

  // Event Listeners
  saveApiBtn.addEventListener('click', handleSaveApiUrl);
  if (demoModeBtn) {
    demoModeBtn.addEventListener('click', handleClearApiUrl);
  }
  taskForm.addEventListener('submit', handleAddTask);
  searchInput.addEventListener('input', renderTasks);
  statusFilter.addEventListener('change', renderTasks);
  priorityFilter.addEventListener('change', renderTasks);
});

// Configure API endpoint
function handleSaveApiUrl() {
  const val = apiUrlInput.value.trim().replace(/\/$/, '');

  if (!val) {
    handleClearApiUrl();
    return;
  }

  // Prevent user from setting localhost as a Cloudflare Worker URL
  if (isLocalHost(val)) {
    showToast('Localhost is not a Cloudflare Worker. Switched to Local Demo Mode.', 'info');
    handleClearApiUrl();
    return;
  }

  apiBaseUrl = val;
  localStorage.setItem('stm_api_url', apiBaseUrl);
  showToast('Worker API endpoint configured', 'success');
  checkApiHealth();
  fetchTasks();
}

// Reset to Local Demo Mode (localStorage)
function handleClearApiUrl() {
  apiBaseUrl = '';
  localStorage.removeItem('stm_api_url');
  apiUrlInput.value = '';
  showToast('Switched to Local Demo Mode (localStorage)', 'info');
  checkApiHealth();
  fetchTasks();
}

async function checkApiHealth() {
  if (!apiBaseUrl) {
    apiStatusBadge.textContent = 'Local Demo Mode (localStorage)';
    apiStatusBadge.className = 'status-indicator demo';
    return;
  }

  apiStatusBadge.textContent = 'Checking Worker...';
  apiStatusBadge.className = 'status-indicator';

  try {
    const res = await fetch(`${apiBaseUrl}/api/health`);
    if (res.ok) {
      apiStatusBadge.textContent = 'API Online (Workers KV)';
      apiStatusBadge.className = 'status-indicator online';
    } else {
      apiStatusBadge.textContent = `API Error (${res.status})`;
      apiStatusBadge.className = 'status-indicator offline';
    }
  } catch (err) {
    apiStatusBadge.textContent = 'Worker Unreachable';
    apiStatusBadge.className = 'status-indicator offline';
  }
}

// Fetch Tasks
async function fetchTasks() {
  showLoading(true);

  if (!apiBaseUrl) {
    // Demo Mock Data for classroom preview prior to Terraform deployment
    const savedLocal = localStorage.getItem('stm_mock_tasks');
    if (savedLocal) {
      tasks = JSON.parse(savedLocal);
    } else {
      tasks = [
        {
          id: 'task:sample-1',
          title: 'Provision Cloudflare Workers KV via Terraform',
          course: 'CS-450 Cloud Architecture',
          dueDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
          priority: 'High',
          status: 'In Progress',
          description: 'Define main.tf and variables.tf to automate Cloudflare KV namespace provisioning.',
        },
        {
          id: 'task:sample-2',
          title: 'Setup GitHub Actions CI/CD Secrets',
          course: 'CS-450 Cloud Architecture',
          dueDate: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
          priority: 'Medium',
          status: 'Pending',
          description: 'Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to repository secrets.',
        }
      ];
      localStorage.setItem('stm_mock_tasks', JSON.stringify(tasks));
    }
    showLoading(false);
    renderTasks();
    updateMetrics();
    return;
  }

  try {
    const res = await fetch(`${apiBaseUrl}/api/tasks`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    tasks = await res.json();
    renderTasks();
    updateMetrics();
  } catch (err) {
    console.error('Failed to load tasks from Worker:', err);
    showToast('Failed to load tasks from API', 'error');
  } finally {
    showLoading(false);
  }
}

// Add Task
async function handleAddTask(e) {
  e.preventDefault();

  const newTask = {
    title: taskTitle.value.trim(),
    course: taskCourse.value.trim() || 'General',
    dueDate: taskDueDate.value || null,
    priority: taskPriority.value,
    status: normalizeStatus(taskStatus.value),
    description: taskDescription.value.trim(),
  };

  if (!apiBaseUrl) {
    // Offline / Mock Mode
    newTask.id = `task:mock-${Date.now()}`;
    newTask.createdAt = new Date().toISOString();
    tasks.unshift(newTask);
    localStorage.setItem('stm_mock_tasks', JSON.stringify(tasks));
    showToast('Task saved to local storage (Demo Mode)', 'success');
    taskForm.reset();
    renderTasks();
    updateMetrics();
    return;
  }

  try {
    const res = await fetch(`${apiBaseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const created = await res.json();
    tasks.unshift(created);
    taskForm.reset();
    showToast('Task stored in Cloudflare Workers KV!', 'success');
    renderTasks();
    updateMetrics();
  } catch (err) {
    console.error('Error adding task:', err);
    showToast(`Error saving task to Cloudflare Worker (${err.message})`, 'error');
  }
}

// Update Task Status
async function updateStatus(taskId, explicitNextStatus) {
  const target = tasks.find(t => t.id === taskId);
  if (!target) {
    console.error('Task not found:', taskId);
    return;
  }

  // Determine transition explicitly
  const nextStatus = explicitNextStatus ? normalizeStatus(explicitNextStatus) : getStatusTransition(target.status).nextStatus;

  if (!apiBaseUrl) {
    target.status = nextStatus;
    target.updatedAt = new Date().toISOString();
    localStorage.setItem('stm_mock_tasks', JSON.stringify(tasks));
    renderTasks();
    updateMetrics();
    showToast(`Task marked as ${nextStatus}`, 'success');
    return;
  }

  try {
    const res = await fetch(`${apiBaseUrl}/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const updated = await res.json();
    tasks = tasks.map(t => t.id === taskId ? updated : t);
    renderTasks();
    updateMetrics();
    showToast(`Task marked as ${nextStatus}`, 'success');
  } catch (err) {
    console.error('Error updating task:', err);
    showToast(`Failed to update task status (${err.message})`, 'error');
  }
}

// Delete Task
async function deleteTask(taskId) {
  if (!confirm('Are you sure you want to delete this task?')) return;

  if (!apiBaseUrl) {
    tasks = tasks.filter(t => t.id !== taskId);
    localStorage.setItem('stm_mock_tasks', JSON.stringify(tasks));
    renderTasks();
    updateMetrics();
    showToast('Task removed from local storage (Demo Mode)', 'success');
    return;
  }

  try {
    const res = await fetch(`${apiBaseUrl}/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    tasks = tasks.filter(t => t.id !== taskId);
    renderTasks();
    updateMetrics();
    showToast('Task deleted from Workers KV', 'success');
  } catch (err) {
    console.error('Error deleting task:', err);
    showToast(`Failed to delete task (${err.message})`, 'error');
  }
}

// Render Tasks
function renderTasks() {
  const query = searchInput.value.toLowerCase().trim();
  const selectedStatus = statusFilter.value;
  const selectedPriority = priorityFilter.value;

  const filtered = tasks.filter(t => {
    const normStatus = normalizeStatus(t.status);
    const matchesSearch = !query || 
      t.title.toLowerCase().includes(query) || 
      (t.course && t.course.toLowerCase().includes(query)) ||
      (t.description && t.description.toLowerCase().includes(query));

    const matchesStatus = selectedStatus === 'ALL' || normStatus === selectedStatus;
    const matchesPriority = selectedPriority === 'ALL' || 
      (t.priority || '').trim().toLowerCase() === selectedPriority.toLowerCase();

    return matchesSearch && matchesStatus && matchesPriority;
  });

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    tasksList.innerHTML = '';
    return;
  }

  emptyState.style.display = 'none';
  tasksList.innerHTML = filtered.map(t => {
    const currentStatus = normalizeStatus(t.status);
    const { nextStatus, label: nextStatusLabel } = getStatusTransition(currentStatus);

    const statusClass = currentStatus === STATUS_COMPLETED ? 'badge-status-completed' :
                        currentStatus === STATUS_IN_PROGRESS ? 'badge-status-progress' : 'badge-status-pending';

    const prioNorm = (t.priority || '').trim().toLowerCase();
    const prioClass = prioNorm === 'high' ? 'badge-prio-high' :
                      prioNorm === 'medium' ? 'badge-prio-med' : 'badge-prio-low';

    return `
      <div class="task-item" data-id="${escapeHtml(t.id)}">
        <div class="task-top">
          <div>
            <div class="task-title">${escapeHtml(t.title)}</div>
            <small style="color: #6366f1; font-weight: 500;">${escapeHtml(t.course || 'General')}</small>
          </div>
          <div class="task-badges">
            <span class="badge ${prioClass}">${escapeHtml(t.priority || 'Medium')}</span>
            <span class="badge ${statusClass}">${escapeHtml(currentStatus)}</span>
          </div>
        </div>

        ${t.description ? `<p class="task-desc">${escapeHtml(t.description)}</p>` : ''}

        <div class="task-meta">
          <span>📅 Due: ${t.dueDate ? escapeHtml(t.dueDate) : 'No due date'}</span>
          <div class="task-actions">
            <button class="btn-sm" onclick="updateStatus('${escapeJs(t.id)}', '${nextStatus}')">
              ${nextStatusLabel}
            </button>
            <button class="btn-sm btn-danger" onclick="deleteTask('${escapeJs(t.id)}')">
              Delete
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Update Metric Counters
function updateMetrics() {
  const total = tasks.length;
  const pending = tasks.filter(t => normalizeStatus(t.status) === STATUS_PENDING).length;
  const progress = tasks.filter(t => normalizeStatus(t.status) === STATUS_IN_PROGRESS).length;
  const completed = tasks.filter(t => normalizeStatus(t.status) === STATUS_COMPLETED).length;

  metricTotal.textContent = total;
  metricPending.textContent = pending;
  metricInProgress.textContent = progress;
  metricCompleted.textContent = completed;
}

// Helpers
function showLoading(show) {
  loadingIndicator.style.display = show ? 'block' : 'none';
  if (show) emptyState.style.display = 'none';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

function escapeJs(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
