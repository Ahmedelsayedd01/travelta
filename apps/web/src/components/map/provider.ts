/**
 * Map provider abstraction. The app only knows "a raster tile URL + attribution"; switching to another
 * OpenStreetMap-compatible provider (or MapLibre later) is configuration, not code. No API secrets are used:
 * a keyed provider would be configured through NEXT_PUBLIC_MAP_TILE_URL at deploy time.
 */
export interface MapProvider {
  tileUrl: string;
  attribution: string;
  maxZoom: number;
}

export const mapProvider: MapProvider = {
  tileUrl: process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
};

export const directionsUrl = (lat: number, lng: number) => `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}#map=16/${lat}/${lng}`;
