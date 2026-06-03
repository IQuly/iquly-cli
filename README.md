# iquly-cli

`iquly-cli` is the developer entry point for creating and publishing IQuly agent versions.

## Mental model

The CLI supports one core loop:

1. authenticate
2. scaffold an agent source package
3. edit the source package
4. validate it
5. publish a new private version

Canonical terms:

- `Agent`: the stable product identity
- `Version`: an immutable published release of that agent
- `Workspace`: a user's persistent copy of a version

## Install

```bash
npm install -g iquly-cli
```

For local development:

```bash
bun install
bun run dev --help
```

## Commands

- `iquly login`
- `iquly logout`
- `iquly whoami`
- `iquly init [dir]`
- `iquly push [dir]`

Example:

```bash
iquly login
iquly init my-agent --description "Internal ops helper"
cd my-agent
iquly push . --dry-run
```

## Recommended workflow

### 1. Authenticate

```bash
iquly login
```

Check the current auth state:

```bash
iquly whoami
```

The CLI uses Better Auth device authorization. `iquly login` opens a browser approval URL and stores an access token in `~/.config/iquly/auth.json`. You can also set `IQULY_ACCESS_TOKEN` for non-interactive use.

### 2. Scaffold a new source package

```bash
iquly init my-agent --description "Internal ops helper"
```

This creates a minimal source package containing:

- `AGENT.md`
- `manifest.json`
- `Dockerfile`
- `tools.json`
- `schedule.json`
- `workspace-config.json`
- `skills/`
- `files/`
- `tools/`
- `README.md`

The scaffold is intended to be a valid starting point for `iquly push --dry-run`.

### 3. Edit the source package

Start here:

- `AGENT.md`: behavior, responsibilities, constraints
- `manifest.json`: stable id, version, description
- `tools.json`: declared tool surface area
- `workspace-config.json`: per-workspace setup contract
- `schedule.json`: recurring platform-managed executions
- `skills/` and `files/`: reusable instructions and reference material

### 4. Validate locally

```bash
iquly push . --dry-run
```

This validates the source package without uploading it.

Use dry run before real publish, especially after changing:

- tools
- schedules
- workspace setup fields
- version metadata

### 5. Publish a private version

```bash
iquly push .
```

The publish flow is:

1. validate the local source package
2. upload the source bundle
3. build the version image on IQuly
4. publish a new private version

In production, the control plane should be configured to publish built images to a pullable registry. Otherwise source builds may produce local-only Docker tags that cannot be deployed on another host.

If validation fails, the CLI stops before upload.

## What `iquly init` gives you

The scaffold includes these built-in tools by default:

- `shell_exec`
- `fs_read`
- `fs_write`
- `fs_list`
- `package_read`
- `package_list`
- `schedule_create`

It also includes one sample custom tool:

- `example_echo`

### Tool groups

Workspace tools:

- `fs_read`
- `fs_write`
- `fs_list`

These operate on mutable workspace state.

Package tools:

- `package_read`
- `package_list`

These operate on the packaged source itself and are useful for full access to files in `files/`, `skills/`, and other checked-in package paths.

Execution tool:

- `shell_exec`

This gives the agent broad shell access inside the runtime. Keep it only if that is part of the intended design.

Scheduling tool:

- `schedule_create`

This lets the agent create one-off future work while it is running.

## Designing a good source package

The main design choice is usually whether the agent should have broad freedom or shaped behavior.

Prefer shaped behavior when possible:

- remove `shell_exec`
- expose narrow custom tools
- declare only the workspace config fields the agent truly needs

Keep broad shell access only when:

- the agent genuinely needs it
- you accept that shell commands can read workspace files and env vars

## Schedules

Use `schedule.json` for recurring behavior that should exist for every workspace created from the version.

Use `schedule_create` for one-off future behavior created by the running agent.

Recurring schedule fields:

- `scheduleType: "interval"` with `intervalSeconds`
- `scheduleType: "once"` with `runAt`
- `work.type: "run"` for an autonomous run
- `work.type: "send"` for a future delivered message

Runtime-created one-off schedules require:

- `threadId`
- `workType`
- either `delaySeconds` or `runAt`

## Workspace setup

Use `workspace-config.json` for user- or account-specific runtime input.

Examples:

- access tokens
- email addresses
- account ids

Supported field types:

- `text`
- `secret`
- `email`
- `url`

Important:

- `secret` values are stored but not echoed back to the frontend
- the runtime receives configured values as env vars
- if `shell_exec` is present, shell commands can read those env vars

## Build flow

For the standard CLI flow, keep:

```json
{
  "image": "iquly-build:pending"
}
```

in `manifest.json`.

That tells IQuly to build and publish the image for you during `iquly push`.

## What the CLI does not do yet

The current CLI is focused on package creation and publish.
It does not yet manage:

- workspaces
- chat
- runtime logs
- deployments
- marketplace operations
