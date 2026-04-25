import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import type { HiggsFieldMotion } from "../../types.js";
import { CustomSlider } from "./CustomSlider.js";
import { StyledSelect } from "./StyledSelect.js";

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

  const MAX_MOTIONS = 2;

  const toggle = (motion: HiggsFieldMotion) => {
    if (isSelected(motion.id)) {
      onChange(value.filter((e) => e.id !== motion.id));
    } else if (value.length < MAX_MOTIONS) {
      onChange([...value, { id: motion.id, strength: 0.7 }]);
    } else {
      // FIFO: drop the oldest selected preset, add the new one
      onChange([...value.slice(1), { id: motion.id, strength: 0.7 }]);
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
      <StyledSelect
        value={activeCategory}
        onChange={setActiveCategory}
        options={categories.map((cat) => ({
          value: cat,
          label: cat === "all" ? "Все категории" : cat,
        }))}
      />

      <div className="motion-picker__limit-notice">
        Можно выбрать не более {MAX_MOTIONS} пресетов. При выборе нового лишний будет заменён
        автоматически.
      </div>

      <div className="motion-picker__grid">
        {filtered.map((motion) => {
          const selected = isSelected(motion.id);
          const strength = getStrength(motion.id);
          return (
            <div
              key={motion.id}
              className={`motion-picker__item${selected ? " motion-picker__item--selected" : ""}`}
              onClick={() => toggle(motion)}
            >
              {motion.preview_url ? (
                <img
                  className="motion-picker__preview-img"
                  src={motion.preview_url}
                  alt={motion.name}
                />
              ) : (
                <div className="motion-picker__preview-img motion-picker__preview-placeholder">
                  🎬
                </div>
              )}
              <span className="motion-picker__item-name">{motion.name}</span>
              {selected && (
                <div className="motion-picker__strength" onClick={(e) => e.stopPropagation()}>
                  <span className="motion-picker__strength-label">Сила: {strength.toFixed(2)}</span>
                  <CustomSlider
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={strength}
                    onChange={(v) => setStrength(motion.id, v)}
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
