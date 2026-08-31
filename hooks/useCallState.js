import { useCallback, useRef, useState } from 'react';

/**
 * Hook untuk mengelola state panggilan, timer, dan cleanup logic.
 * Mengatasi masalah race condition dan resource leaks dalam WebRTC.
 */
export function useCallState() {
  const [callState, setCallState] = useState(null);
  
  // Refs untuk state machine dan lifecycle management
  const callStateRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const callCleanupLockRef = useRef(false);
  
  // ICE candidates queue
  const iceCandidatesQueueRef = useRef([]);
  
  // Stream references
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const remoteStreamRef = useRef(null);

  /**
   * Update state dengan thread-safe approach.
   * Memastikan callStateRef.current selalu sync dengan React state.
   */
  const updateCallState = useCallback((updater) => {
    setCallState((prev) => {
      const nextValue = typeof updater === 'function' ? updater(prev) : { ...(prev || {}), ...updater };
      callStateRef.current = nextValue;
      return nextValue;
    });
  }, []);

  /**
   * Clear semua call timers.
   */
  const clearCallTimers = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }, []);

  /**
   * Cleanup call dengan resource management yang proper.
   * Mencegah double-cleanup dengan locking mechanism.
   */
  const cleanupCall = useCallback(() => {
    if (callCleanupLockRef.current) return;
    callCleanupLockRef.current = true;

    clearCallTimers();

    // Stop semua media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Clear remote stream dan ICE candidates
    remoteStreamRef.current = null;
    iceCandidatesQueueRef.current = [];
    callStateRef.current = null;
    setCallState(null);

    // Release lock setelah cleanup
    setTimeout(() => {
      callCleanupLockRef.current = false;
    }, 150);
  }, [clearCallTimers]);

  /**
   * Set timeout untuk panggilan dengan auto-cleanup pada timeout.
   */
  const setCallTimeout = useCallback((callback, ms) => {
    clearCallTimers();
    callTimeoutRef.current = setTimeout(callback, ms);
  }, [clearCallTimers]);

  return {
    // State
    callState,
    callStateRef,
    callTimeoutRef,
    callCleanupLockRef,
    iceCandidatesQueueRef,
    localStreamRef,
    peerConnectionRef,
    remoteStreamRef,
    
    // Methods
    setCallState,
    updateCallState,
    clearCallTimers,
    cleanupCall,
    setCallTimeout,
  };
}
