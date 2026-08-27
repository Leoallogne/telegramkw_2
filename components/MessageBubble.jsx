'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FileText, Download, ExternalLink, Play, Pause, Reply, CornerDownRight, Smile, Pencil, Trash2, Pin, Check, X, Flame, MapPin } from 'lucide-react';

function sanitizeForDisplay(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '[removed]')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .slice(0, 2000);
}

function parseMessageContent(rawContent) {
  if (typeof rawContent !== 'string') return { text: '', image: null, file: null, audio: null, location: null };

  let text = rawContent;
  let image = null;
  let file = null;
  let audio = null;
  let location = null;

  const locationMatch = text.match(/\[location:([^,]+),([^|]+)\|([^\]]+)\]/);
  if (locationMatch) {
    location = { lat: locationMatch[1], lng: locationMatch[2], name: locationMatch[3] };
    text = text.replace(locationMatch[0], '').trim();
  }

  const audioMatch = text.match(/\[audio:(https?:\/\/[^\]]+)\]/);
  if (audioMatch) {
    audio = audioMatch[1];
    text = text.replace(audioMatch[0], '').trim();
  }

  const imageMatch = text.match(/\[image:(https?:\/\/[^\]]+)\]/);
  if (imageMatch) {
    image = imageMatch[1];
    text = text.replace(imageMatch[0], '').trim();
  }

  const fileMatch = text.match(/\[file:([^|]+)\|(https?:\/\/[^\]]+)\]/);
  if (fileMatch) {
    file = { name: fileMatch[1], url: fileMatch[2] };
    text = text.replace(fileMatch[0], '').trim();
  }

  return { text: sanitizeForDisplay(text), image, file, audio, location };
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function MessageBubble({
  message,
  isSelf,
  senderName,
  quotedMessage,
  reactions = [],
  onReact,
  onReply,
  onEditMessage,
  onDeleteMessage,
  onPinMessage,
  onImageClick,
  onSelfDestruct
}) {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  // Self-Destruct Countdown state
  const [countdown, setCountdown] = useState(message?.expire_seconds || null);

  // Inline edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const audioRef = useRef(null);

  // Countdown timer effect for self-destructing messages
  useEffect(() => {
    if (!message?.expire_seconds || !message?.is_read) return;

    setCountdown(message.expire_seconds);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onSelfDestruct) onSelfDestruct(message.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [message?.expire_seconds, message?.is_read, message?.id, onSelfDestruct]);

  if (!message) return null;

  const { text, image, file, audio, location } = parseMessageContent(message.content || '');
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

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setAudioProgress(progress || 0);
    }
  };

  const handleAudioEnded = () => {
    setIsPlayingAudio(false);
    setAudioProgress(0);
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditText(text);
  };

  const handleSaveEdit = () => {
    if (onEditMessage && editText.trim()) {
      onEditMessage(message.id, editText.trim());
    }
    setIsEditing(false);
  };

  const reactionCounts = reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) {
      acc[r.emoji] = { count: 0, hasMine: false };
    }
    acc[r.emoji].count += 1;
    if (r.isMine) acc[r.emoji].hasMine = true;
    return acc;
  }, {});

  if (message.is_deleted) {
    return (
      <div className={`flex w-full mb-3 ${isSelf ? 'justify-end' : 'justify-start'}`}>
        <div className="rounded-2xl border border-white/5 bg-slate-900/40 px-4 py-2 text-xs italic text-slate-500 select-none">
          🚫 Pesan ini telah dihapus
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group relative flex w-full mb-5 animate-in fade-in slide-in-from-bottom-2 duration-200 items-end gap-2 ${
        isSelf ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Main Message Bubble Container */}
      <div
        className={`relative max-w-[85%] sm:max-w-[75%] md:max-w-[60%] rounded-2xl p-3.5 shadow-md transition-all duration-300 ${
          isSelf
            ? 'rounded-tr-none bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-indigo-900/10'
            : 'rounded-tl-none bg-slate-800 text-slate-100 border border-slate-700/50 shadow-slate-950/10'
        } ${message.is_pinned_chat ? 'ring-2 ring-amber-400/50' : ''} ${
          message.expire_seconds ? 'border border-amber-500/30' : ''
        }`}
      >
        {/* Emoji Reaction Popover Picker */}
        {showReactionPicker && (
          <div
            className={`absolute z-40 flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/95 px-3 py-1.5 shadow-2xl backdrop-blur-xl animate-zoom-in ${
              isSelf ? '-top-10 right-0' : '-top-10 left-0'
            }`}
          >
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReact(message.id, emoji);
                  setShowReactionPicker(false);
                }}
                className="text-lg hover:scale-130 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Sender Name & Action Buttons Header */}
        <div className="flex items-center justify-between gap-2 mb-1.5 select-none">
          <div className="flex items-center gap-1.5">
            {!isSelf && (
              <span className="block text-xs font-bold text-violet-400 tracking-wide">
                {safeSenderName}
              </span>
            )}
            {message.expire_seconds && (
              <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded-md border border-amber-500/30">
                <Flame className="h-3 w-3 text-amber-400 fill-amber-400 animate-pulse" />
                {countdown !== null ? `${countdown}s` : `${message.expire_seconds}s`}
              </span>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1">
            {onPinMessage && (
              <button
                type="button"
                onClick={() => onPinMessage(message.id, message.is_pinned_chat)}
                className={`p-1 transition-colors ${message.is_pinned_chat ? 'text-amber-400' : 'text-white/40 hover:text-white'}`}
                title={message.is_pinned_chat ? 'Lepas Pin Chat' : 'Sematkan di Header'}
              >
                <Pin className={`h-3 w-3 ${message.is_pinned_chat ? 'fill-amber-400' : ''}`} />
              </button>
            )}

            {isSelf && text && onEditMessage && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="p-1 text-white/40 hover:text-white transition-colors"
                title="Edit pesan"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}

            {isSelf && onDeleteMessage && (
              <button
                type="button"
                onClick={() => onDeleteMessage(message.id)}
                className="p-1 text-white/40 hover:text-rose-300 transition-colors"
                title="Hapus pesan"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}

            {onReply && (
              <button
                type="button"
                onClick={() => onReply(message)}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white/50 hover:bg-white/10 hover:text-white transition-all"
                title="Balas pesan ini"
              >
                <Reply className="h-3 w-3" />
                <span>Balas</span>
              </button>
            )}
          </div>
        </div>

        {/* Quoted Reply Container */}
        {quotedMessage && (
          <div className="mb-2.5 flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/25 p-2.5 text-xs border-l-4 border-l-violet-400 backdrop-blur-sm">
            <CornerDownRight className="h-4 w-4 text-violet-400 shrink-0" />
            <div className="overflow-hidden">
              <span className="font-bold text-violet-300 block text-[11px] mb-0.5">{quotedMessage.senderName}</span>
              <p className="truncate text-slate-300 text-xs italic">{quotedMessage.content}</p>
            </div>
          </div>
        )}

        {/* Live GPS Location Card */}
        {location && (
          <div className="mb-2.5 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-slate-950/60 p-3 shadow-md">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <MapPin className="h-5 w-5 animate-bounce" />
              </div>
              <div className="overflow-hidden">
                <span className="font-bold text-xs text-emerald-300 block truncate">{location.name}</span>
                <span className="text-[10px] font-mono text-slate-400 block truncate">{location.lat}, {location.lng}</span>
              </div>
            </div>
            <a
              href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Google Maps
            </a>
          </div>
        )}

        {/* Voice Note Audio Player */}
        {audio && (
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-3 min-w-[200px]">
            <audio
              ref={audioRef}
              src={audio}
              onTimeUpdate={handleAudioTimeUpdate}
              onEnded={handleAudioEnded}
              className="hidden"
            />
            <button
              type="button"
              onClick={toggleAudio}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white shadow-md hover:scale-105 transition-transform"
            >
              {isPlayingAudio ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </button>
            <div className="flex-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-violet-400 to-indigo-400 transition-all"
                  style={{ width: `${audioProgress}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-400 mt-1 block">Voice Note</span>
            </div>
          </div>
        )}

        {/* Image Attachment */}
        {image && (
          <div className="mb-2 overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <button
              type="button"
              onClick={() => onImageClick ? onImageClick(image) : window.open(image, '_blank')}
              className="group/img relative block w-full text-left overflow-hidden"
              title="Perbesar gambar"
            >
              <img
                src={image}
                alt="Lampiran Gambar"
                className="max-h-64 w-full object-cover transition-transform duration-300 group-hover/img:scale-105"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity duration-200">
                <span className="flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Perbesar Gambar
                </span>
              </div>
            </button>
          </div>
        )}

        {/* Document/File Attachment */}
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

        {/* Inline Message Edit Mode */}
        {isEditing ? (
          <div className="my-2 space-y-2">
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full rounded-lg border border-violet-400 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none"
              autoFocus
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300"
              >
                <X className="h-3 w-3" /> Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="flex items-center gap-1 rounded bg-violet-600 px-2 py-1 text-[10px] text-white font-bold"
              >
                <Check className="h-3 w-3" /> Simpan
              </button>
            </div>
          </div>
        ) : (
          text && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words pb-3 pr-6">
              {text}
            </p>
          )
        )}

        {/* Timestamp & Read Receipts */}
        <div
          className={`absolute bottom-1 right-2 flex items-center gap-1 text-[10px] select-none font-medium ${
            isSelf ? 'text-white/60' : 'text-slate-500'
          }`}
        >
          {message.is_edited && <span className="italic text-[9px] text-slate-400">(edited)</span>}
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

        {/* Reaction Counter Badges Container */}
        {Object.keys(reactionCounts).length > 0 && (
          <div className="absolute -bottom-3.5 left-3 flex items-center gap-1 z-10">
            {Object.entries(reactionCounts).map(([emoji, { count, hasMine }]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(message.id, emoji)}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border shadow-sm transition-all ${
                  hasMine
                    ? 'bg-violet-600 border-violet-400 text-white font-bold'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{emoji}</span>
                <span className="text-[10px]">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* External Action Button */}
      <button
        type="button"
        onClick={() => setShowReactionPicker(!showReactionPicker)}
        className="opacity-60 hover:opacity-100 p-1.5 text-slate-400 hover:text-amber-400 transition-all rounded-full hover:bg-white/5 shrink-0 mb-1"
        title="Beri reaksi emoji"
      >
        <Smile className="h-4 w-4" />
      </button>
    </div>
  );
}
