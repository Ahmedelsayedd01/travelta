import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import { createElement, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type ViewStyle } from 'react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/lib/theme';
import type { GeoPoint, MapMarker } from './map-view';

/**
 * Expo Web version of MapView. `react-native-webview` has no web implementation, so the browser build renders the
 * same Leaflet map (same OSM-compatible provider, same props) straight into the DOM. Native keeps map-view.tsx.
 */
const TILE_URL = process.env.EXPO_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const GLYPH = { attraction: '★', airport: '✈', transit: '⇄', neighborhood: '◎' } as const;
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export function MapView({ center, zoom, markers, selectedId, onSelect, fit, style, label, testID }: {
  center: GeoPoint; zoom: number; markers: MapMarker[]; selectedId?: string | null; onSelect?: (id: string) => void; fit?: boolean; style?: ViewStyle; label: string; testID?: string;
}) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const byId = useRef(new Map<string, Leaflet.Marker>());
  const L = useRef<typeof Leaflet | null>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  useEffect(() => { onSelectRef.current = onSelect; });

  useEffect(() => {
    let disposed = false;
    const markersById = byId.current;
    void import('leaflet').then((mod) => {
      if (disposed || !el.current) return;
      const leaflet = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
      L.current = leaflet;
      const m = leaflet.map(el.current).setView([center.lat, center.lng], zoom);
      let fails = 0;
      leaflet.tileLayer(TILE_URL, { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' })
        .on('tileerror', () => { fails += 1; if (fails >= 4) setTilesFailed(true); }).addTo(m);
      layer.current = leaflet.layerGroup().addTo(m);
      map.current = m;
      setReady(true);
    });
    return () => { disposed = true; map.current?.stop(); map.current?.remove(); map.current = null; markersById.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; centre/zoom applied below
  }, []);

  const key = markers.map((m) => `${m.id}:${m.geo.lat}:${m.geo.lng}:${m.label ?? ''}`).join('|');
  useEffect(() => {
    const leaflet = L.current;
    if (!ready || !leaflet || !layer.current || !map.current) return;
    layer.current.clearLayers();
    byId.current.clear();
    const pts: [number, number][] = [];
    for (const m of markers) {
      const html = m.kind === 'price'
        ? `<span style="display:inline-block;transform:translate(-50%,-100%);white-space:nowrap;border-radius:999px;border:1px solid ${c['border-strong']};background:${c.surface};color:${c.fg};padding:4px 10px;font:700 12px system-ui;box-shadow:0 2px 6px rgba(0,0,0,.25)" class="tvm-pill">${esc(m.label ?? '')}</span>`
        : m.kind === 'pin'
          ? `<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${c.highlight};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></span>`
          : `<span style="display:grid;place-items:center;width:22px;height:22px;border-radius:999px;background:${c.secondary};color:#fff;font-size:11px">${GLYPH[m.placeKind ?? 'attraction']}</span>`;
      const marker = leaflet.marker([m.geo.lat, m.geo.lng], {
        icon: leaflet.divIcon({ html, className: '', iconSize: undefined, iconAnchor: m.kind === 'pin' ? [13, 26] : m.kind === 'place' ? [11, 11] : [0, 0] }),
        title: m.title, keyboard: m.kind !== 'place', zIndexOffset: m.kind === 'place' ? -500 : 0,
      });
      marker.on('click', () => onSelectRef.current?.(m.id));
      marker.addTo(layer.current);
      const node = marker.getElement();
      if (node) { node.dataset.markerId = m.id; node.dataset.markerKind = m.kind; if (m.kind !== 'place') node.setAttribute('aria-label', m.title); }
      byId.current.set(m.id, marker);
      if (m.kind !== 'place') pts.push([m.geo.lat, m.geo.lng]);
    }
    if (fit && pts.length > 1) map.current.fitBounds(pts, { padding: [30, 30], maxZoom: 15, animate: false });
    else map.current.setView([center.lat, center.lng], zoom, { animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures marker changes
  }, [ready, key, center.lat, center.lng, zoom, fit]);

  useEffect(() => {
    for (const [id, marker] of byId.current) {
      const pill = marker.getElement()?.querySelector<HTMLElement>('.tvm-pill');
      const on = id === selectedId;
      marker.setZIndexOffset(on ? 1000 : 0);
      marker.getElement()?.classList.toggle('is-selected', on);
      if (pill) { pill.style.background = on ? c.primary : c.surface; pill.style.color = on ? c['on-primary'] : c.fg; pill.style.borderColor = on ? c.primary : c['border-strong']; }
    }
    const sel = selectedId ? byId.current.get(selectedId) : undefined;
    if (sel && map.current) map.current.panTo(sel.getLatLng());
  }, [selectedId, ready, key, c]);

  return (
    <View style={[{ height: 260, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border, backgroundColor: c.subtle }, style]} accessibilityLabel={label} testID={testID}>
      {createElement('div', { ref: el, style: { width: '100%', height: '100%' }, role: 'region', 'aria-label': label, 'data-ready': ready ? 'true' : 'false', 'data-testid': testID ? `${testID}-canvas` : undefined })}
      {tilesFailed && <View style={{ position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: c['warning-bg'], padding: 8, borderRadius: 8, zIndex: 1000 }}><Text size="xs" style={{ color: c.warning }}>{t('maps.tilesUnavailable')}</Text></View>}
    </View>
  );
}
