'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, AlertCircle, Paperclip, X, FileText, Image as ImageIcon, Mic, Square, Smile, CornerDownRight } from 'lucide-react';
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

export default function MessageInput({ onSendMessage, onTypingChange, disabled, replyingTo, onCancelReply }) {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  
  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  // Emoji picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

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

  // Audio recording refs
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

  // Handle file select
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
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

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // Text change handler
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

  // Insert emoji
  const insertEmoji = (emoji) => {
    setText((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  // Start Audio Recording
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
      setValidationError('Gagal mengosongkan/mengakses mikrofon.');
    }
  };

  // Stop & Cancel Audio Recording
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

  // Stop & Send Audio Recording
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
        await onSendMessage(contentMarker, replyingTo?.id || null);

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

  const uploadAttachment = async (file) => {
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${Date.now()}_${cleanName}`;
    const filePath = `chat-attachments/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(filePath, file, { cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(filePath);

    return {
      publicUrl: publicUrlData.publicUrl,
      isImage: file.type.startsWith('image/'),
      originalName: file.name
    };
  };

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

      await onSendMessage(finalContent, replyingTo?.id || null);
      
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
  }, [text, selectedFile, disabled, isSending, isUploading, isTyping, onTypingChange, onSendMessage, replyingTo, onCancelReply]);

  const formatRecordingTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  const charsLeft = MAX_MESSAGE_LENGTH - text.length;
  const isOverLimit = text.length > MAX_MESSAGE_LENGTH;
  const isDisabled = disabled || isSending || isUploading || rateLimited || isOverLimit || (!text.trim() && !selectedFile);

  return (
    <div className="relative border-t border-white/5 bg-slate-900/60 backdrop-blur-md">
      
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
              <img
                src={filePreviewUrl}
                alt="Preview"
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

          {/* Upload & Emoji Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={disabled || isSending || isUploading}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-950/60 text-slate-400 hover:bg-slate-800 hover:text-amber-400 transition-all duration-200 disabled:opacity-50"
              title="Emoji"
            >
              <Smile className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={disabled || isSending || isUploading}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-all duration-200 disabled:opacity-50"
              title="Unggah Foto / Gambar"
            >
              <ImageIcon className="h-5 w-5" />
              <span className="hidden sm:inline text-xs font-semibold">Foto</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isSending || isUploading}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300 transition-all duration-200 disabled:opacity-50"
              title="Unggah File / Dokumen"
            >
              <Paperclip className="h-5 w-5" />
              <span className="hidden sm:inline text-xs font-semibold">File</span>
            </button>
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
              placeholder={selectedFile ? 'Tambah keterangan (opsional)...' : 'Tulis pesan...'}
              disabled={disabled || isSending || isUploading}
              maxLength={MAX_MESSAGE_LENGTH + 1}
              className={`w-full rounded-xl border bg-slate-950/60 px-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition-all duration-200 focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                isOverLimit
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
