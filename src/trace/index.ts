import * as path from 'node:path';
import * as fs from 'node:fs';
import { initParser, isInitialized } from './parser.js';
import { scanFiles } from './scanner.js';
import { detectEntryPoints } from './entry-point.js';
import { detectNavigations } from './navigation.js';
import { detectConditions } from './conditions.js';
import { detectTerminals } from './terminal.js';
import { extractDependencies } from './dependencies.js';
import type { TraceConfig, TraceResult, SourceFile, FileDependency } from '../types/index.js';

/**
 * Run the TRACE phase:
 * 1. Initialize tree-sitter parsers
 * 2. Scan for JS/TS source files
 * 3. Extract entry points, navigation, conditions, terminals
 * 4. Derive dependency graph
 */
export async function runTrace(config: TraceConfig): Promise<TraceResult> {
  const { rootDir } = config;

  // Initialize parser if needed
  if (!isInitialized()) {
    await initParser();
  }

  // Scan for source files
  const ignoreDirs = new Set(config.ignoreDirs ?? [
    'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
    'coverage', '.cache', '__pycache__', 'vendor', '.pnpm',
    'android', 'ios', '.expo',
  ]);
  const files = scanFiles(rootDir, ignoreDirs);
  const fileMap = new Map<string, SourceFile>();
  for (const f of files) {
    fileMap.set(f.path, f);
  }

  // Run all detectors
  const allEntryPoints: TraceResult['entryPoints'] = [];
  const allNavigations: TraceResult['navigations'] = [];
  const allConditions: TraceResult['conditions'] = [];
  const allTerminals: TraceResult['terminals'] = [];
  const allDependencies: FileDependency[] = [];

  for (const file of files) {
    try {
      const entryPoints = detectEntryPoints(file);
      allEntryPoints.push(...entryPoints);

      const navigations = detectNavigations(file);
      allNavigations.push(...navigations);

      const conditions = detectConditions(file);
      allConditions.push(...conditions);

      const terminals = detectTerminals(file);
      allTerminals.push(...terminals);

      const deps = extractDependencies(file, fileMap);
      allDependencies.push(...deps);
    } catch (err) {
      // Skip files that fail to parse
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠  Parse error in ${file.path}: ${msg}`);
    }
  }

  return {
    entryPoints: allEntryPoints,
    navigations: allNavigations,
    conditions: allConditions,
    terminals: allTerminals,
    dependencies: allDependencies,
    files,
  };
}
