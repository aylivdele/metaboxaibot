import { useRef } from "react";

interface CustomSliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

export function CustomSlider({ min, max, step, value, onChange }: CustomSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const percent = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));

  const valueFromX = (clientX: number): number => {
    const el = containerRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    const snapped = Math.round((raw - min) / step) * step + min;
    return Math.max(min, Math.min(max, +snapped.toFixed(10)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(valueFromX(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) return;
    onChange(valueFromX(e.clientX));
  };

  return (
    <div
      ref={containerRef}
      className="custom-slider"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <div className="custom-slider__track">
        <div className="custom-slider__fill" style={{ width: `${percent * 100}%` }} />
      </div>
      <div className="custom-slider__thumb" style={{ left: `${percent * 100}%` }} />
    </div>
  );
}
