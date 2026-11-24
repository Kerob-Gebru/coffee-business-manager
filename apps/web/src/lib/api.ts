export const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API}${path}`, { credentials: "include", ...init, headers });
}

export async function apiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    if (Array.isArray(data?.message)) return data.message[0] ?? fallback;
    if (typeof data?.message === "string") return data.message;
  } catch {
    // Body was empty or not JSON.
  }
  return fallback;
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await api(path, init);
  if (!response.ok) {
    throw new Error(await apiError(response, `HTTP ${response.status}`));
  }
  return (await response.json()) as T;
}
