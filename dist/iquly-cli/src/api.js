import { authHeaders } from "./auth.js";
const DEFAULT_CONTROL_PLANE_URL = "https://control.iquly.com";
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
export class CliApiError extends Error {
    status;
    code;
    constructor(message, status, code) {
        super(message);
        this.name = "CliApiError";
        this.status = status;
        this.code = code ?? null;
    }
}
export function normalizeEndpoint() {
    return (process.env.IQULY_API_URL ?? DEFAULT_CONTROL_PLANE_URL).replace(/\/+$/, "");
}
function formatApiError(status, body) {
    const error = body && typeof body === "object" && "error" in body
        ? String(body.error)
        : typeof body === "string" && body.trim()
            ? body.trim()
            : null;
    if (status === 401) {
        return "Authentication failed. Run `iquly login` again.";
    }
    if (status === 403) {
        return "Access denied for this resource.";
    }
    if (error) {
        return error;
    }
    return `Request failed with status ${status}`;
}
async function readJsonBody(response) {
    if (response.status === 204) {
        return null;
    }
    return response.json();
}
function getRequestTimeoutMs() {
    const raw = process.env.IQULY_REQUEST_TIMEOUT_MS?.trim();
    if (!raw) {
        return DEFAULT_REQUEST_TIMEOUT_MS;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        return DEFAULT_REQUEST_TIMEOUT_MS;
    }
    return value;
}
function formatNetworkError(error, url, timedOut) {
    if (error instanceof CliApiError) {
        return error;
    }
    if (timedOut) {
        const endpoint = new URL(url).origin;
        return new Error(`Request to ${endpoint} timed out after ${getRequestTimeoutMs()}ms. Check whether the computer can access that URL.`);
    }
    if (process.env.IQULY_DEBUG === "1") {
        const endpoint = new URL(url).origin;
        const reason = error instanceof Error && error.message
            ? ` (${error.message})`
            : "";
        return new Error(`Could not connect to the IQuly backend at ${endpoint}. Please try again later.${reason}`);
    }
    return new Error("Could not connect to the IQuly backend. Please try again later.");
}
export async function requestJson(url, init) {
    const timeoutMs = getRequestTimeoutMs();
    const controller = new AbortController();
    let timedOut = false;
    let upstreamAbortHandler = null;
    const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    if (init?.signal) {
        if (init.signal.aborted) {
            controller.abort();
        }
        else {
            upstreamAbortHandler = () => {
                controller.abort();
            };
            init.signal.addEventListener("abort", upstreamAbortHandler, { once: true });
        }
    }
    try {
        const response = await fetch(url, {
            ...init,
            signal: controller.signal,
            headers: await authHeaders(init?.headers),
        });
        const parsed = await readJsonBody(response);
        if (!response.ok) {
            throw new CliApiError(formatApiError(response.status, parsed), response.status, parsed && typeof parsed === "object" && "error" in parsed
                ? String(parsed.error)
                : null);
        }
        return parsed;
    }
    catch (error) {
        throw formatNetworkError(error, url, timedOut);
    }
    finally {
        clearTimeout(timeoutId);
        if (init?.signal && upstreamAbortHandler) {
            init.signal.removeEventListener("abort", upstreamAbortHandler);
        }
    }
}
