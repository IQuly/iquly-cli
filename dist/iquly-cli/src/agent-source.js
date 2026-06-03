import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const sharedModule = process.versions.bun
    ? await import("../../shared/agent-package.js")
    : require("../../shared/agent-package.cjs");
const { readAgentToolsConfig, validateAgentPackage } = sharedModule;
async function exists(targetPath) {
    try {
        await fs.stat(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
export async function validateAgentSource(rootDir) {
    return validateAgentPackage(rootDir);
}
export async function readToolsConfig(filePath) {
    return readAgentToolsConfig(filePath);
}
export async function createAgentScaffold(rootDir, manifest) {
    const resolvedRoot = path.resolve(rootDir);
    const existingTargets = await Promise.all([
        "AGENT.md",
        "manifest.json",
        "README.md",
        "skills",
        "files",
        "tools.json",
        "schedule.json",
        "workspace-config.json",
        "tools",
    ].map(async (name) => ({
        name,
        exists: await exists(path.join(resolvedRoot, name)),
    })));
    const conflicts = existingTargets.filter((target) => target.exists).map((target) => target.name);
    if (conflicts.length > 0) {
        throw new Error(`Refusing to overwrite existing paths: ${conflicts.join(", ")}`);
    }
    await fs.mkdir(path.join(resolvedRoot, "skills", "summarize-request"), { recursive: true });
    await fs.mkdir(path.join(resolvedRoot, "files"), { recursive: true });
    await fs.mkdir(path.join(resolvedRoot, "tools", "example-echo"), { recursive: true });
    const agentMd = `# ${manifest.name}

## Identity

- Name: ${manifest.name}
- Purpose: ${manifest.description}

## Responsibilities

- Define what this agent is responsible for.

## Constraints

- Add the rules this agent should never break.

## Operating Style

- Describe how the agent should communicate and make decisions.
`;
    const skillMd = `# Summarize Request

Use this skill when the user asks for a summary, rewrite, or short explanation.

## Behavior

- Identify the core request first.
- Keep the answer concise and practical.
- Preserve important facts and constraints.
`;
    const teamContext = `# Team Context

- Capture durable information the agent should keep nearby.
- Replace this file with real project or team context.
`;
    const readme = `# ${manifest.name}

This repository contains an IQuly agent.

## Structure

\`\`\`text
${manifest.name}/
  AGENT.md
  manifest.json
  Dockerfile
  tools.json
  schedule.json
  workspace-config.json
  skills/
    summarize-request/
      SKILL.md
  files/
    team-context.md
  tools/
    example-echo/
      run.js
\`\`\`
`;
    const dockerfile = `FROM iquly-agent-runtime:dev

COPY . /agent-package

ENV PACKAGE_ROOT=/agent-package
`;
    const toolsConfig = {
        tools: [
            {
                name: "shell_exec",
                capability: "shell.exec",
            },
            {
                name: "fs_read",
                capability: "fs.read",
            },
            {
                name: "fs_write",
                capability: "fs.write",
            },
            {
                name: "fs_list",
                capability: "fs.list",
            },
            {
                name: "package_read",
                capability: "package.read",
            },
            {
                name: "package_list",
                capability: "package.list",
            },
            {
                name: "schedule_create",
                capability: "schedule.create",
            },
            {
                name: "example_echo",
                command: ["bun", "tools/example-echo/run.js"],
                inputSchema: {
                    type: "object",
                    properties: {
                        message: { type: "string" },
                    },
                    required: ["message"],
                    additionalProperties: false,
                },
                outputSchema: {
                    type: "object",
                    properties: {
                        echoed: { type: "string" },
                    },
                    required: ["echoed"],
                    additionalProperties: false,
                },
                timeoutMs: 30000,
            },
        ],
    };
    const scheduleConfig = {
        entries: [],
    };
    const workspaceConfig = {
        fields: [],
    };
    const exampleTool = `#!/usr/bin/env bun
let input = "";
process.stdin.setEncoding("utf8");

for await (const chunk of process.stdin) {
  input += chunk;
}

input = input.trim();
const payload = input ? JSON.parse(input) : {};
const message = typeof payload.message === "string" ? payload.message : "";
process.stdout.write(JSON.stringify({ echoed: message }));
`;
    await Promise.all([
        fs.writeFile(path.join(resolvedRoot, "AGENT.md"), agentMd, "utf8"),
        fs.writeFile(path.join(resolvedRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
        fs.writeFile(path.join(resolvedRoot, "Dockerfile"), dockerfile, "utf8"),
        fs.writeFile(path.join(resolvedRoot, "tools.json"), `${JSON.stringify(toolsConfig, null, 2)}\n`, "utf8"),
        fs.writeFile(path.join(resolvedRoot, "schedule.json"), `${JSON.stringify(scheduleConfig, null, 2)}\n`, "utf8"),
        fs.writeFile(path.join(resolvedRoot, "workspace-config.json"), `${JSON.stringify(workspaceConfig, null, 2)}\n`, "utf8"),
        fs.writeFile(path.join(resolvedRoot, "README.md"), readme, "utf8"),
        fs.writeFile(path.join(resolvedRoot, "skills", "summarize-request", "SKILL.md"), skillMd, "utf8"),
        fs.writeFile(path.join(resolvedRoot, "files", "team-context.md"), teamContext, "utf8"),
        fs.writeFile(path.join(resolvedRoot, "tools", "example-echo", "run.js"), exampleTool, {
            encoding: "utf8",
            mode: 0o755,
        }),
    ]);
}
