import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { VaultState } from "./VaultMechanism";

/**
 * Atmospheric layers for the LockScreen — pure visual richness, no
 * functional UI. Each layer is independently positioned and tied to
 * the same VaultState so the whole screen reacts as one organism.
 *
 * Layers exposed:
 *   <ParticleField />      drifting motes ("dust in vault air")
 *   <ScanlineOverlay />    very faint horizontal CRT scanlines
 *   <SuccessBloom />       radial gold flash + light rays on unlocked
 *   <StatusPanel />        live system readout (badges + clock)
 *   <CornerOrnaments />    engraved brass corner pieces on the card
 */

// ─────────────────────────────────────────────────────────────────
// ParticleField — slowly drifting dots, denser when verifying
// ─────────────────────────────────────────────────────────────────

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  driftX: number;
  driftY: number;
}

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 0.6 + Math.random() * 1.6,
    delay: Math.random() * 8,
    duration: 14 + Math.random() * 12,
    driftX: (Math.random() - 0.5) * 12,
    driftY: -8 - Math.random() * 14,
  }));
}

export function ParticleField({ state }: { state: VaultState }) {
  const [particles] = useState(() => makeParticles(38));
  const intensified = state === "verifying" || state === "unlocking" || state === "unlocked";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        opacity: intensified ? 0.85 : 0.55,
        transition: "opacity 600ms ease",
      }}
    >
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background:
              p.id % 7 === 0
                ? "var(--vault-gold-bright)"
                : "oklch(from var(--vault-lapis-bright) l c h / 0.85)",
            boxShadow:
              p.id % 7 === 0
                ? "0 0 4px var(--vault-gold-glow)"
                : "0 0 3px oklch(from var(--vault-lapis-glow) l c h / 0.6)",
          }}
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={{
            x: [0, p.driftX, 0],
            y: [0, p.driftY, 0],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: state === "verifying" ? p.duration / 2.2 : p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ScanlineOverlay — sci-fi CRT shimmer, very subtle
// ─────────────────────────────────────────────────────────────────

export function ScanlineOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent 0px, transparent 3px, oklch(1 0 0 / 0.018) 4px, transparent 5px)",
        mixBlendMode: "overlay",
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────
// SuccessBloom — gold radial flash + 8 light rays radiating outward
// only on unlocking → unlocked transition.
// ─────────────────────────────────────────────────────────────────

export function SuccessBloom({ state }: { state: VaultState }) {
  const visible = state === "unlocking" || state === "unlocked";
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{
        opacity: visible ? 1 : 0,
        scale: state === "unlocked" ? 1.4 : visible ? 1 : 0.6,
      }}
      transition={{ duration: 0.9, ease: "easeOut" }}
    >
      {/* Central radial flash */}
      <div
        className="absolute size-[420px] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, oklch(from var(--vault-gold-bright) l c h / 0.55) 0%, oklch(from var(--vault-gold-glow) l c h / 0.18) 35%, transparent 65%)",
          filter: "blur(28px)",
        }}
      />
      {/* 8 light rays */}
      <svg
        className="absolute size-[420px]"
        viewBox="0 0 100 100"
        style={{ overflow: "visible" }}
      >
        {Array.from({ length: 8 }, (_, i) => {
          const angle = (i / 8) * 360;
          const rad = (angle * Math.PI) / 180;
          return (
            <motion.line
              key={i}
              x1="50"
              y1="50"
              x2={50 + 60 * Math.cos(rad)}
              y2={50 + 60 * Math.sin(rad)}
              stroke="url(#bloom-ray)"
              strokeWidth="0.6"
              strokeLinecap="round"
              initial={{ opacity: 0 }}
              animate={{
                opacity: state === "unlocked" ? [0, 1, 0.7] : [0, 0.6, 0],
              }}
              transition={{
                duration: 0.8,
                delay: 0.1 * i + (state === "unlocked" ? 0 : 0.4),
              }}
            />
          );
        })}
        <defs>
          <linearGradient id="bloom-ray" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--vault-gold-bright)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--vault-gold-bright)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────
// StatusPanel — small "system online" readout
// ─────────────────────────────────────────────────────────────────

interface StatusPanelProps {
  state: VaultState;
}

export function StatusPanel({ state }: StatusPanelProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = now.toISOString().substring(11, 19); // HH:MM:SS
  const date = now.toISOString().substring(0, 10);  // YYYY-MM-DD

  const statusLabel =
    state === "verifying"
      ? "VERIFYING"
      : state === "unlocking"
        ? "ALIGNING"
        : state === "unlocked"
          ? "UNLOCKED"
          : "ARMED";
  const ledColor =
    state === "unlocking" || state === "unlocked"
      ? "var(--vault-gold-bright)"
      : "oklch(0.74 0.16 155)"; // patina green for armed/verifying

  return (
    <div
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-[10px] font-mono"
      style={{
        borderTop: "1px solid oklch(from var(--vault-lapis-bright) l c h / 0.15)",
        borderBottom: "1px solid oklch(0 0 0 / 0.4)",
        backgroundColor: "oklch(from var(--vault-lapis-deep) l c h / 0.7)",
        letterSpacing: "0.08em",
      }}
    >
      <div className="flex items-center gap-1.5">
        <motion.span
          className="size-1.5 rounded-full"
          style={{
            backgroundColor: ledColor,
            boxShadow: `0 0 5px ${ledColor}`,
          }}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <span style={{ color: "var(--vault-gold-bright)" }}>{statusLabel}</span>
      </div>
      <span style={{ color: "oklch(from var(--vault-lapis-bright) l c h / 0.85)" }}>
        VAULT/0.1.0
      </span>
      <span style={{ color: "oklch(from var(--vault-gold) l c h / 0.85)" }}>
        {date} {time}Z
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CornerOrnaments — engraved brass L-pieces on the card corners
// ─────────────────────────────────────────────────────────────────

export function CornerOrnaments() {
  const corners = [
    { className: "top-2 left-2", rotate: 0 },
    { className: "top-2 right-2", rotate: 90 },
    { className: "bottom-2 right-2", rotate: 180 },
    { className: "bottom-2 left-2", rotate: 270 },
  ];
  return (
    <>
      {corners.map((c, i) => (
        <svg
          key={i}
          aria-hidden
          className={`pointer-events-none absolute ${c.className}`}
          width="22"
          height="22"
          viewBox="0 0 22 22"
          style={{ transform: `rotate(${c.rotate}deg)` }}
        >
          <path
            d="M 2 12 L 2 2 L 12 2"
            stroke="var(--vault-gold)"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
            opacity="0.85"
          />
          <circle cx="2" cy="2" r="1.2" fill="var(--vault-gold-bright)" />
          <circle
            cx="2"
            cy="2"
            r="2.4"
            fill="none"
            stroke="var(--vault-gold-bright)"
            strokeWidth="0.4"
            opacity="0.5"
          />
        </svg>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// useShake — small custom hook returning x-translate keyframes for
// the shake animation triggered on wrong-password.
// ─────────────────────────────────────────────────────────────────

export function useShake() {
  const [shaking, setShaking] = useState(false);
  const triggerRef = useRef<number>(0);

  function trigger() {
    triggerRef.current += 1;
    setShaking(true);
    window.setTimeout(() => setShaking(false), 500);
  }

  return { shaking, trigger, triggerKey: triggerRef.current };
}
