import type { Dataset, Filters, Holder, Link, MapHolder, Transfer } from './types.ts';

export const isAddress = (value: unknown): value is string => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value);
export const isUint = (value: unknown): value is string => typeof value === 'string' && /^\d+$/.test(value);
export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
export const isZeroAddress = (address: string) => /^0x0{40}$/i.test(address);

export function formatUnits(value: string, decimals: number): string {
  const padded = value.padStart(decimals + 1, '0');
  if (!decimals) return padded;
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return padded.slice(0, -decimals) + (fraction ? `.${fraction}` : '');
}

export function formatAmount(value: string, decimals: number, compact = true): string {
  const amount = Number(formatUnits(value, decimals));
  if (amount > 0 && amount < 0.001) return '<0.001';
  return new Intl.NumberFormat('en-US', { notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 2 : 4 }).format(amount);
}

export function percentage(value: string, total: string): number {
  if (BigInt(total) === 0n) return 0;
  const share = Number(BigInt(value) * 1_000_000n / BigInt(total)) / 10_000;
  return share === 0 && BigInt(value) > 0n ? Number.EPSILON : share;
}

export const formatShare = (share: number) => share > 0 && share < 0.01 ? '<0.01%' : `${share.toFixed(2)}%`;

export function buildLinks(holders: Holder[], transfers: Transfer[]): Link[] {
  const present = new Set(holders.map(h => h.address.toLowerCase()));
  const links = new Map<string, Link>();
  const seen = new Set<string>();
  for (const transfer of transfers) {
    const from = transfer.from.toLowerCase(), to = transfer.to.toLowerCase();
    const eventKey = `${transfer.hash}:${transfer.logIndex}`;
    if (seen.has(eventKey) || from === to || isZeroAddress(from) || isZeroAddress(to) || BigInt(transfer.value) === 0n || !present.has(from) || !present.has(to)) continue;
    seen.add(eventKey);
    const [source, target] = [from, to].sort();
    const key = `${source}:${target}`;
    const link = links.get(key) ?? { source, target, transfers: [] };
    link.transfers.push(transfer);
    links.set(key, link);
  }
  return [...links.values()];
}

export function getMapHolders(data: Dataset, links: Link[]): MapHolder[] {
  const degrees = new Map<string, number>();
  for (const link of links) {
    degrees.set(link.source, (degrees.get(link.source) ?? 0) + 1);
    degrees.set(link.target, (degrees.get(link.target) ?? 0) + 1);
  }
  return [...data.holders]
    .filter(h => !isZeroAddress(h.address) && BigInt(h.balance) > 0n)
    .sort((a, b) => BigInt(a.balance) > BigInt(b.balance) ? -1 : BigInt(a.balance) < BigInt(b.balance) ? 1 : a.address.localeCompare(b.address))
    .map((h, i) => ({ ...h, rank: i + 1, share: percentage(h.balance, data.totalSupply), links: degrees.get(h.address.toLowerCase()) ?? 0 }));
}

export function filterHolders(holders: MapHolder[], filters: Filters): MapHolder[] {
  const query = filters.query.trim().toLowerCase();
  return holders.filter(h => {
    if (query && !h.address.toLowerCase().includes(query) && !h.name?.toLowerCase().includes(query)) return false;
    if (filters.size === 'large' && h.share < 1) return false;
    if (filters.size === 'medium' && (h.share < 0.1 || h.share >= 1)) return false;
    if (filters.size === 'small' && h.share >= 0.1) return false;
    if (filters.connections === 'connected' && h.links === 0) return false;
    if (filters.connections === 'unconnected' && h.links > 0) return false;
    return true;
  });
}

type RecordData = Record<string, unknown>;
const record = (value: unknown): RecordData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unexpected data format');
  return value as RecordData;
};
export function parseMetadata(value: unknown, expectedAddress: string) {
  const d = record(value);
  const decimals = Number(d.decimals), holderCount = Number(d.holders_count);
  if (typeof d.address_hash !== 'string' || d.address_hash.toLowerCase() !== expectedAddress.toLowerCase() || d.type !== 'ERC-20' || !isUint(d.total_supply) || !isUint(d.decimals) || !isUint(d.holders_count) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36 || !Number.isSafeInteger(holderCount) || holderCount < 0) throw new Error('Unexpected token metadata');
  return { totalSupply: d.total_supply, decimals, holderCount };
}
export function parseHolders(value: unknown): Holder[] {
  const d = record(value);
  if (!Array.isArray(d.items)) throw new Error('Unexpected holder data');
  const seen = new Set<string>();
  return d.items.map(item => {
    const h = record(item), address = record(h.address);
    if (!isAddress(address.hash) || !isUint(h.value) || typeof address.is_contract !== 'boolean') throw new Error('Invalid holder');
    return { address: address.hash, balance: h.value, isContract: address.is_contract, name: typeof address.name === 'string' ? address.name.slice(0, 100) : typeof address.ens_domain_name === 'string' ? address.ens_domain_name.slice(0, 100) : null };
  }).filter(h => {
    const key = h.address.toLowerCase();
    if (seen.has(key) || isZeroAddress(key) || BigInt(h.balance) === 0n) return false;
    seen.add(key); return true;
  });
}
export function parseTransfers(value: unknown): { transfers: Transfer[]; next: Record<string, string> | null } {
  const d = record(value);
  if (!Array.isArray(d.items)) throw new Error('Unexpected transfer data');
  const transfers = d.items.map(item => {
    const t = record(item), from = record(t.from), to = record(t.to), total = record(t.total);
    if (!isAddress(from.hash) || !isAddress(to.hash) || !isUint(total.value) || typeof t.transaction_hash !== 'string' || !/^0x[\da-f]{64}$/i.test(t.transaction_hash) || typeof t.timestamp !== 'string' || !Number.isFinite(Date.parse(t.timestamp)) || !Number.isSafeInteger(t.block_number) || !Number.isSafeInteger(t.log_index)) throw new Error('Invalid transfer');
    return { from: from.hash, to: to.hash, value: total.value, hash: t.transaction_hash, logIndex: Number(t.log_index), block: Number(t.block_number), timestamp: t.timestamp };
  });
  const cursor = d.next_page_params == null ? null : record(d.next_page_params);
  const next = cursor ? Object.fromEntries(Object.entries(cursor).filter(([key, v]) => ['index', 'block_number', 'items_count'].includes(key) && /^\d+$/.test(String(v))).map(([k, v]) => [k, String(v)])) : null;
  return { transfers, next: next && Object.keys(next).length ? next : null };
}
