const MESSAGES = {
  already_checked_in: "You're already checked in here.",
  not_checked_in: "You're not checked in here.",
  not_found: "That location doesn't exist.",
  at_capacity: "This location is full right now.",
  unauthorized: "Incorrect password.",
};

export function friendlyError(code) {
  return MESSAGES[code] || "Something went wrong. Try again.";
}

// When a checkin/checkout fails because the server's idea of "checked in"
// doesn't match ours (e.g. we were auto-checked-out by the staleness sweep
// while this tab was idle), resync local state instead of leaving the
// button permanently wrong. Returns null when the error isn't a state
// mismatch (at_capacity, not_found) and local state shouldn't change.
export function correctedCheckedInState(code) {
  if (code === "not_checked_in") return false;
  if (code === "already_checked_in") return true;
  return null;
}
