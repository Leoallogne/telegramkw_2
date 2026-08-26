'use client';

import React from 'react';
import { FileText, Download, ExternalLink } from 'lucide-react';

function sanitizeForDisplay(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '[removed]')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .slice(0, 2000);
}

function parseMessageContent(rawContent) {
  if (typeof rawContent !== 'string') return { text: '', image: null, file: null };

  let text = rawContent;
  let image = null;
  let file = null;

  // Check for image marker: [image:URL]
  const imageMatch = text.match(/\[image:(https?:\/\/[^\]]+)\]/);
  if (imageMatch) {
    image = imageMatch[1];
    text = text.replace(imageMatch[0], '').trim();
  }

  // Check for file marker: [file:FILENAME|URL]
  const fileMatch = text.match(/\[file:([^|]+)\|(https?:\/\/[^\]]+)\]/);
  if (fileMatch) {
    file = { name: fileMatch[1], url: fileMatch[2] };
    text = text.replace(fileMatch[0], '').trim();
  }

  return { text: sanitizeForDisplay(text), image, file };
}

export default function MessageBubble({ message, isSelf, senderName }) {
  if (!message || typeof message.content !== 'string') return null;

  const { text, image, file } = parseMessageContent(message.content);
  const safeSenderName = sanitizeForDisplay(senderName || 'Anonymous').slice(0, 50);

  const formatTime = (isoString) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
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
        className={`relative max-w-[85%] sm:max-w-[75%] md:max-w-[60%] rounded-2xl p-3.5 shadow-md transition-all duration-300 ${
          isSelf
            ? 'rounded-tr-none bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-indigo-900/10'
            : 'rounded-tl-none bg-slate-800 text-slate-100 border border-slate-700/50 shadow-slate-950/10'
        }`}
      >
        {/* Sender Name */}
        {!isSelf && (
          <span className="block text-xs font-bold text-violet-400 mb-1.5 select-none tracking-wide">
            {safeSenderName}
          </span>
        )}

        {/* Image Attachment Rendering */}
        {image && (
          <div className="mb-2 overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <a
              href={image}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block overflow-hidden"
              title="Klik untuk membuka gambar ukuran penuh"
            >
              <img
                src={image}
                alt="Lampiran Gambar"
                className="max-h-64 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <span className="flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Buka Gambar
                </span>
              </div>
            </a>
          </div>
        )}

        {/* Document/File Attachment Rendering */}
        {file && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30">
                <FileText className="h-5 w-5" />
              </div>
              <span className="truncate text-xs font-semibold text-slate-200" title={file.name}>
                {file.name}
              </span>
            </div>
            <a
              href={file.url}
              target="_blank"
              download
              rel="noopener noreferrer"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 hover:bg-violet-500 hover:text-white transition-colors"
              title="Unduh File"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
        )}

        {/* Text Content */}
        {text && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words pb-3 pr-6">
            {text}
          </p>
        )}

        {/* Timestamp & Read Receipts (Ticks) */}
        <div
          className={`absolute bottom-1 right-2 flex items-center gap-1 text-[10px] select-none font-medium ${
            isSelf ? 'text-white/60' : 'text-slate-500'
          }`}
        >
          <span>{formatTime(message.created_at)}</span>
          {isSelf && (
            <span
              className={message.is_read ? 'text-violet-300 font-bold' : 'text-white/40'}
              title={message.is_read ? 'Dibaca' : 'Terkirim'}
            >
              {message.is_read ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
