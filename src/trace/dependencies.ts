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
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '/index.ts', '/index.tsx', '/index.js', '/index.jsx',
  ];

  // Direct file match
  if (fs.existsSync(basePath)) {
    const stat = fs.statSync(basePath);
    if (stat.isFile()) return basePath;
    if (stat.isDirectory()) {
      for (const ext of extensions) {
        const candidate = basePath + ext;
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }

  // Try with extensions
  for (const ext of extensions) {
    const candidate = basePath + ext;
    if (fs.existsSync(candidate)) return candidate;
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
