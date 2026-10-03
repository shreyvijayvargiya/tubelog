const listeners = new Set();

export function onLibraryChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitLibraryChange() {
  for (const listener of listeners) listener();
}

export async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get("content-type") || "";
  if (!type.includes("json")) {
    const error = new Error("TubeLog API is not available on this host.");
    error.status = response.status;
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data === "object" && data?.error ? data.error : `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}
