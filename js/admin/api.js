/* Every call the admin makes. Credentials are the session cookie, which the
   browser sends on its own; nothing here ever holds a secret. */

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    /* A lapsed session should drop the whole app back to the login form rather
       than showing an error inside a panel the user can no longer use. */
    if (response.status === 401) dispatchEvent(new Event("admin:unauthorized"));
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export const api = {
  session: () => request("/api/session"),
  login: (password) => request("/api/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request("/api/logout", { method: "POST" }),
};

export const library = {
  catalog: () => request("/data/library.json", { cache: "no-cache" }),
  note: (id) => request(`/api/note?id=${encodeURIComponent(id)}`),
  save: (payload) => request("/api/save", { method: "POST", body: JSON.stringify(payload) }),
};

export const catalogue = {
  search: (type, q) => request(`/api/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`),
  add: (payload) => request("/api/add", { method: "POST", body: JSON.stringify(payload) }),
};
