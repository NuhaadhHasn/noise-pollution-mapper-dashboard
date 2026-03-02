// Type declarations for leaflet.heat
// https://github.com/leaflet/leaflet.heat

import 'leaflet';

declare module 'leaflet' {
  interface HeatLayerOptions {
    radius?: number;
    blur?: number;
    maxZoom?: number;
    max?: number;
    minOpacity?: number;
    gradient?: { [key: number]: string };
    pane?: string;
  }

  interface HeatLayer extends L.Layer {
    setLatLngs(latlngs: Array<[number, number, number]>): HeatLayer;
    addLatLng(latlng: [number, number, number]): HeatLayer;
    getBounds(): L.LatLngBounds;
  }

  function heatLayer(latlngs: Array<[number, number, number]>, options?: HeatLayerOptions): HeatLayer;

  interface Leaflet {
    heatLayer: typeof heatLayer;
  }
}
