import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutBubbles, minimumMapHeight } from '../src/bubbleLayout.ts';
import { buildLinks, filterHolders, getMapHolders } from '../src/data.ts';
import type { BubbleNode } from '../src/bubbleLayout.ts';
import type { Dataset } from '../src/types.ts';
import snapshot from '../src/data/snapshot.json' with { type: 'json' };

function checkGeometry(nodes: BubbleNode[], width: number, height: number) {
  for (const [i, a] of nodes.entries()) {
    assert.ok(a.radius >= 15, `Holder ${a.rank} has a usable minimum target`);
    assert.ok(a.x - a.radius >= 9 - 1e-6 && a.x + a.radius <= width - 9 + 1e-6, `Holder ${a.rank} fits horizontally`);
    assert.ok(a.y - a.radius >= 20 - 1e-6 && a.y + a.radius <= height - 48 + 1e-6, `Holder ${a.rank} fits vertically`);
    for (const b of nodes.slice(i + 1)) {
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius + 9.9, `Holders ${a.rank}/${b.rank} have a visible gap`);
    }
  }
  const aboveMinimum = nodes.filter(n => n.radius > 15);
  const scaleSquared = aboveMinimum[0] && aboveMinimum[0].radius ** 2 / aboveMinimum[0].share;
  for (const node of aboveMinimum) assert.ok(Math.abs(node.radius ** 2 / node.share - scaleSquared) < 1e-6, 'Areas stay proportional above the minimum');
}

for (const [id, dataset] of Object.entries(snapshot as Record<string, Dataset>)) {
  test(`${id}: complete and filtered holder sets fit narrow, tablet and desktop canvases`, () => {
    const links = buildLinks(dataset.holders, dataset.transfers);
    const holders = getMapHolders(dataset, links);
    for (const [width, height] of [[254, 400], [294, 400], [356, 400], [718, 460], [720, 490], [892, 490], [1000, 540]]) {
      for (const size of ['all', 'large', 'medium', 'small'] as const) {
        const visible = filterHolders(holders, { size, connections: 'all', query: '' });
        const nodes = layoutBubbles(visible, links, width, height);
        assert.deepEqual(nodes.map(n => n.address), visible.map(h => h.address), 'Every matching holder remains present');
        checkGeometry(nodes, width, Math.max(height, minimumMapHeight(width, visible.length)));
      }
    }
  });
}

test('minimum targets grow a constrained map and remain separated', () => {
  const holders = getMapHolders(snapshot.simd as Dataset, []);
  const height = minimumMapHeight(200, holders.length);
  assert.ok(height > 100);
  checkGeometry(layoutBubbles(holders, [], 200, 100), 200, height);
  assert.ok(minimumMapHeight(356, holders.length) < height, 'Extra height is no longer needed after widening');
});

test('empty, single, equal and dust holder sets are deterministic and do not mutate data', () => {
  const realHolders = getMapHolders(snapshot.simd as Dataset, []);
  for (const holders of [[], realHolders.slice(0, 1), realHolders.map(h => ({ ...h, share: 1 })), realHolders.map(h => ({ ...h, share: 0 }))]) {
    const before = structuredClone(holders);
    const nodes = layoutBubbles(holders, [], 356, 400);
    checkGeometry(nodes, 356, 400);
    assert.deepEqual(holders, before);
    assert.deepEqual(layoutBubbles(holders, [], 356, 400), nodes);
  }
});
