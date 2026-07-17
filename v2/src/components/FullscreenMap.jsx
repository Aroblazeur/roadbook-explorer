"use client";

import { useEffect, useRef, useState } from "react";

function ExpandIcon({ active }) {
  return active ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
    </svg>
  );
}

export default function FullscreenMap({ children, label = "Ouvrir la carte en plein écran" }) {
  const containerRef = useRef(null);
  const [nativeActive, setNativeActive] = useState(false);
  const [fallbackActive, setFallbackActive] = useState(false);
  const active = nativeActive || fallbackActive;

  useEffect(() => {
    const handleFullscreenChange = () => setNativeActive(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!fallbackActive) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = event => {
      if (event.key === "Escape") setFallbackActive(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [fallbackActive]);

  const toggleFullscreen = async () => {
    if (fallbackActive) {
      setFallbackActive(false);
      return;
    }
    if (document.fullscreenElement === containerRef.current) {
      await document.exitFullscreen?.();
      return;
    }
    try {
      if (!containerRef.current?.requestFullscreen) throw new Error("fullscreen-api-unavailable");
      await containerRef.current.requestFullscreen();
    } catch {
      setFallbackActive(true);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`map-fullscreen${fallbackActive ? " map-fullscreen--fallback" : ""}`}
      data-fullscreen-active={active ? "true" : "false"}
    >
      {children}
      <button
        type="button"
        className="map-fullscreen__button"
        onClick={toggleFullscreen}
        aria-label={active ? "Quitter le plein écran" : label}
        title={active ? "Quitter le plein écran" : label}
      >
        <ExpandIcon active={active} />
      </button>
    </div>
  );
}
