import React, { useState } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';
import { STUDIO_ROOMS } from '../game/levels';

interface TitleScreenProps {
  selectedRoom: number;
  onSelectRoom: (index: number) => void;
  onStart: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  selectedRoom,
  onSelectRoom,
  onStart,
  muted,
  onToggleMute,
}) => {
  const [imgError, setImgError] = useState(false);
  const [logoError, setLogoError] = useState(false);

  return (
    <div className="absolute inset-0 z-20 flex items-center bg-gradient-to-r from-[#0e1015]/95 via-[#0e1015]/84 to-[#0e1015]/40 px-6 sm:px-12 lg:px-20">
      {/* Top-right quiet audio toggle */}
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? 'Unmute audio' : 'Mute audio'}
        className="absolute top-5 right-6 flex items-center gap-2 rounded-lg border border-white/10 bg-[#171b24]/90 px-3.5 py-2 text-xs font-medium text-stone-300 transition-colors hover:border-amber-500/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-amber-400" />}
        <span>{muted ? 'Muted' : 'Sound On'}</span>
      </button>

      <div className="grid w-full max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Left: Jacobi Music Logo + Bespoke SVG Bandmate Lockup + Controls + CTA */}
        <div className="flex flex-col items-start gap-5">
          {/* Jacobi Music Studio Logo Lockup */}
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-amber-500/30 bg-[#0b0d12]">
              {!logoError ? (
                <img
                  src="/assets/aistudio/Jacobi__4c26d62a.png"
                  alt="Jacobi Music logo"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-xs font-bold text-amber-400">
                  JM
                </div>
              )}
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-medium text-stone-400">Lavet af</span>
              <span className="font-display text-sm font-semibold tracking-wide text-amber-300">
                Jacobi Music
              </span>
            </div>
          </div>

          <div className="w-full max-w-md">
            <svg
              viewBox="0 0 420 96"
              className="h-auto w-full"
              role="img"
              aria-label="Bandmate"
            >
              <defs>
                <linearGradient id="studioAmber" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#f43f5e" />
                </linearGradient>
              </defs>
              {/* Equalizer bar accent */}
              <rect x="2" y="10" width="6" height="18" rx="2" fill="#f59e0b" />
              <rect x="12" y="4" width="6" height="24" rx="2" fill="#e11d48" />
              <rect x="22" y="14" width="6" height="14" rx="2" fill="#fbbf24" />
              <text
                x="38"
                y="24"
                fill="#a8a29e"
                fontFamily="Outfit, sans-serif"
                fontSize="12"
                fontWeight="600"
                letterSpacing="3"
              >
                JACOBI MEDIA
              </text>
              <text
                x="2"
                y="78"
                fill="#fafaf9"
                fontFamily="Outfit, sans-serif"
                fontSize="56"
                fontWeight="800"
                letterSpacing="-1.5"
              >
                BANDMATE
              </text>
              <rect x="2" y="88" width="132" height="4" rx="2" fill="url(#studioAmber)" />
            </svg>
          </div>

          <p className="max-w-lg text-base leading-relaxed text-stone-300">
            Tell your bandmate what to do or steer him live across the recording studio. Collect vinyls, golden mics, and master tapes while dodging amp feedback.
          </p>

          {/* Studio Room Selector */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-stone-400">
              Starting Studio Room
            </span>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-white/10 bg-[#141720] p-1">
              {STUDIO_ROOMS.map((room, idx) => {
                const active = idx === selectedRoom;
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => onSelectRoom(idx)}
                    className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                      active
                        ? 'bg-amber-500 text-stone-950 font-semibold'
                        : 'text-stone-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {room.id}. {room.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary Start CTA */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 rounded-xl bg-rose-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-rose-950/50 transition-transform duration-150 hover:bg-rose-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>Start Game</span>
            </button>
          </div>

          {/* Single Flat Control-Hint Line */}
          <p className="text-xs text-stone-400">
            WASD / Arrows Move <span aria-hidden="true">·</span> Click Tile or Type Commands <span aria-hidden="true">·</span> Space Rock On <span aria-hidden="true">·</span> Esc Pause
          </p>
        </div>

        {/* Right: Bandmate Studio Portrait Showcase */}
        <div className="hidden justify-center lg:flex">
          <div className="relative w-72 overflow-hidden rounded-2xl border border-white/12 bg-[#161922] shadow-2xl">
            {!imgError ? (
              <img
                src="/assets/aistudio/Bandmate-_profile_9211c775.png"
                alt="Bandmate standing in the recording studio holding a chrome microphone"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="h-80 w-full object-cover object-top"
              />
            ) : (
              <div className="flex h-80 w-full flex-col items-center justify-center bg-gradient-to-b from-stone-800 to-stone-950 p-6 text-center">
                <span className="font-display text-xl font-bold text-amber-400">Bandmate</span>
                <span className="mt-1 text-xs text-stone-400">Jacobi Music</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-white/10 bg-[#12151d] px-4 py-3 text-xs text-stone-300">
              <span className="font-semibold text-white">Bandmate</span>
              <span className="text-stone-400">Lavet af Jacobi Music</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
