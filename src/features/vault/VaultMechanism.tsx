import { motion } from "motion/react";
import { KeyRound } from "lucide-react";

/**
 * High-security vault mechanism. Three concentric tumbler rings rotate
 * independently. State machine drives the visual story:
 *
 *   idle       — slow continuous rotation in opposite directions
 *   verifying  — accelerated chaotic spin (during passphrase check)
 *   unlocking  — sequential snap-to-zero with spring (each ring 200ms,
 *                staggered) + center key glow
 *   unlocked   — settled, gold halo radiates briefly
 *
 * Pure SVG + motion. Respects prefers-reduced-motion automatically since
 * `motion` honors the global media query (we set animation-duration to
 * 0.01ms in globals.css on reduce).
 */

export type VaultState = "idle" | "verifying" | "unlocking" | "unlocked";

interface Props {
  state: VaultState;
  size?: number;
}

interface RingConfig {
  r: number;            // radius in viewBox units (0..100)
  ticks: number;        // total tumbler positions
  idleSeconds: number;  // one full revolution in idle
  direction: 1 | -1;
  snapDelay: number;    // unlocking sequence delay (s)
  stroke: string;
  alignmentColor: string;
}

const RINGS: RingConfig[] = [
  {
    r: 44, ticks: 12, idleSeconds: 22, direction: 1, snapDelay: 0,
    stroke: "var(--vault-gold)",
    alignmentColor: "var(--vault-gold-bright)",
  },
  {
    r: 34, ticks: 9, idleSeconds: 16, direction: -1, snapDelay: 0.18,
    stroke: "var(--vault-lapis-bright)",
    alignmentColor: "var(--vault-lapis-bright)",
  },
  {
    r: 24, ticks: 6, idleSeconds: 12, direction: 1, snapDelay: 0.36,
    stroke: "var(--vault-gold)",
    alignmentColor: "var(--vault-gold-bright)",
  },
];

function ringAnimate(state: VaultState, cfg: RingConfig) {
  const fullCircle = 360 * cfg.direction;
  switch (state) {
    case "idle":
      return { rotate: [0, fullCircle] };
    case "verifying":
      return { rotate: [0, fullCircle * 4] };
    case "unlocking":
    case "unlocked":
      return { rotate: 0 };
  }
}

function ringTransition(state: VaultState, cfg: RingConfig) {
  switch (state) {
    case "idle":
      return { repeat: Infinity, duration: cfg.idleSeconds, ease: "linear" as const };
    case "verifying":
      return { repeat: Infinity, duration: cfg.idleSeconds / 4, ease: "linear" as const };
    case "unlocking":
    case "unlocked":
      return {
        type: "spring" as const,
        stiffness: 220,
        damping: 22,
        delay: cfg.snapDelay,
      };
  }
}

interface RingProps {
  cfg: RingConfig;
  state: VaultState;
  highlightAlignment: boolean;
}

function Ring({ cfg, state, highlightAlignment }: RingProps) {
  const center = 50;
  return (
    <motion.g
      style={{ transformOrigin: "50px 50px", transformBox: "view-box" }}
      animate={ringAnimate(state, cfg)}
      transition={ringTransition(state, cfg)}
    >
      {/* The ring itself — thin engraved circle */}
      <circle
        cx={center}
        cy={center}
        r={cfg.r}
        fill="none"
        stroke={cfg.stroke}
        strokeOpacity={state === "unlocked" ? 0.95 : 0.55}
        strokeWidth={0.7}
      />
      {/* Tumbler ticks */}
      {Array.from({ length: cfg.ticks }, (_, i) => {
        const angle = (i / cfg.ticks) * Math.PI * 2 - Math.PI / 2;
        const isAlignment = i === 0;
        const tickInner = cfg.r - (isAlignment ? 4 : 2);
        const tickOuter = cfg.r + (isAlignment ? 1 : 0);
        const x1 = center + tickInner * Math.cos(angle);
        const y1 = center + tickInner * Math.sin(angle);
        const x2 = center + tickOuter * Math.cos(angle);
        const y2 = center + tickOuter * Math.sin(angle);
        return (
          <motion.line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeLinecap="round"
            stroke={
              isAlignment && highlightAlignment ? cfg.alignmentColor : cfg.stroke
            }
            strokeWidth={isAlignment ? 1.4 : 0.6}
            initial={false}
            animate={{
              opacity: isAlignment && highlightAlignment ? 1 : 0.7,
              strokeWidth:
                isAlignment && highlightAlignment ? 1.8 : isAlignment ? 1.4 : 0.6,
            }}
            transition={{ duration: 0.25 }}
            style={{
              filter:
                isAlignment && highlightAlignment
                  ? `drop-shadow(0 0 2px ${cfg.alignmentColor})`
                  : undefined,
            }}
          />
        );
      })}
    </motion.g>
  );
}

export function VaultMechanism({ state, size = 110 }: Props) {
  const highlight = state === "unlocking" || state === "unlocked";
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Outer halo — intensifies on unlocked */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          opacity: state === "unlocked" ? 1 : state === "unlocking" ? 0.6 : 0.25,
          scale: state === "unlocked" ? 1.05 : 1,
        }}
        transition={{ duration: 0.6 }}
        style={{
          background:
            "radial-gradient(circle at 50% 50%, oklch(from var(--vault-gold-glow) l c h / 0.5) 0%, transparent 60%)",
          filter: "blur(8px)",
        }}
      />

      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="relative"
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Polished brass center disc */}
          <radialGradient id="vault-center-gold" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="oklch(0.96 0.06 88)" />
            <stop offset="35%" stopColor="oklch(0.78 0.16 82)" />
            <stop offset="100%" stopColor="oklch(0.36 0.14 55)" />
          </radialGradient>
          {/* Lapis backdrop */}
          <radialGradient id="vault-backdrop-lapis" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="oklch(0.16 0.14 254)" stopOpacity="0.95" />
            <stop offset="80%" stopColor="oklch(0.16 0.14 254)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="oklch(0.16 0.14 254)" stopOpacity="0" />
          </radialGradient>
          {/* Center keyhole drop-shadow */}
          <filter id="vault-key-emboss" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0.6" stdDeviation="0" floodColor="oklch(0.96 0.06 88)" floodOpacity="0.7" />
            <feDropShadow dx="0" dy="-0.6" stdDeviation="0" floodColor="oklch(0.36 0.14 55)" floodOpacity="0.85" />
          </filter>
        </defs>

        {/* Lapis backdrop disc */}
        <circle cx="50" cy="50" r="48" fill="url(#vault-backdrop-lapis)" />

        {/* Three rings */}
        {RINGS.map((cfg, i) => (
          <Ring key={i} cfg={cfg} state={state} highlightAlignment={highlight} />
        ))}

        {/* Center brass disc */}
        <motion.circle
          cx="50"
          cy="50"
          r="13"
          fill="url(#vault-center-gold)"
          stroke="oklch(0.36 0.14 55)"
          strokeWidth="0.6"
          animate={{
            scale: state === "unlocked" ? 1.08 : 1,
          }}
          transition={{ type: "spring", stiffness: 240, damping: 18, delay: 0.5 }}
          style={{ transformOrigin: "50px 50px", transformBox: "view-box" }}
        />

        {/* Mirror specular point on the brass disc */}
        <ellipse
          cx="46"
          cy="46"
          rx="3"
          ry="2"
          fill="oklch(0.98 0.04 88)"
          opacity="0.65"
        />

        {/* Center key icon — KeyRound rendered as foreignObject for SVG composition */}
        <foreignObject x="35" y="35" width="30" height="30">
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              filter: "url(#vault-key-emboss)",
            }}
          >
            <KeyRound
              size={18}
              strokeWidth={2.5}
              style={{ color: "oklch(0.18 0.06 50)" }}
            />
          </div>
        </foreignObject>
      </svg>
    </div>
  );
}
