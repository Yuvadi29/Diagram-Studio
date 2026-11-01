"use client";
import { createContext, useContext, useEffect, useRef, useState, type RefObject } from "react";

/** One page-wide switch for every looping animation (plus prefers-reduced-motion). */
const MotionContext = createContext<{ paused: boolean; reduced: boolean; toggle: () => void }>({ paused: false, reduced: false, toggle: () => undefined });

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return <MotionContext.Provider value={{ paused: paused || reduced, reduced, toggle: () => setPaused((p) => !p) }}>{children}</MotionContext.Provider>;
}

export function useMotion() {
  return useContext(MotionContext);
}

export function MotionToggle() {
  const { paused, reduced, toggle } = useMotion();
  if (reduced) return null;
  return (
    <button type="button" className="lp-motion-toggle" onClick={toggle} aria-pressed={paused}>
      {paused ? "Play animations" : "Pause animations"}
    </button>
  );
}

/** True while the element is on screen (so off-screen demos don't burn CPU). */
export function useInView<T extends Element>(ref: RefObject<T | null>, rootMargin = "100px") {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

/** A clock (ms) that advances only while playing and visible. */
export function useClock(running: boolean) {
  const [t, setT] = useState(0);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!running) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (last.current !== null) {
        const dt = Math.min(64, now - last.current);
        setT((v) => v + dt);
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  return [t, setT] as const;
}
