import { motion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * High-fidelity sci-fi vault mechanism.
 *
 * Composed of 8 distinct visual layers, each with its own animation:
 *   1. Corner brackets       — L-shaped target-lock markers at 4 corners
 *   2. Outer degree scale    — 72 ticks + 12 numeric labels (000…330)
 *   3. Scan sweep            — fast-rotating cyan arc with trail
 *   4. Segmented arc ring    — 12 brass segments with 5° gaps
 *   5. Glyph ring            — 8 alphanumeric codes that scramble on verify
 *   6. Dash ring             — fine dashed circle, opposite rotation
 *   7. Crosshair reticle     — fixed cardinal-direction guides
 *   8. Center arc reactor    — hex frame + brass disc + bright core
 *
 * State machine drives orchestration:
 *   idle       — slow-mo rotations, gentle pulse, scan loops
 *   verifying  — accelerated chaos, glyphs scramble at 60ms intervals
 *   unlocking  — sequential snap-to-zero (per ring, 200ms staggered),
 *                glyphs lock, brackets flash gold, scan does final lap
 *   unlocked   — all rings aligned, alignment markers gold-glowing,
 *                core pulses outward
 */

export type VaultState = "idle" | "verifying" | "unlocking" | "unlocked";

interface Props {
  state: VaultState;
  size?: number;
}

// ──────────────────────────────────────────────────────────────────
// Math helpers
// ──────────────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, startA: number, endA: number) {
  const start = polar(cx, cy, r, endA);
  const end = polar(cx, cy, r, startA);
  const largeArc = endA - startA <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

// ──────────────────────────────────────────────────────────────────
// Animation transitions
// ──────────────────────────────────────────────────────────────────

interface RingMotion {
  idleSeconds: number;
  verifyingSeconds: number;
  direction: 1 | -1;
  snapDelay: number;
}

function ringAnimate(state: VaultState, m: RingMotion) {
  const sign = m.direction;
  switch (state) {
    case "idle":
      return { rotate: [0, 360 * sign] };
    case "verifying":
      return { rotate: [0, 360 * 4 * sign] };
    case "unlocking":
    case "unlocked":
      return { rotate: 0 };
  }
}

function ringTransition(state: VaultState, m: RingMotion) {
  switch (state) {
    case "idle":
      return { repeat: Infinity, duration: m.idleSeconds, ease: "linear" as const };
    case "verifying":
      return { repeat: Infinity, duration: m.verifyingSeconds, ease: "linear" as const };
    case "unlocking":
    case "unlocked":
      return {
        type: "spring" as const,
        stiffness: 200,
        damping: 22,
        delay: m.snapDelay,
      };
  }
}

const RING_TRANSFORM = { transformOrigin: "100px 100px", transformBox: "view-box" as const };

// ──────────────────────────────────────────────────────────────────
// Sub-layers
// ──────────────────────────────────────────────────────────────────

function HexagonGrid({ state }: { state: VaultState }) {
  // Faint hexagonal mesh inside the inner area — adds depth.
  const hexSize = 6;
  const cx = 100, cy = 100;
  const cells: Array<{ x: number; y: number }> = [];
  // 5x5 grid centered, then filter to within radius 50
  for (let row = -3; row <= 3; row++) {
    for (let col = -3; col <= 3; col++) {
      const x = cx + col * hexSize * 1.732;
      const y = cy + row * hexSize * 1.5 + (col % 2 ? hexSize * 0.75 : 0);
      const d = Math.hypot(x - cx, y - cy);
      if (d < 50) cells.push({ x, y });
    }
  }
  const points = (x: number, y: number) =>
    [0, 60, 120, 180, 240, 300]
      .map((a) => {
        const p = polar(x, y, hexSize * 0.6, a);
        return `${p.x},${p.y}`;
      })
      .join(" ");
  return (
    <motion.g
      initial={false}
      animate={{
        opacity: state === "unlocked" ? 0.35 : state === "unlocking" ? 0.28 : 0.18,
      }}
      transition={{ duration: 0.6 }}
    >
      {cells.map((c, i) => (
        <polygon
          key={i}
          points={points(c.x, c.y)}
          fill="none"
          stroke="oklch(from var(--vault-lapis-bright) l c h / 0.5)"
          strokeWidth="0.25"
        />
      ))}
    </motion.g>
  );
}

function SystemLabels({ state }: { state: VaultState }) {
  // Small system-status text rendered as part of the mechanism for
  // technical-readout vibe.
  const cx = 100, cy = 100;
  const labels = [
    { text: "SEC-A1", angle: 30, r: 92 },
    { text: "ENC-OK", angle: 150, r: 92 },
    { text: "RDY-7F", angle: 210, r: 92 },
    { text: "VAU-00", angle: 330, r: 92 },
  ];
  return (
    <motion.g
      initial={false}
      animate={{
        opacity: state === "unlocked" ? 0.95 : state === "unlocking" ? 0.85 : 0.55,
      }}
      transition={{ duration: 0.4 }}
    >
      {labels.map((l, i) => {
        const p = polar(cx, cy, l.r, l.angle);
        return (
          <g key={i} transform={`translate(${p.x} ${p.y})`}>
            <rect
              x="-6"
              y="-2.2"
              width="12"
              height="4.4"
              rx="0.6"
              fill="oklch(from var(--vault-lapis-deep) l c h / 0.95)"
              stroke="oklch(from var(--vault-gold) l c h / 0.5)"
              strokeWidth="0.25"
            />
            <text
              x="0"
              y="0.4"
              fontSize="2.6"
              fontFamily="var(--font-mono)"
              fill="var(--vault-gold-bright)"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ letterSpacing: "0.2px", fontWeight: 600 }}
            >
              {l.text}
            </text>
          </g>
        );
      })}
    </motion.g>
  );
}

function CornerBrackets({ state }: { state: VaultState }) {
  const corners = [
    { x: 8, y: 8, rot: 0 },
    { x: 192, y: 8, rot: 90 },
    { x: 192, y: 192, rot: 180 },
    { x: 8, y: 192, rot: 270 },
  ];
  return (
    <motion.g
      initial={{ opacity: 0.45 }}
      animate={{
        opacity: state === "idle" ? 0.45 : state === "unlocking" || state === "unlocked" ? 1 : 0.85,
      }}
      transition={{ duration: 0.4 }}
    >
      {corners.map((c, i) => (
        <motion.g
          key={i}
          transform={`translate(${c.x} ${c.y}) rotate(${c.rot})`}
          initial={false}
          animate={{
            scale: state === "unlocking" ? [1, 1.15, 1] : 1,
          }}
          transition={{ duration: 0.5, delay: state === "unlocking" ? 0.1 * i : 0 }}
          style={{ transformOrigin: `${c.x}px ${c.y}px`, transformBox: "view-box" }}
        >
          <path
            d="M 0 12 L 0 0 L 12 0"
            stroke={state === "unlocking" || state === "unlocked"
              ? "var(--vault-gold-bright)"
              : "var(--vault-gold)"}
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
            filter="url(#vault-glow-soft)"
          />
          <circle cx="0" cy="0" r="1.2" fill="var(--vault-gold-bright)" />
        </motion.g>
      ))}
    </motion.g>
  );
}

function OuterDegreeScale({ state }: { state: VaultState }) {
  const cx = 100, cy = 100, r = 88;
  const motionCfg: RingMotion = {
    idleSeconds: 90,
    verifyingSeconds: 16,
    direction: 1,
    snapDelay: 0,
  };
  return (
    <motion.g
      animate={ringAnimate(state, motionCfg)}
      transition={ringTransition(state, motionCfg)}
      style={RING_TRANSFORM}
    >
      {/* 72 ticks (every 5°), with major every 30° + mid every 15° */}
      {Array.from({ length: 72 }, (_, i) => {
        const angle = (i / 72) * 360;
        const isMajor = i % 6 === 0;
        const isMid = i % 3 === 0;
        const tickLen = isMajor ? 5 : isMid ? 3 : 1.5;
        const inner = polar(cx, cy, r - tickLen, angle);
        const outer = polar(cx, cy, r, angle);
        return (
          <line
            key={i}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke={isMajor ? "var(--vault-gold-bright)" : "oklch(from var(--vault-lapis-bright) l c h / 0.55)"}
            strokeWidth={isMajor ? 0.9 : isMid ? 0.5 : 0.3}
            strokeLinecap="round"
          />
        );
      })}
      {/* 12 numeric degree labels */}
      {Array.from({ length: 12 }, (_, i) => {
        const angle = i * 30;
        const p = polar(cx, cy, r - 9, angle);
        const deg = (i * 30).toString().padStart(3, "0");
        return (
          <text
            key={`lbl-${i}`}
            x={p.x}
            y={p.y}
            fontSize="3.2"
            fontFamily="var(--font-mono)"
            fill="var(--vault-gold)"
            textAnchor="middle"
            dominantBaseline="middle"
            opacity="0.75"
            style={{ letterSpacing: "0.5px" }}
          >
            {deg}
          </text>
        );
      })}
    </motion.g>
  );
}

function SegmentedArcRing({ state }: { state: VaultState }) {
  const cx = 100, cy = 100, r = 75;
  const motionCfg: RingMotion = {
    idleSeconds: 28,
    verifyingSeconds: 6,
    direction: -1,
    snapDelay: 0.18,
  };
  // 12 arcs, each 25° wide with 5° gap
  return (
    <motion.g
      animate={ringAnimate(state, motionCfg)}
      transition={ringTransition(state, motionCfg)}
      style={RING_TRANSFORM}
    >
      {Array.from({ length: 12 }, (_, i) => {
        const startA = i * 30;
        const endA = startA + 25;
        const isAccent = i === 0; // alignment marker
        return (
          <path
            key={i}
            d={arcPath(cx, cy, r, startA, endA)}
            stroke={
              state === "unlocking" || state === "unlocked"
                ? "var(--vault-lapis-bright)"
                : isAccent
                  ? "var(--vault-gold-bright)"
                  : "var(--vault-lapis-bright)"
            }
            strokeWidth={isAccent ? 2.2 : 1.4}
            strokeLinecap="round"
            fill="none"
            opacity={isAccent ? 1 : 0.65}
            filter={isAccent ? "url(#vault-glow-soft)" : undefined}
          />
        );
      })}
    </motion.g>
  );
}

function DashRing({ state }: { state: VaultState }) {
  const motionCfg: RingMotion = {
    idleSeconds: 22,
    verifyingSeconds: 5,
    direction: 1,
    snapDelay: 0.36,
  };
  return (
    <motion.g
      animate={ringAnimate(state, motionCfg)}
      transition={ringTransition(state, motionCfg)}
      style={RING_TRANSFORM}
    >
      <circle
        cx="100"
        cy="100"
        r="48"
        fill="none"
        stroke="var(--vault-lapis-bright)"
        strokeWidth="0.6"
        strokeDasharray="2 3"
        opacity="0.7"
      />
      <circle
        cx="100"
        cy="100"
        r="44"
        fill="none"
        stroke="var(--vault-gold)"
        strokeWidth="0.5"
        strokeDasharray="1 4"
        opacity="0.5"
      />
    </motion.g>
  );
}

const FINAL_CODES = ["A1F", "8C2", "5E9", "B7D", "3K0", "F6N", "Q9X", "Z2P"];
const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function GlyphRing({ state }: { state: VaultState }) {
  const cx = 100, cy = 100, r = 60;
  const [codes, setCodes] = useState<string[]>(FINAL_CODES);

  useEffect(() => {
    if (state !== "verifying") {
      setCodes(FINAL_CODES);
      return;
    }
    const interval = setInterval(() => {
      setCodes(
        FINAL_CODES.map(() =>
          Array.from(
            { length: 3 },
            () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)],
          ).join(""),
        ),
      );
    }, 70);
    return () => clearInterval(interval);
  }, [state]);

  const motionCfg: RingMotion = {
    idleSeconds: 36,
    verifyingSeconds: 8,
    direction: -1,
    snapDelay: 0.54,
  };

  return (
    <motion.g
      animate={ringAnimate(state, motionCfg)}
      transition={ringTransition(state, motionCfg)}
      style={RING_TRANSFORM}
    >
      {codes.map((code, i) => {
        const angle = i * 45;
        const p = polar(cx, cy, r, angle);
        return (
          <g key={i} transform={`translate(${p.x} ${p.y})`}>
            <rect
              x="-5.5"
              y="-2.5"
              width="11"
              height="5"
              rx="1"
              fill="oklch(from var(--vault-lapis-deep) l c h / 0.85)"
              stroke="oklch(from var(--vault-gold) l c h / 0.4)"
              strokeWidth="0.3"
            />
            <text
              x="0"
              y="0.4"
              fontSize="3.2"
              fontFamily="var(--font-mono)"
              fill={state === "unlocked" || state === "unlocking" ? "var(--vault-gold-bright)" : "var(--vault-gold)"}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ letterSpacing: "0.3px", fontWeight: 600 }}
            >
              {code}
            </text>
          </g>
        );
      })}
    </motion.g>
  );
}

function ScanSweep({ state }: { state: VaultState }) {
  if (state === "unlocked") return null;
  const cx = 100, cy = 100, r = 82;
  const sweepDuration =
    state === "idle" ? 4 : state === "verifying" ? 1 : 1.2;
  return (
    <motion.g
      initial={false}
      animate={{ rotate: state === "unlocking" ? 720 : [0, 360] }}
      transition={
        state === "unlocking"
          ? { duration: 1.0, ease: [0.22, 1, 0.36, 1] }
          : { repeat: Infinity, duration: sweepDuration, ease: "linear" }
      }
      style={RING_TRANSFORM}
    >
      <path
        d={arcPath(cx, cy, r, 0, 70)}
        stroke="url(#sweep-grad)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        filter="url(#vault-glow-strong)"
      />
      {/* Bright leading dot */}
      <circle
        cx={polar(cx, cy, r, 70).x}
        cy={polar(cx, cy, r, 70).y}
        r="1.6"
        fill="var(--vault-lapis-bright)"
        filter="url(#vault-glow-strong)"
      />
    </motion.g>
  );
}

function CrosshairReticle({ state }: { state: VaultState }) {
  // Fixed (does not rotate). Marks the 4 cardinal directions.
  const positions = [
    { x: 100, y: 4 },   // top
    { x: 196, y: 100 }, // right
    { x: 100, y: 196 }, // bottom
    { x: 4, y: 100 },   // left
  ];
  return (
    <motion.g
      initial={false}
      animate={{
        opacity: state === "unlocked" ? 1 : state === "unlocking" ? 0.9 : 0.4,
      }}
      transition={{ duration: 0.4 }}
    >
      {positions.map((p, i) => {
        const isVertical = i === 0 || i === 2;
        return (
          <line
            key={i}
            x1={isVertical ? p.x : p.x - 4}
            y1={isVertical ? p.y - 4 : p.y}
            x2={isVertical ? p.x : p.x + 4}
            y2={isVertical ? p.y + 4 : p.y}
            stroke="var(--vault-gold-bright)"
            strokeWidth="1"
            strokeLinecap="round"
          />
        );
      })}
    </motion.g>
  );
}

function CenterCore({ state }: { state: VaultState }) {
  const cx = 100, cy = 100;
  const isOpen = state === "unlocked" || state === "unlocking";

  // Hexagon points at radius 32
  const hexPoints = Array.from({ length: 6 }, (_, i) => {
    const angle = i * 60;
    const p = polar(cx, cy, 32, angle);
    return `${p.x},${p.y}`;
  }).join(" ");

  return (
    <g>
      {/* Outer halo — radial bloom */}
      <motion.circle
        cx={cx}
        cy={cy}
        r="36"
        fill="url(#center-halo)"
        initial={false}
        animate={{
          opacity: state === "unlocked" ? 0.95 : state === "unlocking" ? 0.7 : 0.35,
          scale: state === "unlocked" ? 1.2 : 1,
        }}
        transition={{ duration: 0.6 }}
        style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "view-box" }}
      />

      {/* Hexagonal frame */}
      <motion.polygon
        points={hexPoints}
        fill="oklch(from var(--vault-lapis-deep) l c h / 0.5)"
        stroke="var(--vault-gold)"
        strokeWidth="0.7"
        initial={false}
        animate={{
          rotate: state === "verifying" ? [0, 360] : 0,
        }}
        transition={
          state === "verifying"
            ? { repeat: Infinity, duration: 8, ease: "linear" }
            : { type: "spring", stiffness: 150, damping: 20 }
        }
        style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "view-box" }}
      />

      {/* Inner brass disc */}
      <motion.circle
        cx={cx}
        cy={cy}
        r="20"
        fill="url(#center-brass)"
        stroke="oklch(from var(--vault-gold-deep) l c h)"
        strokeWidth="0.5"
        initial={false}
        animate={{ scale: state === "unlocked" ? [1, 1.08, 1.04] : 1 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "view-box" }}
      />

      {/* Specular highlight on disc */}
      <ellipse
        cx={cx - 5}
        cy={cy - 5}
        rx="5"
        ry="3"
        fill="oklch(0.98 0.04 88)"
        opacity="0.55"
      />

      {/* Bright reactor core */}
      <motion.circle
        cx={cx}
        cy={cy}
        r="7"
        fill="oklch(0.96 0.06 88)"
        initial={false}
        animate={{
          opacity: isOpen ? [1, 0.7, 1] : 0.55,
          r: isOpen ? [7, 9, 7] : 7,
        }}
        transition={
          isOpen
            ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" }
            : { duration: 0.4 }
        }
        filter="url(#vault-glow-strong)"
      />

      {/* Innermost white-hot point */}
      <circle cx={cx} cy={cy} r="2.5" fill="oklch(1 0 0 / 0.95)" />

      {/* Hex frame inner connector dashes (4 cardinal directions inside hex) */}
      {[0, 60, 120, 180, 240, 300].map((angle) => {
        const inner = polar(cx, cy, 22, angle);
        const outer = polar(cx, cy, 30, angle);
        return (
          <line
            key={angle}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke="oklch(from var(--vault-gold) l c h / 0.7)"
            strokeWidth="0.6"
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

// ──────────────────────────────────────────────────────────────────
// SVG defs (gradients + filters used by sub-layers)
// ──────────────────────────────────────────────────────────────────

function VaultDefs() {
  return (
    <defs>
      <radialGradient id="vault-backdrop" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="oklch(0.22 0.16 252)" stopOpacity="0.95" />
        <stop offset="60%" stopColor="oklch(0.16 0.14 254)" stopOpacity="0.7" />
        <stop offset="100%" stopColor="oklch(0.08 0.05 254)" stopOpacity="0" />
      </radialGradient>

      <radialGradient id="center-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="oklch(0.96 0.06 88)" stopOpacity="0.7" />
        <stop offset="40%" stopColor="oklch(0.78 0.16 82)" stopOpacity="0.4" />
        <stop offset="100%" stopColor="oklch(0.36 0.14 55)" stopOpacity="0" />
      </radialGradient>

      <radialGradient id="center-brass" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stopColor="oklch(0.96 0.06 88)" />
        <stop offset="35%" stopColor="oklch(0.78 0.16 82)" />
        <stop offset="100%" stopColor="oklch(0.36 0.14 55)" />
      </radialGradient>

      <linearGradient id="sweep-grad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="oklch(from var(--vault-lapis-glow) l c h / 0)" />
        <stop offset="60%" stopColor="oklch(from var(--vault-lapis-glow) l c h / 0.2)" />
        <stop offset="95%" stopColor="oklch(from var(--vault-lapis-bright) l c h / 0.95)" />
        <stop offset="100%" stopColor="oklch(from var(--vault-lapis-bright) l c h / 1)" />
      </linearGradient>

      <filter id="vault-glow-soft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter id="vault-glow-strong" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────

export function VaultMechanism({ state, size = 200 }: Props) {
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* CSS-driven ambient glow under the SVG */}
      <motion.div
        className="absolute inset-0 rounded-full"
        initial={false}
        animate={{
          opacity: state === "unlocked" ? 1 : state === "unlocking" ? 0.7 : 0.35,
          scale: state === "unlocked" ? 1.1 : 1,
        }}
        transition={{ duration: 0.6 }}
        style={{
          background:
            "radial-gradient(circle at 50% 50%, oklch(from var(--vault-gold-glow) l c h / 0.5) 0%, oklch(from var(--vault-lapis-glow) l c h / 0.25) 40%, transparent 70%)",
          filter: "blur(12px)",
        }}
      />

      {/* Idle breathing — gentle scale pulse so the whole mechanism feels alive
          even when nothing is happening. Off during verifying/unlocking so it
          doesn't conflict with the dramatic motion of those states. */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{
          scale: state === "idle" ? [1, 1.012, 1] : 1,
        }}
        transition={
          state === "idle"
            ? { repeat: Infinity, duration: 4.5, ease: "easeInOut" }
            : { duration: 0.4 }
        }
        style={{ transformOrigin: "50% 50%" }}
      >
        <BreathingChild state={state} size={size} />
      </motion.div>
    </div>
  );
}

interface BreathingChildProps {
  state: VaultState;
  size: number;
}

function BreathingChild({ state, size }: BreathingChildProps) {
  return (
    <>

      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        className="relative"
        style={{ overflow: "visible" }}
      >
        <VaultDefs />

        {/* Backdrop disc */}
        <circle cx="100" cy="100" r="95" fill="url(#vault-backdrop)" />

        {/* All layers in z-order, back to front */}
        <HexagonGrid state={state} />
        <CornerBrackets state={state} />
        <CrosshairReticle state={state} />
        <SystemLabels state={state} />
        <OuterDegreeScale state={state} />
        <ScanSweep state={state} />
        <SegmentedArcRing state={state} />
        <GlyphRing state={state} />
        <DashRing state={state} />
        <CenterCore state={state} />
      </svg>
    </>
  );
}
