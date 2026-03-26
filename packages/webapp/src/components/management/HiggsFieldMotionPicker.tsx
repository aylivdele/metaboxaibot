import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import type { HiggsFieldMotion } from "../../types.js";

export interface MotionEntry {
  id: string;
  strength: number;
}

interface HiggsFieldMotionPickerProps {
  value: MotionEntry[];
  onChange: (motions: MotionEntry[]) => void;
}

const MULTI_WORD_CATEGORIES = [
  "Crash Zoom",
  "Whip Pan",
  "Bullet Time",
  "360 Orbit",
  "3D Rotation",
  "Dutch Angle",
  "FPV Drone",
  "Focus Change",
  "Through Object",
  "Object POV",
  "Lazy Susan",
  "Hero Cam",
  "Robo Arm",
  "Eating Zoom",
];

function getCategory(motion: HiggsFieldMotion): string {
  if (motion.category) return motion.category;
  for (const cat of MULTI_WORD_CATEGORIES) {
    if (motion.name.startsWith(cat)) return cat;
  }
  return motion.name.split(" ")[0];
}

export function HiggsFieldMotionPicker({ value, onChange }: HiggsFieldMotionPickerProps) {
  const [motions, setMotions] = useState<HiggsFieldMotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    setLoading(true);
    api.higgsfieldMotions
      .list()
      .then(setMotions)
      .catch(() => setMotions([]))
      .finally(() => setLoading(false));
  }, []);

  const categories = ["all", ...Array.from(new Set(motions.map(getCategory))).sort()];

  const filtered =
    activeCategory === "all" ? motions : motions.filter((m) => getCategory(m) === activeCategory);

  const isSelected = (id: string) => value.some((e) => e.id === id);

  const getStrength = (id: string) => value.find((e) => e.id === id)?.strength ?? 0.7;

  const toggle = (motion: HiggsFieldMotion) => {
    if (isSelected(motion.id)) {
      onChange(value.filter((e) => e.id !== motion.id));
    } else {
      onChange([...value, { id: motion.id, strength: 0.7 }]);
    }
  };

  const setStrength = (id: string, strength: number) => {
    onChange(value.map((e) => (e.id === id ? { ...e, strength } : e)));
  };

  if (loading) {
    return <div className="motion-picker__loading">Загрузка пресетов…</div>;
  }

  if (motions.length === 0) {
    return <div className="motion-picker__empty">Пресеты не найдены</div>;
  }

  return (
    <div className="motion-picker">
      <div className="motion-picker__categories">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`motion-picker__cat-btn${activeCategory === cat ? " motion-picker__cat-btn--active" : ""}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat === "all" ? "Все" : cat}
          </button>
        ))}
      </div>

      <div className="motion-picker__list">
        {filtered.map((motion) => {
          const selected = isSelected(motion.id);
          const strength = getStrength(motion.id);
          return (
            <div
              key={motion.id}
              className={`motion-picker__item${selected ? " motion-picker__item--selected" : ""}`}
              onClick={() => toggle(motion)}
            >
              <div className="motion-picker__item-header">
                <span className="motion-picker__item-check">{selected ? "✓" : ""}</span>
                <span className="motion-picker__item-name">{motion.name}</span>
                {motion.preview_url && (
                  <a
                    className="motion-picker__preview-btn"
                    href={motion.preview_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Превью"
                  >
                    ▶
                  </a>
                )}
              </div>
              {motion.description && (
                <span className="motion-picker__item-desc">{motion.description}</span>
              )}
              {selected && (
                <div className="motion-picker__strength" onClick={(e) => e.stopPropagation()}>
                  <span className="motion-picker__strength-label">Сила: {strength.toFixed(2)}</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={strength}
                    className="motion-picker__strength-slider"
                    onChange={(e) => setStrength(motion.id, parseFloat(e.target.value))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {value.length > 0 && (
        <div className="motion-picker__summary">
          Выбрано: {value.length} пресет{value.length === 1 ? "" : value.length < 5 ? "а" : "ов"}
        </div>
      )}
    </div>
  );
}
