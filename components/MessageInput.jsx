'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, AlertCircle } from 'lucide-react';

// ─── Security: Strip dangerous HTML/script patterns from message input ──────
function sanitizeInput(str) {
  return str
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')  // strip <script> tags
    .replace(/<[^>]*>/g, '')                                // strip all HTML tags
    .replace(/javascript:/gi, '')                           // strip js: protocol
    .replace(/on\w+\s*=/gi, '')                             // strip event handlers
    .trim();
}

const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_MS = 500; // minimum ms between sends

export default function MessageInput({ onSendMessage, onTypingChange, disabled }) {
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [validationError, setValidationError] = useState('');

  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastSentAtRef = useRef(0); // timestamp of last send for rate limiting

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const handleTextChange = useCallback((e) => {
    const raw = e.target.value;

    // Enforce max character limit
    if (raw.length > MAX_MESSAGE_LENGTH) {
      setValidationError(`Pesan terlalu panjang. Maksimal ${MAX_MESSAGE_LENGTH} karakter.`);
      return;
    }

    setValidationError('');
    setText(raw);

    // Typing indicator broadcast
    if (onTypingChange) {
      if (!isTyping && raw.trim().length > 0) {
        setIsTyping(true);
        onTypingChange(true);
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        onTypingChange(false);
      }, 1500);
    }
  }, [isTyping, onTypingChange]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    const trimmed = text.trim();

    // ─── Validation ────────────────────────────────────────────────
    if (!trimmed) return;
    if (disabled || isSending) return;

    // Rate limit: prevent sending more than once per RATE_LIMIT_MS
    const now = Date.now();
    if (now - lastSentAtRef.current < RATE_LIMIT_MS) {
      setRateLimited(true);
      setTimeout(() => setRateLimited(false), RATE_LIMIT_MS);
      return;
    }

    // ─── Sanitization ──────────────────────────────────────────────
    const sanitized = sanitizeInput(trimmed);
    if (!sanitized) {
      setValidationError('Pesan tidak valid atau mengandung konten berbahaya.');
      return;
    }
    if (sanitized.length > MAX_MESSAGE_LENGTH) {
      setValidationError(`Pesan terlalu panjang. Maksimal ${MAX_MESSAGE_LENGTH} karakter.`);
      return;
    }

    // ─── Send ──────────────────────────────────────────────────────
    lastSentAtRef.current = now;
    setValidationError('');

    // Stop typing indicator immediately on send
    if (isTyping && onTypingChange) {
      setIsTyping(false);
      onTypingChange(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }

    setIsSending(true);
    try {
      await onSendMessage(sanitized);
      setText('');
      inputRef.current?.focus();
    } catch (err) {
      console.error('Failed to send message:', err);
      setValidationError('Gagal mengirim pesan. Silakan coba lagi.');
    } finally {
      setIsSending(false);
    }
  }, [text, disabled, isSending, isTyping, onTypingChange, onSendMessage]);

  const charsLeft = MAX_MESSAGE_LENGTH - text.length;
  const isOverLimit = text.length > MAX_MESSAGE_LENGTH;
  const isDisabled = disabled || isSending || rateLimited || isOverLimit;

  return (
    <div className="border-t border-white/5 bg-slate-900/60 backdrop-blur-md">
      {/* Validation / Rate limit error banner */}
      {(validationError || rateLimited) && (
        <div className="flex items-center gap-2 px-4 pt-2 text-xs text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{rateLimited ? 'Terlalu cepat! Tunggu sebentar...' : validationError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={handleTextChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                handleSubmit(e);
              }
            }}
            placeholder="Tulis pesan..."
            disabled={disabled || isSending}
            maxLength={MAX_MESSAGE_LENGTH + 1} // allow 1 over so we can show the error
            className={`w-full rounded-xl border bg-slate-950/60 px-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition-all duration-200 focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50 ${
              isOverLimit
                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20'
                : 'border-white/10 focus:border-violet-500 focus:ring-violet-500/20'
            }`}
          />
          {/* Character counter — only shows when approaching limit */}
          {text.length > MAX_MESSAGE_LENGTH * 0.8 && (
            <span
              className={`absolute bottom-2 right-3 text-[10px] select-none ${
                isOverLimit ? 'text-rose-400 font-bold' : 'text-slate-500'
              }`}
            >
              {charsLeft}
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={isDisabled}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 font-semibold text-white shadow-md shadow-indigo-600/20 transition-all duration-200 hover:scale-105 active:scale-95 disabled:scale-100 disabled:cursor-not-allowed disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:shadow-none"
          title={rateLimited ? 'Terlalu cepat!' : 'Kirim Pesan'}
        >
          {isSending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-4.5 w-4.5" />
          )}
        </button>
      </form>
    </div>
  );
}
