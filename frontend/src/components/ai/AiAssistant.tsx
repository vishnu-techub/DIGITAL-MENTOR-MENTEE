import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { Bot, X, Send, Plus, Trash2, History, RefreshCw, MessageSquare, Loader2 } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage?: string;
}

interface Conversation {
  id: string;
  title: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  messages: ChatMessage[];
}

const ROLE_SUGGESTIONS: Record<string, string[]> = {
  ADMIN: [
    'Summarize the college mentoring dashboard',
    'Explain monthly mentoring coverage',
    'Compare department mentoring statistics',
  ],
  PRINCIPAL: [
    'Summarize college-wide mentoring coverage',
    'Compare department performance',
    'Highlight areas needing attention',
  ],
  HOD: [
    'Summarize my department mentoring coverage',
    'Analyze subject-wise IA averages',
    'Show mentee mentoring frequency',
  ],
  FACULTY: [
    'Summarize my mentees progress',
    'Suggest counselling discussion points',
    'Give study improvement ideas for a mentee',
  ],
  STUDENT: [
    'Create a weekly study plan',
    'How can I improve my attendance and marks?',
    'Suggest skill development activities',
  ],
};

const SUGGESTIONS = [
  'Explain the mentoring process',
  'How to improve academic performance',
  'Study tips for better results',
  'Career guidance overview',
];

export const AiAssistant: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const role = user?.role || 'STUDENT';

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const loadConversations = async () => {
    try {
      const res = await api.ai.listConversations();
      if (res.success && res.data) {
        setConversations(res.data.conversations);
        const lastId = localStorage.getItem('aiAssistant_lastConversationId');
        if (lastId && res.data.conversations.some((c) => c.id === lastId)) {
          setActiveConversationId(lastId);
        }
      }
    } catch {
      // ignore
    }
  };

  const loadActiveConversation = async (conversationId: string) => {
    try {
      const res = await api.ai.getConversation(conversationId);
      if (res.success && res.data) {
        const conv = res.data.conversation as Conversation;
        setMessages(
          (conv.messages || []).map((m, idx) => ({
            id: `${conversationId}-${idx}`,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          }))
        );
        setActiveConversationId(conversationId);
        localStorage.setItem('aiAssistant_lastConversationId', conversationId);
        setShowHistory(false);
        setError(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load conversation');
    }
  };

  const startNewConversation = async () => {
    setActiveConversationId(null);
    setMessages([]);
    setInput('');
    setShowHistory(false);
    setError(null);
    localStorage.removeItem('aiAssistant_lastConversationId');
    try {
      const res = await api.ai.createConversation();
      if (res.success && res.data) {
        await loadConversations();
      }
    } catch {
      // ignore
    }
  };

  const deleteConversation = async (conversationId: string) => {
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await api.ai.deleteConversation(conversationId);
      if (activeConversationId === conversationId) {
        startNewConversation();
      }
      loadConversations();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete conversation');
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen]);

  useEffect(() => {
    if (activeConversationId && isOpen) {
      loadActiveConversation(activeConversationId);
    }
  }, [activeConversationId]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
    const text = input.trim();
    setInput('');
    setError(null);
    setIsSending(true);

    const tempUserMsg: ChatMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await api.ai.chat({
        conversationId: activeConversationId || undefined,
        message: text,
      });
      if (res.success && res.data) {
        const newConvId = res.data.conversationId;
        if (!activeConversationId) {
          setActiveConversationId(newConvId);
          localStorage.setItem('aiAssistant_lastConversationId', newConvId);
        }
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: res.data.answer,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        loadConversations();
      } else {
        setError(res.message || 'Failed to send message');
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        setInput(text);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to send message');
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
      setInput(text);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  if (!isAuthenticated) {
    return null;
  }

  const suggestions = ROLE_SUGGESTIONS[role] || SUGGESTIONS;

  return (
    <>
      {/* Floating Button */}
      <button
        className="ai-assistant-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
      >
        {isOpen ? <X size={24} /> : <Bot size={24} />}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="ai-assistant-panel">
          {/* Header */}
          <div className="ai-assistant-header">
            <div className="ai-assistant-header-title">
              <Bot size={20} />
              <span>KSRCE AI Assistant</span>
            </div>
            <div className="ai-assistant-header-actions">
              <button
                className="ai-assistant-icon-btn"
                onClick={() => setShowHistory(!showHistory)}
                title="Conversation History"
                aria-label="Toggle conversation history"
              >
                <History size={18} />
              </button>
              <button
                className="ai-assistant-icon-btn"
                onClick={startNewConversation}
                title="New Conversation"
                aria-label="Start new conversation"
              >
                <Plus size={18} />
              </button>
              <button
                className="ai-assistant-icon-btn"
                onClick={() => setIsOpen(false)}
                title="Close"
                aria-label="Close AI assistant"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="ai-assistant-body">
            {/* History Sidebar */}
            {showHistory && (
              <div className="ai-assistant-history">
                <div className="ai-assistant-history-title">
                  <MessageSquare size={16} />
                  Conversations
                </div>
                <div className="ai-assistant-history-list">
                  {conversations.length === 0 ? (
                    <div className="ai-assistant-history-empty">No conversations yet</div>
                  ) : (
                    conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`ai-assistant-history-item ${activeConversationId === conv.id ? 'active' : ''}`}
                        onClick={() => loadActiveConversation(conv.id)}
                      >
                        <div className="ai-assistant-history-item-title">{conv.title}</div>
                        <div className="ai-assistant-history-item-meta">
                          {conv.messageCount} messages
                        </div>
                        <button
                          className="ai-assistant-history-item-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(conv.id);
                          }}
                          aria-label="Delete conversation"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="ai-assistant-messages">
              {messages.length === 0 ? (
                <div className="ai-assistant-empty">
                  <Bot size={48} />
                  <h4>Welcome to KSRCE AI Assistant</h4>
                  <p>Ask me anything about your role. I'm here to help.</p>
                  <div className="ai-assistant-suggestions">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        className="ai-assistant-suggestion-chip"
                        onClick={() => handleSuggestionClick(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`ai-assistant-message ${msg.role === 'user' ? 'user' : 'assistant'}`}
                    >
                      <div className="ai-assistant-message-content">{msg.content}</div>
                    </div>
                  ))}
                  {isSending && (
                    <div className="ai-assistant-message assistant">
                      <div className="ai-assistant-message-content">
                        <div className="ai-assistant-typing">
                          <Loader2 size={16} className="spin" />
                          <span>Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="ai-assistant-error">
              <span>{error}</span>
              <button onClick={() => setError(null)} aria-label="Dismiss error">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Input */}
          <div className="ai-assistant-input-area">
            <input
              ref={inputRef}
              type="text"
              className="ai-assistant-input"
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={isSending}
            />
            <button
              className="ai-assistant-send-btn"
              onClick={handleSend}
              disabled={isSending || !input.trim()}
              aria-label="Send message"
            >
              {isSending ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
