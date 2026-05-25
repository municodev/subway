import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SubwaySchema, Station, Synapse, World, Line, TraceResult } from '../types/index.js';

/**
 * Build a subway.json schema from trace results.
 * This is a minimal first-pass generator — Fase WEIGHT and Fase NARRATE
 * will enrich it with weights, descriptions, world clusters, and lines.
 */
export function buildSubwayJson(
  traceResult: TraceResult,
  projectName?: string,
): SubwaySchema {
  const now = new Date().toISOString();
  const { entryPoints, dependencies, files } = traceResult;

  // 1. Derive stations from entry points + files
  const stations = buildStations(traceResult);

  // 2. Derive synapses from dependencies + navigation
  const synapses = buildSynapses(traceResult, stations);

  // 3. Derive worlds (initial: group by directory)
  const worlds = buildWorlds(stations, files);

  // 4. Derive lines from navigation paths
  const lines = buildLines(traceResult, stations);

  // 5. Detect project languages
  const languages = [...new Set(files.map(f => f.path.match(/\.(\w+)$/)?.[1]).filter(Boolean))] as string[];

  // 6. Determine entry point
  const primaryEntry = entryPoints[0];
  const entryPoint = primaryEntry
    ? slugify(path.basename(primaryEntry.file, path.extname(primaryEntry.file)))
    : 'app';

  return {
    meta: {
      project: projectName || path.basename(process.cwd()),
      version: '3.0',
      generated: now,
      entryPoint,
      totalStations: stations.length,
      totalSynapses: synapses.length,
      totalLines: lines.length,
      totalWorlds: worlds.length,
      languages,
    },
    worlds,
    stations,
    synapses,
    lines,
  };
}

/** Write the subway.json to a file */
export function writeSubwayJson(schema: SubwaySchema, outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2), 'utf-8');
}

// ---- Internal builders ----

function buildStations(trace: TraceResult): Station[] {
  const stationMap = new Map<string, Station>();
  const { files, entryPoints, terminals } = trace;

  // Create a station for each file that has an entry point or is interesting
  const scoredFiles = new Map<string, { score: number; isEntry: boolean; isTerminal: boolean }>();

  for (const ep of entryPoints) {
    const key = ep.file;
    const existing = scoredFiles.get(key) ?? { score: 0, isEntry: false, isTerminal: false };
    existing.score += 10;
    existing.isEntry = true;
    scoredFiles.set(key, existing);
  }

  for (const t of terminals) {
    const key = t.file;
    const existing = scoredFiles.get(key) ?? { score: 0, isEntry: false, isTerminal: false };
    existing.score += 5;
    existing.isTerminal = true;
    scoredFiles.set(key, existing);
  }

  // Also add files from entry points
  for (const f of files) {
    if (!scoredFiles.has(f.path)) {
      // Add all source files with base score
      scoredFiles.set(f.path, { score: 1, isEntry: false, isTerminal: false });
    }
  }

  // Convert to stations
  for (const [filePath, info] of scoredFiles) {
    const id = slugify(path.basename(filePath, path.extname(filePath)));
    const relativePath = path.relative(process.cwd(), filePath);
    const world = inferWorld(relativePath);

    let role: Station['role'] = 'checkpoint';
    if (info.isEntry) {
      // Check if it's the primary entry or a hub
      const isPrimary = entryPoints.some(
        e => e.file === filePath && (e.kind === 'framework_app' || e.kind === 'render_root')
      );
      role = isPrimary ? 'start' : 'hub';
    }

    const terminalTerminals = terminals.filter(t => t.file === filePath);
    let terminalType: Station['terminalType'] = null;
    if (terminalTerminals.length > 0 && info.isTerminal) {
      const fails = terminalTerminals.some(t => t.terminalType === 'failure');
      const success = terminalTerminals.some(t => t.terminalType === 'success');
      if (fails && success) terminalType = 'partial';
      else if (fails) terminalType = 'failure';
      else if (success) terminalType = 'success';
    }

    if (info.isTerminal && role !== 'start' && role !== 'hub') {
      role = 'terminal';
    }

    stationMap.set(id, {
      id,
      label: path.basename(filePath, path.extname(filePath)).replace(/([A-Z])/g, ' $1').trim(),
      world,
      role,
      terminalType,
      files: [relativePath],
      description: generateDescription(filePath, terminals, filePath),
      weight: {
        influence: 0,
        dependency: 0,
        churn: 0,
        centrality: 0,
      },
      authors: [],
      lastModified: new Date().toISOString(),
      commitCount: 0,
    });
  }

  return [...stationMap.values()];
}

function buildSynapses(trace: TraceResult, stations: Station[]): Synapse[] {
  const synapses: Synapse[] = [];
  const stationMap = new Map(stations.map(s => [s.id, s]));

  // Create synapses from dependency edges
  for (const dep of trace.dependencies) {
    const fromId = slugify(path.basename(dep.from, path.extname(dep.from)));
    const toId = slugify(path.basename(dep.to, path.extname(dep.to)));

    if (stationMap.has(fromId) && stationMap.has(toId) && fromId !== toId) {
      // Avoid duplicates
      const existing = synapses.find(s => s.from === fromId && s.to === toId);
      if (!existing) {
        synapses.push({
          from: fromId,
          to: toId,
          condition: {
            description: dep.importedSymbols.length > 0
              ? `Imports: ${dep.importedSymbols.join(', ')}`
              : 'Import dependency',
            type: 'always',
            value: dep.importedSymbols.length > 0
              ? `import { ${dep.importedSymbols.join(', ')} }`
              : `import`,
          },
          direction: 'forward',
          isCritical: dep.importedSymbols.length > 0,
          strength: 0.5,
        });
      }
    }
  }

  // Create synapses from navigation calls
  for (const nav of trace.navigations) {
    const fromId = slugify(path.basename(nav.file, path.extname(nav.file)));
    if (!stationMap.has(fromId)) continue;

    if (nav.target) {
      const toId = slugify(nav.target);
      if (stationMap.has(toId) && fromId !== toId) {
        const existing = synapses.find(s => s.from === fromId && s.to === toId);
        if (!existing) {
          synapses.push({
            from: fromId,
            to: toId,
            condition: {
              description: `Navigation: ${nav.kind}`,
              type: 'always',
              value: nav.target,
            },
            direction: 'forward',
            isCritical: true,
            strength: 0.8,
          });
        }
      }
    }
  }

  return synapses;
}

function buildWorlds(stations: Station[], files: TraceResult['files']): World[] {
  // Group stations by their inferred world
  const worldGroups = new Map<string, Station[]>();
  for (const station of stations) {
    const existing = worldGroups.get(station.world) ?? [];
    existing.push(station);
    worldGroups.set(station.world, existing);
  }

  const worlds: World[] = [];
  const worldColors = [
    '#f5a623', // auth gold
    '#4cc9f0', // info cyan
    '#f72585', // accent pink
    '#7209b7', // purple
    '#06d6a0', // green
    '#ef476f', // red
    '#ffd166', // yellow
    '#118ab2', // blue
    '#073b4c', // dark teal
    '#e36414', // orange
  ];

  let colorIdx = 0;
  for (const [worldId, worldStations] of worldGroups) {
    worlds.push({
      id: worldId,
      name: capitalize(worldId),
      color: worldColors[colorIdx % worldColors.length],
      description: `${capitalize(worldId)} domain`,
      stations: worldStations.map(s => s.id),
    });
    colorIdx++;
  }

  return worlds;
}

function buildLines(trace: TraceResult, stations: Station[]): Line[] {
  // First pass: generate lines from navigation sequences grouped by file
  const lines: Line[] = [];
  const stationMap = new Map(stations.map(s => [s.id, s]));

  // Group navigations by file
  const navByFile = new Map<string, typeof trace.navigations>();
  for (const nav of trace.navigations) {
    const existing = navByFile.get(nav.file) ?? [];
    existing.push(nav);
    navByFile.set(nav.file, existing);
  }

  for (const [file, navs] of navByFile) {
    const fromId = slugify(path.basename(file, path.extname(file)));
    const world = stationMap.get(fromId)?.world ?? 'core';

    // Build a path from sequential navigations
    const pathIds = [fromId];
    for (const nav of navs) {
      if (nav.target) {
        const targetId = slugify(nav.target);
        if (stationMap.has(targetId) && !pathIds.includes(targetId)) {
          pathIds.push(targetId);
        }
      }
    }

    if (pathIds.length > 1) {
      const lineName = pathIds
        .map(id => stationMap.get(id)?.label ?? id)
        .join(' → ');
      lines.push({
        id: `line_${pathIds.join('_to_')}`,
        name: lineName,
        world,
        color: '#4cc9f0',
        path: pathIds,
        conditions: [],
        outcome: 'success',
      });
    }
  }

  return lines;
}

// ---- Helpers ----

/** Create a safe slug from a string */
function slugify(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/** Infer a world name from a file's relative path */
function inferWorld(relativePath: string): string {
  const parts = relativePath.split(path.sep);
  // Use the first directory as the world
  if (parts.length > 1) {
    const dir = parts[0].toLowerCase();
    if (['src', 'lib', 'app', 'packages', 'modules'].includes(dir)) {
      return parts[1]?.toLowerCase() ?? 'core';
    }
    return dir;
  }
  return 'core';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function generateDescription(filePath: string, terminals: TraceResult['terminals'], currentFile: string): string {
  const fileTerminals = terminals.filter(t => t.file === filePath);
  if (fileTerminals.length > 0) {
    return fileTerminals.map(t => t.description).join('; ');
  }
  return `${path.basename(filePath, path.extname(filePath))} module`;
}
