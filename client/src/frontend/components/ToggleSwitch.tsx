interface ToggleSwitchProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export const ToggleSwitch = ({ id, label, checked, onChange, disabled = false, className = '' }: ToggleSwitchProps) => {
  return (
    <div class={`toggle-switch ${className}`}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.currentTarget.checked)}
      />
      <label for={id}>
        <span class="toggle-switch-track"></span>
        <span>{label}</span>
      </label>
    </div>
  );
};
