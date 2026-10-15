import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLinks, filterHolders, formatShare, formatUnits, getMapHolders, parseHolders, parseMetadata, parseTransfers, percentage } from '../src/data.ts';
import snapshot from '../src/data/snapshot.json' with { type: 'json' };
import { TOKENS } from '../src/tokens.ts';
import type { Dataset, Filters, MapHolder } from '../src/types.ts';

const data = snapshot as Record<string, Dataset>;
const usd = data.imdusd;
const defaults: Filters = { size: 'all', connections: 'all', query: '' };

test('sIMD balances preserve all 24 decimal places without floating point conversion', () => {
  assert.equal(formatUnits('1234567890123456789012345', 24), '1.234567890123456789012345');
  assert.equal(formatUnits('1', 24), '0.000000000000000000000001');
  assert.equal(formatUnits('1000', 0), '1000');
});
test('nonzero dust is displayed as less than 0.01%, not a zero balance', () => {
  assert.equal(percentage('1', '4'), 25);
  assert.equal(percentage('1', '0'), 0);
  assert.equal(formatShare(percentage('1', '1000000000000000000000')), '<0.01%');
});
test('all snapshot identities and decimal counts match published contracts', () => {
  for (const token of TOKENS) {
    assert.equal(data[token.id].tokenId, token.id);
    assert.equal(data[token.id].decimals, token.decimals);
    assert.ok(data[token.id].holders.length <= 50);
    assert.ok(data[token.id].transfers.length <= 500);
  }
});
test('real IMD history is allowed to have zero links; no artificial connections appear', () => {
  assert.equal(buildLinks(data.imd.holders, data.imd.transfers).length, 0);
});
test('real imdUSD transfers form observed pairs only', () => {
  const links = buildLinks(usd.holders, usd.transfers);
  assert.equal(links.length, 9);
  const addresses = new Set(usd.holders.map(h => h.address.toLowerCase()));
  for (const link of links) {
    assert.ok(addresses.has(link.source) && addresses.has(link.target));
    assert.ok(link.transfers.length > 0);
    assert.notEqual(link.source, link.target);
  }
});
test('overlapping transfer pages do not double count transaction log events', () => {
  const expected = buildLinks(usd.holders, usd.transfers);
  assert.deepEqual(buildLinks(usd.holders, [...usd.transfers, ...usd.transfers]), expected);
});
test('self transfers and zero-value transfers do not create connections', () => {
  const transfer = buildLinks(usd.holders, usd.transfers)[0].transfers[0];
  assert.deepEqual(buildLinks(usd.holders, [{ ...transfer, to: transfer.from }]), []);
  assert.deepEqual(buildLinks(usd.holders, [{ ...transfer, value: '0' }]), []);
});
test('ranks are descending by exact balance, and links count peers rather than events', () => {
  const links = buildLinks(usd.holders, usd.transfers);
  const holders = getMapHolders({ ...usd, holders: [...usd.holders].reverse() }, links);
  assert.equal(holders[0].rank, 1);
  for (let i = 1; i < holders.length; i++) assert.ok(BigInt(holders[i - 1].balance) >= BigInt(holders[i].balance));
  for (const h of holders) assert.equal(h.links, links.filter(l => [l.source, l.target].includes(h.address.toLowerCase())).length);
});
test('size thresholds partition holders at 0.1% and 1% without overlap', () => {
  const template = getMapHolders(usd, [])[0];
  const holders: MapHolder[] = [0.0999, 0.1, 0.9999, 1].map(share => ({ ...template, share }));
  assert.equal(filterHolders(holders, { ...defaults, size: 'small' }).length, 1);
  assert.equal(filterHolders(holders, { ...defaults, size: 'medium' }).length, 2);
  assert.equal(filterHolders(holders, { ...defaults, size: 'large' }).length, 1);
});
test('address/name search and connection filters combine', () => {
  const holders = getMapHolders(usd, buildLinks(usd.holders, usd.transfers));
  const connected = holders.find(h => h.links > 0)!;
  assert.equal(filterHolders(holders, { ...defaults, connections: 'connected', query: connected.address.toUpperCase() }).length, 1);
  assert.equal(filterHolders(holders, { ...defaults, connections: 'unconnected', query: connected.address }).length, 0);
  assert.equal(filterHolders(holders, { ...defaults, query: 'not-a-matching-address' }).length, 0);
});
test('metadata rejects a different contract and malformed token fields', () => {
  const token = TOKENS[0];
  const metadata = { address_hash: token.address, type: 'ERC-20', decimals: '18', holders_count: '4391', total_supply: data.imd.totalSupply };
  assert.equal(parseMetadata(metadata, token.address).decimals, 18);
  assert.throws(() => parseMetadata(metadata, TOKENS[1].address));
  assert.throws(() => parseMetadata({ ...metadata, total_supply: '-5' }, token.address));
  assert.throws(() => parseMetadata({ ...metadata, decimals: '1000' }, token.address));
  assert.throws(() => parseMetadata({ ...metadata, holders_count: null }, token.address));
  assert.throws(() => parseMetadata({ ...metadata, decimals: null }, token.address));
});
test('holder parser rejects invalid responses and deduplicates case-insensitive addresses', () => {
  const h = usd.holders[0];
  const row = { value: h.balance, address: { hash: h.address, is_contract: h.isContract, name: h.name } };
  assert.equal(parseHolders({ items: [row, row] }).length, 1);
  assert.throws(() => parseHolders({ items: [{ ...row, value: 'invalid' }] }));
  assert.throws(() => parseHolders({ message: 'rate limited' }));
});
test('transfer parser preserves verified transaction identities and constrains pagination', () => {
  const t = usd.transfers[0];
  const result = parseTransfers({ items: [{ from: { hash: t.from }, to: { hash: t.to }, total: { value: t.value }, transaction_hash: t.hash, timestamp: t.timestamp, block_number: t.block, log_index: t.logIndex }], next_page_params: { block_number: 123, index: 2, redirect: 'https://example.com' } });
  assert.deepEqual(result.transfers[0], t);
  assert.deepEqual(result.next, { block_number: '123', index: '2' });
  assert.throws(() => parseTransfers({ items: [{}] }));
});
