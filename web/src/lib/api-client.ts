const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 30_000) {
    return cachedToken;
  }
  const res = await fetch("/api/token", { method: "POST" });
  if (!res.ok) throw new Error("Failed to get API token");
  const data = await res.json();
  cachedToken = data.token as string;
  // Decode exp from JWT payload (no signature verification needed client-side)
  const payload = JSON.parse(atob(cachedToken.split(".")[1]));
  tokenExpiry = payload.exp * 1000;
  return cachedToken;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw Object.assign(new Error(errorBody.detail ?? "Request failed"), {
      status: res.status,
      body: errorBody,
    });
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiClient = {
  get<T>(path: string): Promise<T> {
    return request<T>("GET", path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("POST", path, body);
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("PATCH", path, body);
  },
  del(path: string): Promise<void> {
    return request<void>("DELETE", path);
  },
};
