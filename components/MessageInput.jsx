'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Send, Loader2, AlertCircle, Paperclip, X, FileText, Image as ImageIcon, Mic, Square, Smile, CornerDownRight, Clock, Flame, MapPin, UploadCloud, MoreHorizontal } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

function sanitizeInput(str) {
  return str
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_MS = 500;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const POPULAR_EMOJIS = [
  '👍', '❤️', '😂', '😮', '😢', '🔥', 
  '🎉', '🙏', '😊', '😍', '👏', '✨', 
  '💯', '🚀', '😎', '🙌', '🤝', '💡'
];

const TIMER_OPTIONS = [
  { label: 'Matikan Timer', value: null },
  { label: '🔥 5 Detik', value: 5 },
  { label: '🔥 10 Detik', value: 10 },
  { label: '🔥 30 Detik', value: 30 },
  { label: '🔥 1 Menit', value: 60 },
];

export default function MessageInput({ onSendMessage, onTypingChange, disabled, replyingTo, onCancelReply }) {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  
  // Audio recording, Location & Drag-and-Drop state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  
  // Emoji picker & Timer picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [selectedTimer, setSelectedTimer] = useState(null);

  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [validationError, setValidationError] = useState('');

  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastSentAtRef = useRef(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const validateAndSetFile = (file) => {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setValidationError('Ukuran file terlalu besar. Maksimal 10MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    setValidationError('');
    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      const preview = URL.createObjectURL(file);
      setFilePreviewUrl(preview);
    } else {
      setFilePreviewUrl(null);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    validateAndSetFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingFile) setIsDraggingFile(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDropFile = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    const file = e.dataTransfer.files?.[0];
    validateAndSetFile(file);
  };

  const removeSelectedFile = useCallback(() => {
    setSelectedFile(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, [filePreviewUrl]);

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      setValidationError('Browser Anda tidak mendukung lokasi GPS.');
      return;
    }

    setIsGettingLocation(true);
    setValidationError('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setIsGettingLocation(false);
        const { latitude, longitude } = pos.coords;
        const locationMarker = `[location:${latitude.toFixed(6)},${longitude.toFixed(6)}|Lokasi Saya]`;
        await onSendMessage(locationMarker, replyingTo?.id || null, selectedTimer);
        if (onCancelReply) onCancelReply();
      },
      (err) => {
        setIsGettingLocation(false);
        console.error('Geolocation error:', err);
        setValidationError('Gagal mengakses lokasi GPS. Pastikan izin lokasi diaktifkan.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleTextChange = useCallback((e) => {
    const raw = e.target.value;

    if (raw.length > MAX_MESSAGE_LENGTH) {
      setValidationError(`Pesan terlalu panjang. Maksimal ${MAX_MESSAGE_LENGTH} karakter.`);
      return;
    }

    setValidationError('');
    setText(raw);

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

  const insertEmoji = (emoji) => {
    setText((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const startRecording = async () => {
    try {
      setValidationError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access error:', err);
      setValidationError('Gagal mengakses mikrofon.');
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
    audioChunksRef.current = [];
  };

  const stopAndSendRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    mediaRecorderRef.current.onstop = async () => {
      clearInterval(recordingTimerRef.current);
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);

      if (audioBlob.size === 0) return;

      setIsUploading(true);
      try {
        const fileName = `${Date.now()}_voice.webm`;
        const filePath = `chat-attachments/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, audioBlob, { contentType: 'audio/webm' });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath);

        const contentMarker = `[audio:${publicUrlData.publicUrl}]`;
        await onSendMessage(contentMarker, replyingTo?.id || null, selectedTimer);

        if (onCancelReply) onCancelReply();
      } catch (err) {
        console.error('Voice note send error:', err);
        setValidationError('Gagal mengirim pesan suara.');
      } finally {
        setIsUploading(false);
        setRecordingTime(0);
        audioChunksRef.current = [];
      }
    };

    mediaRecorderRef.current.stop();
  };

  const compressImage = (file) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.type.includes('gif')) {
        resolve(file);
        return;
      }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/webp",
          0.82
        );
      };
      img.onerror = () => resolve(file);
      img.src = url;
    });
  };

  const uploadAttachment = useCallback(async (file) => {
    const targetFile = file.type.startsWith('image/') ? await compressImage(file) : file;
    const cleanName = targetFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${Date.now()}_${cleanName}`;
    const filePath = `chat-attachments/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(filePath, targetFile, { cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(filePath);

    return {
      publicUrl: publicUrlData.publicUrl,
      isImage: targetFile.type.startsWith('image/'),
      originalName: targetFile.name
    };
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    const trimmed = text.trim();
    if (!trimmed && !selectedFile) return;
    if (disabled || isSending || isUploading) return;

    const now = Date.now();
    if (now - lastSentAtRef.current < RATE_LIMIT_MS) {
      setRateLimited(true);
      setTimeout(() => setRateLimited(false), RATE_LIMIT_MS);
      return;
    }

    const sanitized = sanitizeInput(trimmed);
    if (sanitized.length > MAX_MESSAGE_LENGTH) {
      setValidationError(`Pesan terlalu panjang. Maksimal ${MAX_MESSAGE_LENGTH} karakter.`);
      return;
    }

    lastSentAtRef.current = now;
    setValidationError('');

    if (isTyping && onTypingChange) {
      setIsTyping(false);
      onTypingChange(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }

    setIsSending(true);
    try {
      let finalContent = sanitized;

      if (selectedFile) {
        setIsUploading(true);
        const attachment = await uploadAttachment(selectedFile);
        
        let attachmentMarker = '';
        if (attachment.isImage) {
          attachmentMarker = `[image:${attachment.publicUrl}]`;
        } else {
          attachmentMarker = `[file:${attachment.originalName}|${attachment.publicUrl}]`;
        }

        finalContent = finalContent 
          ? `${finalContent}\n${attachmentMarker}` 
          : attachmentMarker;
      }

      await onSendMessage(finalContent, replyingTo?.id || null, selectedTimer);
      
      setText('');
      removeSelectedFile();
      if (onCancelReply) onCancelReply();
      inputRef.current?.focus();
    } catch (err) {
      console.error('Failed to send message:', err);
      setValidationError('Gagal mengirim pesan.');
    } finally {
      setIsSending(false);
      setIsUploading(false);
    }
  }, [text, selectedFile, disabled, isSending, isUploading, isTyping, onTypingChange, onSendMessage, replyingTo, onCancelReply, selectedTimer, removeSelectedFile, uploadAttachment]);

  const formatRecordingTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  const charsLeft = MAX_MESSAGE_LENGTH - text.length;
  const isOverLimit = text.length > MAX_MESSAGE_LENGTH;
  const isDisabled = disabled || isSending || isUploading || rateLimited || isOverLimit || (!text.trim() && !selectedFile);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropFile}
      className={`relative border-t border-white/5 bg-slate-900/60 backdrop-blur-md transition-all ${
        isDraggingFile ? 'ring-2 ring-violet-500 bg-violet-950/20' : ''
      }`}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 flex items-center justify-center gap-2 bg-violet-600/90 backdrop-blur-md text-white font-bold text-sm animate-fade-in pointer-events-none">
          <UploadCloud className="h-6 w-6 animate-bounce" />
          <span>Lepaskan file di sini untuk melampirkan ke obrolan</span>
        </div>
      )}

      {/* Inline Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-full left-4 mb-2 z-40 w-64 rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl animate-zoom-in">
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
            <span className="text-xs font-bold text-slate-300">Pilih Emoji</span>
            <button
              type="button"
              onClick={() => setShowEmojiPicker(false)}
              className="text-slate-500 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {POPULAR_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-white/10 hover:scale-125 transition-all"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Timer Options Popover */}
      {showTimerPicker && (
        <div className="absolute bottom-full left-16 mb-2 z-40 w-52 rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl animate-zoom-in">
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
              <Flame className="h-3.5 w-3.5" /> Timer Pesan Rahasia
            </span>
            <button
              type="button"
              onClick={() => setShowTimerPicker(false)}
              className="text-slate-500 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            {TIMER_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  setSelectedTimer(opt.value);
                  setShowTimerPicker(false);
                }}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  selectedTimer === opt.value
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quoted Reply Banner */}
      {replyingTo && (
        <div className="flex items-center justify-between border-b border-white/5 bg-violet-600/10 px-4 py-2 text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <CornerDownRight className="h-4 w-4 text-violet-400 shrink-0" />
            <div className="overflow-hidden">
              <span className="font-bold text-violet-300">Membalas {replyingTo.senderName}:</span>
              <p className="truncate text-slate-400 text-[11px]">{replyingTo.content}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="rounded p-1 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* File Preview Bar */}
      {selectedFile && (
        <div className="flex items-center justify-between px-4 pt-3 pb-1 border-b border-white/5 bg-slate-950/40">
          <div className="flex items-center gap-3 overflow-hidden">
            {filePreviewUrl ? (
              <Image
                src={filePreviewUrl}
                alt="Preview"
                width={40}
                height={40}
                unoptimized
                className="h-10 w-10 rounded-lg object-cover border border-violet-500/30"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/20 text-violet-400 border border-violet-500/30">
                <FileText className="h-5 w-5" />
              </div>
            )}
            <div className="overflow-hidden text-xs">
              <p className="truncate font-semibold text-slate-200">{selectedFile.name}</p>
              <p className="text-[10px] text-slate-500">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={removeSelectedFile}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition-colors"
            title="Batal lampiran"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {(validationError || rateLimited) && (
        <div className="flex items-center gap-2 px-4 pt-2 text-xs text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{rateLimited ? 'Terlalu cepat! Tunggu sebentar...' : validationError}</span>
        </div>
      )}

      {/* Active Voice Recording Bar */}
      {isRecording ? (
        <div className="flex items-center justify-between gap-3 p-4 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <span className="text-xs font-mono font-bold text-rose-300">
              Merekam {formatRecordingTime(recordingTime)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelRecording}
              className="flex h-9 px-3 items-center gap-1 rounded-xl border border-rose-500/20 bg-rose-500/10 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-all"
            >
              <X className="h-4 w-4" />
              Batal
            </button>
            <button
              type="button"
              onClick={stopAndSendRecording}
              className="flex h-9 px-4 items-center gap-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-xs font-bold text-white shadow-md hover:scale-105 transition-all"
            >
              <Send className="h-4 w-4" />
              Kirim Voice Note
            </button>
          </div>
        </div>
      ) : (
        /* Standard Composer Input */
        <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.zip"
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowQuickActions((prev) => !prev);
                  setShowEmojiPicker(false);
                  setShowTimerPicker(false);
                }}
                disabled={disabled || isSending || isUploading}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-600/25 to-indigo-600/25 text-violet-300 shadow-md shadow-violet-900/30 transition-all duration-200 hover:bg-violet-600/20 hover:text-white disabled:opacity-50"
                title="Menu fitur"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>

              {showQuickActions && (
                <div className="absolute bottom-14 left-0 z-40 w-64 rounded-2xl border border-white/10 bg-slate-900/95 p-2.5 shadow-2xl backdrop-blur-xl animate-zoom-in">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowQuickActions(false); setShowEmojiPicker((prev) => !prev); setShowTimerPicker(false); }}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-2.5 py-2.5 text-left text-xs font-medium text-slate-200"
                    >
                      <Smile className="h-4 w-4 text-amber-400" />
                      Emoji
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowQuickActions(false); setShowTimerPicker((prev) => !prev); setShowEmojiPicker(false); }}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-2.5 py-2.5 text-left text-xs font-medium text-slate-200"
                    >
                      <Clock className="h-4 w-4 text-amber-400" />
                      {selectedTimer ? `${selectedTimer}s` : 'Timer'}
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowQuickActions(false); handleShareLocation(); }}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-2.5 py-2.5 text-left text-xs font-medium text-slate-200"
                    >
                      <MapPin className="h-4 w-4 text-emerald-400" />
                      Lokasi
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowQuickActions(false); imageInputRef.current?.click(); }}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-2.5 py-2.5 text-left text-xs font-medium text-slate-200"
                    >
                      <ImageIcon className="h-4 w-4 text-indigo-400" />
                      Foto
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowQuickActions(false); fileInputRef.current?.click(); }}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-2.5 py-2.5 text-left text-xs font-medium text-slate-200"
                    >
                      <Paperclip className="h-4 w-4 text-violet-400" />
                      File
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowQuickActions(false); startRecording(); }}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-2.5 py-2.5 text-left text-xs font-medium text-slate-200"
                    >
                      <Mic className="h-4 w-4 text-pink-400" />
                      Suara
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Text Input */}
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
              placeholder={selectedFile ? 'Tambah keterangan (opsional)...' : (selectedTimer ? `Pesan rahasia (${selectedTimer}s)...` : 'Tulis pesan...')}
              disabled={disabled || isSending || isUploading}
              maxLength={MAX_MESSAGE_LENGTH + 1}
              className={`w-full rounded-xl border bg-slate-950/60 px-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition-all duration-200 focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                selectedTimer
                  ? 'border-amber-500/40 focus:border-amber-500 focus:ring-amber-500/20'
                  : isOverLimit
                  ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20'
                  : 'border-white/10 focus:border-violet-500 focus:ring-violet-500/20'
              }`}
            />
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

          {/* Voice Note Record / Send Button */}
          {!text.trim() && !selectedFile ? (
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled || isSending || isUploading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-400 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
              title="Rekam Voice Note"
            >
              <Mic className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isDisabled}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 font-semibold text-white shadow-md shadow-indigo-600/20 transition-all duration-200 hover:scale-105 active:scale-95 disabled:scale-100 disabled:cursor-not-allowed disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:shadow-none"
              title="Kirim Pesan"
            >
              {isSending || isUploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-4.5 w-4.5" />
              )}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
