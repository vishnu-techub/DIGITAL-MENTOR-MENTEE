import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import { Sparkles, Check, X, RefreshCw, AlertCircle } from 'lucide-react';

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
  const [explanation, setExplanation] = useState<string | null>(null);
  const [capturedOriginal, setCapturedOriginal] = useState<string>('');
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [appliedFeedback, setAppliedFeedback] = useState(false);
  const [noIssuesFeedback, setNoIssuesFeedback] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastCheckedValueRef = useRef<string>('');
  const debounceTimerRef = useRef<any>(null);
  const feedbackTimerRef = useRef<any>(null);
  const errorTimerRef = useRef<any>(null);
  const requestIdRef = useRef<number>(0);

  // Debounced check (750ms) after mentor stops typing
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = (value || '').trim();

    // If user deleted or changed text away from what was checked, dismiss stale suggestions
    if (showSuggestion && capturedOriginal && trimmed !== capturedOriginal) {
      setShowSuggestion(false);
      setSuggestedCorrection(null);
      setExplanation(null);
    }

    // Do not check empty, very short (< 5 chars), or unchanged text
    if (!trimmed || trimmed === lastCheckedValueRef.current || trimmed.length < 5) {
      return;
    }

    const currentReqId = ++requestIdRef.current;

    debounceTimerRef.current = setTimeout(async () => {
      setChecking(true);
      setServiceError(null);

      try {
        const res = await api.counselling.checkGrammar(trimmed);

        // Cancel/ignore stale requests if mentor continued typing
        if (currentReqId !== requestIdRef.current) {
          return;
        }

        lastCheckedValueRef.current = trimmed;

        if (res.success && res.data) {
          const hasErrors = Boolean(res.data.hasErrors ?? res.data.hasCorrections);
          const corrected = (res.data.correctedText || res.data.corrected || '').trim();

          // Section 4 Critical Validation:
          // If originalText === correctedText while error claimed, do NOT show correction!
          if (hasErrors && corrected && corrected !== trimmed) {
            setCapturedOriginal(trimmed);
            setSuggestedCorrection(corrected);
            setExplanation(res.data.explanation || null);
            setShowSuggestion(true);
            onActiveFieldChange?.(fieldId);
          } else {
            setSuggestedCorrection(null);
            setExplanation(null);
            setShowSuggestion(false);
          }
        }
      } catch (err) {
        // Section 10: Graceful handling without breaking the counselling form
        if (currentReqId === requestIdRef.current) {
          setServiceError('Writing assistant temporarily unavailable.');
          if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
          errorTimerRef.current = setTimeout(() => setServiceError(null), 4000);
        }
      } finally {
        if (currentReqId === requestIdRef.current) {
          setChecking(false);
        }
      }
    }, 750);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [value, fieldId, onActiveFieldChange, showSuggestion, capturedOriginal]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  // Manual check trigger
  const handleManualCheck = async () => {
    const trimmed = (value || '').trim();
    if (!trimmed || trimmed.length < 3) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const currentReqId = ++requestIdRef.current;

    setChecking(true);
    setServiceError(null);
    setNoIssuesFeedback(false);

    try {
      const res = await api.counselling.checkGrammar(trimmed);
      if (currentReqId !== requestIdRef.current) return;

      lastCheckedValueRef.current = trimmed;

      if (res.success && res.data) {
        const hasErrors = Boolean(res.data.hasErrors ?? res.data.hasCorrections);
        const corrected = (res.data.correctedText || res.data.corrected || '').trim();

        if (hasErrors && corrected && corrected !== trimmed) {
          setCapturedOriginal(trimmed);
          setSuggestedCorrection(corrected);
          setExplanation(res.data.explanation || null);
          setShowSuggestion(true);
          onActiveFieldChange?.(fieldId);
        } else {
          setSuggestedCorrection(null);
          setExplanation(null);
          setShowSuggestion(false);
          setNoIssuesFeedback(true);
          if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
          feedbackTimerRef.current = setTimeout(() => setNoIssuesFeedback(false), 2500);
        }
      }
    } catch (err) {
      if (currentReqId === requestIdRef.current) {
        setServiceError('Writing assistant temporarily unavailable.');
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => setServiceError(null), 4000);
      }
    } finally {
      if (currentReqId === requestIdRef.current) {
        setChecking(false);
      }
    }
  };

  // Section 7: Use Correction
  const handleUseCorrection = () => {
    if (!suggestedCorrection) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const corrected = suggestedCorrection;
    // Mark as checked to prevent re-triggering debounce on the newly applied text
    lastCheckedValueRef.current = corrected.trim();

    // 1. Direct native DOM textarea update (ensures immediate synchronization)
    if (textareaRef.current) {
      textareaRef.current.value = corrected;
      textareaRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 2. React state & form update
    onChange(corrected);
    if (onUseCorrection && fieldId) {
      onUseCorrection(fieldId, corrected);
    }

    // 3. Dismiss suggestion card
    setShowSuggestion(false);
    setSuggestedCorrection(null);
    setExplanation(null);
    onActiveFieldChange?.(null);

    // 4. Show "Correction applied" feedback
    setAppliedFeedback(true);
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = setTimeout(() => {
      setAppliedFeedback(false);
    }, 3000);
  };

  // Section 8: Keep Original
  const handleKeepOriginal = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    // Dismiss suggestion panel without modifying the textarea
    setShowSuggestion(false);
    setSuggestedCorrection(null);
    setExplanation(null);
    onActiveFieldChange?.(null);
  };

  return (
    <div className="form-group grammar-assist-container" style={{ marginBottom: '1.15rem' }}>
      {/* Label and Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
        <label htmlFor={fieldId} className="form-label" style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>
          {label} {required && <span style={{ color: '#DC2626' }}>*</span>}
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {checking && (
            <span
              style={{
                fontSize: '0.74rem',
                color: '#2563EB',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontWeight: 600,
              }}
            >
              <RefreshCw size={11} className="spin" /> Checking grammar...
            </span>
          )}

          {serviceError && !checking && (
            <span
              style={{
                fontSize: '0.74rem',
                color: '#D97706',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontWeight: 600,
              }}
            >
              <AlertCircle size={12} color="#D97706" /> {serviceError}
            </span>
          )}

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

          {noIssuesFeedback && !checking && (
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
              <Sparkles size={12} color="#1D4ED8" /> Fix Grammar
            </button>
          )}

          {value && value.trim().length >= 3 && !suggestedCorrection && !showSuggestion && !checking && (
            <button
              type="button"
              onClick={handleManualCheck}
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
              title="Check spelling and grammar with Sapling AI"
            >
              <Sparkles size={12} color="#3B82F6" /> Fix Grammar
            </button>
          )}
        </div>
      </div>

      {/* Input Textarea */}
      <textarea
        ref={textareaRef}
        id={fieldId}
        className="form-control"
        rows={rows}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setAppliedFeedback(false);
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

      {/* Inline Grammar Correction Suggestion Card (Section 6 UX) */}
      {showSuggestion && suggestedCorrection && (
        <div
          className="grammar-suggestion-card"
          data-testid={`grammar-suggestion-${fieldId}`}
          style={{
            marginTop: '0.5rem',
            padding: '0.85rem 1rem',
            backgroundColor: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: '8px',
            animation: 'fadeIn 0.15s ease-out',
            boxShadow: '0 2px 4px rgba(2, 132, 199, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.45rem' }}>
            <Sparkles size={14} color="#0284C7" />
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              AI Writing Assistant
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
              Suggested correction:
            </div>
            <div style={{ color: '#0C4A6E', fontWeight: 600, paddingLeft: '0.25rem' }}>
              "{suggestedCorrection}"
            </div>

            {explanation && (
              <div style={{ color: '#0284C7', fontSize: '0.74rem', marginTop: '0.35rem', paddingLeft: '0.25rem', fontWeight: 500 }}>
                ℹ {explanation}
              </div>
            )}
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
                padding: '0.35rem 0.85rem',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
              }}
            >
              <Check size={14} /> Use Correction
            </button>

            <button
              type="button"
              id={`keep-original-btn-${fieldId}`}
              onClick={handleKeepOriginal}
              className="btn btn-sm btn-secondary"
              style={{
                fontSize: '0.78rem',
                padding: '0.35rem 0.75rem',
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
