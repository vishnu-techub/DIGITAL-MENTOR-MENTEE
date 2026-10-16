import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';

/**
 * ============================================================================
 * MultiSelect — searchable, keyboard-accessible multi-select with chips
 * ============================================================================
 *
 * A controlled component used by the Admin Subject form (departments, semesters,
 * academic years, regulations). It renders the selected values as removable
 * chips, offers select-all / clear-all, filters a long list through a search
 * box, and — when `creatable` — lets the user add a value that is not already in
 * the list (used for academic years and regulations, which are free-form in the
 * rest of the system).
 *
 * Accessibility: the control is an ARIA combobox wrapping a multi-selectable
 * listbox. Arrow keys move a highlight, Enter/Space toggles, Escape closes,
 * Backspace removes the last chip, and focus never leaves the combobox.
 */

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Optional secondary text shown to the right of the label. */
  hint?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  id?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  error?: boolean;
  ariaLabel?: string;
  /** Allow adding a typed value that is not in `options`. */
  creatable?: boolean;
  /** Normalise a typed value before storing (creatable only). */
  normaliseCustom?: (raw: string) => string;
  /** Return an error message for an invalid typed value, or null when valid. */
  validateCustom?: (raw: string) => string | null;
  /** Label for the "add" row. */
  addLabel?: (raw: string) => string;
  /** Collapse chips beyond this many into a "+N more" indicator. */
  maxVisibleChips?: number;
  emptyText?: string;
  selectAllLabel?: string;
  clearAllLabel?: string;
  /** Only show the search box once there are at least this many options. */
  searchThreshold?: number;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  value,
  onChange,
  id,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  disabled = false,
  error = false,
  ariaLabel,
  creatable = false,
  normaliseCustom,
  validateCustom,
  addLabel,
  maxVisibleChips = 6,
  emptyText = 'No options',
  selectAllLabel = 'Select all',
  clearAllLabel = 'Clear all',
  searchThreshold = 6,
}) => {
  const reactId = useId();
  const baseId = id ?? `ms-${reactId.replace(/[:]/g, '')}`;
  const listboxId = `${baseId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [placement, setPlacement] = useState<'down' | 'up'>('down');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [options, query]);

  const trimmedQuery = query.trim();
  const normalisedCustom = trimmedQuery ? (normaliseCustom ? normaliseCustom(trimmedQuery) : trimmedQuery) : '';
  const customError = creatable && normalisedCustom ? validateCustom?.(normalisedCustom) ?? null : null;
  const showAdd =
    creatable &&
    trimmedQuery !== '' &&
    !options.some((o) => o.value.toLowerCase() === normalisedCustom.toLowerCase()) &&
    !selected.has(normalisedCustom);

  // The rows the keyboard can walk: the filtered options, then the add row.
  const rowCount = filtered.length + (showAdd && !customError ? 1 : 0);

  // ── open/close + outside-click ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setHighlight(0);
      // Flip the panel upward when there is not enough room below the control
      // (the subject form lives inside a scrolling modal).
      const rect = containerRef.current?.getBoundingClientRect();
      const spaceBelow = rect ? window.innerHeight - rect.bottom : Infinity;
      setPlacement(spaceBelow < 320 ? 'up' : 'down');
      // Focus the search box on open (but not on touch, where it would summon
      // the keyboard immediately).
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    setQuery('');
  }, [open]);

  useEffect(() => {
    if (highlight >= rowCount) setHighlight(Math.max(0, rowCount - 1));
  }, [rowCount, highlight]);

  const selectedOptions = useMemo(() => {
    // Preserve the order the user selected values in.
    return value
      .map((v) => options.find((o) => o.value === v) ?? { value: v, label: v })
      .filter(Boolean);
  }, [value, options]);

  const commit = (next: string[]) => {
    // De-duplicate defensively; the UI should never add a duplicate.
    const unique: string[] = [];
    for (const v of next) if (!unique.includes(v)) unique.push(v);
    onChange(unique);
  };

  const toggle = (optionValue: string) => {
    if (selected.has(optionValue)) commit(value.filter((v) => v !== optionValue));
    else commit([...value, optionValue]);
  };

  const remove = (optionValue: string) => commit(value.filter((v) => v !== optionValue));

  const addCustom = () => {
    if (!normalisedCustom || customError) return;
    if (!selected.has(normalisedCustom)) commit([...value, normalisedCustom]);
    setQuery('');
    searchRef.current?.focus();
  };

  const selectAll = () => {
    const pool = trimmedQuery ? filtered : options;
    const additions = pool.map((o) => o.value).filter((v) => !selected.has(v));
    if (additions.length > 0) commit([...value, ...additions]);
  };

  const clearAll = () => commit([]);

  // ── keyboard ───────────────────────────────────────────────────────────────
  const onControlKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
  };

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlight((h) => Math.min(rowCount - 1, h + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlight((h) => Math.max(0, h - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (showAdd && !customError && highlight === filtered.length) addCustom();
        else if (filtered[highlight]) toggle(filtered[highlight].value);
        else if (showAdd && !customError) addCustom();
        break;
      case 'Backspace':
        if (query === '' && value.length > 0) {
          e.preventDefault();
          remove(value[value.length - 1]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  const visibleChips = selectedOptions.slice(0, maxVisibleChips);
  const hiddenCount = selectedOptions.length - visibleChips.length;
  const showSearch = options.length >= searchThreshold || creatable;

  return (
    <div
      className="ms"
      ref={containerRef}
      style={{ position: 'relative' }}
      data-disabled={disabled || undefined}
    >
      <div
        id={baseId}
        className={`ms-control${error ? ' is-error' : ''}${disabled ? ' is-disabled' : ''}${open ? ' is-open' : ''}`}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onControlKeyDown}
      >
        <div className="ms-chips">
          {selectedOptions.length === 0 ? (
            <span className="ms-placeholder">{placeholder}</span>
          ) : (
            visibleChips.map((o) => (
              <span className="ms-chip" key={o.value}>
                <span className="ms-chip-label">{o.label}</span>
                <button
                  type="button"
                  className="ms-chip-x"
                  aria-label={`Remove ${o.label}`}
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(o.value);
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            ))
          )}
          {hiddenCount > 0 && <span className="ms-chip ms-chip--more">+{hiddenCount} more</span>}
        </div>
        <span className="ms-caret" aria-hidden="true">
          <ChevronDown size={16} />
        </span>
      </div>

      {open && !disabled && (
        <div className={`ms-panel${placement === 'up' ? ' ms-panel--up' : ''}`} role="presentation">
          {showSearch && (
            <div className="ms-search">
              <Search size={14} aria-hidden="true" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-autocomplete="list"
                aria-controls={listboxId}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={onSearchKeyDown}
              />
            </div>
          )}

          <div className="ms-actions">
            <button
              type="button"
              className="ms-action"
              onClick={selectAll}
              disabled={disabled}
            >
              {selectAllLabel}
            </button>
            <button
              type="button"
              className="ms-action"
              onClick={clearAll}
              disabled={disabled || value.length === 0}
            >
              {clearAllLabel}
            </button>
          </div>

          <ul className="ms-list" id={listboxId} role="listbox" aria-multiselectable="true">
            {filtered.length === 0 && !showAdd && <li className="ms-empty">{emptyText}</li>}
            {filtered.map((o, index) => {
              const isSelected = selected.has(o.value);
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={isSelected}
                  className={`ms-option${isSelected ? ' is-selected' : ''}${index === highlight ? ' is-highlighted' : ''}`}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(o.value)}
                >
                  <span className={`ms-check${isSelected ? ' is-on' : ''}`} aria-hidden="true">
                    {isSelected && <Check size={12} />}
                  </span>
                  <span className="ms-option-label">{o.label}</span>
                  {o.hint && <span className="ms-option-hint">{o.hint}</span>}
                </li>
              );
            })}

            {showAdd && (
              <li
                role="option"
                aria-selected={false}
                className={`ms-option ms-option--add${customError ? ' is-invalid' : ''}${
                  highlight === filtered.length ? ' is-highlighted' : ''
                }`}
                onMouseEnter={() => setHighlight(filtered.length)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={customError ? undefined : addCustom}
              >
                <span className="ms-check" aria-hidden="true">
                  <Plus size={12} />
                </span>
                <span className="ms-option-label">
                  {customError
                    ? customError
                    : addLabel
                    ? addLabel(normalisedCustom)
                    : `Add “${normalisedCustom}”`}
                </span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default MultiSelect;
