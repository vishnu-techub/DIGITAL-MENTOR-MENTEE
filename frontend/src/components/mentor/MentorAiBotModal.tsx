import React, { useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  Bot,
  Sparkles,
  Send,
  Copy,
  Check,
  X,
  HelpCircle,
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
      text: `Hello Professor! I am your Mentor Advisory AI Assistant.

You can ask me questions regarding student mentorship, study strategies, communication improvement activities, arrear remediation plans, and meeting agendas.

Every response includes a [Copy] button so you can copy advice to your clipboard.

Note: My answers are for your reference only and are NOT automatically added to any student counselling record.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      toast.success('✓ Copied to clipboard');
      setTimeout(() => {
        setCopiedId(null);
      }, 2500);
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(11, 37, 69, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
        padding: '1rem',
      }}
    >
      <div
        className="card mentor-ai-bot-modal"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          border: '1px solid #CBD5E1',
          overflow: 'hidden',
          animation: 'fadeInScale 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            backgroundColor: '#0B2545',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '3px solid #C59B27',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot size={22} color="#FDE047" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                Mentor AI Advisory Assistant
              </h3>
              <div style={{ fontSize: '0.74rem', color: '#CBD5E1', marginTop: '2px' }}>
                Separate Faculty Consultation Advisor • Q&A & Advice Copier
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Advisory Safeguard Banner */}
        <div
          style={{
            padding: '0.6rem 1.25rem',
            backgroundColor: '#FEF3C7',
            borderBottom: '1px solid #FDE68A',
            fontSize: '0.76rem',
            color: '#92400E',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Lightbulb size={16} color="#D97706" style={{ flexShrink: 0 }} />
          <span>
            <strong>Separate Advisor:</strong> Content is generated for mentor guidance. Click <strong>[Copy]</strong> to copy any recommendation. AI will never automatically insert or save anything to student records.
          </span>
        </div>

        {/* Quick Suggestion Pills */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            overflowX: 'auto',
            display: 'flex',
            gap: '0.5rem',
            scrollbarWidth: 'none',
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
                border: '1px solid #CBD5E1',
                borderRadius: '9999px',
                padding: '0.35rem 0.85rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              💬 {q}
            </button>
          ))}
        </div>

        {/* Message Ledger */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            backgroundColor: '#F1F5F9',
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
                    backgroundColor: isUser ? '#0B2545' : '#ffffff',
                    color: isUser ? '#ffffff' : '#1E293B',
                    borderRadius: isUser ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                    padding: '1rem 1.25rem',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
                    border: isUser ? 'none' : '1px solid #E2E8F0',
                  }}
                >
                  {/* Topic Badge if AI */}
                  {!isUser && m.topic && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          color: '#1D4ED8',
                          backgroundColor: '#EFF6FF',
                          padding: '2px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        {m.topic}
                      </span>
                    </div>
                  )}

                  {/* Body text with whitespace preserve */}
                  <div style={{ fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                    {m.text}
                  </div>

                  {/* Copy Button for AI Responses */}
                  {!isUser && m.id !== 'welcome' && (
                    <div
                      style={{
                        marginTop: '0.85rem',
                        paddingTop: '0.65rem',
                        borderTop: '1px solid #F1F5F9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleCopyText(m.text, m.id)}
                        className="btn btn-sm"
                        style={{
                          backgroundColor: isCopied ? '#DCFCE7' : '#F8FAFC',
                          color: isCopied ? '#15803D' : '#0B2545',
                          border: `1px solid ${isCopied ? '#86EFAC' : '#CBD5E1'}`,
                          padding: '0.35rem 0.85rem',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          cursor: 'pointer',
                        }}
                        title="Copy complete AI response to clipboard"
                      >
                        {isCopied ? (
                          <>
                            <Check size={14} color="#15803D" /> ✓ Copied to clipboard
                          </>
                        ) : (
                          <>
                            <Copy size={14} /> Copy Answer
                          </>
                        )}
                      </button>

                      <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{m.timestamp}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748B', fontSize: '0.85rem', padding: '0.5rem' }}>
              <RefreshCw size={16} className="spin" />
              <span>Consulting Mentor AI Advisory Engine...</span>
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
            padding: '1rem 1.25rem',
            backgroundColor: '#ffffff',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            gap: '0.6rem',
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            className="form-control"
            placeholder="Type your mentoring question or select a topic above..."
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            disabled={loading}
            style={{
              flex: 1,
              padding: '0.65rem 1rem',
              fontSize: '0.9rem',
              borderRadius: '10px',
            }}
          />
          <button
            type="submit"
            disabled={loading || !inputQuestion.trim()}
            className="btn btn-primary"
            style={{
              padding: '0.65rem 1.25rem',
              fontWeight: 700,
              fontSize: '0.88rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              minHeight: '44px',
            }}
          >
            <Send size={16} /> Send
          </button>
        </form>
      </div>
    </div>
  );
};
