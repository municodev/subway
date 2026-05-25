import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SourceFile } from '../types/index.js';

// Directories to always ignore
const DEFAULT_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.cache', '__pycache__', 'vendor', '.pnpm',
  'android', 'ios', '.expo',
]);

const JS_TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);

/**
 * Recursively scan a directory for JavaScript/TypeScript source files.
 */
export function scanFiles(rootDir: string, ignoreDirs: Set<string> = DEFAULT_IGNORE): SourceFile[] {
  const files: SourceFile[] = [];
  const resolved = path.resolve(rootDir);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory not found: ${resolved}`);
  }

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // skip unreadable directories
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (JS_TS_EXTENSIONS.has(ext)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const language = inferLanguage(ext);
            files.push({ path: fullPath, language, content });
          } catch {
            // skip unreadable files
          }
        }
      }
    }
  }

  walk(resolved);
  return files;
}

function inferLanguage(ext: string): SourceFile['language'] {
  switch (ext) {
    case '.ts':   return 'typescript';
    case '.tsx':  return 'tsx';
    case '.jsx':  return 'jsx';
    case '.mjs':
    case '.cjs':
    case '.js':   return 'javascript';
    case '.mts':
    case '.cts':
    default:      return 'typescript';
  }
}
