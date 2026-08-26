'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, AlertCircle, Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';
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

export default function MessageInput({ onSendMessage, onTypingChange, disabled }) {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
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

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setValidationError('Ukuran file terlalu besar. Maksimal 10MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
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

  const uploadAttachment = async (file) => {
    const fileExt = file.name.split('.').pop();
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

      // Handle attachment upload if file is selected
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

      await onSendMessage(finalContent);
      
      // Clear inputs
      setText('');
      removeSelectedFile();
      inputRef.current?.focus();
    } catch (err) {
      console.error('Failed to send message/attachment:', err);
      setValidationError('Gagal mengirim pesan atau lampiran.');
    } finally {
      setIsSending(false);
      setIsUploading(false);
    }
  }, [text, selectedFile, disabled, isSending, isUploading, isTyping, onTypingChange, onSendMessage]);

  const charsLeft = MAX_MESSAGE_LENGTH - text.length;
  const isOverLimit = text.length > MAX_MESSAGE_LENGTH;
  const isDisabled = disabled || isSending || isUploading || rateLimited || isOverLimit || (!text.trim() && !selectedFile);

  return (
    <div className="border-t border-white/5 bg-slate-900/60 backdrop-blur-md">
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

      {/* Validation / Rate limit error banner */}
      {(validationError || rateLimited) && (
        <div className="flex items-center gap-2 px-4 pt-2 text-xs text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{rateLimited ? 'Terlalu cepat! Tunggu sebentar...' : validationError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4">
        {/* Hidden File Inputs */}
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

        {/* Upload Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Upload Image Button */}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={disabled || isSending || isUploading}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Unggah Foto / Gambar"
          >
            <ImageIcon className="h-5 w-5" />
            <span className="hidden sm:inline text-xs font-semibold">Foto</span>
          </button>

          {/* Upload Document Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isSending || isUploading}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Send Button */}
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
      </form>
    </div>
  );
}
