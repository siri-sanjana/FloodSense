'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface WaterLoaderProps {
  onComplete?: () => void;
}

export const WaterLoader: React.FC<WaterLoaderProps> = ({ onComplete }) => {
  const [percent, setPercent] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setPercent((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setHidden(true);
            if (onComplete) onComplete();
          }, 350);
          return 100;
        }
        return prev + 4;
      });
    }, 40);

    return () => clearInterval(interval);
  }, [onComplete]);

  if (hidden) return null;

  return (
    <AnimatePresence>
      <motion.div
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-[10000] bg-abyss-950 flex flex-col justify-end overflow-hidden select-none"
      >
        {/* Rising water fill */}
        <div
          className="w-full bg-[#0E3B43] relative transition-all duration-75 ease-out"
          style={{ height: `${percent}%` }}
        >
          {/* Water surface line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#D9822B] shadow-md" />
        </div>

        {/* Central percentage readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center font-mono text-xs">
          <div className="text-[10px] uppercase tracking-widest text-silt-500 mb-2">
            INITIALIZING MULTIMODAL SENSOR PIPELINE
          </div>
          <div className="font-serif text-5xl font-light text-silt-100">
            {percent}<span className="text-[#D9822B] text-3xl font-mono">%</span>
          </div>
          <div className="text-[10px] text-silt-400 mt-3">
            Loading GLSL Caustics &amp; SegFormer 10-Class Weights
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
