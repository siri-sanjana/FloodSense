'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Grid,
  Map,
  Filter,
  Calendar,
  Layers,
  ArrowUpRight,
  Camera,
  Compass,
  AlertCircle,
  Plus
} from 'lucide-react';
import { api } from '../../../lib/api';
import type { GalleryItem } from '../../../lib/api';

export default function GalleryPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getGalleryItems()
      .then(setItems)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Could not load saved imagery.');
      });
  }, []);

  const filteredItems = items.filter(item =>
    severityFilter === 'ALL' ? true : item.severity_level === severityFilter
  );

  return (
    <div className="flex-1 p-6 sm:p-10 space-y-8 max-w-7xl mx-auto w-full select-none">
      {/* ────────────────── HEADER BAR ────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-mono font-bold text-cyan-800 uppercase tracking-wider mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-600 animate-pulse" />
            <span>Archival Sensor Library</span>
          </div>
          <h1 className="font-sans text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Reconnaissance Image History
          </h1>
          <p className="font-sans text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Saved imagery and model-generated damage statistics. Calibrated optical captures, segmentation masks, and photogrammetric scene records.
          </p>
        </div>

        {/* View Mode & Filter Controls */}
        <div className="flex items-center space-x-3">
          {/* Severity Filter Pill Group */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 font-mono text-[11px]">
            {['ALL', 'CRITICAL', 'MODERATE', 'LOW'].map((tier) => (
              <button
                key={tier}
                onClick={() => setSeverityFilter(tier)}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  severityFilter === tier
                    ? tier === 'CRITICAL'
                      ? 'bg-red-50 text-red-700 border border-red-200 shadow-2xs font-bold'
                      : tier === 'MODERATE'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs font-bold'
                      : tier === 'LOW'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs font-bold'
                      : 'bg-white text-slate-900 border border-slate-200 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>

          {/* Grid vs Map Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Grid View"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Geospatial Map Coordinates View"
            >
              <Map className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="border border-red-200 bg-red-50 rounded-lg p-3 text-red-800 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ────────────────── GRID VIEW ────────────────── */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <Link
              key={item.id}
              href={`/app/chat/${item.thread_id}`}
              className="group bg-white border border-slate-200 hover:border-cyan-500 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 flex flex-col"
            >
              {/* Image Preview with Severity Badge */}
              <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.raw_url}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out"
                />
                <div className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold backdrop-blur-md shadow-xs ${
                  item.severity_level === 'CRITICAL' || item.severity_score >= 1.2
                    ? 'bg-red-600/90 text-white border border-red-500'
                    : item.severity_level === 'MODERATE' || item.severity_score >= 0.7
                    ? 'bg-amber-600/90 text-white border border-amber-500'
                    : 'bg-emerald-600/90 text-white border border-emerald-500'
                }`}>
                  PROXY {item.severity_score.toFixed(1)} &bull; {item.severity_level}
                </div>
              </div>

              {/* Card Metadata */}
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between bg-white">
                <div>
                  <h3 className="font-sans font-semibold text-sm text-slate-900 group-hover:text-cyan-700 transition-colors line-clamp-1">
                    {item.title}
                  </h3>
                  <div className="flex items-center space-x-1.5 text-slate-500 text-[11px] mt-1 font-mono">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{item.location} ({item.coordinates})</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-600">
                  <span className="tabular-nums">
                    {item.inundated_pixel_count === null
                      ? 'Pixel count pending'
                      : `${item.inundated_pixel_count.toLocaleString()} flooded px`}
                  </span>
                  <div className="flex items-center space-x-1 font-semibold text-cyan-600 group-hover:text-cyan-700 group-hover:translate-x-0.5 transition-all">
                    <span>Inspect</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {filteredItems.length === 0 && !error && (
            <div className="col-span-full py-16 text-center space-y-3 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
                <Camera className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-slate-700">No saved reconnaissance imagery found</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Run an aerial inspection in FloodSense Studio to automatically log telemetry and damage metrics to your archival library.
              </p>
              <div className="pt-2">
                <Link
                  href="/app"
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Start New Inspection</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── GEOSPATIAL MAP VIEW ────────────────── */}
      {viewMode === 'map' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between font-mono text-xs">
            <div className="flex items-center space-x-2">
              <Compass className="w-4 h-4 text-cyan-600" />
              <span className="font-bold text-slate-900">Geospatial UAV Survey Distribution</span>
            </div>
            <span className="text-[11px] text-slate-500">Photogrammetric Graticule</span>
          </div>

          <div className="w-full h-96 bg-slate-50 border border-slate-200 rounded-lg relative flex flex-col items-center justify-center p-6 overflow-hidden">
            <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]" />
            <div className="relative z-10 max-w-md text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-xs flex items-center justify-center mx-auto text-cyan-600">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="font-semibold text-slate-800 text-sm">Geospatial Distribution Grid</div>
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                Sensor telemetry and ground sampling coordinates are tracked per flight pass. Switch back to Grid View to inspect individual image segments and damage masks.
              </p>
              <button
                onClick={() => setViewMode('grid')}
                className="mt-3 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 shadow-2xs transition-colors"
              >
                Return to Grid View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
