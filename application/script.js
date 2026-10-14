/**
 * Student Task Manager - Frontend Controller
 * Connects to Cloudflare Worker REST API backed by Workers KV.
 */

// State
let tasks = [];
let apiBaseUrl = localStorage.getItem('stm_api_url') || '';

// DOM Elements
const apiUrlInput = document.getElementById('apiUrlInput');
const saveApiBtn = document.getElementById('saveApiBtn');
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
  if (apiBaseUrl) {
    apiUrlInput.value = apiBaseUrl;
  } else if (window.location.origin && window.location.origin.startsWith('http')) {
    // If served directly from worker domain
    apiBaseUrl = window.location.origin;
    apiUrlInput.value = apiBaseUrl;
  }

  checkApiHealth();
  fetchTasks();

  // Event Listeners
  saveApiBtn.addEventListener('click', handleSaveApiUrl);
  taskForm.addEventListener('submit', handleAddTask);
  searchInput.addEventListener('input', renderTasks);
  statusFilter.addEventListener('change', renderTasks);
  priorityFilter.addEventListener('change', renderTasks);
});

// Configure API endpoint
function handleSaveApiUrl() {
  const val = apiUrlInput.value.trim().replace(/\/$/, '');
  apiBaseUrl = val;
  localStorage.setItem('stm_api_url', apiBaseUrl);
  showToast('API URL updated', 'success');
  checkApiHealth();
  fetchTasks();
}

async function checkApiHealth() {
  if (!apiBaseUrl) {
    apiStatusBadge.textContent = 'API Not Connected (Mock Mode)';
    apiStatusBadge.className = 'status-indicator offline';
    return;
  }

  try {
    const res = await fetch(`${apiBaseUrl}/api/health`);
    if (res.ok) {
      apiStatusBadge.textContent = 'API Online (Workers KV)';
      apiStatusBadge.className = 'status-indicator online';
    } else {
      apiStatusBadge.textContent = 'API Error';
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
    status: taskStatus.value,
    description: taskDescription.value.trim(),
  };

  if (!apiBaseUrl) {
    // Offline / Mock Mode
    newTask.id = `task:${Date.now()}`;
    newTask.createdAt = new Date().toISOString();
    tasks.unshift(newTask);
    localStorage.setItem('stm_mock_tasks', JSON.stringify(tasks));
    showToast('Task added (offline mock storage)', 'success');
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

    if (!res.ok) throw new Error(`HTTP error ${res.status}`);

    const created = await res.json();
    tasks.unshift(created);
    taskForm.reset();
    showToast('Task stored in Cloudflare Workers KV!', 'success');
    renderTasks();
    updateMetrics();
  } catch (err) {
    console.error('Error adding task:', err);
    showToast('Error saving task to Cloudflare Worker', 'error');
  }
}

// Update Task Status
async function updateStatus(taskId, nextStatus) {
  if (!apiBaseUrl) {
    const target = tasks.find(t => t.id === taskId);
    if (target) {
      target.status = nextStatus;
      localStorage.setItem('stm_mock_tasks', JSON.stringify(tasks));
      renderTasks();
      updateMetrics();
      showToast(`Task marked as ${nextStatus}`, 'success');
    }
    return;
  }

  try {
    const res = await fetch(`${apiBaseUrl}/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (!res.ok) throw new Error(`HTTP error ${res.status}`);

    const updated = await res.json();
    tasks = tasks.map(t => t.id === taskId ? updated : t);
    renderTasks();
    updateMetrics();
    showToast(`Task marked as ${nextStatus}`, 'success');
  } catch (err) {
    console.error('Error updating task:', err);
    showToast('Failed to update task status', 'error');
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
    showToast('Task removed (mock)', 'success');
    return;
  }

  try {
    const res = await fetch(`${apiBaseUrl}/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error(`HTTP error ${res.status}`);

    tasks = tasks.filter(t => t.id !== taskId);
    renderTasks();
    updateMetrics();
    showToast('Task deleted from Workers KV', 'success');
  } catch (err) {
    console.error('Error deleting task:', err);
    showToast('Failed to delete task', 'error');
  }
}

// Render Tasks
function renderTasks() {
  const query = searchInput.value.toLowerCase().trim();
  const selectedStatus = statusFilter.value;
  const selectedPriority = priorityFilter.value;

  const filtered = tasks.filter(t => {
    const matchesSearch = !query || 
      t.title.toLowerCase().includes(query) || 
      (t.course && t.course.toLowerCase().includes(query)) ||
      (t.description && t.description.toLowerCase().includes(query));

    const matchesStatus = selectedStatus === 'ALL' || t.status === selectedStatus;
    const matchesPriority = selectedPriority === 'ALL' || t.priority === selectedPriority;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    tasksList.innerHTML = '';
    return;
  }

  emptyState.style.display = 'none';
  tasksList.innerHTML = filtered.map(t => {
    const statusClass = t.status === 'Completed' ? 'badge-status-completed' :
                        t.status === 'In Progress' ? 'badge-status-progress' : 'badge-status-pending';

    const prioClass = t.priority === 'High' ? 'badge-prio-high' :
                      t.priority === 'Medium' ? 'badge-prio-med' : 'badge-prio-low';

    const nextStatus = t.status === 'Completed' ? 'Pending' :
                       t.status === 'Pending' ? 'In Progress' : 'Completed';
    const nextStatusLabel = t.status === 'Completed' ? 'Reopen' :
                            t.status === 'Pending' ? 'Start' : 'Complete';

    return `
      <div class="task-item" data-id="${t.id}">
        <div class="task-top">
          <div>
            <div class="task-title">${escapeHtml(t.title)}</div>
            <small style="color: #6366f1; font-weight: 500;">${escapeHtml(t.course || 'General')}</small>
          </div>
          <div class="task-badges">
            <span class="badge ${prioClass}">${t.priority}</span>
            <span class="badge ${statusClass}">${t.status}</span>
          </div>
        </div>

        ${t.description ? `<p class="task-desc">${escapeHtml(t.description)}</p>` : ''}

        <div class="task-meta">
          <span>📅 Due: ${t.dueDate ? escapeHtml(t.dueDate) : 'No due date'}</span>
          <div class="task-actions">
            <button class="btn-sm" onclick="updateStatus('${t.id}', '${nextStatus}')">
              ${nextStatusLabel}
            </button>
            <button class="btn-sm btn-danger" onclick="deleteTask('${t.id}')">
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
  const pending = tasks.filter(t => t.status === 'Pending').length;
  const progress = tasks.filter(t => t.status === 'In Progress').length;
  const completed = tasks.filter(t => t.status === 'Completed').length;

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
