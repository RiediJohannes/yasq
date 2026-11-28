import { CSSProperties, Fragment } from 'preact';

export interface RadioOption<T> {
  label: string;
  value: T;
  className?: string;
  id?: string;
}

interface RadioGroupProps<T> {
  name: string;
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  groupId?: string;
  animationClass?: 'anim-smooth-glide' | 'anim-spring' | string;
}

export function RadioGroup<T extends string | number | boolean>({
  name,
  options,
  value,
  onChange,
  groupId,
  animationClass = '',
}: RadioGroupProps<T>) {
  const activeIndex = options.findIndex(opt => opt.value === value);
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;

  const style = {
    '--count': options.length,
    '--index': Math.max(0, activeIndex),
  } as CSSProperties;

  return (
    <div
      id={groupId}
      className={`button-group has-thumb ${animationClass}`}
      style={style}
    >
      {activeIndex >= 0 && (
        <span
          aria-hidden="true"
          className={`radio-thumb ${activeOption?.className || ''}`}
        />
      )}

      {options.map(opt => {
        const inputId = opt.id || `${name}-${opt.value}`;
        const isChecked = value === opt.value;

        return (
          <Fragment key={String(opt.value)}>
            <input
              type="radio"
              id={inputId}
              name={name}
              value={String(opt.value)}
              checked={isChecked}
              onChange={() => onChange(opt.value)}
            />
            <label
              htmlFor={inputId}
              className={`btn-radio ${opt.className || ''} ${isChecked ? 'active' : ''}`}
            >
              {opt.label}
            </label>
          </Fragment>
        );
      })}
    </div>
  );
}
