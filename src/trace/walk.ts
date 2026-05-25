import type { Node } from 'web-tree-sitter';

/**
 * Walk every node in the AST with depth tracking.
 * Visits all children recursively.
 */
export type WalkFn = (node: Node, depth: number) => void;

export function walkNode(node: Node, fn: WalkFn, depth = 0): void {
  fn(node, depth);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkNode(child, fn, depth + 1);
    }
  }
}

/** Find the first child of a node with the given type. */
export function findChildByType(node: Node, type: string): Node | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}

/** Find the first child of a node that matches a predicate. */
export function findChildByPredicate(node: Node, pred: (n: Node) => boolean): Node | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && pred(child)) return child;
  }
  return null;
}
