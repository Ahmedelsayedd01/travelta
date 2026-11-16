import { useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/lib/theme';

/** react-native-webview ships class-component typings that @types/react 19.3 resolves to `never`; the runtime is fine. */
const RNWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView> }>;

export interface GeoPoint { lat: number; lng: number }
export interface MapMarker { id: string; geo: GeoPoint; kind: 'price' | 'place' | 'pin'; label?: string; title: string; placeKind?: 'attraction' | 'airport' | 'transit' | 'neighborhood' }

/**
 * Map provider abstraction (same as web): OpenStreetMap-compatible raster tiles, no API key. Leaflet runs inside a
 * WebView so iOS and Android behave the same without native map SDK keys; markers and selection sync over postMessage.
 */
const TILE_URL = process.env.EXPO_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; OpenStreetMap contributors';

function html(colors: { primary: string; onPrimary: string; surface: string; fg: string; border: string; secondary: string; highlight: string }) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#m{margin:0;height:100%;background:#e5e7eb;font:12px -apple-system,Roboto,sans-serif}
.p{transform:translate(-50%,-100%);white-space:nowrap;border-radius:999px;border:1px solid ${colors.border};background:${colors.surface};color:${colors.fg};padding:4px 10px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.25)}
.sel .p{background:${colors.primary};color:${colors.onPrimary};border-color:${colors.primary}}
.pl{display:grid;place-items:center;width:22px;height:22px;border-radius:999px;background:${colors.secondary};color:#fff;font-size:11px}
.pin{width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${colors.highlight};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)}
#off{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;color:#334155}</style></head>
<body><div id="m"></div><div id="off">Map unavailable — check the connection.</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var send=function(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o))};
if(!window.L){document.getElementById('off').style.display='flex';send({type:'offline'});}
else{
var G={'attraction':'★','airport':'✈','transit':'⇄','neighborhood':'◎'};
var map=L.map('m',{zoomControl:true}).setView([30.04,31.23],12);
L.tileLayer(${JSON.stringify(TILE_URL)},{maxZoom:19,attribution:${JSON.stringify(ATTRIBUTION)}}).on('tileerror',function(){send({type:'tileerror'})}).addTo(map);
var layer=L.layerGroup().addTo(map),byId={};
window.render=function(s){layer.clearLayers();byId={};var pts=[];
 s.markers.forEach(function(m){var h=m.kind==='price'?'<div class="p">'+m.label+'</div>':m.kind==='pin'?'<div class="pin"></div>':'<div class="pl">'+(G[m.placeKind]||'★')+'</div>';
  var mk=L.marker([m.geo.lat,m.geo.lng],{icon:L.divIcon({html:h,className:'',iconSize:null,iconAnchor:m.kind==='pin'?[13,26]:m.kind==='place'?[11,11]:[0,0]}),title:m.title,zIndexOffset:m.kind==='place'?-500:0});
  mk.on('click',function(){send({type:'select',id:m.id})});mk.addTo(layer);byId[m.id]=mk;if(m.kind!=='place')pts.push([m.geo.lat,m.geo.lng]);});
 if(s.fit&&pts.length>1)map.fitBounds(pts,{padding:[30,30],maxZoom:15});else map.setView([s.center.lat,s.center.lng],s.zoom);
 window.select(s.selectedId);};
window.select=function(id){Object.keys(byId).forEach(function(k){var e=byId[k].getElement();if(e)e.classList.toggle('sel',k===id);byId[k].setZIndexOffset(k===id?1000:0)});
 if(id&&byId[id])map.panTo(byId[id].getLatLng());};
send({type:'ready'});}
</script></body></html>`;
}

export function MapView({ center, zoom, markers, selectedId, onSelect, fit, style, label, testID }: {
  center: GeoPoint; zoom: number; markers: MapMarker[]; selectedId?: string | null; onSelect?: (id: string) => void; fit?: boolean; style?: ViewStyle; label: string; testID?: string;
}) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const source = useMemo(() => ({ html: html({ primary: c.primary, onPrimary: c['on-primary'], surface: c.surface, fg: c.fg, border: c['border-strong'], secondary: c.secondary, highlight: c.highlight }) }), [c]);
  const state = JSON.stringify({ center, zoom, markers, selectedId: selectedId ?? null, fit: Boolean(fit) });
  const markerKey = markers.map((m) => `${m.id}:${m.geo.lat}:${m.geo.lng}:${m.label ?? ''}`).join('|');
  // Rebuild markers when the set changes; selection alone only re-highlights.
  useEffect(() => { if (ready) ref.current?.injectJavaScript(`window.render(${state});true;`); }, [ready, markerKey, center.lat, center.lng, zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) ref.current?.injectJavaScript(`window.select(${JSON.stringify(selectedId ?? null)});true;`); }, [ready, selectedId]);
  const onMessage = (e: WebViewMessageEvent) => {
    const msg = JSON.parse(e.nativeEvent.data) as { type: string; id?: string };
    if (msg.type === 'ready') setReady(true);
    else if (msg.type === 'offline') setOffline(true);
    else if (msg.type === 'select' && msg.id) onSelect?.(msg.id);
  };
  return (
    <View style={[{ height: 260, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border, backgroundColor: c.subtle }, style]} accessibilityLabel={label} testID={testID}>
      <RNWebView ref={ref} source={source} originWhitelist={['*']} onMessage={onMessage} javaScriptEnabled scrollEnabled={false} style={{ backgroundColor: 'transparent' }}
        setSupportMultipleWindows={false} nestedScrollEnabled />
      {offline && <View style={{ position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: c['warning-bg'], padding: 8, borderRadius: 8 }}><Text size="xs" style={{ color: c.warning }}>{t('maps.tilesUnavailable')}</Text></View>}
    </View>
  );
}
