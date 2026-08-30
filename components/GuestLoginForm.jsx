'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User, Lock, MessageSquare, ShieldAlert, Loader2, ArrowRight, UserPlus, LogIn } from 'lucide-react';

export default function GuestLoginForm({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'admin'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const guestEmail = (name) => `${name.toLowerCase().replace(/[^a-z0-9_]/g, '')}@guest.local`;

  // Guest Sign In
  const handleGuestLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username dan Password harus diisi');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: guestEmail(username.trim()),
        password: password,
      });

      if (authError) throw authError;
      if (data?.user) onLoginSuccess(data.user);
    } catch (err) {
      console.error('Guest Login Error:', err);
      if (err.message?.includes('Invalid login credentials')) {
        setError('Username atau Password salah. Belum punya akun? Klik Register.');
      } else {
        setError(err.message || 'Gagal login.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Guest Register
  const handleGuestRegister = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username dan Password harus diisi');
      return;
    }
    if (password.length < 6) {
      setError('Password minimal 6 karakter');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const cleanUsername = username.trim();
      const { data, error: authError } = await supabase.auth.signUp({
        email: guestEmail(cleanUsername),
        password: password,
        options: {
          data: {
            username: cleanUsername,
          },
        },
      });

      if (authError) {
        if (authError.message?.includes('already registered')) {
          setError('Username sudah digunakan. Silakan pilih username lain atau Login.');
        } else {
          throw authError;
        }
        return;
      }

      if (data?.user) onLoginSuccess(data.user);
    } catch (err) {
      console.error('Guest Register Error:', err);
      setError(err.message || 'Gagal mendaftar.');
    } finally {
      setLoading(false);
    }
  };

  // Admin Login
  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Password tidak boleh kosong');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: 'admin@example.com',
        password: password,
      });

      if (authError) throw authError;
      if (data?.user) onLoginSuccess(data.user);
    } catch (err) {
      console.error('Admin Auth Error:', err);
      if (err.message?.includes('Invalid login credentials')) {
        setError('Password Admin salah.');
      } else {
        setError(err.message || 'Gagal login sebagai admin.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getSubmitHandler = () => {
    if (mode === 'admin') return handleAdminSubmit;
    if (mode === 'register') return handleGuestRegister;
    return handleGuestLogin;
  };

  const getTitle = () => {
    if (mode === 'admin') return 'Admin Portal';
    if (mode === 'register') return 'Buat Akun Baru';
    return 'Masuk ke Chat';
  };

  const getSubtitle = () => {
    if (mode === 'admin') return 'Masukkan password admin untuk mengakses konsol';
    if (mode === 'register') return 'Daftarkan username dan password untuk mulai chat';
    return 'Login dengan username dan password Anda';
  };

  const getButtonText = () => {
    if (mode === 'admin') return 'Masuk Admin Console';
    if (mode === 'register') return 'Daftar & Mulai Chat';
    return 'Login';
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-slate-950 px-4 py-8">
      {/* Decorative Glowing Blobs */}
      <div className="absolute top-1/4 left-1/4 h-[250px] w-[250px] md:h-[350px] md:w-[350px] rounded-full bg-violet-600/20 blur-[80px] md:blur-[100px] animate-pulse duration-[6000ms]" />
      <div className="absolute bottom-1/4 right-1/4 h-[300px] w-[300px] md:h-[400px] md:w-[400px] rounded-full bg-indigo-600/20 blur-[90px] md:blur-[120px] animate-pulse duration-[8000ms]" />

      {/* Login Card */}
      <div className="relative w-full max-w-md rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/60 p-6 md:p-8 shadow-2xl backdrop-blur-xl transition-all duration-300">
        
        {/* Logo/Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-lg shadow-indigo-500/30">
          <MessageSquare className="h-8 w-8 text-white animate-bounce" style={{ animationDuration: '3s' }} />
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="bg-gradient-to-r from-violet-200 via-indigo-200 to-purple-200 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
            {getTitle()}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {getSubtitle()}
          </p>
        </div>

        {/* Mode Toggle (Login / Register) */}
        {mode !== 'admin' && (
          <div className="mt-6 flex rounded-xl border border-white/5 bg-slate-950/40 p-1">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <LogIn className="h-3.5 w-3.5" />
              Login
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Register
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
            <ShieldAlert className="h-5 w-5 shrink-0 text-rose-400" />
            <div>{error}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={getSubmitHandler()} className="mt-6 space-y-5">
          
          {/* Username Field (Guest modes) */}
          {mode !== 'admin' && (
            <div className="space-y-1">
              <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Username
              </label>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <User className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  id="username"
                  type="text"
                  required
                  placeholder="Contoh: Budi"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full rounded-xl border border-white/10 bg-slate-950/50 py-3.5 pl-10 pr-4 text-slate-200 placeholder-slate-600 outline-none transition-all duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>
            </div>
          )}

          {/* Admin Email (Read-only) */}
          {mode === 'admin' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Email
              </label>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <User className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="email"
                  disabled
                  value="admin@example.com"
                  className="block w-full rounded-xl border border-white/5 bg-slate-950/20 py-3.5 pl-10 pr-4 text-slate-500 outline-none cursor-not-allowed"
                />
              </div>
            </div>
          )}

          {/* Password Field (All modes) */}
          <div className="space-y-1">
            <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {mode === 'admin' ? 'Admin Password' : 'Password'}
            </label>
            <div className="relative mt-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Lock className="h-5 w-5 text-slate-500" />
              </div>
              <input
                id="password"
                type="password"
                required
                placeholder={mode === 'register' ? 'Minimal 6 karakter' : 'Masukkan password...'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-xl border border-white/10 bg-slate-950/50 py-3.5 pl-10 pr-4 text-slate-200 placeholder-slate-600 outline-none transition-all duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-4 font-bold text-white shadow-lg shadow-indigo-600/30 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                {getButtonText()}
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
        </form>

        {/* Toggle to Admin / Guest Mode */}
        <div className="mt-8 text-center border-t border-white/5 pt-6">
          <button
            onClick={() => {
              setMode(mode === 'admin' ? 'login' : 'admin');
              setError('');
              setPassword('');
            }}
            className="text-xs font-semibold uppercase tracking-wider text-violet-400 hover:text-violet-300 hover:underline transition-colors duration-200"
          >
            {mode === 'admin' ? '← Kembali ke Mode User' : '🔐 Admin Portal'}
          </button>
        </div>

      </div>
    </div>
  );
}
