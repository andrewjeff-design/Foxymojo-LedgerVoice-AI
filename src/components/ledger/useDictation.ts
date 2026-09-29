"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};
type RecognitionCtor = new () => Recognition;

/* Dictation. A signed-in company records audio and has it transcribed on the server, which
   works in every browser. The demo, with no server behind it, uses the browser's own
   recogniser where there is one. */
export function useDictation(opts: {
  lang: string;
  transcribe?: ((audio: Blob, lang: string) => Promise<string>) | null;
  onText: (text: string) => void;
  onStatus: (text: string) => void;
}) {
  const { lang, transcribe, onText, onStatus } = opts;
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const can = transcribe ? typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices : !!(w.SpeechRecognition || w.webkitSpeechRecognition);
    const t = window.setTimeout(() => setSupported(can), 0);
    return () => window.clearTimeout(t);
  }, [transcribe]);

  const toggle = useCallback(async () => {
    if (listening) {
      rec.current?.stop();
      recorder.current?.stop();
      return;
    }
    if (transcribe) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        mr.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setListening(false);
          onStatus("Transcribing…");
          try {
            onText(await transcribe(new Blob(chunks, { type: mr.mimeType || "audio/webm" }), lang));
            onStatus("Transcript ready. Check it, then read it.");
          } catch (e) { onStatus(e instanceof Error ? e.message : "Transcription failed. Type instead."); }
        };
        recorder.current = mr;
        mr.start();
        setListening(true);
        onStatus("Listening… say it, then tap again to stop. Audio is sent only when you stop.");
      } catch { onStatus("The browser blocked the microphone. Type or paste instead."); }
      return;
    }
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const r = new SR();
      r.lang = lang; r.interimResults = true; r.continuous = false;
      r.onresult = (ev) => { let out = ""; for (let i = 0; i < ev.results.length; i += 1) out += ev.results[i][0].transcript; onText(out); };
      r.onerror = (ev) => {
        const denied = ev.error === "not-allowed" || ev.error === "service-not-allowed";
        onStatus(denied ? "The browser blocked the microphone here. Type or paste instead." : "Dictation stopped: " + ev.error);
      };
      r.onend = () => { rec.current = null; setListening(false); };
      rec.current = r;
      r.start();
      setListening(true);
      onStatus("Listening… say it, then tap again to stop.");
    } catch {
      rec.current = null;
      setListening(false);
      onStatus("Dictation is not available here. Type or paste instead.");
    }
  }, [listening, transcribe, lang, onText, onStatus]);

  return { listening, supported, toggle };
}
