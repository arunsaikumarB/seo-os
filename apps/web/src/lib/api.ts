function resolveApiUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (import.meta.env.DEV) return 'http://localhost:3001';
  return '';
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { orgId?: string; token?: string } = {}
): Promise<T> {
  const { orgId, token, headers, ...rest } = options;
  const res = await fetch(`${resolveApiUrl()}${path}`, {
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

export function getApiUrl(): string {
  return resolveApiUrl();
}
