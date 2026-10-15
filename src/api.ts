import { API_BASE, HOLDER_LIMIT, TRANSFER_LIMIT } from './tokens.ts';
import { parseHolders, parseMetadata, parseTransfers } from './data.ts';
import type { Dataset, Token, Transfer } from './types.ts';

async function get(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(response.status === 429 ? 'The data provider is busy. Try again shortly.' : `The data provider returned HTTP ${response.status}. Try refreshing.`);
  return response.json();
}

async function loadTransfers(address: string, signal: AbortSignal) {
  const transfers: Transfer[] = [];
  let next: Record<string, string> | null = null;
  let complete = false;
  let transferError = false;
  const cursors = new Set<string>();
  try {
    for (let page = 0; page < TRANSFER_LIMIT / 50; page++) {
      const query = next ? `?${new URLSearchParams(next)}` : '';
      if (cursors.has(query)) break;
      cursors.add(query);
      const parsed = parseTransfers(await get(`/tokens/${address}/transfers${query}`, signal));
      transfers.push(...parsed.transfers);
      next = parsed.next;
      if (!next) { complete = true; break; }
    }
  } catch (error) {
    if (signal.aborted) throw error;
    transferError = true;
  }
  // New blocks may overlap pages. An event is uniquely identified by transaction + log index.
  const unique = [...new Map(transfers.map(t => [`${t.hash}:${t.logIndex}`, t])).values()].slice(0, TRANSFER_LIMIT);
  return { transfers: unique, transfersComplete: complete, transferError };
}

export async function fetchDataset(token: Token, signal: AbortSignal): Promise<Dataset> {
  const address = token.address.toLowerCase();
  const [metadata, holders, transfers] = await Promise.all([
    get(`/tokens/${address}`, signal).then(data => parseMetadata(data, address)),
    get(`/tokens/${address}/holders`, signal).then(parseHolders),
    loadTransfers(address, signal),
  ]);
  if (metadata.decimals !== token.decimals) throw new Error('Unexpected token decimals');
  return { tokenId: token.id, ...metadata, holders: holders.slice(0, HOLDER_LIMIT), ...transfers, fetchedAt: new Date().toISOString() };
}
