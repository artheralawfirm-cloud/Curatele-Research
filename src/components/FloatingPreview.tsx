/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { CaseData } from "../types";
import { Shield, AlertTriangle, Scale, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface FloatingPreviewProps {
  activeCase: (CaseData & { disp?: number; pct?: number }) | null;
  x: number;
  y: number;
  totalVolume?: number;
}

export function FloatingPreview({ activeCase, x, y, totalVolume }: FloatingPreviewProps) {
  if (!activeCase) return null;

  const isHilir = activeCase.sifat === "Hilir";
  const accentColor = isHilir ? "#DC2626" : "#2563EB";

  // Position relative to viewport, adjusted to stay on-screen
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;

  // Let's dynamically shift the preview box so it's always fully visible within viewport.
  const previewWidth = 380;
  const previewEstimateHeight = 420;

  const left = x + previewWidth + 30 > viewportWidth ? Math.max(10, x - previewWidth - 15) : x + 20;
  const top = y + previewEstimateHeight + 30 > viewportHeight ? Math.max(10, y - previewEstimateHeight - 15) : y + 15;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15 }}
        style={{
          position: "fixed",
          top: top,
          left: left,
          zIndex: 9999,
          maxWidth: "380px",
          width: "calc(100vw - 40px)",
          pointerEvents: "none", // Prevent mouse flickering
        }}
        className="pointer-events-none rounded-2xl border border-slate-200/90 dark:border-slate-700/90 bg-white/95 dark:bg-slate-900/95 shadow-2xl backdrop-blur-md p-4 space-y-3.5 text-slate-800 dark:text-slate-100"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-2.5">
          <div>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider mb-1.5 ${
                isHilir
                  ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                  : "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
              }`}
            >
              {isHilir ? (
                <>
                  <AlertTriangle className="w-3 h-3" />
                  Hilir (Sengketa Aktif)
                </>
              ) : (
                <>
                  <Shield className="w-3 h-3" />
                  Hulu (Preventif)
                </>
              )}
            </span>
            <h4 className="font-serif font-bold text-sm lg:text-base text-slate-950 dark:text-white leading-snug">
              {activeCase.perkara}
            </h4>
          </div>

          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0"
            style={{
              borderColor: accentColor,
              borderWidth: "1px",
              color: accentColor,
              backgroundColor: isHilir ? "rgba(220, 38, 38, 0.08)" : "rgba(37, 99, 235, 0.08)"
            }}
          >
            {activeCase.risiko}
          </span>
        </div>

        {/* Core Message */}
        <div className="space-y-1 bg-amber-50/70 dark:bg-amber-950/10 border-l-2 border-amber-500 rounded-md p-2.5">
          <div className="flex items-center gap-1 text-[10px] font-bold text-amber-800 dark:text-amber-400 uppercase tracking-widest">
            <BookOpen className="w-3.5 h-3.5" />
            Core Message
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
            {activeCase.core}
          </p>
        </div>

        {/* Urgency */}
        <div className="space-y-1 bg-red-50/50 dark:bg-red-950/10 border-l-2 border-rose-500 rounded-md p-2.5">
          <div className="flex items-center gap-1 text-[10px] font-bold text-rose-800 dark:text-rose-400 uppercase tracking-widest">
            <AlertTriangle className="w-3.5 h-3.5" />
            Urgensi & Dampak
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
            {activeCase.urgensi}
          </p>
        </div>

        {/* Yuridis Preview */}
        <div className="flex gap-2 items-start text-slate-600 dark:text-slate-400 text-[11px] pt-1">
          <Scale className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Konteks Regulasi:</span>{" "}
            {activeCase.yuridis}
          </p>
        </div>

        {/* Deep-dive Statistics & Percentage Contributions */}
        {activeCase.disp !== undefined && (
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 dark:border-slate-800/80 pt-3">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
              <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 dark:text-slate-500 block mb-0.5">
                Beban Perkara
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white font-mono flex items-baseline gap-1">
                {activeCase.disp}
                <span className="text-[10px] text-slate-400 font-sans font-normal">/ {activeCase.jumlah} riil</span>
              </span>
            </div>
            
            {totalVolume && (
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 dark:text-slate-500 block mb-0.5">
                  Andil Kontribusi
                </span>
                <span className="text-sm font-black font-mono" style={{ color: accentColor }}>
                  {totalVolume > 0 ? ((activeCase.disp / totalVolume) * 100).toFixed(1) : 0}%
                </span>
              </div>
            )}
          </div>
        )}

        {/* Bottom hint */}
        <div className="text-[9px] text-center text-slate-400 select-none border-t border-slate-100 dark:border-slate-800 pt-2 font-medium">
          Klik bar atau baris untuk menyematkan detail ke panel samping.
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
