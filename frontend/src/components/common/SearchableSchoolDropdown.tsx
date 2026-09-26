import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import { api } from '../../api/client';

export interface SchoolItem {
  _id: string;
  schoolName: string;
  city: string;
  district: string;
  state?: string;
  schoolType?: string;
  schoolCode?: string;
  pincode?: string;
  displayName: string;
}

interface Props {
  value?: string | null;
  selectedSchool?: SchoolItem | null;
  initialSchoolName?: string;
  onChange: (school: SchoolItem | null) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  id?: string;
}

/* ─── tiny hook: is viewport ≤640px? ─────────────────────────── */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 640 : false));
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

/* ─── shared school fetch hook ───────────────────────────────── */
function useSchoolSearch(isOpen: boolean) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [loading, setLoading] = useState(false);

  // debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // fetch
  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    setLoading(true);
    api.schools
      .list({ search: debouncedSearch.trim(), limit: 25, isActive: true })
      .then((res) => {
        if (live) {
          setSchools(res.data?.schools || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) {
          setSchools([]);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [debouncedSearch, isOpen]);

  const reset = useCallback(() => {
    setSearchTerm('');
    setSchools([]);
  }, []);

  return { searchTerm, setSearchTerm, schools, loading, reset };
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export const SearchableSchoolDropdown: React.FC<Props> = ({
  value,
  selectedSchool,
  initialSchoolName = '',
  onChange,
  placeholder = 'Search or select school...',
  label,
  required = false,
  disabled = false,
  error,
  id,
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const isMobile = useIsMobile();

  const [isOpen, setIsOpen] = useState(false);
  const [activeSchool, setActiveSchool] = useState<SchoolItem | null>(selectedSchool || null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualInputValue, setManualInputValue] = useState(initialSchoolName || '');

  const containerRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { searchTerm, setSearchTerm, schools, loading, reset } = useSchoolSearch(isOpen);

  /* sync activeSchool and manualInputValue from props */
  useEffect(() => {
    if (selectedSchool) {
      setActiveSchool(selectedSchool);
      setManualInputValue(selectedSchool.displayName || selectedSchool.schoolName);
      return;
    }

    if (value && typeof value === 'string' && value.length === 24) {
      // Looks like a valid MongoDB ObjectId
      api.schools
        .getById(value)
        .then((res) => {
          if (res.data) {
            setActiveSchool(res.data);
            setManualInputValue(res.data.displayName || res.data.schoolName);
          } else if (initialSchoolName) {
            const fallback: SchoolItem = {
              _id: value,
              schoolName: initialSchoolName,
              displayName: initialSchoolName,
              city: '',
              district: '',
            };
            setActiveSchool(fallback);
            setManualInputValue(initialSchoolName);
          }
        })
        .catch(() => {
          if (initialSchoolName) {
            const fallback: SchoolItem = {
              _id: value,
              schoolName: initialSchoolName,
              displayName: initialSchoolName,
              city: '',
              district: '',
            };
            setActiveSchool(fallback);
            setManualInputValue(initialSchoolName);
          }
        });
    } else if (initialSchoolName) {
      const fallback: SchoolItem = {
        _id: value || '',
        schoolName: initialSchoolName,
        displayName: initialSchoolName,
        city: '',
        district: '',
      };
      setActiveSchool(fallback);
      setManualInputValue(initialSchoolName);
    } else if (!value) {
      setActiveSchool(null);
      setManualInputValue('');
    }
  }, [value, selectedSchool, initialSchoolName]);

  /* lock body scroll when mobile sheet is open */
  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile, isOpen]);

  /* close desktop dropdown on outside click */
  useEffect(() => {
    if (isMobile) return;
    const fn = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [isMobile]);

  const open = () => {
    if (disabled || isManualMode) return;
    reset();
    setIsOpen(true);
    setSelectedIndex(-1);
    setTimeout(() => {
      (isMobile ? mobileInputRef : desktopInputRef).current?.focus();
    }, 80);
  };

  const close = () => {
    setIsOpen(false);
    reset();
  };

  const handleSelect = (school: SchoolItem) => {
    setActiveSchool(school);
    setManualInputValue(school.displayName || school.schoolName);
    onChange(school);
    close();
  };

  const handleSelectCustom = (customName: string) => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    const customItem: SchoolItem = {
      _id: '',
      schoolName: trimmed,
      displayName: trimmed,
      city: '',
      district: '',
      schoolType: 'Custom Entry',
    };
    setActiveSchool(customItem);
    setManualInputValue(trimmed);
    onChange(customItem);
    close();
  };

  const handleClear = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveSchool(null);
    setManualInputValue('');
    onChange(null);
    reset();
    setIsOpen(false);
  };

  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setManualInputValue(val);
    if (!val.trim()) {
      setActiveSchool(null);
      onChange(null);
    } else {
      const customItem: SchoolItem = {
        _id: '',
        schoolName: val.trim(),
        displayName: val.trim(),
        city: '',
        district: '',
        schoolType: 'Custom Entry',
      };
      setActiveSchool(customItem);
      onChange(customItem);
    }
  };

  const switchToManual = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsManualMode(true);
    close();
    setTimeout(() => manualInputRef.current?.focus(), 80);
  };

  const switchToDropdown = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsManualMode(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        open();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const maxIdx = schools.length - 1;
      const next = Math.min(selectedIndex + 1, maxIdx);
      setSelectedIndex(next);
      listRef.current?.getElementsByTagName('li')[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(selectedIndex - 1, 0);
      setSelectedIndex(prev);
      listRef.current?.getElementsByTagName('li')[prev]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < schools.length) {
        handleSelect(schools[selectedIndex]);
      } else if (searchTerm.trim()) {
        handleSelectCustom(searchTerm.trim());
      }
    }
  };

  /* ── shared badge for school type ── */
  const typeBadge = (type?: string) => {
    if (!type) return null;
    const lc = type.toLowerCase();
    const bg = lc.includes('govt') ? '#dbeafe' : lc.includes('aided') ? '#fef3c7' : lc.includes('custom') ? '#f3e8ff' : '#f1f5f9';
    const color = lc.includes('govt') ? '#1e40af' : lc.includes('aided') ? '#92400e' : lc.includes('custom') ? '#7e22ce' : '#475569';
    return (
      <span
        style={{
          fontSize: '0.7rem',
          padding: '2px 7px',
          borderRadius: '4px',
          background: bg,
          color,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {type}
      </span>
    );
  };

  /* ── shared result list ── */
  const ResultList = ({ autoFocusRef }: { autoFocusRef: React.RefObject<HTMLInputElement | null> }) => {
    const hasSearch = searchTerm.trim().length > 0;
    return (
      <>
        {/* Search bar inside panel */}
        <div style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              ref={autoFocusRef}
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="🔍 Type school name, city, district..."
              style={{
                flex: 1,
                padding: '0.55rem 0.75rem',
                fontSize: '0.925rem',
                border: '1.5px solid #cbd5e1',
                borderRadius: '0.5rem',
                outline: 'none',
                background: '#fff',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  background: '#e2e8f0',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  color: '#475569',
                }}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '0.4rem',
              fontSize: '0.75rem',
              color: '#64748b',
            }}
          >
            <span>Can't find your school?</span>
            <button
              type="button"
              onClick={switchToManual}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563eb',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              ✏️ Enter manually instead
            </button>
          </div>
        </div>

        {/* Custom entry quick-action button if search term is typed */}
        {hasSearch && (
          <div
            onClick={() => handleSelectCustom(searchTerm.trim())}
            style={{
              padding: '0.65rem 1rem',
              backgroundColor: '#eff6ff',
              borderBottom: '1px solid #bfdbfe',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#dbeafe')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#eff6ff')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <span style={{ fontSize: '1rem' }}>✏️</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e40af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Use "{searchTerm.trim()}"
                </div>
                <div style={{ fontSize: '0.72rem', color: '#3b82f6' }}>
                  Click to select this as your custom school name
                </div>
              </div>
            </div>
            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: '#2563eb', color: '#fff', fontWeight: 600 }}>
              Select Custom
            </span>
          </div>
        )}

        <ul
          ref={listRef}
          role="listbox"
          style={{ listStyle: 'none', padding: 0, margin: 0, overflowY: 'auto', flex: 1, maxHeight: '280px' }}
        >
          {loading ? (
            <li style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
              ⏳ Searching school database...
            </li>
          ) : schools.length === 0 ? (
            <li style={{ padding: '1.5rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem', lineHeight: 1.6 }}>
              {hasSearch ? (
                <>
                  No pre-listed schools found matching "<strong>{searchTerm}</strong>".<br />
                  <button
                    type="button"
                    onClick={() => handleSelectCustom(searchTerm.trim())}
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.4rem 0.9rem',
                      backgroundColor: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '0.375rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    ➕ Use "{searchTerm.trim()}" as School Name
                  </button>
                </>
              ) : (
                'Type a school name, city, or district above to search.'
              )}
            </li>
          ) : (
            schools.map((school, idx) => {
              const isHighlighted = idx === selectedIndex;
              const isSelected = activeSchool?._id === school._id;
              return (
                <li
                  key={school._id || idx}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(school)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f1f5f9',
                    backgroundColor: isSelected ? '#eff6ff' : isHighlighted ? '#f8fafc' : 'transparent',
                    transition: 'background 0.1s',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b', wordBreak: 'break-word', flex: 1, lineHeight: 1.35 }}>
                      {school.schoolName}
                      {isSelected && <span style={{ marginLeft: '0.4rem', color: '#059669' }}>✓</span>}
                    </span>
                    {typeBadge(school.schoolType)}
                  </div>
                  {(school.city || school.district) && (
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      📍 {school.city ? `${school.city}, ` : ''}{school.district}{school.pincode ? ` — ${school.pincode}` : ''}
                    </div>
                  )}
                </li>
              );
            })
          )}
        </ul>

        <div
          style={{
            padding: '0.4rem 0.75rem',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            fontSize: '0.72rem',
            color: '#94a3b8',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>↑↓ to navigate • Enter to select • Esc to close</span>
          <span>Tamil Nadu Feeder Directory</span>
        </div>
      </>
    );
  };

  /* ── trigger button (shared display) ── */
  const triggerDisplay = (
    <div
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      aria-labelledby={inputId}
      tabIndex={disabled ? -1 : 0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      className="school-trigger"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.55rem 0.85rem',
        background: disabled ? '#f8fafc' : '#ffffff',
        border: error ? '1.5px solid #ef4444' : isOpen ? '1.5px solid #3b82f6' : '1px solid #cbd5e1',
        borderRadius: '0.5rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: isOpen ? '0 0 0 3px rgba(59,130,246,0.15)' : 'none',
        transition: 'all 0.15s ease',
        width: '100%',
        overflow: 'hidden',
        minHeight: '42px',
      }}
    >
      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🏫</span>

      {activeSchool ? (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeSchool.schoolName}
            </div>
            {(activeSchool.city || activeSchool.district) ? (
              <div style={{ fontSize: '0.75rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                📍 {activeSchool.city ? `${activeSchool.city}, ` : ''}{activeSchool.district}
              </div>
            ) : (
              <div style={{ fontSize: '0.72rem', color: '#7e22ce' }}>✓ Custom school name entered</div>
            )}
          </div>
          {!disabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleClear}
                title="Change or clear school"
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '3px 7px',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.background = '#fee2e2';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#64748b';
                  e.currentTarget.style.background = '#f1f5f9';
                }}
              >
                ✕ Clear
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
          <span style={{ color: '#94a3b8', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {placeholder}
          </span>
          <span style={{ color: '#64748b', fontSize: '0.75rem', flexShrink: 0, marginLeft: '0.5rem' }}>▼ Select</span>
        </div>
      )}
    </div>
  );

  /* ═══════════════ RENDER ═══════════════════════════════════════ */
  return (
    <div ref={containerRef} className="school-dropdown-wrapper" style={{ position: 'relative', width: '100%' }}>
      {/* Header with Mode Switching */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
        {label && (
          <label htmlFor={inputId} className="form-label" style={{ margin: 0 }}>
            {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
          </label>
        )}
        <button
          type="button"
          onClick={() => (isManualMode ? switchToDropdown() : switchToManual())}
          style={{
            background: 'none',
            border: 'none',
            color: '#2563eb',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '2px 4px',
            textDecoration: 'underline',
          }}
        >
          {isManualMode ? '🔍 Select from school list' : '✏️ Enter school manually'}
        </button>
      </div>

      {/* Manual text input mode */}
      {isManualMode ? (
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              ref={manualInputRef}
              id={inputId}
              type="text"
              className="form-control"
              value={manualInputValue}
              onChange={handleManualChange}
              placeholder="Type your complete school name and town..."
              disabled={disabled}
              style={{
                width: '100%',
                padding: '0.55rem 0.85rem',
                fontSize: '0.875rem',
                borderColor: error ? '#ef4444' : undefined,
              }}
            />
          </div>
          {manualInputValue && (
            <button
              type="button"
              onClick={() => handleClear()}
              style={{
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                padding: '0.55rem 0.75rem',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
                color: '#64748b',
                whiteSpace: 'nowrap',
              }}
              title="Clear entry"
            >
              ✕ Clear
            </button>
          )}
        </div>
      ) : (
        /* Searchable dropdown trigger */
        triggerDisplay
      )}

      {/* ── MOBILE: Full-screen bottom sheet ─────────────────────── */}
      {!isManualMode && isMobile && isOpen && (
        <div className="school-mobile-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="school-mobile-sheet">
            <div className="school-sheet-header">
              <div className="school-sheet-handle" />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>
                  Select or Enter School
                </span>
                <button
                  type="button"
                  onClick={close}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', color: '#64748b', cursor: 'pointer', padding: '4px' }}
                >
                  ✕
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <ResultList autoFocusRef={mobileInputRef} />
            </div>
          </div>
        </div>
      )}

      {/* ── DESKTOP: Floating dropdown panel ─────────────────────── */}
      {!isManualMode && !isMobile && isOpen && (
        <div
          className="school-desktop-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            backgroundColor: '#ffffff',
            borderRadius: '0.5rem',
            border: '1px solid #cbd5e1',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ResultList autoFocusRef={desktopInputRef} />
        </div>
      )}

      {/* Error message */}
      {error && (
        <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
          {error}
        </span>
      )}
    </div>
  );
};
