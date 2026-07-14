"use client";

import { useEffect, useRef } from "react";

export default function MapViewer({ gpxUrl, height = 300 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (mapRef.current) return;

    let cancelled = false;
    let mapInstance = null;
    let traceLayer = null;

    async function init() {
      const container = containerRef.current;
      if (!container) return;
      const L = await import("leaflet");
      if (cancelled || containerRef.current !== container) return;

      mapInstance = L.map(container, {
        scrollWheelZoom: false,
        tap: true,
      });
      mapRef.current = mapInstance;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(mapInstance);

      if (!gpxUrl) {
        mapInstance.setView([46.5, 2], 5);
        return;
      }

      let points = [];
      try {
        const res = await fetch(gpxUrl, {
          headers: { Accept: "application/gpx+xml,application/xml" },
        });
        const xmlText = await res.text();
        const doc = new DOMParser().parseFromString(xmlText, "application/xml");

        const extract = (tag) => {
          const list = [];
          const nodes = doc.getElementsByTagName(tag);
          for (const node of nodes) {
            const lat = Number(node.getAttribute("lat"));
            const lng = Number(node.getAttribute("lon"));
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              list.push([lat, lng]);
            }
          }
          return list;
        };

        const trkpt = extract("trkpt");
        const rtept = extract("rtept");
        const wpt = extract("wpt");

        points = trkpt.length > 1 ? trkpt
          : rtept.length > 1 ? rtept
          : trkpt.length === 1 ? trkpt
          : rtept.length === 1 ? rtept
          : wpt;
      } catch {
        points = [];
      }

      if (cancelled) return;

      if (points.length > 1) {
        traceLayer = L.polyline(points, {
          color: "#2e7d32",
          weight: 4,
          opacity: 0.9,
        }).addTo(mapInstance);
        mapInstance.fitBounds(traceLayer.getBounds(), { padding: [24, 24] });
      } else if (points.length === 1) {
        mapInstance.setView(points[0], 13);
      } else {
        mapInstance.setView([46.5, 2], 5);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (mapInstance) {
        mapInstance.remove();
        if (mapRef.current === mapInstance) mapRef.current = null;
      }
    };
  }, [gpxUrl]);

  return <div ref={containerRef} style={{ width: "100%", height, borderRadius: 4 }} />;
}
