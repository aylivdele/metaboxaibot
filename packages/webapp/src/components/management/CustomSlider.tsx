import { useRef } from "react";

/** Half of the thumb's CSS width — must match .custom-slider__thumb width: 20px */
const THUMB_RADIUS = 10;

interface CustomSliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

// Telegram WebApp API — may be absent outside Telegram or on older versions
const twa =
  typeof window !== "undefined"
    ? (
        window as unknown as {
          Telegram?: {
            WebApp?: { disableVerticalSwipes?: () => void; enableVerticalSwipes?: () => void };
          };
        }
      ).Telegram?.WebApp
    : undefined;

export function CustomSlider({ min, max, step, value, onChange }: CustomSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const percent = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));

  const valueFromX = (clientX: number): number => {
    const el = containerRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    // Active track spans from THUMB_RADIUS to rect.width - THUMB_RADIUS (matching padding-inline)
    const ratio = Math.max(
      0,
      Math.min(1, (clientX - rect.left - THUMB_RADIUS) / (rect.width - THUMB_RADIUS * 2)),
    );
    const raw = min + ratio * (max - min);
    const snapped = Math.round((raw - min) / step) * step + min;
    return Math.max(min, Math.min(max, +snapped.toFixed(10)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    twa?.disableVerticalSwipes?.();
    onChange(valueFromX(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) return;
    onChange(valueFromX(e.clientX));
  };

  const onPointerUp = () => {
    twa?.enableVerticalSwipes?.();
  };

  return (
    <div
      ref={containerRef}
      className="custom-slider"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="custom-slider__track">
        <div className="custom-slider__fill" style={{ width: `${percent * 100}%` }} />
      </div>
      {/* Thumb center aligns with fill end: offset by THUMB_RADIUS on each side */}
      <div
        className="custom-slider__thumb"
        style={{
          left: `calc(${THUMB_RADIUS}px + ${percent} * (100% - ${THUMB_RADIUS * 2}px))`,
        }}
      />
    </div>
  );
}
