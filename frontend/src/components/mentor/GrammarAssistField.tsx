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
  fieldId: string;
  error?: string;
  activeAiField?: string | null;
  onActiveFieldChange?: (fieldId: string | null) => void;
  onUseCorrection?: (fieldId: string, correctedText: string) => void;
}

export const GrammarAssistField: React.FC<GrammarAssistFieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  required = false,
  fieldId,
  error,
  activeAiField,
  onActiveFieldChange,
  onUseCorrection,
}) => {
  const [checking, setChecking] = useState(false);
  const [suggestedCorrection, setSuggestedCorrection] = useState<string | null>(null);
  const [capturedOriginal, setCapturedOriginal] = useState<string>('');
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [appliedFeedback, setAppliedFeedback] = useState(false);
  const [noIssuesFeedback, setNoIssuesFeedback] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const lastCheckedValueRef = useRef<string>('');
  const debounceTimerRef = useRef<any>(null);
  const feedbackTimerRef = useRef<any>(null);

  // Debounced check (900ms) after mentor stops typing
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed === lastCheckedValueRef.current || trimmed.length < 5) {
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.counselling.checkGrammar(trimmed);
        lastCheckedValueRef.current = trimmed;
        if (res.success && res.data && res.data.hasCorrections) {
          const corrected = res.data.corrected.trim();
          if (corrected && corrected !== trimmed) {
            setCapturedOriginal(trimmed);
            setSuggestedCorrection(corrected);
            setShowSuggestion(true);
            onActiveFieldChange?.(fieldId);
          } else {
            setSuggestedCorrection(null);
            setShowSuggestion(false);
          }
        } else {
          setSuggestedCorrection(null);
          setShowSuggestion(false);
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
  }, [value, fieldId, onActiveFieldChange]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  // Manual trigger
  const handleManualCheck = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setChecking(true);
    setCheckError(null);
    try {
      const res = await api.counselling.checkGrammar(trimmed);
      lastCheckedValueRef.current = trimmed;
      if (res.success && res.data && res.data.hasCorrections) {
        const corrected = res.data.corrected.trim();
        if (corrected && corrected !== trimmed) {
          setCapturedOriginal(trimmed);
          setSuggestedCorrection(corrected);
          setShowSuggestion(true);
          setNoIssuesFeedback(false);
          onActiveFieldChange?.(fieldId);
        } else {
          setSuggestedCorrection(null);
          setShowSuggestion(false);
          setNoIssuesFeedback(true);
          setTimeout(() => setNoIssuesFeedback(false), 2500);
        }
      } else {
        setSuggestedCorrection(null);
        setShowSuggestion(false);
        setNoIssuesFeedback(true);
        setTimeout(() => setNoIssuesFeedback(false), 2500);
      }
    } catch {
      // The field is left exactly as typed. Only a short, non-technical message
      // is shown; the server never sends API keys or provider internals.
      setSuggestedCorrection(null);
      setShowSuggestion(false);
      setCheckError("Couldn't check your text just now. Your text is unchanged — please try again.");
    } finally {
      setChecking(false);
    }
  };

  const handleUseCorrection = () => {
    if (!suggestedCorrection) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const corrected = suggestedCorrection;
    // Mark as checked to prevent re-triggering debounce on the newly applied text
    lastCheckedValueRef.current = corrected.trim();

    // Update parent React state (source of truth)
    if (onUseCorrection && fieldId) {
      onUseCorrection(fieldId, corrected);
    } else {
      onChange(corrected);
    }

    // Dismiss suggestion panel
    setShowSuggestion(false);
    setSuggestedCorrection(null);
    onActiveFieldChange?.(null);

    // Show "Correction applied" success feedback
    setAppliedFeedback(true);
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = setTimeout(() => {
      setAppliedFeedback(false);
    }, 3000);
  };

  const handleKeepOriginal = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    // Dismiss suggestion panel without modifying the textarea
    setShowSuggestion(false);
    setSuggestedCorrection(null);
    setCheckError(null);
    onActiveFieldChange?.(null);
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
            <span
              id={`applied-feedback-${fieldId}`}
              style={{
                fontSize: '0.75rem',
                color: '#16A34A',
                backgroundColor: '#DCFCE7',
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                border: '1px solid #BBF7D0',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              <Check size={12} color="#16A34A" /> Correction applied
            </span>
          )}

          {noIssuesFeedback && (
            <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
              ✓ No grammar issues
            </span>
          )}

          {suggestedCorrection && !showSuggestion && (
            <button
              type="button"
              onClick={() => {
                setShowSuggestion(true);
                onActiveFieldChange?.(fieldId);
              }}
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
              <Sparkles size={12} color="#1D4ED8" /> Improve Grammar
            </button>
          )}

          {value.trim().length >= 3 && !suggestedCorrection && !showSuggestion && (
            <button
              type="button"
              onClick={handleManualCheck}
              disabled={checking}
              className="btn btn-sm"
              style={{
                backgroundColor: '#F8FAFC',
                color: '#3B82F6',
                border: '1px solid #E2E8F0',
                padding: '0.2rem 0.6rem',
                fontSize: '0.74rem',
                fontWeight: 700,
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                transition: 'all 0.15s ease',
              }}
              title="Check spelling and grammar"
            >
              {checking ? (
                <>
                  <RefreshCw size={11} className="spin" /> Checking...
                </>
              ) : (
                <>
                  <Sparkles size={12} color="#3B82F6" /> Improve Grammar
                </>
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
        onChange={(e) => {
          setAppliedFeedback(false);
          setCheckError(null);
          onChange(e.target.value);
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          fontSize: '0.88rem',
          lineHeight: 1.5,
          borderRadius: '8px',
          borderColor: error ? '#EF4444' : showSuggestion ? '#93C5FD' : '#CBD5E1',
          transition: 'border-color 0.15s ease',
          resize: 'vertical',
          minHeight: '70px',
        }}
      />

      {error && (
        <div style={{ color: '#DC2626', fontSize: '0.78rem', marginTop: '4px', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {checkError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            color: '#B45309',
            backgroundColor: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderRadius: '6px',
            fontSize: '0.76rem',
            fontWeight: 600,
            marginTop: '0.35rem',
            padding: '0.3rem 0.55rem',
          }}
        >
          <span aria-hidden="true">⚠</span>
          {checkError}
        </div>
      )}

      {/* Inline Grammar Correction Suggestion Card */}
      {showSuggestion && suggestedCorrection && (
        <div
          className="grammar-suggestion-card"
          data-testid={`grammar-suggestion-${fieldId}`}
          style={{
            marginTop: '0.5rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: '8px',
            animation: 'fadeIn 0.15s ease-out',
            boxShadow: '0 2px 4px rgba(2, 132, 199, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.45rem' }}>
            <Sparkles size={14} color="#0284C7" />
            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Writing Assistant Suggestion
            </span>
          </div>

          <div style={{ fontSize: '0.84rem', marginBottom: '0.65rem' }}>
            <div style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.15rem' }}>
              Original:
            </div>
            <div style={{ color: '#475569', fontStyle: 'italic', marginBottom: '0.45rem', paddingLeft: '0.25rem' }}>
              "{capturedOriginal || value}"
            </div>

            <div style={{ color: '#0369A1', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.15rem' }}>
              Corrected Version:
            </div>
            <div style={{ color: '#0C4A6E', fontWeight: 600, paddingLeft: '0.25rem' }}>
              "{suggestedCorrection}"
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              id={`use-correction-btn-${fieldId}`}
              onClick={handleUseCorrection}
              className="btn btn-sm btn-primary"
              style={{
                backgroundColor: '#0284C7',
                borderColor: '#0284C7',
                color: '#ffffff',
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '0.3rem 0.85rem',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
              }}
            >
              <Check size={14} /> Apply Correction
            </button>

            <button
              type="button"
              id={`keep-original-btn-${fieldId}`}
              onClick={handleKeepOriginal}
              className="btn btn-sm btn-secondary"
              style={{
                fontSize: '0.78rem',
                padding: '0.3rem 0.75rem',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                cursor: 'pointer',
              }}
            >
              <X size={14} /> Keep Original
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

