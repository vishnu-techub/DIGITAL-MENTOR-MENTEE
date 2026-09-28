import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import { Sparkles, Check, X, RefreshCw } from 'lucide-react';

interface GrammarAssistFieldProps {
  label: string;
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  fieldId?: string;
}

export const GrammarAssistField: React.FC<GrammarAssistFieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  required = false,
  fieldId,
}) => {
  const [checking, setChecking] = useState(false);
  const [suggestedCorrection, setSuggestedCorrection] = useState<string | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [lastCheckedValue, setLastCheckedValue] = useState('');
  const [appliedFeedback, setAppliedFeedback] = useState(false);
  const debounceTimerRef = useRef<any>(null);

  // Debounced check (900ms) after mentor stops typing
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed === lastCheckedValue || trimmed.length < 5) {
      setSuggestedCorrection(null);
      setShowSuggestion(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.counselling.checkGrammar(trimmed);
        if (res.success && res.data && res.data.hasCorrections) {
          const corrected = res.data.corrected.trim();
          if (corrected !== trimmed) {
            setSuggestedCorrection(corrected);
            setLastCheckedValue(trimmed);
          } else {
            setSuggestedCorrection(null);
          }
        } else {
          setSuggestedCorrection(null);
        }
      } catch (err) {
        // Silent fail on background debounce
      }
    }, 900);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [value, lastCheckedValue]);

  // Manual trigger
  const handleManualCheck = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setChecking(true);
    try {
      const res = await api.counselling.checkGrammar(trimmed);
      if (res.success && res.data && res.data.hasCorrections) {
        setSuggestedCorrection(res.data.corrected.trim());
        setShowSuggestion(true);
      } else {
        setSuggestedCorrection(null);
        setShowSuggestion(false);
      }
    } catch (err) {
      // Fallback
    } finally {
      setChecking(false);
    }
  };

  const handleUseCorrection = () => {
    if (suggestedCorrection) {
      onChange(suggestedCorrection);
      setSuggestedCorrection(null);
      setShowSuggestion(false);
      setAppliedFeedback(true);
      setTimeout(() => setAppliedFeedback(false), 2000);
    }
  };

  const handleKeepOriginal = () => {
    setSuggestedCorrection(null);
    setShowSuggestion(false);
  };

  return (
    <div className="form-group grammar-assist-container" style={{ marginBottom: '1.15rem' }}>
      {/* Label and Fix Grammar trigger */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
        <label htmlFor={fieldId} className="form-label" style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>
          {label} {required && <span style={{ color: '#DC2626' }}>*</span>}
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {appliedFeedback && (
            <span style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 700 }}>
              ✓ Correction Applied
            </span>
          )}

          {suggestedCorrection && !showSuggestion && (
            <button
              type="button"
              onClick={() => setShowSuggestion(true)}
              className="btn btn-sm"
              style={{
                backgroundColor: '#EFF6FF',
                color: '#1D4ED8',
                border: '1px solid #BFDBFE',
                padding: '0.2rem 0.6rem',
                fontSize: '0.74rem',
                fontWeight: 700,
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                cursor: 'pointer',
              }}
              title="Grammar or spelling suggestions available"
            >
              <Sparkles size={12} color="#1D4ED8" /> Fix Grammar
            </button>
          )}

          {value.trim().length > 4 && !suggestedCorrection && !showSuggestion && (
            <button
              type="button"
              onClick={handleManualCheck}
              disabled={checking}
              className="btn btn-sm"
              style={{
                background: 'transparent',
                color: '#64748B',
                border: 'none',
                padding: '0.2rem 0.4rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
              }}
              title="Check spelling and grammar"
            >
              {checking ? (
                <>
                  <RefreshCw size={11} className="spin" /> Checking...
                </>
              ) : (
                'Improve Writing'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Input Textarea */}
      <textarea
        id={fieldId}
        className="form-control"
        rows={rows}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          fontSize: '0.88rem',
          lineHeight: 1.5,
          borderRadius: '8px',
          borderColor: showSuggestion ? '#93C5FD' : '#CBD5E1',
          transition: 'border-color 0.15s ease',
        }}
      />

      {/* Inline Grammar Correction Suggestion Card */}
      {showSuggestion && suggestedCorrection && (
        <div
          className="grammar-suggestion-card"
          style={{
            marginTop: '0.5rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: '8px',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.4rem' }}>
            <Sparkles size={14} color="#0284C7" />
            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#0369A1', textTransform: 'uppercase' }}>
              Writing Assistant Suggestion
            </span>
          </div>

          <div style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}>
            <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 600 }}>Original:</div>
            <div style={{ color: '#475569', fontStyle: 'italic', marginBottom: '0.35rem' }}>
              "{value}"
            </div>

            <div style={{ color: '#0369A1', fontSize: '0.74rem', fontWeight: 700 }}>Corrected Version:</div>
            <div style={{ color: '#0C4A6E', fontWeight: 600 }}>
              "{suggestedCorrection}"
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleUseCorrection}
              className="btn btn-sm btn-primary"
              style={{
                backgroundColor: '#0284C7',
                borderColor: '#0284C7',
                color: '#ffffff',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.25rem 0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                cursor: 'pointer',
              }}
            >
              <Check size={13} /> Use Correction
            </button>

            <button
              type="button"
              onClick={handleKeepOriginal}
              className="btn btn-sm btn-secondary"
              style={{
                fontSize: '0.75rem',
                padding: '0.25rem 0.65rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                cursor: 'pointer',
              }}
            >
              <X size={13} /> Keep Original
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
