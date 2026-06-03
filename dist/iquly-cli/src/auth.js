import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { normalizeEndpoint, requestJson } from "./api.js";

const CLIENT_ID = "iquly-cli";
const SCOPE = "cli:use agents:manage builds:manage workspaces:read inference:run";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

function getAuthFilePath() {
    const configRoot = process.env.XDG_CONFIG_HOME?.trim()
        ? process.env.XDG_CONFIG_HOME.trim()
        : path.join(os.homedir(), ".config");
    return path.join(configRoot, "iquly", "auth.json");
}

async function readStoredAuth() {
    try {
        const content = await readFile(getAuthFilePath(), "utf8");
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}

async function saveStoredAuth(auth) {
    const filePath = getAuthFilePath();
    const dirPath = path.dirname(filePath);
    await mkdir(dirPath, { recursive: true, mode: 0o700 });
    await chmod(dirPath, 0o700).catch(() => undefined);
    await writeFile(filePath, `${JSON.stringify(auth, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
    await chmod(filePath, 0o600);
}

function authUrl(baseUrl, routePath) {
    return new URL(routePath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function readOAuthError(payload, fallback) {
    return payload?.error_description || payload?.error || fallback;
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(readOAuthError(payload, `Request failed (${response.status})`));
    }
    return payload;
}

function verificationUrl(baseUrl, device) {
    if (device.verification_uri_complete) {
        return device.verification_uri_complete.startsWith("http")
            ? device.verification_uri_complete
            : authUrl(baseUrl, device.verification_uri_complete);
    }
    const url = new URL(device.verification_uri.startsWith("http")
        ? device.verification_uri
        : authUrl(baseUrl, device.verification_uri));
    url.searchParams.set("user_code", device.user_code);
    return url.toString();
}

function openBrowser(url) {
    const command = process.platform === "darwin"
        ? { bin: "open", args: [url] }
        : process.platform === "win32"
            ? { bin: "cmd", args: ["/c", "start", "", url] }
            : { bin: "xdg-open", args: [url] };
    try {
        const child = spawn(command.bin, command.args, { detached: true, stdio: "ignore" });
        child.unref();
        return true;
    }
    catch {
        return false;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollForAccessToken(baseUrl, deviceCode, intervalSeconds, expiresAtMs) {
    let waitMs = Math.max(intervalSeconds || 1, 1) * 1000;
    while (Date.now() < expiresAtMs) {
        await sleep(waitMs);
        const response = await fetch(authUrl(baseUrl, "/api/auth/device/token"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                grant_type: GRANT_TYPE,
                device_code: deviceCode,
                client_id: CLIENT_ID,
            }),
        });
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.access_token) {
            return payload.access_token;
        }
        const error = payload?.error;
        const description = payload?.error_description;
        if (error === "authorization_pending") {
            continue;
        }
        if (error === "slow_down") {
            waitMs += 5000;
            continue;
        }
        if (error === "access_denied") {
            throw new Error(description || "Login was denied in the browser.");
        }
        if (error === "expired_token") {
            throw new Error(description || "The device code expired. Run `iquly login` again.");
        }
        if (error === "invalid_grant") {
            throw new Error(description || "Invalid device code. Run `iquly login` again.");
        }
        throw new Error(readOAuthError(payload, `Login failed (${response.status})`));
    }
    throw new Error("Timed out waiting for browser approval. Run `iquly login` again.");
}

export async function getAccessToken() {
    const envAccessToken = process.env.IQULY_ACCESS_TOKEN?.trim();
    if (envAccessToken) {
        return envAccessToken;
    }
    return (await readStoredAuth())?.accessToken ?? null;
}

export async function saveAccessToken(accessToken) {
    await saveStoredAuth({ accessToken });
}

export async function clearAuth() {
    await rm(getAuthFilePath(), { force: true });
}

export async function authHeaders(init) {
    const headers = new Headers(init);
    const accessToken = await getAccessToken();
    if (accessToken && !headers.has("authorization")) {
        headers.set("authorization", `Bearer ${accessToken}`);
        return headers;
    }
    return headers;
}

export async function requireAccessToken() {
    const accessToken = await getAccessToken();
    if (accessToken) {
        return accessToken;
    }
    throw new Error("Not logged in. Run `iquly login` or set IQULY_ACCESS_TOKEN.");
}

export async function loginWithDeviceFlow() {
    const baseUrl = normalizeEndpoint();
    const device = await postJson(authUrl(baseUrl, "/api/auth/device/code"), {
        client_id: CLIENT_ID,
        scope: SCOPE,
    });
    const url = verificationUrl(baseUrl, device);
    console.log("Open this URL to approve CLI login:");
    console.log(url);
    console.log(`\nCode: ${device.user_code}`);
    if (!openBrowser(url)) {
        console.log("\nCould not open a browser automatically. Open the URL above manually.");
    }
    console.log("\nWaiting for approval...");
    const accessToken = await pollForAccessToken(baseUrl, device.device_code, device.interval, Date.now() + device.expires_in * 1000);
    await saveAccessToken(accessToken);
    console.log("Logged in to IQuly.");
}

export async function whoAmI() {
    return requestJson(`${normalizeEndpoint()}/v1/me`);
}
