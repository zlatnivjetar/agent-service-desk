const DEFAULT_LOCAL_API_URL = "http://localhost:8000";

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function isLocalNextOrigin(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.port === "3000" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function resolveApiUrl() {
  const configuredUrl = trimTrailingSlash(
    process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_LOCAL_API_URL,
  );

  if (isLocalNextOrigin(configuredUrl)) {
    if (typeof window !== "undefined") {
      console.warn(
        "NEXT_PUBLIC_API_URL points to the Next.js app on :3000. Falling back to http://localhost:8000 for backend API requests.",
      );
    }
    return DEFAULT_LOCAL_API_URL;
  }

  return configuredUrl;
}

export const API_URL = resolveApiUrl();

let cachedToken: string | null = null;
let tokenExpiry: number = 0;
let tokenFetchPromise: Promise<string> | null = null;

function redirectToLogin() {
  clearTokenCache();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

export async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 30_000) {
    return cachedToken;
  }
  if (tokenFetchPromise) return tokenFetchPromise;

  tokenFetchPromise = fetch("/api/token", { method: "POST" })
    .then(async (res) => {
      tokenFetchPromise = null;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          redirectToLogin();
        }
        const errorBody = await res.json().catch(() => ({ error: "Failed to get API token" }));
        throw Object.assign(new Error(errorBody.error ?? "Failed to get API token"), {
          status: res.status,
          body: errorBody,
        });
      }
      const data = await res.json();
      cachedToken = data.token as string;
      // Decode exp from JWT payload (no signature verification needed client-side)
      const payload = JSON.parse(atob(cachedToken.split(".")[1]));
      tokenExpiry = payload.exp * 1000;
      return cachedToken;
    })
    .catch((err) => {
      tokenFetchPromise = null;
      throw err;
    });

  return tokenFetchPromise;
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
    if (res.status === 401 || res.status === 403) {
      redirectToLogin();
    }
    throw Object.assign(new Error(errorBody.detail ?? "Request failed"), {
      status: res.status,
      body: errorBody,
    });
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function clearTokenCache() {
  cachedToken = null;
  tokenExpiry = 0;
  tokenFetchPromise = null;
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

export type ApiClientLike = typeof apiClient;
