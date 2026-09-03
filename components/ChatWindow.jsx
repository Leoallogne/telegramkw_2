'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import { useCallState } from '@/hooks/useCallState';
import { useNotification } from '@/hooks/useNotification';
import { useWebRTC } from '@/hooks/useWebRTC';
import { LogOut, MessageSquare, Menu, X, Shield, RefreshCw, Users, Trash2, AlertTriangle, WifiOff, KeyRound, Check, Search, Pin, Download, UserPlus, Settings, Phone, Video, Mic, MicOff, VideoOff, PhoneOff, PhoneCall, Flame, MapPin, Folder, Eye, PlusCircle, UserCheck, Image as ImageIcon, FileText, ArrowLeft } from 'lucide-react';

export default function ChatWindow({ currentUser, onLogout }) {
  // ========================
  // Initialize Custom Hooks
  // ========================
  const callStateHook = useCallState();
  const notificationHook = useNotification();
  const webrtcHook = useWebRTC();

  // Extract from hooks
  const { 
    callState, 
    callStateRef, 
    callTimeoutRef, 
    callCleanupLockRef,
    iceCandidatesQueueRef,
    localStreamRef,
    peerConnectionRef,
    remoteStreamRef,
    updateCallState,
    clearCallTimers,
    cleanupCall,
    setCallTimeout,
  } = callStateHook;

  const { 
    notificationStatus,
    notificationThrottleRef,
    lastToneAtRef,
    setNotificationStatus,
    requestNotificationPermission,
    showWebNotification,
    playNotificationChime,
    cleanupNotifications,
  } = notificationHook;

  const {
    getRtcConfig,
    setupConnectionListeners,
    addIceCandidates,
    getMediaStream,
    stopMediaStream,
  } = webrtcHook;

  // ========================
  // Component State
  // ========================
  const [role, setRole] = useState('guest');
  const [myProfileData, setMyProfileData] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  
  // Dashboard & Conversation List State
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null); // contact or group object
  const [unreadContacts, setUnreadContacts] = useState({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 768;
  });

  // Group Creation Modal State
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [selectedMembersForGroup, setSelectedMembersForGroup] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Shared Media Vault Modal State
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [vaultTab, setVaultTab] = useState('images'); // 'images' | 'files' | 'audio' | 'locations'

  // Admin User Detail & Password Access Modal State
  const [selectedDetailUser, setSelectedDetailUser] = useState(null);

  // Admin User Management Modal state
  const [showUserModal, setShowUserModal] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [deletingUser, setDeletingUser] = useState(null);
  const [resetPasswords, setResetPasswords] = useState({});
  const [resettingUser, setResettingUser] = useState(null);
  const [resetSuccess, setResetSuccess] = useState({});

  // Add Friend Modal State
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [searchUsersResults, setSearchUsersResults] = useState([]);
  const [friendshipMap, setFriendshipMap] = useState({});
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

  // WebRTC Call State - additional refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const selectedContactRef = useRef(null);
  const adminProfileRef = useRef(null);
  const roleRef = useRef('guest');

  // Presence State: { [userId]: { online: boolean, lastSeen: string } }
  const [presenceMap, setPresenceMap] = useState({});

  // Lightbox Modal State
  const [activeLightboxUrl, setActiveLightboxUrl] = useState(null);

  // Realtime & notification health state
  const [realtimeStatus, setRealtimeStatus] = useState({
    messages: 'connecting',
    presence: 'connecting',
    calls: 'connecting',
  });
  const [smokeStatus, setSmokeStatus] = useState('Belum diuji');

  // Search Bar State
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Reply State
  const [replyingTo, setReplyingTo] = useState(null);

  // Reactions State: { [messageId]: [ { id, message_id, user_id, emoji, isMine: boolean } ] }
  const [reactionsMap, setReactionsMap] = useState({});

  // Audio playback coordinator state
  const [currentlyPlayingAudioId, setCurrentlyPlayingAudioId] = useState(null);

  // Offline status state
  const [isOffline, setIsOffline] = useState(typeof window !== 'undefined' ? !navigator.onLine : false);

  // Real-time Typing Status state: { [userId]: boolean }
  const [typingUsers, setTypingUsers] = useState({});

  // Message pagination state
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // General Chat state
  const [messages, setMessages] = useState([]);
  const [profilesMap, setProfilesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const messagesEndRef = useRef(null);
  const channelRef = useRef(null);
  const callChannelRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const loadMessagesRef = useRef(null);

  useEffect(() => {
    selectedContactRef.current = selectedContact;
  }, [selectedContact]);

  useEffect(() => {
    adminProfileRef.current = adminProfile;
  }, [adminProfile]);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  const closeAllModals = useCallback(() => {
    setShowCreateGroupModal(false);
    setShowVaultModal(false);
    setSelectedDetailUser(null);
    setShowUserModal(false);
    setShowAddFriendModal(false);
    setShowSettingsModal(false);
    setActiveLightboxUrl(null);
  }, []);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationStatus('unsupported');
      return 'unsupported';
    }

    const permission = await Notification.requestPermission();
    setNotificationStatus(permission);
    return permission;
  }, [setNotificationStatus]);

  const runNotificationPreview = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationStatus('unsupported');
      return 'Browser tidak mendukung Notification API.';
    }

    const permission = Notification.permission === 'default'
      ? await requestBrowserPermission()
      : Notification.permission;

    setNotificationStatus(permission);

    if (permission !== 'granted') {
      return 'Izin notifikasi belum diberikan.';
    }

    const payload = {
      title: 'Preview Notification',
      body: 'Tes notifikasi web berhasil dipanggil.',
      tag: 'notification-preview',
    };

    try {
      const registration = await navigator.serviceWorker?.ready;
      if (registration && typeof registration.showNotification === 'function') {
        registration.showNotification(payload.title, {
          body: payload.body,
          icon: '/favicon.ico',
          tag: payload.tag,
          renotify: true,
          vibrate: [90, 60, 90],
        });
      } else {
        new Notification(payload.title, {
          body: payload.body,
          icon: '/favicon.ico',
          tag: payload.tag,
          renotify: true,
          vibrate: [90, 60, 90],
        });
      }
      return 'Preview notifikasi berhasil dikirim.';
    } catch (err) {
      console.warn('Preview notification failed:', err);
      return 'Preview gagal dikirim di browser ini.';
    }
  }, [requestBrowserPermission, setNotificationStatus]);

  const runSoundTest = useCallback(async () => {
    await playNotificationChime();
    setNotificationStatus((prev) => (prev === 'unsupported' ? prev : 'sound-test'));
    return 'Tes suara dijalankan.';
  }, [playNotificationChime, setNotificationStatus]);

  const runRealtimeSmokeTest = useCallback(async () => {
    if (!selectedContact) {
      setSmokeStatus('Pilih chat terlebih dahulu');
      return 'Pilih chat terlebih dahulu.';
    }

    const marker = `[realtime smoke test] ${Date.now()}`;
    const payload = selectedContact.is_group
      ? { sender_id: currentUser.id, group_id: selectedContact.id, content: marker, is_read: false }
      : { sender_id: currentUser.id, receiver_id: selectedContact.id, content: marker, is_read: false };

    try {
      setSmokeStatus('Mengirim smoke test...');
      const { error } = await supabase.from('messages').insert(payload);
      if (error) throw error;

      await new Promise((resolve) => setTimeout(resolve, 1800));

      const { data, error: checkErr } = await supabase
        .from('messages')
        .select('id')
        .eq('content', marker)
        .limit(1);

      if (checkErr) throw checkErr;

      const ok = Array.isArray(data) && data.length > 0;
      setSmokeStatus(ok ? 'Realtime OK' : 'Realtime belum terdeteksi');
      return ok ? 'Realtime smoke test berhasil.' : 'Smoke test terkirim, tapi belum terdeteksi oleh Supabase realtime.';
    } catch (err) {
      console.error('Realtime smoke test failed:', err);
      setSmokeStatus('Realtime error');
      return 'Realtime smoke test gagal: ' + err.message;
    }
  }, [currentUser, selectedContact]);

  // Monitor online/offline status with auto-resync
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      if (selectedContactRef.current && loadMessagesRef.current) {
        loadMessagesRef.current(selectedContactRef.current);
      }
    };
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

  const loadUserContacts = useCallback(async (userId, userRole, adminData) => {
    try {
      if (userRole === 'admin') {
        const { data: guestProfiles } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'guest')
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false });

        setContacts(guestProfiles || []);
        const newMap = {};
        guestProfiles?.forEach((g) => {
          newMap[g.id] = g.username;
        });
        setProfilesMap((prev) => ({ ...prev, ...newMap }));
      } else {
        const { data: friendshipRows } = await supabase
          .from('friendships')
          .select('friend_id, user_id')
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        const friendIds = friendshipRows?.map((f) => f.user_id === userId ? f.friend_id : f.user_id) || [];

        const map = {};
        friendIds.forEach((id) => {
          map[id] = true;
        });
        setFriendshipMap(map);

        let friendProfiles = [];
        if (friendIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('*')
            .in('id', friendIds);
          friendProfiles = profs || [];
        }

        const contactList = [];
        if (adminData && adminData.id !== userId) {
          contactList.push({ ...adminData, is_admin_contact: true });
        }

        const newFriendMap = {};
        friendProfiles.forEach((f) => {
          if (!contactList.some((c) => c.id === f.id)) {
            contactList.push(f);
          }
          newFriendMap[f.id] = f.username;
        });
        setProfilesMap((prev) => ({ ...prev, ...newFriendMap }));

        setContacts(contactList);
      }
    } catch (err) {
      console.error('Error loading contacts:', err);
    }
  }, []);

  const loadUserGroups = useCallback(async (userId, userRole) => {
    try {
      if (userRole === 'admin') {
        const { data: allGroups } = await supabase
          .from('groups')
          .select('*')
          .order('created_at', { ascending: false });

        setGroups(allGroups || []);
      } else {
        const { data: memberRows } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', userId);

        const groupIds = memberRows?.map((m) => m.group_id) || [];

        if (groupIds.length > 0) {
          const { data: joinedGroups } = await supabase
            .from('groups')
            .select('*')
            .in('id', groupIds)
            .order('created_at', { ascending: false });

          setGroups(joinedGroups || []);
        } else {
          setGroups([]);
        }
      }
    } catch (err) {
      console.error('Error loading groups:', err);
    }
  }, []);

  // 1. Fetch user role, profiles, friendships, and groups
  useEffect(() => {
    const initializeChat = async () => {
      setLoading(true);
      setError('');
      try {
        if (typeof window !== 'undefined' && 'Notification' in window && notifyPush && Notification.permission === 'default') {
          void requestNotificationPermission();
        }

        const withTimeout = (promise, ms, message) => Promise.race([
          promise,
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), ms);
          })
        ]);

        let { data: myProfile, error: myProfileErr } = await withTimeout(
          supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single(),
          15000,
          'Memuat profil user terlalu lama.'
        );

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

        await withTimeout(
          Promise.all([
            loadUserContacts(currentUser.id, userRole, adminData),
            loadUserGroups(currentUser.id, userRole),
          ]),
          15000,
          'Memuat kontak dan grup terlalu lama.'
        );

        // Load initial unread message flags
        try {
          const { data: unreadData } = await supabase
            .from('messages')
            .select('sender_id, group_id')
            .eq('is_read', false)
            .eq('receiver_id', currentUser.id);

          if (unreadData && unreadData.length > 0) {
            const unreadMap = {};
            unreadData.forEach((row) => {
              const key = row.group_id || row.sender_id;
              if (key) unreadMap[key] = true;
            });
            setUnreadContacts((prev) => ({ ...prev, ...unreadMap }));
          }
        } catch (unErr) {
          console.warn('Could not load initial unread messages:', unErr);
        }

      } catch (err) {
        console.error('Initialization error:', err);
        setError('Gagal memuat konfigurasi chat. Coba muat ulang halaman.');
      } finally {
        setLoading(false);
      }
    };

    initializeChat();
  }, [currentUser, notifyPush, requestNotificationPermission, loadUserContacts, loadUserGroups]);

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
        setRealtimeStatus((prev) => ({
          ...prev,
          presence: status === 'SUBSCRIBED' ? 'online' : status === 'CHANNEL_ERROR' ? 'error' : 'connecting',
        }));

        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            online_at: new Date().toISOString()
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [currentUser, playNotificationChime, notifyPush, notifySound, requestNotificationPermission, showWebNotification]);

  // Bind WebRTC streams to DOM video/audio elements
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (callState) {
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      if (remoteVideoRef.current && remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
      if (remoteAudioRef.current && remoteStreamRef.current) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
      }
    }
  }, [callState]);

  // WebRTC Signaling Channel Setup
  useEffect(() => {
    if (!currentUser) return;

    const callChannel = supabase.channel('call-signaling-room');

    callChannel.subscribe((status) => {
      setRealtimeStatus((prev) => ({
        ...prev,
        calls: status === 'SUBSCRIBED' ? 'online' : status === 'CHANNEL_ERROR' ? 'error' : 'connecting',
      }));
    });
    
    callChannel
      .on('broadcast', { event: 'call-offer' }, async ({ payload }) => {
        if (payload.targetId === currentUser.id) {
          const incomingCall = {
            targetId: payload.callerId,
            targetName: payload.callerName,
            isVideo: payload.isVideo,
            isIncoming: true,
            isConnected: false,
            status: 'ringing',
            sdpOffer: payload.offer,
            isMuted: false,
            isCameraOff: false,
            error: null,
          };

          if (callStateRef.current && callStateRef.current.targetId === payload.callerId && callStateRef.current.status === 'ringing') {
            return;
          }

          playNotificationChime();
          updateCallState(incomingCall);
        }
      })
      .on('broadcast', { event: 'call-answer' }, async ({ payload }) => {
        if (payload.targetId === currentUser.id && peerConnectionRef.current) {
          try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
            updateCallState((prev) => ({
              ...prev,
              isConnected: true,
              status: 'connected',
              error: null,
            }));

            while (iceCandidatesQueueRef.current.length > 0) {
              const cand = iceCandidatesQueueRef.current.shift();
              await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(cand));
            }
          } catch (e) {
            console.error('Error setting remote description answer:', e);
            updateCallState((prev) => ({ ...prev, status: 'error', error: 'Gagal menghubungkan panggilan.' }));
          }
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.targetId === currentUser.id) {
          try {
            if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
              await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } else {
              iceCandidatesQueueRef.current.push(payload.candidate);
            }
          } catch (e) {
            console.error('Error adding ICE candidate:', e);
          }
        }
      })
      .on('broadcast', { event: 'call-end' }, ({ payload }) => {
        if (payload.targetId === currentUser.id) {
          cleanupCall();
        }
      })
      .on('broadcast', { event: 'call-decline' }, ({ payload }) => {
        if (payload.targetId === currentUser.id) {
          alert('Panggilan ditolak.');
          cleanupCall();
        }
      })
      .subscribe();

    callChannelRef.current = callChannel;

    return () => {
      supabase.removeChannel(callChannel);
      clearCallTimers();
    };
  }, [currentUser, clearCallTimers, cleanupCall]);

  // Start Outgoing WebRTC Call
  const startCall = async (isVideo) => {
    if (!selectedContact || selectedContact.is_group) return;

    if (typeof window === 'undefined' || !('navigator' in window) || !navigator.mediaDevices?.getUserMedia) {
      alert('Browser ini tidak mendukung panggilan suara/video.');
      return;
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      alert('Panggilan web memerlukan HTTPS atau localhost.');
      return;
    }

    try {
      cleanupCall();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo
      });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection(getRtcConfig());
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        remoteStreamRef.current = event.streams[0];
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0];
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          updateCallState((prev) => ({ ...prev, status: 'connected', isConnected: true, error: null }));
        } else if (state === 'failed' || state === 'disconnected') {
          updateCallState((prev) => ({ ...prev, status: 'reconnecting', error: 'Koneksi panggilan terputus, mencoba menyambung ulang...' }));
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        if (state === 'connected') {
          updateCallState((prev) => ({ ...prev, status: 'connected', isConnected: true, error: null }));
        } else if (state === 'failed' || state === 'closed') {
          updateCallState((prev) => ({ ...prev, status: 'error', error: 'Koneksi ICE gagal. Silakan coba lagi.' }));
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && callChannelRef.current) {
          callChannelRef.current.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: { candidate: event.candidate, targetId: selectedContact.id, callerId: currentUser.id }
          });
        }
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: isVideo });
      await pc.setLocalDescription(offer);

      updateCallState({
        targetId: selectedContact.id,
        targetName: selectedContact.username,
        isVideo,
        isIncoming: false,
        isConnected: false,
        status: 'connecting',
        isMuted: false,
        isCameraOff: false,
        error: null,
      });

      callTimeoutRef.current = setTimeout(() => {
        if (callStateRef.current?.status === 'connecting' || callStateRef.current?.status === 'ringing') {
          cleanupCall();
          alert('Panggilan tidak terhubung dalam waktu yang ditentukan.');
        }
      }, 30000);

      if (callChannelRef.current) {
        callChannelRef.current.send({
          type: 'broadcast',
          event: 'call-offer',
          payload: {
            callerId: currentUser.id,
            callerName: myProfileData?.username || 'User',
            targetId: selectedContact.id,
            isVideo,
            offer
          }
        });
      }

    } catch (err) {
      console.error('Start call error:', err);
      alert('Gagal mengakses kamera/mikrofon.');
    }
  };

  // Accept Incoming WebRTC Call
  const acceptCall = async () => {
    if (!callState || !callState.sdpOffer) return;

    if (typeof window === 'undefined' || !('navigator' in window) || !navigator.mediaDevices?.getUserMedia) {
      alert('Browser ini tidak mendukung panggilan suara/video.');
      return;
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      alert('Panggilan web memerlukan HTTPS atau localhost.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callState.isVideo
      });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection(getRtcConfig());
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        remoteStreamRef.current = event.streams[0];
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0];
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          updateCallState((prev) => ({ ...prev, status: 'connected', isConnected: true, error: null }));
        } else if (state === 'failed' || state === 'disconnected') {
          updateCallState((prev) => ({ ...prev, status: 'reconnecting', error: 'Koneksi panggilan terputus, mencoba menyambung ulang...' }));
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        if (state === 'connected') {
          updateCallState((prev) => ({ ...prev, status: 'connected', isConnected: true, error: null }));
        } else if (state === 'failed' || state === 'closed') {
          updateCallState((prev) => ({ ...prev, status: 'error', error: 'Koneksi ICE gagal. Silakan coba lagi.' }));
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && callChannelRef.current) {
          callChannelRef.current.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: { candidate: event.candidate, targetId: callState.targetId, callerId: currentUser.id }
          });
        }
      };

      updateCallState((prev) => ({
        ...prev,
        status: 'connecting',
        isIncoming: false,
        isConnected: false,
        error: null,
      }));

      await pc.setRemoteDescription(new RTCSessionDescription(callState.sdpOffer));
      const answer = await pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: callState.isVideo });
      await pc.setLocalDescription(answer);

      while (iceCandidatesQueueRef.current.length > 0) {
        const cand = iceCandidatesQueueRef.current.shift();
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      }

      if (callChannelRef.current) {
        callChannelRef.current.send({
          type: 'broadcast',
          event: 'call-answer',
          payload: { answer, callerId: currentUser.id, targetId: callState.targetId }
        });
      }

      callTimeoutRef.current = setTimeout(() => {
        if (callStateRef.current?.status === 'connecting') {
          cleanupCall();
          alert('Panggilan gagal tersambung. Silakan coba lagi.');
        }
      }, 30000);

    } catch (err) {
      console.error('Accept call error:', err);
      alert('Gagal menerima panggilan.');
    }
  };

  const declineCall = () => {
    if (callState && callChannelRef.current) {
      callChannelRef.current.send({
        type: 'broadcast',
        event: 'call-decline',
        payload: { callerId: currentUser.id, targetId: callState.targetId }
      });
    }
    cleanupCall();
  };

  const endCall = () => {
    if (callState && callChannelRef.current) {
      callChannelRef.current.send({
        type: 'broadcast',
        event: 'call-end',
        payload: { callerId: currentUser.id, targetId: callState.targetId }
      });
    }
    cleanupCall();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setCallState((prev) => ({ ...prev, isMuted: !audioTrack.enabled }));
      }
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCallState((prev) => ({ ...prev, isCameraOff: !videoTrack.enabled }));
      }
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

  const loadMessages = async (targetObj) => {
    if (!targetObj) return;
    try {
      let query;
      if (targetObj.is_group) {
        query = supabase
          .from('messages')
          .select('*')
          .eq('group_id', targetObj.id)
          .order('created_at', { ascending: false })
          .limit(40);
      } else {
        query = supabase
          .from('messages')
          .select('*')
          .or(
            `and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetObj.id}),and(sender_id.eq.${targetObj.id},receiver_id.eq.${currentUser.id})`
          )
          .order('created_at', { ascending: false })
          .limit(40);
      }

      const { data, error: msgErr } = await query;
      if (msgErr) throw msgErr;

      const ordered = (data || []).reverse();
      setMessages(ordered);
      setHasMoreMessages((data || []).length === 40);

      if (ordered.length > 0) {
        await loadReactions(ordered.map((m) => m.id));
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  });

  const handleLoadOlderMessages = async () => {
    if (!selectedContact || loadingMore || !hasMoreMessages || messages.length === 0) return;
    setLoadingMore(true);
    const oldestMessage = messages[0];
    try {
      let query;
      if (selectedContact.is_group) {
        query = supabase
          .from('messages')
          .select('*')
          .eq('group_id', selectedContact.id)
          .lt('created_at', oldestMessage.created_at)
          .order('created_at', { ascending: false })
          .limit(30);
      } else {
        query = supabase
          .from('messages')
          .select('*')
          .or(
            `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedContact.id}),and(sender_id.eq.${selectedContact.id},receiver_id.eq.${currentUser.id})`
          )
          .lt('created_at', oldestMessage.created_at)
          .order('created_at', { ascending: false })
          .limit(30);
      }

      const { data, error: moreErr } = await query;
      if (moreErr) throw moreErr;

      if (data && data.length > 0) {
        const olderOrdered = data.reverse();
        setMessages((prev) => [...olderOrdered, ...prev]);
        setHasMoreMessages(data.length === 30);
        await loadReactions(olderOrdered.map((m) => m.id));
      } else {
        setHasMoreMessages(false);
      }
    } catch (err) {
      console.error('Error loading older messages:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const markMessagesAsRead = useCallback(async (partnerId) => {
    if (!partnerId || !currentUser) return;
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
  }, [currentUser]);

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
          const activeTarget = selectedContactRef.current;

          let isMatch = false;
          if (activeTarget?.is_group) {
            isMatch = newMsg.group_id === activeTarget.id;
          } else {
            isMatch = (newMsg.sender_id === activeTarget?.id && newMsg.receiver_id === currentUser.id) ||
                      (newMsg.sender_id === currentUser.id && newMsg.receiver_id === activeTarget?.id);
          }

          if (isMatch) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              const optIndex = prev.findIndex(
                (m) => m.is_sending && m.sender_id === newMsg.sender_id && m.content === newMsg.content
              );
              if (optIndex !== -1) {
                const nextList = [...prev];
                nextList[optIndex] = newMsg;
                return nextList;
              }
              return [...prev, newMsg];
            });

            if (newMsg.sender_id !== currentUser.id) {
              const shouldAlert = document.visibilityState === 'hidden' || !activeTarget || !isMatch;
              if (shouldAlert || notifySound) {
                await playNotificationChime();
              }
              if (notifyPush && shouldAlert) {
                const senderName = profilesMap[newMsg.sender_id] || 'Pesan baru';
                await showWebNotification({
                  title: senderName,
                  body: newMsg.content?.slice(0, 120) || 'Anda menerima pesan baru',
                  tag: newMsg.id,
                });
              }
              if (!activeTarget?.is_group) await markMessagesAsRead(activeTarget.id);
            }
          }

          if (newMsg.sender_id !== currentUser.id && !isMatch) {
            const key = newMsg.group_id || newMsg.sender_id;
            setUnreadContacts((prev) => ({
              ...prev,
              [key]: true,
            }));

            if (notifySound) {
              await playNotificationChime();
            }
            if (notifyPush) {
              const senderName = profilesMap[newMsg.sender_id] || 'Pesan baru';
              await showWebNotification({
                title: senderName,
                body: newMsg.content?.slice(0, 120) || 'Anda menerima pesan baru',
                tag: newMsg.id,
              });
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
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const deletedMsg = payload.old;
          setMessages((prev) => prev.filter((m) => m.id !== deletedMsg.id));
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
        const { userId, targetId, isGroup, isTyping } = payload.payload || {};
        if (!userId || userId === currentUser.id) return;
        const activeTarget = selectedContactRef.current;
        let isRelevant = false;
        if (isGroup) {
          isRelevant = Boolean(activeTarget?.is_group && activeTarget.id === targetId);
        } else {
          isRelevant = Boolean(!activeTarget?.is_group && targetId === currentUser.id && activeTarget?.id === userId);
        }

        if (isRelevant) {
          setTypingUsers((prev) => ({
            ...prev,
            [userId]: isTyping,
          }));
        } else if (!isTyping) {
          setTypingUsers((prev) => {
            const nextMap = { ...prev };
            delete nextMap[userId];
            return nextMap;
          });
        }
      })
      .subscribe((status) => {
        setRealtimeStatus((prev) => ({
          ...prev,
          messages: status === 'SUBSCRIBED' ? 'online' : status === 'CHANNEL_ERROR' ? 'error' : 'connecting',
        }));
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, loading, markMessagesAsRead, notifyPush, notifySound, playNotificationChime, profilesMap, showWebNotification]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectContact = async (targetObj) => {
    setSelectedContact(targetObj);
    setUnreadContacts((prev) => ({
      ...prev,
      [targetObj.id]: false,
    }));
    await loadMessages(targetObj);
    if (!targetObj.is_group) await markMessagesAsRead(targetObj.id);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleSendMessage = async (content, replyToId = null, expireSeconds = null) => {
    if (!selectedContact) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const optimisticMsg = {
      id: tempId,
      sender_id: currentUser.id,
      receiver_id: selectedContact.is_group ? null : selectedContact.id,
      group_id: selectedContact.is_group ? selectedContact.id : null,
      content: content,
      is_read: false,
      reply_to_id: replyToId,
      expire_seconds: expireSeconds,
      created_at: new Date().toISOString(),
      is_sending: true,
    };

    // Instant UI feedback (0ms perceived latency)
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const payload = {
        sender_id: currentUser.id,
        content: content,
        is_read: false
      };

      if (selectedContact.is_group) {
        payload.group_id = selectedContact.id;
      } else {
        payload.receiver_id = selectedContact.id;
      }

      if (replyToId) payload.reply_to_id = replyToId;
      if (expireSeconds) payload.expire_seconds = expireSeconds;

      const { data: insertedMsg, error: sendErr } = await supabase
        .from('messages')
        .insert(payload)
        .select()
        .single();

      if (sendErr) throw sendErr;

      if (insertedMsg) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? insertedMsg : m))
        );
      }
    } catch (err) {
      console.error('Send error:', err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      alert('Gagal mengirim pesan.');
    }
  };

  const handleTypingChange = (isTyping) => {
    if (channelRef.current && selectedContactRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          userId: currentUser.id,
          targetId: selectedContactRef.current.id,
          isGroup: Boolean(selectedContactRef.current.is_group),
          isTyping
        }
      });
    }
  };

  // Group Creation Handler
  const handleCreateGroupSubmit = async (e) => {
    e.preventDefault();
    const cleanName = newGroupName.trim();
    if (!cleanName) {
      alert('Nama grup tidak boleh kosong!');
      return;
    }

    setCreatingGroup(true);
    try {
      const { data: newGroup, error: groupErr } = await supabase
        .from('groups')
        .insert({
          name: cleanName,
          description: newGroupDesc.trim(),
          created_by: currentUser.id
        })
        .select()
        .single();

      if (groupErr) throw groupErr;

      const membersToInsert = [
        { group_id: newGroup.id, user_id: currentUser.id, role: 'admin' },
        ...selectedMembersForGroup.map((userId) => ({
          group_id: newGroup.id,
          user_id: userId,
          role: 'member'
        }))
      ];

      const { error: memberErr } = await supabase
        .from('group_members')
        .insert(membersToInsert);

      if (memberErr) throw memberErr;

      const groupObj = { ...newGroup, is_group: true, username: newGroup.name };
      setGroups((prev) => [groupObj, ...prev]);

      setShowCreateGroupModal(false);
      setNewGroupName('');
      setNewGroupDesc('');
      setSelectedMembersForGroup([]);
      handleSelectContact(groupObj);
    } catch (err) {
      console.error('Create group error:', err);
      alert('Gagal membuat grup: ' + err.message);
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleSelfDestructMessage = async (messageId) => {
    try {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      await supabase.from('messages').delete().eq('id', messageId);
    } catch (err) {
      console.error('Self-destruct delete error:', err);
    }
  };

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

  const handleSearchUsers = (query) => {
    setFriendSearchQuery(query);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(async () => {
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
    }, 300);
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

      if (notifyPush && typeof window !== 'undefined' && 'Notification' in window) {
        await requestNotificationPermission();
      }

      const { error: profileSyncErr } = await supabase
        .from('profiles')
        .update({
          username: cleanUsername,
          status_bio: editBio.trim(),
          notify_sound: notifySound,
          notify_push: notifyPush,
          show_read_receipts: showReadReceipts,
          show_online_status: showOnlineStatus,
        })
        .eq('id', currentUser.id)
        .select();

      if (profileSyncErr) throw profileSyncErr;

      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (err) {
      console.error('Save settings error:', err);
      alert('Gagal menyimpan profil: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const filteredAdminUsers = allUsers.filter((user) =>
    user.username?.toLowerCase().includes(adminSearchQuery.toLowerCase().trim())
  );

  const openUserManagement = async () => {
    closeAllModals();
    setShowUserModal(true);
    setSelectedDetailUser(null);
    setResetPasswords({});
    setResetSuccess({});
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
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

  // Shared Vault Items Filtering
  const vaultImages = messages.filter((m) => m.content.includes('[image:'));
  const vaultFiles = messages.filter((m) => m.content.includes('[file:'));
  const vaultAudio = messages.filter((m) => m.content.includes('[audio:'));
  const vaultLocations = messages.filter((m) => m.content.includes('[location:'));

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
        <p className="text-sm text-slate-400 animate-pulse">Memuat obrolan & grup...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-slate-950 font-sans text-slate-200">
      
      {/* WebRTC Active / Incoming Call Modal Overlay */}
      {callState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-fade-in">
          <audio ref={remoteAudioRef} autoPlay className="hidden" />

          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-slate-950/90 shadow-2xl p-6 text-center">
            <div className="mb-6 flex flex-col items-center">
              <div className="relative mb-3 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-tr from-violet-600 to-indigo-500 font-extrabold text-white text-3xl shadow-xl shadow-indigo-600/30">
                {callState.targetName ? callState.targetName.charAt(0).toUpperCase() : 'U'}
                <span className="animate-ping absolute inset-0 rounded-3xl bg-violet-500/20" />
              </div>
              <h3 className="text-xl font-bold text-slate-100">{callState.targetName}</h3>
              <p className="mt-1 text-xs font-mono font-semibold text-violet-400">
                {callState.isIncoming
                  ? (callState.isVideo ? 'Panggilan Video Masuk...' : 'Panggilan Suara Masuk...')
                  : callState.isConnected
                  ? (callState.isVideo ? 'Video Call Aktif' : 'Voice Call Aktif')
                  : 'Memanggil...'
                }
              </p>
            </div>

            {callState.isVideo && (
              <div className="relative mb-6 h-64 w-full overflow-hidden rounded-2xl bg-black border border-white/10">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="h-full w-full object-cover"
                />
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="absolute bottom-3 right-3 h-20 w-28 rounded-xl border border-white/20 object-cover shadow-lg"
                />
              </div>
            )}

            {callState.isIncoming ? (
              <div className="flex items-center justify-center gap-6">
                <button
                  type="button"
                  onClick={declineCall}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-600/30 hover:scale-110 transition-transform"
                  title="Tolak"
                >
                  <PhoneOff className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={acceptCall}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 hover:scale-110 transition-transform animate-pulse"
                  title="Terima"
                >
                  <PhoneCall className="h-6 w-6" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all ${
                    callState.isMuted
                      ? 'border-rose-500/50 bg-rose-500/20 text-rose-400'
                      : 'border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`}
                  title={callState.isMuted ? 'Buka Mute' : 'Mute'}
                >
                  {callState.isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>

                {callState.isVideo && (
                  <button
                    type="button"
                    onClick={toggleCamera}
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all ${
                      callState.isCameraOff
                        ? 'border-rose-500/50 bg-rose-500/20 text-rose-400'
                        : 'border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                    title={callState.isCameraOff ? 'Nyalakan Kamera' : 'Matikan Kamera'}
                  >
                    {callState.isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={endCall}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-600/30 hover:scale-110 transition-transform"
                  title="Tutup Panggilan"
                >
                  <PhoneOff className="h-6 w-6" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen Image Lightbox Modal */}
      {activeLightboxUrl && (
        <div
          onClick={() => setActiveLightboxUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 shadow-2xl">
            <Image
              src={activeLightboxUrl}
              alt="Fullscreen View"
              width={1200}
              height={800}
              unoptimized
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

      {/* Sidebar Backdrop Overlay for Mobile Drawer (when active chat open and drawer pulled) */}
      {isSidebarOpen && selectedContact && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-10 bg-black/70 backdrop-blur-md transition-all duration-300 md:hidden"
        />
      )}

      {/* ═══════════════════════════════════════ SIDEBAR ═══════════════════════════════════════ */}
      <div
        className={`flex flex-col bg-slate-900/95 backdrop-blur-xl border-r border-white/[0.06] transition-all duration-300 ease-in-out
          ${selectedContact 
            ? (isSidebarOpen ? 'fixed inset-y-0 left-0 z-20 w-[85vw] max-w-sm shadow-2xl shadow-black/80 flex' : 'hidden md:flex')
            : 'w-full flex'
          }
          md:static md:translate-x-0 md:w-80 lg:w-[330px] shrink-0 h-full
        `}
      >
        {/* ── Sidebar Header ── */}
        <div className="relative flex shrink-0 flex-col border-b border-white/[0.06] bg-gradient-to-b from-slate-900 to-slate-900/0 px-4 pt-4 pb-3">
          {/* Top Row: Avatar + Name + Actions */}
          <div className="flex items-center justify-between gap-3">
            {/* My Avatar + Info */}
            <button
              onClick={() => { closeAllModals(); setShowSettingsModal(true); }}
              className="flex items-center gap-3 min-w-0 flex-1 group/avatar"
              title="Lihat & Edit Profil Saya"
            >
              <div className="relative shrink-0">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-500 to-purple-500 text-base font-extrabold text-white shadow-lg shadow-violet-900/40 ring-2 ring-violet-500/30 transition-all duration-200 group-hover/avatar:ring-violet-400/60 group-hover/avatar:scale-105">
                  {myProfileData?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                {/* Online dot */}
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-slate-900 shadow-md shadow-emerald-900" />
              </div>
              <div className="min-w-0 text-left">
                <p className="truncate text-sm font-bold text-slate-100 leading-tight">{myProfileData?.username || 'User'}</p>
                <p className="truncate text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {myProfileData?.status_bio || 'Online'}
                </p>
              </div>
            </button>

            {/* Action Icons */}
            <div className="flex items-center gap-1 shrink-0">
              {role === 'guest' && (
                <button
                  onClick={() => { closeAllModals(); setShowAddFriendModal(true); }}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-400 hover:bg-violet-500/25 hover:text-violet-300 hover:border-violet-400/40 transition-all duration-200"
                  title="Tambah Teman Baru"
                >
                  <UserPlus className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => { closeAllModals(); setShowCreateGroupModal(true); }}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/25 hover:text-indigo-300 hover:border-indigo-400/40 transition-all duration-200"
                title="Buat Grup Baru"
              >
                <Users className="h-4 w-4" />
              </button>
              <button
                onClick={() => { closeAllModals(); setShowSettingsModal(true); }}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition-all duration-200"
                title="Pengaturan"
              >
                <Settings className="h-4 w-4" />
              </button>
              {/* Close button — mobile only */}
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition-all duration-200 md:hidden"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Role badge */}
          <div className="mt-3 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
              role === 'admin'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            }`}>
              {role === 'admin' ? <Shield className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />}
              {role === 'admin' ? 'Administrator' : 'Tamu Terverifikasi'}
            </span>
          </div>
        </div>

        {/* ── Admin Management Button ── */}
        {role === 'admin' && (
          <div className="shrink-0 border-b border-white/[0.06] p-3">
            <button
              onClick={openUserManagement}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-500/25 bg-gradient-to-r from-violet-600/15 to-indigo-600/10 py-2.5 text-xs font-bold uppercase tracking-wider text-violet-300 hover:from-violet-600/25 hover:to-indigo-600/20 hover:border-violet-400/40 transition-all duration-200 shadow-sm"
            >
              <Shield className="h-3.5 w-3.5" />
              Kelola User & Password
            </button>
          </div>
        )}

        {/* ── Chat List (scrollable) ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-3 space-y-5
          scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/60 hover:scrollbar-thumb-slate-600/80
        ">

          {/* ━━ Groups Section ━━ */}
          <div>
            {/* Section header */}
            <div className="mb-2.5 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="h-4 w-0.5 rounded-full bg-indigo-500"></span>
                <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400">
                  {role === 'admin' ? '👑 Semua Grup' : 'Grup Obrolan'}
                </h3>
                {groups.length > 0 && (
                  <span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-bold text-indigo-400">
                    {groups.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => { closeAllModals(); setShowCreateGroupModal(true); }}
                className="flex items-center gap-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 text-[10px] font-bold text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-all duration-200"
              >
                <PlusCircle className="h-3 w-3" />
                Buat
              </button>
            </div>

            {/* Group items */}
            {groups.length === 0 ? (
              <div className="mx-1 flex flex-col items-center rounded-2xl border border-dashed border-slate-700/40 py-5 text-center">
                <Users className="mb-1.5 h-7 w-7 text-slate-700" />
                <p className="text-[10px] text-slate-600">Belum ada grup obrolan.</p>
                <button
                  onClick={() => { closeAllModals(); setShowCreateGroupModal(true); }}
                  className="mt-2 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 py-1 text-[10px] font-bold text-indigo-400 hover:bg-indigo-500/20 transition-all"
                >
                  Buat Grup Pertama
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {groups.map((grp) => {
                  const isSelected = selectedContact?.id === grp.id && selectedContact?.is_group;
                  const hasUnread = unreadContacts[grp.id];

                  return (
                    <button
                      key={grp.id}
                      onClick={() => handleSelectContact({ ...grp, is_group: true, username: grp.name })}
                      className={`group/item relative flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all duration-200 ${
                        isSelected
                          ? 'bg-gradient-to-r from-indigo-600/25 to-violet-600/15 border border-indigo-500/30 text-white shadow-lg shadow-indigo-900/20'
                          : 'border border-transparent hover:bg-slate-800/60 hover:border-white/[0.06] text-slate-300 hover:text-white'
                      }`}
                    >
                      {/* Group avatar */}
                      <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-bold text-white shadow-md transition-all duration-200 ${
                        isSelected
                          ? 'bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-indigo-900/50'
                          : 'bg-gradient-to-tr from-indigo-700/80 to-violet-600/80 group-hover/item:from-indigo-600 group-hover/item:to-violet-500'
                      }`}>
                        <Users className="h-5 w-5" />
                        {hasUnread && (
                          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-indigo-500 border border-slate-900"></span>
                          </span>
                        )}
                      </div>

                      {/* Group info */}
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-bold leading-tight">{grp.name}</p>
                          {role === 'admin' && (
                            <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-extrabold text-amber-300 uppercase tracking-wide">SYS</span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-slate-500 group-hover/item:text-slate-400 transition-colors">
                          {grp.description || 'Grup Obrolan'}
                        </p>
                      </div>

                      {/* Selected indicator */}
                      {isSelected && (
                        <span className="shrink-0 h-2 w-2 rounded-full bg-indigo-400"></span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ━━ Direct Messages Section ━━ */}
          <div>
            {/* Section header */}
            <div className="mb-2.5 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="h-4 w-0.5 rounded-full bg-violet-500"></span>
                <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Pesan Pribadi</h3>
                {contacts.length > 0 && (
                  <span className="rounded-md bg-slate-700/50 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">
                    {contacts.length}
                  </span>
                )}
              </div>
              {role === 'guest' && (
                <button
                  onClick={handleOpenAddFriendModal}
                  className="flex items-center gap-1 rounded-lg bg-violet-500/10 border border-violet-500/20 px-2 py-1 text-[10px] font-bold text-violet-400 hover:bg-violet-500/20 hover:text-violet-300 transition-all duration-200"
                >
                  <UserPlus className="h-3 w-3" />
                  Tambah
                </button>
              )}
            </div>

            {/* Contact items */}
            {contacts.length === 0 ? (
              <div className="mx-1 flex flex-col items-center rounded-2xl border border-dashed border-slate-700/40 py-5 text-center">
                <UserPlus className="mb-1.5 h-7 w-7 text-slate-700" />
                <p className="text-[10px] text-slate-600">Belum ada kontak.</p>
                {role === 'guest' && (
                  <button
                    onClick={handleOpenAddFriendModal}
                    className="mt-2 rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-[10px] font-bold text-violet-400 hover:bg-violet-500/20 transition-all"
                  >
                    Tambah Teman
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {contacts.map((contact) => {
                  const isSelected = selectedContact?.id === contact.id && !selectedContact?.is_group;
                  const hasUnread = unreadContacts[contact.id];
                  const isContactTyping = typingUsers[contact.id];
                  const isContactOnline = presenceMap[contact.id]?.online;
                  const initials = contact.username.charAt(0).toUpperCase();

                  return (
                    <button
                      key={contact.id}
                      onClick={() => handleSelectContact(contact)}
                      className={`group/contact relative flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all duration-200 ${
                        isSelected
                          ? 'bg-gradient-to-r from-violet-600/25 to-indigo-600/15 border border-violet-500/30 text-white shadow-lg shadow-violet-900/20'
                          : 'border border-transparent hover:bg-slate-800/60 hover:border-white/[0.06] text-slate-300 hover:text-white'
                      }`}
                    >
                      {/* Avatar */}
                      <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold transition-all duration-200 ${
                        isSelected
                          ? 'bg-gradient-to-tr from-violet-600 to-indigo-500 text-white shadow-md shadow-violet-900/50'
                          : 'bg-gradient-to-tr from-slate-700 to-slate-600 text-violet-400 group-hover/contact:from-violet-700/60 group-hover/contact:to-indigo-600/60 group-hover/contact:text-white'
                      }`}>
                        {initials}
                        {/* Online status dot */}
                        {isContactOnline ? (
                          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-slate-900 shadow-sm shadow-emerald-900" />
                        ) : (
                          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-slate-600 ring-2 ring-slate-900" />
                        )}
                        {/* Unread badge */}
                        {hasUnread && (
                          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-violet-500 border border-slate-900"></span>
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center justify-between gap-1">
                          <p className="truncate text-sm font-bold leading-tight flex items-center gap-1.5">
                            {contact.username}
                            {contact.role === 'admin' && (
                              <span className="shrink-0 rounded bg-violet-500/20 px-1.5 py-0.5 text-[8px] font-extrabold text-violet-300 uppercase tracking-wide border border-violet-500/20">ADM</span>
                            )}
                            {contact.is_pinned && (
                              <Pin className="shrink-0 h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                            )}
                          </p>
                        </div>
                        <p className={`mt-0.5 truncate text-[10px] transition-colors ${
                          isContactTyping
                            ? 'text-emerald-400 font-semibold animate-pulse'
                            : isContactOnline
                            ? 'text-emerald-500/70'
                            : 'text-slate-500 group-hover/contact:text-slate-400'
                        }`}>
                          {isContactTyping
                            ? '✏️ sedang mengetik...'
                            : isContactOnline
                            ? '● Online'
                            : contact.status_bio || 'Offline'}
                        </p>
                      </div>

                      {/* Selected indicator */}
                      {isSelected && (
                        <span className="shrink-0 h-2 w-2 rounded-full bg-violet-400"></span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar Footer ── */}
        <div className="shrink-0 border-t border-white/[0.06] bg-slate-900/80 backdrop-blur-md px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${
                realtimeStatus.messages === 'online' && realtimeStatus.presence === 'online'
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-amber-400 animate-pulse'
              }`}></span>
              <span className="text-[10px] font-medium text-slate-500">
            {realtimeStatus.messages === 'online' ? 'Terhubung' : 'Menyambung...'}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-all duration-200"
              title="Keluar dari Akun"
            >
              <LogOut className="h-3 w-3" />
              Keluar
            </button>
          </div>
        </div>
      </div>

      {/* 💬 ACTIVE CHAT MAIN PANE 💬 */}
      <div className={`flex-1 flex-col overflow-hidden bg-slate-950 relative h-full ${
        selectedContact ? 'flex w-full' : 'hidden md:flex'
      }`}>
        {/* Offline notification banner */}
        {isOffline && (
          <div className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-rose-500/25 border-b border-rose-500/30 px-4 py-2 text-xs font-semibold text-rose-300 backdrop-blur-md animate-fade-in">
            <WifiOff className="h-4 w-4 animate-bounce" />
            <span>Koneksi Anda Terputus. Menunggu jaringan kembali...</span>
          </div>
        )}

        {/* Chat Window Top Bar */}
        <header className="relative flex h-16 shrink-0 items-center justify-between border-b border-white/5 bg-slate-900/40 px-3 sm:px-4 md:px-6 backdrop-blur-md">
          <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
            {selectedContact ? (
              <button
                type="button"
                onClick={() => setSelectedContact(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-all md:hidden"
                title="Kembali ke daftar percakapan"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-all md:hidden"
                title="Buka menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}

            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 font-bold text-white shadow-md">
              {selectedContact ? (selectedContact.is_group ? <Users className="h-5 w-5" /> : selectedContact.username.charAt(0).toUpperCase()) : 'C'}
              {!selectedContact?.is_group && isPartnerOnline && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-slate-950" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-slate-100 truncate">
                {selectedContact ? selectedContact.username : 'Pilih Obrolan / Grup'}
              </h2>
              <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                {selectedContact?.is_group ? (
                  <span className="text-indigo-400 font-medium">Grup Obrolan Publik</span>
                ) : isPartnerTyping ? (
                  <span className="text-emerald-400 font-medium animate-pulse flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    sedang mengetik...
                  </span>
                ) : (
                  <>
                    <span className={`h-1.5 w-1.5 rounded-full ${isPartnerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
                    {selectedContact 
                      ? (isPartnerOnline ? 'Online' : (selectedContact.status_bio || 'Offline'))
                      : 'Pilih teman atau grup obrolan'
                    }
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Header Action Buttons (Media Vault, Calls, Search, Logout) */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <div className="hidden items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-300 lg:flex">
              <span className={`h-2 w-2 rounded-full ${realtimeStatus.messages === 'online' && realtimeStatus.presence === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              Realtime {realtimeStatus.messages === 'online' ? 'OK' : 'check'}
            </div>

            {selectedContact && (
              <button
                type="button"
                onClick={() => {
                  closeAllModals();
                  setShowVaultModal(true);
                }}
                className="rounded-xl border border-white/5 bg-slate-900 p-2 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all"
                title="Brankas Galeri Media & File Tersimpan"
              >
                <Folder className="h-4 w-4" />
              </button>
            )}

            {selectedContact && !selectedContact.is_group && (
              <>
                <button
                  type="button"
                  onClick={() => startCall(false)}
                  className="rounded-xl border border-white/5 bg-slate-900 p-2 text-slate-400 hover:bg-violet-600 hover:text-white transition-all"
                  title="Panggilan Suara (Voice Call)"
                >
                  <Phone className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => startCall(true)}
                  className="rounded-xl border border-white/5 bg-slate-900 p-2 text-slate-400 hover:bg-violet-600 hover:text-white transition-all"
                  title="Panggilan Video (Video Call)"
                >
                  <Video className="h-4 w-4" />
                </button>
              </>
            )}

            {showSearch ? (
              <div className="absolute inset-0 z-20 flex items-center gap-2 bg-slate-900 px-3 sm:px-4 md:static md:bg-transparent md:p-0">
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/90 px-3 py-1.5 md:flex-initial">
                  <Search className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Cari pesan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full sm:w-44 bg-transparent text-xs text-slate-200 outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => { setShowSearch(false); setSearchQuery(''); }}
                    className="rounded-md p-0.5 text-slate-400 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="rounded-xl border border-white/5 bg-slate-900 p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
                title="Cari riwayat pesan"
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
                <p className="truncate text-slate-300 text-[11px]">
                  {(() => {
                    const c = pinnedMessageInChat.content || '';
                    if (c.includes('[image:')) return '📷 [Foto]';
                    if (c.includes('[audio:')) return '🎵 [Pesan Suara]';
                    if (c.includes('[file:')) {
                      const m = c.match(/\[file:([^|]+)\|/);
                      return `📁 [File: ${m ? m[1] : 'Dokumen'}]`;
                    }
                    if (c.includes('[location:')) {
                      const m = c.match(/\[location:[^|]+\|([^\]]+)\]/);
                      return `📍 [Lokasi: ${m ? m[1] : 'Peta'}]`;
                    }
                    return c;
                  })()}
                </p>
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
                Pilih teman, grup obrolan, atau Support Admin dari daftar di sebelah kiri untuk mulai mengobrol.
              </p>
            </div>
          ) : (
            <>
              {hasMoreMessages && (
                <div className="flex justify-center py-2">
                  <button
                    type="button"
                    onClick={handleLoadOlderMessages}
                    disabled={loadingMore}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/80 px-4 py-1.5 text-xs text-violet-400 hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Memuat pesan sebelumnya...
                      </>
                    ) : (
                      '↑ Muat pesan sebelumnya'
                    )}
                  </button>
                </div>
              )}

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
                      onSelfDestruct={handleSelfDestructMessage}
                      currentlyPlayingAudioId={currentlyPlayingAudioId}
                      onPlayAudio={(id) => setCurrentlyPlayingAudioId(id)}
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

      {/* Group Creation Modal */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md max-h-[90dvh] flex flex-col rounded-2xl sm:rounded-3xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <Users className="h-5 w-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-100">Buat Grup Obrolan Baru</h3>
              </div>
              <button
                onClick={() => setShowCreateGroupModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroupSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Nama Grup</label>
                <input
                  type="text"
                  placeholder="Misal: Tim Developer..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Deskripsi Grup (Opsional)</label>
                <input
                  type="text"
                  placeholder="Deskripsi singkat..."
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
                />
              </div>

              {/* Member Selector Checklist */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Pilih Anggota Grup</label>
                <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-xl border border-white/10 bg-slate-950 p-2">
                  {contacts.length === 0 ? (
                    <p className="text-[10px] text-slate-500 p-2 text-center">Tambah teman terlebih dahulu untuk diundang ke grup.</p>
                  ) : (
                    contacts.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center justify-between rounded-lg p-2 hover:bg-white/5 cursor-pointer text-xs"
                      >
                        <span className="font-bold text-slate-200">{c.username}</span>
                        <input
                          type="checkbox"
                          checked={selectedMembersForGroup.includes(c.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMembersForGroup([...selectedMembersForGroup, c.id]);
                            } else {
                              setSelectedMembersForGroup(selectedMembersForGroup.filter((id) => id !== c.id));
                            }
                          }}
                          className="h-4 w-4 rounded accent-indigo-600"
                        />
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t border-white/5 pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={creatingGroup}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:scale-105 transition-all disabled:opacity-50"
                >
                  {creatingGroup ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Buat Grup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shared Media & File Vault Gallery Modal */}
      {showVaultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <Folder className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Brankas Galeri Media & File</h3>
                  <p className="text-[10px] text-slate-500">{selectedContact?.username || 'Percakapan'}</p>
                </div>
              </div>
              <button
                onClick={() => setShowVaultModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Vault Tabs Header */}
            <div className="flex border-b border-white/5 bg-slate-950/40 px-4 sm:px-6 shrink-0 text-xs font-bold overflow-x-auto scrollbar-none">
              <button
                onClick={() => setVaultTab('images')}
                className={`flex items-center gap-1.5 py-3 px-3 border-b-2 transition-colors ${
                  vaultTab === 'images' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <ImageIcon className="h-4 w-4" /> Foto ({vaultImages.length})
              </button>
              <button
                onClick={() => setVaultTab('files')}
                className={`flex items-center gap-1.5 py-3 px-3 border-b-2 transition-colors ${
                  vaultTab === 'files' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <FileText className="h-4 w-4" /> Dokumen ({vaultFiles.length})
              </button>
              <button
                onClick={() => setVaultTab('audio')}
                className={`flex items-center gap-1.5 py-3 px-3 border-b-2 transition-colors ${
                  vaultTab === 'audio' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <Mic className="h-4 w-4" /> Voice Notes ({vaultAudio.length})
              </button>
              <button
                onClick={() => setVaultTab('locations')}
                className={`flex items-center gap-1.5 py-3 px-3 border-b-2 transition-colors ${
                  vaultTab === 'locations' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <MapPin className="h-4 w-4" /> Lokasi GPS ({vaultLocations.length})
              </button>
            </div>

            {/* Vault Tab Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {vaultTab === 'images' && (
                vaultImages.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 p-8">Belum ada foto yang dibagikan.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {vaultImages.map((m) => {
                      const imgMatch = m.content.match(/\[image:(https?:\/\/[^\]]+)\]/);
                      const imgUrl = imgMatch ? imgMatch[1] : null;
                      if (!imgUrl) return null;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setActiveLightboxUrl(imgUrl)}
                          className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/40"
                        >
                          <Image
                            src={imgUrl}
                            alt="Vault Media"
                            width={400}
                            height={400}
                            unoptimized
                            className="h-full w-full object-cover group-hover:scale-110 transition-transform"
                          />
                        </button>
                      );
                    })}
                  </div>
                )
              )}

              {vaultTab === 'files' && (
                vaultFiles.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 p-8">Belum ada dokumen yang dibagikan.</p>
                ) : (
                  <div className="space-y-2">
                    {vaultFiles.map((m) => {
                      const fileMatch = m.content.match(/\[file:([^|]+)\|(https?:\/\/[^\]]+)\]/);
                      if (!fileMatch) return null;
                      return (
                        <div key={m.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 p-3 text-xs">
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-indigo-400" />
                            <span className="font-semibold text-slate-200">{fileMatch[1]}</span>
                          </div>
                          <a href={fileMatch[2]} target="_blank" download className="p-2 rounded-lg bg-white/10 hover:bg-indigo-600 text-white">
                            <Download className="h-4 w-4" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {vaultTab === 'audio' && (
                vaultAudio.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 p-8">Belum ada pesan suara yang dibagikan.</p>
                ) : (
                  <div className="space-y-2">
                    {vaultAudio.map((m) => {
                      const audioMatch = m.content.match(/\[audio:(https?:\/\/[^\]]+)\]/);
                      if (!audioMatch) return null;
                      return (
                        <div key={m.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 p-3 text-xs">
                          <audio src={audioMatch[1]} controls className="w-full h-8" />
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {vaultTab === 'locations' && (
                vaultLocations.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 p-8">Belum ada lokasi GPS yang dibagikan.</p>
                ) : (
                  <div className="space-y-2">
                    {vaultLocations.map((m) => {
                      const locMatch = m.content.match(/\[location:([^,]+),([^|]+)\|([^\]]+)\]/);
                      if (!locMatch) return null;
                      return (
                        <div key={m.id} className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-slate-950/60 p-3 text-xs">
                          <div className="flex items-center gap-3">
                            <MapPin className="h-5 w-5 text-emerald-400" />
                            <div>
                              <p className="font-bold text-slate-200">{locMatch[3]}</p>
                              <p className="text-[10px] text-slate-500">{locMatch[1]}, {locMatch[2]}</p>
                            </div>
                          </div>
                          <a href={`https://www.google.com/maps?q=${locMatch[1]},${locMatch[2]}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold">
                            Maps
                          </a>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin User Detail & Password Access Modal */}
      {selectedDetailUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl overflow-hidden animate-zoom-in p-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 font-bold text-white text-lg">
                  {selectedDetailUser.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">{selectedDetailUser.username}</h3>
                  <p className="text-[10px] text-slate-500">ID: {selectedDetailUser.id}</p>
                </div>
              </div>
              <button onClick={() => setSelectedDetailUser(null)} className="p-1 text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-white/5 bg-slate-950 p-3 space-y-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Bio Status</p>
                <p className="text-slate-200">{selectedDetailUser.status_bio || '-'}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl border border-white/5 bg-slate-950 p-2.5">
                  <p className="text-[9px] font-bold text-slate-500 uppercase">Tanggal Terdaftar</p>
                  <p className="text-slate-200 mt-0.5">{formatDate(selectedDetailUser.created_at)}</p>
                </div>
                <div className="rounded-xl border border-white/5 bg-slate-950 p-2.5">
                  <p className="text-[9px] font-bold text-slate-500 uppercase">Peran Akun</p>
                  <p className="text-violet-400 font-bold mt-0.5 uppercase">{selectedDetailUser.role}</p>
                </div>
              </div>

              <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-3 space-y-2">
                <p className="text-[10px] font-bold text-violet-300 uppercase flex items-center gap-1">
                  <KeyRound className="h-3.5 w-3.5" /> Akses Kredensial & Reset Passkey
                </p>
                <p className="text-[11px] text-slate-400">
                  Password pengguna disimpan secara enkripsi (hash). Anda dapat menyetel kata sandi passkey baru secara instan di bawah ini:
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Setel Password Baru..."
                    value={resetPasswords[selectedDetailUser.id] || ''}
                    onChange={(e) => setResetPasswords({ ...resetPasswords, [selectedDetailUser.id]: e.target.value })}
                    className="flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 outline-none"
                  />
                  <button
                    onClick={() => handleResetPassword(selectedDetailUser.id)}
                    disabled={resettingUser === selectedDetailUser.id}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-500"
                  >
                    Setel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Friend Search Modal */}
      {showAddFriendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md max-h-[90dvh] flex flex-col rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 shrink-0">
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

            <div className="p-4 space-y-4 overflow-y-auto">
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
                            <Check className="h-3 w-3" /> Teman
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
          <div className="relative w-full max-w-md max-h-[90dvh] flex flex-col rounded-2xl sm:rounded-3xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
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

            <form onSubmit={handleSaveProfileSettings} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
              {settingsSuccess && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-300">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>Pengaturan profil berhasil disimpan!</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Username</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-violet-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Bio Status</label>
                <input
                  type="text"
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-violet-500"
                />
              </div>

              <div className="border-t border-white/5 pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Perizinan Notifikasi</h4>
                  <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-violet-300">
                    {notificationStatus === 'unsupported' ? 'unsupported' : notificationStatus}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">Suara Notifikasi Chat</span>
                  <input
                    type="checkbox"
                    checked={notifySound}
                    onChange={(e) => setNotifySound(e.target.checked)}
                    className="h-4 w-4 rounded accent-violet-600"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">Push Notification Browser</span>
                  <input
                    type="checkbox"
                    checked={notifyPush}
                    onChange={(e) => setNotifyPush(e.target.checked)}
                    className="h-4 w-4 rounded accent-violet-600"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      runSoundTest();
                    }}
                    className="rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-[10px] font-bold text-slate-200 hover:border-violet-500/40"
                  >
                    Test Suara
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await runNotificationPreview();
                      alert(result);
                    }}
                    className="rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-[10px] font-bold text-slate-200 hover:border-violet-500/40"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await requestBrowserPermission();
                      alert(result === 'granted' ? 'Izin notifikasi granted.' : `Izin notifikasi: ${result}`);
                    }}
                    className="rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-[10px] font-bold text-slate-200 hover:border-violet-500/40"
                  >
                    Permission
                  </button>
                </div>
              </div>

              <div className="border-t border-white/5 pt-3 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Privasi & Keamanan</h4>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">Tampilkan Centang Dibaca (✓✓)</span>
                  <input
                    type="checkbox"
                    checked={showReadReceipts}
                    onChange={(e) => setShowReadReceipts(e.target.checked)}
                    className="h-4 w-4 rounded accent-violet-600"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">Tampilkan Status Online</span>
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
          <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Dashboard Admin</h3>
                  <p className="text-[10px] text-slate-500">Monitoring user, aktivitas, dan keamanan sistem</p>
                </div>
              </div>
              <button
                onClick={() => setShowUserModal(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 px-6 py-3 border-b border-white/5 bg-slate-950/40 shrink-0">
              <div className="rounded-xl border border-white/5 bg-slate-900 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Total User</p>
                <p className="mt-1 text-xl font-extrabold text-violet-400">{allUsers.length}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-slate-900 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Online Saat Ini</p>
                <p className="mt-1 text-xl font-extrabold text-emerald-400">{Object.keys(presenceMap).length}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-slate-900 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Pesan Dalam Chat</p>
                <p className="mt-1 text-xl font-extrabold text-indigo-400">{messages.length}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-slate-900 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Grup Aktif</p>
                <p className="mt-1 text-xl font-extrabold text-amber-400">{groups.length}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-slate-950/30 px-6 py-3 shrink-0">
              <div className="flex items-center gap-2 text-[11px] text-slate-300">
                <span className={`h-2 w-2 rounded-full ${realtimeStatus.messages === 'online' && realtimeStatus.presence === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                Realtime health: {realtimeStatus.messages === 'online' ? 'stable' : 'connecting'}
              </div>
              <button
                type="button"
                onClick={async () => {
                  const result = await runRealtimeSmokeTest();
                  alert(result);
                }}
                className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold uppercase text-emerald-300 hover:bg-emerald-500/20"
              >
                Realtime smoke test
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-white/5 bg-slate-950/30 px-6 py-3 shrink-0">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={adminSearchQuery}
                onChange={(e) => setAdminSearchQuery(e.target.value)}
                placeholder="Cari user berdasarkan username..."
                className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
              />
              {adminSearchQuery && (
                <button
                  type="button"
                  onClick={() => setAdminSearchQuery('')}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredAdminUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-slate-600">
                  <Users className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-semibold text-slate-400">Belum ada user sesuai pencarian</p>
                  <p className="text-xs text-slate-600 mt-1">Coba kata kunci lain atau reset pencarian.</p>
                </div>
              ) : (
                filteredAdminUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex flex-col md:flex-row md:items-center gap-4 rounded-xl border border-white/5 bg-slate-950/50 p-4 transition-all duration-200 hover:border-white/10"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-slate-800 to-slate-700 font-bold text-violet-400 text-lg">
                        {user.username.charAt(0).toUpperCase()}
                        {presenceMap[user.id]?.online && (
                          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-100 truncate">{user.username}</p>
                          {user.role === 'admin' && (
                            <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase text-violet-300">Admin</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {presenceMap[user.id]?.online ? 'Online sekarang' : 'Offline'} · Terdaftar: {formatDate(user.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 shrink-0 border-t border-white/5 pt-3 md:border-t-0 md:pt-0">
                      <button
                        onClick={() => {
                          setShowUserModal(false);
                          setSelectedDetailUser(user);
                        }}
                        className="flex h-9 items-center gap-1 px-3 rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 text-xs font-semibold transition-all duration-200"
                        title="Lihat Detail & Akses Password"
                      >
                        <Eye className="h-4 w-4" />
                        Detail
                      </button>

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

            <div className="border-t border-white/5 px-6 py-3 flex items-center gap-2 text-[10px] text-slate-500 shrink-0">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500/60" />
              <span>Untuk keamanan, password mentah disembunyikan. Klik Detail untuk mengelola akses kata sandi.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
