'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ShieldCheck, Flame, Droplets } from 'lucide-react';

interface TideGaugeProps {
  score?: number; // 0.0 to 10.0
  level?: 'LOW' | 'MODERATE' | 'CRITICAL' | 'CATASTROPHIC';
  height?: number; // pixel height, default 280
  currentWaterLevelMeters?: number;
  dangerThresholdMeters?: number;
  tidePhase?: string;
}

export const TideGauge: React.FC<TideGaugeProps> = ({
  score: rawScore,
  level: rawLevel,
  height = 280,
  currentWaterLevelMeters,
  dangerThresholdMeters = 2.5,
  tidePhase = 'Rising High Surge',
}) => {
  const score =
    rawScore !== undefined
      ? rawScore
      : currentWaterLevelMeters !== undefined
      ? Math.min(10, Number(((currentWaterLevelMeters / dangerThresholdMeters) * 10).toFixed(1)))
      : 8.1;

  const level: 'LOW' | 'MODERATE' | 'CRITICAL' | 'CATASTROPHIC' =
    rawLevel ||
    (score >= 8.5
      ? 'CATASTROPHIC'
      : score >= 7.0
      ? 'CRITICAL'
      : score >= 4.0
      ? 'MODERATE'
      : 'LOW');

  const percentage = Math.min(Math.max((score / 10.0) * 100, 6), 100);

  const getTheme = () => {
    switch (level) {
      case 'CATASTROPHIC':
        return {
          color: '#DC2626',
          glow: 'rgba(220, 38, 38, 0.6)',
          tag: 'DEFCON 1 // RUN',
          icon: Flame,
        };
      case 'CRITICAL':
        return {
          color: '#00D4FF',
          glow: 'rgba(0, 212, 255, 0.6)',
          tag: 'HIGH INUNDATION',
          icon: AlertTriangle,
        };
      case 'MODERATE':
        return {
          color: '#00B8D9',
          glow: 'rgba(0, 184, 217, 0.4)',
          tag: 'WATCH DYKES',
          icon: Droplets,
        };
      case 'LOW':
      default:
        return {
          color: '#059669',
          glow: 'rgba(5, 150, 105, 0.3)',
          tag: 'PASSABLE',
          icon: ShieldCheck,
        };
    }
  };

  const theme = getTheme();
  const Icon = theme.icon;

  return (
    <div
      className="flex flex-col items-center select-none font-mono py-3 px-2 bg-white border border-slate-200 rounded-xl shadow-xs w-full"
      style={{ height: `${height}px` }}
    >
      {/* Top score readout */}
      <div className="flex flex-col items-center mb-2 text-center">
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
          HYDRO SEVERITY GAUGE
        </span>
        <div className="text-base font-bold text-slate-900 flex items-baseline space-x-0.5">
          <span>{score.toFixed(1)}</span>
          <span className="text-[10px] text-slate-500">/10</span>
        </div>
        {currentWaterLevelMeters !== undefined && (
          <span className="text-[10px] text-cyan-800 mt-0.5 font-medium">
            {currentWaterLevelMeters.toFixed(2)}m Depth &bull; {tidePhase}
          </span>
        )}
      </div>

      {/* Vertical gauge track */}
      <div className="relative w-10 flex-1 bg-slate-100 border border-slate-300 rounded-lg overflow-hidden flex flex-col justify-end">
        {/* Tick marks on gauge */}
        <div className="absolute inset-0 flex flex-col justify-between py-2 pointer-events-none z-10 px-1 opacity-70">
          {[10, 8, 6, 4, 2].map((tick) => (
            <div key={tick} className="flex items-center justify-between">
              <span className="w-1.5 h-[1px] bg-slate-400" />
              <span className="text-[8px] font-bold text-slate-600">{tick}</span>
            </div>
          ))}
        </div>

        {/* Rising animated water level */}
        <motion.div
          initial={{ height: '0%' }}
          animate={{ height: `${percentage}%` }}
          transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full"
          style={{
            backgroundColor: theme.color,
          }}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-white/70" />
        </motion.div>
      </div>

      {/* Bottom tag pill */}
      <div className="mt-2.5 text-center">
        <div
          className="px-2 py-0.5 text-[10px] font-bold tracking-tight rounded border flex items-center justify-center space-x-1"
          style={{
            borderColor: theme.color,
            color: theme.color,
            backgroundColor: `${theme.color}15`,
          }}
        >
          <Icon className="w-3 h-3" />
          <span>{theme.tag}</span>
        </div>
      </div>
    </div>
  );
};
