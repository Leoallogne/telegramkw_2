'use client';

import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured, supabaseConfigError } from '@/lib/supabaseClient';
import GuestLoginForm from '@/components/GuestLoginForm';
import ChatWindow from '@/components/ChatWindow';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!isSupabaseConfigured ? false : true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return undefined;
    }

    const withTimeout = (promise, ms, message) =>
      Promise.race([
        promise,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error(message)), ms);
        }),
      ]);

    // Register Service Worker for mobile notification handling
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('Service Worker registered scope:', reg.scope))
        .catch((err) => console.error('Service Worker registration failed:', err));
    }

    // 1. Check existing session on page load (Auto-reconnect)
    const checkSession = async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          12000,
          'Session check timed out. Falling back to login.'
        );

        if (session?.user) {
          setUser(session.user);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Session check error:', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // 2. Listen to authentication state changes (login, logout, sign-in, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="max-w-lg rounded-2xl border border-amber-500/30 bg-slate-900 p-8 shadow-2xl">
          <div className="mb-4 flex items-center gap-3 text-amber-300">
            <AlertTriangle className="h-6 w-6" />
            <h1 className="text-xl font-bold">Supabase configuration issue</h1>
          </div>
          <p className="text-sm leading-6 text-slate-300">
            {supabaseConfigError?.message || 'Konfigurasi Supabase tidak valid.'}
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-300">
            <li>Pastikan project Supabase benar dipilih.</li>
            <li>Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local.</li>
            <li>Sinkronkan variabel yang sama di Vercel Environment.</li>
          </ul>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-200">
        <RefreshCw className="h-8 w-8 animate-spin text-violet-500 mb-4" />
        <p className="text-sm text-slate-400">Loading session details...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950">
      {user ? (
        <ChatWindow currentUser={user} onLogout={handleLogout} />
      ) : (
        <GuestLoginForm onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />
      )}
    </main>
  );
}
