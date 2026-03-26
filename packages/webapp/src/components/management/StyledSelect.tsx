interface StyledSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  /** Extra class applied to the outer wrapper div */
  className?: string;
}

export function StyledSelect({ value, onChange, options, className }: StyledSelectProps) {
  return (
    <div className={`model-selector-wrap${className ? ` ${className}` : ""}`}>
      <select
        className="model-selector-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
