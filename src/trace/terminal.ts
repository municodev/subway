import type { Node } from 'web-tree-sitter';
import type { SourceFile, DetectedTerminal } from '../types/index.js';
import { parseFile } from './parser.js';
import { walkNode } from './walk.js';

/**
 * Detect terminal nodes (end states) in a source file:
 * - Error boundaries and error screens
 * - Success/completion screens
 * - Catch blocks with error handling
 * - Toast/notification final states
 * - 404 / not-found pages
 */
export function detectTerminals(file: SourceFile): DetectedTerminal[] {
  const tree = parseFile(file);
  if (!tree) return [];

  const terminals: DetectedTerminal[] = [];
  const root = tree.rootNode;
  const code = file.content;

  walkNode(root, (node, depth) => {
    const text = code.slice(node.startIndex, node.endIndex);

    // Pattern 1: Error boundary class component
    if ((node.type === 'class_declaration' || node.type === 'class') && depth <= 2) {
      if (text.includes('componentDidCatch') || text.includes('getDerivedStateFromError')) {
        const nameNode = node.childForFieldName('name');
        const name = nameNode ? code.slice(nameNode.startIndex, nameNode.endIndex) : 'ErrorBoundary';
        terminals.push({
          file: file.path,
          kind: 'error_boundary',
          terminalType: 'failure',
          description: `Error boundary: ${name}`,
          line: node.startPosition.row + 1,
        });
      }
    }

    // Pattern 2: Catch clauses
    if (node.type === 'catch_clause') {
      const param = node.childForFieldName('parameter') || node.firstNamedChild;
      const paramText = param ? code.slice(param.startIndex, param.endIndex) : 'error';
      terminals.push({
        file: file.path,
        kind: 'catch_block',
        terminalType: 'failure',
        description: `catch (${paramText})`,
        line: node.startPosition.row + 1,
      });
    }

    // Pattern 3: Toast/notification success/error calls
    if (node.type === 'call_expression' && depth <= 6) {
      const callee = node.childForFieldName('function') || node.firstNamedChild;
      if (callee) {
        const calleeText = code.slice(callee.startIndex, callee.endIndex);

        if (calleeText.endsWith('.success') || calleeText.endsWith('.error') || calleeText.endsWith('.warning')) {
          terminals.push({
            file: file.path,
            kind: 'toast_final',
            terminalType: calleeText.endsWith('.success') ? 'success' : 'failure',
            description: `Toast: ${calleeText}`,
            line: node.startPosition.row + 1,
          });
        }
      }
    }

    // Pattern 4: Component names suggesting terminal screens
    if ((node.type === 'function_declaration' || node.type === 'lexical_declaration') && depth <= 2) {
      const nameMatch = text.match(/(?:function|const)\s+(\w+)/);
      if (nameMatch) {
        const name = nameMatch[1];
        const lower = name.toLowerCase();

        if (/(success|completed|done|thank|confirmation|order_confirmed)/i.test(lower) &&
            !/(handler|callback|function|service)/i.test(lower)) {
          terminals.push({
            file: file.path,
            kind: 'success_screen',
            terminalType: 'success',
            description: `Screen: ${name}`,
            line: node.startPosition.row + 1,
          });
        }

        if (/(error_screen|error_page|not_found|404|failed|failure|error_boundary)/i.test(lower) &&
            !/(handler|callback|function|service|repository)/i.test(lower)) {
          terminals.push({
            file: file.path,
            kind: 'error_screen',
            terminalType: 'failure',
            description: `Screen: ${name}`,
            line: node.startPosition.row + 1,
          });
        }
      }
    }

    // Pattern 5: JSX elements suggesting terminal screens
    if (node.type === 'jsx_opening_element' || node.type === 'self_closing_jsx_element') {
      const tagNode = node.child(0);
      if (tagNode) {
        const tag = code.slice(tagNode.startIndex, tagNode.endIndex);
        if (/(success|error|failure|not_found|404)/i.test(tag)) {
          const isError = /error|failure|not_found|404/i.test(tag);
          terminals.push({
            file: file.path,
            kind: isError ? 'error_screen' : 'success_screen',
            terminalType: isError ? 'failure' : 'success',
            description: `JSX element: <${tag}>`,
            line: node.startPosition.row + 1,
          });
        }
      }
    }

    // Pattern 6: State/result objects with success/error fields
    if (node.type === 'object' && depth <= 4) {
      const parent = node.parent;
      if (parent && parent.type === 'variable_declarator') {
        const parentText = code.slice(node.parent?.parent?.startIndex ?? 0, node.parent?.parent?.endIndex ?? 0);
        if (/error|success|failure/i.test(parentText)) {
          terminals.push({
            file: file.path,
            kind: 'completion_handler',
            terminalType: parentText.includes('error') || parentText.includes('failure') ? 'failure' : 'success',
            description: `State object: ${parentText.slice(0, 80)}`,
            line: node.startPosition.row + 1,
          });
        }
      }
    }
  });

  return terminals;
}
