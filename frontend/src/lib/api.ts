import type { MenuResponse } from "@/types/menu";

// Every network call in the app goes through this file. Components never call
// fetch directly, so base URL, auth header, error shape, and 401 handling live
// in exactly one place.

const API_VERSION_PATH = "/api/v1";
const NETWORK_ERROR_CODE = "network_error";
const UNKNOWN_ERROR_CODE = "unknown_error";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type HttpMethod = "GET" | "POST";

interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  // JWT from the OTP flow; sent as a Bearer token when present.
  token?: string | null;
  headers?: Record<string, string>;
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

// AuthProvider registers what a 401 should do (clear the token, send the user
// back to checkout). Kept as a registration so this file has no React deps.
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

function getApiBaseUrl(): string {
  // Must be referenced literally so Next.js can inline it at build time.
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  }
  return baseUrl.replace(/\/+$/, "") + API_VERSION_PATH;
}

interface ApiErrorBody {
  error?: { code?: unknown; message?: unknown };
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Non-JSON error (e.g. a proxy's HTML 502 page); fall through to defaults.
  }

  const code = typeof body?.error?.code === "string" ? body.error.code : UNKNOWN_ERROR_CODE;
  const message =
    typeof body?.error?.message === "string" ? body.error.message : `Request failed with status ${response.status}`;
  return new ApiError(response.status, code, message);
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = "GET", body, token, headers = {} } = options;

  const requestHeaders: Record<string, string> = { Accept: "application/json", ...headers };
  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(getApiBaseUrl() + path, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR_CODE, "Could not reach the server");
  }

  if (!response.ok) {
    if (response.status === 401) {
      unauthorizedHandler?.();
    }
    throw await toApiError(response);
  }

  return (await response.json()) as T;
}

export function getMenu(): Promise<MenuResponse> {
  return apiFetch<MenuResponse>("/menu");
}
