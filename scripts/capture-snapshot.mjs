import { writeFile } from 'node:fs/promises';
import { fetchDataset } from '../src/api.ts';
import { TOKENS } from '../src/tokens.ts';

const snapshots = {};
for (const token of TOKENS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const data = await fetchDataset(token, controller.signal);
    if (data.transferError) throw new Error(`Incomplete ${token.symbol} history. Snapshot not replaced.`);
    snapshots[token.id] = data;
    console.log(`${token.symbol}: ${data.holders.length} holders, ${data.transfers.length} events, ${data.fetchedAt}`);
  } finally { clearTimeout(timeout); }
}
// Only replace after all three tokens succeed; never replace real data with a partial export.
await writeFile(new URL('../src/data/snapshot.json', import.meta.url), JSON.stringify(snapshots) + '\n');
