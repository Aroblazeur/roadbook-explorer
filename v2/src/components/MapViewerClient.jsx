"use client";

import dynamic from "next/dynamic";

const MapViewer = dynamic(() => import("./MapViewer"), { ssr: false });

export default function MapViewerClient(props) {
  return <MapViewer {...props} />;
}
