import type { Node } from 'web-tree-sitter';
import type { SourceFile, FileDependency } from '../types/index.js';
import { parseFile } from './parser.js';
import { walkNode, findChildByType } from './walk.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Extract import/export dependency relationships from a source file.
 * Returns which files this file depends on.
 */
export function extractDependencies(
  file: SourceFile,
  allFiles: Map<string, SourceFile>,
): FileDependency[] {
  const tree = parseFile(file);
  if (!tree) return [];

  const deps: FileDependency[] = [];
  const root = tree.rootNode;
  const code = file.content;
  const fileDir = path.dirname(file.path);

  walkNode(root, (node, depth) => {
    if (depth > 2) return; // imports are always top-level

    const text = code.slice(node.startIndex, node.endIndex);

    // Pattern 1: ES import statements
    if (node.type === 'import_statement') {
      const moduleSpecifier = node.childForFieldName('source');
      if (!moduleSpecifier) return;

      const modulePath = code.slice(moduleSpecifier.startIndex, moduleSpecifier.endIndex).replace(/['"]/g, '');
      const symbols: string[] = [];

      const importClause = node.childForFieldName('import_clause') || findChildByType(node, 'import_clause');
      if (importClause) {
        extractImportSymbols(importClause, code, symbols);
      }

      // Resolve relative imports to actual file paths
      if (modulePath.startsWith('.')) {
        const resolved = resolveModulePath(path.join(fileDir, modulePath), file.language);
        if (resolved && allFiles.has(resolved)) {
          deps.push({ from: file.path, to: resolved, importedSymbols: symbols });
        }
      } else {
        // External package dependency
        deps.push({ from: file.path, to: modulePath, importedSymbols: symbols });
      }
    }

    // Pattern 2: require() calls
    if (node.type === 'call_expression') {
      const callee = node.childForFieldName('function') || node.firstNamedChild;
      if (!callee) return;
      const calleeText = code.slice(callee.startIndex, callee.endIndex);
      if (calleeText === 'require') {
        const modulePath = extractStringArg(node, code, 0);
        if (modulePath) {
          if (modulePath.startsWith('.')) {
            const resolved = resolveModulePath(path.join(fileDir, modulePath), file.language);
            if (resolved && allFiles.has(resolved)) {
              deps.push({ from: file.path, to: resolved, importedSymbols: ['*'] });
            }
          } else {
            deps.push({ from: file.path, to: modulePath, importedSymbols: ['*'] });
          }
        }
      }
    }

    // Pattern 3: export ... from '...'
    if (node.type === 'export_statement') {
      const source = node.childForFieldName('source');
      if (source) {
        const modulePath = code.slice(source.startIndex, source.endIndex).replace(/['"]/g, '');
        if (modulePath.startsWith('.')) {
          const resolved = resolveModulePath(path.join(fileDir, modulePath), file.language);
          if (resolved && allFiles.has(resolved)) {
            deps.push({ from: file.path, to: resolved, importedSymbols: ['*'] });
          }
        } else {
          deps.push({ from: file.path, to: modulePath, importedSymbols: ['*'] });
        }
      }
    }
  });

  return deps;
}

/** Extract symbol names from an import clause */
function extractImportSymbols(node: Node, code: string, out: string[]): void {
  if (node.type === 'identifier') {
    out.push(code.slice(node.startIndex, node.endIndex));
  }
  if (node.type === 'import_clause') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) extractImportSymbols(child, code, out);
    }
  }
  // named imports: { foo, bar }
  if (node.type === 'named_imports') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === 'import_specifier') {
        const local = child.childForFieldName('local') || child.firstNamedChild;
        if (local) {
          out.push(code.slice(local.startIndex, local.endIndex));
        }
      }
    }
  }
  // namespace import: * as Foo
  if (node.type === 'namespace_import') {
    const alias = node.childForFieldName('alias');
    if (alias) {
      out.push(code.slice(alias.startIndex, alias.endIndex));
    }
  }
}

/** Resolve a module path to an actual file on disk */
function resolveModulePath(basePath: string, language: string): string | null {
  const extensions = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
  ];
  const indexFiles = [
    '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mjs',
  ];

  // Handle .js → .ts/.tsx mapping (common for ESM TypeScript projects)
  // where imports use .js extension but source files are .ts
  const jsToTs = (p: string) => {
    if (p.endsWith('.js')) return p.slice(0, -3) + '.ts';
    if (p.endsWith('.jsx')) return p.slice(0, -4) + '.tsx';
    return p;
  };

  // File path resolution order:
  const candidates: string[] = [];

  // 1. The original path exactly
  candidates.push(basePath);

  // 2. .js → .ts / .jsx → .tsx swap
  candidates.push(jsToTs(basePath));

  // 3. With each extension appended (import './foo' → './foo.ts')
  for (const ext of extensions) {
    candidates.push(basePath + ext);
    candidates.push(jsToTs(basePath + ext));
  }

  // Try each candidate
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) return candidate;
    }
  }

  // Directory resolution: try basePath as a directory with index files
  for (const index of indexFiles) {
    const candidate = basePath + index;
    if (fs.existsSync(candidate)) return candidate;
    // Also try with .js → .ts swap on the base
    const swapped = jsToTs(basePath) + index;
    if (swapped !== candidate && fs.existsSync(swapped)) return swapped;
  }

  return null;
}

function extractStringArg(node: Node, code: string, argIndex: number): string | null {
  const args = node.childForFieldName('arguments') || findChildByType(node, 'arguments');
  if (!args) return null;
  let idx = 0;
  for (let i = 0; i < args.childCount; i++) {
    const child = args.child(i);
    if (!child || child.type === ',' || child.type === '.') continue;
    if (idx === argIndex) {
      return code.slice(child.startIndex, child.endIndex).replace(/['"`]/g, '');
    }
    idx++;
  }
  return null;
}
