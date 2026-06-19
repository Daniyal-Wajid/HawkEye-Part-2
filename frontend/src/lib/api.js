export const API_BASE = "http://localhost:5000";

export function authHeaders(contentType = "application/json") {
  const token = localStorage.getItem("token");
  return {
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function authQueryToken() {
  return localStorage.getItem("token") || "";
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export async function apiPatch(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text?.slice(0, 200) || `Request failed (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
  return data;
}

export async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers: authHeaders() });
  if (res.status === 204) return;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
}

/** Authenticated AI pipeline helpers (proxied via backend) */
export async function aiGet(path) {
  return apiGet(`/api/ai${path}`);
}

export async function aiPost(path, body) {
  return apiPost(`/api/ai${path}`, body);
}

export function aiVideoFeedUrl() {
  const token = authQueryToken();
  return `${API_BASE}/api/ai/video-feed?token=${encodeURIComponent(token)}`;
}

export function aiProcessedVideoUrl(relativePath) {
  const token = authQueryToken();
  const filename = relativePath.split("/").pop();
  return `${API_BASE}/api/ai/processed/${filename}?token=${encodeURIComponent(token)}`;
}

export async function aiUploadVideo(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/ai/upload-and-process`, {
    method: "POST",
    headers: authHeaders(null),
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data;
}
