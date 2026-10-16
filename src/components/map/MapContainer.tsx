import { useEffect } from 'react';
import { MapContainer as LeafletMapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { SRI_LANKA_BOUNDS, SRI_LANKA_CENTER } from '@/lib/mapBounds';

/** Where to fly the map. A new object (new `id`) flies again, even to the same spot. */
export interface FlyToTarget {
  id: number;
  lat: number;
  lng: number;
  zoom?: number;
}

interface MapComponentProps {
  children?: React.ReactNode;
  flyTo?: FlyToTarget | null;
}

/** Flies to the target whenever a new one arrives ("Current location", ux-6). */
function FlyToController({ target }: { target: FlyToTarget | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], target.zoom ?? 14);
    // Keyed on the request id: a re-render with the same request must not fly again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, target?.id]);
  return null;
}

/**
 * Leaflet only re-measures on window resize. The container can also change
 * size without one (the sidebar opens or closes, the filter panel pushes
 * layout), which leaves grey strips and a misplaced attribution until the next
 * interaction. Observe the container and call invalidateSize().
 */
function ResizeSync() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => map.invalidateSize());
    });
    observer.observe(map.getContainer());
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);
  return null;
}

/**
 * MapComponent - Leaflet map container centered on Sri Lanka
 * 
 * Features:
 * - Sri Lanka bounding box: lat 5.9-9.9, lon 79.5-82.0
 * - Zoom levels: 6-18
 * - OpenStreetMap tiles
 * - Fills its parent: the parent must give it a height (ux-4)
 */
export function MapComponent({ children, flyTo }: MapComponentProps) {
  return (
    <LeafletMapContainer
      center={SRI_LANKA_CENTER}
      zoom={7}
      minZoom={6}
      maxZoom={18}
      maxBounds={SRI_LANKA_BOUNDS}
      maxBoundsViscosity={1.0}
      className="h-full w-full z-0"
      style={{ overflow: 'visible' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <ResizeSync />
      <FlyToController target={flyTo} />
      {children}
    </LeafletMapContainer>
  );
}
