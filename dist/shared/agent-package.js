"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAgentManifest = parseAgentManifest;
exports.readAgentManifest = readAgentManifest;
exports.readAgentToolsConfig = readAgentToolsConfig;
exports.parseAgentScheduleConfig = parseAgentScheduleConfig;
exports.readAgentScheduleConfig = readAgentScheduleConfig;
exports.parseAgentWorkspaceConfig = parseAgentWorkspaceConfig;
exports.readAgentWorkspaceConfig = readAgentWorkspaceConfig;
exports.validateAgentPackage = validateAgentPackage;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const REQUIRED_ITEMS = [
    "AGENT.md",
    "manifest.json",
    "Dockerfile",
    "tools.json",
    "schedule.json",
    "workspace-config.json",
    "skills",
    "files",
    "README.md",
];
const SUPPORTED_CAPABILITIES = new Set([
    "shell.exec",
    "fs.read",
    "fs.write",
    "fs.list",
    "package.read",
    "package.list",
    "schedule.create",
]);
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));
}
function isPositiveInteger(value) {
    return Number.isInteger(value) && Number(value) > 0;
}
function isValidIsoDate(value) {
    return Number.isFinite(Date.parse(value));
}
function isValidDockerImageRef(value) {
    const trimmed = value.trim();
    if (!trimmed || /\s/.test(trimmed)) {
        return false;
    }
    return (/@sha256:[a-fA-F0-9]{64}$/.test(trimmed) || /:[^/][^@\s]*$/.test(trimmed));
}
async function exists(targetPath) {
    try {
        await node_fs_1.promises.stat(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
function validateSchemaField(schema, fieldName) {
    if (schema === undefined) {
        return [];
    }
    if (!isRecord(schema)) {
        return [`tools.json ${fieldName} must be a JSON object when provided`];
    }
    return validateToolSchema(schema, `tools.json ${fieldName}`);
}
function validateEnumValues(schema, path) {
    if (schema.enum === undefined) {
        return [];
    }
    if (!Array.isArray(schema.enum) || schema.enum.length === 0) {
        return [`${path}.enum must be a non-empty array when provided`];
    }
    const values = schema.enum;
    if (values.some((value) => typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean")) {
        return [`${path}.enum must contain only string, number, or boolean values`];
    }
    if (new Set(values.map((value) => JSON.stringify(value))).size !== values.length) {
        return [`${path}.enum must not contain duplicate values`];
    }
    const schemaType = typeof schema.type === "string" ? schema.type : undefined;
    if (schemaType === "string" && values.some((value) => typeof value !== "string")) {
        return [`${path}.enum must contain only strings when type is \`string\``];
    }
    if (schemaType === "number" && values.some((value) => typeof value !== "number")) {
        return [`${path}.enum must contain only numbers when type is \`number\``];
    }
    if (schemaType === "integer" &&
        values.some((value) => !Number.isInteger(value))) {
        return [`${path}.enum must contain only integers when type is \`integer\``];
    }
    if (schemaType === "boolean" && values.some((value) => typeof value !== "boolean")) {
        return [`${path}.enum must contain only booleans when type is \`boolean\``];
    }
    return [];
}
function validateToolSchema(schema, path) {
    const errors = [];
    const schemaType = typeof schema.type === "string" ? schema.type : undefined;
    if (schemaType !== undefined &&
        schemaType !== "object" &&
        schemaType !== "array" &&
        schemaType !== "string" &&
        schemaType !== "boolean" &&
        schemaType !== "number" &&
        schemaType !== "integer") {
        errors.push(`${path}.type must be one of object, array, string, boolean, number, or integer`);
    }
    errors.push(...validateEnumValues(schema, path));
    if (schemaType === "object") {
        if (schema.properties !== undefined && !isRecord(schema.properties)) {
            errors.push(`${path}.properties must be an object when provided`);
        }
        if (schema.required !== undefined &&
            (!Array.isArray(schema.required) ||
                schema.required.some((value) => typeof value !== "string"))) {
            errors.push(`${path}.required must be an array of strings when provided`);
        }
        if (schema.additionalProperties !== undefined &&
            typeof schema.additionalProperties !== "boolean") {
            errors.push(`${path}.additionalProperties must be a boolean when provided`);
        }
        if (isRecord(schema.properties)) {
            for (const [key, value] of Object.entries(schema.properties)) {
                if (!isRecord(value)) {
                    errors.push(`${path}.properties.${key} must be an object`);
                    continue;
                }
                errors.push(...validateToolSchema(value, `${path}.properties.${key}`));
            }
        }
    }
    if (schemaType === "array" && schema.items !== undefined) {
        if (!isRecord(schema.items)) {
            errors.push(`${path}.items must be an object when provided`);
        }
        else {
            errors.push(...validateToolSchema(schema.items, `${path}.items`));
        }
    }
    if (schemaType === "string" && schema.minLength !== undefined) {
        if (!Number.isInteger(schema.minLength) || Number(schema.minLength) < 0) {
            errors.push(`${path}.minLength must be a non-negative integer when provided`);
        }
    }
    return errors;
}
function parseAgentManifest(parsed) {
    if (!isRecord(parsed)) {
        return {
            ok: false,
            errors: ["manifest.json must contain a top-level object"],
        };
    }
    const errors = [];
    const id = parsed.id;
    const name = parsed.name;
    const version = parsed.version;
    const description = parsed.description;
    const image = parsed.image;
    if (!isNonEmptyString(id)) {
        errors.push("manifest.json must include a string `id`");
    }
    if (!isNonEmptyString(name)) {
        errors.push("manifest.json must include a string `name`");
    }
    if (!isNonEmptyString(version)) {
        errors.push("manifest.json must include a string `version`");
    }
    if (!isNonEmptyString(description)) {
        errors.push("manifest.json must include a string `description`");
    }
    if (!isNonEmptyString(image)) {
        errors.push("manifest.json must include a string `image`");
    }
    else if (!isValidDockerImageRef(image)) {
        errors.push("manifest.json `image` must be a valid container image reference");
    }
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return {
        ok: true,
        manifest: {
            id: id,
            name: name,
            version: version,
            description: description,
            image: image,
        },
    };
}
async function readAgentManifest(filePath) {
    let parsed;
    try {
        parsed = JSON.parse(await node_fs_1.promises.readFile(filePath, "utf8"));
    }
    catch (error) {
        return {
            ok: false,
            errors: [
                `manifest.json is not valid JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`,
            ],
        };
    }
    return parseAgentManifest(parsed);
}
async function readAgentToolsConfig(filePath) {
    let parsed;
    try {
        parsed = JSON.parse(await node_fs_1.promises.readFile(filePath, "utf8"));
    }
    catch (error) {
        return {
            ok: false,
            errors: [
                `tools.json is not valid JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`,
            ],
        };
    }
    if (!isRecord(parsed)) {
        return { ok: false, errors: ["tools.json must contain a top-level object"] };
    }
    const tools = parsed.tools;
    if (!Array.isArray(tools)) {
        return { ok: false, errors: ["tools.json must include a `tools` array"] };
    }
    const errors = [];
    const seenNames = new Set();
    const normalizedTools = [];
    for (const [index, entry] of tools.entries()) {
        if (!isRecord(entry)) {
            errors.push(`tools.json tool at index ${index} must be an object`);
            continue;
        }
        const name = entry.name;
        const capability = entry.capability;
        const command = entry.command;
        const timeoutMs = entry.timeoutMs;
        const hasCapability = capability !== undefined;
        const hasCommand = command !== undefined;
        const toolErrors = [];
        if (!isNonEmptyString(name)) {
            toolErrors.push(`tools.json tool at index ${index} must include a non-empty string \`name\``);
        }
        else if (seenNames.has(name)) {
            toolErrors.push(`tools.json contains duplicate tool name: ${name}`);
        }
        else {
            seenNames.add(name);
        }
        if (hasCapability === hasCommand) {
            toolErrors.push(`tools.json tool \`${String(name ?? index)}\` must include exactly one of \`capability\` or \`command\``);
        }
        if (hasCapability) {
            if (!isNonEmptyString(capability)) {
                toolErrors.push(`tools.json tool \`${String(name ?? index)}\` has an invalid \`capability\``);
            }
            else if (!SUPPORTED_CAPABILITIES.has(capability)) {
                toolErrors.push(`tools.json tool \`${String(name ?? index)}\` uses unsupported capability \`${capability}\``);
            }
        }
        if (hasCommand && !isStringArray(command)) {
            toolErrors.push(`tools.json tool \`${String(name ?? index)}\` must use a non-empty string array for \`command\``);
        }
        if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || Number(timeoutMs) <= 0)) {
            toolErrors.push(`tools.json tool \`${String(name ?? index)}\` must use a positive integer for \`timeoutMs\``);
        }
        toolErrors.push(...validateSchemaField(entry.inputSchema, "inputSchema"));
        toolErrors.push(...validateSchemaField(entry.outputSchema, "outputSchema"));
        errors.push(...toolErrors);
        if (toolErrors.length === 0 && isNonEmptyString(name)) {
            normalizedTools.push({
                name,
                capability: isNonEmptyString(capability) ? capability : undefined,
                command: isStringArray(command) ? command : undefined,
                inputSchema: isRecord(entry.inputSchema) ? entry.inputSchema : undefined,
                outputSchema: isRecord(entry.outputSchema) ? entry.outputSchema : undefined,
                timeoutMs: Number.isInteger(timeoutMs) ? Number(timeoutMs) : undefined,
            });
        }
    }
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return {
        ok: true,
        config: {
            tools: normalizedTools,
        },
    };
}
function parseAgentScheduleConfig(parsed) {
    if (!isRecord(parsed)) {
        return {
            ok: false,
            errors: ["schedule.json must contain a top-level object"],
        };
    }
    if (!Array.isArray(parsed.entries)) {
        return {
            ok: false,
            errors: ["schedule.json must include an `entries` array"],
        };
    }
    const errors = [];
    const seenIds = new Set();
    const entries = [];
    for (const [index, entry] of parsed.entries.entries()) {
        if (!isRecord(entry)) {
            errors.push(`schedule.json entry at index ${index} must be an object`);
            continue;
        }
        const id = entry.id;
        const scheduleType = entry.scheduleType;
        const runAt = entry.runAt;
        const intervalSeconds = entry.intervalSeconds;
        const runContext = entry.runContext;
        const deliveryMode = entry.deliveryMode;
        const targetThreadId = entry.targetThreadId;
        const work = entry.work;
        const entryErrors = [];
        if (!isNonEmptyString(id)) {
            entryErrors.push(`schedule.json entry at index ${index} must include a non-empty string \`id\``);
        }
        else if (seenIds.has(id)) {
            entryErrors.push(`schedule.json contains duplicate entry id: ${id}`);
        }
        else {
            seenIds.add(id);
        }
        if (scheduleType !== "once" && scheduleType !== "interval") {
            entryErrors.push(`schedule.json entry \`${String(id ?? index)}\` must use scheduleType \`once\` or \`interval\``);
        }
        if (scheduleType === "once") {
            if (!isNonEmptyString(runAt) || !isValidIsoDate(runAt)) {
                entryErrors.push(`schedule.json entry \`${String(id ?? index)}\` must include a valid ISO \`runAt\` for scheduleType \`once\``);
            }
        }
        if (scheduleType === "interval" && !isPositiveInteger(intervalSeconds)) {
            entryErrors.push(`schedule.json entry \`${String(id ?? index)}\` must include a positive integer \`intervalSeconds\` for scheduleType \`interval\``);
        }
        if (runContext !== undefined &&
            runContext !== "source_thread" &&
            runContext !== "job_thread" &&
            runContext !== "new_thread") {
            entryErrors.push(`schedule.json entry \`${String(id ?? index)}\` has an invalid \`runContext\``);
        }
        if (deliveryMode !== undefined &&
            deliveryMode !== "none" &&
            deliveryMode !== "same_as_run_context" &&
            deliveryMode !== "target_thread") {
            entryErrors.push(`schedule.json entry \`${String(id ?? index)}\` has an invalid \`deliveryMode\``);
        }
        if (deliveryMode === "target_thread" && !isNonEmptyString(targetThreadId)) {
            entryErrors.push(`schedule.json entry \`${String(id ?? index)}\` must include \`targetThreadId\` when deliveryMode is \`target_thread\``);
        }
        if (!isRecord(work)) {
            entryErrors.push(`schedule.json entry \`${String(id ?? index)}\` must include a \`work\` object`);
        }
        else if (work.type === "send") {
            if (!isNonEmptyString(work.text)) {
                entryErrors.push(`schedule.json entry \`${String(id ?? index)}\` with work.type \`send\` must include non-empty \`work.text\``);
            }
        }
        else if (work.type === "run") {
            if (!isNonEmptyString(work.prompt)) {
                entryErrors.push(`schedule.json entry \`${String(id ?? index)}\` with work.type \`run\` must include non-empty \`work.prompt\``);
            }
        }
        else {
            entryErrors.push(`schedule.json entry \`${String(id ?? index)}\` must use work.type \`send\` or \`run\``);
        }
        errors.push(...entryErrors);
        if (entryErrors.length === 0 &&
            isNonEmptyString(id) &&
            (scheduleType === "once" || scheduleType === "interval") &&
            isRecord(work) &&
            (work.type === "send" || work.type === "run")) {
            entries.push({
                id,
                scheduleType,
                runAt: typeof runAt === "string" ? runAt : undefined,
                intervalSeconds: isPositiveInteger(intervalSeconds) ? Number(intervalSeconds) : undefined,
                work: work.type === "send"
                    ? { type: "send", text: String(work.text) }
                    : { type: "run", prompt: String(work.prompt) },
                runContext: runContext === "source_thread" ||
                    runContext === "job_thread" ||
                    runContext === "new_thread"
                    ? runContext
                    : undefined,
                deliveryMode: deliveryMode === "none" ||
                    deliveryMode === "same_as_run_context" ||
                    deliveryMode === "target_thread"
                    ? deliveryMode
                    : undefined,
                targetThreadId: isNonEmptyString(targetThreadId) ? targetThreadId : undefined,
            });
        }
    }
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return {
        ok: true,
        config: { entries },
    };
}
async function readAgentScheduleConfig(filePath) {
    let parsed;
    try {
        parsed = JSON.parse(await node_fs_1.promises.readFile(filePath, "utf8"));
    }
    catch (error) {
        return {
            ok: false,
            errors: [
                `schedule.json is not valid JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`,
            ],
        };
    }
    return parseAgentScheduleConfig(parsed);
}
function parseAgentWorkspaceConfig(parsed) {
    if (!isRecord(parsed)) {
        return {
            ok: false,
            errors: ["workspace-config.json must contain a top-level object"],
        };
    }
    if (!Array.isArray(parsed.fields)) {
        return {
            ok: false,
            errors: ["workspace-config.json must include a `fields` array"],
        };
    }
    const errors = [];
    const seenKeys = new Set();
    const fields = [];
    for (const [index, entry] of parsed.fields.entries()) {
        if (!isRecord(entry)) {
            errors.push(`workspace-config.json field at index ${index} must be an object`);
            continue;
        }
        const key = entry.key;
        const label = entry.label;
        const type = entry.type;
        const description = entry.description;
        const required = entry.required;
        const fieldErrors = [];
        if (!isNonEmptyString(key)) {
            fieldErrors.push(`workspace-config.json field at index ${index} must include a non-empty string \`key\``);
        }
        else if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
            fieldErrors.push(`workspace-config.json field \`${key}\` must use only uppercase letters, numbers, and underscores`);
        }
        else if (seenKeys.has(key)) {
            fieldErrors.push(`workspace-config.json contains duplicate field key: ${key}`);
        }
        else {
            seenKeys.add(key);
        }
        if (!isNonEmptyString(label)) {
            fieldErrors.push(`workspace-config.json field \`${String(key ?? index)}\` must include a non-empty string \`label\``);
        }
        if (type !== undefined &&
            type !== "text" &&
            type !== "secret" &&
            type !== "email" &&
            type !== "url") {
            fieldErrors.push(`workspace-config.json field \`${String(key ?? index)}\` has an invalid \`type\``);
        }
        if (description !== undefined &&
            description !== null &&
            !isNonEmptyString(description)) {
            fieldErrors.push(`workspace-config.json field \`${String(key ?? index)}\` must use a non-empty string \`description\` when provided`);
        }
        if (required !== undefined && typeof required !== "boolean") {
            fieldErrors.push(`workspace-config.json field \`${String(key ?? index)}\` must use a boolean \`required\` when provided`);
        }
        errors.push(...fieldErrors);
        if (fieldErrors.length === 0 && isNonEmptyString(key) && isNonEmptyString(label)) {
            fields.push({
                key,
                label,
                type: type === "text" || type === "secret" || type === "email" || type === "url"
                    ? type
                    : undefined,
                description: isNonEmptyString(description) ? description : undefined,
                required: typeof required === "boolean" ? required : undefined,
            });
        }
    }
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return {
        ok: true,
        config: { fields },
    };
}
async function readAgentWorkspaceConfig(filePath) {
    let parsed;
    try {
        parsed = JSON.parse(await node_fs_1.promises.readFile(filePath, "utf8"));
    }
    catch (error) {
        return {
            ok: false,
            errors: [
                `workspace-config.json is not valid JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`,
            ],
        };
    }
    return parseAgentWorkspaceConfig(parsed);
}
async function validateAgentPackage(rootDir) {
    const resolvedRoot = node_path_1.default.resolve(rootDir);
    const errors = [];
    const warnings = [];
    await Promise.all(REQUIRED_ITEMS.map(async (name) => {
        if (!(await exists(node_path_1.default.join(resolvedRoot, name)))) {
            errors.push(`Missing required path: ${name}`);
        }
    }));
    let manifest = null;
    let scheduleConfig = null;
    let workspaceConfig = null;
    let readmeMarkdown = null;
    if (!errors.includes("Missing required path: manifest.json")) {
        const manifestResult = await readAgentManifest(node_path_1.default.join(resolvedRoot, "manifest.json"));
        if (!manifestResult.ok) {
            errors.push(...manifestResult.errors);
        }
        else {
            manifest = manifestResult.manifest;
        }
    }
    if (!errors.includes("Missing required path: tools.json")) {
        const toolsConfig = await readAgentToolsConfig(node_path_1.default.join(resolvedRoot, "tools.json"));
        if (!toolsConfig.ok) {
            errors.push(...toolsConfig.errors);
        }
    }
    if (!errors.includes("Missing required path: schedule.json")) {
        const schedule = await readAgentScheduleConfig(node_path_1.default.join(resolvedRoot, "schedule.json"));
        if (!schedule.ok) {
            errors.push(...schedule.errors);
        }
        else {
            scheduleConfig = schedule.config;
        }
    }
    if (!errors.includes("Missing required path: workspace-config.json")) {
        const workspaceConfigResult = await readAgentWorkspaceConfig(node_path_1.default.join(resolvedRoot, "workspace-config.json"));
        if (!workspaceConfigResult.ok) {
            errors.push(...workspaceConfigResult.errors);
        }
        else {
            workspaceConfig = workspaceConfigResult.config;
        }
    }
    if (!errors.includes("Missing required path: README.md")) {
        try {
            readmeMarkdown = await node_fs_1.promises.readFile(node_path_1.default.join(resolvedRoot, "README.md"), "utf8");
        }
        catch (error) {
            errors.push(`README.md could not be read: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    return {
        ok: errors.length === 0,
        rootDir: resolvedRoot,
        errors,
        warnings,
        manifest,
        scheduleConfig,
        workspaceConfig,
        readmeMarkdown,
    };
}
