import { useCallback, useRef, useState } from 'react';

/**
 * Hook untuk mengelola state panggilan, timer, dan cleanup logic.
 * Mengatasi masalah race condition dan resource leaks dalam WebRTC.
 */
export function useCallState() {
  const [callState, setCallState] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  
  // Refs untuk state machine dan lifecycle management
  const callStateRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const callCleanupLockRef = useRef(false);
  const callTimerIntervalRef = useRef(null);
  
  // ICE candidates queue
  const iceCandidatesQueueRef = useRef([]);
  
  // Stream references
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const remoteStreamRef = useRef(null);

  /**
   * Format durasi detik ke MM:SS
   */
  const formatCallDuration = useCallback((totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  /**
   * Mulai timer durasi panggilan saat panggilan tersambung
   */
  const startDurationTimer = useCallback(() => {
    if (callTimerIntervalRef.current) {
      clearInterval(callTimerIntervalRef.current);
    }
    setCallDuration(0);
    callTimerIntervalRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  /**
   * Stop timer durasi panggilan
   */
  const stopDurationTimer = useCallback(() => {
    if (callTimerIntervalRef.current) {
      clearInterval(callTimerIntervalRef.current);
      callTimerIntervalRef.current = null;
    }
  }, []);

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
    stopDurationTimer();
  }, [stopDurationTimer]);

  /**
   * Cleanup call dengan resource management yang proper.
   * Mencegah double-cleanup dengan locking mechanism.
   */
  const cleanupCall = useCallback(() => {
    if (callCleanupLockRef.current) return;
    callCleanupLockRef.current = true;

    clearCallTimers();
    setCallDuration(0);

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
    callDuration,
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
    startDurationTimer,
    stopDurationTimer,
    formatCallDuration,
    cleanupCall,
    setCallTimeout,
  };
}
