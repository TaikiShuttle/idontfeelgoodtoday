// Shared browser utilities for the main calculator runtime.
// Centralizing these helpers keeps script.js focused on game/domain logic.

function lsGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {}
}

function lsRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {}
}

function lsGetJson(key, fallback) {
  const raw = lsGet(key, null);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
