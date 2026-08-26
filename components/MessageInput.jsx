'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';

export default function MessageInput({ onSendMessage, onTypingChange, disabled }) {
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Clear typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);

    if (onTypingChange) {
      if (!isTyping && val.trim().length > 0) {
        setIsTyping(true);
        onTypingChange(true);
      }

      // Clear the previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Set timeout to declare stopped typing after 1.5s of no key presses
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        onTypingChange(false);
      }, 1500);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || disabled || isSending) return;

    // Immediately declare typing stopped upon sending
    if (isTyping && onTypingChange) {
      setIsTyping(false);
      onTypingChange(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }

    setIsSending(true);
    try {
      await onSendMessage(text.trim());
      setText('');
      // Keep input focused after sending
      inputRef.current?.focus();
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-t border-white/5 bg-slate-900/60 p-4 backdrop-blur-md"
    >
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={handleTextChange}
        placeholder="Tulis pesan..."
        disabled={disabled || isSending}
        className="flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition-all duration-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      />

      <button
        type="submit"
        disabled={!text.trim() || disabled || isSending}
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 font-semibold text-white shadow-md shadow-indigo-600/20 transition-all duration-200 hover:scale-105 active:scale-95 disabled:scale-100 disabled:cursor-not-allowed disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:shadow-none"
      >
        {isSending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Send className="h-4.5 w-4.5" />
        )}
      </button>
    </form>
  );
}
