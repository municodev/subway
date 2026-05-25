/**
 * In-memory vector store for cosine similarity search.
 *
 * For production, this could be replaced with hnswlib-node or
 * an external vector database. For MVP, linear scan is fine
 * for typical project sizes (<1000 stations).
 */
export interface VectorEntry {
  id: string;
  vector: number[];
}

export interface SearchResult {
  id: string;
  score: number; // cosine similarity, 0–1
}

export class VectorStore {
  private entries: VectorEntry[] = [];

  /** Add or update an entry */
  upsert(id: string, vector: number[]): void {
    const existing = this.entries.find(e => e.id === id);
    if (existing) {
      existing.vector = vector;
    } else {
      this.entries.push({ id, vector });
    }
  }

  /** Remove an entry */
  remove(id: string): void {
    this.entries = this.entries.filter(e => e.id !== id);
  }

  /** Number of entries */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Search by cosine similarity.
   * Returns top-k results sorted by descending similarity.
   */
  search(query: number[], k: number = 10): SearchResult[] {
    if (this.entries.length === 0) return [];

    const results: SearchResult[] = [];

    for (const entry of this.entries) {
      const score = cosineSimilarity(query, entry.vector);
      results.push({ id: entry.id, score });
    }

    // Sort by descending score
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, k);
  }

  /** Return all entries */
  getAll(): VectorEntry[] {
    return [...this.entries];
  }
}

/**
 * Compute cosine similarity between two vectors.
 * Returns 0–1 where 1 = identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    // Pad or truncate to common length
    const len = Math.min(a.length, b.length);
    return cosineSimilarity(a.slice(0, len), b.slice(0, len));
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Compute cosine similarity with spreading activation decay.
 * For synaptic search: query → primary node → adjacent nodes.
 */
export function spreadActivation(
  queryVector: number[],
  nodeVectors: Map<string, number[]>,
  edges: Array<{ from: string; to: string; strength: number }>,
  decayFactor: number = 0.42,
  maxHops: number = 2,
): Map<string, number> {
  const activations = new Map<string, number>();

  // Step 1: Find primary node(s) by cosine similarity to query
  for (const [id, vec] of nodeVectors) {
    activations.set(id, cosineSimilarity(queryVector, vec));
  }

  // Step 2: Spread activation for maxHops
  for (let hop = 0; hop < maxHops; hop++) {
    const snapshot = new Map(activations);

    for (const edge of edges) {
      const fromAct = snapshot.get(edge.from) ?? 0;
      if (fromAct > 0.08) {
        const spread = fromAct * edge.strength * decayFactor;
        const current = activations.get(edge.to) ?? 0;
        activations.set(edge.to, Math.max(current, spread));
      }

      // Also spread backwards (undirected graph effect)
      const toAct = snapshot.get(edge.to) ?? 0;
      if (toAct > 0.08) {
        const spreadBack = toAct * edge.strength * decayFactor;
        const current = activations.get(edge.from) ?? 0;
        activations.set(edge.from, Math.max(current, spreadBack));
      }
    }
  }

  return activations;
}
