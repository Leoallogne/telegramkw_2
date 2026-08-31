import { useCallback } from 'react';

/**
 * Hook untuk mengelola WebRTC configuration dan connection management.
 * Menyediakan STUN/TURN servers dan RTCPeerConnection setup.
 */
export function useWebRTC() {
  /**
   * Get RTC configuration dengan STUN dan TURN servers.
   * STUN servers untuk NAT traversal, TURN untuk fallback.
   */
  const getRtcConfig = useCallback(() => {
    // Google STUN servers (public, reliable)
    const stunServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    // TURN servers dari environment (optional, untuk enterprise)
    const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
    const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
    const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

    const turnServers = turnUrl
      ? [{ urls: turnUrl, username: turnUsername, credential: turnCredential }]
      : [];

    return {
      iceServers: [...stunServers, ...turnServers],
      iceCandidatePoolSize: 0,
    };
  }, []);

  /**
   * Setup WebRTC event listeners untuk connection state management.
   * Callback dipanggil saat connection state berubah.
   */
  const setupConnectionListeners = useCallback((peerConnection, onStateChange, onIceStateChange, onError) => {
    if (!peerConnection) return;

    // Monitor connection state
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      if (state === 'connected' || state === 'completed') {
        onStateChange?.('connected', null);
      } else if (state === 'failed') {
        onIceStateChange?.('failed', 'Koneksi ICE gagal. Silakan coba lagi.');
      } else if (state === 'disconnected') {
        onStateChange?.('reconnecting', 'Koneksi panggilan terputus, mencoba menyambung ulang...');
      } else if (state === 'closed') {
        onStateChange?.('ended', null);
      }
    };

    // Monitor ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
      const iceState = peerConnection.iceConnectionState;
      if (iceState === 'connected' || iceState === 'completed') {
        onStateChange?.('connected', null);
      } else if (iceState === 'failed') {
        onIceStateChange?.('failed', 'Koneksi ICE gagal. Silakan coba lagi.');
      } else if (iceState === 'disconnected') {
        onStateChange?.('reconnecting', 'Koneksi panggilan terputus, mencoba menyambung ulang...');
      }
    };

    // Log ICE gathering state
    peerConnection.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', peerConnection.iceGatheringState);
    };

    // Handle errors
    peerConnection.oniceerror = (event) => {
      console.error('ICE error:', event);
      onError?.(`ICE error: ${event.errorCode} - ${event.errorText}`);
    };
  }, []);

  /**
   * Add ICE candidates secara batch untuk performa optimal.
   */
  const addIceCandidates = useCallback(async (peerConnection, candidates) => {
    if (!peerConnection || !candidates || candidates.length === 0) return;

    for (const candidate of candidates) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    }
  }, []);

  /**
   * Create media stream dari user's device.
   */
  const getMediaStream = useCallback(async (constraints = { audio: true, video: true }) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (err) {
      console.error('Error getting media stream:', err);
      throw err;
    }
  }, []);

  /**
   * Stop all media tracks dalam stream.
   */
  const stopMediaStream = useCallback((stream) => {
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    }
  }, []);

  return {
    getRtcConfig,
    setupConnectionListeners,
    addIceCandidates,
    getMediaStream,
    stopMediaStream,
  };
}
