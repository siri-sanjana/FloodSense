'use client';

import React, { useState } from 'react';
import { ArrowRight, Clock, AlertTriangle } from 'lucide-react';

interface CompareSliderProps {
  beforeImage: string;
  afterImage: string;
  beforeDate?: string;
  afterDate?: string;
  beforeInundatedM2?: number;
  afterInundatedM2?: number;
}

export const CompareSlider: React.FC<CompareSliderProps> = ({
  beforeImage,
  afterImage,
  beforeDate = '18 Oct 2026, 09:00 IST (Pass 1)',
  afterDate = '19 Oct 2026, 15:30 IST (Pass 2)',
  beforeInundatedM2 = 32400,
  afterInundatedM2 = 48620,
}) => {
  const [position, setPosition] = useState<number>(50);

  const deltaM2 = afterInundatedM2 - beforeInundatedM2;
  const deltaPct = ((deltaM2 / beforeInundatedM2) * 100).toFixed(1);

  return (
    <div className="flex flex-col w-full bg-abyss-950 hairline-all border-abyss-700">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-abyss-900 hairline-b border-abyss-800 text-xs font-mono">
        <div className="flex items-center space-x-2 text-silt-300">
          <Clock className="w-3.5 h-3.5 text-[#D9822B]" />
          <span className="uppercase tracking-wider text-[10px]">Flood Progression Timeline</span>
        </div>
        <div className="text-[11px] text-[#D9822B] font-semibold">
          +{deltaM2.toLocaleString()} m² ({deltaPct}% expansion)
        </div>
      </div>

      {/* Interactive slider viewer */}
      <div className="relative w-full aspect-[16/9] overflow-hidden select-none bg-black">
        {/* After Image (Full width background) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterImage}
          alt="Later Flood Extent"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Before Image (Clipped by slider position) */}
        <div
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${position}%` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={beforeImage}
            alt="Initial Baseline Extent"
            className="absolute inset-y-0 left-0 max-w-none h-full object-cover"
            style={{ width: '100vw' }} // maintains scale
          />
        </div>

        {/* Divider line and handle */}
        <div
          className="absolute inset-y-0 w-[2px] bg-silt-200 cursor-ew-resize z-20 pointer-events-none"
          style={{ left: `${position}%` }}
        >
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-abyss-950 hairline-all border-silt-200 flex items-center justify-center shadow-lg">
            <span className="text-[9px] font-mono text-silt-200 font-bold">&harr;</span>
          </div>
        </div>

        {/* Slider Input overlay */}
        <input
          type="range"
          min="0"
          max="100"
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
          aria-label="Timeline flood progression comparison slider"
        />

        {/* Corner date stamps */}
        <div className="absolute top-2 left-2 z-10 px-2 py-1 bg-abyss-950/80 hairline-all border-abyss-700 text-[10px] font-mono text-silt-300">
          Baseline: {beforeDate}
        </div>
        <div className="absolute top-2 right-2 z-10 px-2 py-1 bg-abyss-950/80 hairline-all border-abyss-700 text-[10px] font-mono text-[#D9822B]">
          Current: {afterDate}
        </div>
      </div>

      {/* Delta stat strip */}
      <div className="grid grid-cols-3 divide-x divide-abyss-800 bg-abyss-900 hairline-t border-abyss-800 text-center py-2 text-[11px] font-mono">
        <div>
          <div className="text-silt-500 text-[10px]">T-0 Baseline Area</div>
          <div className="text-silt-200">{beforeInundatedM2.toLocaleString()} m²</div>
        </div>
        <div>
          <div className="text-silt-500 text-[10px]">T+1 Current Area</div>
          <div className="text-silt-200">{afterInundatedM2.toLocaleString()} m²</div>
        </div>
        <div>
          <div className="text-silt-500 text-[10px]">Expansion Delta</div>
          <div className="text-[#D9822B] font-semibold">+{deltaPct}% Rate</div>
        </div>
      </div>
    </div>
  );
};
