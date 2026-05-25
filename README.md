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

## Concepts

- **Worlds** — logical domains with distinct visual identity
- **Stations** — nodes in the graph (components, services, screens, modules)
- **Synapses** — conditional transitions between stations
- **Lines** — complete end-to-end user flows
- **Synaptic Search** — type a word, the map lights up like a neural network

## Requirements

- Node.js 18+
- For embeddings: Ollama (local) or OpenAI API key
- For narration: Ollama with a chat model (llama3.2+) or OpenAI API key

## License

MIT
