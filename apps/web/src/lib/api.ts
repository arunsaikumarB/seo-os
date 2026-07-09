function resolveApiUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) {
    const normalized = configured.replace(/\/$/, '');
    if (normalized.includes('supabase.co') || normalized.includes('supabase.in')) {
      throw new Error(
        'VITE_API_URL is misconfigured (points at Supabase). Set it to your Railway API URL in Netlify and redeploy.'
      );
    }
    return normalized;
  }
  if (import.meta.env.DEV) return 'http://localhost:3001';
  throw new Error(
    'VITE_API_URL is not configured for this deployment. Set it in Netlify environment variables and redeploy.'
  );
}

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null) {
    const problem = err as { detail?: string; message?: string; title?: string };
    if (problem.detail) return problem.detail;
    if (problem.message) return problem.message;
    if (problem.title) return problem.title;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { orgId?: string; token?: string } = {}
): Promise<T> {
  const { orgId, token, headers, ...rest } = options;
  const baseUrl = resolveApiUrl();
  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(orgId ? { 'X-Org-Id': orgId } : {}),
      ...headers,
    },
  });

  const raw = await res.text();
  let body: unknown = {};
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = {
        detail: res.ok
          ? 'Unexpected API response'
          : `API request failed (${res.status}). Check VITE_API_URL and CORS_ORIGIN.`,
      };
    }
  }

  if (!res.ok) throw body;
  return body as T;
}

export function getApiUrl(): string {
  return resolveApiUrl();
}
