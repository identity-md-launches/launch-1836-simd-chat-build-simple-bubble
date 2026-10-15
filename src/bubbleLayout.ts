import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { SimulationNodeDatum } from 'd3-force';
import type { Link, MapHolder } from './types';

export type BubbleNode = MapHolder & SimulationNodeDatum & { radius: number; x: number; y: number };

const MIN_RADIUS = 15;
const GAP = 10;
const INSET_X = 9;
const INSET_TOP = 20;
const INSET_BOTTOM = 48;

// Reserve room for every minimum-size target, including the map controls below it.
function minimumColumns(width: number) {
  return Math.max(1, Math.floor((width - 2 * INSET_X + GAP) / (2 * MIN_RADIUS + GAP)));
}

export function minimumMapHeight(width: number, count: number) {
  if (!count) return 0;
  return INSET_TOP + INSET_BOTTOM + Math.ceil(count / minimumColumns(width)) * (2 * MIN_RADIUS + GAP) - GAP;
}

function clamp(node: BubbleNode, width: number, height: number) {
  node.x = Math.max(node.radius + INSET_X, Math.min(width - node.radius - INSET_X, node.x));
  node.y = Math.max(node.radius + INSET_TOP, Math.min(height - node.radius - INSET_BOTTOM, node.y));
}

// Forces alone do not guarantee separation: a boundary clamp can undo their work.
// Project both constraints together and verify the final positions before using them.
function separate(nodes: BubbleNode[], width: number, height: number) {
  for (let pass = 0; pass < 500; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const overlap = a.radius + b.radius + GAP - distance;
        if (overlap <= 0) continue;
        const x = distance ? dx / distance : Math.cos(j * 2.399963);
        const y = distance ? dy / distance : Math.sin(j * 2.399963);
        a.x -= x * (overlap / 2 + 0.01); a.y -= y * (overlap / 2 + 0.01);
        b.x += x * (overlap / 2 + 0.01); b.y += y * (overlap / 2 + 0.01);
        clamp(a, width, height); clamp(b, width, height);
        moved = true;
      }
    }
    if (!moved) return true;
  }
  return nodes.every((a, i) => nodes.slice(i + 1).every(b => Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius + GAP - 0.05));
}

export function layoutBubbles(holders: MapHolder[], links: Link[], width: number, requestedHeight: number): BubbleNode[] {
  if (!holders.length) return [];
  const height = Math.max(requestedHeight, minimumMapHeight(width, holders.length));
  const maxShare = Math.max(...holders.map(h => h.share), 0.01);
  const maxRadius = Math.min(width * 0.155, height * 0.22, 105);
  const radiusAt = (holder: MapHolder, scale: number) => Math.max(MIN_RADIUS, Math.sqrt(holder.share / maxShare) * scale);
  const areaAt = (scale: number) => holders.reduce((area, holder) => area + Math.PI * (radiusAt(holder, scale) + GAP / 2) ** 2, 0);
  const areaBudget = (width - 2 * INSET_X) * (height - INSET_TOP - INSET_BOTTOM) * 0.7;
  let low = 0, scale = maxRadius;
  if (areaAt(scale) > areaBudget) {
    for (let step = 0; step < 24; step++) {
      const middle = (low + scale) / 2;
      if (areaAt(middle) <= areaBudget) low = middle;
      else scale = middle;
    }
    scale = low;
  }

  // A shared scale preserves proportional areas for all circles above the floor.
  // Reduce it further if the actual packing cannot satisfy the canvas boundaries.
  while (scale > MIN_RADIUS) {
    const nodes: BubbleNode[] = holders.map((h, i) => {
      const angle = i * 2.399963, distance = Math.sqrt(i) * 32;
      return { ...h, x: width / 2 + Math.cos(angle) * distance, y: height / 2 + Math.sin(angle) * distance, radius: radiusAt(h, scale) };
    });
    const present = new Set(nodes.map(n => n.address.toLowerCase()));
    const edges = links.filter(l => present.has(l.source) && present.has(l.target)).map(l => ({ source: l.source, target: l.target }));
    const simulation = forceSimulation(nodes)
      .force('charge', forceManyBody().strength(-35))
      .force('x', forceX(width / 2).strength(0.055))
      .force('y', forceY(height / 2).strength(0.075))
      .force('collide', forceCollide<BubbleNode>().radius(n => n.radius + GAP / 2).iterations(3))
      .force('link', forceLink<BubbleNode, { source: string | BubbleNode; target: string | BubbleNode }>(edges).id(n => n.address.toLowerCase()).distance(l => (l.source as BubbleNode).radius + (l.target as BubbleNode).radius + 22).strength(0.13))
      .stop();
    for (let step = 0; step < 260; step++) {
      simulation.tick();
      nodes.forEach(node => clamp(node, width, height));
    }
    if (separate(nodes, width, height)) return nodes;
    scale *= 0.85;
  }

  // At the radius floor a regular packing guarantees reachable targets, even on
  // a canvas too small for the force layout. The component grows to this height.
  const columns = Math.min(holders.length, minimumColumns(width));
  const rows = Math.ceil(holders.length / columns);
  const cell = 2 * MIN_RADIUS + GAP;
  const top = INSET_TOP + (height - INSET_TOP - INSET_BOTTOM - (rows * cell - GAP)) / 2;
  return holders.map((holder, i) => {
    const rowCount = Math.min(columns, holders.length - Math.floor(i / columns) * columns);
    return { ...holder, radius: MIN_RADIUS, x: (width - (rowCount * cell - GAP)) / 2 + MIN_RADIUS + (i % columns) * cell, y: top + MIN_RADIUS + Math.floor(i / columns) * cell };
  });
}
