/* ═══════════════════════════════════════════════════════════
   PLANFLOW — CALENDAR ENGINE
   calendar.js — monthly calendar grid, day selection,
                 task history detail panel, bar chart,
                 line trend chart for selected month
═══════════════════════════════════════════════════════════ */

import { db } from "./firebase.js";
import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import {
  MONTHS_FULL,
  MONTHS_SHORT,
  DAYS_SHORT,
  pad,
  formatKeyAsLabel,
  calcPct,
  calcTrendScore,
  showToast,
  escapeHtml
} from "./firebase.js";


/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
// All daily task data — key: "YYYY-MM-DD" → items[]
const calData = {};

// Currently viewed calendar month
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed

// Currently selected day key
let selectedKey = null;

// Chart instances
const calCharts = {};

// Current user ID
let userId = null;


/* ══════════════════════════════════════════
   BOOT — wait for auth
══════════════════════════════════════════ */
window.addEventListener("planflow:userReady", (e) => {
  userId = e.detail.uid;
  bootCalendar();
});

if (window.__userId) {
  userId = window.__userId;
  bootCalendar();
}


/* ══════════════════════════════════════════
   BOOT
══════════════════════════════════════════ */
function bootCalendar() {
  listenToDailyData();
  setupCalNavButtons();
  setupCalendarTabTrigger();
}


/* ══════════════════════════════════════════
   FIREBASE LISTENER
   Listens to ALL daily documents for this user.
   When any day's tasks change the calendar
   re-renders instantly.
══════════════════════════════════════════ */
function listenToDailyData() {
  const col = collection(db, "users", userId, "daily");

  onSnapshot(col, (snap) => {
    snap.forEach(docSnap => {
      calData[docSnap.id] = docSnap.data().items || [];
    });

    // Re-render calendar grid with fresh data
    renderCalendarGrid();

    // If a day is selected re-render its detail
    if (selectedKey) {
      renderDayDetail(selectedKey);
    }

    // Rebuild calendar charts
    buildCalBarChart();
    buildCalLineChart();
  });
}


/* ══════════════════════════════════════════
   CALENDAR TAB TRIGGER
   When user clicks Calendar nav item,
   render the calendar for the current month.
══════════════════════════════════════════ */
function setupCalendarTabTrigger() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "calendar") {
        renderCalendarGrid();
        buildCalBarChart();
        buildCalLineChart();
      }
    });
  });
}


/* ══════════════════════════════════════════
   CALENDAR NAVIGATION BUTTONS
══════════════════════════════════════════ */
function setupCalNavButtons() {
  const prevBtn = document.getElementById("cal-prev");
  const nextBtn = document.getElementById("cal-next");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      selectedKey = null;
      renderCalendarGrid();
      renderDayDetail(null);
      buildCalBarChart();
      buildCalLineChart();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      // Don't allow navigating into the future beyond current month
      const now = new Date();
      if (calYear === now.getFullYear() && calMonth === now.getMonth()) return;

      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      selectedKey = null;
      renderCalendarGrid();
      renderDayDetail(null);
      buildCalBarChart();
      buildCalLineChart();
    });
  }
}


/* ══════════════════════════════════════════
   RENDER CALENDAR GRID
   Builds the full month grid with:
   — correct day offset for first day of month
   — colored dots showing task completion per day
   — today highlighted in brand color
   — selected day highlighted solid
   — future days dimmed and unclickable
══════════════════════════════════════════ */
function renderCalendarGrid() {
  const labelEl = document.getElementById("cal-month-label");
  const gridEl  = document.getElementById("cal-grid");
  if (!labelEl || !gridEl) return;

  // Update month label
  labelEl.textContent = `${MONTHS_FULL[calMonth]} ${calYear}`;

  const today        = new Date();
  const todayKey     = makeDayKey(today.getFullYear(), today.getMonth(), today.getDate());
  const firstDay     = new Date(calYear, calMonth, 1);
  const lastDay      = new Date(calYear, calMonth + 1, 0);
  const startOffset  = firstDay.getDay(); // 0=Sun … 6=Sat
  const totalDays    = lastDay.getDate();

  let html = "";

  // Empty cells before the 1st
  for (let i = 0; i < startOffset; i++) {
    html += `<div class="cal-day empty"></div>`;
  }

  // Day cells
  for (let d = 1; d <= totalDays; d++) {
    const key        = makeDayKey(calYear, calMonth, d);
    const items      = calData[key] || [];
    const isToday    = key === todayKey;
    const isSelected = key === selectedKey;
    const isFuture   = key > todayKey;

    let classes = "cal-day";
    if (isToday)    classes += " today";
    if (isSelected) classes += " selected";
    if (isFuture)   classes += " future";

    const dots = buildDots(items, isFuture);

    html += `
      <div
        class="${classes}"
        data-key="${key}"
        role="button"
        tabindex="${isFuture ? -1 : 0}"
        aria-label="${d} ${MONTHS_SHORT[calMonth]} ${calYear}${items.length ? `, ${items.filter(t=>t.done).length} of ${items.length} tasks done` : ", no tasks"}"
        ${isFuture ? "" : `onclick="window.__calSelectDay('${key}')"`}
      >
        <span class="cal-day-num">${d}</span>
        <div class="cal-day-dots">${dots}</div>
      </div>`;
  }

  gridEl.innerHTML = html;

  // Expose day click handler globally
  window.__calSelectDay = (key) => {
    selectedKey = key;
    renderCalendarGrid();   // re-render to update selected state
    renderDayDetail(key);
    // Smooth scroll to detail panel
    document.getElementById("cal-detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
}


/* ── Build task status dots for a calendar cell ── */
function buildDots(items, isFuture) {
  if (isFuture || items.length === 0) {
    return `<div class="cal-dot empty"></div>`;
  }

  return items.map(t =>
    `<div class="cal-dot ${t.done ? "done" : "undone"}"></div>`
  ).join("");
}


/* ── Make a day key string ── */
function makeDayKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}


/* ══════════════════════════════════════════
   RENDER DAY DETAIL PANEL
   Shows selected day's tasks with:
   — completed tasks in green with checkmark
   — incomplete tasks in red with open circle
   — summary pills (X done / Y incomplete)
   — date heading
══════════════════════════════════════════ */
function renderDayDetail(key) {
  const detailEl = document.getElementById("cal-detail");
  if (!detailEl) return;

  // No day selected
  if (!key) {
    detailEl.innerHTML = `
      <div class="cal-detail-empty">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="6" y="8" width="28" height="26" rx="4"
            stroke="#3a3a5c" stroke-width="2"/>
          <path d="M12 4v4M28 4v4M6 16h28"
            stroke="#3a3a5c" stroke-width="2" stroke-linecap="round"/>
          <circle cx="14" cy="24" r="2" fill="#3a3a5c"/>
          <circle cx="20" cy="24" r="2" fill="#3a3a5c"/>
          <circle cx="26" cy="24" r="2" fill="#3a3a5c"/>
        </svg>
        <p>Select a date to view tasks</p>
      </div>`;
    return;
  }

  const items  = calData[key] || [];
  const done   = items.filter(t => t.done);
  const undone = items.filter(t => !t.done);

  // Format date label
  const [y, m, d] = key.split("-").map(Number);
  const dt        = new Date(y, m - 1, d);
  const dayNames  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const dateLabel = `${dayNames[dt.getDay()]}, ${d} ${MONTHS_FULL[m - 1]} ${y}`;

  if (items.length === 0) {
    detailEl.innerHTML = `
      <div class="cal-detail-header">
        <div class="cal-detail-date">${dateLabel}</div>
        <div class="cal-detail-summary">
          <span class="cal-summary-pill done-pill">0 completed</span>
          <span class="cal-summary-pill undone-pill">0 incomplete</span>
        </div>
      </div>
      <div class="cal-no-tasks">No tasks were added on this day</div>`;
    return;
  }

  const tasksHtml = items.map(task => {
    const isDone = task.done;
    return `
      <div class="cal-task-row ${isDone ? "task-done" : "task-undone"}">
        <div class="cal-task-status ${isDone ? "status-done" : "status-undone"}">
          ${isDone
            ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                 <path d="M2 6l3 3 5-5" stroke="#fff"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
               </svg>`
            : `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                 <path d="M2 2l6 6M8 2L2 8" stroke="var(--danger)"
                   stroke-width="1.8" stroke-linecap="round"/>
               </svg>`
          }
        </div>
        <span class="cal-task-text">${escapeHtml(task.text)}</span>
        <span class="badge ${isDone ? "badge-success" : "badge-danger"}">
          ${isDone ? "Done" : "Incomplete"}
        </span>
      </div>`;
  }).join("");

  detailEl.innerHTML = `
    <div class="cal-detail-header">
      <div class="cal-detail-date">${dateLabel}</div>
      <div class="cal-detail-summary">
        <span class="cal-summary-pill done-pill">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          ${done.length} completed
        </span>
        <span class="cal-summary-pill undone-pill">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2l6 6M8 2L2 8" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          ${undone.length} incomplete
        </span>
      </div>
    </div>
    <div class="cal-detail-tasks">${tasksHtml}</div>`;
}


/* ══════════════════════════════════════════
   CALENDAR BAR CHART
   Shows daily completion % for every day
   in the currently viewed calendar month.
   X-axis: day numbers (1, 2, 3 … 31)
   Y-axis: % of tasks completed (0–100%)
══════════════════════════════════════════ */
function buildCalBarChart() {
  const canvas = document.getElementById("chart-cal-bar");
  if (!canvas) return;

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today       = new Date();
  const todayKey    = makeDayKey(today.getFullYear(), today.getMonth(), today.getDate());

  const labels = [];
  const values = [];
  const colors = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const key   = makeDayKey(calYear, calMonth, d);
    const items = calData[key] || [];
    const pct   = calcPct(items);
    const isFuture = key > todayKey;

    labels.push(String(d));
    values.push(isFuture ? null : pct);   // null = skip future days

    // Color: green if 100%, brand if partial, muted if 0%
    if (isFuture) {
      colors.push("transparent");
    } else if (pct === 100) {
      colors.push("#10b981cc");
    } else if (pct > 0) {
      colors.push("#6366f199");
    } else if (items.length > 0) {
      colors.push("#ef444488");   // tasks exist but none done
    } else {
      colors.push("#ffffff18");   // no tasks that day
    }
  }

  if (calCharts["bar"]) calCharts["bar"].destroy();

  calCharts["bar"] = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label:             "Daily completion %",
        data:              values,
        backgroundColor:   colors,
        borderColor:       "#6366f1",
        borderWidth:       0,
        borderRadius:      5,
        borderSkipped:     false,
        spanGaps:          false,
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1a1a2e",
          borderColor:     "#6366f1",
          borderWidth:     1,
          titleColor:      "#f0f0ff",
          bodyColor:       "#9898b8",
          padding:         10,
          callbacks: {
            title: items => {
              const d   = parseInt(items[0].label);
              const key = makeDayKey(calYear, calMonth, d);
              const dt  = new Date(calYear, calMonth, d);
              const dayN= ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
              return `${dayN[dt.getDay()]} ${d} ${MONTHS_SHORT[calMonth]}`;
            },
            label: item => {
              if (item.raw === null) return " No data";
              const d     = parseInt(item.label);
              const key   = makeDayKey(calYear, calMonth, d);
              const items2 = calData[key] || [];
              const done  = items2.filter(t => t.done).length;
              return ` ${item.raw}% — ${done}/${items2.length} tasks done`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color:    "#5a5a7a",
            font:     { size: 10, family: "'Inter', sans-serif" },
            maxRotation: 0,
          },
          grid:   { color: "#ffffff06" },
          border: { color: "#ffffff0d" }
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color:    "#5a5a7a",
            font:     { size: 11, family: "'Inter', sans-serif" },
            callback: v => v + "%",
            stepSize: 25,
          },
          grid:   { color: "#ffffff08" },
          border: { color: "#ffffff0d" }
        }
      },
      animation: { duration: 500, easing: "easeOutQuart" }
    }
  });
}


/* ══════════════════════════════════════════
   CALENDAR LINE CHART — TREND SCORE
   Running progress score for the viewed month.
   Rises when tasks are completed.
   Falls when tasks are left incomplete.
   Only plots days that have tasks (skips empty days).
══════════════════════════════════════════ */
function buildCalLineChart() {
  const canvas = document.getElementById("chart-cal-line");
  if (!canvas) return;

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today       = new Date();
  const todayKey    = makeDayKey(today.getFullYear(), today.getMonth(), today.getDate());

  // Collect all days in month that have tasks and are not future
  const keysWithTasks = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key   = makeDayKey(calYear, calMonth, d);
    const items = calData[key] || [];
    if (key <= todayKey && items.length > 0) {
      keysWithTasks.push(key);
    }
  }

  const labels = keysWithTasks.map(k => {
    const d = parseInt(k.split("-")[2]);
    return `${d} ${MONTHS_SHORT[calMonth]}`;
  });

  const scores = calcTrendScore(keysWithTasks, calData);

  if (calCharts["line"]) calCharts["line"].destroy();

  // Not enough data
  if (scores.length < 2) {
    calCharts["line"] = null;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#5a5a7a";
    ctx.font = "13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "Add tasks on multiple days to see your trend",
      canvas.width / 2,
      canvas.height / 2
    );
    return;
  }

  // Color gradient — score above 50 = green, below 50 = red
  const lineColor  = scores[scores.length - 1] >= 50 ? "#10b981" : "#ef4444";
  const fillColor  = scores[scores.length - 1] >= 50 ? "#10b98118" : "#ef444418";

  calCharts["line"] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label:           "Progress trend",
        data:            scores,
        borderColor:     lineColor,
        backgroundColor: fillColor,
        borderWidth:     2.5,
        tension:         0.4,
        fill:            true,
        pointRadius:     5,
        pointHoverRadius: 7,
        pointBackgroundColor: lineColor,
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
          borderColor:     lineColor,
          borderWidth:     1,
          titleColor:      "#f0f0ff",
          bodyColor:       "#9898b8",
          padding:         10,
          callbacks: {
            title: items => items[0].label,
            label: item  => {
              const v     = item.raw;
              const state = v >= 75 ? "Excellent" : v >= 50 ? "On track" : v >= 25 ? "Needs effort" : "Falling behind";
              return ` Score: ${v} — ${state}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color:       "#5a5a7a",
            font:        { size: 10, family: "'Inter', sans-serif" },
            maxRotation: 45,
          },
          grid:   { color: "#ffffff06" },
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
                ? "#ffffff22"
                : "#ffffff08",
          },
          border: { color: "#ffffff0d" }
        }
      },
      animation: { duration: 700, easing: "easeOutQuart" }
    }
  });
}
