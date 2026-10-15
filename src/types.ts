export type TokenId = 'imd' | 'simd' | 'imdusd';
export type Token = {
  id: TokenId;
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  mintable: boolean;
  issuance: string;
  description: string;
  source: string;
};
export type Holder = {
  address: string;
  name: string | null;
  isContract: boolean;
  balance: string;
};
export type Transfer = {
  from: string;
  to: string;
  value: string;
  hash: string;
  logIndex: number;
  block: number;
  timestamp: string;
};
export type Dataset = {
  tokenId: TokenId;
  fetchedAt: string;
  totalSupply: string;
  holderCount: number;
  decimals: number;
  holders: Holder[];
  transfers: Transfer[];
  transfersComplete: boolean;
  transferError: boolean;
};
export type Link = {
  source: string;
  target: string;
  transfers: Transfer[];
};
export type MapHolder = Holder & { rank: number; share: number; links: number };
export type Filters = { size: 'all' | 'large' | 'medium' | 'small'; connections: 'all' | 'connected' | 'unconnected'; query: string };
