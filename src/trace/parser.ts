import { Parser, Tree, Language } from 'web-tree-sitter';
import type { SourceFile } from '../types/index.js';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const _require = createRequire(import.meta.url);

let initialized = false;
const parsers = new Map<string, Parser>();

/**
 * Resolve the path to a WASM file shipped inside a package.
 * Works with pnpm and npm layouts by scanning up from the
 * resolved entry point until the WASM file is found.
 */
function resolveWasm(packageName: string, wasmFile: string): string {
  const mainEntry = _require.resolve(packageName);
  const parts = mainEntry.split('/');

  // Walk up from the deepest directory, checking each ancestor
  for (let i = parts.length - 1; i >= 3; i--) {
    const dir = parts.slice(0, i).join('/');
    const candidate = dir + '/' + wasmFile;
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Cannot resolve WASM path for ${packageName}/${wasmFile} (from ${mainEntry})`
  );
}

/**
 * Initialize web-tree-sitter and load WASM grammars.
 * Must be called once before any parse operation.
 */
export async function initParser(): Promise<void> {
  if (initialized) return;

  // Initialize web-tree-sitter WASM runtime
  const wasmPath = resolveWasm('web-tree-sitter', 'web-tree-sitter.wasm');
  const wasmDir = wasmPath.replace('/web-tree-sitter.wasm', '');

  await Parser.init({
    locateFile: (script: string) => {
      // Return the full path for any requested WASM file
      return `${wasmDir}/${script}`;
    },
  });

  // Load JavaScript grammar (also covers JSX)
  const jsWasm = resolveWasm('tree-sitter-javascript', 'tree-sitter-javascript.wasm');
  const jsLang = await Language.load(jsWasm);
  const jsParser = new Parser();
  jsParser.setLanguage(jsLang);
  parsers.set('javascript', jsParser);
  parsers.set('jsx', jsParser);

  // Load TypeScript grammar
  const tsWasm = resolveWasm('tree-sitter-typescript', 'tree-sitter-typescript.wasm');
  const tsLang = await Language.load(tsWasm);
  const tsParser = new Parser();
  tsParser.setLanguage(tsLang);
  parsers.set('typescript', tsParser);

  // Load TSX grammar
  const tsxWasm = resolveWasm('tree-sitter-typescript', 'tree-sitter-tsx.wasm');
  const tsxLang = await Language.load(tsxWasm);
  const tsxParser = new Parser();
  tsxParser.setLanguage(tsxLang);
  parsers.set('tsx', tsxParser);

  initialized = true;
}

/**
 * Get the parser for a given language string.
 */
export function getParser(language: string): Parser | undefined {
  return parsers.get(language);
}

/**
 * Parse a source file and return the syntax Tree.
 * Returns null if no parser is available for the file's language.
 */
export function parseFile(file: SourceFile): Tree | null {
  const parser = getParser(file.language);
  if (!parser) return null;
  return parser.parse(file.content);
}

/**
 * Check if the parser system has been initialized.
 */
export function isInitialized(): boolean {
  return initialized;
}
