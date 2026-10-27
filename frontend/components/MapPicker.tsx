"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// a map where a tap places the delivery pin; the pin also follows the address search
export default function MapPicker({ lat, lon, onPick }: {
  lat: number | null;
  lon: number | null;
  onPick: (lat: number, lon: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.CircleMarker | null>(null);
  const pick = useRef(onPick);

  // always call the latest onPick, without rebuilding the map when it changes
  useEffect(() => {
    pick.current = onPick;
  });

  // create the map once
  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = L.map(box.current).setView([59.939, 30.3158], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap", // required by OpenStreetMap's terms
    }).addTo(map.current);
    map.current.on("click", (e: L.LeafletMouseEvent) => pick.current(e.latlng.lat, e.latlng.lng));
    return () => {
      map.current?.remove();
      map.current = null;
      pin.current = null;
    };
  }, []);

  // move (or create) the pin whenever the coordinates change, and zoom in on it
  useEffect(() => {
    if (!map.current || lat === null || lon === null) return;
    if (!pin.current) {
      // a circle rather than Leaflet's default marker image, which bundlers tend to break
      pin.current = L.circleMarker([lat, lon], { radius: 10, color: "#8c2f39", fillOpacity: 0.8 }).addTo(map.current);
    } else {
      pin.current.setLatLng([lat, lon]);
    }
    map.current.setView([lat, lon], Math.max(map.current.getZoom(), 15));
  }, [lat, lon]);

  // relative z-0: keeps Leaflet's internal layers below the bottom bar
  return <div ref={box} className="relative z-0 h-64 w-full overflow-hidden rounded-2xl border border-line" />;
}
