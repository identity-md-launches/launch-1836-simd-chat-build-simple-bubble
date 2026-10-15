import type { Token } from './types';

// Contract identities and issuance descriptions are sourced in artifacts/data-sources.md.
export const TOKENS: Token[] = [
  {
    id: 'imd', symbol: 'IMD', name: 'Identity.md',
    address: '0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7', decimals: 18,
    mintable: false, issuance: 'No new emissions',
    description: 'The ecosystem token. IMD connects the network, staking and Community Coins.',
    source: 'https://imd.fun/token/',
  },
  {
    id: 'simd', symbol: 'sIMD', name: 'Staked IMD',
    address: '0x9Efa934D9fAd4AE28c998a40195646b965a97247', decimals: 24,
    mintable: true, issuance: 'Minted through staking',
    description: 'Vault shares created when IMD is deposited into the staking vault.',
    source: 'https://pool4.imd.fun/docs',
  },
  {
    id: 'imdusd', symbol: 'imdUSD', name: 'IMD dollar',
    address: '0x61aAF8a992A3143e2B0C9cB0030b9fE702854a25', decimals: 18,
    mintable: true, issuance: 'Minted through the vault',
    description: 'A stablecoin minted by its vault against staked IMD collateral.',
    source: 'https://imdusd.com/docs/overview/what-is-imdusd/',
  },
];
export const API_BASE = 'https://eth.blockscout.com/api/v2';
export const TRANSFER_LIMIT = 500;
export const HOLDER_LIMIT = 50;
