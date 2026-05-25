import type { Node } from 'web-tree-sitter';
import type { SourceFile, DetectedNavigation } from '../types/index.js';
import { parseFile } from './parser.js';
import { walkNode, findChildByType } from './walk.js';

/**
 * Detect navigation patterns in a source file:
 * - Router configuration (Routes, Stack.Navigator, createStackNavigator)
 * - Navigation calls (navigate('Route'), router.push, history.push)
 * - Link components (<Link to="...">, <A href="...">)
 */
export function detectNavigations(file: SourceFile): DetectedNavigation[] {
  const tree = parseFile(file);
  if (!tree) return [];

  const navs: DetectedNavigation[] = [];
  const root = tree.rootNode;
  const code = file.content;

  walkNode(root, (node, depth) => {
    const text = code.slice(node.startIndex, node.endIndex);

    // --- Pattern 1: JSX Router Config elements ---
    if (node.type === 'jsx_opening_element' || node.type === 'self_closing_jsx_element') {
      const tagNode = node.child(0);
      if (!tagNode) return;
      const tag = code.slice(tagNode.startIndex, tagNode.endIndex);

      // React Router components
      if (['Routes', 'Route', 'BrowserRouter', 'NativeRouter', 'MemoryRouter', 'HashRouter', 'Stack'].includes(tag)) {
        navs.push({
          file: file.path,
          kind: 'router_config',
          target: tag === 'Route' ? extractJsxProp(node, code, 'path') ?? undefined : undefined,
          framework: 'react-router',
          line: node.startPosition.row + 1,
        });
      }

      // React Navigation: Stack.Navigator, Tab.Navigator, Drawer.Navigator
      if (tag.endsWith('.Navigator') || tag.endsWith('.Screen')) {
        navs.push({
          file: file.path,
          kind: 'router_config',
          target: tag.endsWith('.Screen') ? extractJsxProp(node, code, 'name') ?? undefined : undefined,
          framework: 'react-navigation',
          line: node.startPosition.row + 1,
        });
      }

      // Link / A / TouchableLink
      if (tag === 'Link' || tag === 'A' || tag === 'TouchableLink') {
        const to = extractJsxProp(node, code, 'to') ?? extractJsxProp(node, code, 'href');
        navs.push({
          file: file.path,
          kind: 'link_component',
          target: to ?? undefined,
          framework: tag === 'A' ? 'html' : 'react-router',
          line: node.startPosition.row + 1,
        });
      }
    }

    // --- Pattern 2: Navigation function calls ---
    if (node.type === 'call_expression') {
      const callee = node.childForFieldName('function') || node.firstNamedChild;
      if (!callee) return;
      const calleeText = code.slice(callee.startIndex, callee.endIndex);

      // navigate('RouteName'), navigation.navigate('RouteName')
      if (calleeText.endsWith('.navigate') || calleeText === 'navigate') {
        const target = extractStringArg(node, code, 0);
        navs.push({
          file: file.path,
          kind: 'navigate_call',
          target: target ?? undefined,
          framework: calleeText.includes('.') ? 'react-navigation' : 'react-router',
          line: node.startPosition.row + 1,
        });
      }

      // router.push('/path'), history.push('/path')
      if (calleeText.endsWith('.push') && depth <= 4) {
        const target = extractStringArg(node, code, 0);
        navs.push({
          file: file.path,
          kind: 'push_call',
          target: target ?? undefined,
          framework: calleeText.includes('router') ? 'vue-router' :
                     calleeText.includes('history') ? 'react-router' : undefined,
          line: node.startPosition.row + 1,
        });
      }

      // router.replace('/path'), history.replace('/path')
      if (calleeText.endsWith('.replace') && depth <= 4) {
        const target = extractStringArg(node, code, 0);
        navs.push({
          file: file.path,
          kind: 'push_call',
          target: target ?? undefined,
          framework: calleeText.includes('router') ? 'vue-router' :
                     calleeText.includes('history') ? 'react-router' : undefined,
          line: node.startPosition.row + 1,
        });
      }
    }

    // --- Pattern 3: window.location.href = '...' ---
    if (node.type === 'assignment_expression') {
      const lhs = node.childForFieldName('left') || node.firstNamedChild;
      if (lhs) {
        const lhsText = code.slice(lhs.startIndex, lhs.endIndex);
        if (lhsText === 'window.location.href') {
          const rhs = node.childForFieldName('right') || node.lastNamedChild;
          if (rhs) {
            const val = code.slice(rhs.startIndex, rhs.endIndex);
            navs.push({
              file: file.path,
              kind: 'navigate_call',
              target: val.replace(/['"]/g, ''),
              framework: 'html',
              line: node.startPosition.row + 1,
            });
          }
        }
      }
    }

    // --- Pattern 4: Router framework imports ---
    if (node.type === 'import_statement' && depth <= 1) {
      const src = node.childForFieldName('source');
      if (!src) return;
      const mod = code.slice(src.startIndex, src.endIndex);
      if (mod.includes('react-router-dom') || mod.includes('react-router-native')) {
        navs.push({
          file: file.path,
          kind: 'router_config',
          framework: 'react-router',
          line: node.startPosition.row + 1,
        });
      }
      if (mod.includes('@react-navigation')) {
        navs.push({
          file: file.path,
          kind: 'router_config',
          framework: 'react-navigation',
          line: node.startPosition.row + 1,
        });
      }
      if (mod.includes('vue-router')) {
        navs.push({
          file: file.path,
          kind: 'router_config',
          framework: 'vue-router',
          line: node.startPosition.row + 1,
        });
      }
    }
  });

  return navs;
}

/** Extract the first string argument from a call expression */
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

/** Extract a JSX attribute value by name */
function extractJsxProp(node: Node, code: string, propName: string): string | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child || child.type !== 'jsx_attribute') continue;
    const nameChild = child.child(0);
    if (!nameChild) continue;
    const name = code.slice(nameChild.startIndex, nameChild.endIndex);
    if (name === propName) {
      // Value is at index 2 (after = and the value itself)
      const valChild = child.child(2);
      if (valChild) {
        return code.slice(valChild.startIndex, valChild.endIndex).replace(/['"{}]/g, '');
      }
    }
  }
  return null;
}
