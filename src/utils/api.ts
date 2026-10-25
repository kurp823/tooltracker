// API utility — all calls go through Azure Functions /api/*

const BASE = '/api'

async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('tt_token')
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

  return res.json()
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
