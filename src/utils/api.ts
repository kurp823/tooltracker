// API utility — all calls go through Azure Functions /api/*

const BASE = '/api'

async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('tt_token')
  // Azure Static Web Apps overwrites the Authorization header on requests to
  // its managed Functions with its own platform token, so our app token must
  // travel in a custom header that SWA leaves untouched. Authorization is kept
  // as well for local dev / non-SWA hosts.
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token
      ? { Authorization: `Bearer ${token}`, 'X-Auth-Token': token }
      : {}),
    ...options.headers,
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem('tt_token')
    localStorage.removeItem('tt_user')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const body = await res.json()
      errMsg = body.error || body.message || errMsg
    } catch {}
    throw new Error(errMsg)
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T

  // An empty 2xx body is never a real answer from this API: every handler
  // replies with JSON. It has been seen on failed saves that the host answered
  // with an empty 200 (go-live bug 22), which the screens then showed as
  // success while nothing was written. Treat it as a failure so the user
  // checks before retrying.
  const text = await res.text()
  if (!text.trim()) {
    const method = String(options.method || 'GET').toUpperCase()
    throw new Error(method === 'GET'
      ? 'The server returned an empty response - refresh and try again'
      : 'The server returned no confirmation - the save may not have been applied. Refresh and check before saving again')
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('The server returned an unreadable response')
  }
}

// api() can be called directly:  api('/path', { method, body })
// OR via shorthand:              api.post('/path', body)
export const api = Object.assign(
  <T = unknown>(path: string, options?: RequestInit) => request<T>(path, options),
  {
    get:    <T = unknown>(path: string)                    => request<T>(path),
    post:   <T = unknown>(path: string, body: unknown)     => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
    put:    <T = unknown>(path: string, body: unknown)     => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
    patch:  <T = unknown>(path: string, body: unknown)     => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
    delete: <T = unknown>(path: string)                    => request<T>(path, { method: 'DELETE' }),
  }
)
