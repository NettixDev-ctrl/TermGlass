// Pure helpers for the split-pane tree. No DOM or React in here so they can be unit tested.
export type SplitDir = 'row' | 'col';

export interface Leaf {
  kind: 'leaf';
  id: string;
}

export interface Split {
  kind: 'split';
  id: string;
  /** 'row' places children side by side, 'col' stacks them. */
  dir: SplitDir;
  /** Fraction of the space given to the first child. */
  ratio: number;
  a: PaneNode;
  b: PaneNode;
}

export type PaneNode = Leaf | Split;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

export const MIN_RATIO = 0.08;
export const MAX_RATIO = 1 - MIN_RATIO;

export function leaves(node: PaneNode, out: string[] = []): string[] {
  if (node.kind === 'leaf') out.push(node.id);
  else {
    leaves(node.a, out);
    leaves(node.b, out);
  }
  return out;
}

export function hasLeaf(node: PaneNode, id: string): boolean {
  return node.kind === 'leaf' ? node.id === id : hasLeaf(node.a, id) || hasLeaf(node.b, id);
}

export function splitLeaf(node: PaneNode, targetId: string, dir: SplitDir, newLeafId: string, splitId: string): PaneNode {
  if (node.kind === 'leaf') {
    if (node.id !== targetId) return node;
    return { kind: 'split', id: splitId, dir, ratio: 0.5, a: node, b: { kind: 'leaf', id: newLeafId } };
  }
  const a = splitLeaf(node.a, targetId, dir, newLeafId, splitId);
  const b = a === node.a ? splitLeaf(node.b, targetId, dir, newLeafId, splitId) : node.b;
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

/** Removes a leaf and promotes its sibling. Returns null when the tree becomes empty. */
export function removeLeaf(node: PaneNode, id: string): PaneNode | null {
  if (node.kind === 'leaf') return node.id === id ? null : node;
  const a = removeLeaf(node.a, id);
  const b = removeLeaf(node.b, id);
  if (a === null) return b;
  if (b === null) return a;
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

export function setRatio(node: PaneNode, splitId: string, ratio: number): PaneNode {
  if (node.kind === 'leaf') return node;
  const r = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
  if (node.id === splitId) return node.ratio === r ? node : { ...node, ratio: r };
  const a = setRatio(node.a, splitId, ratio);
  const b = setRatio(node.b, splitId, ratio);
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

/** Maps every leaf to its rectangle inside the unit square (dividers are ignored). */
export function computeRects(node: PaneNode, rect: Rect = { x: 0, y: 0, w: 1, h: 1 }, out = new Map<string, Rect>()): Map<string, Rect> {
  if (node.kind === 'leaf') {
    out.set(node.id, rect);
    return out;
  }
  if (node.dir === 'row') {
    const aw = rect.w * node.ratio;
    computeRects(node.a, { ...rect, w: aw }, out);
    computeRects(node.b, { x: rect.x + aw, y: rect.y, w: rect.w - aw, h: rect.h }, out);
  } else {
    const ah = rect.h * node.ratio;
    computeRects(node.a, { ...rect, h: ah }, out);
    computeRects(node.b, { x: rect.x, y: rect.y + ah, w: rect.w, h: rect.h - ah }, out);
  }
  return out;
}

const EPS = 1e-6;

/** The closest pane in the given direction that shares an edge range with `fromId`. */
export function findNeighbor(root: PaneNode, fromId: string, direction: Direction): string | null {
  const rects = computeRects(root);
  const from = rects.get(fromId);
  if (!from) return null;
  let best: { id: string; dist: number; overlap: number } | null = null;
  for (const [id, r] of rects) {
    if (id === fromId) continue;
    let dist: number;
    let overlap: number;
    if (direction === 'left' || direction === 'right') {
      dist = direction === 'left' ? from.x - (r.x + r.w) : r.x - (from.x + from.w);
      overlap = Math.min(from.y + from.h, r.y + r.h) - Math.max(from.y, r.y);
    } else {
      dist = direction === 'up' ? from.y - (r.y + r.h) : r.y - (from.y + from.h);
      overlap = Math.min(from.x + from.w, r.x + r.w) - Math.max(from.x, r.x);
    }
    if (dist < -EPS || overlap <= EPS) continue;
    if (!best || dist < best.dist - EPS || (Math.abs(dist - best.dist) <= EPS && overlap > best.overlap)) best = { id, dist, overlap };
  }
  return best?.id ?? null;
}

export function cycleLeaf(root: PaneNode, fromId: string, delta: 1 | -1): string {
  const all = leaves(root);
  const i = all.indexOf(fromId);
  return all[(i + delta + all.length) % all.length] ?? fromId;
}

/** Maps each leaf id through `fn`, keeping the tree shape (used to duplicate a tab). */
export function mapLeaves(node: PaneNode, fn: (id: string) => string, newSplitId: () => string): PaneNode {
  if (node.kind === 'leaf') return { kind: 'leaf', id: fn(node.id) };
  return { ...node, id: newSplitId(), a: mapLeaves(node.a, fn, newSplitId), b: mapLeaves(node.b, fn, newSplitId) };
}

export interface SplitInfo {
  id: string;
  dir: SplitDir;
  ratio: number;
  /** The area covered by the whole split, in unit-square coordinates. */
  rect: Rect;
}

/** Every split with its rectangle; used to place resize dividers. */
export function computeSplits(node: PaneNode, rect: Rect = { x: 0, y: 0, w: 1, h: 1 }, out: SplitInfo[] = []): SplitInfo[] {
  if (node.kind === 'leaf') return out;
  out.push({ id: node.id, dir: node.dir, ratio: node.ratio, rect });
  if (node.dir === 'row') {
    const aw = rect.w * node.ratio;
    computeSplits(node.a, { ...rect, w: aw }, out);
    computeSplits(node.b, { x: rect.x + aw, y: rect.y, w: rect.w - aw, h: rect.h }, out);
  } else {
    const ah = rect.h * node.ratio;
    computeSplits(node.a, { ...rect, h: ah }, out);
    computeSplits(node.b, { x: rect.x, y: rect.y + ah, w: rect.w, h: rect.h - ah }, out);
  }
  return out;
}
