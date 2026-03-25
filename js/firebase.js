/* ═══════════════════════════════════════════════════════════
   PLANFLOW — FIREBASE CONFIGURATION
   firebase.js — imported by auth.js, tasks.js, calendar.js
═══════════════════════════════════════════════════════════ */

import { initializeApp }  from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

/* ── YOUR FIREBASE PROJECT CREDENTIALS ──
   Project: Day Planner (day-planner-3)
   Do NOT share these keys publicly in a paid/production app.
   For a personal/small-team app on the free Spark plan this is fine.
─────────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            "AIzaSyBHaWe-6xfCL5RupHGj7AxFCm8yq0kqNlE",
  authDomain:        "day-planner-3.firebaseapp.com",
  projectId:         "day-planner-3",
  storageBucket:     "day-planner-3.firebasestorage.app",
  messagingSenderId: "246734224460",
  appId:             "1:246734224460:web:60889b1ace9b8d923108e9"
};

/* ── INITIALISE FIREBASE ── */
const firebaseApp = initializeApp(firebaseConfig);

/* ── EXPORT SERVICES ──
   Other JS files import { auth, db } from "./firebase.js"
─────────────────────────────────────────────────────────── */
export const auth = getAuth(firebaseApp);
export const db   = getFirestore(firebaseApp);


/* ═══════════════════════════════════════════════════════════
   SHARED DATE HELPERS
   Used by tasks.js and calendar.js
═══════════════════════════════════════════════════════════ */

export const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun",
                             "Jul","Aug","Sep","Oct","Nov","Dec"];

export const MONTHS_FULL  = ["January","February","March","April",
                             "May","June","July","August",
                             "September","October","November","December"];

export const DAYS_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export const DAYS_FULL    = ["Sunday","Monday","Tuesday","Wednesday",
                             "Thursday","Friday","Saturday"];

/* pad: turns 3 → "03" */
export const pad = n => String(n).padStart(2, "0");


/* ── getDateKey(type, offset)
   Returns the Firestore document key for a given type and offset.
   offset = 0 → current period, -1 → previous period, etc.

   daily   → "2025-03-23"
   weekly  → "week-2025-03-17"   (Monday of that week's Sunday)
   monthly → "month-2025-03"
   yearly  → "year-2025"
────────────────────────────────────────────────────────── */
export function getDateKey(type, offset = 0) {
  const d = new Date();

  if (type === "daily") {
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  if (type === "weekly") {
    // Move to Sunday of current week, then shift by offset weeks
    d.setDate(d.getDate() - d.getDay() + offset * 7);
    return `week-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  if (type === "monthly") {
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return `month-${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }

  // yearly
  return `year-${d.getFullYear() + offset}`;
}


/* ── getPeriodLabel(type, offset)
   Returns a human-readable label for a period.
   e.g. "Today", "This Week", "March 2025", "2025"
────────────────────────────────────────────────────────── */
export function getPeriodLabel(type, offset = 0) {
  const d = new Date();

  if (type === "daily") {
    d.setDate(d.getDate() + offset);
    if (offset === 0)  return "Today";
    if (offset === -1) return "Yesterday";
    return `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  }

  if (type === "weekly") {
    if (offset === 0) return "This Week";
    if (offset === -1) return "Last Week";
    d.setDate(d.getDate() - d.getDay() + offset * 7);
    return `Week of ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  }

  if (type === "monthly") {
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    if (offset === 0) return `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
    return `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
  }

  // yearly
  const yr = d.getFullYear() + offset;
  if (offset === 0) return `${yr}`;
  return `${yr}`;
}


/* ── getPeriodSubtitle(type, offset)
   Returns a secondary line beneath the period label.
────────────────────────────────────────────────────────── */
export function getPeriodSubtitle(type, offset = 0) {
  const d = new Date();

  if (type === "daily") {
    d.setDate(d.getDate() + offset);
    return `${DAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
  }

  if (type === "weekly") {
    // Show the date range Sun–Sat
    const sun = new Date(d);
    sun.setDate(d.getDate() - d.getDay() + offset * 7);
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    return `${sun.getDate()} ${MONTHS_SHORT[sun.getMonth()]} – ${sat.getDate()} ${MONTHS_SHORT[sat.getMonth()]} ${sat.getFullYear()}`;
  }

  if (type === "monthly") {
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return `${daysInMonth} days`;
  }

  return "";
}


/* ── formatKeyAsLabel(type, key)
   Converts a Firestore key back into a readable label.
   Used in history cards and chart axis labels.
────────────────────────────────────────────────────────── */
export function formatKeyAsLabel(type, key) {
  if (type === "daily") {
    const [y, m, dd] = key.split("-").map(Number);
    const dt = new Date(y, m - 1, dd);
    return `${dd} ${MONTHS_SHORT[m - 1]}`;
  }

  if (type === "weekly") {
    const parts = key.replace("week-", "").split("-");
    const d = parseInt(parts[2]);
    const m = parseInt(parts[1]) - 1;
    return `${d} ${MONTHS_SHORT[m]}`;
  }

  if (type === "monthly") {
    const parts = key.replace("month-", "").split("-");
    return `${MONTHS_SHORT[parseInt(parts[1]) - 1]} ${parts[0]}`;
  }

  // yearly
  return key.replace("year-", "");
}


/* ── formatKeyAsFullLabel(type, key)
   Longer version for history card headings.
────────────────────────────────────────────────────────── */
export function formatKeyAsFullLabel(type, key) {
  if (type === "daily") {
    const [y, m, dd] = key.split("-").map(Number);
    const dt = new Date(y, m - 1, dd);
    return `${DAYS_SHORT[dt.getDay()]}, ${dd} ${MONTHS_FULL[m - 1]} ${y}`;
  }

  if (type === "weekly") {
    const parts = key.replace("week-", "").split("-");
    return `Week of ${parseInt(parts[2])} ${MONTHS_FULL[parseInt(parts[1]) - 1]} ${parts[0]}`;
  }

  if (type === "monthly") {
    const parts = key.replace("month-", "").split("-");
    return `${MONTHS_FULL[parseInt(parts[1]) - 1]} ${parts[0]}`;
  }

  return key.replace("year-", "");
}


/* ── calcPct(items)
   Given an array of task objects, returns completion % (0–100).
────────────────────────────────────────────────────────── */
export function calcPct(items = []) {
  if (!items.length) return 0;
  const done = items.filter(t => t.done).length;
  return Math.round((done / items.length) * 100);
}


/* ── calcTrendScore(sortedKeys, dataMap)
   Builds a running trend score array.

   Logic:
   - Start at score 0
   - For each period:
       + (done tasks * 33)  → pushes score up
       - (undone tasks * 33) → pulls score down
   - Score is clamped between 0 and 100
   - This creates the "rising line" when completing tasks,
     and a "falling line" when leaving tasks incomplete.
────────────────────────────────────────────────────────── */
export function calcTrendScore(sortedKeys, dataMap) {
  let score = 50; // start in the middle
  const scores = [];

  for (const key of sortedKeys) {
    const items = dataMap[key] || [];
    const done   = items.filter(t => t.done).length;
    const undone = items.filter(t => !t.done).length;

    // Each completed task pushes score up by 33 points (max 3 tasks = 99)
    // Each incomplete task pulls score down by 33 points
    score += (done * 33) - (undone * 33);

    // Clamp between 0 and 100
    score = Math.max(0, Math.min(100, score));
    scores.push(Math.round(score));
  }

  return scores;
}


/* ── getUserTasksRef(db, userId, type)
   Returns the Firestore collection reference for a user's tasks.
   Data structure:
     /users/{userId}/{type}/{periodKey}  → { items: [...] }
────────────────────────────────────────────────────────── */
import { collection } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

export function getUserTasksRef(db, userId, type) {
  return collection(db, "users", userId, type);
}


/* ── showToast(message, type)
   Global toast notification helper.
   type: "success" | "error" | "info" (default)
────────────────────────────────────────────────────────── */
export function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className   = `toast ${type}`;

  // Force reflow to restart animation if already showing
  void toast.offsetWidth;
  toast.classList.add("show");

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2400);
}


/* ── setSyncStatus(state)
   Updates the sync pill in the header.
   state: "synced" | "saving" | "error"
────────────────────────────────────────────────────────── */
export function setSyncStatus(state) {
  const dot   = document.getElementById("sync-dot");
  const label = document.getElementById("sync-label");
  if (!dot || !label) return;

  dot.className = "sync-dot";

  if (state === "saving") {
    dot.classList.add("saving");
    label.textContent = "Saving…";
  } else if (state === "error") {
    dot.classList.add("error");
    label.textContent = "Error";
  } else {
    label.textContent = "Synced";
  }
}


/* ── updateNavBadge(type, items)
   Updates the "2/3" badge in the sidebar nav item.
────────────────────────────────────────────────────────── */
export function updateNavBadge(type, items = []) {
  const badge = document.getElementById(`nav-badge-${type}`);
  if (!badge) return;
  const done  = items.filter(t => t.done).length;
  const total = items.length;
  badge.textContent = `${done}/${total}`;
}


/* ── escapeHtml(str)
   Prevents XSS when rendering user-typed task text into HTML.
────────────────────────────────────────────────────────── */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}
