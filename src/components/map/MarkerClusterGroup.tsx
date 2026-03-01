import { createPathComponent, extendContext } from '@react-leaflet/core';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

interface MarkerClusterGroupProps {
  options?: L.MarkerClusterGroupOptions;
  children?: React.ReactNode;
}

function createCluster(props: MarkerClusterGroupProps, context: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { options } = props;
  const cluster = L.markerClusterGroup(options);
  return {
    instance: cluster,
    context: extendContext(context, { layerContainer: cluster }),
  };
}

function updateCluster() {
  // Update cluster options if needed
}

export const MarkerClusterGroup = createPathComponent<L.MarkerClusterGroup, MarkerClusterGroupProps>(createCluster, updateCluster);

export default MarkerClusterGroup;
