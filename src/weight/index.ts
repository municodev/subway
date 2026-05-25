import type { Station, FileDependency, Synapse } from '../types/index.js';
import { computeChurn, normalizeChurn } from './churn.js';
import { computeInfluence, computeDependencyScore } from './influence.js';
import { computeCentrality } from './centrality.js';
import * as path from 'node:path';

export interface WeightConfig {
  rootDir: string;
}

export interface WeightResult {
  stations: Station[];
}

/**
 * Run the WEIGHT phase:
 * 1. Churn — git log commit frequency per file
 * 2. Influence — incoming dependency count per station
 * 3. Centrality — betweenness centrality on the graph
 * 4. Dependency — external import ratio per station
 *
 * Mutates the stations in-place, enriching their weight fields.
 */
export function runWeight(
  config: WeightConfig,
  stations: Station[],
  dependencies: FileDependency[],
  synapses: Synapse[],
): WeightResult {
  // 1. Churn from git log
  const churnEntries = computeChurn(config.rootDir);
  const churnNormalized = normalizeChurn(churnEntries);

  // Map: station ID → max churn across its files
  const stationChurn = new Map<string, number>();
  let totalWithGitActivity = 0;
  let totalCommits = 0;

  for (const station of stations) {
    let maxChurn = 0;
    let maxCommitCount = 0;
    let latestDate = '';
    const allAuthors = new Set<string>();

    for (const file of station.files) {
      const absFile = path.resolve(config.rootDir, file);
      const gitEntry = churnEntries.get(file) ?? churnEntries.get(absFile);
      if (gitEntry) {
        maxCommitCount = Math.max(maxCommitCount, gitEntry.commitCount);
        totalCommits = Math.max(totalCommits, gitEntry.commitCount);
        if (gitEntry.lastModified > latestDate) {
          latestDate = gitEntry.lastModified;
        }
        for (const a of gitEntry.authors) allAuthors.add(a);
      }

      const churnVal = churnNormalized.get(file) ?? churnNormalized.get(absFile) ?? 0;
      if (churnVal > 0) totalWithGitActivity++;
      maxChurn = Math.max(maxChurn, churnVal);
    }

    stationChurn.set(station.id, maxChurn);
    station.commitCount = maxCommitCount;
    station.lastModified = latestDate || station.lastModified;
    station.authors = [...allAuthors];
  }

  // Track max commit count for the log message
  (runWeight as any).__totalCommits = totalCommits;

  // 2. Influence from dependency graph
  const influenceValues = computeInfluence(stations, dependencies);

  // 3. Dependency score (external import ratio)
  const dependencyValues = computeDependencyScore(stations, dependencies);

  // 4. Betweenness centrality
  const centralityValues = computeCentrality(stations, synapses);

  // Write all weights back to stations
  for (const station of stations) {
    station.weight = {
      churn: stationChurn.get(station.id) ?? 0,
      influence: influenceValues.get(station.id) ?? 0,
      dependency: dependencyValues.get(station.id) ?? 0,
      centrality: centralityValues.get(station.id) ?? 0,
    };
  }

  return { stations };
}
