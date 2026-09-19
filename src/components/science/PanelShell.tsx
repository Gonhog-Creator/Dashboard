"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  image?: string | null;
  imageAlt: string;
  onClose: () => void;
  children: ReactNode;
}

const WIDTH_KEY = "science.sidebarWidth";
const MIN_W = 300;
const MAX_W = 720;
const DEFAULT_W = 400;

/**
 * Right-edge info sidebar shared by the facility + spacecraft panels.
 * Slides in on mount; image header fades into the body; content scrolls.
 * select-text so news headlines stay copyable inside the select-none scene.
 */
export function PanelShell({ image, imageAlt, onClose, children }: Props) {
  const [imgOk, setImgOk] = useState(!!image);
  const [shown, setShown] = useState(false);
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_W;
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return saved >= MIN_W && saved <= MAX_W ? saved : DEFAULT_W;
  });
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // drag the left edge to resize; persists for every sidebar
  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startW = widthRef.current;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => {
      const w = Math.min(MAX_W, Math.max(MIN_W, startW + (startX - ev.clientX)));
      widthRef.current = w;
      setWidth(w);
      localStorage.setItem(WIDTH_KEY, String(w));
    };
    const up = () => {
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);

  return (
    <aside
      className="absolute inset-y-0 right-0 z-30 flex select-text flex-col border-l border-white/10"
      style={{
        width,
        background: "rgba(10,14,22,0.94)",
        backdropFilter: "blur(14px)",
        transform: shown ? "translateX(0)" : "translateX(40px)",
        opacity: shown ? 1 : 0,
        transition: dragging
          ? "opacity .3s"
          : "transform .3s cubic-bezier(.2,.8,.3,1), opacity .3s",
      }}
    >
      {/* resize handle — drag the left edge */}
      <div
        onPointerDown={startDrag}
        className="group absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize"
        title="Drag to resize"
      >
        <div
          className="absolute inset-y-0 left-0 w-px transition-colors group-hover:bg-sky-400/60"
          style={{ background: dragging ? "rgba(56,189,248,0.8)" : undefined }}
        />
      </div>
      {imgOk && image && (
        <div className="relative aspect-[2/1] w-full shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={imageAlt}
            className="h-full w-full object-cover"
            onError={() => setImgOk(false)}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, transparent 55%, rgba(10,14,22,0.95))",
            }}
          />
        </div>
      )}

      <button
        onClick={onClose}
        className="absolute right-3 top-3 z-10 rounded-full bg-black/55 p-1.5 text-neutral-300 backdrop-blur transition-colors hover:bg-black/80 hover:text-white"
        aria-label="Close"
      >
        <X size={15} />
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
