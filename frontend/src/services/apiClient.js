// Shared API helper: attaches saved login token, sends JSON requests, and normalizes errors.
export async function apiRequest(path, { method = 'GET', body, key } = {}) {
  const token = localStorage.getItem('token');
  let response;
  try {
    response = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: 'Bearer ' + token }),
        ...(key && { 'Idempotency-Key': key }),
      },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error('Network issue. Please check connection.'), { code: 'NETWORK' });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error?.message || 'Something went wrong'), { code: data.error?.code });
  }
  return data;
}
