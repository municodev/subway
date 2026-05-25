#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { runTrace } from './trace/index.js';
import { buildSubwayJson, writeSubwayJson } from './output/index.js';
import { runWeight } from './weight/index.js';
const packageJson = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
);

const program = new Command();

program
  .name('subway')
  .description('Map your codebase — Every codebase is a game. Every search is a synapse.')
  .version(packageJson.version);

// ==================== init ====================
program
  .command('init')
  .description('Analyze the current project and generate subway.json')
  .option('-r, --root <path>', 'Project root directory', '.')
  .option('-o, --output <path>', 'Output path for subway.json', './subway.json')
  .option('--name <name>', 'Project name (default: directory name)')
  .option('--skip-weight', 'Skip weight calculation (Fase 2)')
  .option('--skip-embed', 'Skip embedding generation (Fase 4)')
  .action(async (options) => {
    const rootDir = path.resolve(options.root);
    const outputPath = path.resolve(options.output);

    console.log('');
    console.log('  🚇  Subway — Codebase Mapping Tool');
    console.log(`  ${'─'.repeat(40)}`);
    console.log(`  Project: ${path.basename(rootDir)}`);
    console.log(`  Root:    ${rootDir}`);
    console.log('');

    // Phase 1: TRACE
    console.log('  📡  Phase 1: TRACE — Scanning source files...');
    const traceResult = await runTrace({
      rootDir,
      ignoreDirs: ['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage', '.cache', '__pycache__', 'vendor', '.pnpm', 'android', 'ios', '.expo', 'test', 'tests', '__tests__', 'spec'],
    });
    console.log(`      Found ${traceResult.files.length} source files`);
    console.log(`      Found ${traceResult.entryPoints.length} entry points`);
    console.log(`      Found ${traceResult.navigations.length} navigation patterns`);
    console.log(`      Found ${traceResult.conditions.length} conditions`);
    console.log(`      Found ${traceResult.terminals.length} terminal nodes`);
    console.log(`      Found ${traceResult.dependencies.length} dependencies`);
    console.log('');

    // Build the schema (pre-weights)
    console.log('  🔧  Building stations...');
    const schema = buildSubwayJson(traceResult, options.name);

    // Phase 2: WEIGHT
    if (!options.skipWeight) {
      console.log('  ⚖   Phase 2: WEIGHT — Computing synaptic weights...');
      try {
        runWeight(
          { rootDir },
          schema.stations,
          traceResult.dependencies,
          schema.synapses,
        );
        console.log(`      ✓ Churn: ${schema.stations.filter(s => s.weight.churn > 0).length} stations with git activity`);
        console.log(`      ✓ Influence: max ${Math.max(...schema.stations.map(s => s.weight.influence)).toFixed(2)}`);
        console.log(`      ✓ Centrality: max ${Math.max(...schema.stations.map(s => s.weight.centrality)).toFixed(2)}`);
        console.log(`      ✓ Dependency risk: max ${Math.max(...schema.stations.map(s => s.weight.dependency)).toFixed(2)}`);
      } catch (err) {
        console.warn(`      ⚠  Weight computation failed: ${err instanceof Error ? err.message : String(err)}`);
        console.warn('      Stations will have zero weights.');
      }
    }

    // Write final schema
    console.log('  💾  Writing subway.json...');
    writeSubwayJson(schema, outputPath);
    console.log(`      ✓ ${outputPath}`);
    console.log(`      ✓ ${schema.meta.totalStations} stations`);
    console.log(`      ✓ ${schema.meta.totalSynapses} synapses`);
    console.log(`      ✓ ${schema.meta.totalWorlds} worlds`);
    console.log(`      ✓ ${schema.meta.totalLines} lines`);
    console.log('');

    // Print top weights
    const topStations = [...schema.stations]
      .sort((a, b) => (b.weight.influence + b.weight.centrality) - (a.weight.influence + a.weight.centrality));
    const topN = Math.min(5, topStations.length);
    if (topN > 0 && !options.skipWeight) {
      console.log('  🏆  Top stations by influence × centrality:');
      for (let i = 0; i < topN; i++) {
        const s = topStations[i];
        const combined = ((s.weight.influence + s.weight.centrality) / 2 * 100).toFixed(0);
        const bar = '█'.repeat(Math.ceil(parseInt(combined) / 10)) + '░'.repeat(10 - Math.ceil(parseInt(combined) / 10));
        console.log(`      ${bar}  ${combined}%  ${s.label} [${s.world}]`);
      }
      console.log('');
    }

    // Post-init hint
    console.log('  💡  Next steps:');
    console.log('      • Open the visual viewer with:  subway serve');
    console.log('      • Search with:                  subway search "your query"');
    console.log('      • Analyze impact:               subway impact <station-id>');
    console.log('');
  });

// ==================== serve ====================
program
  .command('serve')
  .description('Launch a local viewer for the subway map')
  .option('-p, --port <port>', 'Port to serve on', '4242')
  .option('-f, --file <path>', 'Path to subway.json', './subway.json')
  .action((options) => {
    const filePath = path.resolve(options.file);
    if (!fs.existsSync(filePath)) {
      console.error(`  ✗ subway.json not found at ${filePath}`);
      console.error('  Run "subway init" first to generate the map.');
      process.exit(1);
    }

    // For now, print a placeholder.
    // In Fase 5, this will start a Vite dev server with the React viewer.
    console.log('');
    console.log('  🚇  Subway Viewer');
    console.log(`  ${'─'.repeat(40)}`);
    console.log(`  Loaded: ${filePath}`);
    console.log('');
    console.log('  ⚠  Static viewer not yet implemented (Fase 5).');
    console.log('  For now, use the React renderer sample:');
    console.log('    npx vite dev -- --port 4242');
    console.log('');
  });

// ==================== search ====================
program
  .command('search')
  .description('Synaptic search across the codebase map')
  .argument('<query>', 'Search query (technical, functional, or symptomatic)')
  .option('-f, --file <path>', 'Path to subway.json', './subway.json')
  .option('--limit <n>', 'Max results', '10')
  .action((query, options) => {
    const filePath = path.resolve(options.file);
    if (!fs.existsSync(filePath)) {
      console.error(`  ✗ subway.json not found at ${filePath}`);
      console.error('  Run "subway init" first to generate the map.');
      process.exit(1);
    }

    const schema = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const limit = parseInt(options.limit, 10);

    // Basic keyword search (Synaptic Search with synonym dictionary in Fase 5)
    console.log('');
    console.log(`  🔍  Search: "${query}"`);
    console.log(`  ${'─'.repeat(40)}`);

    const q = query.toLowerCase();
    const results: Array<{ station: typeof schema.stations[0]; score: number }> = [];

    for (const station of schema.stations) {
      const corpus = [
        station.label,
        station.description,
        station.world,
        ...station.files,
      ].join(' ').toLowerCase();

      let score = 0;
      if (corpus.includes(q)) {
        score = corpus === station.label.toLowerCase() ? 0.96 :
                station.world.toLowerCase() === q ? 0.72 : 0.78;
      }

      if (score > 0) {
        results.push({ station, score });
      }
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    if (results.length === 0) {
      console.log('  No results found.');
    } else {
      const display = results.slice(0, limit);
      for (const r of display) {
        const pct = Math.round(r.score * 100);
        const bar = '●'.repeat(Math.ceil(pct / 10)) + '○'.repeat(10 - Math.ceil(pct / 10));
        console.log(`  ${bar}  ${pct}%  ${r.station.label.padEnd(30)} [${r.station.world}]`);
      }
      console.log('');
      console.log(`  ${results.length} station(s) matched. Showing ${display.length}.`);
    }
    console.log('');
  });

// ==================== impact ====================
program
  .command('impact')
  .description('Show what depends on a station and what it depends on')
  .argument('<station-id>', 'Station ID to analyze')
  .option('-f, --file <path>', 'Path to subway.json', './subway.json')
  .action((stationId, options) => {
    const filePath = path.resolve(options.file);
    if (!fs.existsSync(filePath)) {
      console.error(`  ✗ subway.json not found at ${filePath}`);
      process.exit(1);
    }

    const schema = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const station = schema.stations.find((s: any) => s.id === stationId);

    if (!station) {
      console.error(`  ✗ Station "${stationId}" not found`);
      process.exit(1);
    }

    const incoming = schema.synapses.filter((s: any) => s.to === stationId);
    const outgoing = schema.synapses.filter((s: any) => s.from === stationId);

    console.log('');
    console.log(`  🎯  Impact Analysis: ${station.label}`);
    console.log(`  ${'─'.repeat(40)}`);
    console.log(`  Role:  ${station.role}`);
    console.log(`  World: ${station.world}`);
    console.log(`  Files: ${station.files.join(', ')}`);
    console.log('');
    console.log(`  ⬅  Depends on (${incoming.length}):`);
    for (const s of incoming) {
      const from = schema.stations.find((st: any) => st.id === s.from);
      const label = from?.label ?? s.from;
      console.log(`      • ${label.padEnd(30)} (strength: ${s.strength})`);
    }
    console.log('');
    console.log(`  ➡  Dependents (${outgoing.length}):`);
    for (const s of outgoing) {
      const to = schema.stations.find((st: any) => st.id === s.to);
      const label = to?.label ?? s.to;
      console.log(`      • ${label.padEnd(30)} (strength: ${s.strength})`);
    }
    console.log('');
  });

// ==================== station ====================
program
  .command('station')
  .description('Show detailed information about a station')
  .argument('<station-id>', 'Station ID')
  .option('-f, --file <path>', 'Path to subway.json', './subway.json')
  .action((stationId, options) => {
    const filePath = path.resolve(options.file);
    if (!fs.existsSync(filePath)) {
      console.error(`  ✗ subway.json not found at ${filePath}`);
      process.exit(1);
    }

    const schema = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const station = schema.stations.find((s: any) => s.id === stationId);

    if (!station) {
      console.error(`  ✗ Station "${stationId}" not found`);
      process.exit(1);
    }

    console.log('');
    console.log(`  🚉  ${station.label}`);
    console.log(`  ${'─'.repeat(40)}`);
    console.log(`  ID:       ${station.id}`);
    console.log(`  World:    ${station.world}`);
    console.log(`  Role:     ${station.role}${station.terminalType ? ` (${station.terminalType})` : ''}`);
    console.log(`  Files:`);
    for (const f of station.files) {
      console.log(`    • ${f}`);
    }
    console.log('');
    console.log(`  Description: ${station.description}`);
    console.log('');
    console.log(`  Weights:`);
    console.log(`    influence:   ${(station.weight.influence * 100).toFixed(0)}%`);
    console.log(`    dependency:  ${(station.weight.dependency * 100).toFixed(0)}%`);
    console.log(`    churn:       ${(station.weight.churn * 100).toFixed(0)}%`);
    console.log(`    centrality:  ${(station.weight.centrality * 100).toFixed(0)}%`);
    console.log('');

    const incoming = schema.synapses.filter((s: any) => s.to === stationId);
    const outgoing = schema.synapses.filter((s: any) => s.from === stationId);

    if (incoming.length > 0) {
      console.log(`  ⬅  Incoming synapses:`);
      for (const s of incoming) {
        const from = schema.stations.find((st: any) => st.id === s.from);
        console.log(`      ${from?.label ?? s.from} (${s.direction}, ${s.condition.type})`);
      }
      console.log('');
    }

    if (outgoing.length > 0) {
      console.log(`  ➡  Outgoing synapses:`);
      for (const s of outgoing) {
        const to = schema.stations.find((st: any) => st.id === s.to);
        console.log(`      ${to?.label ?? s.to} (${s.direction}, ${s.condition.type})`);
      }
      console.log('');
    }
  });

program.parse(process.argv);
