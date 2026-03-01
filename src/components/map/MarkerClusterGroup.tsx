import { createPathComponent } from '@react-leaflet/core';
import L, { DivIcon, MarkerCluster } from 'leaflet';
import 'leaflet.markercluster';

interface MarkerClusterGroupProps {
  children?: React.ReactNode;
}

// Create cluster component
const MarkerClusterGroup = createPathComponent<L.MarkerClusterGroup, MarkerClusterGroupProps>(
  (_props, context) => {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      disableClusteringAtZoom: 14,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: true,
      iconCreateFunction: (cluster: MarkerCluster): DivIcon => {
        const markers = cluster.getAllChildMarkers();
        let totalDb = 0;
        let count = 0;

        markers.forEach(marker => {
          const reading = (marker as unknown as { reading?: { decibelLevel?: number } }).reading;
          if (reading?.decibelLevel) {
            totalDb += reading.decibelLevel;
            count++;
          }
        });

        const avgDb = count > 0 ? totalDb / count : 0;
        let color = '#4CAF50';
        if (avgDb >= 50 && avgDb <= 70) color = '#FF9800';
        if (avgDb > 70) color = '#F44336';

        return L.divIcon({
          html: `<div style="background-color: ${color}; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; border: 2px solid white;">${cluster.getChildCount()}</div>`,
          className: 'marker-cluster-custom',
          iconSize: [40, 40],
        });
      },
    });

    return { instance: cluster, context };
  }
);

export default MarkerClusterGroup;
