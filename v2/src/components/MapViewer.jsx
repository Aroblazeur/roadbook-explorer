"use client";

import { useEffect, useRef } from "react";

export default function MapViewer({ gpxUrl, height = 300 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (mapRef.current) return;

    let cancelled = false;
    let mapInstance = null;
    let resizeObserver = null;

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

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => mapInstance?.invalidateSize({ animate: false }));
        resizeObserver.observe(container);
      }

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(mapInstance);

      if (!gpxUrl) {
        mapInstance.setView([46.5, 2], 5);
        return;
      }

      let tracePoints = [];
      let waypoints = [];
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

        const childText = (node, tag) => {
          const value = node.getElementsByTagName(tag)[0]?.textContent;
          return typeof value === "string" ? value.trim() : "";
        };

        const waypointFromNode = node => {
          const lat = Number(node.getAttribute("lat"));
          const lng = Number(node.getAttribute("lon"));
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            lat,
            lng,
            name: childText(node, "name"),
            description: childText(node, "desc") || childText(node, "cmt"),
            type: childText(node, "type") || childText(node, "sym"),
          };
        };

        const standardWaypoints = Array.from(doc.getElementsByTagName("wpt"))
          .map(waypointFromNode)
          .filter(Boolean);
        const namedRouteOrTrackPoints = ["rtept", "trkpt"].flatMap(tag =>
          Array.from(doc.getElementsByTagName(tag))
            .map(waypointFromNode)
            .filter(point => point && (point.name || point.description || point.type))
        );
        const seenWaypoints = new Set();
        waypoints = [...standardWaypoints, ...namedRouteOrTrackPoints].filter(point => {
          const key = `${point.lat.toFixed(7)}:${point.lng.toFixed(7)}:${point.name}`;
          if (seenWaypoints.has(key)) return false;
          seenWaypoints.add(key);
          return true;
        });

        const trkpt = extract("trkpt");
        const rtept = extract("rtept");
        tracePoints = trkpt.length > 1 ? trkpt
          : rtept.length > 1 ? rtept
          : trkpt.length === 1 ? trkpt
          : rtept;
      } catch {
        tracePoints = [];
        waypoints = [];
      }

      if (cancelled) return;

      const fittedLayers = [];
      if (tracePoints.length > 1) {
        const traceLayer = L.polyline(tracePoints, {
          color: "#2e7d32",
          weight: 4,
          opacity: 0.9,
        }).addTo(mapInstance);
        fittedLayers.push(traceLayer);
      } else if (tracePoints.length === 1) {
        const tracePoint = L.circleMarker(tracePoints[0], {
          radius: 5,
          color: "#1b5e20",
          fillColor: "#43a047",
          fillOpacity: 1,
          weight: 2,
        }).addTo(mapInstance);
        fittedLayers.push(tracePoint);
      }

      waypoints.forEach((waypoint, index) => {
        const marker = L.circleMarker([waypoint.lat, waypoint.lng], {
          radius: 7,
          color: "#ffffff",
          fillColor: "#d84315",
          fillOpacity: 1,
          weight: 2,
        }).addTo(mapInstance);
        const name = waypoint.name || `Point d’intérêt ${index + 1}`;
        marker.bindTooltip(name, { direction: "top", offset: [0, -7] });

        const popup = document.createElement("div");
        popup.className = "gpx-waypoint-popup";
        const title = document.createElement("strong");
        title.textContent = name;
        popup.appendChild(title);
        if (waypoint.type) {
          const type = document.createElement("span");
          type.textContent = waypoint.type;
          popup.appendChild(type);
        }
        if (waypoint.description) {
          const description = document.createElement("p");
          description.textContent = waypoint.description;
          popup.appendChild(description);
        }
        marker.bindPopup(popup);
        fittedLayers.push(marker);
      });

      if (fittedLayers.length > 0) {
        const bounds = L.featureGroup(fittedLayers).getBounds();
        if (bounds.isValid()) mapInstance.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
      } else {
        mapInstance.setView([46.5, 2], 5);
      }
    }

    init();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (mapInstance) {
        mapInstance.remove();
        if (mapRef.current === mapInstance) mapRef.current = null;
      }
    };
  }, [gpxUrl]);

  return <div ref={containerRef} style={{ width: "100%", height, borderRadius: 4 }} />;
}
