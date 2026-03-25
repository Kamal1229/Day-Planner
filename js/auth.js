/* ═══════════════════════════════════════════════════════════
   PLANFLOW — AUTHENTICATION
   auth.js — handles Google login, logout, session, redirects
   Imported by both index.html and dashboard.html
═══════════════════════════════════════════════════════════ */

import { auth }               from "./firebase.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// Ensure auth state persists in localStorage (survives page reload)
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn("Could not set auth persistence:", err);
});


/* ══════════════════════════════════════════
   LOCALHOST FIX
   Firebase Auth only authorizes "localhost",
   not "127.0.0.1". Auto-redirect so login works.
══════════════════════════════════════════ */
if (window.location.hostname === "127.0.0.1") {
  window.location.replace(
    window.location.href.replace("127.0.0.1", "localhost")
  );
}


/* ══════════════════════════════════════════
   PAGE DETECTION
   Determines which page this script is running on
   so it can apply the right behaviour.
══════════════════════════════════════════ */
const path        = window.location.pathname;
const isLoginPage = path.endsWith("index.html")
                 || path === "/"
                 || path.endsWith("/");
const isDashboard = path.endsWith("dashboard.html");


/* ══════════════════════════════════════════
   AUTH STATE LISTENER
   Fires every time login state changes:
   — on first page load
   — after sign in
   — after sign out
   — when Firebase token refreshes
══════════════════════════════════════════ */
onAuthStateChanged(auth, (user) => {
  if (user) {
    /* ── USER IS LOGGED IN ── */

    if (isLoginPage) {
      // Already logged in — go straight to dashboard
      window.location.replace("dashboard.html");
      return;
    }

    if (isDashboard) {
      // Populate header with user info
      populateUserHeader(user);

      // Store userId globally so tasks.js and calendar.js can read it
      // without importing auth again
      window.__userId = user.uid;

      // Dispatch a custom event so tasks.js and calendar.js know
      // the user is ready (they may load before onAuthStateChanged fires)
      window.dispatchEvent(new CustomEvent("planflow:userReady", {
        detail: { uid: user.uid, user }
      }));
    }

  } else {
    /* ── USER IS NOT LOGGED IN ── */

    if (isDashboard) {
      // Not authenticated — kick back to login
      window.location.replace("index.html");
    }
  }
});


/* ══════════════════════════════════════════
   POPULATE USER HEADER
   Fills in avatar, name and email in the
   dashboard header once user is confirmed.
══════════════════════════════════════════ */
function populateUserHeader(user) {
  const avatarEl = document.getElementById("user-avatar");
  const nameEl   = document.getElementById("user-name");
  const emailEl  = document.getElementById("user-email");

  if (avatarEl) {
    if (user.photoURL) {
      avatarEl.src = user.photoURL;
      avatarEl.alt = user.displayName || "User avatar";
      avatarEl.style.display = "block";
    } else {
      // No photo — show initials placeholder
      avatarEl.style.display = "none";
    }
  }

  if (nameEl) {
    nameEl.textContent = user.displayName
      ? user.displayName.split(" ")[0]   // first name only
      : "User";
  }

  if (emailEl) {
    emailEl.textContent = user.email || "";
  }

  // Set page title to personalise it
  if (user.displayName) {
    document.title = `PlanFlow — ${user.displayName.split(" ")[0]}`;
  }
}


/* ══════════════════════════════════════════
   LIVE DATE IN HEADER
   Updates every minute so the date is always
   correct if the user leaves the tab open overnight.
══════════════════════════════════════════ */
function updateHeaderDate() {
  const el = document.getElementById("header-date");
  if (!el) return;

  const now  = new Date();
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const mons = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

  el.textContent = `${days[now.getDay()]}, ${now.getDate()} ${mons[now.getMonth()]} ${now.getFullYear()}`;
}

if (isDashboard) {
  updateHeaderDate();
  setInterval(updateHeaderDate, 60_000);
}


/* ══════════════════════════════════════════
   GOOGLE SIGN-IN  (login page only)
══════════════════════════════════════════ */
if (isLoginPage) {
  const loginBtn  = document.getElementById("google-login-btn");
  const errorEl   = document.getElementById("login-error");
  const spinnerEl = document.getElementById("btn-spinner");
  const provider  = new GoogleAuthProvider();

  // Add extra Google OAuth scopes for profile info
  provider.addScope("profile");
  provider.addScope("email");

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      clearError();
      setLoading(true);

      try {
        // Use popup — the COOP console warning is non-fatal
        const result = await signInWithPopup(auth, provider);
        console.log("Sign-in successful:", result.user.displayName);
        // onAuthStateChanged will handle the redirect to dashboard

      } catch (err) {
        setLoading(false);
        handleLoginError(err);
      }
    });
  }

  /* ── Loading state helpers ── */
  function setLoading(loading) {
    if (!loginBtn) return;
    loginBtn.disabled = loading;

    if (loading) {
      loginBtn.querySelector("span").textContent = "Signing in…";
      if (spinnerEl) spinnerEl.style.display = "block";
      // Hide Google icon while loading
      const icon = loginBtn.querySelector(".google-icon");
      if (icon) icon.style.display = "none";
    } else {
      loginBtn.querySelector("span").textContent = "Sign in with Google";
      if (spinnerEl) spinnerEl.style.display = "none";
      const icon = loginBtn.querySelector(".google-icon");
      if (icon) icon.style.display = "block";
    }
  }

  /* ── Error handler ── */
  function handleLoginError(err) {
    console.error("Auth error:", err.code, err.message);

    const messages = {
      "auth/popup-closed-by-user":      "Sign-in window was closed. Please try again.",
      "auth/popup-blocked":             "Pop-up was blocked by your browser. Please allow pop-ups for this site.",
      "auth/network-request-failed":    "Network error. Please check your internet connection.",
      "auth/too-many-requests":         "Too many attempts. Please wait a moment and try again.",
      "auth/user-disabled":             "This account has been disabled.",
      "auth/cancelled-popup-request":   "Only one sign-in window at a time. Please try again.",
    };

    const msg = messages[err.code] || "Sign-in failed. Please try again.";
    showError(msg);
  }

  function showError(msg) {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = "flex";
    }
  }

  function clearError() {
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.style.display = "none";
    }
  }
}


/* ══════════════════════════════════════════
   SIGN OUT  (dashboard only)
══════════════════════════════════════════ */
if (isDashboard) {
  const logoutBtn = document.getElementById("logout-btn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        // Clear any cached data
        window.__userId = null;

        await signOut(auth);

        // onAuthStateChanged will redirect to index.html
        // but also do it directly in case there's a delay
        window.location.replace("index.html");

      } catch (err) {
        console.error("Sign out error:", err);
        // Force redirect even if signOut fails
        window.location.replace("index.html");
      }
    });
  }
}


/* ══════════════════════════════════════════
   EXPORT getCurrentUser()
   Utility for tasks.js and calendar.js
   to synchronously get the current user
   without having to import auth themselves.
══════════════════════════════════════════ */
export function getCurrentUser() {
  return auth.currentUser;
}

export function getCurrentUserId() {
  return auth.currentUser?.uid || window.__userId || null;
}
