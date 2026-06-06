/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { StatSummary } from "../types";
import { TrendingDown, ShieldAlert, CheckCircle, Info } from "lucide-react";

interface DonutTooltipProps {
  activeSegment: { v: number; c: string; label: string } | null;
  stats: StatSummary;
  donutTotal: number;
  x: number;
  y: number;
}

export function DonutTooltip({ activeSegment, stats, donutTotal, x, y }: DonutTooltipProps) {
  if (!activeSegment) return null;

  const pct = donutTotal > 0 ? Math.round((activeSegment.v / donutTotal) * 100) : 0;
  
  // Custom deep-dive info depending on the segment
  let title = activeSegment.label;
  let icon = <Info className="w-4 h-4 text-slate-400" />;
  let description = "";
  let breakdown = null;

  if (activeSegment.label === "Sengketa Hilir") {
    icon = <ShieldAlert className="w-4 h-4 text-red-500 animate-bounce" />;
    description = "Perkara keperdataan yang telah terlanjur masuk ke meja hijau (proses litigasi). Sengketa hilir memakan waktu panjang dan biaya besar, umumnya timbul karena tidak adanya pengawasan preventif dalam tata kelola pengampuan atau pembagian waris secara tertib di hulu.";
    breakdown = (
      <div className="text-[11px] space-y-1.5 text-slate-500 dark:text-slate-400">
        <div className="flex justify-between">
          <span>Rasio Beban Aktif:</span>
          <span className="font-extrabold text-red-500">{pct}% dari beban nasional</span>
        </div>
        <div className="flex justify-between">
          <span>Karakteristik Klasik:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">Gugatan Waris & Denda Curatela</span>
        </div>
      </div>
    );
  } else if (activeSegment.label === "Pengampuan Hulu") {
    icon = <CheckCircle className="w-4 h-4 text-blue-500 animate-pulse" />;
    description = "Tindakan perlindungan hukum diinisiasi oleh BHP selaku Pengampu Pengawas (Pasal 449 KUHPerdata) demi mengamankan hak keperdataan, melestarikan aset, serta membimbing subjek hukum rentan (anak di bawah umur, subjek curatela) sebelum terpeleset menjadi sengketa gugatan di hulu.";
    breakdown = (
      <div className="text-[11px] space-y-1.5 text-slate-500 dark:text-slate-400">
        <div className="flex justify-between">
          <span>Proporsi Pengamanan:</span>
          <span className="font-extrabold text-blue-500">{pct}% dari total intervensi</span>
        </div>
        <div className="flex justify-between">
          <span>Yurisdiksi Utama:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">Curatela & Pengampu Pengawas</span>
        </div>
      </div>
    );
  } else if (activeSegment.label === "Sengketa Terfilter") {
    icon = <TrendingDown className="w-4 h-4 text-emerald-500 animate-pulse" />;
    description = "Estimasi jumlah sengketa keperdataan potensial yang berhasil diredam secara damai di luar pengadilan. Reduksi dicapai berkat ketertiban sertifikasi hak waris dan efektivitas intervensi pengawasan preventif Balai Harta Peninggalan.";
    breakdown = (
      <div className="text-[11px] space-y-1.5 text-slate-500 dark:text-slate-400">
        <div className="flex justify-between">
          <span>Dampak Preventif:</span>
          <span className="font-extrabold text-emerald-500">Mencegah 80% Gugatan Aktif</span>
        </div>
        <div className="flex justify-between">
          <span>Mekanisme Utama:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">Pengawasan Pengampuan</span>
        </div>
      </div>
    );
  }

  // Adjust coordinates dynamically to prevent going out of bounds
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;

  const tooltipWidth = 320;
  const tooltipEstimateHeight = 220;

  const left = x + tooltipWidth + 30 > viewportWidth ? Math.max(10, x - tooltipWidth - 15) : x + 20;
  const top = y + tooltipEstimateHeight + 30 > viewportHeight ? Math.max(10, y - tooltipEstimateHeight - 15) : y + 15;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.15 }}
        style={{
          position: "fixed",
          top: top,
          left: left,
          zIndex: 9999,
          width: `${tooltipWidth}px`,
          pointerEvents: "none"
        }}
        className="pointer-events-none rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/95 shadow-2xl backdrop-blur-md p-4 space-y-3.5 text-slate-800 dark:text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 shrink-0">
              {icon}
            </span>
            <span className="font-sans font-black text-sm text-slate-950 dark:text-white">
              {title}
            </span>
          </div>
          <span 
            className="text-[13px] font-black font-mono px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800/80"
            style={{ color: activeSegment.c }}
          >
            {pct}%
          </span>
        </div>

        {/* Volume Metric */}
        <div className="space-y-1">
          <div className="text-[9px] uppercase font-black tracking-widest text-slate-400 dark:text-slate-500">
            Volume Kasus Keperdataan
          </div>
          <div className="text-2xl font-bold font-serif text-slate-950 dark:text-white flex items-baseline gap-1.5 leading-none">
            {activeSegment.v.toLocaleString("id-ID")}
            <span className="text-xs text-slate-500 font-sans font-semibold">Perkara</span>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {description}
        </p>

        {/* Breakdown */}
        {breakdown && (
          <div className="border-t border-slate-100 dark:border-slate-800/60 pt-3">
            {breakdown}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
