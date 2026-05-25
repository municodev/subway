import type { Node } from 'web-tree-sitter';
import type { SourceFile, DetectedCondition } from '../types/index.js';
import { parseFile } from './parser.js';
import { walkNode, findChildByType } from './walk.js';

/**
 * Detect conditions that govern transitions:
 * - if/else statements (especially near navigation or state changes)
 * - switch/case statements
 * - ternary expressions
 * - guard clauses (early returns)
 * - optional chaining (?.) that guards access
 */
export function detectConditions(file: SourceFile): DetectedCondition[] {
  const tree = parseFile(file);
  if (!tree) return [];

  const conditions: DetectedCondition[] = [];
  const root = tree.rootNode;
  const code = file.content;

  walkNode(root, (node, depth) => {
    const text = code.slice(node.startIndex, node.endIndex);
    if (!text.trim()) return;

    // Pattern 1: if statements
    if (node.type === 'if_statement') {
      const cond = node.childForFieldName('condition') || findChildByType(node, 'parenthesized_expression');
      if (cond) {
        const condText = code.slice(cond.startIndex, cond.endIndex);
        conditions.push({
          file: file.path,
          kind: 'if_statement',
          description: condText.length > 80 ? condText.slice(0, 80) + '...' : condText,
          code: condText,
          line: node.startPosition.row + 1,
        });
      }
    }

    // Pattern 2: switch statement and its cases
    if (node.type === 'switch_statement') {
      const value = node.childForFieldName('value') || node.firstNamedChild;
      if (value) {
        const valText = code.slice(value.startIndex, value.endIndex);
        conditions.push({
          file: file.path,
          kind: 'switch_case',
          description: `switch (${valText.length > 60 ? valText.slice(0, 60) + '...' : valText})`,
          code: valText,
          line: node.startPosition.row + 1,
        });
      }

      // Individual case clauses
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type === 'case_statement') {
          const caseVal = child.childForFieldName('value');
          if (caseVal) {
            const caseText = code.slice(caseVal.startIndex, caseVal.endIndex);
            conditions.push({
              file: file.path,
              kind: 'switch_case',
              description: `case ${caseText}`,
              code: `case ${caseText}`,
              line: caseVal.startPosition.row + 1,
            });
          }
        }
      }
    }

    // Pattern 3: Ternary expressions — only at interesting depths
    if (node.type === 'ternary_expression' && depth > 2 && depth < 8) {
      const cond = node.child(0);
      if (cond) {
        const condText = code.slice(cond.startIndex, cond.endIndex);
        conditions.push({
          file: file.path,
          kind: 'ternary',
          description: condText.length > 60 ? condText.slice(0, 60) + '...' : condText,
          code: condText,
          line: node.startPosition.row + 1,
        });
      }
    }

    // Pattern 4: Guard clauses (if with return/throw)
    if (node.type === 'if_statement' && depth <= 4) {
      const consequence = node.childForFieldName('consequence');
      if (consequence) {
        const firstStmt = consequence.firstNamedChild || consequence.firstChild;
        if (firstStmt) {
          const firstText = code.slice(firstStmt.startIndex, firstStmt.endIndex);
          if (firstText.startsWith('return') || firstText.startsWith('throw')) {
            conditions.push({
              file: file.path,
              kind: 'guard_clause',
              description: `Guard: ${text.slice(0, 80)}`,
              code: text,
              line: node.startPosition.row + 1,
            });
          }
        }
      }
    }

    // Pattern 5: Optional chaining — meaningful uses
    if (node.type === 'optional_chain' && depth <= 5) {
      conditions.push({
        file: file.path,
        kind: 'optional_chain',
        description: text.length > 60 ? text.slice(0, 60) + '...' : text,
        code: text,
        line: node.startPosition.row + 1,
      });
    }
  });

  return conditions;
}
