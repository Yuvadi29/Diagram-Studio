"use client";
import { useEffect, useState, type RefObject } from "react";

/** Largest width/height with the given aspect ratio that fits inside the element. */
export function useFitBox(ref: RefObject<HTMLElement | null>, aspect: number, padding = 0) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = Math.max(0, el.clientWidth - padding * 2);
      const h = Math.max(0, el.clientHeight - padding * 2);
      if (!w || !h) return;
      const width = Math.min(w, h * aspect);
      setSize({ width: Math.floor(width), height: Math.floor(width / aspect) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, aspect, padding]);
  return size;
}
