"use client";

// Custom voice note player: play/pause, seekable progress bar, duration.

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { useSignedUrl, type ChatMessage } from "./helpers";

export function AudioPlayer({ m, own }: { m: ChatMessage; own: boolean }) {
  const remote = useSignedUrl(m.media_path);
  const url = remote ?? m.localUrl ?? null;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(m.media_meta?.duration ?? 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setPosition(audio.currentTime);
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onEnd = () => {
      setPlaying(false);
      setPosition(0);
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
    };
  }, [url]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      void audio.play().catch(() => setPlaying(false));
    }
  };

  const seek = (clientX: number) => {
    const audio = audioRef.current;
    const bar = barRef.current;
    if (!audio || !bar || duration <= 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setPosition(ratio * duration);
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const trackClass = own ? "bg-white/25" : "bg-blush";
  const fillClass = own ? "bg-white" : "bg-rose-dark";

  return (
    <div className="flex w-56 max-w-full items-center gap-2.5 py-0.5">
      {url && <audio ref={audioRef} src={url} preload="metadata" />}
      <button
        type="button"
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        onClick={toggle}
        disabled={!url}
        className={`pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${
          own ? "bg-white/20 text-white" : "bg-blush text-rose-dark"
        }`}
      >
        {playing ? (
          <Pause className="h-4 w-4" fill="currentColor" />
        ) : (
          <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          ref={barRef}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
          tabIndex={0}
          className="flex h-6 cursor-pointer items-center"
          onPointerDown={(e) => seek(e.clientX)}
          onKeyDown={(e) => {
            const audio = audioRef.current;
            if (!audio) return;
            if (e.key === "ArrowRight") audio.currentTime = Math.min(duration, audio.currentTime + 5);
            if (e.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 5);
          }}
        >
          <div className={`relative h-1.5 w-full overflow-hidden rounded-full ${trackClass}`}>
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${fillClass}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
        <p className={`text-[0.65rem] tabular-nums ${own ? "text-white/75" : "text-berry-soft"}`}>
          {formatDuration(position)} / {formatDuration(duration)}
        </p>
      </div>
    </div>
  );
}
