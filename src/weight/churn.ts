import { execSync } from 'node:child_process';

/**
 * Repository-level git log analysis for churn.
 *
 * For each file, counts the number of commits that touched it.
 * Returns a Map<filePath, commitCount>.
 */
export interface ChurnEntry {
  filePath: string;
  commitCount: number;
  lastModified: string; // ISO 8601
  authors: string[];
}

/**
 * Run git log to extract per-file commit statistics.
 */
export function computeChurn(rootDir: string): Map<string, ChurnEntry> {
  const result = new Map<string, ChurnEntry>();

  try {
    // Get commit count per file in the last 12 months
    const logOutput = execSync(
      'git log --since="12 months ago" --name-only --pretty=format:"%H|%ai|%an" --diff-filter=ACMR',
      { cwd: rootDir, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
    );

    // Parse the output: each commit block starts with hash|date|author
    // followed by file paths
    const blocks = logOutput.split('\n\n');
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;

      const header = lines[0];
      const [hash, dateStr, ...authorParts] = header.split('|');
      const author = authorParts.join('|') || 'unknown';
      const files = lines.slice(1).filter(f => f.trim());

      for (const file of files) {
        const existing = result.get(file) ?? {
          filePath: file,
          commitCount: 0,
          lastModified: '',
          authors: [],
        };
        existing.commitCount++;
        existing.lastModified = dateStr || existing.lastModified;
        if (!existing.authors.includes(author)) {
          existing.authors.push(author);
        }
        result.set(file, existing);
      }
    }
  } catch {
    // Not a git repository or git not available — return empty
  }

  // If no git history, try a simpler approach: just get HEAD
  if (result.size === 0) {
    try {
      const logSimple = execSync(
        'git log --oneline --name-only --diff-filter=ACMR -n 100',
        { cwd: rootDir, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 },
      );
      const lines = logSimple.trim().split('\n');
      let currentHash = '';
      for (const line of lines) {
        if (line.startsWith('commit ')) {
          currentHash = line.replace('commit ', '').trim();
        } else if (line.trim() && !line.startsWith('    ')) {
          const file = line.trim();
          const existing = result.get(file) ?? {
            filePath: file,
            commitCount: 0,
            lastModified: '',
            authors: [],
          };
          existing.commitCount++;
          result.set(file, existing);
        }
      }
    } catch {
      // No git history available
    }
  }

  return result;
}

/**
 * Normalize churn values to 0–1 range using min-max scaling.
 * Returns a Map<filePath, normalizedChurn>.
 */
export function normalizeChurn(
  entries: Map<string, ChurnEntry>,
): Map<string, number> {
  const values = [...entries.values()].map(e => e.commitCount);
  if (values.length === 0) return new Map();

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const result = new Map<string, number>();
  for (const [file, entry] of entries) {
    result.set(file, (entry.commitCount - min) / range);
  }
  return result;
}
