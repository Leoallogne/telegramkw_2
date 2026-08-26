'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import GuestLoginForm from '@/components/GuestLoginForm';
import ChatWindow from '@/components/ChatWindow';
import { RefreshCw } from 'lucide-react';

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Register Service Worker for mobile notification handling
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('Service Worker registered scope:', reg.scope))
        .catch((err) => console.error('Service Worker registration failed:', err));
    }

    // 1. Check existing session on page load (Auto-reconnect)
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
        }
      } catch (err) {
        console.error('Session check error:', err);
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
