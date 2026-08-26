'use client';

import React from 'react';

export default function MessageBubble({ message, isSelf, senderName }) {
  // Format timestamp (e.g., "18:42")
  const formatTime = (isoString) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) {
      return '';
    }
  };

  return (
    <div
      className={`flex w-full mb-3.5 animate-in fade-in slide-in-from-bottom-2 duration-200 ${
        isSelf ? 'justify-end' : 'justify-start'
      }`}
    >
      <div
        className={`relative max-w-[75%] md:max-w-[60%] rounded-2xl px-4 py-2.5 shadow-md transition-all duration-300 ${
          isSelf
            ? 'rounded-tr-none bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-indigo-900/10'
            : 'rounded-tl-none bg-slate-800 text-slate-100 border border-slate-700/50 shadow-slate-950/10'
        }`}
      >
        {/* Sender Name (only show for others) */}
        {!isSelf && (
          <span className="block text-xs font-bold text-violet-400 mb-1 select-none tracking-wide">
            {senderName || 'Anonymous'}
          </span>
        )}

        {/* Message Text */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words pr-6">
          {message.content}
        </p>

        {/* Time Stamp & Read Receipts (Ticks) */}
        <div
          className={`absolute bottom-1 right-2 flex items-center gap-1 text-[10px] select-none font-medium ${
            isSelf ? 'text-white/60' : 'text-slate-500'
          }`}
        >
          <span>{formatTime(message.created_at)}</span>
          {isSelf && (
            <span className={message.is_read ? 'text-violet-300 font-bold' : 'text-white/40'} title={message.is_read ? 'Dibaca' : 'Terkirim'}>
              {message.is_read ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
