import type { Synapse, Station } from '../types/index.js';

/**
 * Compute betweenness centrality for each station.
 *
 * Betweenness centrality measures how often a node appears on the
 * shortest path between two other nodes in the graph.
 * High betweenness = hub that connects different parts of the system.
 *
 * Implementation: Brandes' algorithm O(V*E) for unweighted graphs.
 * Since subway graphs are typically small (<500 nodes), this is fine.
 */
export function computeCentrality(
  stations: Station[],
  synapses: Synapse[],
): Map<string, number> {
  const n = stations.length;
  if (n === 0) return new Map();

  // Build adjacency list
  const idxMap = new Map<string, number>();
  const idMap = new Map<number, string>();
  stations.forEach((s, i) => {
    idxMap.set(s.id, i);
    idMap.set(i, s.id);
  });

  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const syn of synapses) {
    const fromIdx = idxMap.get(syn.from);
    const toIdx = idxMap.get(syn.to);
    if (fromIdx !== undefined && toIdx !== undefined) {
      adj[fromIdx].push(toIdx);
      // Undirected for centrality (dependency graph is bidirectional in effect)
      adj[toIdx].push(fromIdx);
    }
  }

  // Brandes' algorithm
  const bc = new Float64Array(n);

  for (let s = 0; s < n; s++) {
    // BFS from s
    const stack: number[] = [];
    const queue: number[] = [s];
    const pred: number[][] = Array.from({ length: n }, () => []);
    const sigma = new Float64Array(n); // shortest path count
    const dist = new Float64Array(n).fill(-1);

    sigma[s] = 1;
    dist[s] = 0;
    let qIdx = 0;

    while (qIdx < queue.length) {
      const v = queue[qIdx++];
      stack.push(v);

      for (const w of adj[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          queue.push(w);
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }

    // Accumulation
    const delta = new Float64Array(n);
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred[w]) {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      }
      if (w !== s) {
        bc[w] += delta[w];
      }
    }
  }

  // Normalize to 0–1
  const maxVal = n > 2 ? (n - 1) * (n - 2) : 1;
  const result = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    result.set(idMap.get(i)!, bc[i] / maxVal);
  }

  return result;
}
