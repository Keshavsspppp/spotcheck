import { getAdminToken } from "./adminAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const getLocations = () => request("/api/locations");

export const checkin = (locationId, sessionId) =>
  request("/api/checkin", { method: "POST", body: JSON.stringify({ locationId, sessionId }) });

export const checkout = (locationId, sessionId) =>
  request("/api/checkout", { method: "POST", body: JSON.stringify({ locationId, sessionId }) });

export const getHistory = (locationId, dayPart = "all") =>
  request(`/api/locations/${locationId}/history?dayPart=${dayPart}`);

export const getBusyness = (locationId) => request(`/api/locations/${locationId}/busyness`);

export const heartbeat = (locationId, sessionId) =>
  request("/api/heartbeat", { method: "POST", body: JSON.stringify({ locationId, sessionId }) });

export const verifyAdminToken = (token) =>
  request("/api/admin/verify", { headers: { "x-admin-token": token } });

export const adminCorrect = (locationId, currentCount) =>
  request("/api/admin/correction", {
    method: "POST",
    headers: { "x-admin-token": getAdminToken() },
    body: JSON.stringify({ locationId, currentCount }),
  });

export { API_URL };
