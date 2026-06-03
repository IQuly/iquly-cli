import { mkdtemp, rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { authHeaders } from "./auth.js";
import { validateAgentSource } from "./agent-source.js";
import { CliApiError, normalizeEndpoint, requestJson } from "./api.js";
import { printBlankLine, printHeading, printKeyValue, printList } from "./output.js";
function formatPushError(error) {
    if (error.status === 401) {
        return "Authentication failed while pushing. Run `iquly login` again.";
    }
    if (error.message) {
        return `Push failed: ${error.message}`;
    }
    return `Push failed with status ${error.status}.`;
}
function isDuplicateVersionError(message) {
    return Boolean(message && /already exists for agent/i.test(message));
}
export function formatBuildFailureMessage(build) {
    const errorMessage = build.errorMessage?.trim();
    if (isDuplicateVersionError(errorMessage)) {
        const agentName = build.agentName?.trim() || "this agent";
        const version = build.agentVersion?.trim() || "this version";
        return [
            `Push failed: ${errorMessage}`,
            `Bump the version in manifest.json for ${agentName} (currently ${version}) and push again.`,
        ].join(" ");
    }
    if (errorMessage) {
        return `Push failed: ${errorMessage}`;
    }
    return "Push failed before the agent version was published.";
}
async function createSourceArchive(rootDir) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "iquly-push-"));
    const archivePath = path.join(tempDir, "agent-source.tar.gz");
    const proc = spawn("tar", ["-czf", archivePath, "-C", rootDir, "."]);
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
    });
    proc.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
    });
    const exitCode = await new Promise((resolve, reject) => {
        proc.on("error", reject);
        proc.on("close", (code) => resolve(code ?? 1));
    });
    if (exitCode !== 0) {
        await rm(tempDir, { recursive: true, force: true });
        throw new Error((stderr || stdout).trim() || "Failed to create source archive.");
    }
    return archivePath;
}
async function createBuild(endpoint, archivePath) {
    const headers = await authHeaders({
        "content-type": "application/json",
    });
    const archiveBase64 = (await readFile(archivePath)).toString("base64");
    const response = await fetch(`${endpoint}/builds`, {
        method: "POST",
        headers,
        body: JSON.stringify({ archiveBase64 }),
    });
    const parsed = response.status === 204 ? null : await response.json();
    if (!response.ok) {
        throw new CliApiError(response.status === 401
            ? "Authentication failed. Run `iquly login` again."
            : parsed && typeof parsed === "object" && "error" in parsed
                ? String(parsed.error)
                : response.statusText || "Build request failed", response.status);
    }
    return parsed;
}
async function pollBuild(endpoint, buildId) {
    let lastStatus = null;
    while (true) {
        const record = await requestJson(`${endpoint}/builds/${encodeURIComponent(buildId)}`);
        if (record.status !== lastStatus) {
            printKeyValue("build", `${record.id} (${record.status})`);
            lastStatus = record.status;
        }
        if (record.status === "ready" || record.status === "failed") {
            return record;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
}
export async function runPush(rootDir, options) {
    const result = await validateAgentSource(rootDir);
    if (!result.ok || !result.manifest) {
        printHeading("Validation failed");
        printList(result.errors);
        if (result.warnings.length > 0) {
            printBlankLine();
            console.log("Warnings:");
            printList(result.warnings);
        }
        process.exitCode = 1;
        return;
    }
    const endpoint = normalizeEndpoint();
    printHeading("Validation passed");
    printKeyValue("path", result.rootDir);
    printKeyValue("agent", result.manifest.name);
    printKeyValue("version", result.manifest.version);
    printKeyValue("image", result.manifest.image);
    if (options.dryRun) {
        printBlankLine();
        printHeading("Dry run complete");
        console.log("No metadata was published.");
        return;
    }
    let uploaded = null;
    const archivePath = await createSourceArchive(result.rootDir);
    try {
        const build = await createBuild(endpoint, archivePath);
        printBlankLine();
        printHeading("Build started");
        printKeyValue("buildId", build.id);
        const completed = await pollBuild(endpoint, build.id);
        if (completed.status !== "ready" || !completed.agentId || !completed.agentVersionId) {
            if (completed.buildLog) {
                printBlankLine();
                printHeading("Build log");
                console.log(completed.buildLog);
            }
            throw new Error(formatBuildFailureMessage(completed));
        }
        uploaded = {
            id: completed.agentVersionId,
            agentId: completed.agentId,
            agentName: completed.agentName ?? result.manifest.name,
            version: completed.agentVersion ?? result.manifest.version,
            createdAt: completed.updatedAt,
        };
    }
    catch (error) {
        if (error instanceof CliApiError) {
            throw new Error(formatPushError(error));
        }
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Could not reach IQuly while pushing. Try again in a moment.");
    }
    finally {
        await rm(path.dirname(archivePath), { recursive: true, force: true });
    }
    printBlankLine();
    printHeading("Private version published");
    printKeyValue("agentId", uploaded.agentId);
    printKeyValue("versionId", uploaded.id);
    printKeyValue("agent", uploaded.agentName);
    printKeyValue("version", uploaded.version);
    printKeyValue("createdAt", uploaded.createdAt);
}
