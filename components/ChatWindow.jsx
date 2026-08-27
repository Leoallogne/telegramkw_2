'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import { LogOut, MessageSquare, Menu, X, Shield, RefreshCw, Users, Trash2, AlertTriangle, WifiOff, KeyRound, Check, Search, Pin, ZoomIn, ZoomOut, Download, BarChart2 } from 'lucide-react';

export default function ChatWindow({ currentUser, onLogout }) {
  const [role, setRole] = useState('guest');
  const [adminProfile, setAdminProfile] = useState(null);
  
  // Admin dashboard state
  const [guests, setGuests] = useState([]);
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [unreadGuests, setUnreadGuests] = useState({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Admin User Management Modal state
  const [showUserModal, setShowUserModal] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [deletingUser, setDeletingUser] = useState(null);
  const [resetPasswords, setResetPasswords] = useState({});
  const [resettingUser, setResettingUser] = useState(null);
  const [resetSuccess, setResetSuccess] = useState({});

  // Presence State: { [userId]: { online: boolean, lastSeen: string } }
  const [presenceMap, setPresenceMap] = useState({});

  // Lightbox Modal State
  const [activeLightboxUrl, setActiveLightboxUrl] = useState(null);

  // Search Bar State
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Reply State
  const [replyingTo, setReplyingTo] = useState(null);

  // Reactions State: { [messageId]: [ { id, message_id, user_id, emoji, isMine: boolean } ] }
  const [reactionsMap, setReactionsMap] = useState({});

  // Offline status state
  const [isOffline, setIsOffline] = useState(typeof window !== 'undefined' ? !navigator.onLine : false);

  // Real-time Typing Status state
  const [typingUsers, setTypingUsers] = useState({});

  // General Chat state
  const [messages, setMessages] = useState([]);
  const [profilesMap, setProfilesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const messagesEndRef = useRef(null);
  
  const selectedGuestRef = useRef(selectedGuest);
  selectedGuestRef.current = selectedGuest;
  const adminProfileRef = useRef(adminProfile);
  adminProfileRef.current = adminProfile;
  const roleRef = useRef(role);
  roleRef.current = role;
  const channelRef = useRef(null);

  // Audio Notification Chime (Web Audio API Synthesizer)
  const playNotificationChime = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15); // E5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // Ignore audio synthesis errors on strict autoplay policies
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  // 1. Fetch user role and profiles
  useEffect(() => {
    const initializeChat = async () => {
      setLoading(true);
      setError('');
      try {
        let { data: myProfile, error: myProfileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .single();

        if (myProfileErr || !myProfile) {
          const fallbackUsername = currentUser.user_metadata?.username || `User_${currentUser.id.slice(0, 6)}`;
          const isDefaultAdmin = currentUser.email === 'admin@example.com';
          const { data: newProf, error: createErr } = await supabase
            .from('profiles')
            .upsert({
              id: currentUser.id,
              username: fallbackUsername,
              role: isDefaultAdmin ? 'admin' : 'guest'
            })
            .select()
            .single();

          if (!createErr && newProf) {
            myProfile = newProf;
          } else if (myProfileErr) {
            throw myProfileErr;
          }
        }
        
        const userRole = myProfile.role || 'guest';
        setRole(userRole);

        setProfilesMap((prev) => ({
          ...prev,
          [currentUser.id]: myProfile.username,
        }));

        if (userRole === 'admin') {
          await loadAdminDashboard();
        } else {
          const { data: adminData, error: adminErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'admin')
            .maybeSingle();

          if (adminErr) throw adminErr;

          if (adminData) {
            setAdminProfile(adminData);
            setProfilesMap((prev) => ({
              ...prev,
              [adminData.id]: adminData.username,
            }));
            await loadMessages(currentUser.id, adminData.id);
            await markMessagesAsRead(adminData.id);
          } else {
            setAdminProfile(null);
            setMessages([]);
          }
        }
      } catch (err) {
        console.error('Initialization error:', err);
        setError('Gagal memuat konfigurasi chat.');
      } finally {
        setLoading(false);
      }
    };

    initializeChat();
  }, [currentUser]);

  // Realtime Presence Tracker Setup
  useEffect(() => {
    if (!currentUser) return;

    const presenceChannel = supabase.channel('online-presence', {
      config: { presence: { key: currentUser.id } }
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const activeMap = {};
        Object.keys(state).forEach((key) => {
          activeMap[key] = { online: true };
        });
        setPresenceMap(activeMap);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            online_at: new Date().toISOString()
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [currentUser]);

  const loadAdminDashboard = async () => {
    try {
      const { data: guestProfiles, error: guestErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'guest')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (guestErr) throw guestErr;

      setGuests(guestProfiles || []);

      const map = { [currentUser.id]: 'Admin' };
      guestProfiles?.forEach((g) => {
        map[g.id] = g.username;
      });
      setProfilesMap(map);
    } catch (err) {
      console.error('Error loading admin dashboard:', err);
    }
  };

  const loadMessages = async (userId1, userId2) => {
    if (!userId1 || !userId2) return;
    try {
      const { data, error: msgErr } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`
        )
        .order('created_at', { ascending: true });

      if (msgErr) throw msgErr;
      setMessages(data || []);

      if (data && data.length > 0) {
        await loadReactions(data.map((m) => m.id));
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  const loadReactions = async (messageIds) => {
    if (!messageIds || messageIds.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds);

      if (error) throw error;

      const map = {};
      data?.forEach((r) => {
        if (!map[r.message_id]) map[r.message_id] = [];
        map[r.message_id].push({
          ...r,
          isMine: r.user_id === currentUser.id
        });
      });
      setReactionsMap(map);
    } catch (err) {
      console.error('Error loading reactions:', err);
    }
  };

  const markMessagesAsRead = async (partnerId) => {
    if (!partnerId) return;
    try {
      const { error: updateErr } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('sender_id', partnerId)
        .eq('receiver_id', currentUser.id)
        .eq('is_read', false);

      if (updateErr) throw updateErr;
    } catch (err) {
      console.warn('Could not mark messages as read:', err.message);
    }
  };

  // Realtime Messages & Reactions Subscription Setup
  useEffect(() => {
    if (!currentUser || loading) return;

    const channel = supabase
      .channel('messages-room-channel')
      
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const newMsg = payload.new;

          if (roleRef.current === 'guest') {
            const adminData = adminProfileRef.current;
            if (adminData) {
              const isAdminMsg = newMsg.sender_id === adminData.id && newMsg.receiver_id === currentUser.id;
              const isOwnMsg = newMsg.sender_id === currentUser.id && newMsg.receiver_id === adminData.id;
              
              if (isAdminMsg || isOwnMsg) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === newMsg.id)) return prev;
                  return [...prev, newMsg];
                });

                if (isAdminMsg) {
                  playNotificationChime();
                  await markMessagesAsRead(adminData.id);
                }
              }
            }
          } else {
            const activeGuest = selectedGuestRef.current;
            const isFromActiveGuest = newMsg.sender_id === activeGuest?.id && newMsg.receiver_id === currentUser.id;
            const isToActiveGuest = newMsg.sender_id === currentUser.id && newMsg.receiver_id === activeGuest?.id;

            if (isFromActiveGuest || isToActiveGuest) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
              
              if (isFromActiveGuest) {
                playNotificationChime();
                await markMessagesAsRead(activeGuest.id);
              }
            }

            if (newMsg.sender_id !== currentUser.id) {
              setGuests((prevGuests) => {
                const exists = prevGuests.some((g) => g.id === newMsg.sender_id);
                if (exists) {
                  const sender = prevGuests.find((g) => g.id === newMsg.sender_id);
                  const rest = prevGuests.filter((g) => g.id !== newMsg.sender_id);
                  return [sender, ...rest];
                } else {
                  fetchGuestProfile(newMsg.sender_id);
                  return prevGuests;
                }
              });

              if (!activeGuest || activeGuest.id !== newMsg.sender_id) {
                setUnreadGuests((prev) => ({
                  ...prev,
                  [newMsg.sender_id]: true,
                }));
              }
            }
          }
        }
      )

      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const updatedMsg = payload.new;
          setMessages((prev) =>
            prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
          );
        }
      )

      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const r = payload.new;
            setReactionsMap((prev) => {
              const list = prev[r.message_id] || [];
              if (list.some((item) => item.id === r.id)) return prev;
              return {
                ...prev,
                [r.message_id]: [...list, { ...r, isMine: r.user_id === currentUser.id }]
              };
            });
          } else if (payload.eventType === 'DELETE') {
            const oldR = payload.old;
            setReactionsMap((prev) => {
              const list = prev[oldR.message_id] || [];
              return {
                ...prev,
                [oldR.message_id]: list.filter((item) => item.id !== oldR.id)
              };
            });
          }
        }
      )

      .on('broadcast', { event: 'typing' }, (payload) => {
        const { userId, isTyping } = payload.payload;
        setTypingUsers((prev) => ({
          ...prev,
          [userId]: isTyping,
        }));
      })
      
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, loading]);

  const fetchGuestProfile = async (guestId) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', guestId)
        .single();
      
      if (data) {
        setGuests((prev) => {
          if (prev.some((g) => g.id === data.id)) return prev;
          return [data, ...prev];
        });
        setProfilesMap((prev) => ({
          ...prev,
          [data.id]: data.username,
        }));
      }
    } catch (e) {
      console.error('Error fetching dynamic guest profile:', e);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectGuest = async (guest) => {
    setSelectedGuest(guest);
    setUnreadGuests((prev) => ({
      ...prev,
      [guest.id]: false,
    }));
    await loadMessages(currentUser.id, guest.id);
    await markMessagesAsRead(guest.id);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleSendMessage = async (content, replyToId = null) => {
    let receiverId = '';

    if (role === 'guest') {
      if (!adminProfile) {
        const { data: freshAdmin } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'admin')
          .maybeSingle();

        if (freshAdmin) {
          setAdminProfile(freshAdmin);
          setProfilesMap((prev) => ({ ...prev, [freshAdmin.id]: freshAdmin.username }));
          receiverId = freshAdmin.id;
        } else {
          alert('Admin belum tersedia. Silakan tunggu Admin melakukan setup.');
          return;
        }
      } else {
        receiverId = adminProfile.id;
      }
    } else {
      if (!selectedGuest) return;
      receiverId = selectedGuest.id;
    }

    try {
      const payload = {
        sender_id: currentUser.id,
        receiver_id: receiverId,
        content: content,
        is_read: false
      };

      if (replyToId) {
        payload.reply_to_id = replyToId;
      }

      const { error: sendErr } = await supabase.from('messages').insert(payload);
      if (sendErr) throw sendErr;
    } catch (err) {
      console.error('Send error:', err);
      alert('Gagal mengirim pesan.');
    }
  };

  const handleTypingChange = (isTyping) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUser.id, isTyping }
      });
    }
  };

  // Toggle Emoji Reaction on a message
  const handleToggleReaction = async (messageId, emoji) => {
    const existingList = reactionsMap[messageId] || [];
    const myReaction = existingList.find((r) => r.user_id === currentUser.id && r.emoji === emoji);

    try {
      if (myReaction) {
        await supabase
          .from('message_reactions')
          .delete()
          .eq('id', myReaction.id);
      } else {
        await supabase
          .from('message_reactions')
          .insert({
            message_id: messageId,
            user_id: currentUser.id,
            emoji: emoji
          });
      }
    } catch (err) {
      console.error('Error toggling reaction:', err);
    }
  };

  // Edit Message
  const handleEditMessage = async (messageId, newContent) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ content: newContent, is_edited: true })
        .eq('id', messageId)
        .eq('sender_id', currentUser.id);

      if (error) throw error;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: newContent, is_edited: true } : m))
      );
    } catch (err) {
      console.error('Edit error:', err);
    }
  };

  // Soft Delete Message
  const handleDeleteMessage = async (messageId) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_deleted: true })
        .eq('id', messageId)
        .eq('sender_id', currentUser.id);

      if (error) throw error;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_deleted: true } : m))
      );
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Pin Message to Header
  const handlePinMessage = async (messageId, currentPinned) => {
    const nextPinned = !currentPinned;
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_pinned_chat: nextPinned })
        .eq('id', messageId);

      if (error) throw error;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_pinned_chat: nextPinned } : m))
      );
    } catch (err) {
      console.error('Pin message error:', err);
    }
  };

  // Admin Pin / Unpin Guest
  const handleTogglePinGuest = async (guestId, currentPinned, e) => {
    e.stopPropagation();
    const nextPinned = !currentPinned;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_pinned: nextPinned })
        .eq('id', guestId);

      if (error) throw error;

      setGuests((prev) => {
        const updated = prev.map((g) => (g.id === guestId ? { ...g, is_pinned: nextPinned } : g));
        return updated.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
      });
    } catch (err) {
      console.error('Pin error:', err);
    }
  };

  // Admin User Management Logic
  const openUserManagement = async () => {
    setShowUserModal(true);
    setResetPasswords({});
    setResetSuccess({});
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'guest')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAllUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const handleResetPassword = async (userId) => {
    const newPassword = resetPasswords[userId];
    if (!newPassword || newPassword.trim().length < 6) {
      alert('Password baru minimal 6 karakter!');
      return;
    }

    setResettingUser(userId);
    try {
      const { error } = await supabase.rpc('reset_user_password', {
        target_user_id: userId,
        new_password: newPassword.trim(),
      });

      if (error) throw error;

      setResetSuccess((prev) => ({ ...prev, [userId]: true }));
      setResetPasswords((prev) => ({ ...prev, [userId]: '' }));

      setTimeout(() => {
        setResetSuccess((prev) => ({ ...prev, [userId]: false }));
      }, 3000);
    } catch (err) {
      console.error('Reset password error:', err);
      alert('Gagal me-reset password: ' + err.message);
    } finally {
      setResettingUser(null);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Apakah Anda yakin ingin menghapus user ini? Semua pesan mereka akan ikut terhapus.')) return;

    setDeletingUser(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      setAllUsers((prev) => prev.filter((u) => u.id !== userId));
      setGuests((prev) => prev.filter((g) => g.id !== userId));
      
      if (selectedGuest?.id === userId) {
        setSelectedGuest(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Gagal menghapus user: ' + err.message);
    } finally {
      setDeletingUser(null);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return '-';
    }
  };

  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase().trim()))
    : messages;

  const pinnedMessageInChat = messages.find((m) => m.is_pinned_chat && !m.is_deleted);

  const activeChatPartnerId = role === 'admin' ? selectedGuest?.id : adminProfile?.id;
  const isPartnerTyping = activeChatPartnerId && typingUsers[activeChatPartnerId];
  const isPartnerOnline = activeChatPartnerId && presenceMap[activeChatPartnerId]?.online;

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-950 text-slate-200">
        <RefreshCw className="h-8 w-8 animate-spin text-violet-500 mb-4" />
        <p className="text-sm text-slate-400 animate-pulse">Memuat sesi real-time...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-slate-950 font-sans text-slate-200">
      
      {/* Fullscreen Image Lightbox Modal */}
      {activeLightboxUrl && (
        <div
          onClick={() => setActiveLightboxUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 shadow-2xl">
            <img
              src={activeLightboxUrl}
              alt="Fullscreen View"
              className="max-h-[80vh] w-full object-contain"
            />
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <a
                href={activeLightboxUrl}
                target="_blank"
                download
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="rounded-xl bg-black/60 p-2 text-white hover:bg-violet-600 transition-colors"
                title="Unduh Gambar"
              >
                <Download className="h-5 w-5" />
              </a>
              <button
                type="button"
                onClick={() => setActiveLightboxUrl(null)}
                className="rounded-xl bg-black/60 p-2 text-white hover:bg-rose-600 transition-colors"
                title="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Backdrop Overlay for Mobile */}
      {isSidebarOpen && role === 'admin' && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-10 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden"
        />
      )}

      {/* Sidebar for Admin */}
      {role === 'admin' && (
        <div
          className={`fixed inset-y-0 left-0 z-20 flex w-72 shrink-0 flex-col border-r border-white/5 bg-slate-900 transition-transform duration-300 md:static md:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Sidebar Header */}
          <div className="flex h-16 items-center justify-between border-b border-white/5 px-4 bg-slate-900/50">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-violet-500" />
              <span className="font-bold tracking-wide text-sm bg-gradient-to-r from-violet-200 to-indigo-300 bg-clip-text text-transparent">Admin Dashboard</span>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Manage Users Button */}
          <div className="p-3 border-b border-white/5">
            <button
              onClick={openUserManagement}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 py-2.5 text-xs font-bold uppercase tracking-wider text-violet-400 hover:bg-violet-500/20 transition-all duration-200"
            >
              <Users className="h-4 w-4" />
              Kelola User & Statistik
            </button>
          </div>

          {/* Guest List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            <h3 className="px-2 mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Chat Aktif</h3>
            {guests.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-slate-600">
                <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs">Belum ada chat aktif</p>
              </div>
            ) : (
              guests.map((g) => {
                const isSelected = selectedGuest?.id === g.id;
                const hasUnread = unreadGuests[g.id];
                const isGuestTyping = typingUsers[g.id];
                const isGuestOnline = presenceMap[g.id]?.online;

                return (
                  <button
                    key={g.id}
                    onClick={() => handleSelectGuest(g)}
                    className={`group/guest relative flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all duration-200 ${
                      isSelected
                        ? 'bg-gradient-to-r from-violet-600/30 to-indigo-600/20 border border-violet-500/20 text-white shadow-md'
                        : 'bg-slate-900/30 border border-transparent hover:bg-slate-800/50 text-slate-300 hover:text-slate-100'
                    }`}
                  >
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-slate-800 to-slate-700 font-bold text-violet-400">
                      {g.username.charAt(0).toUpperCase()}
                      {isGuestOnline && (
                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
                      )}
                      {hasUnread && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-500"></span>
                        </span>
                      )}
                    </div>
                    <div className="overflow-hidden flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-sm font-semibold">{g.username}</p>
                        {g.is_pinned && <Pin className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />}
                      </div>
                      <p className={`truncate text-[10px] ${isGuestTyping ? 'text-emerald-400 font-medium animate-pulse' : 'text-slate-500'}`}>
                        {isGuestTyping ? 'sedang mengetik...' : (isGuestOnline ? 'Online' : 'Guest User')}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleTogglePinGuest(g.id, g.is_pinned, e)}
                      className="hidden group-hover/guest:flex p-1.5 text-slate-400 hover:text-amber-400 transition-colors"
                      title={g.is_pinned ? 'Lepas Pin' : 'Sematkan Chat'}
                    >
                      <Pin className={`h-3.5 w-3.5 ${g.is_pinned ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex h-full flex-1 flex-col bg-slate-950 relative overflow-hidden">
        
        {/* Offline Banner Notification */}
        {isOffline && (
          <div className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-rose-500/25 border-b border-rose-500/30 px-4 py-2 text-xs font-semibold text-rose-300 backdrop-blur-md animate-fade-in">
            <WifiOff className="h-4 w-4 animate-bounce" />
            <span>Koneksi Anda Terputus. Menunggu jaringan kembali...</span>
          </div>
        )}

        {/* Chat Window Top Bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 bg-slate-900/40 px-4 md:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {role === 'admin' && (
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}

            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 font-bold text-white shadow-md">
              {role === 'admin' 
                ? (selectedGuest ? selectedGuest.username.charAt(0).toUpperCase() : 'A')
                : (adminProfile ? adminProfile.username.charAt(0).toUpperCase() : 'G')
              }
              {isPartnerOnline && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-slate-950" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-slate-100 truncate">
                {role === 'admin'
                  ? (selectedGuest ? selectedGuest.username : 'Pilih Chat')
                  : (adminProfile ? adminProfile.username : 'Support Admin')
                }
              </h2>
              <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                {isPartnerTyping ? (
                  <span className="text-emerald-400 font-medium animate-pulse flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    sedang mengetik...
                  </span>
                ) : (
                  <>
                    <span className={`h-1.5 w-1.5 rounded-full ${isPartnerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
                    {role === 'admin' 
                      ? (selectedGuest ? (isPartnerOnline ? 'Online' : 'Offline') : 'Dashboard Aktif')
                      : (adminProfile ? (isPartnerOnline ? 'Online' : 'Support Available') : 'Menunggu Admin...')
                    }
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Search Bar Toggle & Profile Badge */}
          <div className="flex items-center gap-2 shrink-0">
            {showSearch ? (
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/80 px-2 py-1">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari pesan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-28 sm:w-40 bg-transparent text-xs text-slate-200 outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => { setShowSearch(false); setSearchQuery(''); }}
                  className="text-slate-400 hover:text-white p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="rounded-xl border border-white/5 bg-slate-900 p-2.5 text-slate-400 hover:text-white transition-colors"
                title="Cari Pesan"
              >
                <Search className="h-4 w-4" />
              </button>
            )}

            <span className="hidden select-none rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-400 md:inline-block">
              {role === 'admin' ? 'Admin' : profilesMap[currentUser.id] || 'User'}
            </span>
            <button
              onClick={onLogout}
              className="flex items-center justify-center rounded-xl border border-white/5 bg-slate-900 hover:bg-rose-950/20 hover:border-rose-900/30 p-2.5 text-slate-400 hover:text-rose-400 transition-all duration-200"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Pinned Message Header Banner */}
        {pinnedMessageInChat && (
          <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs backdrop-blur-md">
            <div className="flex items-center gap-2 overflow-hidden">
              <Pin className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />
              <div className="overflow-hidden">
                <span className="font-bold text-amber-300">Pesan Tersemat:</span>
                <p className="truncate text-slate-300 text-[11px]">{pinnedMessageInChat.content}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handlePinMessage(pinnedMessageInChat.id, true)}
              className="rounded p-1 text-slate-400 hover:text-white"
              title="Lepas pin"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Viewport for messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 scrollbar-thin">
          {error && (
            <div className="mx-auto my-4 max-w-md rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-center text-xs text-rose-300">
              {error}
            </div>
          )}

          {role === 'admin' && !selectedGuest ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-slate-600">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="text-base font-bold text-slate-300">Belum Ada Chat Dipilih</h3>
              <p className="mt-1 max-w-xs text-xs text-slate-500">
                Pilih guest dari sidebar kiri untuk mulai membaca dan membalas pesan.
              </p>
            </div>
          ) : (
            <>
              {filteredMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-slate-600">
                  <p className="text-xs">
                    {searchQuery ? 'Tidak ada pesan yang cocok dengan pencarian.' : 'Belum ada pesan. Kirim pesan untuk memulai percakapan!'}
                  </p>
                </div>
              ) : (
                filteredMessages.map((msg) => {
                  const isSelf = msg.sender_id === currentUser.id;
                  const senderName = profilesMap[msg.sender_id] || 'User';
                  
                  let quotedMsgData = null;
                  if (msg.reply_to_id) {
                    const originalMsg = messages.find((m) => m.id === msg.reply_to_id);
                    if (originalMsg) {
                      quotedMsgData = {
                        senderName: profilesMap[originalMsg.sender_id] || 'User',
                        content: originalMsg.content
                      };
                    }
                  }

                  return (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isSelf={isSelf}
                      senderName={senderName}
                      quotedMessage={quotedMsgData}
                      reactions={reactionsMap[msg.id] || []}
                      onReact={handleToggleReaction}
                      onReply={(msgToReply) => setReplyingTo({
                        id: msgToReply.id,
                        content: msgToReply.content,
                        senderName: profilesMap[msgToReply.sender_id] || 'User'
                      })}
                      onEditMessage={handleEditMessage}
                      onDeleteMessage={handleDeleteMessage}
                      onPinMessage={handlePinMessage}
                      onImageClick={(url) => setActiveLightboxUrl(url)}
                    />
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Chat input */}
        {((role === 'admin' && selectedGuest) || role === 'guest') && (
          <MessageInput
            onSendMessage={handleSendMessage}
            onTypingChange={handleTypingChange}
            disabled={isOffline || (role === 'guest' && !adminProfile)}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
          />
        )}
      </div>

      {/* Admin User Management & Analytics Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl overflow-hidden animate-zoom-in">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Kelola User & Statistik</h3>
                  <p className="text-[10px] text-slate-500">{allUsers.length} user terdaftar</p>
                </div>
              </div>
              <button
                onClick={() => setShowUserModal(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Analytics Summary Badges */}
            <div className="grid grid-cols-3 gap-3 px-6 py-3 border-b border-white/5 bg-slate-950/40 shrink-0 text-center">
              <div className="rounded-xl border border-white/5 bg-slate-900 p-2.5">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total User</p>
                <p className="text-lg font-extrabold text-violet-400 mt-0.5">{allUsers.length}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-slate-900 p-2.5">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Pesan Chat</p>
                <p className="text-lg font-extrabold text-indigo-400 mt-0.5">{messages.length}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-slate-900 p-2.5">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Status Sistem</p>
                <p className="text-xs font-bold text-emerald-400 mt-1 flex items-center justify-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Aktif 100%
                </p>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {allUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-slate-600">
                  <Users className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-semibold text-slate-400">Belum ada user terdaftar</p>
                  <p className="text-xs text-slate-600 mt-1">User baru yang mendaftar akan muncul di sini.</p>
                </div>
              ) : (
                allUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex flex-col md:flex-row md:items-center gap-4 rounded-xl border border-white/5 bg-slate-950/50 p-4 transition-all duration-200 hover:border-white/10"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-slate-800 to-slate-700 font-bold text-violet-400 text-lg">
                        {user.username.charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-100 truncate">{user.username}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Terdaftar: {formatDate(user.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 border-t border-white/5 pt-3 md:border-t-0 md:pt-0 shrink-0">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Password Baru..."
                          value={resetPasswords[user.id] || ''}
                          onChange={(e) => setResetPasswords({ ...resetPasswords, [user.id]: e.target.value })}
                          className="w-36 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500"
                        />
                      </div>
                      <button
                        onClick={() => handleResetPassword(user.id)}
                        disabled={resettingUser === user.id}
                        className={`flex h-8 items-center gap-1 px-3.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${
                          resetSuccess[user.id]
                            ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                            : 'bg-violet-600/20 border border-violet-500/25 text-violet-400 hover:bg-violet-600/30'
                        }`}
                        title="Setel Ulang Password"
                      >
                        {resettingUser === user.id ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : resetSuccess[user.id] ? (
                          <>
                            <Check className="h-3 w-3" />
                            Sukses
                          </>
                        ) : (
                          <>
                            <KeyRound className="h-3 w-3" />
                            Reset PW
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 shrink-0 border-t border-white/5 pt-3 md:border-t-0 md:pt-0">
                      <button
                        onClick={() => {
                          handleSelectGuest(user);
                          setShowUserModal(false);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300 transition-all duration-200"
                        title="Buka Obrolan"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={deletingUser === user.id}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Hapus User"
                      >
                        {deletingUser === user.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-white/5 px-6 py-3 flex items-center gap-2 text-[10px] text-slate-500 shrink-0">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500/60" />
              <span>Untuk keamanan, password mentah tidak lagi disimpan. Anda dapat menyetel ulang password tamu kapan saja.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
