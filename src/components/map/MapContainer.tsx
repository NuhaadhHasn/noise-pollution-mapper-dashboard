import { MapContainer as LeafletMapContainer, TileLayer } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';

// Sri Lanka bounds
const SRI_LANKA_BOUNDS: LatLngTuple[] = [
  [5.9, 79.5],  // Southwest corner
  [9.9, 82.0],  // Northeast corner
];

const SRI_LANKA_CENTER: LatLngTuple = [7.8731, 80.7718];

interface MapComponentProps {
  children?: React.ReactNode;
}

/**
 * MapComponent - Leaflet map container centered on Sri Lanka
 * 
 * Features:
 * - Sri Lanka bounding box: lat 5.9-9.9, lon 79.5-82.0
 * - Zoom levels: 6-18
 * - OpenStreetMap tiles
 * - Responsive height (400px mobile, 600px desktop)
 */
export function MapComponent({ children }: MapComponentProps) {
  return (
    <LeafletMapContainer
      center={SRI_LANKA_CENTER}
      zoom={7}
      minZoom={6}
      maxZoom={18}
      maxBounds={SRI_LANKA_BOUNDS}
      maxBoundsViscosity={1.0}
      className="w-full h-[400px] md:h-[600px] z-0"
      style={{ overflow: 'visible' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {children}
    </LeafletMapContainer>
  );
}
