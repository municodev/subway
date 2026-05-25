import type { Node } from 'web-tree-sitter';
import type { SourceFile, DetectedEntryPoint } from '../types/index.js';
import { parseFile } from './parser.js';
import { walkNode } from './walk.js';

/**
 * Detect entry points in a source file:
 * - Framework app creation (createApp, createBrowserRouter, etc.)
 * - Render roots (ReactDOM.createRoot, createRoot)
 * - Server listeners (app.listen, server.listen)
 * - Default exports (export default class/function)
 * - Main entry functions (main, App, index)
 */
export function detectEntryPoints(file: SourceFile): DetectedEntryPoint[] {
  const tree = parseFile(file);
  if (!tree) return [];

  const entries: DetectedEntryPoint[] = [];
  const root = tree.rootNode;
  const code = file.content;

  walkNode(root, (node, depth) => {
    // Skip deeply nested — entry points are top-level
    if (depth > 10) return;

    const text = code.slice(node.startIndex, node.endIndex);

    // Pattern 1: Framework app creation / Render roots
    if (node.type === 'call_expression') {
      const callee = node.childForFieldName('function') || node.firstNamedChild;
      if (!callee) return;

      const calleeText = code.slice(callee.startIndex, callee.endIndex);

      // ReactDOM.createRoot / createRoot(...).render(
      if (calleeText.includes('createRoot') && (text.includes('.render(') || depth < 3)) {
        entries.push({
          file: file.path,
          kind: 'render_root',
          name: extractRenderName(text) || 'App',
          symbol: calleeText,
          line: node.startPosition.row + 1,
        });
      }

      // Vue: createApp(App)
      if (calleeText === 'createApp' || calleeText.endsWith('.createApp')) {
        entries.push({
          file: file.path,
          kind: 'framework_app',
          name: extractVueAppName(text) || 'App',
          symbol: calleeText,
          line: node.startPosition.row + 1,
        });
      }

      // Express/Fastify: .listen(
      if (calleeText.endsWith('.listen')) {
        entries.push({
          file: file.path,
          kind: 'server_listen',
          name: calleeText.replace('.listen', ''),
          symbol: calleeText,
          line: node.startPosition.row + 1,
        });
      }

      // Router creation: createBrowserRouter, createStackNavigator, etc.
      if (/create(Browser|Native|Memory|Hash|Stack|BottomTab|Drawer|Material)?(Router|Navigator|Stack)\b/.test(calleeText)) {
        entries.push({
          file: file.path,
          kind: 'framework_app',
          name: calleeText,
          symbol: calleeText,
          line: node.startPosition.row + 1,
        });
      }
    }

    // Pattern 2: Default export
    if (node.type === 'export_statement' || node.type === 'export_default_declaration') {
      if (text.startsWith('export default')) {
        const nameMatch = text.match(/export\s+default\s+(?:function|class|const)\s+(\w+)/);
        if (nameMatch) {
          entries.push({
            file: file.path,
            kind: 'export_default',
            name: nameMatch[1],
            symbol: `export default ${nameMatch[1]}`,
            line: node.startPosition.row + 1,
          });
        }
      }
    }

    // Pattern 3: Top-level const/let/var named App/app/main
    if ((node.type === 'lexical_declaration' || node.type === 'variable_declaration') && depth <= 2) {
      const nameMatch = text.match(/(?:const|let|var)\s+(App|app|main)\s*[=:]/);
      if (nameMatch) {
        entries.push({
          file: file.path,
          kind: 'main_function',
          name: nameMatch[1],
          symbol: text.slice(0, 80),
          line: node.startPosition.row + 1,
        });
      }
    }

    // Pattern 4: function main() / function App()
    if (node.type === 'function_declaration' || node.type === 'generator_function_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const fnName = code.slice(nameNode.startIndex, nameNode.endIndex);
        if (fnName === 'main' || fnName === 'App' || fnName === 'app') {
          entries.push({
            file: file.path,
            kind: 'main_function',
            name: fnName,
            symbol: `function ${fnName}`,
            line: node.startPosition.row + 1,
          });
        }
      }
    }
  });

  return entries;
}

function extractRenderName(callText: string): string | null {
  const match = callText.match(/<(\w+)\s/);
  return match ? match[1] : null;
}

function extractVueAppName(callText: string): string | null {
  const match = callText.match(/createApp\s*\(\s*(\w+)/);
  return match ? match[1] : null;
}
