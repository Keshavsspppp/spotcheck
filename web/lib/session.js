const SESSION_KEY = "spotcheck_session_id";
const CHECKED_IN_KEY = "spotcheck_checked_in";

export function getSessionId() {
  if (typeof window === "undefined") return null;
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function readCheckedIn() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CHECKED_IN_KEY)) || {};
  } catch {
    return {};
  }
}

export function isCheckedIn(locationId) {
  return !!readCheckedIn()[locationId];
}

export function getCheckedInIds() {
  return Object.keys(readCheckedIn());
}

export function setCheckedIn(locationId, value) {
  const map = readCheckedIn();
  if (value) map[locationId] = true;
  else delete map[locationId];
  localStorage.setItem(CHECKED_IN_KEY, JSON.stringify(map));
}
