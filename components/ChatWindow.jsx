'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import { LogOut, MessageSquare, Menu, X, Shield, RefreshCw, Users, Trash2, AlertTriangle, WifiOff, KeyRound, Check, Search, Pin, Download, UserPlus, Settings, User, Bell, Volume2, Eye, ShieldCheck, Heart, UserCheck } from 'lucide-react';

export default function ChatWindow({ currentUser, onLogout }) {
  const [role, setRole] = useState('guest');
  const [myProfileData, setMyProfileData] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  
  // Dashboard & Conversation List State
  const [contacts, setContacts] = useState([]); // List of chat contacts (Admin + Friends)
  const [selectedContact, setSelectedContact] = useState(null);
  const [unreadContacts, setUnreadContacts] = useState({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Admin User Management Modal state
  const [showUserModal, setShowUserModal] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [deletingUser, setDeletingUser] = useState(null);
  const [resetPasswords, setResetPasswords] = useState({});
  const [resettingUser, setResettingUser] = useState(null);
  const [resetSuccess, setResetSuccess] = useState({});

  // Add Friend Modal State
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [searchUsersResults, setSearchUsersResults] = useState([]);
  const [friendshipMap, setFriendshipMap] = useState({}); // { friendId: true }
  const [addingFriendId, setAddingFriendId] = useState(null);

  // Profile & Settings Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [notifySound, setNotifySound] = useState(true);
  const [notifyPush, setNotifyPush] = useState(true);
  const [showReadReceipts, setShowReadReceipts] = useState(true);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

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
  
  const selectedContactRef = useRef(selectedContact);
  selectedContactRef.current = selectedContact;
  const adminProfileRef = useRef(adminProfile);
  adminProfileRef.current = adminProfile;
  const roleRef = useRef(role);
  roleRef.current = role;
  const channelRef = useRef(null);

  // Web Audio API Sound Synthesizer
  const playNotificationChime = () => {
    if (!notifySound) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15);

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

  // 1. Fetch user role, profiles, and friendships
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
        
        setMyProfileData(myProfile);
        const userRole = myProfile.role || 'guest';
        setRole(userRole);
        setEditUsername(myProfile.username || '');
        setEditBio(myProfile.status_bio || 'Hey there! I am using Chat.');
        setNotifySound(myProfile.notify_sound ?? true);
        setNotifyPush(myProfile.notify_push ?? true);
        setShowReadReceipts(myProfile.show_read_receipts ?? true);
        setShowOnlineStatus(myProfile.show_online_status ?? true);

        setProfilesMap((prev) => ({
          ...prev,
          [currentUser.id]: myProfile.username,
        }));

        // Fetch Support Admin Profile
        const { data: adminData } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'admin')
          .maybeSingle();

        if (adminData) {
          setAdminProfile(adminData);
          setProfilesMap((prev) => ({
            ...prev,
            [adminData.id]: adminData.username,
          }));
        }

        // Fetch User Contacts / Friends List
        await loadUserContacts(currentUser.id, userRole, adminData);

      } catch (err) {
        console.error('Initialization error:', err);
        setError('Gagal memuat konfigurasi chat.');
      } finally {
        setLoading(false);
      }
    };

    initializeChat();
  }, [currentUser]);

  // Load Contacts list for WhatsApp sidebar view
  const loadUserContacts = async (userId, userRole, adminData) => {
    try {
      if (userRole === 'admin') {
        const { data: guestProfiles } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'guest')
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false });

        setContacts(guestProfiles || []);
        guestProfiles?.forEach((g) => {
          setProfilesMap((prev) => ({ ...prev, [g.id]: g.username }));
        });
      } else {
        // Fetch User Friendships
        const { data: friendshipRows } = await supabase
          .from('friendships')
          .select('friend_id, user_id')
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        const friendIds = friendshipRows?.map((f) => f.user_id === userId ? f.friend_id : f.user_id) || [];
        
        const map = {};
        friendIds.forEach((id) => { map[id] = true; });
        setFriendshipMap(map);

        let friendProfiles = [];
        if (friendIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('*')
            .in('id', friendIds);
          friendProfiles = profs || [];
        }

        // Always include Support Admin at top of contacts for Guests
        const contactList = [];
        if (adminData && adminData.id !== userId) {
          contactList.push({ ...adminData, is_admin_contact: true });
        }

        friendProfiles.forEach((f) => {
          if (!contactList.some((c) => c.id === f.id)) {
            contactList.push(f);
          }
          setProfilesMap((prev) => ({ ...prev, [f.id]: f.username }));
        });

        setContacts(contactList);
      }
    } catch (err) {
      console.error('Error loading contacts:', err);
    }
  };

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
          const activeContact = selectedContactRef.current;
          
          const isFromActive = newMsg.sender_id === activeContact?.id && newMsg.receiver_id === currentUser.id;
          const isToActive = newMsg.sender_id === currentUser.id && newMsg.receiver_id === activeContact?.id;

          if (isFromActive || isToActive) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });

            if (isFromActive) {
              playNotificationChime();
              await markMessagesAsRead(activeContact.id);
            }
          }

          if (newMsg.sender_id !== currentUser.id) {
            if (!activeContact || activeContact.id !== newMsg.sender_id) {
              setUnreadContacts((prev) => ({
                ...prev,
                [newMsg.sender_id]: true,
              }));
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectContact = async (contact) => {
    setSelectedContact(contact);
    setUnreadContacts((prev) => ({
      ...prev,
      [contact.id]: false,
    }));
    await loadMessages(currentUser.id, contact.id);
    await markMessagesAsRead(contact.id);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleSendMessage = async (content, replyToId = null) => {
    if (!selectedContact) return;

    try {
      const payload = {
        sender_id: currentUser.id,
        receiver_id: selectedContact.id,
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

  // Add Friend Logic
  const handleOpenAddFriendModal = async () => {
    setShowAddFriendModal(true);
    setFriendSearchQuery('');
    setSearchUsersResults([]);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', currentUser.id)
        .eq('role', 'guest')
        .limit(20);
      
      setSearchUsersResults(data || []);
    } catch (err) {
      console.error('Search users error:', err);
    }
  };

  const handleSearchUsers = async (query) => {
    setFriendSearchQuery(query);
    if (!query.trim()) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', currentUser.id)
        .eq('role', 'guest')
        .limit(20);
      setSearchUsersResults(data || []);
      return;
    }

    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', currentUser.id)
        .eq('role', 'guest')
        .ilike('username', `%${query.trim()}%`);

      setSearchUsersResults(data || []);
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  const handleAddFriend = async (targetUser) => {
    setAddingFriendId(targetUser.id);
    try {
      const { error } = await supabase
        .from('friendships')
        .upsert({
          user_id: currentUser.id,
          friend_id: targetUser.id,
          status: 'accepted'
        });

      if (error) throw error;

      setFriendshipMap((prev) => ({ ...prev, [targetUser.id]: true }));
      setContacts((prev) => {
        if (prev.some((c) => c.id === targetUser.id)) return prev;
        return [...prev, targetUser];
      });
      setProfilesMap((prev) => ({ ...prev, [targetUser.id]: targetUser.username }));

      setShowAddFriendModal(false);
      handleSelectContact(targetUser);
    } catch (err) {
      console.error('Add friend error:', err);
      alert('Gagal menambahkan teman: ' + err.message);
    } finally {
      setAddingFriendId(null);
    }
  };

  // Save Settings Logic
  const handleSaveProfileSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(false);

    try {
      const cleanUsername = editUsername.trim();
      if (!cleanUsername) throw new Error('Username tidak boleh kosong.');

      const { error } = await supabase
        .from('profiles')
        .update({
          username: cleanUsername,
          status_bio: editBio.trim(),
          notify_sound: notifySound,
          notify_push: notifyPush,
          show_read_receipts: showReadReceipts,
          show_online_status: showOnlineStatus
        })
        .eq('id', currentUser.id);

      if (error) throw error;

      setProfilesMap((prev) => ({ ...prev, [currentUser.id]: cleanUsername }));
      setMyProfileData((prev) => ({
        ...prev,
        username: cleanUsername,
        status_bio: editBio.trim(),
        notify_sound: notifySound,
        notify_push: notifyPush,
        show_read_receipts: showReadReceipts,
        show_online_status: showOnlineStatus
      }));

      // Request browser push notification permission if enabled
      if (notifyPush && typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      }

      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (err) {
      console.error('Save settings error:', err);
      alert('Gagal menyimpan profil: ' + err.message);
    } finally {
      setSavingSettings(false);
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
      setContacts((prev) => prev.filter((c) => c.id !== userId));
      
      if (selectedContact?.id === userId) {
        setSelectedContact(null);
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
  const activePartnerId = selectedContact?.id;
  const isPartnerTyping = activePartnerId && typingUsers[activePartnerId];
  const isPartnerOnline = activePartnerId && presenceMap[activePartnerId]?.online;

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-950 text-slate-200">
        <RefreshCw className="h-8 w-8 animate-spin text-violet-500 mb-4" />
        <p className="text-sm text-slate-400 animate-pulse">Memuat obrolan & kontak...</p>
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
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-10 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden"
        />
      )}

      {/* WhatsApp Style Sidebar (Rendered for ALL Users) */}
      <div
        className={`fixed inset-y-0 left-0 z-20 flex w-80 shrink-0 flex-col border-r border-white/5 bg-slate-900 transition-transform duration-300 md:static md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between border-b border-white/5 px-4 bg-slate-900/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 font-bold text-white shadow-md hover:scale-105 transition-transform"
              title="Pengaturan Profil"
            >
              {myProfileData?.username?.charAt(0).toUpperCase() || 'U'}
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
            </button>
            <div className="overflow-hidden">
              <h2 className="text-sm font-bold text-slate-100 truncate">{myProfileData?.username || 'User'}</h2>
              <p className="text-[10px] text-slate-400 truncate">{myProfileData?.status_bio || 'Online'}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {role === 'guest' && (
              <button
                onClick={handleOpenAddFriendModal}
                className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-2 text-violet-400 hover:bg-violet-500/20 transition-all"
                title="Tambah Teman Baru"
              >
                <UserPlus className="h-4 w-4" />
              </button>
            )}

            <button
              onClick={() => setShowSettingsModal(true)}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              title="Pengaturan Profil"
            >
              <Settings className="h-4 w-4" />
            </button>

            <button
              onClick={() => setIsSidebarOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Admin User Management Button (Only for Admin) */}
        {role === 'admin' && (
          <div className="p-3 border-b border-white/5">
            <button
              onClick={openUserManagement}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 py-2.5 text-xs font-bold uppercase tracking-wider text-violet-400 hover:bg-violet-500/20 transition-all duration-200"
            >
              <Users className="h-4 w-4" />
              Kelola User & Statistik
            </button>
          </div>
        )}

        {/* Contacts / Conversations List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="flex items-center justify-between px-2 mb-3">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Daftar Chat</h3>
            {role === 'guest' && (
              <button
                onClick={handleOpenAddFriendModal}
                className="text-[10px] font-semibold text-violet-400 hover:underline flex items-center gap-1"
              >
                <UserPlus className="h-3 w-3" /> Tambah
              </button>
            )}
          </div>

          {contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-slate-600 space-y-3">
              <MessageSquare className="h-8 w-8 opacity-30" />
              <p className="text-xs">Belum ada teman terdaftar.</p>
              {role === 'guest' && (
                <button
                  onClick={handleOpenAddFriendModal}
                  className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-md hover:bg-violet-500 transition-colors"
                >
                  Cari & Tambahkan Teman
                </button>
              )}
            </div>
          ) : (
            contacts.map((contact) => {
              const isSelected = selectedContact?.id === contact.id;
              const hasUnread = unreadContacts[contact.id];
              const isContactTyping = typingUsers[contact.id];
              const isContactOnline = presenceMap[contact.id]?.online;

              return (
                <button
                  key={contact.id}
                  onClick={() => handleSelectContact(contact)}
                  className={`group/contact relative flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all duration-200 ${
                    isSelected
                      ? 'bg-gradient-to-r from-violet-600/30 to-indigo-600/20 border border-violet-500/20 text-white shadow-md'
                      : 'bg-slate-900/30 border border-transparent hover:bg-slate-800/50 text-slate-300 hover:text-slate-100'
                  }`}
                >
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-slate-800 to-slate-700 font-bold text-violet-400">
                    {contact.username.charAt(0).toUpperCase()}
                    {isContactOnline && (
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
                      <p className="truncate text-sm font-semibold flex items-center gap-1.5">
                        {contact.username}
                        {contact.role === 'admin' && (
                          <span className="rounded bg-violet-500/20 px-1.5 py-0.2 text-[9px] font-bold text-violet-300 uppercase">Admin</span>
                        )}
                      </p>
                    </div>
                    <p className={`truncate text-[10px] ${isContactTyping ? 'text-emerald-400 font-medium animate-pulse' : 'text-slate-500'}`}>
                      {isContactTyping ? 'sedang mengetik...' : (isContactOnline ? 'Online' : (contact.status_bio || 'User'))}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

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
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 font-bold text-white shadow-md">
              {selectedContact ? selectedContact.username.charAt(0).toUpperCase() : 'C'}
              {isPartnerOnline && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-slate-950" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-slate-100 truncate">
                {selectedContact ? selectedContact.username : 'Pilih Obrolan'}
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
                    {selectedContact 
                      ? (isPartnerOnline ? 'Online' : (selectedContact.status_bio || 'Offline'))
                      : 'Pilih teman atau Support Admin'
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

          {!selectedContact ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-slate-600">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="text-base font-bold text-slate-300">Belum Ada Chat Dipilih</h3>
              <p className="mt-1 max-w-xs text-xs text-slate-500">
                Pilih teman atau Support Admin dari daftar di sebelah kiri untuk mulai mengobrol.
              </p>
            </div>
          ) : (
            <>
              {filteredMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-slate-600 space-y-2">
                  <p className="text-xs">
                    {searchQuery ? 'Tidak ada pesan yang cocok dengan pencarian.' : 'Belum ada pesan. Kirim pesan pertama untuk memulai obrolan!'}
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
        {selectedContact && (
          <MessageInput
            onSendMessage={handleSendMessage}
            onTypingChange={handleTypingChange}
            disabled={isOffline}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
          />
        )}
      </div>

      {/* Add Friend Search Modal */}
      {showAddFriendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md flex flex-col rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <UserPlus className="h-5 w-5 text-violet-400" />
                <h3 className="text-sm font-bold text-slate-100">Tambah Teman Baru</h3>
              </div>
              <button
                onClick={() => setShowAddFriendModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Cari username user lain..."
                  value={friendSearchQuery}
                  onChange={(e) => handleSearchUsers(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 py-2.5 pl-9 pr-4 text-xs text-slate-200 outline-none focus:border-violet-500"
                  autoFocus
                />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {searchUsersResults.length === 0 ? (
                  <p className="p-4 text-center text-xs text-slate-500">Tidak ada user ditemukan.</p>
                ) : (
                  searchUsersResults.map((u) => {
                    const isAlreadyFriend = friendshipMap[u.id];
                    return (
                      <div
                        key={u.id}
                        className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400 font-bold text-sm">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-200">{u.username}</p>
                            <p className="text-[10px] text-slate-500">{u.status_bio || 'Guest User'}</p>
                          </div>
                        </div>

                        {isAlreadyFriend ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                            <UserCheck className="h-3 w-3" /> Teman
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAddFriend(u)}
                            disabled={addingFriendId === u.id}
                            className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-md hover:bg-violet-500 transition-colors disabled:opacity-50"
                          >
                            {addingFriendId === u.id ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <UserPlus className="h-3 w-3" /> Tambah
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Profile & Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <Settings className="h-5 w-5 text-violet-400" />
                <h3 className="text-sm font-bold text-slate-100">Pengaturan Profil & Privasi</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfileSettings} className="p-6 space-y-4">
              {settingsSuccess && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-300">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>Pengaturan profil berhasil disimpan!</span>
                </div>
              )}

              {/* Username Input */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Username</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-violet-500"
                />
              </div>

              {/* Bio / Status Input */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Bio Status</label>
                <input
                  type="text"
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-violet-500"
                />
              </div>

              {/* Notification Toggles */}
              <div className="border-t border-white/5 pt-3 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Perizinan Notifikasi</h4>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Volume2 className="h-4 w-4 text-violet-400" />
                    <span>Suara Notifikasi Chat</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifySound}
                    onChange={(e) => setNotifySound(e.target.checked)}
                    className="h-4 w-4 rounded accent-violet-600"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Bell className="h-4 w-4 text-violet-400" />
                    <span>Push Notification Browser</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyPush}
                    onChange={(e) => setNotifyPush(e.target.checked)}
                    className="h-4 w-4 rounded accent-violet-600"
                  />
                </div>
              </div>

              {/* Privacy Toggles */}
              <div className="border-t border-white/5 pt-3 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Privasi & Keamanan</h4>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Check className="h-4 w-4 text-violet-400" />
                    <span>Tampilkan Centang Dibaca (✓✓)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={showReadReceipts}
                    onChange={(e) => setShowReadReceipts(e.target.checked)}
                    className="h-4 w-4 rounded accent-violet-600"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Eye className="h-4 w-4 text-violet-400" />
                    <span>Tampilkan Status Online</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={showOnlineStatus}
                    onChange={(e) => setShowOnlineStatus(e.target.checked)}
                    className="h-4 w-4 rounded accent-violet-600"
                  />
                </div>
              </div>

              <div className="border-t border-white/5 pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:scale-105 transition-all disabled:opacity-50"
                >
                  {savingSettings ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    'Simpan Pengaturan'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                          handleSelectContact(user);
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
