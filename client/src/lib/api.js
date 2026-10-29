async function getJson(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    qs.set(key, String(value));
  }
  const query = qs.toString();
  const url = query ? `${path}?${query}` : path;
  const res = await fetch(url);
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body && body.error) message = body.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function sendJson(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const parsed = await res.json();
      if (parsed && parsed.error) message = parsed.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getJson,
  postJson: (path, body) => sendJson('POST', path, body),
  delete: (path) => sendJson('DELETE', path),
};
