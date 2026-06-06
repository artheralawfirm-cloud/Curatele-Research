/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  note: string;
  color: string;
  bgLight: string;
  borderColor: string;
  Icon: LucideIcon;
  pctVal: number;
  ringColor: string;
  isSimulated: boolean;
  dark?: boolean;
}

export function MetricCard({
  label,
  value,
  note,
  color,
  bgLight,
  borderColor,
  Icon,
  pctVal,
  ringColor,
  isSimulated,
  dark = false
}: MetricCardProps) {
  // SVG circular progress calculation
  const size = 58;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pctVal / 100) * circumference;

  // Adaptive colors for pristine dark mode contrast
  const labelColor = dark
    ? color === "#DC2626"
      ? "#F87171" // red-400
      : color === "#D97706"
      ? "#F59E0B" // amber-500
      : "#60A5FA" // blue-400
    : color;

  const valueColor = dark
    ? color === "#DC2626"
      ? "#FCA5A5" // red-300
      : color === "#D97706"
      ? "#FDE68A" // amber-200
      : "#93C5FD" // blue-300
    : color;

  const activeRingColor = dark
    ? ringColor === "#DC2626"
      ? "#F87171"
      : ringColor === "#D97706"
      ? "#F59E0B"
      : "#60A5FA"
    : ringColor;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="card relative overflow-hidden rounded-2xl border p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-within:ring-2 focus-within:ring-blue-500"
      style={{
        backgroundColor: bgLight,
        borderTopColor: borderColor,
        borderRightColor: borderColor,
        borderBottomColor: borderColor,
        borderLeftColor: dark ? activeRingColor : color,
        borderLeftWidth: "5px",
        borderLeftStyle: "solid"
      }}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 pr-2">
          {/* Label */}
          <div
            className="text-xs font-bold tracking-wider uppercase mb-1.5"
            style={{ color: labelColor }}
          >
            {label}
          </div>
          {/* Value */}
          <div className="text-3xl font-bold font-serif mb-1 tracking-tight select-all flex items-baseline gap-1 h-9 overflow-hidden" style={{ color: valueColor }}>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={typeof value === "number" ? value : String(value)}
                initial={{ opacity: 0, y: -18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 18 }}
                transition={{ type: "spring", stiffness: 300, damping: 25, duration: 0.3 }}
                className="inline-block"
              >
                {typeof value === "number" ? value.toLocaleString("id-ID") : value}
              </motion.span>
            </AnimatePresence>
            <span className="text-xs font-normal opacity-80 text-slate-500 dark:text-slate-400 self-end mb-1">perkara</span>
          </div>
          {/* Note */}
          <div className="text-xs text-slate-500 dark:text-slate-250 font-medium leading-relaxed mt-2 font-mono min-h-[40px] overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={note}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                {note}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Circular Progress Ring */}
        <div className="relative flex-shrink-0 align-middle select-none">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="transform -rotate-90"
          >
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={dark ? "#1e293b" : "rgba(0,0,0,0.06)"}
              strokeWidth={strokeWidth}
            />
            {/* Indicator circle */}
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={activeRingColor}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
              strokeLinecap="round"
            />
          </svg>
          <div
            className="absolute inset-0 flex items-center justify-center text-xs font-bold font-mono"
            style={{ color: labelColor }}
          >
            {pctVal}%
          </div>
        </div>
      </div>

      {/* Decorative linear progress tracker at the bottom of card */}
      <div className="mt-4 w-full bg-black/5 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: activeRingColor }}
          initial={{ width: 0 }}
          animate={{ width: `${pctVal}%` }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      </div>

      {/* Pulse effect if Simulated & positive */}
      {isSimulated && label.includes("Dicegah") && (
        <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
        </span>
      )}
    </motion.div>
  );
}
