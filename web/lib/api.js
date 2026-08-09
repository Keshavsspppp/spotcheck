const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function request(path, options) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
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

export const getHistory = (locationId) => request(`/api/locations/${locationId}/history`);

export const heartbeat = (locationId, sessionId) =>
  request("/api/heartbeat", { method: "POST", body: JSON.stringify({ locationId, sessionId }) });

export const adminCorrect = (locationId, currentCount) =>
  request("/api/admin/correction", { method: "POST", body: JSON.stringify({ locationId, currentCount }) });

export { API_URL };
