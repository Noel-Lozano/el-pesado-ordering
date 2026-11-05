import type { MenuResponse } from "@/types/menu";
import type { CreateOrderRequest, Order } from "@/types/order";

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
  // Whether a 401 runs the app-wide handler (clear login, go to /checkout).
  // The order status page handles 401 itself, since checkout would be a dead end there.
  redirectOnUnauthorized?: boolean;
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
  const { method = "GET", body, token, headers = {}, redirectOnUnauthorized = true } = options;

  const requestHeaders: Record<string, string> = { Accept: "application/json", ...headers };
  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  const url = getApiBaseUrl() + path;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Usually the API isn't running or NEXT_PUBLIC_API_BASE_URL points at the
    // wrong host; naming the URL makes that obvious in logs.
    throw new ApiError(0, NETWORK_ERROR_CODE, `Could not reach the server at ${url}`);
  }

  if (!response.ok) {
    if (response.status === 401 && redirectOnUnauthorized) {
      unauthorizedHandler?.();
    }
    throw await toApiError(response);
  }

  return (await response.json()) as T;
}

export function getMenu(): Promise<MenuResponse> {
  return apiFetch<MenuResponse>("/menu");
}

// Sends a 6-digit OTP over WhatsApp (Twilio Verify, ADR-003). phone must already be E.164.
export function sendCode(phone: string): Promise<{ status: "sent" }> {
  return apiFetch<{ status: "sent" }>("/auth/send-code", { method: "POST", body: { phone } });
}

// Exchanges the code for a JWT tied to this phone's customer record.
export function verifyCode(phone: string, code: string): Promise<{ token: string }> {
  return apiFetch<{ token: string }>("/auth/verify-code", { method: "POST", body: { phone, code } });
}

// The same idempotencyKey must be sent on every retry of one checkout so the
// server returns the original order instead of creating a duplicate.
export function createOrder(request: CreateOrderRequest, token: string, idempotencyKey: string): Promise<Order> {
  return apiFetch<Order>("/orders", {
    method: "POST",
    body: request,
    token,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

// Polled by the order status page. Its 401s are handled on that page.
export function getOrder(orderId: string, token: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${encodeURIComponent(orderId)}`, { token, redirectOnUnauthorized: false });
}
