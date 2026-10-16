import { createPathComponent, extendContext, type LeafletContextInterface } from '@react-leaflet/core';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

interface MarkerClusterGroupProps {
  options?: L.MarkerClusterGroupOptions;
  children?: React.ReactNode;
}

// Defaults for every map that clusters noise readings, so a page that passes no
// options (the Overview mini-map) is still tuned. MapPage passes its overrides.
const DEFAULT_OPTIONS: L.MarkerClusterGroupOptions = {
  maxClusterRadius: 40,
  disableClusteringAtZoom: 15,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: true,
  animate: false,
  animateAddingMarkers: false,
  removeOutsideVisibleBounds: true,
};

function createCluster(props: MarkerClusterGroupProps, context: LeafletContextInterface) {
  const { options } = props;
  // chunkedLoading is forced OFF: markercluster's own chunk loop cannot be
  // cancelled, so replacing the markers mid-load would re-add stale ones or throw
  // on a removed group. NoiseMarkers chunks its own bulk adds and can cancel them.
  const cluster = L.markerClusterGroup({ ...DEFAULT_OPTIONS, ...options, chunkedLoading: false });
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
