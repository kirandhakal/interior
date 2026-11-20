import type { Account, Project, ProjectSummary, SavedProject } from '@studio/model';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/' + path, {
      method, cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'The project server is unavailable. Check your connection and try again.');
  }
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message: unknown = result?.message;
    const detail = Array.isArray(message) ? String(message[0]) : message;
    throw new ApiError(response.status, typeof detail === 'string' ? detail : 'The project server is unavailable. Try again shortly.');
  }
  if (result === undefined) throw new ApiError(response.status, 'The project server returned an invalid response.');
  return result as T;
}

export const api = {
  account: () => request<Account>('auth/me'),
  auth: (mode: 'register' | 'login', email: string, password: string) => request<Account>('auth/' + mode, 'POST', { email, password }),
  logout: () => request<void>('auth/logout', 'POST'),
  list: () => request<ProjectSummary[]>('projects'),
  read: (id: string) => request<SavedProject>('projects/' + id),
  create: (id: string, value: Project) => request<SavedProject>('projects', 'POST', { id, ...value }),
  update: (id: string, version: number, value: Project) => request<SavedProject>('projects/' + id, 'PUT', { ...value, version }),
  remove: (id: string) => request<void>('projects/' + id, 'DELETE'),
};

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Try again.';
