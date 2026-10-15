import { useEffect, useMemo, useRef, useState } from 'react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { SimulationNodeDatum } from 'd3-force';
import { Minus, Plus, Scan, SearchX } from 'lucide-react';
import type { Link, MapHolder, Token } from './types';
import { formatAmount, formatShare, shortAddress } from './data';

type Node = MapHolder & SimulationNodeDatum & { radius: number; x: number; y: number };
type Props = {
  holders: MapHolder[];
  links: Link[];
  token: Token;
  selected: string | null;
  onSelect: (address: string) => void;
  showLinks: boolean;
  onReset: () => void;
};

export function holderKind(holder: MapHolder) {
  return holder.isContract ? 'contract' : holder.links > 0 ? 'connected' : 'wallet';
}

export default function BubbleMap({ holders, links, token, selected, onSelect, showLinks, onReset }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 700, height: 490 });
  const [fontScale, setFontScale] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showTooltip = (address: string) => { clearTimeout(dismissTimer.current); setHovered(address); };
  const hideTooltip = () => { dismissTimer.current = setTimeout(() => setHovered(null), 180); };
  useEffect(() => () => clearTimeout(dismissTimer.current), []);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { clearTimeout(dismissTimer.current); setHovered(null); }
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, []);
  const drag = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(() => {
      if (!container.current) return;
      const { width, height } = container.current.getBoundingClientRect();
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
      setFontScale(parseFloat(getComputedStyle(document.documentElement).fontSize) / 16);
    });
    observer.observe(container.current);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); setHovered(null); }, [token.id, holders]);

  const nodes = useMemo(() => {
    const { width, height } = size;
    const maxShare = Math.max(...holders.map(h => h.share), 0.01);
    const maxRadius = Math.min(width * 0.155, height * 0.22, 105);
    const nodes: Node[] = holders.map((h, i) => {
      const angle = i * 2.399963;
      const distance = Math.sqrt(i) * 32;
      return { ...h, x: width / 2 + Math.cos(angle) * distance, y: height / 2 + Math.sin(angle) * distance, radius: Math.max(15, Math.sqrt(h.share / maxShare) * maxRadius) };
    });
    const present = new Set(nodes.map(n => n.address.toLowerCase()));
    const edges = links.filter(l => present.has(l.source) && present.has(l.target)).map(l => ({ source: l.source, target: l.target }));
    const simulation = forceSimulation(nodes)
      .force('charge', forceManyBody().strength(-35))
      .force('x', forceX(width / 2).strength(0.055))
      .force('y', forceY(height / 2).strength(0.075))
      .force('collide', forceCollide<Node>().radius(n => n.radius + 5).iterations(3))
      .force('link', forceLink<Node, { source: string | Node; target: string | Node }>(edges).id(n => n.address.toLowerCase()).distance(l => (l.source as Node).radius + (l.target as Node).radius + 22).strength(0.13))
      .stop();
    for (let step = 0; step < 260; step++) {
      simulation.tick();
      for (const node of nodes) {
        node.x = Math.max(node.radius + 9, Math.min(width - node.radius - 9, node.x));
        node.y = Math.max(node.radius + 20, Math.min(height - node.radius - 48, node.y));
      }
    }
    return nodes;
  }, [holders, links, size]);
  const byAddress = new Map(nodes.map(n => [n.address.toLowerCase(), n]));
  const active = nodes.find(n => n.address === hovered);
  const selectedLinks = new Set(links.filter(l => l.source === selected?.toLowerCase() || l.target === selected?.toLowerCase()).flatMap(l => [l.source, l.target]));
  const activeX = active ? size.width / 2 + (active.x - size.width / 2) * zoom + pan.x : 0;
  const activeY = active ? size.height / 2 + (active.y - size.height / 2) * zoom + pan.y : 0;

  return <div className="map-stage" ref={container} role="group" aria-label={`${token.symbol} holder bubble map${zoom > 1 ? '. Drag or use arrow keys to pan. Reset map view to fit all holders.' : ''}`}
    onKeyDown={e => {
      if (e.key === 'Escape') setHovered(null);
      if (zoom > 1 && e.target === e.currentTarget) {
        const direction = { ArrowLeft: [30, 0], ArrowRight: [-30, 0], ArrowUp: [0, 30], ArrowDown: [0, -30] }[e.key];
        if (direction) { e.preventDefault(); setPan(p => ({ x: p.x + direction[0], y: p.y + direction[1] })); }
      }
    }} tabIndex={zoom > 1 ? 0 : -1}
    onPointerDown={e => {
      if (zoom <= 1 || (e.target as HTMLElement).closest('button')) return;
      drag.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={e => {
      if (!drag.current) return;
      setPan({ x: drag.current.panX + e.clientX - drag.current.startX, y: drag.current.panY + e.clientY - drag.current.startY });
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} style={{ touchAction: zoom > 1 ? 'none' : 'pan-y' }}>
    {holders.length === 0 ? <div className="map-empty"><SearchX size={32} aria-hidden="true" /><h3>No matching holders</h3><p>Try a different size, connection filter or address.</p><button className="primary-button" onClick={onReset}>Clear filters</button></div> : <>
      <div className="map-plane" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <svg className="connection-lines" width={size.width} height={size.height} aria-hidden="true">
          {showLinks && links.map(link => {
            const a = byAddress.get(link.source), b = byAddress.get(link.target);
            if (!a || !b) return null;
            const highlighted = selected && (link.source === selected.toLowerCase() || link.target === selected.toLowerCase());
            return <line key={`${link.source}-${link.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={highlighted ? 'connection-line highlighted' : 'connection-line'} />;
          })}
        </svg>
        {nodes.map(node => <button key={node.address} type="button"
          className={`bubble bubble-${holderKind(node)} ${selected === node.address ? 'is-selected' : ''} ${selectedLinks.has(node.address.toLowerCase()) ? 'is-related' : ''}`}
          style={{ left: node.x, top: node.y, width: node.radius * 2, height: node.radius * 2 }}
          data-holder-address={node.address.toLowerCase()}
          aria-label={`Holder ${node.rank}, ${node.name ? `${node.name}, ` : ''}${node.address}, ${formatShare(node.share)} of supply, ${node.isContract ? 'contract' : 'wallet'}, ${node.links} observed ${node.links === 1 ? 'connection' : 'connections'}`}
          aria-pressed={selected === node.address}
          aria-describedby={hovered === node.address ? 'bubble-tooltip' : undefined}
          onMouseEnter={() => showTooltip(node.address)} onMouseLeave={hideTooltip}
          onFocus={() => { showTooltip(node.address); if (zoom > 1) setPan({ x: (size.width / 2 - node.x) * zoom, y: (size.height / 2 - node.y) * zoom }); }} onBlur={hideTooltip}
          onClick={() => { onSelect(node.address); setHovered(null); }}>
          {node.radius >= 40 * fontScale ? <><span className="bubble-address">{shortAddress(node.address)}</span><strong>{formatShare(node.share)}</strong>{node.radius >= 70 * fontScale && <span className="bubble-type">{node.isContract ? 'Contract' : 'Wallet'}</span>}</> : <span className="bubble-rank">{node.rank}</span>}
        </button>)}
      </div>
      {active && <div id="bubble-tooltip" role="tooltip" className="bubble-tooltip" onMouseEnter={() => showTooltip(active.address)} onMouseLeave={hideTooltip} style={{ left: Math.max(12, Math.min(size.width - 232, activeX - 110)), top: Math.max(12, Math.min(size.height - 116, activeY - active.radius * zoom - 104 < 12 ? activeY + active.radius * zoom + 12 : activeY - active.radius * zoom - 104)) }}>
        <strong>{active.name || `Holder #${active.rank}`}</strong><span className="mono">{shortAddress(active.address)}</span>
        <span>{formatAmount(active.balance, token.decimals)} {token.symbol} · {formatShare(active.share)}</span>
        <span>{active.links} observed {active.links === 1 ? 'connection' : 'connections'}</span>
      </div>}
    </>}
    <div className="map-watermark" aria-hidden="true"><span className="mini-mark"><i /><i /><i /></span> IMD Atlas</div>
    <div className="map-zoom" role="group" aria-label="Map controls">
      <button aria-label="Zoom out" disabled={zoom === 1} onClick={() => { setZoom(z => Math.max(1, z - 0.25)); setPan({ x: 0, y: 0 }); }}><Minus size={16} /></button>
      <button aria-label="Reset map view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Scan size={16} /></button>
      <button aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom(z => Math.min(2, z + 0.25))}><Plus size={16} /></button>
    </div>
  </div>;
}
