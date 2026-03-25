/* ═══════════════════════════════════════════════════════════
   PLANFLOW — TASKS ENGINE
   tasks.js — add, delete, complete tasks, Firebase sync,
              sidebar nav, bar charts, line charts, history,
              streak counter, overview donuts
═══════════════════════════════════════════════════════════ */

import { db } from "./firebase.js";
import {
  collection,
  doc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import {
  getDateKey,
  getPeriodLabel,
  getPeriodSubtitle,
  formatKeyAsLabel,
  formatKeyAsFullLabel,
  calcPct,
  calcTrendScore,
  showToast,
  setSyncStatus,
  updateNavBadge,
  escapeHtml
} from "./firebase.js";


/* ══════════════════════════════════════════
   CONSTANTS & STATE
══════════════════════════════════════════ */
const TYPES   = ["daily", "weekly", "monthly", "yearly"];
const MAX     = 3;   // max tasks per period
const CIRC    = 238.8; // SVG donut circumference (2π × r=38)

// Chart.js colors matching CSS variables
const CHART_COLORS = {
  daily:   { bar: "#6366f1", line: "#818cf8", bg: "#6366f118" },
  weekly:  { bar: "#f59e0b", line: "#fbbf24", bg: "#f59e0b18" },
  monthly: { bar: "#10b981", line: "#34d399", bg: "#10b98118" },
  yearly:  { bar: "#ef4444", line: "#f87171", bg: "#ef444418" },
};

// Per-type view offsets (0 = current, -1 = previous, etc.)
const offsets = { daily: 0, weekly: 0, monthly: 0, yearly: 0 };

// All task data fetched from Firebase — keyed by type → periodKey → items[]
const allData = { daily: {}, weekly: {}, monthly: {}, yearly: {} };

// Chart.js instances — destroyed and rebuilt on data change
const charts = {};

// Current user ID — set when planflow:userReady fires
let userId = null;


/* ══════════════════════════════════════════
   BOOT — wait for auth to confirm user
══════════════════════════════════════════ */
window.addEventListener("planflow:userReady", (e) => {
  userId = e.detail.uid;
  bootApp();
});

// Fallback: if userReady already fired before this script ran
if (window.__userId) {
  userId = window.__userId;
  bootApp();
}


/* ══════════════════════════════════════════
   BOOT APP
══════════════════════════════════════════ */
function bootApp() {
  setupTabNav();
  setupPeriodNavArrows();
  setupAddButtons();
  setupEnterKeys();
  TYPES.forEach(type => listenToType(type));
}


/* ══════════════════════════════════════════
   FIREBASE LISTENERS
   Each type gets its own real-time listener.
   When any document in the collection changes
   (from ANY device), the UI updates instantly.
══════════════════════════════════════════ */
function listenToType(type) {
  const col = collection(db, "users", userId, type);

  onSnapshot(col, (snap) => {
    snap.forEach(docSnap => {
      allData[type][docSnap.id] = docSnap.data().items || [];
    });

    // Re-render everything for this type
    renderSection(type);
    renderHistory(type);
    buildBarChart(type);
    buildLineChart(type);
    updateOverviewDonut(type);
    updateNavBadge(type, allData[type][getDateKey(type, 0)] || []);
    updateStreak();
  });
}


/* ── SAVE to Firebase ── */
async function saveToFirebase(type, key, items) {
  setSyncStatus("saving");
  try {
    const ref = doc(db, "users", userId, type, key);
    await setDoc(ref, { items });
    setSyncStatus("synced");
  } catch (err) {
    console.error("Save error:", err);
    setSyncStatus("error");
    showToast("Failed to save. Check your connection.", "error");
  }
}


/* ══════════════════════════════════════════
   RENDER CURRENT PERIOD SECTION
══════════════════════════════════════════ */
function renderSection(type) {
  const offset  = offsets[type];
  const key     = getDateKey(type, offset);
  const isNow   = offset === 0;
  const items   = allData[type][key] || [];
  const total   = items.length;
  const done    = items.filter(t => t.done).length;
  const pct     = calcPct(items);

  // ── Period nav label
  const navLabel = document.getElementById(`${type}-nav-label`);
  if (navLabel) navLabel.textContent = getPeriodLabel(type, offset);

  // ── Panel subtitle
  const subtitle = document.getElementById(`${type}-subtitle`);
  if (subtitle) subtitle.textContent = getPeriodSubtitle(type, offset);

  // ── Disable "next" arrow when on current period
  const nextBtn = document.getElementById(`${type}-next`);
  if (nextBtn) nextBtn.disabled = isNow;

  // ── Progress card
  const barEl  = document.getElementById(`${type}-bar`);
  const pctEl  = document.getElementById(`${type}-pct`);
  const metaEl = document.getElementById(`${type}-meta`);
  if (barEl)  barEl.style.width = pct + "%";
  if (pctEl)  pctEl.textContent  = pct + "%";
  if (metaEl) metaEl.textContent = `${done} of ${total} task${total !== 1 ? "s" : ""} completed`;

  // ── Task list
  const listEl = document.getElementById(`${type}-list`);
  if (!listEl) return;

  if (total === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <rect x="4" y="4" width="28" height="28" rx="6" stroke="#3a3a5c" stroke-width="1.5"/>
          <path d="M12 18h12M12 13h8M12 23h6" stroke="#3a3a5c" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <p>${isNow ? "No tasks yet — add one below" : "No tasks recorded for this period"}</p>
      </div>`;
  } else {
    listEl.innerHTML = items.map((task, i) => buildTaskCard(type, key, task, i, isNow)).join("");
  }

  // ── Add box and limit note visibility
  const addBox   = document.getElementById(`${type}-add-box`);
  const limitNote = document.getElementById(`${type}-limit-note`);

  if (addBox) {
    // Show add form only on current period AND under 3 tasks
    addBox.style.display = (isNow && total < MAX) ? "flex" : "none";
  }
  if (limitNote) {
    limitNote.style.display = isNow ? "block" : "none";
    if (isNow && total >= MAX) {
      limitNote.textContent = "Maximum 3 tasks reached — complete or delete one to add more";
      limitNote.style.color = "var(--warning)";
    } else {
      limitNote.textContent = `Maximum ${MAX} tasks per ${type === "daily" ? "day" : type === "weekly" ? "week" : type === "monthly" ? "month" : "year"} — stay focused`;
      limitNote.style.color = "";
    }
  }
}


/* ── BUILD TASK CARD HTML ── */
function buildTaskCard(type, key, task, index, isNow) {
  const checked = task.done ? "checked" : "";
  const doneClass = task.done ? "done" : "";
  const text = escapeHtml(task.text);

  return `
    <div class="task-card ${doneClass}" data-index="${index}">
      <button
        class="task-checkbox ${checked}"
        data-action="toggle"
        data-type="${type}"
        data-key="${key}"
        data-index="${index}"
        title="${task.done ? "Mark incomplete" : "Mark complete"}"
        aria-label="${task.done ? "Mark as incomplete" : "Mark as complete"}"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5"
            stroke="#fff"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"/>
        </svg>
      </button>

      <span class="task-text">${text}</span>
      <span class="task-num">${index + 1}/${MAX}</span>

      ${isNow ? `
        <button
          class="task-delete-btn"
          data-action="delete"
          data-type="${type}"
          data-key="${key}"
          data-index="${index}"
          title="Delete task"
          aria-label="Delete task"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"/>
          </svg>
        </button>
      ` : ""}
    </div>`;
}


/* ══════════════════════════════════════════
   RENDER HISTORY CARDS
══════════════════════════════════════════ */
function renderHistory(type) {
  const histEl = document.getElementById(`${type}-history`);
  if (!histEl) return;

  const currentKey = getDateKey(type, 0);
  const color      = CHART_COLORS[type].bar;

  // Get all past keys sorted newest first, skip current period
  const pastKeys = Object.keys(allData[type])
    .filter(k => k !== currentKey && (allData[type][k] || []).length > 0)
    .sort()
    .reverse()
    .slice(0, 10);  // show last 10 periods

  if (pastKeys.length === 0) {
    histEl.innerHTML = `
      <div class="empty-state" style="padding:1rem 0">
        <p>No history yet — completed periods will appear here</p>
      </div>`;
    return;
  }

  histEl.innerHTML = pastKeys.map(key => {
    const items  = allData[type][key] || [];
    const pct    = calcPct(items);
    const done   = items.filter(t => t.done).length;
    const undone = items.filter(t => !t.done).length;
    const label  = formatKeyAsFullLabel(type, key);

    return `
      <div class="history-card">
        <div class="history-card-top">
          <span class="history-card-period">${label}</span>
          <span class="history-card-pct" style="color:${color}">${pct}%</span>
        </div>
        <div class="history-mini-bar">
          <div class="history-mini-fill"
            style="background:${color};width:${pct}%"></div>
        </div>
        <div class="history-task-items">
          ${items.map(t => `
            <div class="history-task-row ${t.done ? "completed" : "incomplete"}">
              <div class="history-task-dot"
                style="background:${t.done ? "var(--success)" : "var(--border-strong)"}">
              </div>
              <span>${escapeHtml(t.text)}</span>
            </div>`).join("")}
        </div>
      </div>`;
  }).join("");
}


/* ══════════════════════════════════════════
   BAR CHART
   Y-axis: % completion (0–100%)
   X-axis: date labels
   Each bar = one period's completion rate
══════════════════════════════════════════ */
function buildBarChart(type) {
  const canvasId = `chart-${type}-bar`;
  const canvas   = document.getElementById(canvasId);
  if (!canvas) return;

  const limits = { daily: 14, weekly: 12, monthly: 12, yearly: 10 };
  const col    = CHART_COLORS[type];

  // Get sorted keys and slice to limit
  const sorted = Object.keys(allData[type]).sort();
  const slice  = sorted.slice(-limits[type]);

  const labels = slice.map(k => formatKeyAsLabel(type, k));
  const values = slice.map(k => calcPct(allData[type][k] || []));

  // Destroy old chart if exists
  if (charts[`${type}-bar`]) {
    charts[`${type}-bar`].destroy();
  }

  charts[`${type}-bar`] = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "% Completed",
        data: values,
        backgroundColor: values.map(v =>
          v === 100 ? col.bar + "cc" :
          v >= 67   ? col.bar + "99" :
          v >= 33   ? col.bar + "66" :
                      col.bar + "44"
        ),
        borderColor:  col.bar,
        borderWidth:  1.5,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1a1a2e",
          borderColor:     col.bar,
          borderWidth:     1,
          titleColor:      "#f0f0ff",
          bodyColor:       "#9898b8",
          padding:         10,
          callbacks: {
            title:  items => items[0].label,
            label:  item  => ` ${item.raw}% completed`,
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color:       "#5a5a7a",
            font:        { size: 11, family: "'Inter', sans-serif" },
            maxRotation: 45,
            minRotation: 0,
          },
          grid: { color: "#ffffff08" },
          border: { color: "#ffffff0d" }
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color:     "#5a5a7a",
            font:      { size: 11, family: "'Inter', sans-serif" },
            callback: v => v + "%",
            stepSize:  25,
          },
          grid: { color: "#ffffff08" },
          border: { color: "#ffffff0d" }
        }
      },
      animation: {
        duration: 600,
        easing:   "easeOutQuart"
      }
    }
  });
}


/* ══════════════════════════════════════════
   LINE CHART — TREND SCORE
   Shows running completion score over time.
   Goes UP when tasks completed → feels like progress.
   Goes DOWN when tasks incomplete → shows gap.
   Starts at 50, clamped 0–100.
══════════════════════════════════════════ */
function buildLineChart(type) {
  const canvasId = `chart-${type}-line`;
  const canvas   = document.getElementById(canvasId);
  if (!canvas) return;

  const limits = { daily: 14, weekly: 12, monthly: 12, yearly: 10 };
  const col    = CHART_COLORS[type];

  const sorted = Object.keys(allData[type]).sort();
  const slice  = sorted.slice(-limits[type]);

  const labels = slice.map(k => formatKeyAsLabel(type, k));
  const scores = calcTrendScore(slice, allData[type]);

  if (charts[`${type}-line`]) {
    charts[`${type}-line`].destroy();
  }

  charts[`${type}-line`] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label:           "Trend Score",
        data:            scores,
        borderColor:     col.line,
        backgroundColor: col.bg,
        borderWidth:     2.5,
        tension:         0.4,
        fill:            true,
        pointRadius:     4,
        pointHoverRadius: 6,
        pointBackgroundColor: col.bar,
        pointBorderColor:     "#0a0a0f",
        pointBorderWidth:     2,
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1a1a2e",
          borderColor:     col.line,
          borderWidth:     1,
          titleColor:      "#f0f0ff",
          bodyColor:       "#9898b8",
          padding:         10,
          callbacks: {
            title: items => items[0].label,
            label: item  => {
              const v = item.raw;
              const trend = v >= 67 ? "Strong" : v >= 34 ? "Building" : "Needs work";
              return ` Score: ${v} — ${trend}`;
            }
          }
        },
        // Horizontal reference line at 50 (neutral)
        annotation: undefined
      },
      scales: {
        x: {
          ticks: {
            color:       "#5a5a7a",
            font:        { size: 11, family: "'Inter', sans-serif" },
            maxRotation: 45,
          },
          grid:   { color: "#ffffff08" },
          border: { color: "#ffffff0d" }
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color:    "#5a5a7a",
            font:     { size: 11, family: "'Inter', sans-serif" },
            stepSize: 25,
            callback: v => {
              if (v === 100) return "Peak";
              if (v === 75)  return "Strong";
              if (v === 50)  return "Mid";
              if (v === 25)  return "Low";
              if (v === 0)   return "Zero";
              return "";
            }
          },
          grid: {
            color: ctx =>
              ctx.tick.value === 50
                ? "#ffffff20"   // highlight midline
                : "#ffffff08",
          },
          border: { color: "#ffffff0d" }
        }
      },
      animation: {
        duration: 800,
        easing:   "easeOutQuart"
      }
    }
  });
}


/* ══════════════════════════════════════════
   OVERVIEW — DONUT CHARTS
══════════════════════════════════════════ */
function updateOverviewDonut(type) {
  const key   = getDateKey(type, 0);
  const items = allData[type][key] || [];
  const pct   = calcPct(items);
  const done  = items.filter(t => t.done).length;
  const total = items.length;

  // Update text
  const pctEl  = document.getElementById(`ov-${type}-pct`);
  const doneEl = document.getElementById(`ov-${type}-done`);
  if (pctEl)  pctEl.textContent  = pct + "%";
  if (doneEl) doneEl.textContent = `${done}/${total}`;

  // Update SVG ring
  const ring = document.getElementById(`donut-${type}`);
  if (ring) {
    const offset = CIRC - (CIRC * pct / 100);
    ring.style.strokeDashoffset = offset;
  }
}


/* ══════════════════════════════════════════
   OVERVIEW TAB — LINE CHART
   Built when user clicks the Overview tab.
══════════════════════════════════════════ */
export function buildOverviewChart() {
  const canvas = document.getElementById("chart-overview-line");
  if (!canvas) return;

  const mData  = allData["monthly"] || {};
  const sorted = Object.keys(mData).sort().slice(-12);
  const labels = sorted.map(k => formatKeyAsLabel("monthly", k));
  const values = sorted.map(k => calcPct(mData[k] || []));

  if (charts["overview"]) charts["overview"].destroy();

  charts["overview"] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label:           "Monthly completion %",
          data:            values,
          borderColor:     "#10b981",
          backgroundColor: "#10b98118",
          borderWidth:     2.5,
          tension:         0.4,
          fill:            true,
          pointRadius:     5,
          pointHoverRadius: 7,
          pointBackgroundColor: "#10b981",
          pointBorderColor:     "#0a0a0f",
          pointBorderWidth:     2,
        }
      ]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1a1a2e",
          borderColor:     "#10b981",
          borderWidth:     1,
          titleColor:      "#f0f0ff",
          bodyColor:       "#9898b8",
          padding:         10,
          callbacks: {
            label: item => ` ${item.raw}% completed`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#5a5a7a", font: { size: 11 }, maxRotation: 45 },
          grid:  { color: "#ffffff08" },
          border:{ color: "#ffffff0d" }
        },
        y: {
          min: 0, max: 100,
          ticks: {
            color: "#5a5a7a", font: { size: 11 },
            callback: v => v + "%", stepSize: 25
          },
          grid:  { color: "#ffffff08" },
          border:{ color: "#ffffff0d" }
        }
      },
      animation: { duration: 800, easing: "easeOutQuart" }
    }
  });
}


/* ══════════════════════════════════════════
   STREAK COUNTER
   Counts consecutive days where at least
   one task was added (regardless of completion).
══════════════════════════════════════════ */
function updateStreak() {
  const streakEl = document.getElementById("streak-num");
  if (!streakEl) return;

  let streak = 0;
  const today = new Date();

  // Check today first
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const todayItems = allData["daily"][todayKey] || [];
  if (todayItems.length > 0) streak++;

  // Then count consecutive past days
  for (let i = -1; i >= -365; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const key   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const items = allData["daily"][key] || [];
    if (items.length > 0) {
      streak++;
    } else {
      break;
    }
  }

  streakEl.textContent = streak;
}


/* ══════════════════════════════════════════
   TAB NAVIGATION
══════════════════════════════════════════ */
function setupTabNav() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;

      // Update nav active states
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Update panel active states
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      const panel = document.getElementById(`panel-${tab}`);
      if (panel) panel.classList.add("active");

      // Build overview chart lazily (only when tab is opened)
      if (tab === "overview") {
        buildOverviewChart();
      }
    });
  });
}


/* ══════════════════════════════════════════
   PERIOD NAVIGATION ARROWS
══════════════════════════════════════════ */
function setupPeriodNavArrows() {
  document.querySelectorAll(".period-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      const dir  = parseInt(btn.dataset.dir);
      if (!type || isNaN(dir)) return;

      // Cannot go past today
      if (dir === 1 && offsets[type] === 0) return;

      offsets[type] += dir;
      renderSection(type);
      renderHistory(type);
    });
  });
}


/* ══════════════════════════════════════════
   ADD BUTTONS
══════════════════════════════════════════ */
function setupAddButtons() {
  // Add task buttons
  document.querySelectorAll(".add-task-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      addTask(btn.dataset.type);
    });
  });

  // Task list — event delegation for toggle and delete
  document.querySelector("main")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const { action, type, key, index } = btn.dataset;
    const i = parseInt(index);

    if (action === "toggle") toggleTask(type, key, i);
    if (action === "delete") deleteTask(type, key, i);
  });
}


/* ── Enter key to add task ── */
function setupEnterKeys() {
  TYPES.forEach(type => {
    const input = document.getElementById(`${type}-input`);
    if (input) {
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          e.preventDefault();
          addTask(type);
        }
      });
    }
  });
}


/* ══════════════════════════════════════════
   TASK ACTIONS
══════════════════════════════════════════ */

/* ── ADD ── */
async function addTask(type) {
  const input = document.getElementById(`${type}-input`);
  if (!input) return;

  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }

  const key   = getDateKey(type, 0);
  const items = allData[type][key] || [];

  if (items.length >= MAX) {
    showToast(`Maximum ${MAX} tasks per ${type === "daily" ? "day" : type}`, "error");
    return;
  }

  // Optimistic update — update UI immediately before Firebase responds
  const newTask = {
    text,
    done:    false,
    created: Date.now()
  };

  if (!allData[type][key]) allData[type][key] = [];
  allData[type][key].push(newTask);

  // Clear input immediately for fast feel
  input.value = "";
  input.focus();

  // Update UI
  renderSection(type);
  updateOverviewDonut(type);
  updateNavBadge(type, allData[type][key]);
  buildBarChart(type);
  buildLineChart(type);

  // Save to Firebase
  await saveToFirebase(type, key, allData[type][key]);
  showToast("Task added", "success");
}


/* ── TOGGLE (complete / incomplete) ── */
async function toggleTask(type, key, index) {
  const items = allData[type][key];
  if (!items || !items[index]) return;

  // Flip the done state
  items[index].done = !items[index].done;
  const isDone = items[index].done;

  // Update UI
  renderSection(type);
  updateOverviewDonut(type);
  updateNavBadge(type, allData[type][getDateKey(type, 0)] || []);
  buildBarChart(type);
  buildLineChart(type);
  updateStreak();

  // Save to Firebase
  await saveToFirebase(type, key, items);

  showToast(isDone ? "Task completed!" : "Task marked incomplete", isDone ? "success" : "info");
}


/* ── DELETE ── */
async function deleteTask(type, key, index) {
  const items = allData[type][key];
  if (!items) return;

  const taskText = items[index]?.text || "Task";

  // Remove from array
  items.splice(index, 1);

  // Update UI
  renderSection(type);
  renderHistory(type);
  updateOverviewDonut(type);
  updateNavBadge(type, allData[type][getDateKey(type, 0)] || []);
  buildBarChart(type);
  buildLineChart(type);

  // Save to Firebase
  await saveToFirebase(type, key, items);
  showToast("Task deleted", "info");
}


/* ══════════════════════════════════════════
   EXPOSE allData for calendar.js
   calendar.js needs daily task data to render
   dots on calendar cells and show task detail.
══════════════════════════════════════════ */
export { allData };
