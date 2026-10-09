import React from 'react';
import { User, Users, Check } from 'lucide-react';

/**
 * WHO the mentor held this discussion with.
 *
 * Deliberately NOT mutually exclusive: a mentor regularly speaks with the
 * student and the parent together, so "Student" + "Parent" is a first-class
 * answer. At least one must be selected — the server refuses a save without it
 * rather than guessing, so the mentor is asked explicitly.
 */
export const DISCUSSION_PARTICIPANTS = ['student', 'parent'] as const;

export type DiscussionParticipant = (typeof DISCUSSION_PARTICIPANTS)[number];

interface DiscussionWithSelectProps {
  selected: DiscussionParticipant[];
  onChange: (next: DiscussionParticipant[]) => void;
  required?: boolean;
  error?: string;
}

const OPTIONS: Array<{
  value: DiscussionParticipant;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number | string; color?: string }>;
}> = [
  {
    value: 'student',
    label: 'Student',
    hint: 'Discussed directly with the mentee',
    icon: User,
  },
  {
    value: 'parent',
    label: 'Parent',
    hint: 'Discussed with the parent / guardian',
    icon: User,
  },
];

export const DiscussionWithSelect: React.FC<DiscussionWithSelectProps> = ({
  selected = [],
  onChange,
  required = true,
  error,
}) => {
  const toggle = (value: DiscussionParticipant) => {
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
    );
  };

  const both = selected.includes('student') && selected.includes('parent');

  return (
    <div className="form-group" style={{ marginBottom: '1.15rem' }}>
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
        Discussion With {required && <span style={{ color: '#DC2626' }}>*</span>}
      </label>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
        {OPTIONS.map((option) => {
          const Icon = both ? Users : option.icon;
          const isChecked = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              aria-pressed={isChecked}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
                flex: '1 1 190px',
                minHeight: '52px',
                padding: '0.6rem 0.85rem',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: '8px',
                border: `1.5px solid ${isChecked ? '#1D4ED8' : '#CBD5E1'}`,
                backgroundColor: isChecked ? '#EFF6FF' : '#F8FAFC',
                color: isChecked ? '#1E40AF' : '#334155',
                transition: 'all 0.12s ease',
              }}
            >
              <Icon size={17} color={isChecked ? '#1D4ED8' : '#64748B'} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '0.87rem', fontWeight: 700 }}>{option.label}</span>
                <span style={{ fontSize: '0.7rem', color: isChecked ? '#1D4ED8' : '#64748B' }}>
                  {option.hint}
                </span>
              </span>
              {isChecked && <Check size={15} color="#1D4ED8" />}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div
          style={{
            marginTop: '0.5rem',
            fontSize: '0.76rem',
            fontWeight: 600,
            color: both ? '#1E40AF' : '#475569',
          }}
        >
          {both
            ? 'Recorded as: Student & Parent'
            : `Recorded as: ${selected[0] === 'student' ? 'Student' : 'Parent'}`}
        </div>
      )}

      {required && selected.length === 0 && (
        <div style={{ fontSize: '0.78rem', color: '#DC2626', marginTop: '0.4rem', fontWeight: 600 }}>
          Select who this discussion was held with.
        </div>
      )}

      {error && (
        <div style={{ fontSize: '0.78rem', color: '#DC2626', marginTop: '0.4rem', fontWeight: 600 }}>
          {error}
        </div>
      )}
    </div>
  );
};