# gpt-5-plan MCP Server (npx-first)

Generate clear development plans using GPT-5 with a structured Japanese YAML specification. This server runs via npx, so you don't need to clone or build locally.

### Key features

- npx-friendly: install-and-run with a single command
- OpenAI-compatible: works with OpenAI or compatible endpoints via `OPENAI_BASE_URL`
- Safe defaults: STDIO transport for broad MCP client compatibility

### Requirements

- Node.js 18+
- An MCP-capable client (Cursor, Claude Code, VS Code MCP, Windsurf, etc.)
- OpenAI API Key (`OPENAI_API_KEY`)

---

## Getting started (npx, no clone required)

Most MCP clients support launching servers via `npx`. Use the standard configuration below and inject your environment variables.

### Standard client config (JSON)
```json
{
  "mcpServers": {
    "gpt-5-plan": {
      "command": "npx",
      "args": ["gpt-5-plan-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "sk-REPLACE_ME",
        "OPENAI_MODEL": "gpt-5",
        "OPENAI_TEXT_VERBOSITY": "low"
      },
      "autoStart": true
    }
  }
}
```

### Claude Code (recommended)
Add this server with the CLI (no local clone needed):

```bash
claude mcp add gpt-5-plan -s user \
  -e OPENAI_API_KEY="sk-REPLACE_ME" \
  -e OPENAI_MODEL="gpt-5" \
  -e OPENAI_TEXT_VERBOSITY="low" \
  -- npx -y gpt-5-plan-mcp@latest
```

Remove if needed:
```bash
claude mcp remove gpt-5-plan
```

### Cursor
Project-local example in `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "gpt-5-plan": {
      "command": "npx",
      "args": ["gpt-5-plan-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "sk-REPLACE_ME",
        "OPENAI_MODEL": "gpt-5",
        "OPENAI_TEXT_VERBOSITY": "low"
      },
      "autoStart": true
    }
  }
}
```

### VS Code / VS Code Insiders
Use the standard JSON config in your MCP extension, or install via your MCP client UI. Pin a version with `@1.0.0` if you need stability.

### Other clients (Windsurf, LM Studio, Goose, Qodo Gen, etc.)
- Command: `npx`
- Args: `["gpt-5-plan-mcp@latest"]`
- Env: `OPENAI_API_KEY=...` and optional variables below

---

## Configuration

- `OPENAI_API_KEY` (required): your API key
- `OPENAI_MODEL` (default: `gpt-5`)
- `OPENAI_TEXT_VERBOSITY` (`low` | `medium` | `high`, default: `low`)
- `OPENAI_BASE_URL` (optional): set when using a compatible proxy endpoint
- `OPENAI_REASONING_EFFORT` (`low` | `medium` | `high`, default: `medium`)

Notes:
- The server chooses reasoning effort per request; defaults may be overridden in code paths for `gpt5_plan`.

---

## Tools

- `gpt5_plan`: Generate a YAML plan from inputs using the Japanese YAML spec

Input fields (all optional, strings): `goal`, `context`, `user_request`, `scope`, `focus_features`, `project_type`, `non_functionals`, `constraints`, `kpi_preferences`, `paneling`, `panel_count`, `targets`.

Example call (conceptual):
```json
{
  "name": "gpt5_plan",
  "arguments": {
    "user_request": "新規機能Xの開発計画を作って",
    "scope": "full",
    "project_type": "web-app",
    "focus_features": "auth, i18n"
  }
}
```

---

## Troubleshooting

- 401 Unauthorized: verify `OPENAI_API_KEY` (no extra whitespace)
- Use Node 18+
- Do not `console.log` to stdout in STDIO servers; use stderr for logs
- Claude logs: `tail -n 50 -f ~/Library/Logs/Claude/mcp*.log`

---

## Local development (optional)

You can still clone and build locally if desired:
```bash
npm i
npm run build
node build/index.js
```

---

## License

ISC
