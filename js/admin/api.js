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

/* Proposals from Goodreads and Letterboxd. Reading is safe; accepting goes
   through catalogue.add, and a skip is remembered so the queue empties. */
export const imports = {
  pending: () => request("/api/import"),
  skip: (id) => request("/api/import", { method: "POST", body: JSON.stringify({ op: "skip", id }) }),
  unskip: (id) => request("/api/import", { method: "POST", body: JSON.stringify({ op: "unskip", id }) }),
};

/* Every list change is one operation, and the answer is always the whole set
   after it, so the panel never has to keep its own idea of the truth. */
export const lists = {
  all: () => request("/api/lists"),
  apply: (op) => request("/api/lists", { method: "POST", body: JSON.stringify(op) }),
};
