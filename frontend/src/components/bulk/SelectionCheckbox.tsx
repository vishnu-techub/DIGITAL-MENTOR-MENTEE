import React, { useEffect, useRef } from 'react';

interface SelectionCheckboxProps {
  checked: boolean;
  /** Renders the native "mixed" (dash) state. Ignored when `checked` is true. */
  indeterminate?: boolean;
  onChange: () => void;
  /** Accessible label; required because these boxes have no visible text label. */
  'aria-label': string;
  disabled?: boolean;
}

/**
 * A checkbox sized for both mouse and touch targets, with a real
 * `indeterminate` state (which React only exposes through the DOM node, so it is
 * set via a ref). Used for the per-row selection boxes and the header
 * select-all box on the Student Master and Faculty / Mentors tables.
 */
export const SelectionCheckbox: React.FC<SelectionCheckboxProps> = ({
  checked,
  indeterminate = false,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}) => {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !checked && indeterminate;
  }, [checked, indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="bulk-checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
    />
  );
};
