/**
 * Subway MCP Server — setup and transport configuration.
 *
 * Creates an McpServer with all 23 Subway tools (9 read + 14 build),
 * loads the subway.json schema, and connects via stdio transport.
 *
 * Build tools enable LLM-guided interactive map generation — the LLM explores
 * the codebase, defines stations, synapses, worlds, and lines, then saves to subway.json.
 *
 * Note: The embed (vector search) and narrate (LLM description) features are
 * intentionally disabled in the MCP server. When Subway is used as an LLM skill,
 * the LLM itself provides semantic understanding and generates all descriptions,
 * making these features redundant.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { SubwaySchema } from '../types/index.js';

import {
  subwaySearch,
  subwayStation,
  subwayPath,
  subwayImpact,
  subwayConditions,
  subwayOnboard,
  subwayLine,
  subwayBusRisk,
  subwayAsk,
} from './tools.js';

import {
  subwayInitMap,
  subwayReadFile,
  subwayReadDir,
  subwayAddWorld,
  subwayAddStation,
  subwayUpdateStation,
  subwayRemoveStation,
  subwayAddSynapse,
  subwayRemoveSynapse,
  subwayAddLine,
  subwaySaveMap,
  subwayStatus,
  subwayListStations,
  subwayListWorlds,
  subwayListLines,
  subwayScan,
  subwayServe,
  subwayQuerySearch,
  subwayQueryStation,
  subwayQueryPath,
  subwayQueryImpact,
  subwayQueryConditions,
} from './build-tools.js';

/**
 * Load the subway.json schema from a file path.
 */
function loadSchema(filePath: string): SubwaySchema {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `subway.json not found at ${resolvedPath}.\n` +
      `Run "subway init" first to generate the map, or specify the path with SUBWAY_FILE env var.`,
    );
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const schema = JSON.parse(raw) as SubwaySchema;

  // Basic validation
  if (!schema.meta || !Array.isArray(schema.stations) || !Array.isArray(schema.synapses)) {
    throw new Error(
      `Invalid subway.json at ${resolvedPath}. The file does not match the expected schema.`,
    );
  }

  return schema;
}

/**
 * Create and return a configured McpServer with all Subway tools.
 */
export async function createSubwayServer(
  schemaPath: string,
  serverInfo: { name: string; version: string } = { name: 'subway', version: '0.1.0' },
): Promise<McpServer> {
  const schema = loadSchema(schemaPath);

  const server = new McpServer(serverInfo);

  // ==================== Tool 1: subway_search ====================
  server.registerTool(
    'subway_search',
    {
      description:
        'Synaptic search across the codebase map. Returns stations matching a query with activation scores. ' +
        'Supports technical queries (class names, file names), functional queries (login, payment, navigation), ' +
        'and symptomatic queries (what is slow, what breaks often, who touches the database). ' +
        'Uses spreading activation to find related stations through the synapse graph. ' +
        'Search is keyword-based — the LLM using this skill provides semantic understanding.',
      inputSchema: {
        query: z.string().describe('Search query — technical, functional, or symptomatic'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum number of results (1–50, default: 10)'),
      },
    },
    async (args) => {
      return subwaySearch(schema, {
        query: args.query,
        limit: args.limit ?? 10,
      });
    },
  );

  // ==================== Tool 2: subway_station ====================
  server.registerTool(
    'subway_station',
    {
      description:
        'Get detailed information about a specific station (component, service, module). ' +
        'Shows role, weights, files, authors, incoming/outgoing synapses with conditions, and metadata.',
      inputSchema: {
        id: z.string().describe('Station ID or label (e.g., "station_login", "PaymentService")'),
      },
    },
    async (args) => subwayStation(schema, { id: args.id }),
  );

  // ==================== Tool 3: subway_path ====================
  server.registerTool(
    'subway_path',
    {
      description:
        'Find the path between two stations through the synapse graph. ' +
        'Shows step-by-step transitions with conditions that must be satisfied at each hop.',
      inputSchema: {
        from: z.string().describe('Starting station ID or label'),
        to: z.string().describe('Destination station ID or label'),
      },
    },
    async (args) => subwayPath(schema, { from: args.from, to: args.to }),
  );

  // ==================== Tool 4: subway_impact ====================
  server.registerTool(
    'subway_impact',
    {
      description:
        'Analyze the impact of changing a station. Shows what depends on it directly, ' +
        'what gets indirectly affected (2-hop impact), and a composite impact score. ' +
        'Critical for understanding blast radius before making changes.',
      inputSchema: {
        id: z.string().describe('Station ID or label to analyze'),
      },
    },
    async (args) => subwayImpact(schema, { id: args.id }),
  );

  // ==================== Tool 5: subway_conditions ====================
  server.registerTool(
    'subway_conditions',
    {
      description:
        'Show all conditions that must be satisfied to reach a specific station. ' +
        'Traces incoming synapses and their upstream conditions, plus any lines that pass through the station.',
      inputSchema: {
        id: z.string().describe('Station ID or label to analyze'),
      },
    },
    async (args) => subwayConditions(schema, { id: args.id }),
  );

  // ==================== Tool 6: subway_onboard ====================
  server.registerTool(
    'subway_onboard',
    {
      description:
        'Generate a guided onboarding path for a development role. ' +
        'Returns entry points, critical stations to understand, end states, ' +
        'and a suggested learning order for the given role.',
      inputSchema: {
        role: z
          .string()
          .describe('Developer role: frontend, backend, fullstack, mobile, devops, qa, data'),
      },
    },
    async (args) => subwayOnboard(schema, { role: args.role }),
  );

  // ==================== Tool 7: subway_line ====================
  server.registerTool(
    'subway_line',
    {
      description:
        'Describe a complete end-to-end user flow (Line). ' +
        'Shows the full path of stations, outcome (success/failure/partial), ' +
        'and all conditions that govern the flow.',
      inputSchema: {
        name: z.string().describe('Line name or partial name to match'),
      },
    },
    async (args) => subwayLine(schema, { name: args.name }),
  );

  // ==================== Tool 8: subway_busrisk ====================
  server.registerTool(
    'subway_busrisk',
    {
      description:
        'Identify stations with critical bus factor risk — components maintained by a single author. ' +
        'Returns stations sorted by importance (influence × centrality), ' +
        'highlighting knowledge silos that need documentation or pair programming.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum number of risky stations to return (default: 10)'),
      },
    },
    async (args) => subwayBusRisk(schema, { limit: args.limit }),
  );

  // ==================== Tool 9: subway_ask ====================
  server.registerTool(
    'subway_ask',
    {
      description:
        'Answer a natural language question about the codebase using the subway map. ' +
        'Performs keyword search to find relevant stations, then builds a contextual answer ' +
        'with station details, connections, and guidance for further exploration.',
      inputSchema: {
        question: z
          .string()
          .describe('Natural language question about the codebase (any language)'),
      },
    },
    async (args) => subwayAsk(schema, { question: args.question }),
  );

  // ============================================================
  // BUILD TOOLS — LLM-guided map generation
  // These tools let an LLM interactively explore a codebase and
  // build a subway.json through MCP tool calls.
  // The LLM workflow:
  //   subway_init_map → explore structure
  //   subway_read_file / subway_read_dir → read source files
  //   subway_add_world / subway_add_station / subway_add_synapse → build map
  //   subway_save_map → persist to disk
  //
  // Note: Embed and narrate are intentionally disabled. The LLM
  // using this skill provides semantic understanding (replacing
  // embeddings) and generates all descriptions/flow narratives
  // (replacing the narrate phase).
  // ============================================================

  // Tool 10: subway_init_map
  server.registerTool(
    'subway_init_map',
    {
      description:
        'Initialize a new subway map building session. Starts an interactive session where ' +
        'you (the LLM) can explore the codebase, define stations, synapses, worlds, and lines. ' +
        'Scans the project structure and returns an overview of source files, directories, ' +
        'entry points, and framework hints. This is the FIRST tool to call when building a map.',
      inputSchema: {
        root: z.string().optional().describe('Project root directory (default: current directory)'),
        name: z.string().optional().describe('Project name (default: directory name)'),
      },
    },
    async (args) => subwayInitMap(args),
  );

  // Tool 11: subway_read_file
  server.registerTool(
    'subway_read_file',
    {
      description:
        'Read the contents of a source file in the project. Use this to understand what a file does, ' +
        'identify its role in the system, and discover navigation paths and conditions.',
      inputSchema: {
        path: z.string().describe('Relative path to the file (e.g., "src/cli.ts", "lib/auth.ts")'),
      },
    },
    async (args) => subwayReadFile(args),
  );

  // Tool 12: subway_read_dir
  server.registerTool(
    'subway_read_dir',
    {
      description:
        'List the contents of a directory in the project. Shows subdirectories and files with sizes.',
      inputSchema: {
        path: z.string().optional().describe('Relative path to the directory (default: project root)'),
      },
    },
    async (args) => subwayReadDir(args),
  );

  // Tool 13: subway_add_world
  server.registerTool(
    'subway_add_world',
    {
      description:
        'Add a World (domain) to the subway map. Worlds are logical domains with their own visual identity. ' +
        'Each world gets an auto-assigned color.',
      inputSchema: {
        id: z.string().describe('World ID (e.g., "auth", "checkout", "core")'),
        name: z.string().describe('Human-readable world name (e.g., "Authentication", "Checkout Flow")'),
        color: z.string().optional().describe('Hex color — auto-assigned if omitted'),
        description: z.string().optional().describe('What this world/domain handles'),
      },
    },
    async (args) => subwayAddWorld(args),
  );

  // Tool 14: subway_add_station
  server.registerTool(
    'subway_add_station',
    {
      description:
        'Add a Station (node) to the subway map. Representing a component, screen, service, or module. ' +
        'ROLES: start (entry point), hub (dispatcher), checkpoint (intermediate), importance (critical), terminal (end state).',
      inputSchema: {
        id: z.string().describe('Unique station ID (e.g., "station_login")'),
        label: z.string().describe('Human-readable label (e.g., "LoginScreen")'),
        world: z.string().describe('World ID this station belongs to'),
        role: z.enum(['start', 'hub', 'checkpoint', 'importance', 'terminal']).describe('The station role in the system flow'),
        terminalType: z.enum(['success', 'failure', 'partial']).optional().describe('If role is terminal, what outcome?'),
        files: z.array(z.string()).optional().describe('Source files for this station (relative paths)'),
        description: z.string().optional().describe('What this station does'),
        authors: z.array(z.string()).optional().describe('Authors/maintainers'),
        influence: z.number().optional().describe('Influence weight (0–1)'),
        dependency: z.number().optional().describe('Dependency risk (0–1)'),
      },
    },
    async (args) => subwayAddStation(args),
  );

  // Tool 15: subway_update_station
  server.registerTool(
    'subway_update_station',
    {
      description: 'Update fields of an existing station. Use to refine descriptions, adjust weights, or change roles.',
      inputSchema: {
        id: z.string().describe('Station ID to update'),
        label: z.string().optional(),
        world: z.string().optional(),
        role: z.enum(['start', 'hub', 'checkpoint', 'importance', 'terminal']).optional(),
        terminalType: z.enum(['success', 'failure', 'partial']).optional(),
        files: z.array(z.string()).optional(),
        description: z.string().optional(),
        authors: z.array(z.string()).optional(),
        influence: z.number().optional(),
        dependency: z.number().optional(),
      },
    },
    async (args) => subwayUpdateStation(args),
  );

  // Tool 16: subway_remove_station
  server.registerTool(
    'subway_remove_station',
    {
      description: 'Remove a station and all its associated synapses.',
      inputSchema: { id: z.string().describe('Station ID to remove') },
    },
    async (args) => subwayRemoveStation(args),
  );

  // Tool 17: subway_add_synapse
  server.registerTool(
    'subway_add_synapse',
    {
      description:
        'Add a Synapse (transition) between two stations. Condition types: always, api_response, user_role, device_state, config_flag, data_value.',
      inputSchema: {
        from: z.string().describe('Source station ID'),
        to: z.string().describe('Destination station ID'),
        conditionDescription: z.string().describe('Human-readable condition description'),
        conditionType: z.enum(['always', 'api_response', 'user_role', 'device_state', 'config_flag', 'data_value']).describe('Type of condition'),
        conditionValue: z.string().optional().describe('Actual condition expression'),
        direction: z.enum(['forward', 'back', 'both']).optional().describe('Direction (default: forward)'),
        isCritical: z.boolean().optional().describe('Is this a critical transition?'),
        strength: z.number().optional().describe('Synaptic strength 0–1 (default: 0.5)'),
      },
    },
    async (args) => subwayAddSynapse(args),
  );

  // Tool 18: subway_remove_synapse
  server.registerTool(
    'subway_remove_synapse',
    {
      description: 'Remove a synapse between two stations.',
      inputSchema: { from: z.string().describe('Source station ID'), to: z.string().describe('Destination station ID') },
    },
    async (args) => subwayRemoveSynapse(args),
  );

  // Tool 19: subway_add_line
  server.registerTool(
    'subway_add_line',
    {
      description:
        'Add a Line (complete end-to-end flow). A line tells a concrete story through stations with an outcome (success/failure/partial).',
      inputSchema: {
        id: z.string().describe('Line ID (e.g., "line_checkout_happy")'),
        name: z.string().describe('Descriptive name'),
        path: z.array(z.string()).describe('Ordered list of station IDs (min 2)'),
        world: z.string().optional().describe('Primary world'),
        color: z.string().optional().describe('Hex color (default: #4cc9f0)'),
        conditions: z.array(z.string()).optional().describe('Summary conditions'),
        outcome: z.enum(['success', 'failure', 'partial']).optional().describe('Flow outcome (default: success)'),
      },
    },
    async (args) => subwayAddLine(args),
  );

  // Tool 20: subway_save_map
  server.registerTool(
    'subway_save_map',
    {
      description: 'Save the current in-memory subway map to a subway.json file on disk.',
      inputSchema: { output: z.string().optional().describe('Output path (default: subway.json in project root)') },
    },
    async (args) => subwaySaveMap(args),
  );

  // Tool 21: subway_status
  server.registerTool(
    'subway_status',
    {
      description: 'Show the current status of the map building session — counts, breakdowns by world and role.',
      inputSchema: {},
    },
    async () => subwayStatus(),
  );

  // Tool 22: subway_list_stations
  server.registerTool(
    'subway_list_stations',
    {
      description: 'List all stations in the current map session, optionally filtered by world.',
      inputSchema: { world: z.string().optional().describe('Filter by world ID') },
    },
    async (args) => subwayListStations(args),
  );

  // Tool 23: subway_list_worlds
  server.registerTool(
    'subway_list_worlds',
    {
      description: 'List all worlds in the current map session with colors and station counts.',
      inputSchema: {},
    },
    async () => subwayListWorlds(),
  );

  // Tool 24: subway_list_lines
  server.registerTool(
    'subway_list_lines',
    {
      description: 'List all lines (end-to-end flows) in the current map session.',
      inputSchema: {},
    },
    async () => subwayListLines(),
  );

  // Tool 25: subway_scan
  server.registerTool(
    'subway_scan',
    {
      description: 'Re-scan the project structure. Returns updated overview of source files and entry points.',
      inputSchema: {},
    },
    async () => subwayScan(),
  );

  // Tool 26: subway_query_search
  server.registerTool(
    'subway_query_search',
    {
      description: 'Search the CURRENT in-memory map for stations matching a query.',
      inputSchema: {
        query: z.string().describe('Search query'),
        limit: z.number().optional().describe('Max results (default: 10)'),
      },
    },
    async (args) => subwayQuerySearch(args),
  );

  // Tool 27: subway_query_station
  server.registerTool(
    'subway_query_station',
    {
      description: 'Get detailed info about a station in the CURRENT in-memory map.',
      inputSchema: { id: z.string().describe('Station ID or label') },
    },
    async (args) => subwayQueryStation(args),
  );

  // Tool 28: subway_query_path
  server.registerTool(
    'subway_query_path',
    {
      description: 'Find a path between two stations in the CURRENT in-memory map.',
      inputSchema: {
        from: z.string().describe('Starting station ID'),
        to: z.string().describe('Destination station ID'),
      },
    },
    async (args) => subwayQueryPath(args),
  );

  // Tool 29: subway_query_impact
  server.registerTool(
    'subway_query_impact',
    {
      description: 'Analyze impact of changing a station in the CURRENT in-memory map.',
      inputSchema: { id: z.string().describe('Station ID to analyze') },
    },
    async (args) => subwayQueryImpact(args),
  );

  // Tool 30: subway_query_conditions
  server.registerTool(
    'subway_query_conditions',
    {
      description: 'Show all conditions to reach a station in the CURRENT in-memory map.',
      inputSchema: { id: z.string().describe('Station ID to analyze') },
    },
    async (args) => subwayQueryConditions(args),
  );

  // Tool 31: subway_serve
  server.registerTool(
    'subway_serve',
    {
      description: 'Generate the subway viewer HTML from the current map and return the file path.',
      inputSchema: {},
    },
    async () => await subwayServe(),
  );

  return server;
}

/**
 * Start the MCP server with stdio transport.
 * This is the main entry point for the `subway-mcp` binary.
 */
export async function startMcpServer(schemaPath?: string): Promise<void> {
  const filePath =
    schemaPath ||
    process.env.SUBWAY_FILE ||
    path.resolve(process.cwd(), 'subway.json');

  const server = await createSubwayServer(filePath);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Log to stderr (stdio transport uses stdout for protocol messages)
  console.error(`🚇 Subway MCP Server started`);
  console.error(`   Schema: ${filePath}`);
  console.error(`   9 read tools: subway_search, subway_station, subway_path, subway_impact, subway_conditions, subway_onboard, subway_line, subway_busrisk, subway_ask`);
  console.error(`   14 build tools: subway_init_map, subway_read_file, subway_read_dir, subway_add_world, subway_add_station, subway_update_station, subway_remove_station, subway_add_synapse, subway_remove_synapse, subway_add_line, subway_save_map, subway_status, subway_list_stations, subway_list_worlds, subway_list_lines, subway_scan, subway_query_*, subway_serve`);
}
