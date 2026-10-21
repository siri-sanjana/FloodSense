'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Image as ImageIcon, BookOpen, Download, SunMoon, Shield } from 'lucide-react';
import { INITIAL_THREADS } from '../lib/mock-data';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNewInspection?: () => void;
  onExportPDF?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNewInspection,
  onExportPDF,
}) => {
  const [query, setQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? onClose() : null; // toggle or handled by parent
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredThreads = INITIAL_THREADS.filter(t =>
    t.title.toLowerCase().includes(query.toLowerCase()) ||
    t.location_tag?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-abyss-950 hairline-all border-abyss-700 shadow-depth overflow-hidden">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 hairline-b border-abyss-800">
          <Search className="w-4 h-4 text-silt-400 mr-3" />
          <input
            type="text"
            autoFocus
            placeholder="Type a command or search incident logs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-silt-200 placeholder-silt-500 focus:outline-none font-sans"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-silt-500 bg-abyss-900 hairline-all border-abyss-800">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {/* Quick Actions */}
          <div className="text-[10px] font-mono text-silt-500 px-3 py-1 uppercase tracking-wider">
            Quick Actions
          </div>

          <button
            onClick={() => {
              onClose();
              if (onNewInspection) onNewInspection();
            }}
            className="w-full flex items-center justify-between px-3 py-2 text-left text-xs text-silt-200 hover:bg-abyss-900 hairline-all border-transparent hover:border-abyss-700 transition-colors"
          >
            <div className="flex items-center space-x-2.5">
              <Plus className="w-3.5 h-3.5 text-[#D9822B]" />
              <span>Initiate New UAV Inspection Pass</span>
            </div>
            <kbd className="text-[10px] font-mono text-silt-500">Ctrl+N</kbd>
          </button>

          <button
            onClick={() => {
              onClose();
              router.push('/app/gallery');
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-2 text-left text-xs text-silt-200 hover:bg-abyss-900 hairline-all border-transparent hover:border-abyss-700 transition-colors"
          >
            <ImageIcon className="w-3.5 h-3.5 text-silt-400" />
            <span>Open Reconnaissance Image Gallery</span>
          </button>

          <button
            onClick={() => {
              onClose();
              if (onExportPDF) onExportPDF();
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-2 text-left text-xs text-silt-200 hover:bg-abyss-900 hairline-all border-transparent hover:border-abyss-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-silt-400" />
            <span>Export latest SITREP as PDF</span>
          </button>

          {/* Incident Threads */}
          <div className="text-[10px] font-mono text-silt-500 px-3 pt-3 pb-1 uppercase tracking-wider">
            Incident Threads
          </div>

          {filteredThreads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => {
                onClose();
                router.push(`/app/chat/${thread.id}`);
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-xs text-silt-200 hover:bg-abyss-900 hairline-all border-transparent hover:border-abyss-700 transition-colors"
            >
              <div>
                <div className="font-medium">{thread.title}</div>
                <div className="text-[10px] font-mono text-silt-500">{thread.location_tag}</div>
              </div>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 ${
                thread.severity === 'CRITICAL' || thread.severity === 'CATASTROPHIC'
                  ? 'text-[#D9822B] bg-[#D9822B]/10'
                  : 'text-silt-400'
              }`}>
                {thread.severity}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
