'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { CitationClause } from '../lib/types';

interface CitationDrawerProps {
  citation: CitationClause | null;
  onClose: () => void;
}

export const CitationDrawer: React.FC<CitationDrawerProps> = ({ citation, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!citation) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-lg h-full bg-abyss-950 hairline-l border-abyss-700 flex flex-col p-6 shadow-depth overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 hairline-b border-abyss-800">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="px-1.5 py-0.5 bg-abyss-800 hairline-all border-abyss-700 text-[10px] font-mono text-[#D9822B] uppercase tracking-wider">
                  Verified Protocol Clause
                </span>
                <span className="text-[10px] font-mono text-silt-500">
                  Relevance: {(citation.relevance * 100).toFixed(0)}%
                </span>
              </div>
              <h3 className="font-serif text-lg text-silt-200 leading-snug">
                {citation.clause}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-silt-400 hover:text-silt-200 hairline-all border-abyss-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Source Document */}
          <div className="py-4 space-y-2">
            <div className="text-[11px] font-mono text-silt-500 uppercase tracking-wider">
              Statutory Source Document
            </div>
            <div className="p-3 bg-abyss-900 hairline-all border-abyss-800 text-xs text-silt-300 font-mono flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-silt-400 shrink-0" />
              <span>{citation.document}</span>
            </div>
          </div>

          {/* Exact Verbatim Excerpt */}
          <div className="py-4 space-y-2 flex-1">
            <div className="text-[11px] font-mono text-silt-500 uppercase tracking-wider">
              Statutory Excerpt
            </div>
            <blockquote className="p-4 bg-abyss-900/60 hairline-l-2 border-l-[#D9822B] text-sm text-silt-300 leading-relaxed font-sans italic">
              &ldquo;{citation.excerpt}&rdquo;
            </blockquote>
          </div>

          {/* Tactical Directive */}
          {citation.action_item && (
            <div className="pt-4 mt-auto hairline-t border-abyss-800 space-y-2">
              <div className="flex items-center space-x-2 text-[11px] font-mono text-[#D9822B] uppercase tracking-wider">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Mandated Field Action</span>
              </div>
              <div className="p-3.5 bg-abyss-900 hairline-all border-abyss-700 text-xs text-silt-200 font-mono leading-normal">
                {citation.action_item}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
