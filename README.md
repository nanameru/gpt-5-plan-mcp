# gpt-5-plan MCP Server

This repository contains an MCP server (STDIO) that uses GPT-5 to create and execute plans.

## Prerequisites
- Node.js 18+
- OpenAI API Key (`OPENAI_API_KEY`)

## Build
```bash
cd /Users/kimurataiyou/gpt-5-plan-mcp
npm i
npm run build
```

## Register with Claude Code (user scope, single-line)
Use the command below to add this MCP server to Claude Code.
Replace `OPENAI_API_KEY` with your real key.

```bash
claude mcp add gpt-5-plan -s user -e OPENAI_API_KEY="sk-REPLACE_ME" -- $(which node) /Users/kimurataiyou/gpt-5-plan-mcp/build/index.js
```

### Optional: Model and generation parameters (env)
Use the following env vars to control behavior:

- `OPENAI_MODEL` (default: `gpt-5`) — effective
- `OPENAI_TEXT_VERBOSITY` (`low` | `medium` | `high`, default: `low`) — effective
- `OPENAI_BASE_URL` (optional; set when using a compatible proxy endpoint) — effective
- `OPENAI_REASONING_EFFORT` (`low` | `medium` | `high`, default: `medium`) — note: currently overridden per tool

Notes:
- The server sets fixed reasoning effort per tool: `gpt5_plan` uses `medium`, `gpt5_execute` uses `high`. Therefore `OPENAI_REASONING_EFFORT` does not affect these today.
- If you want `OPENAI_REASONING_EFFORT` to take effect globally, remove the tool-specific overrides in `src/index.ts`.

Example with overrides:

```bash
claude mcp add gpt-5-plan -s user \
  -e OPENAI_API_KEY="sk-REPLACE_ME" \
  -e OPENAI_MODEL="gpt-5" \
  -e OPENAI_REASONING_EFFORT="high" \
  -e OPENAI_TEXT_VERBOSITY="low" \
  -- $(which node) /Users/kimurataiyou/gpt-5-plan-mcp/build/index.js
```

Tip: With the current defaults, the `OPENAI_REASONING_EFFORT` value will be ignored (plan=medium, execute=high).

- For project scope, run the same command at your project root and omit `-s user`.
- If the same name already exists, remove it first:

```bash
claude mcp remove gpt-5-plan
```

## Using with Cursor
If you want project-local settings, place `.cursor/mcp.json` at the repository root.

```json
{
  "mcpServers": {
    "gpt-5-plan": {
      "command": "node",
      "args": [
        "/Users/kimurataiyou/gpt-5-plan-mcp/build/index.js"
      ],
      "env": {
        "OPENAI_API_KEY": "sk-REPLACE_ME",
        "OPENAI_MODEL": "gpt-5",
        "OPENAI_REASONING_EFFORT": "medium",
        "OPENAI_TEXT_VERBOSITY": "low"
      },
      "autoStart": true
    }
  }
}
```

Note: In this configuration, `OPENAI_MODEL` / `OPENAI_TEXT_VERBOSITY` are applied. `OPENAI_REASONING_EFFORT` is currently overridden by tool defaults (plan=medium, execute=high).

- Restart Cursor after updating the configuration.
- If you see a 401 error, double‑check the `OPENAI_API_KEY` value/permissions and make sure there are no extra spaces/newlines.

## Available Tools
- `gpt5_plan`: Generate an actionable JSON plan from a goal and optional context
- `gpt5_execute`: Execute a provided plan (JSON/Text) and return a concise summary

## Troubleshooting
- 401 authentication error: verify `OPENAI_API_KEY` value, permissions, and that it has no extra whitespace
- Node version: use 18+ (native `fetch`)
- Use absolute paths: make sure the `build/index.js` path is correct
- Claude logs: `tail -n 50 -f ~/Library/Logs/Claude/mcp*.log`
