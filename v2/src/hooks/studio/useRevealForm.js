"use client";

import { useEffect, useRef } from "react";

export default function useRevealForm(revealKey) {
  const formRef = useRef(null);

  useEffect(() => {
    if (revealKey == null || revealKey === false) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const form = formRef.current;
      if (!form) return;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      form.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      const firstField = form.querySelector("[data-form-initial-focus], input:not([type='hidden']):not([disabled]), textarea:not([disabled]), select:not([disabled])");
      firstField?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [revealKey]);

  return formRef;
}
