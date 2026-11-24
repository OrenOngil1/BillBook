import { ApiError } from "./errors";

const BASE_URL = String(import.meta.env.VITE_API_URL);
// Pre-auth stand-in for the logged-in user; the auth token replaces it later.
// Redux thunk will provide safe access to it.
export const DEV_USER_ID = String(import.meta.env.VITE_DEV_USER_ID);
const USER_ID_HEADER = "X-User-Id";

interface RequestOptions extends Omit<RequestInit, 'body'> {
    body?: unknown
}

export async function apiClient<T>(
    endpoint: string,
    options: RequestOptions = {}
) {
    const { body, headers: customHeaders, ...restOptions } = options;
    const headers: HeadersInit = {
        "Content-Type": "application/json",
        [USER_ID_HEADER]: DEV_USER_ID,
        ...customHeaders
    };

    const response = await fetch(`${BASE_URL}/${endpoint}`, {
        ...restOptions,
        headers,
        credentials: "include",
        body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error: string } | null;
        throw new ApiError(response.status, body?.error ?? "Request failed");
    }

    return response.json() as Promise<T>;
}