import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Check } from 'lucide-react';

export const COUNSELLING_5_CATEGORIES = [
  'Academic Development',
  'Skill Development',
  'Career Development',
  'Personal Development',
  'Extra-Curricular Activities',
] as const;

export type CounsellingCategoryType = (typeof COUNSELLING_5_CATEGORIES)[number];

interface CounsellingCategorySelectProps {
  selectedCategories: string[];
  onChange: (categories: string[]) => void;
  required?: boolean;
  error?: string;
}

export const CounsellingCategorySelect: React.FC<CounsellingCategorySelectProps> = ({
  selectedCategories = [],
  onChange,
  required = true,
  error,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleToggleCategory = (category: string) => {
    if (selectedCategories.includes(category)) {
      onChange(selectedCategories.filter((c) => c !== category));
    } else {
      onChange([...selectedCategories, category]);
    }
  };

  const handleRemoveCategory = (category: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedCategories.filter((c) => c !== category));
  };

  return (
    <div className="form-group" ref={containerRef} style={{ marginBottom: '1.15rem', position: 'relative' }}>
      <label
        className="form-label"
        style={{
          display: 'block',
          fontWeight: 700,
          fontSize: '0.85rem',
          color: '#0F172A',
          marginBottom: '0.45rem',
        }}
      >
        Counselling Category {required && <span style={{ color: '#DC2626' }}>*</span>}
      </label>

      {/* Selected Categories Chips */}
      {selectedCategories.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.45rem',
            marginBottom: '0.55rem',
          }}
        >
          {selectedCategories.map((cat) => (
            <span
              key={cat}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                backgroundColor: '#EFF6FF',
                color: '#1D4ED8',
                border: '1px solid #BFDBFE',
                borderRadius: '8px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <span>{cat}</span>
              <button
                type="button"
                onClick={(e) => handleRemoveCategory(cat, e)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1D4ED8',
                  borderRadius: '50%',
                  width: '18px',
                  height: '18px',
                }}
                aria-label={`Remove ${cat}`}
                title={`Remove ${cat}`}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: '0.78rem', color: '#DC2626', marginBottom: '0.4rem', fontWeight: 600 }}>
          At least one counselling category must be selected.
        </div>
      )}

      {/* Dropdown Toggle Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="form-control"
        style={{
          width: '100%',
          minHeight: '44px',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#F8FAFC',
          border: '1px solid #CBD5E1',
          borderRadius: '8px',
          padding: '0.5rem 0.85rem',
          cursor: 'pointer',
          fontSize: '0.86rem',
          color: selectedCategories.length > 0 ? '#0F172A' : '#64748B',
        }}
      >
        <span>
          {selectedCategories.length === 0
            ? 'Choose Counselling Categories...'
            : `${selectedCategories.length} category${selectedCategories.length > 1 ? 'ies' : ''} selected`}
        </span>
        <ChevronDown
          size={16}
          color="#64748B"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        />
      </button>

      {/* Dropdown Panel with ONLY the 5 Categories */}
      {isOpen && (
        <div
          style={{
            position: 'relative',
            marginTop: '0.35rem',
            backgroundColor: '#ffffff',
            border: '1px solid #CBD5E1',
            borderRadius: '10px',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.1)',
            padding: '0.5rem',
            zIndex: 50,
          }}
        >
          <div
            style={{
              fontSize: '0.74rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#64748B',
              padding: '0.35rem 0.5rem 0.45rem',
              borderBottom: '1px solid #F1F5F9',
              marginBottom: '0.35rem',
            }}
          >
            Dropdown Categories (Select One or Multiple)
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {COUNSELLING_5_CATEGORIES.map((cat, idx) => {
              const isChecked = selectedCategories.includes(cat);
              const checkboxId = `cat-opt-${idx}`;
              return (
                <label
                  key={cat}
                  htmlFor={checkboxId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: isChecked ? '#F0F9FF' : 'transparent',
                    transition: 'background-color 0.12s ease',
                    minHeight: '40px',
                    userSelect: 'none',
                  }}
                >
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleCategory(cat)}
                    style={{
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer',
                      accentColor: '#1D4ED8',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: isChecked ? 700 : 500,
                      color: isChecked ? '#1E40AF' : '#1E293B',
                      flex: 1,
                    }}
                  >
                    {cat}
                  </span>
                  {isChecked && <Check size={15} color="#1D4ED8" />}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
