"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function ZoomableImage({ src, alt, className = "", buttonClassName = "", ...imageProps }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = event => { if (event.key === "Escape") setOpen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <>
    <button type="button" className={`zoomable-image ${buttonClassName}`.trim()} onClick={() => setOpen(true)} aria-label={`Agrandir : ${alt}`}>
      <img src={src} alt={alt} className={className} {...imageProps} />
      <span className="zoomable-image__hint" aria-hidden="true">⛶</span>
    </button>
    {open && createPortal(
      <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={alt} onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
        <button type="button" className="image-lightbox__close" onClick={() => setOpen(false)} aria-label="Fermer l’image agrandie" autoFocus>×</button>
        <img src={src} alt={alt} />
        {alt && <p>{alt}</p>}
      </div>,
      document.body,
    )}
  </>;
}
