'use client';

import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { mapProvider } from './provider';

export interface GeoPoint { lat: number; lng: number }
export interface MapBounds { south: number; west: number; north: number; east: number }
export type PlaceKind = 'attraction' | 'airport' | 'transit' | 'neighborhood';

export interface MapMarker {
  id: string;
  geo: GeoPoint;
  /** 'price' = pill with a label (hotel results), 'place' = small icon for points of interest, 'pin' = the subject. */
  kind: 'price' | 'place' | 'pin';
  label?: string;
  /** Accessible name and hover preview. */
  title: string;
  /** HTML shown in the hover tooltip (desktop). Plain text is escaped by the caller. */
  preview?: string;
  placeKind?: PlaceKind;
}

export interface MapViewProps {
  center: GeoPoint;
  zoom: number;
  markers: MapMarker[];
  selectedId?: string | null;
  hoveredId?: string | null;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
  /** Fired after the user pans or zooms (not after programmatic moves). */
  onBoundsChange?: (b: MapBounds) => void;
  /** Coordinate picker: clicking the map or dragging the pin reports the new point. */
  onPick?: (g: GeoPoint) => void;
  /** Fit the view to all price/pin markers whenever their set changes. */
  fitMarkers?: boolean;
  label: string;
  className?: string;
  testId?: string;
  tilesUnavailableText: string;
}

const PLACE_GLYPH: Record<PlaceKind, string> = { attraction: '★', airport: '✈', transit: '⇄', neighborhood: '◎' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Interactive map (Leaflet + OSM-compatible tiles via `mapProvider`). Leaflet is loaded on the client only.
 * Markers are real DOM buttons with names, so they are keyboard- and screen-reader reachable; when tiles fail to
 * load the markers still render on a neutral background and a notice explains the missing base map.
 */
export function MapView({
  center, zoom, markers, selectedId, hoveredId, onSelect, onHover, onBoundsChange, onPick, fitMarkers, label, className, testId, tilesUnavailableText,
}: MapViewProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const byId = useRef(new Map<string, Leaflet.Marker>());
  const programmatic = useRef(false);
  const cb = useRef({ onSelect, onHover, onBoundsChange, onPick });
  const [ready, setReady] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);

  useEffect(() => { cb.current = { onSelect, onHover, onBoundsChange, onPick }; });

  // Create the map once.
  useEffect(() => {
    let disposed = false;
    const markersById = byId.current;
    void import('leaflet').then((mod) => {
      if (disposed || !el.current || map.current) return;
      const leaflet = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      L.current = leaflet;
      const m = leaflet.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true }).setView([center.lat, center.lng], zoom);
      let failures = 0;
      leaflet.tileLayer(mapProvider.tileUrl, { attribution: mapProvider.attribution, maxZoom: mapProvider.maxZoom })
        .on('tileerror', () => { failures += 1; if (failures >= 4) setTilesFailed(true); })
        .on('tileload', () => { failures = 0; setTilesFailed(false); })
        .addTo(m);
      layer.current = leaflet.layerGroup().addTo(m);
      m.on('moveend', () => {
        if (programmatic.current) { programmatic.current = false; return; }
        const b = m.getBounds();
        cb.current.onBoundsChange?.({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
      });
      m.on('click', (e: Leaflet.LeafletMouseEvent) => cb.current.onPick?.({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) }));
      map.current = m;
      setReady(true);
    });
    return () => {
      disposed = true;
      // Stop any pan/zoom animation first: removing Leaflet mid-animation throws (_leaflet_pos).
      map.current?.stop();
      map.current?.off();
      map.current?.remove();
      map.current = null;
      markersById.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once; centre/zoom changes are applied below
  }, []);

  // Recentre when the requested centre changes (new destination, new pick).
  useEffect(() => {
    if (!ready || !map.current) return;
    programmatic.current = true;
    map.current.setView([center.lat, center.lng], zoom, { animate: false });
  }, [ready, center.lat, center.lng, zoom]);

  // (Re)build markers.
  const markerKey = markers.map((m) => `${m.id}:${m.geo.lat}:${m.geo.lng}:${m.label ?? ''}`).join('|');
  useEffect(() => {
    const leaflet = L.current;
    if (!ready || !leaflet || !layer.current || !map.current) return;
    layer.current.clearLayers();
    byId.current.clear();
    for (const mk of markers) {
      const html = mk.kind === 'price'
        ? `<span class="tv-map-price">${esc(mk.label ?? '')}</span>`
        : mk.kind === 'place'
          ? `<span class="tv-map-place tv-map-place--${mk.placeKind ?? 'attraction'}" aria-hidden="true">${PLACE_GLYPH[mk.placeKind ?? 'attraction']}</span>`
          : '<span class="tv-map-pin" aria-hidden="true"></span>';
      const icon = leaflet.divIcon({
        html, className: 'tv-map-marker', iconSize: undefined,
        iconAnchor: mk.kind === 'pin' ? [14, 28] : mk.kind === 'place' ? [12, 12] : undefined,
      });
      const marker = leaflet.marker([mk.geo.lat, mk.geo.lng], {
        icon, title: mk.title, keyboard: mk.kind !== 'place', riseOnHover: true, draggable: mk.kind === 'pin' && Boolean(cb.current.onPick),
        zIndexOffset: mk.kind === 'place' ? -500 : mk.kind === 'pin' ? 1000 : 0,
      });
      marker.on('click', () => cb.current.onSelect?.(mk.id));
      marker.on('mouseover', () => cb.current.onHover?.(mk.id));
      marker.on('mouseout', () => cb.current.onHover?.(null));
      marker.on('dragend', () => { const p = marker.getLatLng(); cb.current.onPick?.({ lat: round6(p.lat), lng: round6(p.lng) }); });
      if (mk.preview || mk.kind === 'place') marker.bindTooltip(mk.preview ?? esc(mk.title), { direction: 'top', offset: [0, -14], opacity: 1, className: 'tv-map-tooltip' });
      marker.addTo(layer.current);
      const node = marker.getElement();
      if (node) {
        node.dataset.markerId = mk.id;
        node.dataset.markerKind = mk.kind;
        if (mk.kind === 'place') { node.setAttribute('aria-hidden', 'true'); node.removeAttribute('tabindex'); node.removeAttribute('role'); }
        else { node.setAttribute('role', 'button'); node.setAttribute('aria-label', mk.title); }
      }
      byId.current.set(mk.id, marker);
    }
    if (fitMarkers) {
      const pts = markers.filter((m) => m.kind !== 'place').map((m) => [m.geo.lat, m.geo.lng] as [number, number]);
      if (pts.length > 1) { programmatic.current = true; map.current.fitBounds(pts, { padding: [36, 36], maxZoom: 15, animate: false }); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markerKey captures every marker change
  }, [ready, markerKey, fitMarkers]);

  // Selection / hover highlight, kept in sync with the list.
  useEffect(() => {
    for (const [id, marker] of byId.current) {
      const node = marker.getElement();
      if (!node) continue;
      const selected = id === selectedId;
      node.classList.toggle('is-selected', selected);
      node.classList.toggle('is-hovered', id === hoveredId && !selected);
      if (node.dataset.markerKind !== 'place') node.setAttribute('aria-pressed', String(selected));
      marker.setZIndexOffset(selected ? 2000 : id === hoveredId ? 1500 : node.dataset.markerKind === 'place' ? -500 : 0);
    }
    const sel = selectedId ? byId.current.get(selectedId) : undefined;
    if (sel && map.current && !map.current.getBounds().pad(-0.1).contains(sel.getLatLng())) {
      programmatic.current = true;
      map.current.panTo(sel.getLatLng(), { animate: true });
    }
  }, [selectedId, hoveredId, ready, markerKey]);

  return (
    <div className={cn('relative isolate overflow-hidden rounded-lg border border-border bg-subtle', className)} data-testid={testId} data-ready={ready ? 'true' : 'false'}>
      <div ref={el} className="tv-map size-full" role="region" aria-label={label} />
      {tilesFailed && (
        <p role="status" className="absolute inset-x-3 top-3 z-[1000] rounded-md bg-warning-bg px-3 py-2 text-xs font-medium text-warning shadow-sm" data-testid="map-tiles-failed">
          {tilesUnavailableText}
        </p>
      )}
    </div>
  );
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
