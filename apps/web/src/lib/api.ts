const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { orgId?: string; token?: string } = {}
): Promise<T> {
  const { orgId, token, headers, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(orgId ? { 'X-Org-Id': orgId } : {}),
      ...headers,
    },
  });
  const body = await res.json();
  if (!res.ok) throw body;
  return body as T;
}

export { API_URL };
