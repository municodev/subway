# Subway 🚇

**Every codebase is a game. Every search is a synapse.**

Subway maps your codebase as an interactive, navigable graph — like a subway map for your code. It analyzes your project's structure, traces navigation paths, calculates synaptic weights (influence, dependency, churn, centrality), and produces a single `subway.json` that powers a visual browser and MCP tools for AI agents.

## Quick Start

```bash
# Install globally
npm install -g @municode/subway

# Analyze a TypeScript/JavaScript project
cd your-project
subway init

# Open the interactive visual map
subway serve
```

Or use without installing:

```bash
npx @municode/subway init
npx @municode/subway serve
```

## What You Get

### Interactive Visual Map (`subway serve`)
- **D3-force graph** with pan, zoom, and node dragging
- **Synaptic search** — type any word and the map lights up (keyword expansion + spreading activation)
- **World filters** — click a domain to isolate it
- **Station detail panel** — description, weights, files, authors, incoming/outgoing connections
- **Lines panel** — end-to-end user flows through the system
- **Pins & notes** — save stations you're monitoring

### CLI Commands

| Command | Description |
|---------|-------------|
| `subway init` | Analyze project and generate `subway.json` |
| `subway serve` | Open interactive visual map in browser |
| `subway search <query>` | Synaptic search from the terminal |
| `subway station <id>` | View full station details |
| `subway impact <id>` | See what depends on a station |
| `subway init --embed` | Generate semantic embeddings (Ollama or OpenAI) |
| `subway init --narrate` | Use LLM to generate descriptions and user flows |

### MCP Server (AI Agent Integration)

Subway includes an MCP server with 9 tools for AI agents (Claude Desktop, Cursor, Copilot):

| Tool | Purpose |
|------|---------|
| `subway_search` | Synaptic search with spreading activation |
| `subway_station` | Full details for any station |
| `subway_path` | Find path between two stations with conditions |
| `subway_impact` | Direct + indirect impact analysis |
| `subway_conditions` | Conditions needed to reach a station |
| `subway_onboard` | Guided onboarding path by role |
| `subway_line` | Full end-to-end flow description |
| `subway_busrisk` | Single-author stations (bus factor risk) |
| `subway_ask` | Natural language questions about the codebase |

Configure in Claude Desktop:

```json
{
  "mcpServers": {
    "subway": {
      "command": "npx",
      "args": ["@municode/subway", "subway-mcp", "--file", "/path/to/subway.json"]
    }
  }
}
```

Or in Cursor (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "subway": {
      "command": "subway-mcp",
      "args": ["--file", "/path/to/subway.json"]
    }
  }
}
```

> **⚠️ "I installed it but the tools aren't showing up"** — This is the most common pitfall with MCP. Installing the npm package (`npm install -g`) only puts the `subway-mcp` binary on your disk. MCP tools are **not** automatically available to your AI client — you must also register the server in your client's MCP config. Think of it like installing a program but never creating the desktop shortcut. The wiring is:
>
> `npm install` → binary exists on disk → **config entry tells the client where it is** → client spawns the server process → tools appear.
>
> If the config step is missing, the tools simply won't show up, even though `subway-mcp` works fine from the terminal. The CLI path (`subway init` / `subway serve`) is always available as a fallback.

## Concepts

- **Worlds** — logical domains with distinct visual identity
- **Stations** — nodes in the graph (components, services, screens, modules)
- **Synapses** — conditional transitions between stations
- **Lines** — complete end-to-end user flows
- **Synaptic Search** — type a word, the map lights up like a neural network

## Synaptic Weights

Subway enriches every station (group of files/module) with four dynamic metrics (synaptic weights) ranging from `0` to `1` (or `0%` to `100%`) to evaluate code quality, structure, and risk:

* **Churn** — **Git Change Frequency**: Measures how active a station is in continuous development by analyzing commit history over the last 12 months. Higher churn signals high-velocity, frequently modified code.
* **Centrality** — **Structural Hub Index**: Uses Betweenness Centrality (via Brandes' algorithm) to measure how often a station sits on the shortest path between other stations. High centrality reveals critical hubs that bridge different parts of the system.
* **Dependency** — **Third-Party Risk**: The ratio of external library imports (like npm packages) to local imports. A higher score points to higher coupling and external ecosystem risk.
* **Influence** — **Local Usage Impact**: Measures how widely a station's files are imported by other stations across the local codebase. Core utility modules or shared UI components exhibit high influence.

## Requirements

- Node.js 18+
- For embeddings: Ollama (local) or OpenAI API key
- For narration: Ollama with a chat model (llama3.2+) or OpenAI API key

## License

MIT
