import type { FileDependency, Station } from '../types/index.js';
import * as path from 'node:path';

/**
 * Compute influence for each station.
 *
 * Influence = how many other stations directly depend on this station
 * (incoming dependency count), normalized to 0–1.
 *
 * A station that many others import has high influence.
 * A leaf node that nobody imports has low influence.
 */
export function computeInfluence(
  stations: Station[],
  dependencies: FileDependency[],
): Map<string, number> {
  // Build a map of file → station ID
  const fileToStation = new Map<string, string>();
  for (const station of stations) {
    for (const file of station.files) {
      const absPath = path.resolve(file);
      fileToStation.set(absPath, station.id);
      // Also store the relative path as-is
      fileToStation.set(file, station.id);
    }
  }

  // Count incoming dependencies for each station
  const incomingCount = new Map<string, number>();
  for (const station of stations) {
    incomingCount.set(station.id, 0);
  }

  for (const dep of dependencies) {
    const toStation = fileToStation.get(dep.to);
    if (toStation) {
      incomingCount.set(toStation, (incomingCount.get(toStation) ?? 0) + 1);
    }
  }

  // Normalize to 0–1
  const counts = [...incomingCount.values()];
  const max = Math.max(...counts, 1);

  const result = new Map<string, number>();
  for (const [stationId, count] of incomingCount) {
    result.set(stationId, count / max);
  }

  return result;
}

/**
 * Compute dependency score for each station.
 *
 * Dependency = ratio of external imports (npm packages) to total imports.
 * A station that imports many external packages has high dependency risk.
 * Normalized to 0–1.
 */
export function computeDependencyScore(
  stations: Station[],
  dependencies: FileDependency[],
): Map<string, number> {
  const fileToStation = new Map<string, string>();
  for (const station of stations) {
    for (const file of station.files) {
      fileToStation.set(path.resolve(file), station.id);
      fileToStation.set(file, station.id);
    }
  }

  // Count total and external deps per station
  const totalDeps = new Map<string, number>();
  const externalDeps = new Map<string, number>();

  for (const station of stations) {
    totalDeps.set(station.id, 0);
    externalDeps.set(station.id, 0);
  }

  for (const dep of dependencies) {
    const fromStation = fileToStation.get(dep.from);
    if (!fromStation) continue;

    totalDeps.set(fromStation, (totalDeps.get(fromStation) ?? 0) + 1);

    // External if the "to" path is not an absolute/resolved local file
    if (!dep.to.startsWith('/') && !dep.to.startsWith('.')) {
      externalDeps.set(fromStation, (externalDeps.get(fromStation) ?? 0) + 1);
    }
  }

  const result = new Map<string, number>();
  for (const station of stations) {
    const total = totalDeps.get(station.id) ?? 0;
    const external = externalDeps.get(station.id) ?? 0;
    // Score: ratio of external to total (higher = more external = riskier)
    const score = total > 0 ? external / total : 0;
    result.set(station.id, score);
  }

  return result;
}
