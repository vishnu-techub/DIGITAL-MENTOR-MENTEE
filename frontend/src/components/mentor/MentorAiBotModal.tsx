import React, { useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  Bot,
  Send,
  Copy,
  Check,
  X,
  MessageSquare,
  BookOpen,
  RefreshCw,
  Lightbulb,
} from 'lucide-react';

interface MentorAiBotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BotMessage {
  id: string;
  sender: 'mentor' | 'ai';
  text: string;
  topic?: string;
  timestamp: string;
  suggestedQuestions?: string[];
}

const SAMPLE_QUESTIONS = [
  "How can I improve a student's communication skills?",
  "What activities can help improve presentation skills?",
  "How should I guide a student with repeated arrears?",
  "Give me counselling discussion points for poor attendance.",
  "Suggest questions to ask during a mentor meeting.",
];

export const MentorAiBotModal: React.FC<MentorAiBotModalProps> = ({ isOpen, onClose }) => {
  const toast = useToast();
  const [inputQuestion, setInputQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<BotMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Welcome, Professor. I am your Mentor Advisory AI Assistant.

Ask me about student mentorship, study strategies, communication improvement activities, arrear remediation plans, and meeting agendas.

Every response includes a Copy button so you can reuse the advice anywhere.

Important: answers are for your reference only and are never written to a student counselling record automatically.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const ledgerRef = React.useRef<HTMLDivElement>(null);

  // Close on Escape and keep focus inside the dialog while it is open.
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    // Lock background scroll while open, then restore the previous value so
    // closing never leaves a stale inline overflow on <body>.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  // Keep the newest message in view as the conversation grows.
  React.useEffect(() => {
    if (ledgerRef.current) {
      ledgerRef.current.scrollTop = ledgerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  if (!isOpen) return null;

  const handleAsk = async (questionToAsk?: string) => {
    const q = (questionToAsk || inputQuestion).trim();
    if (!q) return;

    const userMsg: BotMessage = {
      id: 'user-' + Date.now(),
      sender: 'mentor',
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuestion('');
    setLoading(true);

    try {
      const res = await api.counselling.askAiBot(q);
      if (res.success && res.data) {
        const aiMsg: BotMessage = {
          id: 'ai-' + Date.now(),
          sender: 'ai',
          text: res.data.answer,
          topic: res.data.topic,
          suggestedQuestions: res.data.suggestedQuestions,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorMsg: BotMessage = {
          id: 'ai-err-' + Date.now(),
          sender: 'ai',
          text: 'Unable to retrieve answer at this moment. Please try asking again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err: any) {
      const errorMsg: BotMessage = {
        id: 'ai-err-' + Date.now(),
        sender: 'ai',
        text: 'Failed to contact AI service: ' + (err.message || 'Network error'),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  // Safe clipboard copy function
  const handleCopyText = async (text: string, msgId: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }

      setCopiedId(msgId);
      toast.success('Copied to clipboard');
      setTimeout(() => {
        setCopiedId(null);
      }, 2500);
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <div
      className="modal-overlay mentor-ai-bot-modal-overlay"
      style={{
        backgroundColor: 'rgba(7, 21, 38, 0.72)',
        zIndex: 'var(--z-modal)',
      }}
    >
      <div
        className="mentor-ai-bot-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mentor-ai-modal-title"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          backgroundColor: 'var(--slate-50)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--slate-300)',
          overflow: 'hidden',
          animation: 'scaleUp var(--motion-base) var(--ease-standard)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-6)',
            backgroundColor: 'var(--primary-800)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            borderBottom: '3px solid var(--gold-500)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
            <div
              aria-hidden="true"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(212, 175, 55, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Bot size={22} color="var(--gold-400)" />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3
                id="mentor-ai-modal-title"
                style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, color: '#ffffff' }}
              >
                Mentor AI Advisory Assistant
              </h3>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gold-400)', marginTop: '2px', fontWeight: 500 }}>
                Advisory only — never saved to student records
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Mentor AI Advisory Assistant"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 'var(--touch-target)',
              minWidth: 'var(--touch-target)',
              flexShrink: 0,
              transition: 'background var(--motion-fast) var(--ease-standard)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Advisory Safeguard Banner */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-6)',
            backgroundColor: 'var(--gold-50)',
            borderBottom: '1px solid var(--gold-100)',
            fontSize: 'var(--text-sm)',
            color: '#92400E',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-2)',
            flexShrink: 0,
          }}
        >
          <Lightbulb size={16} color="var(--gold-600)" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong>Advisory only:</strong> Responses are generated for your guidance. Use <strong>Copy Answer</strong> to reuse a recommendation. Nothing is ever inserted or saved into a student record.
          </span>
        </div>

        {/* Quick Suggestion Chips */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-6)',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid var(--slate-200)',
            overflowX: 'auto',
            display: 'flex',
            gap: 'var(--space-2)',
            scrollbarWidth: 'none',
            flexShrink: 0,
          }}
        >
          {SAMPLE_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleAsk(q)}
              disabled={loading}
              className="btn btn-sm"
              style={{
                whiteSpace: 'nowrap',
                backgroundColor: '#ffffff',
                border: '1px solid var(--slate-300)',
                borderRadius: '9999px',
                padding: '0.35rem 0.85rem',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--slate-700)',
                cursor: 'pointer',
              }}
            >
              <MessageSquare size={13} aria-hidden="true" />
              <span>{q}</span>
            </button>
          ))}
        </div>

        {/* Conversation */}
        <div
          ref={ledgerRef}
          role="log"
          aria-live="polite"
          aria-label="Advisor conversation"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--space-5) var(--space-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            backgroundColor: 'var(--slate-100)',
          }}
        >
          {messages.map((m) => {
            const isUser = m.sender === 'mentor';
            const isCopied = copiedId === m.id;

            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '88%',
                    backgroundColor: isUser ? 'var(--primary-800)' : '#ffffff',
                    color: isUser ? '#ffffff' : 'var(--slate-800)',
                    borderRadius: isUser ? 'var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)' : 'var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm)',
                    padding: 'var(--space-4) var(--space-5)',
                    boxShadow: 'var(--shadow-sm)',
                    border: isUser ? '1px solid var(--primary-700)' : '1px solid var(--slate-200)',
                    minWidth: 0,
                  }}
                >
                  {/* Topic badge for AI answers */}
                  {!isUser && m.topic && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.6rem' }}>
                      <span className="badge badge-info" style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        <BookOpen size={12} aria-hidden="true" />
                        {m.topic}
                      </span>
                    </div>
                  )}

                  <div style={{ fontSize: 'var(--text-base)', lineHeight: 1.65, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                    {m.text}
                  </div>

                  {!isUser && m.id !== 'welcome' && (
                    <div
                      style={{
                        marginTop: 'var(--space-3)',
                        paddingTop: 'var(--space-3)',
                        borderTop: '1px solid var(--slate-100)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--space-3)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleCopyText(m.text, m.id)}
                        className={`btn btn-sm ${isCopied ? 'btn-success' : 'btn-secondary'}`}
                        aria-label={isCopied ? 'Response copied to clipboard' : 'Copy this response to clipboard'}
                      >
                        {isCopied ? (
                          <>
                            <Check size={14} aria-hidden="true" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={14} aria-hidden="true" /> Copy Answer
                          </>
                        )}
                      </button>

                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--slate-400)' }}>{m.timestamp}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--slate-600)', fontSize: 'var(--text-base)', padding: '0.5rem' }}>
              <RefreshCw size={16} className="spin" aria-hidden="true" />
              <span>Consulting the Mentor AI Advisory engine…</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          style={{
            padding: 'var(--space-4) var(--space-6)',
            backgroundColor: '#ffffff',
            borderTop: '1px solid var(--slate-200)',
            display: 'flex',
            gap: 'var(--space-3)',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="form-control"
            aria-label="Ask the Mentor AI Advisory Assistant a question"
            placeholder="Ask a mentoring question or pick a topic above…"
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            disabled={loading}
            style={{ flex: 1, fontSize: 'var(--text-base)' }}
          />
          <button
            type="submit"
            disabled={loading || !inputQuestion.trim()}
            className="btn btn-primary"
            aria-label="Send question to Mentor AI Advisory Assistant"
          >
            <Send size={16} aria-hidden="true" /> Send
          </button>
        </form>
      </div>
    </div>
  );
};
