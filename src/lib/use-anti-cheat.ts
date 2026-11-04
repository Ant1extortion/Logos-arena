"use client";

import { useState, useRef, useEffect, useCallback, ClipboardEvent, DragEvent, KeyboardEvent } from "react";
import { TelemetryPayload } from "./anti-cheat";

export interface UseAntiCheatOptions {
  mode?: "PVE" | "PVP" | "SUNDAY_BOUNTY" | string;
  onViolation?: (message: string) => void;
}

export const PASTE_WARNING_MESSAGE =
  "LogosArena Anti-Cheat: External paste disabled. Construct your own argument.";

/**
 * Lightweight browser/device fingerprinting helper for anti-smurfing.
 */
export function generateDeviceHash(): string {
  if (typeof window === "undefined") {
    return "ssr_device_hash";
  }

  try {
    const nav = window.navigator;
    const screen = window.screen;
    const raw = [
      nav.userAgent || "",
      nav.language || "",
      screen.width || 0,
      screen.height || 0,
      screen.colorDepth || 0,
      new Date().getTimezoneOffset(),
      nav.hardwareConcurrency || 0,
    ].join("###");

    // Simple, deterministic 32-bit hash implementation (Murmur/djb2 variant)
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return `dev_${Math.abs(hash).toString(16)}`;
  } catch {
    return "unknown_device_hash";
  }
}

/**
 * React hook for debate and Blitz textareas.
 * - Blocks onPaste, onDrop, and onCopy events (showing a toast warning)
 * - Tracks totalKeystrokes, backspaceCount, editRatio, cursorJumpCount,
 *   midSentencePauses, sentenceEndPauses, tabSwitches, and secondsAwayFromTab.
 * - Generates browser/device hash.
 */
export function useAntiCheat(options: UseAntiCheatOptions = {}) {
  const { mode = "PVP", onViolation } = options;

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deviceHash, setDeviceHash] = useState<string>("");

  // Telemetry state refs
  const totalKeystrokesRef = useRef<number>(0);
  const backspaceCountRef = useRef<number>(0);
  const cursorJumpCountRef = useRef<number>(0);
  const midSentencePausesRef = useRef<number>(0);
  const sentenceEndPausesRef = useRef<number>(0);
  const tabSwitchesRef = useRef<number>(0);
  const secondsAwayFromTabRef = useRef<number>(0);
  const pasteAttemptsRef = useRef<number>(0);

  // Timing refs
  const lastKeyTimeRef = useRef<number>(0);
  const lastKeyWasSentenceEndRef = useRef<boolean>(false);
  const lastCursorPosRef = useRef<number>(0);
  const blurStartTimeRef = useRef<number | null>(null);

  // Set device hash on mount
  useEffect(() => {
    setDeviceHash(generateDeviceHash());
  }, []);

  const triggerWarning = useCallback(
    (msg: string = PASTE_WARNING_MESSAGE) => {
      setToastMessage(msg);
      if (onViolation) {
        onViolation(msg);
      }
      setTimeout(() => {
        setToastMessage((curr) => (curr === msg ? null : curr));
      }, 4000);
    },
    [onViolation]
  );

  // Clipboard & Drag-Drop blockers
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      e.preventDefault();
      pasteAttemptsRef.current += 1;
      triggerWarning(PASTE_WARNING_MESSAGE);
    },
    [triggerWarning]
  );

  const handleCopy = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      e.preventDefault();
      triggerWarning(PASTE_WARNING_MESSAGE);
    },
    [triggerWarning]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      e.preventDefault();
      pasteAttemptsRef.current += 1;
      triggerWarning(PASTE_WARNING_MESSAGE);
    },
    [triggerWarning]
  );

  // Keystroke & Pause telemetry
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const now = Date.now();
      const target = e.currentTarget;
      const currentPos = target.selectionStart ?? 0;

      // Track cursor jumps (moving > 3 characters without sequential typing)
      if (Math.abs(currentPos - lastCursorPosRef.current) > 3) {
        cursorJumpCountRef.current += 1;
      }
      lastCursorPosRef.current = currentPos;

      // Track pause duration since last keystroke (pause threshold >= 1800ms)
      if (lastKeyTimeRef.current > 0) {
        const diff = now - lastKeyTimeRef.current;
        if (diff >= 1800) {
          if (lastKeyWasSentenceEndRef.current) {
            sentenceEndPausesRef.current += 1;
          } else {
            midSentencePausesRef.current += 1;
          }
        }
      }

      lastKeyTimeRef.current = now;

      if (e.key === "Backspace" || e.key === "Delete") {
        backspaceCountRef.current += 1;
        totalKeystrokesRef.current += 1;
        lastKeyWasSentenceEndRef.current = false;
        return;
      }

      // Check if standard character input
      if (e.key.length === 1) {
        totalKeystrokesRef.current += 1;
        // Sentence-end punctuation: '.', '!', '?', or '\n'
        lastKeyWasSentenceEndRef.current = /[.!?\n]/.test(e.key);
      }
    },
    []
  );

  // Tab switch & visibility change detection
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleVisibilityOrBlur = () => {
      if (document.hidden) {
        tabSwitchesRef.current += 1;
        blurStartTimeRef.current = Date.now();
      } else {
        if (blurStartTimeRef.current) {
          const awaySecs = Math.round((Date.now() - blurStartTimeRef.current) / 1000);
          secondsAwayFromTabRef.current += Math.max(0, awaySecs);
          blurStartTimeRef.current = null;
        }
      }
    };

    const handleWindowBlur = () => {
      if (!blurStartTimeRef.current) {
        tabSwitchesRef.current += 1;
        blurStartTimeRef.current = Date.now();
      }
    };

    const handleWindowFocus = () => {
      if (blurStartTimeRef.current) {
        const awaySecs = Math.round((Date.now() - blurStartTimeRef.current) / 1000);
        secondsAwayFromTabRef.current += Math.max(0, awaySecs);
        blurStartTimeRef.current = null;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityOrBlur);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityOrBlur);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  /**
   * Produce snapshot of keystroke and activity telemetry.
   */
  const getTelemetry = useCallback((): TelemetryPayload => {
    const total = totalKeystrokesRef.current;
    const backspaces = backspaceCountRef.current;
    const editRatio = total > 0 ? Number((backspaces / total).toFixed(4)) : 0;

    return {
      mode,
      totalKeystrokes: total,
      backspaceCount: backspaces,
      editRatio,
      cursorJumpCount: cursorJumpCountRef.current,
      midSentencePauses: midSentencePausesRef.current,
      sentenceEndPauses: sentenceEndPausesRef.current,
      tabSwitches: tabSwitchesRef.current,
      secondsAwayFromTab: secondsAwayFromTabRef.current,
      pasteAttempts: pasteAttemptsRef.current,
    };
  }, [mode]);

  /**
   * Reset telemetry counters (useful when beginning a new round or prompt).
   */
  const resetTelemetry = useCallback(() => {
    totalKeystrokesRef.current = 0;
    backspaceCountRef.current = 0;
    cursorJumpCountRef.current = 0;
    midSentencePausesRef.current = 0;
    sentenceEndPausesRef.current = 0;
    tabSwitchesRef.current = 0;
    secondsAwayFromTabRef.current = 0;
    pasteAttemptsRef.current = 0;
    lastKeyTimeRef.current = 0;
    lastKeyWasSentenceEndRef.current = false;
    lastCursorPosRef.current = 0;
    blurStartTimeRef.current = null;
  }, []);

  return {
    toastMessage,
    deviceHash,
    getTelemetry,
    resetTelemetry,
    // Event handlers to attach directly to textareas
    handlers: {
      onPaste: handlePaste,
      onCopy: handleCopy,
      onDrop: handleDrop,
      onKeyDown: handleKeyDown,
    },
  };
}
