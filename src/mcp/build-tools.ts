/**
 * Build tools for the Subway MCP server.
 *
 * These tools enable an LLM to interactively build a subway.json file
 * by exploring the codebase, defining stations, synapses, worlds, and lines.
 *
 * The LLM workflow:
 *   subway_init_map → explore project structure
 *   subway_read_file → understand key files
 *   subway_add_world → define domains
 *   subway_add_station → register components/services/modules
 *   subway_add_synapse → connect stations with transitions
 *   subway_add_line → define end-to-end flows
 *   subway_save_map → write subway.json to disk
 *   subway_serve → generate and open the viewer
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { StationRole, TerminalType, ConditionType, SynapseDirection, LineOutcome } from '../types/index.js';
import {
  MapSession,
  getActiveSession,
  setActiveSession,
  createSession,
} from './session.js';
import {
  subwaySearch,
  subwayStation,
  subwayPath,
  subwayImpact,
  subwayConditions,
} from './tools.js';

// ============================================================
// Tool result helpers
// ============================================================

function textResult(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text }] };
}

function errorResult(message: string): { content: Array<{ type: 'text'; text: string }>; isError: boolean } {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

function requireSession(): { session: MapSession } | { error: ReturnType<typeof errorResult> } {
  const session = getActiveSession();
  if (!session) {
    return { error: errorResult('No active map building session. Call subway_init_map first to start exploring a project.') };
  }
  return { session };
}

// ============================================================
// Tool: subway_init_map
// ============================================================

export interface InitMapArgs {
  root?: string;
  name?: string;
}

export function subwayInitMap(
  args: InitMapArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const { root = '.', name } = args;

  const projectRoot = path.resolve(root);

  try {
    fs.accessSync(projectRoot);
  } catch {
    return errorResult(`Project root not found or not accessible: ${projectRoot}`);
  }

  const session = createSession(projectRoot, name);
  const scan = session.scanProject();
  const eco = scan.ecosystem;

  const fileExtensions: string[] = [];
  for (const f of scan.fileList) {
    if (!fileExtensions.includes(f.ext)) fileExtensions.push(f.ext);
  }

  let output = `🚇  Subway Map Session — Initialized\n`;
  output += `${'─'.repeat(55)}\n`;
  output += `Project:     ${scan.projectName}\n`;
  output += `Root:        ${scan.projectRoot}\n`;
  output += `Source files: ${scan.totalFiles}\n`;
  output += `Extensions:  ${fileExtensions.join(', ') || 'none'}\n\n`;

  // ---- ECOSYSTEM PANEL (language, framework, packages) ----
  output += `🧬  Detected Ecosystem:\n`;
  output += `    Language:       ${eco.primaryLanguage ?? 'unknown'}`;
  if (eco.languages.length > 1) output += ` (also: ${eco.languages.filter(l => l !== eco.primaryLanguage).join(', ')})`;
  output += `\n`;
  output += `    Frameworks:     ${eco.frameworks.length > 0 ? eco.frameworks.join(', ') : '(none detected)'}\n`;
  output += `    Package mgr:    ${eco.packageManager ?? '(none detected)'}\n`;
  if (eco.configFiles.length > 0) {
    output += `    Config files:   ${eco.configFiles.join(', ')}\n`;
  }
  if (eco.dependencies.length > 0) {
    output += `    Dependencies:   ${eco.dependencies.slice(0, 12).join(', ')}`;
    if (eco.dependencies.length > 12) output += ` ... and ${eco.dependencies.length - 12} more`;
    output += `\n`;
  }
  output += `\n`;

  output += `📁  Top-level directories (${scan.topLevelDirs.length}):\n`;
  for (const d of scan.topLevelDirs) {
    output += `    • ${d}/\n`;
  }
  output += '\n';

  if (scan.entryPoints.length > 0) {
    output += `🏁  Potential entry points (${scan.entryPoints.length}):\n`;
    for (const ep of scan.entryPoints.slice(0, 15)) {
      output += `    • ${ep}\n`;
    }
    if (scan.entryPoints.length > 15) {
      output += `    ... and ${scan.entryPoints.length - 15} more\n`;
    }
    output += '\n';
  }

  if (scan.frameworkHints.length > 0) {
    output += `🔧  Framework hints:\n`;
    for (const hint of scan.frameworkHints.slice(0, 10)) {
      output += `    • ${hint}\n`;
    }
    output += '\n';
  }

  output += `📋  Source files (first 30 of ${scan.totalFiles}):\n`;
  for (const f of scan.fileList.slice(0, 30)) {
    const sizeKB = (f.size / 1024).toFixed(1);
    output += `    ${f.path.padEnd(45)} ${sizeKB.padStart(6)} KB\n`;
  }
  if (scan.fileList.length > 30) {
    output += `    ... and ${scan.fileList.length - 30} more files.\n`;
    output += `    Use subway_read_dir to browse specific directories.\n`;
  }
  output += '\n';

  output += `💡  Next steps:\n`;
  output += `    1. Read key files with subway_read_file\n`;
  output += `    2. Add worlds with subway_add_world (group by domain)\n`;
  output += `    3. Add stations with subway_add_station (${eco.primaryLanguage ?? ''} components/modules/services)\n`;
  output += `    4. Connect stations with subway_add_synapse\n`;
  output += `    5. Define flows with subway_add_line\n`;
  output += `    6. Save the map with subway_save_map\n`;
  output += `    7. View the map with subway_serve\n`;

  return textResult(output);
}

// ============================================================
// Tool: subway_read_file
// ============================================================

export interface ReadFileArgs {
  path: string;
}

export function subwayReadFile(
  args: ReadFileArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  if (!args.path) {
    return errorResult('Missing required parameter: path');
  }

  const content = session.readFile(args.path);
  if (content === null) {
    // Try as an absolute path too
    const altContent = session.readFile(args.path.replace(session.projectRoot + '/', ''));
    if (altContent === null) {
      return errorResult(
        `File not found or not readable: ${args.path}\n\n` +
        `The path must be relative to the project root: ${session.projectRoot}\n` +
        `Use subway_read_dir to explore the directory structure.`,
      );
    }
    return textResult(`📄 ${args.path}\n${'─'.repeat(55)}\n\n${altContent}`);
  }

  return textResult(`📄 ${args.path}\n${'─'.repeat(55)}\n\n${content}`);
}

// ============================================================
// Tool: subway_read_dir
// ============================================================

export interface ReadDirArgs {
  path?: string;
}

export function subwayReadDir(
  args: ReadDirArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  const dirPath = args.path ?? '.';
  const entries = session.readDir(dirPath);

  if (entries === null) {
    return errorResult(
      `Directory not found or not readable: ${dirPath}\n` +
      `Project root: ${session.projectRoot}`,
    );
  }

  let output = `📁 ${dirPath}\n`;
  output += `${'─'.repeat(55)}\n\n`;

  const dirs = entries.filter(e => e.type === 'directory');
  const files = entries.filter(e => e.type === 'file');

  if (dirs.length > 0) {
    output += `Directories (${dirs.length}):\n`;
    for (const d of dirs) {
      output += `  📁 ${d.name}/\n`;
    }
    output += '\n';
  }

  if (files.length > 0) {
    output += `Files (${files.length}):\n`;
    for (const f of files) {
      const sizeKB = f.size ? (f.size / 1024).toFixed(1) + ' KB' : '?';
      output += `  📄 ${f.name.padEnd(40)} ${sizeKB.padStart(7)}\n`;
    }
  }

  if (dirs.length === 0 && files.length === 0) {
    output += '(empty directory)\n';
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_add_world
// ============================================================

export interface AddWorldArgs {
  id: string;
  name: string;
  color?: string;
  description?: string;
}

export function subwayAddWorld(
  args: AddWorldArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  if (!args.id || !args.name) {
    return errorResult('Missing required parameters: id and name');
  }

  const world = session.addWorld({
    id: args.id,
    name: args.name,
    color: args.color,
    description: args.description,
  });

  const status = session.getStatus();
  return textResult(
    `🌍  World added: ${world.name}\n` +
    `${'─'.repeat(40)}\n` +
    `ID:          ${world.id}\n` +
    `Color:       ${world.color}\n` +
    `Description: ${world.description}\n\n` +
    `📊 Session: ${status.worldCount} worlds, ${status.stationCount} stations`,
  );
}

// ============================================================
// Tool: subway_add_station
// ============================================================

export interface AddStationArgs {
  id: string;
  label: string;
  world: string;
  role: StationRole;
  terminalType?: TerminalType;
  files?: string[];
  description?: string;
  authors?: string[];
  /** Influence weight 0–1 */
  influence?: number;
  /** Dependency risk 0–1 */
  dependency?: number;
}

export function subwayAddStation(
  args: AddStationArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  if (!args.id || !args.label || !args.world || !args.role) {
    return errorResult(
      'Missing required parameters: id, label, world, role\n\n' +
      'Roles: start (entry point), hub (central dispatcher), checkpoint (intermediate state), importance (critical), terminal (end state)',
    );
  }

  // Validate role
  const VALID_ROLES: StationRole[] = ['start', 'hub', 'checkpoint', 'importance', 'terminal'];
  if (!VALID_ROLES.includes(args.role)) {
    return errorResult(
      `Invalid role "${args.role}".\n` +
      `Valid roles: ${VALID_ROLES.join(', ')}\n\n` +
      `• start — entry point (app entry, main screen)\n` +
      `• hub — central dispatcher that routes to other stations\n` +
      `• checkpoint — intermediate state in a flow\n` +
      `• importance — critical/high-impact component\n` +
      `• terminal — end state (success/failure/partial)`,
    );
  }

  const station = session.addStation({
    id: args.id,
    label: args.label,
    world: args.world,
    role: args.role,
    terminalType: args.terminalType ?? null,
    files: args.files ?? [],
    description: args.description ?? '',
    authors: args.authors,
    weight: {
      influence: args.influence ?? 0,
      dependency: args.dependency ?? 0,
    },
  });

  const status = session.getStatus();
  const roleEmoji = {
    start: '🏁', hub: '🔄', checkpoint: '⬜', importance: '⚡', terminal: '🏁',
  }[station.role];

  return textResult(
    `${roleEmoji}  Station added: ${station.label}\n` +
    `${'─'.repeat(40)}\n` +
    `ID:          ${station.id}\n` +
    `World:       ${station.world}\n` +
    `Role:        ${station.role}${station.terminalType ? ` (${station.terminalType})` : ''}\n` +
    `Files:       ${station.files.join(', ') || '(none)'}\n` +
    `Description: ${station.description || '(none)'}\n\n` +
    `📊 Session: ${status.stationCount} stations, ${status.synapseCount} synapses`,
  );
}

// ============================================================
// Tool: subway_update_station
// ============================================================

export interface UpdateStationArgs {
  id: string;
  label?: string;
  world?: string;
  role?: StationRole;
  terminalType?: TerminalType;
  files?: string[];
  description?: string;
  authors?: string[];
  influence?: number;
  dependency?: number;
}

export function subwayUpdateStation(
  args: UpdateStationArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  if (!args.id) {
    return errorResult('Missing required parameter: id');
  }

  const updates: any = {};
  if (args.label !== undefined) updates.label = args.label;
  if (args.world !== undefined) updates.world = args.world;
  if (args.role !== undefined) updates.role = args.role;
  if (args.terminalType !== undefined) updates.terminalType = args.terminalType;
  if (args.files !== undefined) updates.files = args.files;
  if (args.description !== undefined) updates.description = args.description;
  if (args.authors !== undefined) updates.authors = args.authors;

  const weightUpdate: any = {};
  if (args.influence !== undefined) weightUpdate.influence = args.influence;
  if (args.dependency !== undefined) weightUpdate.dependency = args.dependency;
  if (Object.keys(weightUpdate).length > 0) updates.weight = weightUpdate;

  const updated = session.updateStation(args.id, updates);
  if (!updated) {
    return errorResult(
      `Station "${args.id}" not found.\n` +
      `Use subway_list_stations to see all registered stations.`,
    );
  }

  return textResult(
    `✏️  Station updated: ${updated.label}\n` +
    `${'─'.repeat(40)}\n` +
    `ID:          ${updated.id}\n` +
    `World:       ${updated.world}\n` +
    `Role:        ${updated.role}\n` +
    `Files:       ${updated.files.join(', ') || '(none)'}\n` +
    `Description: ${updated.description || '(none)'}`,
  );
}

// ============================================================
// Tool: subway_remove_station
// ============================================================

export interface RemoveStationArgs {
  id: string;
}

export function subwayRemoveStation(
  args: RemoveStationArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  if (!args.id) {
    return errorResult('Missing required parameter: id');
  }

  const removed = session.removeStation(args.id);
  if (!removed) {
    return errorResult(`Station "${args.id}" not found.`);
  }

  const status = session.getStatus();
  return textResult(
    `🗑️  Station removed: ${args.id}\n` +
    `📊 Session: ${status.stationCount} stations, ${status.synapseCount} synapses`,
  );
}

// ============================================================
// Tool: subway_add_synapse
// ============================================================

export interface AddSynapseArgs {
  from: string;
  to: string;
  conditionDescription: string;
  conditionType: ConditionType;
  conditionValue?: string;
  direction?: SynapseDirection;
  isCritical?: boolean;
  strength?: number;
}

export function subwayAddSynapse(
  args: AddSynapseArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  if (!args.from || !args.to || !args.conditionDescription || !args.conditionType) {
    return errorResult(
      'Missing required parameters: from, to, conditionDescription, conditionType\n\n' +
      'Condition types: api_response, user_role, device_state, config_flag, data_value, always',
    );
  }

  const VALID_CONDITION_TYPES: ConditionType[] = [
    'api_response', 'user_role', 'device_state', 'config_flag', 'data_value', 'always',
  ];
  if (!VALID_CONDITION_TYPES.includes(args.conditionType)) {
    return errorResult(
      `Invalid condition type "${args.conditionType}".\n` +
      `Valid types: ${VALID_CONDITION_TYPES.join(', ')}`,
    );
  }

  const synapse = session.addSynapse({
    from: args.from,
    to: args.to,
    condition: {
      description: args.conditionDescription,
      type: args.conditionType,
      value: args.conditionValue ?? '',
    },
    direction: args.direction ?? 'forward',
    isCritical: args.isCritical ?? false,
    strength: args.strength ?? 0.5,
  });

  if (!synapse) {
    // Find which station is missing
    const fromExists = session.schema.stations.find(s => s.id === args.from);
    const toExists = session.schema.stations.find(s => s.id === args.to);

    const missing: string[] = [];
    if (!fromExists) missing.push(`"${args.from}" (from)`);
    if (!toExists) missing.push(`"${args.to}" (to)`);

    return errorResult(
      `Cannot create synapse. Station(s) not found: ${missing.join(', ')}\n` +
      `Make sure both stations are registered with subway_add_station first.\n` +
      `Use subway_list_stations to see all stations.`,
    );
  }

  const status = session.getStatus();
  const critLabel = synapse.isCritical ? ' ⚡ CRITICAL' : '';

  return textResult(
    `🔗  Synapse added${critLabel}: ${args.from} → ${args.to}\n` +
    `${'─'.repeat(40)}\n` +
    `Direction:   ${synapse.direction}\n` +
    `Condition:   [${synapse.condition.type}] ${synapse.condition.description}\n` +
    `Strength:    ${synapse.strength}\n\n` +
    `📊 Session: ${status.stationCount} stations, ${status.synapseCount} synapses`,
  );
}

// ============================================================
// Tool: subway_remove_synapse
// ============================================================

export interface RemoveSynapseArgs {
  from: string;
  to: string;
}

export function subwayRemoveSynapse(
  args: RemoveSynapseArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  if (!args.from || !args.to) {
    return errorResult('Missing required parameters: from and to');
  }

  const removed = session.removeSynapse(args.from, args.to);
  if (!removed) {
    return errorResult(`Synapse ${args.from} → ${args.to} not found.`);
  }

  const status = session.getStatus();
  return textResult(
    `🗑️  Synapse removed: ${args.from} → ${args.to}\n` +
    `📊 Session: ${status.stationCount} stations, ${status.synapseCount} synapses`,
  );
}

// ============================================================
// Tool: subway_add_line
// ============================================================

export interface AddLineArgs {
  id: string;
  name: string;
  path: string[];
  world?: string;
  color?: string;
  conditions?: string[];
  outcome?: LineOutcome;
}

export function subwayAddLine(
  args: AddLineArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  if (!args.id || !args.name || !args.path || args.path.length < 2) {
    return errorResult(
      'Missing required parameters: id, name, path (array of station IDs, min 2)',
    );
  }

  const line = session.addLine({
    id: args.id,
    name: args.name,
    world: args.world,
    color: args.color,
    path: args.path,
    conditions: args.conditions,
    outcome: args.outcome,
  });

  if (!line) {
    // Find which station IDs are missing
    const missingIds = args.path.filter(
      id => !session.schema.stations.find(s => s.id === id),
    );
    return errorResult(
      `Cannot create line. Station(s) not found in path: ${missingIds.join(', ')}\n` +
      `Register all stations with subway_add_station before defining lines.`,
    );
  }

  const outcomeEmoji = line.outcome === 'success' ? '✓' :
                       line.outcome === 'failure' ? '✗' : '⚠';

  const pathLabels = line.path.map(id => {
    const s = session.schema.stations.find(st => st.id === id);
    return s?.label ?? id;
  });

  return textResult(
    `🚂  Line added: ${outcomeEmoji} "${line.name}"\n` +
    `${'─'.repeat(40)}\n` +
    `ID:      ${line.id}\n` +
    `World:   ${line.world}\n` +
    `Outcome: ${line.outcome}\n` +
    `Steps:   ${line.path.length}\n` +
    `Path:    ${pathLabels.join(' → ')}\n` +
    (line.conditions.length > 0 ? `Conditions: ${line.conditions.join(', ')}\n` : '') +
    `\n📊 Session: ${session.getStatus().stationCount} stations, ${session.getStatus().synapseCount} synapses, ${session.getStatus().lineCount} lines`,
  );
}

// ============================================================
// Tool: subway_save_map
// ============================================================

export interface SaveMapArgs {
  output?: string;
}

export function subwaySaveMap(
  args: SaveMapArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  const outputPath = args.output ?? 'subway.json';
  const fullPath = session.save(outputPath);

  const status = session.getStatus();

  let output = `💾  Map saved!\n`;
  output += `${'─'.repeat(40)}\n`;
  output += `File:     ${fullPath}\n`;
  output += `Stations: ${status.stationCount}\n`;
  output += `Synapses: ${status.synapseCount}\n`;
  output += `Worlds:   ${status.worldCount}\n`;
  output += `Lines:    ${status.lineCount}\n\n`;

  if (status.stationCount === 0) {
    output += `⚠  Warning: The map has 0 stations. The file was saved but will be essentially empty.\n`;
    output += `Add stations with subway_add_station, then save again.\n`;
  } else if (status.synapseCount === 0) {
    output += `💡  Tip: Add synapses between stations with subway_add_synapse to create connections.\n`;
  } else {
    output += `💡  Next: Run 'subway serve' from the CLI to view the map, or call subway_serve from here.\n`;
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_status
// ============================================================

export function subwayStatus(): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  const status = session.getStatus();

  let output = `🚇  Subway Map Session Status\n`;
  output += `${'─'.repeat(45)}\n`;
  output += `Project:       ${session.schema.meta.project}\n`;
  output += `Root:          ${session.projectRoot}\n`;
  output += `Stations:      ${status.stationCount}\n`;
  output += `Synapses:      ${status.synapseCount}\n`;
  output += `Worlds:        ${status.worldCount}\n`;
  output += `Lines:         ${status.lineCount}\n`;
  output += `Descriptions:  ${status.hasDescriptions ? 'yes' : 'no (add descriptions with subway_update_station)'}\n\n`;

  if (status.stationCount > 0) {
    output += `By world:\n`;
    for (const [world, count] of Object.entries(status.stationsByWorld).sort(([,a], [,b]) => b - a)) {
      output += `  ${world.padEnd(20)} ${count} station(s)\n`;
    }
    output += '\n';

    output += `By role:\n`;
    const roleOrder: StationRole[] = ['start', 'hub', 'checkpoint', 'importance', 'terminal'];
    for (const role of roleOrder) {
      if (status.stationsByRole[role]) {
        const emoji = { start: '🏁', hub: '🔄', checkpoint: '⬜', importance: '⚡', terminal: '🏁' }[role];
        output += `  ${emoji} ${role.padEnd(16)} ${status.stationsByRole[role]} station(s)\n`;
      }
    }
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_list_stations
// ============================================================

export interface ListStationsArgs {
  world?: string;
}

export function subwayListStations(
  args: ListStationsArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  const stations = session.listStations(args.world);

  let output = `🚉  Stations`;
  if (args.world) output += ` in "${args.world}"`;
  output += ` (${stations.length})\n`;
  output += `${'─'.repeat(55)}\n\n`;

  if (stations.length === 0) {
    output += `No stations found.\n`;
    output += `Add stations with subway_add_station.\n`;
    return textResult(output);
  }

  for (const s of stations) {
    const roleEmoji = {
      start: '🏁', hub: '🔄', checkpoint: '⬜', importance: '⚡', terminal: '🏁',
    }[s.role];
    const terminalTag = s.terminalType ? ` [${s.terminalType}]` : '';
    output += `${roleEmoji} ${s.label.padEnd(30)} ${s.world.padEnd(15)} ${s.role}${terminalTag}\n`;
    if (s.description) {
      output += `   ${s.description.slice(0, 80)}\n`;
    }
    output += `   ID: ${s.id}  |  Files: ${s.files.join(', ') || 'none'}\n`;

    // Show connections
    const outgoing = session.schema.synapses.filter(syn => syn.from === s.id);
    const incoming = session.schema.synapses.filter(syn => syn.to === s.id);
    if (outgoing.length > 0) {
      output += `   → ${outgoing.length} outgoing`;
      if (outgoing.length <= 5) {
        output += `: ${outgoing.map(s => {
          const to = session.schema.stations.find(st => st.id === s.to);
          return to?.label ?? s.to;
        }).join(', ')}`;
      }
      output += '\n';
    }
    if (incoming.length > 0) {
      output += `   ← ${incoming.length} incoming`;
      if (incoming.length <= 5) {
        output += `: ${incoming.map(s => {
          const from = session.schema.stations.find(st => st.id === s.from);
          return from?.label ?? s.from;
        }).join(', ')}`;
      }
      output += '\n';
    }
    output += '\n';
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_list_lines
// ============================================================

export function subwayListLines(): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  const { lines } = session.schema;

  let output = `🚂  Lines (${lines.length})\n`;
  output += `${'─'.repeat(55)}\n\n`;

  if (lines.length === 0) {
    output += `No lines defined.\n`;
    output += `Define complete flows with subway_add_line.\n`;
    return textResult(output);
  }

  for (const line of lines) {
    const emoji = line.outcome === 'success' ? '✓' :
                  line.outcome === 'failure' ? '✗' : '⚠';
    const pathLabels = line.path.map(id => {
      const s = session.schema.stations.find(st => st.id === id);
      return s?.label ?? id;
    });

    output += `${emoji} "${line.name}" [${line.outcome}]\n`;
    output += `   ID: ${line.id}  |  World: ${line.world}\n`;
    output += `   Path (${line.path.length} steps): ${pathLabels.join(' → ')}\n`;
    if (line.conditions.length > 0) {
      output += `   Conditions: ${line.conditions.join('; ')}\n`;
    }
    output += '\n';
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_list_worlds
// ============================================================

export function subwayListWorlds(): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  const worlds = session.schema.worlds;

  let output = `🌍  Worlds (${worlds.length})\n`;
  output += `${'─'.repeat(45)}\n\n`;

  if (worlds.length === 0) {
    output += `No worlds defined.\n`;
    output += `Worlds are created automatically when you add stations, or you can define them explicitly with subway_add_world.\n`;
    return textResult(output);
  }

  for (const w of worlds) {
    output += `🌍 ${w.name}  (${w.id})\n`;
    output += `   Color: ${w.color}  |  Stations: ${w.stations.length}\n`;
    output += `   ${w.description}\n`;
    if (w.stations.length > 0 && w.stations.length <= 10) {
      output += `   Stations: ${w.stations.join(', ')}\n`;
    }
    output += '\n';
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_serve (via MCP)
// ============================================================

export async function subwayServe(): Promise<ReturnType<typeof textResult> | ReturnType<typeof errorResult>> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  // Ensure the schema is saved first
  const outputPath = session.projectRoot + '/subway.json';
  try {
    session.save(outputPath);
  } catch (err) {
    return errorResult(
      `Failed to save map before serving: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Generate the viewer HTML
  try {
    const viewerModule = await import('../generate-viewer.js');
    const { generateViewerHtml } = viewerModule;
    const schema = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    const html = generateViewerHtml(schema);

    const htmlPath = outputPath.replace(/\.json$/, '.html');
    fs.writeFileSync(htmlPath, html, 'utf-8');

    const htmlSizeKB = (fs.statSync(htmlPath).size / 1024).toFixed(1);

    return textResult(
      `🚇  Subway Viewer Generated\n` +
      `${'─'.repeat(45)}\n` +
      `Schema:    ${outputPath}\n` +
      `Viewer:    ${htmlPath}\n` +
      `Size:      ${htmlSizeKB} KB\n\n` +
      `Open the HTML file in your browser to explore the map:\n` +
      `  file://${htmlPath}\n`,
    );
  } catch (err) {
    return errorResult(
      `Map saved to ${outputPath}, but viewer generation failed: ${err instanceof Error ? err.message : String(err)}\n\n` +
      `You can still open the viewer manually: subway serve`,
    );
  }
}

// ============================================================
// Tool: subway_scan (deeper scan after session started)
// ============================================================

export function subwayScan(): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  const scan = session.scanProject();

  let output = `📡  Project Scan: ${scan.projectName}\n`;
  output += `${'─'.repeat(55)}\n`;
  output += `Source files: ${scan.totalFiles}\n`;
  output += `Languages:    ${scan.languages.filter(e => !e.startsWith('.')).map(e => e.slice(1)).join(', ')}\n\n`;

  if (scan.entryPoints.length > 0) {
    output += `Entry points (${scan.entryPoints.length}):\n`;
    for (const ep of scan.entryPoints.slice(0, 20)) {
      output += `  🏁 ${ep}\n`;
    }
    output += '\n';
  }

  if (scan.frameworkHints.length > 0) {
    output += `Framework hints:\n`;
    for (const hint of scan.frameworkHints) {
      output += `  🔧 ${hint}\n`;
    }
    output += '\n';
  }

  output += `Files (${scan.fileList.length}):\n`;
  for (const f of scan.fileList.slice(0, 40)) {
    output += `  ${f.path.padEnd(45)} ${(f.size / 1024).toFixed(1)} KB\n`;
  }
  if (scan.fileList.length > 40) {
    output += `  ... and ${scan.fileList.length - 40} more\n`;
  }

  return textResult(output);
}

// ============================================================
// Tool: subway_current_map — returns the current in-memory schema
// so the LLM can inspect it with the read tools
// ============================================================

export function subwayCurrentMap(): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  return textResult(
    `The active map session has:\n` +
    `  • ${session.schema.stations.length} stations\n` +
    `  • ${session.schema.synapses.length} synapses\n` +
    `  • ${session.schema.worlds.length} worlds\n` +
    `  • ${session.schema.lines.length} lines\n\n` +
    `Use subway_list_stations, subway_list_worlds, and subway_list_lines to inspect the current map.\n` +
    `Use subway_search, subway_station, subway_path on the active map with subway_query_* tools.`,
  );
}

// ============================================================
// Read tools that work on the active session schema
// ============================================================

export interface QuerySearchArgs {
  query: string;
  limit?: number;
}

export function subwayQuerySearch(
  args: QuerySearchArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  if (!args.query) {
    return errorResult('Missing required parameter: query');
  }

  return subwaySearch(session.schema, {
    query: args.query,
    limit: args.limit ?? 10,
  });
}

export interface QueryStationArgs {
  id: string;
}

export function subwayQueryStation(
  args: QueryStationArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  return subwayStation(session.schema, { id: args.id });
}

export interface QueryPathArgs {
  from: string;
  to: string;
}

export function subwayQueryPath(
  args: QueryPathArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  return subwayPath(session.schema, { from: args.from, to: args.to });
}

export interface QueryImpactArgs {
  id: string;
}

export function subwayQueryImpact(
  args: QueryImpactArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  return subwayImpact(session.schema, { id: args.id });
}

export interface QueryConditionsArgs {
  id: string;
}

export function subwayQueryConditions(
  args: QueryConditionsArgs,
): ReturnType<typeof textResult> | ReturnType<typeof errorResult> {
  const result = requireSession();
  if ('error' in result) return result.error;
  const session = result.session;

  return subwayConditions(session.schema, { id: args.id });
}
