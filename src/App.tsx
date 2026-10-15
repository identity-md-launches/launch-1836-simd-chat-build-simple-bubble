import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp, Copy, Diamond, ExternalLink, Focus, GitBranch, List, Network, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import BubbleMap, { holderKind } from './BubbleMap';
import { fetchDataset } from './api';
import { buildLinks, filterHolders, formatAmount, formatShare, formatUnits, getMapHolders, shortAddress } from './data';
import { TOKENS } from './tokens';
import type { Dataset, Filters, Link, MapHolder, Token, TokenId } from './types';
import snapshot from './data/snapshot.json';

const snapshots = snapshot as Record<TokenId, Dataset>;
const initialFilters: Filters = { size: 'all', connections: 'all', query: '' };
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(date)) + ' UTC';

function Brand({ small = false }: { small?: boolean }) {
  return <a className={`brand ${small ? 'brand-small' : ''}`} href="#top" aria-label="IMD Atlas home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>IMD <span className="brand-light">Atlas</span></span></a>;
}

function TokenMark({ token }: { token: Token }) {
  return <span className={`token-mark token-${token.id}`} aria-hidden="true">{token.id === 'imd' ? <span className="token-orbits"><i /><i /><i /></span> : token.id === 'simd' ? <span>s</span> : <span>$</span>}</span>;
}

function Legend() {
  return <section className="legend" aria-labelledby="legend-title"><h2 id="legend-title">Reading the map <CircleHelp size={15} aria-hidden="true" /></h2>
    <div className="legend-row"><span className="legend-dot wallet" />Wallet</div>
    <div className="legend-row"><span className="legend-dot connected" />Connected wallet</div>
    <div className="legend-row"><span className="legend-dot contract" />Smart contract</div>
    <div className="legend-row"><span className="legend-line" />Observed transfer</div>
    <div className="size-key" aria-hidden="true"><i /><i /><i /><span>More tokens</span><ArrowRight size={14} /></div>
    <p>Numbers are holder ranks. Area follows supply share, with a minimum size for small holders.</p>
  </section>;
}

function HolderDetails({ holder, token, links, onClose, onSelect }: { holder: MapHolder; token: Token; links: Link[]; onClose: () => void; onSelect: (address: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => { setCopied(false); setCopyError(false); }, [holder.address]);
  const connections = links.filter(l => l.source === holder.address.toLowerCase() || l.target === holder.address.toLowerCase());
  return <section className="holder-details" aria-labelledby="holder-details-title">
    <div className="panel-title"><h2 id="holder-details-title" tabIndex={-1}>Holder details</h2><button className="icon-button" aria-label="Close holder details" onClick={onClose}><X size={18} /></button></div>
    <div className="holder-identity"><span className={`holder-dot ${holderKind(holder)}`} /><span>{holder.isContract ? 'Smart contract' : 'Wallet'} <span className="muted">· #{holder.rank}</span></span></div>
    {holder.name && <h3 className="holder-name">{holder.name}</h3>}
    <code className="full-address">{holder.address}</code>
    <div className="detail-actions"><button className="text-button" onClick={async () => {
      try { await navigator.clipboard.writeText(holder.address); setCopied(true); setCopyError(false); } catch { setCopyError(true); }
    }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy address'}</button><a href={`https://eth.blockscout.com/address/${holder.address}`} target="_blank" rel="noreferrer">Explorer <ArrowUpRight size={14} /></a></div>
    <span role="status" className={copyError ? 'copy-error' : 'sr-only'}>{copyError ? 'Copy unavailable. Select the address above to copy it.' : copied ? 'Address copied' : ''}</span>
    <dl className="detail-numbers"><div><dt>Token balance</dt><dd>{formatAmount(holder.balance, token.decimals, false)} <span>{token.symbol}</span></dd></div><div><dt>Share of supply</dt><dd>{formatShare(holder.share)}</dd></div></dl>
    <details className="exact-balance"><summary>Exact balance <ChevronDown size={14} /></summary><code>{formatUnits(holder.balance, token.decimals)} {token.symbol}</code></details>
    <h3 className="connections-heading">Observed connections <span>{connections.length}</span></h3>
    {connections.length ? <div className="connection-list">{connections.map(link => {
      const other = link.source === holder.address.toLowerCase() ? link.target : link.source;
      return <div className="connection-item" key={other}><button className="connection-person" onClick={() => onSelect(other)}><GitBranch size={15} /><span className="mono">{shortAddress(other)}</span><ArrowRight size={14} /></button><a href={`https://eth.blockscout.com/tx/${link.transfers[0].hash}`} target="_blank" rel="noreferrer">{link.transfers.length} {link.transfers.length === 1 ? 'transfer' : 'transfers'} · View latest <ArrowUpRight size={12} /></a></div>;
    })}</div> : <p className="detail-note">No transfers to another mapped holder were found in the loaded history.</p>}
    <p className="detail-note">A transfer does not establish common ownership.</p>
  </section>;
}

function HolderList({ holders, token, selected, onSelect, full = false }: { holders: MapHolder[]; token: Token; selected: string | null; onSelect: (a: string) => void; full?: boolean }) {
  return <div className={`holder-list ${full ? 'full-list' : ''}`}>
    <div className="holder-list-labels"><span>Holder</span><span>Supply share</span></div>
    {holders.map(holder => <button key={holder.address} data-holder-address={holder.address.toLowerCase()} className={`holder-row ${selected === holder.address ? 'selected' : ''}`} onClick={() => onSelect(holder.address)} aria-label={`Inspect holder ${holder.rank}, ${holder.address}`} aria-pressed={selected === holder.address}>
      <span className="holder-rank">{String(holder.rank).padStart(2, '0')}</span><span className={`holder-dot ${holderKind(holder)}`} />
      <span className="holder-row-identity"><span className="mono">{shortAddress(holder.address)}</span>{full && <span className="muted">{holder.isContract ? 'Smart contract' : 'Wallet'} · {holder.links} {holder.links === 1 ? 'connection' : 'connections'}</span>}</span>
      <span className="holder-row-amount"><strong>{formatShare(holder.share)}</strong><span>{formatAmount(holder.balance, token.decimals)} {token.symbol}</span></span>
    </button>)}
    {!holders.length && <p className="detail-note">No holders match these filters.</p>}
  </div>;
}

export default function App() {
  const [tokenId, setTokenId] = useState<TokenId>('imd');
  const [tokenType, setTokenType] = useState('all');
  const [datasets, setDatasets] = useState<Record<TokenId, Dataset>>(snapshots);
  const [liveTokens, setLiveTokens] = useState<Partial<Record<TokenId, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth >= 1000);
  const [showLinks, setShowLinks] = useState(true);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [selected, setSelected] = useState<string | null>(null);
  const [showAllHolders, setShowAllHolders] = useState(false);
  const [revision, setRevision] = useState(0);
  const [, setAgeTick] = useState(0);
  const detailsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const token = TOKENS.find(t => t.id === tokenId)!;
  const data = datasets[tokenId];
  const availableTokens = TOKENS.filter(t => tokenType === 'all' || (tokenType === 'mintable' ? t.mintable : !t.mintable));
  const links = useMemo(() => buildLinks(data.holders, data.transfers), [data]);
  const holders = useMemo(() => getMapHolders(data, links), [data, links]);
  const visible = useMemo(() => filterHolders(holders, filters), [holders, filters]);
  const selectedHolder = holders.find(h => h.address.toLowerCase() === selected?.toLowerCase());
  const visibleSet = new Set(visible.map(h => h.address.toLowerCase()));
  const visibleLinks = links.filter(l => visibleSet.has(l.source) && visibleSet.has(l.target));
  const shownShare = visible.reduce((sum, h) => sum + h.share, 0);
  const activeFilterCount = Number(filters.size !== 'all') + Number(filters.connections !== 'all') + Number(tokenType !== 'all');
  const isFresh = Boolean(liveTokens[tokenId]) && Date.now() - Date.parse(data.fetchedAt) < 5 * 60_000;

  useEffect(() => { const id = setInterval(() => setAgeTick(n => n + 1), 60_000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (data.transferError) setFilters(f => ({ ...f, connections: 'all' }));
  }, [data.transferError]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1000px)');
    const change = () => setFiltersOpen(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true); setError(null);
    const timeout = setTimeout(() => controller.abort(), 30_000);
    fetchDataset(token, controller.signal).then(next => {
      if (cancelled) return;
      setDatasets(previous => ({ ...previous, [token.id]: next }));
      setLiveTokens(previous => ({ ...previous, [token.id]: true }));
    }).catch(cause => {
      if (cancelled) return;
      setError(controller.signal.aborted ? 'The live request timed out. Showing the last snapshot.' : cause instanceof Error && cause.message.includes('provider') ? cause.message : 'Live data is unavailable. Showing the last snapshot.');
    }).finally(() => { clearTimeout(timeout); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); };
  }, [token, revision]);

  const selectToken = (id: TokenId, { preserveFilters = false } = {}) => { if (id !== tokenId) setLoading(true); setTokenId(id); setSelected(null); if (!preserveFilters) setFilters(initialFilters); setShowAllHolders(false); };
  const resetFilters = () => { setFilters(initialFilters); setTokenType('all'); };
  const selectHolder = useCallback((address: string) => {
    setSelected(address);
    requestAnimationFrame(() => {
      document.getElementById('holder-details-title')?.focus({ preventScroll: true });
      if (window.innerWidth < 1200) detailsRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
  }, []);
  const changeTokenType = (type: string) => {
    setTokenType(type);
    const next = TOKENS.filter(t => type === 'all' || (type === 'mintable' ? t.mintable : !t.mintable));
    if (!next.some(t => t.id === tokenId)) selectToken(next[0].id, { preserveFilters: true });
  };
  const firstTransfer = data.transfers.at(-1), lastTransfer = data.transfers[0];

  return <>
    <a className="skip-link" href="#explore">Skip to map</a>
    <header className="site-header" id="top"><div className="header-inner"><Brand /><nav aria-label="Main navigation"><a className="nav-active" href="#explore">Explore</a><a href="#ecosystem">Ecosystem</a><a href="#about">About</a></nav><div className="network-label"><Diamond size={15} aria-hidden="true" /><span>Ethereum</span><span className="network-dot" /></div></div></header>
    <main className="page-shell">
      <div className="page-heading"><div><h1>Explore IMD holders</h1><p>A clearer view of IMD holders and their onchain connections.</p></div><a className="how-link" href="#about"><CircleHelp size={16} />How to read the map</a></div>
      <div className="explorer" id="explore">
        <aside className="explore-sidebar" aria-label="Tokens and filters">
          <div className="sidebar-heading"><h2>Explore tokens</h2><span className="count-tag">{availableTokens.length}</span></div>
          <div className="token-list" role="group" aria-label="Select a token">{availableTokens.map(t => <button key={t.id} onClick={() => selectToken(t.id)} className={`token-choice ${tokenId === t.id ? 'active' : ''}`} aria-pressed={tokenId === t.id}><TokenMark token={t} /><span className="token-choice-text"><strong>{t.symbol}</strong><span>{t.name}</span></span>{tokenId === t.id && <span className="token-active-dot" aria-hidden="true" />}</button>)}</div>
          <details className="filter-box" open={filtersOpen} onToggle={e => setFiltersOpen(e.currentTarget.open)}><summary><span><SlidersHorizontal size={16} />Filters{activeFilterCount > 0 && <span className="count-tag">{activeFilterCount}</span>}</span><ChevronDown size={15} /></summary><div className="filter-fields">
            <label htmlFor="token-type">Token type<select id="token-type" value={tokenType} onChange={e => changeTokenType(e.target.value)}><option value="all">All tokens</option><option value="mintable">Mintable</option><option value="fixed">Not mintable</option></select></label>
            <label htmlFor="holder-size">Holder size<select id="holder-size" value={filters.size} onChange={e => { setSelected(null); setFilters(f => ({ ...f, size: e.target.value as Filters['size'] })); }}><option value="all">All sizes</option><option value="large">Large · 1% or more</option><option value="medium">Medium · 0.1% to 1%</option><option value="small">Small · under 0.1%</option></select></label>
            <label htmlFor="connections">Connections<select id="connections" value={filters.connections} disabled={data.transferError} onChange={e => { setSelected(null); setFilters(f => ({ ...f, connections: e.target.value as Filters['connections'] })); }}><option value="all">All holders</option><option value="connected">With connections</option><option value="unconnected">None observed</option></select></label>
            {data.transferError && <p className="filter-note">Connection data is incomplete. Refresh to try again.</p>}
            <label className="checkbox-label"><input type="checkbox" checked={showLinks} onChange={e => setShowLinks(e.target.checked)} /><span>Show connection lines</span></label>
            <button className="reset-filters" onClick={resetFilters}><RefreshCw size={14} />Reset filters</button>
          </div></details>
          <Legend />
        </aside>
        <section className="map-panel" aria-labelledby="map-title">
          <div className="map-heading"><div className="map-token-name"><TokenMark token={token} /><div><h2 id="map-title">{token.symbol} <span>Holder map</span></h2><a className="token-contract" href={`https://eth.blockscout.com/token/${token.address}`} target="_blank" rel="noreferrer" aria-label={`View ${token.symbol} contract ${token.address} on Blockscout`}><span className="mono">{shortAddress(token.address)}</span><ArrowUpRight size={13} /></a></div></div><button className="refresh-button" aria-label="Refresh live data" disabled={loading} onClick={() => { setLoading(true); setRevision(n => n + 1); }}><RefreshCw size={16} className={loading ? 'refreshing' : ''} /><span>{loading ? 'Updating' : 'Refresh'}</span></button></div>
          <div className="map-stats"><div><span>Total holders</span><strong>{data.holderCount.toLocaleString('en-US')}</strong></div><div><span>Mapped supply</span><strong>{formatShare(shownShare)}</strong></div><div><span>Observed links</span><strong>{data.transferError ? 'Partial' : visibleLinks.length.toLocaleString('en-US')}</strong></div></div>
          <div className="map-toolbar"><label className="search-box"><Search size={16} aria-hidden="true" /><span className="sr-only">Search holders by address or name</span><input ref={searchRef} type="search" value={filters.query} onChange={e => { setSelected(null); setFilters(f => ({ ...f, query: e.target.value })); }} placeholder="Search address or name" autoComplete="off" spellCheck={false} /></label><div className="view-switch" role="group" aria-label="View mode"><button aria-label="Show bubble map" aria-pressed={view === 'map'} onClick={() => setView('map')}><Network size={16} /><span>Map</span></button><button aria-label="Show holder list" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={16} /><span>List</span></button></div></div>
          {view === 'map' ? <BubbleMap holders={visible} links={links} token={token} selected={selectedHolder?.address ?? null} onSelect={selectHolder} showLinks={showLinks} onReset={resetFilters} /> : <div className="map-list-view"><HolderList full holders={visible} token={token} selected={selectedHolder?.address ?? null} onSelect={selectHolder} />{visible.length === 0 && <button className="primary-button" onClick={resetFilters}>Clear filters</button>}</div>}
          <div className="map-caption"><span role="status"><Focus size={14} aria-hidden="true" />{visible.length} of {holders.length} holders shown</span><span>{view === 'map' ? 'Select a bubble to explore' : 'Select a holder for details'}</span></div>
          <div className={`data-status ${error ? 'has-error' : ''}`}><div><span className={`status-dot ${loading ? 'pending' : isFresh && !error ? 'fresh' : 'snapshot'}`} /><span role="status">{loading ? liveTokens[tokenId] ? 'Updating · previous data' : 'Updating · showing snapshot' : error ? 'Snapshot · Live update unavailable' : isFresh ? 'Live data · Blockscout' : 'Snapshot · Blockscout'}</span></div><time dateTime={data.fetchedAt}>{dateLabel(data.fetchedAt)}</time></div>
          {error && <div className="error-notice"><span>{error} Use Refresh to try again.</span><a href={`https://eth.blockscout.com/token/${token.address}`} target="_blank" rel="noreferrer">Open explorer <ExternalLink size={13} /></a></div>}
          {data.transferError && <p className="error-notice">Transfer history is incomplete. Some connections may be missing. Refresh to try again.</p>}
        </section>
        <aside className="holders-panel" aria-label="Holder information" ref={detailsRef}>
          {selectedHolder ? <HolderDetails holder={selectedHolder} token={token} links={links} onClose={() => { const address = selectedHolder.address.toLowerCase(); setSelected(null); requestAnimationFrame(() => (document.querySelector<HTMLButtonElement>(`[data-holder-address="${address}"]`) ?? searchRef.current)?.focus()); }} onSelect={address => selectHolder(holders.find(h => h.address.toLowerCase() === address.toLowerCase())?.address ?? address)} /> : <><div className="panel-title"><h2>Top holders</h2><ArrowDownUp size={15} aria-hidden="true" /></div><p className="panel-subtitle">Ranked by {token.symbol} balance</p><HolderList holders={visible.slice(0, showAllHolders ? 50 : 8)} token={token} selected={null} onSelect={selectHolder} />{visible.length > 8 && <button className="view-all-button" onClick={() => setShowAllHolders(value => !value)}>{showAllHolders ? 'Show top 8 holders' : `View all ${visible.length} holders`}<ArrowRight size={15} /></button>}<div className="holder-tip"><GitBranch size={18} aria-hidden="true" /><p>Select a holder to see its balance and observed connections.</p></div></>}
        </aside>
      </div>
      <div className="coverage-note"><span><span className="tiny-dot" />Ethereum mainnet only</span><p>Connections use {data.transfers.length} indexed transfer events{firstTransfer && lastTransfer ? ` from ${dateLabel(firstTransfer.timestamp)} to ${dateLabel(lastTransfer.timestamp)}` : ''}. {data.transfersComplete ? 'All available transfer pages loaded.' : 'Earlier transfers are not included.'}</p></div>
      <section className="ecosystem-section" id="ecosystem" aria-labelledby="ecosystem-title"><div className="section-heading"><div><h2 id="ecosystem-title">Ecosystem tokens</h2><p>Explore the tokens behind the map.</p></div><span className="section-count">3 Ethereum tokens</span></div><div className="ecosystem-grid">{TOKENS.map(t => <article className="ecosystem-token" key={t.id}><div className="ecosystem-token-top"><TokenMark token={t} /><h3>{t.symbol}<span>{t.name}</span></h3><span className={`issuance-tag ${t.mintable ? 'mintable' : ''}`}>{t.mintable ? <PlusSymbol /> : null}{t.mintable ? 'Mintable' : 'Not mintable'}</span></div><p>{t.description}</p><div className="ecosystem-token-bottom"><span>{t.issuance}</span><a href={t.source} target="_blank" rel="noreferrer" aria-label={`Read about ${t.symbol} ${t.mintable ? 'minting' : 'supply'}`}>Read more<ArrowUpRight size={14} /></a></div><button className="explore-token-link" onClick={() => { setTokenType('all'); selectToken(t.id); document.getElementById('explore')?.scrollIntoView({ block: 'start', behavior: 'instant' }); }}>Explore holders<ArrowRight size={15} /></button></article>)}</div></section>
      <section className="about-section" id="about" aria-labelledby="about-title"><div><span className="about-icon" aria-hidden="true"><Network size={24} /></span><h2 id="about-title">About the IMD ecosystem</h2><p>IdentityMD brings agents, contributors and tokens into one ecosystem. Atlas makes its Ethereum holder distribution easier to explore, one connection at a time.</p><a href="https://imd.fun/" target="_blank" rel="noreferrer">Discover IdentityMD<ArrowUpRight size={15} /></a></div><div className="methodology"><h3>What the map tells you</h3><p>Each bubble is one of the token’s top 50 indexed holders. Size follows its share of Ethereum supply, with a minimum size to keep small holders selectable. Addresses include wallets and contracts.</p><p>Lines show nonzero transfers between mapped holders in the loaded history. They do not prove shared ownership. No line means no connection was observed in that window.</p><p>Mintable describes a protocol’s issuance mechanism, not a guarantee of availability. IMD has no new emissions; bridge minting moves existing supply between chains. sIMD and imdUSD have protocol minting paths.</p><details className="method-details"><summary>Data sources and limitations<ChevronDown size={15} /></summary><p>Holder balances, Ethereum supply and recent transfers come from the public <a href="https://eth.blockscout.com/" target="_blank" rel="noreferrer">Blockscout indexer</a>. Up to 500 transfer events are loaded per token. The indexer can lag the chain, and requests are not an atomic block snapshot.</p><p>Data refreshes when you select a token or use Refresh. “Live data” means a successful fetch within the past five minutes. A dated, real snapshot stays available when live requests fail. The zero address and zero balances are excluded from holders.</p><p>Contract addresses and issuance descriptions are from <a href="https://imd.fun/token/" target="_blank" rel="noreferrer">IMD</a>, <a href="https://pool4.imd.fun/docs" target="_blank" rel="noreferrer">POOL4</a> and <a href="https://imdusd.com/docs/reference/contracts-and-addresses/" target="_blank" rel="noreferrer">imdUSD documentation</a>. This is a focused view of three tokens, not an exhaustive ecosystem directory.</p></details></div></section>
    </main>
    <footer className="site-footer"><Brand small /><p>An independent window into the IMD ecosystem.</p><a href="#top">Back to top ↑</a></footer>
  </>;
}

function PlusSymbol() { return <span aria-hidden="true">+</span>; }
