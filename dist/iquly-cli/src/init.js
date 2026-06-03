import path from "node:path";
import { createAgentScaffold } from "./agent-source.js";
import { printBlankLine, printHeading, printKeyValue } from "./output.js";
function slugify(value) {
    return (value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "agent");
}
function inferAgentName(targetDir) {
    return path.basename(path.resolve(targetDir));
}
export async function runInit(targetDir, options) {
    const rootDir = path.resolve(targetDir ?? ".");
    const name = inferAgentName(rootDir);
    await createAgentScaffold(rootDir, {
        id: slugify(name),
        name,
        version: "0.1.0",
        description: options.description ?? "A short description of the agent",
        image: "iquly-build:pending",
    });
    printHeading("Agent initialized");
    printKeyValue("path", rootDir);
    printKeyValue("agent", name);
    printBlankLine();
    console.log("Next steps:");
    console.log("  1. Edit AGENT.md, manifest.json, tools.json, schedule.json, workspace-config.json, and Dockerfile");
    console.log("  2. Run `iquly push . --dry-run`");
    console.log("  3. Run `iquly push .`");
}
