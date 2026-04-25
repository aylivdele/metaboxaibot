interface StyledSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  /** Extra class applied to the outer wrapper div */
  className?: string;
  style?: React.CSSProperties;
}

export function StyledSelect({ value, onChange, options, className, style }: StyledSelectProps) {
  return (
    <div className={`model-selector-wrap${className ? ` ${className}` : ""}`} style={style}>
      <select
        className="model-selector-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
