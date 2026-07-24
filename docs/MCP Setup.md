# AI Tools Setup Reference

Context memory for AI-agent tooling installed for this project. Read this file when asked "iss folder ko padho" about AI tools/MCP/agent setup.

## Installed Tools

| Tool | Type | Scope | Status |
|------|------|-------|--------|
| context7 | MCP server | Kiro user-level | enabled |
| serena | MCP server | Kiro user-level | enabled |
| ponytail | Steering file (skill) | Kiro project-level | always active |
| caveman | Steering file (skill) | Kiro project-level | always active |
| supabase-hosted | Kiro Power (MCP) | Kiro user-level | enabled |
| chrome-devtools-mcp | MCP server | Kiro user-level | enabled |

## What each does

- **context7**: fetches up-to-date, version-specific library docs (React, Supabase, framer-motion, etc.) directly into context. Prevents outdated/hallucinated API usage. Source: https://github.com/upstash/context7
- **serena**: semantic code retrieval/editing MCP toolkit (IDE-like symbol search, rename, refactor across files) instead of raw text search/replace. Source: https://github.com/oraios/serena
- **ponytail**: forces minimal/YAGNI code — no unrequested abstractions, shortest working diff, reuse existing code before adding new. Source: https://github.com/DietrichGebert/ponytail
- **caveman**: ultra-compressed chat responses (~65% fewer output tokens), same technical accuracy, code blocks untouched. Source: https://github.com/JuliusBrussee/caveman

## File locations (this machine)

- Kiro MCP config (user-level, applies across all Kiro projects): `C:\Users\singh\.kiro\settings\mcp.json`
- Ponytail steering file (this project only): `.kiro/steering/ponytail.md` (`inclusion: always`)
- Caveman steering file (this project only): `.kiro/steering/caveman.md` (`inclusion: always`)
- uv/uvx binaries: `C:\Users\singh\AppData\Roaming\Python\Python313\Scripts\uvx.exe`

## Scope — IMPORTANT

All of the above are **Kiro-specific**. They do NOT carry over automatically to:
- Another IDE/agent (Cursor, Claude Code, Claude Desktop, Copilot, Windsurf, etc.) opening this same project folder
- A different AI agent inside Kiro that doesn't read `.kiro/steering/*.md` or Kiro's MCP config

Reason: `.kiro/steering/` is a Kiro-only convention, and `~/.kiro/settings/mcp.json` is Kiro's own user config path. Other tools use their own paths and formats.

## How to carry these to another tool

### ponytail / caveman (skill/rules text)
Each project has an installer that detects installed agents and copies the skill file to the right location automatically:
```powershell
# caveman example (Windows PowerShell)
irm https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.ps1 | iex
```
For ponytail, manually copy `skills/ponytail/SKILL.md` content to the target agent's rules/skill location (see that repo's `INSTALL.md` for exact per-agent paths: Claude Code `.claude/skills/`, Cursor `.cursor/rules/`, etc.). Local copies of both already exist in `.kiro/steering/ponytail.md` and `.kiro/steering/caveman.md` — the text can be reused directly (strip the Kiro frontmatter, i.e. the `inclusion:` lines).

### context7 (MCP)
Add to the target tool's MCP config file (path varies by tool):
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@1.0.20"]
    }
  }
}
```
Known config paths:
- Claude Desktop (Windows): `%APPDATA%\Claude\claude_desktop_config.json`
- Cursor: `.cursor/mcp.json` (project) or global settings
- Claude Code: `~/.claude/mcp.json` or `claude mcp add` command

### serena (MCP)
```json
{
  "command": "C:\\Users\\singh\\AppData\\Roaming\\Python\\Python313\\Scripts\\uvx.exe",
  "args": ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server", "--context", "ide-assistant"]
}
```
Add under the target tool's `mcpServers` config using the same paths as context7 above. Change `--context` value per agent if needed (Serena supports `ide-assistant`, `codex`, `chatgpt`, etc. — see Serena docs).

## What to do when this comes up again

If the user says something like "carry karo" / "dusre tool me setup karo" / references this file:
1. Ask which target tool (Cursor, Claude Code, Claude Desktop, etc.) if not already stated.
2. Find that tool's exact MCP config file path (may need a quick web search if uncertain).
3. Add context7 and/or serena JSON blocks into that config, preserving any existing entries (never overwrite blindly).
4. For ponytail/caveman, copy the steering file content (minus Kiro frontmatter) to that tool's rules/skill mechanism, or run the official installer script if the tool supports it.
