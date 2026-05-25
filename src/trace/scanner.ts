import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SourceFile, SourceLanguage } from '../types/index.js';

// Directories to always ignore
const DEFAULT_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.cache', '__pycache__', 'vendor', '.pnpm',
  'android', 'ios', '.expo', '.turbo', '.parcel-cache',
  'target', 'bin', 'obj', 'out', '.dart_tool', '.gradle',
  'Pods', '.bundle', 'site-packages', 'venv', '.venv', 'env',
  '.serverless', '.terraform', '.cdk',
]);

/**
 * All source-file extensions Subway recognizes.
 * Maps extension → language classification.
 * Extend this map to add new language support.
 */
const EXT_LANGUAGE_MAP: Record<string, SourceLanguage> = {
  // JavaScript / TypeScript ecosystem
  '.ts':    'typescript',
  '.tsx':   'tsx',
  '.mts':   'typescript',
  '.cts':   'typescript',
  '.js':    'javascript',
  '.jsx':   'jsx',
  '.mjs':   'javascript',
  '.cjs':   'javascript',

  // Python ecosystem
  '.py':    'python',
  '.pyw':   'python',
  '.pyx':   'python',
  '.pxd':   'python',
  '.pxi':   'python',
  '.ipynb': 'python',

  // Ruby ecosystem
  '.rb':    'ruby',
  '.rake':  'ruby',
  '.gemspec':'ruby',

  // Go ecosystem
  '.go':    'go',

  // Rust ecosystem
  '.rs':    'rust',

  // Kotlin / Java / Android ecosystem
  '.kt':    'kotlin',
  '.kts':   'kotlin',
  '.java':  'java',

  // Swift / Apple ecosystem
  '.swift': 'swift',

  // Dart / Flutter ecosystem
  '.dart':  'dart',

  // C# / .NET ecosystem
  '.cs':    'csharp',

  // PHP ecosystem
  '.php':   'php',
  '.phtml': 'php',

  // C / C++ ecosystem
  '.c':     'c',
  '.h':     'c',
  '.cpp':   'cpp',
  '.cc':    'cpp',
  '.cxx':   'cpp',
  '.hpp':   'cpp',
  '.hxx':   'cpp',

  // Shell scripting
  '.sh':    'shell',
  '.bash':  'shell',
  '.zsh':   'shell',

  // SQL
  '.sql':   'sql',

  // Config / data files (scanned for context but not AST-parsed)
  '.yaml':  'yaml',
  '.yml':   'yaml',
  '.json':  'json',
  '.toml':  'yaml', // treat TOML like config

  // Markdown / documentation
  '.md':    'markdown',
  '.mdx':   'markdown',

  // Web
  '.html':  'html',
  '.htm':   'html',
  '.css':   'css',
  '.scss':  'css',
  '.sass':  'css',
  '.less':  'css',
};

/** Extensions that are considered "source" (indexed for analysis) */
const SOURCE_EXTENSIONS = new Set(Object.keys(EXT_LANGUAGE_MAP));

/**
 * Recursively scan a directory for source files in any recognized language.
 *
 * Subway is language-agnostic: it scans all common source-file extensions,
 * classifies each file by language, and leaves deeper AST analysis to the
 * appropriate tree-sitter grammar or regex-based detector.
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
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTENSIONS.has(ext)) {
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

function inferLanguage(ext: string): SourceLanguage {
  return EXT_LANGUAGE_MAP[ext] ?? 'other';
}
