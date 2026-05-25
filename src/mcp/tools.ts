/**
 * MCP Tool implementations for the Subway MCP server.
 *
 * Each tool receives the loaded subway.json schema and returns
 * a CallToolResult with text content.
 */
import type {
  SubwaySchema,
  Station,
  Synapse,
  Line,
} from '../types/index.js';

// ============================================================
// Tool result helpers
// ============================================================

function textResult(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text' as const, text }],
  };
}

function errorResult(message: string): {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
} {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

// ============================================================
// Synonym dictionary for keyword expansion
// ============================================================

const SYNONYMS: Record<string, string[]> = {
  lento: ['speed', 'velocit', 'performance', 'timeout', 'slow', 'lag'],
  slow: ['lento', 'speed', 'performance', 'timeout', 'lag'],
  errore: ['error', 'failure', 'failed', 'exception', 'crash', 'bug'],
  error: ['errore', 'failure', 'failed', 'exception', 'crash', 'bug'],
  rete: ['network', 'http', 'api', 'request', 'fetch'],
  network: ['rete', 'http', 'api', 'request', 'fetch', 'connection'],
  database: ['room', 'dao', 'db', 'cache', 'offline', 'sql', 'storage'],
  db: ['database', 'room', 'dao', 'sql', 'storage', 'cache'],
  firma: ['sign', 'photo', 'foto', 'document', 'upload'],
  sign: ['firma', 'photo', 'document', 'upload', 'signature'],
  notifica: ['firebase', 'fcm', 'messaging', 'push', 'notification'],
  notification: ['notifica', 'firebase', 'fcm', 'messaging', 'push'],
  auth: ['login', 'authentication', 'oauth', 'token', 'session', 'user'],
  login: ['auth', 'authentication', 'oauth', 'signin', 'credential'],
  pagamento: ['payment', 'checkout', 'billing', 'invoice', 'transaction'],
  payment: ['pagamento', 'checkout', 'billing', 'invoice', 'transaction'],
  checkout: ['payment', 'cart', 'pagamento', 'billing', 'purchase'],
  navigation: ['router', 'navigate', 'route', 'screen', 'page', 'flow'],
  config: ['settings', 'configuration', 'environment', 'flag', 'feature'],
  test: ['spec', 'testing', 'mock', 'stub', 'unit', 'integration'],
  build: ['compile', 'webpack', 'vite', 'bundle', 'tsc', 'dist'],
};

function expandQuery(query: string): string[] {
  const lower = query.toLowerCase();
  const terms = new Set<string>();
  terms.add(lower);

  // Direct synonym lookup
  const synonyms = SYNONYMS[lower];
  if (synonyms) {
    for (const s of synonyms) terms.add(s);
  }

  // Check each word in the query
  for (const word of lower.split(/\s+/)) {
    const syns = SYNONYMS[word];
    if (syns) {
      for (const s of syns) terms.add(s);
    }
  }

  // Also add partial matches
  for (const [key, vals] of Object.entries(SYNONYMS)) {
    if (lower.includes(key)) {
      terms.add(key);
      for (const v of vals) terms.add(v);
    }
  }

  return [...terms];
}

// ============================================================
// Keyword-based search (fallback when no embeddings)
// ============================================================

function keywordSearch(
  schema: SubwaySchema,
  query: string,
  maxResults: number = 10,
): Array<{ station: Station; score: number }> {
  const terms = expandQuery(query);
  const results: Array<{ station: Station; score: number }> = [];

  for (const station of schema.stations) {
    const corpus = [
      station.label,
      station.description,
      station.world,
      ...station.files,
    ].join(' ').toLowerCase();

    let score = 0;
    for (const term of terms) {
      const lowerTerm = term.toLowerCase();
      if (station.label.toLowerCase() === lowerTerm) {
        score = Math.max(score, 0.96);
      } else if (station.label.toLowerCase().includes(lowerTerm)) {
        score = Math.max(score, 0.88);
      } else if (station.world.toLowerCase() === lowerTerm) {
        score = Math.max(score, 0.72);
      } else if (corpus.includes(lowerTerm)) {
        score = Math.max(score, 0.78);
      }
    }

    if (score > 0) {
      results.push({ station, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}

// ============================================================
// Path finding (BFS through synapses)
// ============================================================

interface PathNode {
  id: string;
  parent: string | null;
  synapse: Synapse | null;
}

function findPath(
  schema: SubwaySchema,
  fromId: string,
  toId: string,
): { path: string[]; synapses: Synapse[] } | null {
  if (fromId === toId) return { path: [fromId], synapses: [] };

  const visited = new Set<string>();
  const queue: PathNode[] = [{ id: fromId, parent: null, synapse: null }];
  visited.add(fromId);

  // Build adjacency for fast lookup
  const outgoing = new Map<string, Array<{ to: string; synapse: Synapse }>>();
  for (const s of schema.synapses) {
    const list = outgoing.get(s.from) ?? [];
    list.push({ to: s.to, synapse: s });
    outgoing.set(s.from, list);
  }

  // Also add backward edges for both-direction travel
  for (const s of schema.synapses) {
    if (s.direction === 'back' || s.direction === 'both') {
      const list = outgoing.get(s.to) ?? [];
      list.push({ to: s.from, synapse: s });
      outgoing.set(s.to, list);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;

    const neighbors = outgoing.get(current.id) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.to)) {
        visited.add(neighbor.to);
        const node: PathNode = {
          id: neighbor.to,
          parent: current.id,
          synapse: neighbor.synapse,
        };

        if (neighbor.to === toId) {
          // Reconstruct path
          const path: string[] = [];
          const synapses: Synapse[] = [];
          let n: PathNode | null = node;
          const reversePath: [string, Synapse | null][] = [];

          while (n) {
            reversePath.push([n.id, n.synapse]);
            n = queue.find(q => q.id === n!.parent) ?? null;
          }

          // Find trace backward through visited nodes
          const trace: [string, Synapse | null][] = [[toId, node.synapse]];
          let currentId = current.id;
          while (currentId !== fromId) {
            const prevEntry = [...visited].find(() => false); // not needed
            // Build proper backtrack
            // We need to use a map for proper backtracking
            break;
          }

          // Better approach: Use a parent map
          // Let me rewrite this BFS properly
          return findPathBFS(schema, fromId, toId, outgoing);
        }

        queue.push(node);
      }
    }
  }

  return null;
}

function findPathBFS(
  schema: SubwaySchema,
  fromId: string,
  toId: string,
  outgoing: Map<string, Array<{ to: string; synapse: Synapse }>>,
): { path: string[]; synapses: Synapse[] } | null {
  if (fromId === toId) {
    return { path: [fromId], synapses: [] };
  }

  const parent = new Map<string, { parent: string; synapse: Synapse }>();
  const visited = new Set<string>();
  const queue = [fromId];
  visited.add(fromId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = outgoing.get(current) ?? [];

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.to)) {
        visited.add(neighbor.to);
        parent.set(neighbor.to, { parent: current, synapse: neighbor.synapse });

        if (neighbor.to === toId) {
          // Reconstruct path
          const path: string[] = [];
          const synapses: Synapse[] = [];
          let currentId: string = toId;

          while (currentId !== fromId) {
            path.unshift(currentId);
            const p = parent.get(currentId)!;
            synapses.unshift(p.synapse);
            currentId = p.parent;
          }
          path.unshift(fromId);

          return { path, synapses };
        }

        queue.push(neighbor.to);
      }
    }
  }

  return null;
}

// ============================================================
// Tool: subway_search
// ============================================================

export interface SearchArgs {
  query: string;
  limit?: number;
}

export function subwaySearch(
  schema: SubwaySchema,
  args: SearchArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const { query, limit = 10 } = args;

  if (!query || query.trim().length === 0) {
    return errorResult('Missing required parameter: query');
  }

  // Keyword search only — the LLM using this skill provides semantic understanding.
  // Vector/embedding search is intentionally disabled (redundant when used as an LLM skill).
  const results = keywordSearch(schema, query, limit);

  if (results.length === 0) {
    return textResult(`No stations found matching "${query}".\n\nTry broader terms or check the station labels with subway_station.`);
  }

  let output = `🔍 Synaptic Search: "${query}"\n`;
  output += `Mode: keyword\n`;
  output += `Results: ${results.length}\n\n`;

  for (let i = 0; i < results.length; i++) {
    const { station, score } = results[i];
    const pct = Math.round(score * 100);
    const bar = '●'.repeat(Math.ceil(pct / 10)) + '○'.repeat(10 - Math.ceil(pct / 10));

    output += `[${i + 1}] ${bar} ${pct}%\n`;
    output += `    Station: ${station.label} (${station.id})\n`;
    output += `    World:   ${station.world}\n`;
    output += `    Role:    ${station.role}${station.terminalType ? ` (${station.terminalType})` : ''}\n`;
    output += `    Files:   ${station.files.join(', ')}\n`;

    if (station.description) {
      output += `    Desc:    ${station.description}\n`;
    }

    if (station.authors.length > 0) {
      output += `    Authors: ${station.authors.join(', ')}\n`;
    }

    output += '\n';
  }

  // Add related synapses context
  const topStationIds = new Set(results.slice(0, 5).map(r => r.station.id));
  const relatedSynapses = schema.synapses.filter(
    s => topStationIds.has(s.from) || topStationIds.has(s.to),
  );

  if (relatedSynapses.length > 0) {
    output += 'Related transitions:\n';
    for (const s of relatedSynapses.slice(0, 10)) {
      const from = schema.stations.find(st => st.id === s.from);
      const to = schema.stations.find(st => st.id === s.to);
      output += `  ${from?.label ?? s.from} → ${to?.label ?? s.to}`;
      output += ` [${s.direction}, ${s.condition.type}]`;
      output += ` — ${s.condition.description}\n`;
    }
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_station
// ============================================================

export interface StationArgs {
  id: string;
}

export function subwayStation(
  schema: SubwaySchema,
  args: StationArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const { id } = args;

  if (!id) {
    return errorResult('Missing required parameter: id');
  }

  const station = schema.stations.find(
    s => s.id === id || s.label.toLowerCase() === id.toLowerCase(),
  );

  if (!station) {
    // Fuzzy search
    const matching = schema.stations.filter(
      s =>
        s.label.toLowerCase().includes(id.toLowerCase()) ||
        s.id.toLowerCase().includes(id.toLowerCase()),
    );
    if (matching.length === 0) {
      return errorResult(
        `Station "${id}" not found.\n\nAvailable stations (first 20):\n` +
        schema.stations.slice(0, 20).map(s => `  • ${s.label} (${s.id})`).join('\n') +
        `\n... and ${Math.max(0, schema.stations.length - 20)} more.`,
      );
    }
    if (matching.length === 1) {
      return formatStationDetail(schema, matching[0]);
    }
    return textResult(
      `Multiple stations match "${id}":\n\n` +
      matching.map(s => `  • ${s.label} (${s.id})`).join('\n') +
      `\n\nUse the exact id or label.`,
    );
  }

  return formatStationDetail(schema, station);
}

function formatStationDetail(
  schema: SubwaySchema,
  station: Station,
): ReturnType<typeof textResult> {
  const incoming = schema.synapses.filter(s => s.to === station.id);
  const outgoing = schema.synapses.filter(s => s.from === station.id);

  let output = `🚉  ${station.label}\n`;
  output += `${'─'.repeat(50)}\n`;
  output += `ID:          ${station.id}\n`;
  output += `World:       ${station.world}\n`;
  output += `Role:        ${station.role}${station.terminalType ? ` (${station.terminalType})` : ''}\n`;
  output += `\nFiles:\n`;
  for (const f of station.files) {
    output += `  • ${f}\n`;
  }

  output += `\nDescription: ${station.description}\n`;

  output += `\nSynaptic Weights:\n`;
  output += `  influence:   ${(station.weight.influence * 100).toFixed(0)}%\n`;
  output += `  dependency:  ${(station.weight.dependency * 100).toFixed(0)}%\n`;
  output += `  churn:       ${(station.weight.churn * 100).toFixed(0)}%\n`;
  output += `  centrality:  ${(station.weight.centrality * 100).toFixed(0)}%\n`;

  if (station.authors.length > 0) {
    output += `\nAuthors:\n`;
    for (const author of station.authors) {
      output += `  • ${author}\n`;
    }
  }

  output += `\nLast Modified: ${station.lastModified}\n`;
  output += `Commit Count:  ${station.commitCount}\n`;

  if (incoming.length > 0) {
    output += `\n⬅  Incoming synapses (${incoming.length}):\n`;
    for (const s of incoming) {
      const from = schema.stations.find(st => st.id === s.from);
      output += `  ${from?.label ?? s.from}`;
      output += ` [${s.direction}, ${s.condition.type}, strength: ${s.strength}]`;
      output += ` — ${s.condition.description}\n`;
    }
  }

  if (outgoing.length > 0) {
    output += `\n➡  Outgoing synapses (${outgoing.length}):\n`;
    for (const s of outgoing) {
      const to = schema.stations.find(st => st.id === s.to);
      output += `  ${to?.label ?? s.to}`;
      output += ` [${s.direction}, ${s.condition.type}, strength: ${s.strength}]`;
      output += ` — ${s.condition.description}\n`;
    }
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_path
// ============================================================

export interface PathArgs {
  from: string;
  to: string;
}

export function subwayPath(
  schema: SubwaySchema,
  args: PathArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const { from, to } = args;

  if (!from || !to) {
    return errorResult('Missing required parameters: from and to');
  }

  // Resolve station IDs
  const fromStation = resolveStationId(schema, from);
  const toStation = resolveStationId(schema, to);

  if (!fromStation) {
    return errorResult(`Station "${from}" not found.`);
  }
  if (!toStation) {
    return errorResult(`Station "${to}" not found.`);
  }

  // Build adjacency
  const outgoing = new Map<string, Array<{ to: string; synapse: Synapse }>>();
  for (const s of schema.synapses) {
    const fwd = outgoing.get(s.from) ?? [];
    fwd.push({ to: s.to, synapse: s });
    outgoing.set(s.from, fwd);

    // Backward edges
    if (s.direction === 'back' || s.direction === 'both') {
      const bwd = outgoing.get(s.to) ?? [];
      bwd.push({ to: s.from, synapse: s });
      outgoing.set(s.to, bwd);
    }
  }

  const result = findPathBFS(schema, fromStation.id, toStation.id, outgoing);

  if (!result) {
    return textResult(
      `No path found from "${fromStation.label}" to "${toStation.label}".\n\n` +
      `The stations are not connected through the synapse graph.\n` +
      `Try checking if there's an indirect connection or if they belong to different worlds.`,
    );
  }

  const { path, synapses } = result;

  let output = `🗺  Path: ${fromStation.label} → ${toStation.label}\n`;
  output += `${'─'.repeat(50)}\n`;
  output += `Length: ${path.length - 1} hops\n\n`;

  for (let i = 0; i < path.length; i++) {
    const station = schema.stations.find(s => s.id === path[i]);
    const label = station?.label ?? path[i];

    if (i === 0) {
      output += `[START] ${label} (${path[i]})\n`;
      output += `        Role: ${station?.role ?? '?'}\n`;
      output += `        World: ${station?.world ?? '?'}\n`;
    } else {
      const synapse = synapses[i - 1];
      output += `  |\n`;
      output += `  ├── ${synapse.condition.description}\n`;
      output += `  │   Type: ${synapse.condition.type}`;
      if (synapse.condition.value) {
        output += `, Value: ${synapse.condition.value}`;
      }
      output += `\n  │   Direction: ${synapse.direction}, Strength: ${synapse.strength}\n`;
      output += `  |\n`;
      output += `[STEP ${i}] ${label} (${path[i]})\n`;
      output += `        Role: ${station?.role ?? '?'}`;
      if (station?.terminalType) {
        output += ` (${station.terminalType})`;
      }
      output += `\n`;
      output += `        World: ${station?.world ?? '?'}\n`;
    }
    output += '\n';
  }

  // Condition summary
  const conditions = synapses.map(s => s.condition);
  const criticalCount = synapses.filter(s => s.isCritical).length;
  output += `Summary:\n`;
  output += `  Total steps: ${path.length - 1}\n`;
  output += `  Critical transitions: ${criticalCount}\n`;
  output += `  Conditions:\n`;
  for (const c of conditions) {
    output += `    • [${c.type}] ${c.description}\n`;
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_impact
// ============================================================

export interface ImpactArgs {
  id: string;
}

export function subwayImpact(
  schema: SubwaySchema,
  args: ImpactArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const { id } = args;

  if (!id) {
    return errorResult('Missing required parameter: id');
  }

  const station = resolveStationId(schema, id);
  if (!station) {
    return errorResult(`Station "${id}" not found.`);
  }

  // Direct dependencies
  const incoming = schema.synapses.filter(s => s.to === station.id);
  const outgoing = schema.synapses.filter(s => s.from === station.id);

  // 2-hop impact
  const directDependents = new Set(outgoing.map(s => s.to));
  const indirectDependents = new Set<string>();

  for (const s of schema.synapses) {
    if (directDependents.has(s.from)) {
      indirectDependents.add(s.to);
    }
  }

  // Remove self and direct
  indirectDependents.delete(station.id);
  for (const d of directDependents) {
    indirectDependents.delete(d);
  }

  let output = `🎯  Impact Analysis: ${station.label}\n`;
  output += `${'─'.repeat(50)}\n`;
  output += `World:  ${station.world}\n`;
  output += `Role:   ${station.role}\n`;
  output += `Files:  ${station.files.join(', ')}\n\n`;

  output += `⬅  Direct dependencies (this depends on, ${incoming.length}):\n`;
  for (const s of incoming) {
    const from = schema.stations.find(st => st.id === s.from);
    output += `  • ${from?.label ?? s.from} (strength: ${s.strength}, ${s.condition.type})\n`;
  }
  if (incoming.length === 0) output += `  (none)\n`;

  output += `\n➡  Direct dependents (affected by a change, ${outgoing.length}):\n`;
  for (const s of outgoing) {
    const to = schema.stations.find(st => st.id === s.to);
    const isCritical = s.isCritical ? ' ⚡ CRITICAL' : '';
    output += `  • ${to?.label ?? s.to} (strength: ${s.strength}, ${s.condition.type})${isCritical}\n`;
  }
  if (outgoing.length === 0) output += `  (none)\n`;

  output += `\n🔄  Indirect impact (2-hop, ${indirectDependents.size}):\n`;
  for (const depId of indirectDependents) {
    const dep = schema.stations.find(s => s.id === depId);
    output += `  • ${dep?.label ?? depId}\n`;
  }
  if (indirectDependents.size === 0) output += `  (none)\n`;

  // Impact score
  const impactScore = (
    outgoing.length * 0.4 +
    indirectDependents.size * 0.25 +
    incoming.length * 0.2 +
    station.weight.centrality * 0.15
  );
  output += `\nImpact Score: ${impactScore.toFixed(2)} (0–10+ scale)\n`;

  if (impactScore > 5) {
    output += `⚠  HIGH IMPACT: Changes to this station affect ${outgoing.length + indirectDependents.size} other stations.\n`;
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_conditions
// ============================================================

export interface ConditionsArgs {
  id: string;
}

export function subwayConditions(
  schema: SubwaySchema,
  args: ConditionsArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const { id } = args;

  if (!id) {
    return errorResult('Missing required parameter: id');
  }

  const station = resolveStationId(schema, id);
  if (!station) {
    return errorResult(`Station "${id}" not found.`);
  }

  // Find all paths that lead to this station
  const incoming = schema.synapses.filter(s => s.to === station.id);

  let output = `🔀  Conditions to reach: ${station.label}\n`;
  output += `${'─'.repeat(50)}\n\n`;

  if (incoming.length === 0) {
    output += `No incoming synapses found. This station may be an entry point.\n`;
    if (station.role === 'start') {
      output += `It IS marked as a start point — the user enters here directly.\n`;
    }
    return textResult(output);
  }

  output += `Conditions that must be satisfied along incoming paths:\n\n`;

  for (const syn of incoming) {
    const from = schema.stations.find(s => s.id === syn.from);

    output += `←  From: ${from?.label ?? syn.from}\n`;
    output += `   Condition: ${syn.condition.description}\n`;
    output += `   Type:      ${syn.condition.type}\n`;

    if (syn.condition.value) {
      output += `   Value:     ${syn.condition.value}\n`;
    }

    output += `   Direction: ${syn.direction}\n`;
    output += `   Strength:  ${syn.strength}\n`;
    output += `   Critical:  ${syn.isCritical ? 'yes' : 'no'}\n\n`;

    // Check what conditions the "from" station depends on
    const upstreamSynapses = schema.synapses.filter(s => s.to === syn.from);
    if (upstreamSynapses.length > 0) {
      output += `   ⤴  Upstream conditions (to reach "${from?.label ?? syn.from}"):\n`;
      for (const us of upstreamSynapses.slice(0, 5)) {
        const usFrom = schema.stations.find(s => s.id === us.from);
        output += `      • ${usFrom?.label ?? us.from}: ${us.condition.description} [${us.condition.type}]\n`;
      }
      if (upstreamSynapses.length > 5) {
        output += `      ... and ${upstreamSynapses.length - 5} more\n`;
      }
      output += '\n';
    }
  }

  // Check lines that pass through this station
  const stationLines = schema.lines.filter(l => l.path.includes(station.id));
  if (stationLines.length > 0) {
    output += `📍  This station appears in ${stationLines.length} line(s):\n`;
    for (const line of stationLines) {
      const stationIndex = line.path.indexOf(station.id);
      output += `   • "${line.name}" — position ${stationIndex + 1}/${line.path.length}\n`;
      output += `     Conditions for this line:\n`;
      for (const c of line.conditions) {
        output += `       - ${c}\n`;
      }
    }
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_onboard
// ============================================================

export interface OnboardArgs {
  role: string;
}

const ROLE_WORLD_MAP: Record<string, string[]> = {
  frontend: ['ui', 'components', 'pages', 'screens', 'views', 'navigation', 'routes', 'router', 'auth'],
  backend: ['api', 'server', 'services', 'database', 'models', 'repositories', 'controllers', 'middleware', 'auth'],
  fullstack: ['api', 'server', 'services', 'components', 'pages', 'ui', 'auth'],
  mobile: ['screens', 'navigation', 'pages', 'components', 'ui', 'auth', 'services'],
  devops: ['config', 'deploy', 'build', 'ci', 'infra', 'scripts'],
  qa: ['test', 'spec', '__tests__', 'e2e'],
  data: ['models', 'database', 'repositories', 'migrations', 'queries', 'schema'],
};

export function subwayOnboard(
  schema: SubwaySchema,
  args: OnboardArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const { role } = args;

  if (!role) {
    return errorResult(
      'Missing required parameter: role.\n\n' +
      'Available roles: frontend, backend, fullstack, mobile, devops, qa, data',
    );
  }

  const roleLower = role.toLowerCase();
  const relevantWorlds = ROLE_WORLD_MAP[roleLower];

  if (!relevantWorlds) {
    return errorResult(
      `Unknown role "${role}".\n\n` +
      `Available roles: ${Object.keys(ROLE_WORLD_MAP).join(', ')}\n\n` +
      `You can also try a custom role for keyword-based matching.`,
    );
  }

  // Find stations in relevant worlds
  const relevantStations = schema.stations.filter(s => {
    const worldLower = s.world.toLowerCase();
    return relevantWorlds.some(w => worldLower.includes(w) || worldLower === w);
  });

  // Find entry points
  const entryPoints = relevantStations.filter(s => s.role === 'start' || s.role === 'hub');
  const startIfNone = schema.stations.filter(s => s.role === 'start' || s.role === 'hub');

  // Find high-importance stations
  const importanceStations = relevantStations
    .filter(s => s.role === 'importance')
    .sort((a, b) => (b.weight.influence + b.weight.centrality) - (a.weight.influence + a.weight.centrality));

  let output = `🛤  Onboarding path for: ${role}\n`;
  output += `${'─'.repeat(50)}\n`;
  output += `Relevant domains: ${relevantWorlds.join(', ')}\n`;
  output += `Matching stations: ${relevantStations.length}\n\n`;

  if (relevantStations.length === 0) {
    output += `No stations found directly matching the "${role}" role domains.\n\n`;
    output += `Available worlds: ${[...new Set(schema.stations.map(s => s.world))].join(', ')}\n`;
    output += `\nTry exploring the full map:\n`;
    output += `  • Start with entry points:\n`;
    for (const ep of startIfNone.slice(0, 5)) {
      output += `    - ${ep.label} (${ep.world})\n`;
    }
    return textResult(output);
  }

  // 1. Start here
  output += `1. START HERE — Entry points:\n`;
  const eps = entryPoints.length > 0 ? entryPoints : startIfNone;
  for (const ep of eps.slice(0, 5)) {
    output += `   🏁 ${ep.label} (${ep.world}) — ${ep.description}\n`;
  }
  output += '\n';

  // 2. Key stations
  output += `2. CRITICAL STATIONS — Must understand:\n`;
  const critical = [...relevantStations]
    .sort((a, b) => (b.weight.influence + b.weight.centrality) - (a.weight.influence + a.weight.centrality))
    .filter(s => !eps.some(ep => ep.id === s.id))
    .slice(0, 8);

  for (const s of critical) {
    output += `   ⚡ ${s.label} (${s.world})`;
    if (s.role === 'importance') output += ' [importance]';
    output += `\n`;
    if (s.description) {
      output += `      ${s.description}\n`;
    }
    output += `      Files: ${s.files.join(', ')}\n`;
  }
  output += '\n';

  // 3. Terminal points to be aware of
  const terminals = relevantStations.filter(s => s.role === 'terminal');
  if (terminals.length > 0) {
    output += `3. END STATES — How flows conclude:\n`;
    for (const t of terminals.slice(0, 5)) {
      const emoji = t.terminalType === 'success' ? '✓' :
                    t.terminalType === 'failure' ? '✗' : '⚠';
      output += `   ${emoji} ${t.label} (${t.world}) [${t.terminalType ?? 'unknown'}]\n`;
      if (t.description) output += `      ${t.description}\n`;
    }
    output += '\n';
  }

  // 4. Suggested learning order
  output += `4. SUGGESTED LEARNING ORDER:\n`;
  let step = 1;
  for (const s of entryPoints.slice(0, 2)) {
    output += `   Step ${step++}: Start with ${s.label} — the entry point\n`;
  }
  for (const s of critical.slice(0, 5)) {
    output += `   Step ${step++}: Explore ${s.label}\n`;
  }
  output += '\n';

  // 5. Relevant Lines
  const relevantLines = schema.lines.filter(l =>
    l.path.some(p => relevantStations.some(s => s.id === p)),
  );
  if (relevantLines.length > 0) {
    output += `5. KEY USER FLOWS (${relevantLines.length}):\n`;
    for (const line of relevantLines.slice(0, 3)) {
      const outcomeEmoji = line.outcome === 'success' ? '✓' :
                           line.outcome === 'failure' ? '✗' : '⚠';
      output += `   ${outcomeEmoji} "${line.name}" (${line.path.length} steps)\n`;
      output += `      Path: ${line.path.map(id => {
        const s = schema.stations.find(st => st.id === id);
        return s?.label ?? id;
      }).join(' → ')}\n`;
    }
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_line
// ============================================================

export interface LineArgs {
  name: string;
}

export function subwayLine(
  schema: SubwaySchema,
  args: LineArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const { name } = args;

  if (!name) {
    return errorResult('Missing required parameter: name');
  }

  const lowerName = name.toLowerCase();
  const matchingLines = schema.lines.filter(
    l => l.name.toLowerCase().includes(lowerName) || l.id.toLowerCase().includes(lowerName),
  );

  if (matchingLines.length === 0) {
    if (schema.lines.length === 0) {
      return textResult(
        `No lines found. The subway.json has no defined user flows.\n\n` +
        `Run "subway init --narrate" to auto-generate lines with LLM narration.`,
      );
    }
    return textResult(
      `Line "${name}" not found.\n\nAvailable lines:\n` +
      schema.lines.map(l => `  • "${l.name}" [${l.outcome}]`).join('\n'),
    );
  }

  // If multiple matches, show all with details for the first
  const line = matchingLines[0];

  let output = `🚂  Line: ${line.name}\n`;
  output += `${'─'.repeat(50)}\n`;
  output += `World:   ${line.world}\n`;
  output += `Outcome: ${line.outcome === 'success' ? '✓ Success' : line.outcome === 'failure' ? '✗ Failure' : '⚠ Partial'}\n`;
  output += `Steps:   ${line.path.length} stations\n\n`;

  output += `Path:\n`;
  for (let i = 0; i < line.path.length; i++) {
    const station = schema.stations.find(s => s.id === line.path[i]);
    const label = station?.label ?? line.path[i];
    const role = station?.role ?? '?';
    const connector = i < line.path.length - 1 ? '│' : ' ';

    if (i === 0) {
      output += `  🏁 ${label} (${role})\n`;
    } else {
      output += `${connector}\n`;
      output += `  ├─→`;
    }

    if (i > 0) {
      if (i === line.path.length - 1) {
        const emoji = line.outcome === 'success' ? '✓' :
                      line.outcome === 'failure' ? '✗' : '⚠';
        output += ` ${emoji} ${label} (${role})`;
      } else {
        output += ` ${label} (${role})`;
      }
    }

    if (station) {
      output += ` [${station.world}]`;
      if (station.description && station.description.length > 0) {
        output += ` — ${station.description.substring(0, 80)}`;
      }
    }
    output += '\n';
  }

  output += `\nConditions for this flow:\n`;
  for (const c of line.conditions) {
    output += `  • ${c}\n`;
  }

  if (matchingLines.length > 1) {
    output += `\n---\n`;
    output += `${matchingLines.length} lines match "${name}".`;
    output += ` Others:\n`;
    for (const l of matchingLines.slice(1)) {
      output += `  • "${l.name}" [${l.outcome}]\n`;
    }
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_busrisk
// ============================================================

export interface BusRiskArgs {
  limit?: number;
}

export function subwayBusRisk(
  schema: SubwaySchema,
  args: BusRiskArgs = {},
): ReturnType<typeof textResult> {
  const { limit = 10 } = args;

  // Bus factor risk: stations with 1 author, sorted by influence + centrality
  const risky = schema.stations
    .filter(s => s.authors.length === 1)
    .sort((a, b) => {
      const scoreA = a.weight.influence + a.weight.centrality;
      const scoreB = b.weight.influence + b.weight.centrality;
      return scoreB - scoreA;
    });

  if (risky.length === 0) {
    return textResult(
      'No bus factor risks detected. All stations have 0 or 2+ unique authors.\n\n' +
      'Note: Author data comes from git log. Run "subway init" in a git repo to populate author info.',
    );
  }

  let output = `🚨  Bus Factor Risk Report\n`;
  output += `${'─'.repeat(50)}\n`;
  output += `Stations with a single author (bus factor = 1): ${risky.length}\n`;
  output += `Top ${Math.min(limit, risky.length)} by importance:\n\n`;

  for (let i = 0; i < Math.min(limit, risky.length); i++) {
    const s = risky[i];
    const riskScore = ((s.weight.influence + s.weight.centrality) / 2 * 100).toFixed(0);
    const bar = '█'.repeat(Math.ceil(parseInt(riskScore) / 10)) +
                '░'.repeat(10 - Math.ceil(parseInt(riskScore) / 10));

    output += `[${i + 1}] ${bar} ${riskScore}%\n`;
    output += `    Station: ${s.label} (${s.id})\n`;
    output += `    World:   ${s.world}\n`;
    output += `    Role:    ${s.role}\n`;
    output += `    Author:  ${s.authors[0]}\n`;
    output += `    Files:   ${s.files.join(', ')}\n`;
    output += `    Influence: ${(s.weight.influence * 100).toFixed(0)}%  Centrality: ${(s.weight.centrality * 100).toFixed(0)}%\n`;
    output += `    Commits: ${s.commitCount}\n\n`;
  }

  // Summary stats
  const totalStations = schema.stations.length;
  const singleAuthorCount = risky.length;
  const totalAuthors = new Set(schema.stations.flatMap(s => s.authors)).size;

  output += `Summary:\n`;
  output += `  Total stations:         ${totalStations}\n`;
  output += `  Total unique authors:   ${totalAuthors}\n`;
  output += `  Single-author stations: ${singleAuthorCount} (${((singleAuthorCount / totalStations) * 100).toFixed(1)}%)\n`;

  if (singleAuthorCount > totalStations * 0.3) {
    output += `\n⚠  HIGH BUS RISK: ${((singleAuthorCount / totalStations) * 100).toFixed(0)}% of stations have a single author.\n`;
    output += `   Consider pair programming or documentation handoffs for critical paths.\n`;
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_ask
// ============================================================

export interface AskArgs {
  question: string;
}

export function subwayAsk(
  schema: SubwaySchema,
  args: AskArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const { question } = args;

  if (!question || question.trim().length === 0) {
    return errorResult('Missing required parameter: question');
  }

  const lowerQuestion = question.toLowerCase();

  // Identify question type to give better answers
  let output = `💬  Question: "${question}"\n`;
  output += `${'─'.repeat(50)}\n\n`;

  // Strategy: use keyword search to find relevant stations,
  // then build a contextual answer from what we find.

  const searchResults = keywordSearch(schema, question, 8);

  if (searchResults.length === 0) {
    output += `I searched the codebase map but couldn't find stations directly related to your question.\n\n`;
    output += `Project: ${schema.meta.project}\n`;
    output += `Total stations: ${schema.meta.totalStations}\n`;
    output += `Worlds: ${schema.worlds.map(w => w.name).join(', ')}\n\n`;
    output += `Try rephrasing your question using technical terms (component names, file names)\n`;
    output += `or functional terms (login, payment, navigation, configuration).\n`;
    return textResult(output);
  }

  // Determine question type
  const questionTypes = detectQuestionType(lowerQuestion);

  output += `Relevant stations found: ${searchResults.length}\n\n`;

  for (let i = 0; i < searchResults.length; i++) {
    const { station, score } = searchResults[i];
    output += `### ${station.label} (${station.world}) — relevance: ${Math.round(score * 100)}%\n\n`;
    output += `**Role:** ${station.role}${station.terminalType ? ` (${station.terminalType})` : ''}\n`;
    output += `**Description:** ${station.description}\n`;
    output += `**Files:** ${station.files.join(', ')}\n`;

    if (station.authors.length > 0) {
      output += `**Authors:** ${station.authors.join(', ')}\n`;
    }

    // Show weights
    output += `**Weights:** influence ${(station.weight.influence * 100).toFixed(0)}% · `;
    output += `dependency ${(station.weight.dependency * 100).toFixed(0)}% · `;
    output += `churn ${(station.weight.churn * 100).toFixed(0)}% · `;
    output += `centrality ${(station.weight.centrality * 100).toFixed(0)}%\n`;

    // Show related synapses
    const relatedSynapses = schema.synapses.filter(
      s => s.from === station.id || s.to === station.id,
    ).slice(0, 5);

    if (relatedSynapses.length > 0) {
      output += `\n**Connections:**\n`;
      for (const s of relatedSynapses) {
        const isOutgoing = s.from === station.id;
        const other = isOutgoing ? s.to : s.from;
        const otherStation = schema.stations.find(st => st.id === other);
        output += `  ${isOutgoing ? '→' : '←'} ${otherStation?.label ?? other} — ${s.condition.description}\n`;
      }
    }

    output += '\n';
  }

  // Add contextual guidance based on question type
  if (questionTypes.includes('how')) {
    output += `---\n`;
    output += `**How-to guidance:** Use \`subway_path\` to trace the flow between stations, or \`subway_line\` to see complete end-to-end flows.\n`;
  }

  if (questionTypes.includes('what') || questionTypes.includes('which')) {
    output += `---\n`;
    output += `**Navigation tip:** Use \`subway_station\` with a specific station ID to get full details including all incoming and outgoing synapses.\n`;
  }

  if (questionTypes.includes('impact') || questionTypes.includes('affect') || questionTypes.includes('break')) {
    output += `---\n`;
    output += `**Impact analysis:** Use \`subway_impact\` with a station ID to see what depends on it (direct + 2-hop impact).\n`;
  }

  if (questionTypes.includes('who')) {
    output += `---\n`;
    output += `**Author info:** Use \`subway_station\` for individual authors, or \`subway_busrisk\` to find stations with a single author (bus factor risk).\n`;
  }

  return textResult(output);
}

function detectQuestionType(question: string): string[] {
  const types: string[] = [];

  if (/\b(how|come si|come)\b/i.test(question)) types.push('how');
  if (/\b(what|cosa|quale|quali|which)\b/i.test(question)) types.push('what');
  if (/\b(who|chi)\b/i.test(question)) types.push('who');
  if (/\b(where|dove)\b/i.test(question)) types.push('where');
  if (/\b(why|perché|perche)\b/i.test(question)) types.push('why');
  if (/\b(impact|affect|break|rompe|cambia|change|modifica)\b/i.test(question)) types.push('impact');
  if (/\b(flow|flusso|path|percorso|navigate)\b/i.test(question)) types.push('flow');

  return types;
}

// ============================================================
// Helpers
// ============================================================

function resolveStationId(
  schema: SubwaySchema,
  idOrLabel: string,
): Station | undefined {
  // Exact ID match
  const byId = schema.stations.find(s => s.id === idOrLabel);
  if (byId) return byId;

  // Case-insensitive label match
  const lower = idOrLabel.toLowerCase();
  const byLabel = schema.stations.find(
    s => s.label.toLowerCase() === lower,
  );
  if (byLabel) return byLabel;

  // Partial label match (only if unique)
  const partialMatches = schema.stations.filter(
    s => s.label.toLowerCase().includes(lower) || s.id.toLowerCase().includes(lower),
  );
  if (partialMatches.length === 1) return partialMatches[0];

  return undefined;
}
