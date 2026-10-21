'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Grid, Map, Filter, Calendar, Layers, ArrowUpRight } from 'lucide-react';
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
    <div className="flex-1 p-6 sm:p-10 space-y-8 max-w-7xl mx-auto w-full font-mono text-xs">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 hairline-b border-abyss-800">
        <div>
          <div className="text-[10px] text-[#D9822B] uppercase tracking-wider mb-1">
            Archival Sensor Library
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl text-silt-100">
            Reconnaissance Image History
          </h1>
          <p className="font-sans text-xs text-silt-400 mt-1">
            Personal repository of aerial drone passes, orthomosaics, and computed flood tide levels.
          </p>
        </div>

        {/* View mode & filter controls */}
        <div className="flex items-center space-x-3">
          {/* Severity filter */}
          <div className="flex items-center hairline-all border-abyss-700 overflow-hidden">
            {['ALL', 'CRITICAL', 'MODERATE', 'LOW'].map((tier) => (
              <button
                key={tier}
                onClick={() => setSeverityFilter(tier)}
                className={`px-2.5 py-1 text-[10px] uppercase transition-colors ${
                  severityFilter === tier
                    ? 'bg-abyss-700 text-silt-100'
                    : 'bg-abyss-950 text-silt-400 hover:text-silt-200'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>

          {/* Grid vs Map Toggle */}
          <div className="flex items-center hairline-all border-abyss-700 overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 transition-colors ${
                viewMode === 'grid' ? 'bg-abyss-700 text-silt-100' : 'bg-abyss-950 text-silt-400'
              }`}
              title="Grid View"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`p-1.5 transition-colors ${
                viewMode === 'map' ? 'bg-abyss-700 text-silt-100' : 'bg-abyss-950 text-silt-400'
              }`}
              title="Geospatial Map Coordinates View"
            >
              <Map className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="border border-red-800 bg-red-950 p-3 text-red-200">{error}</p>}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <Link
              key={item.id}
              href={`/app/chat/${item.thread_id}`}
              className="group bg-abyss-950 hairline-all border-abyss-800 hover:border-abyss-600 transition-all flex flex-col overflow-hidden"
            >
              {/* Image preview with severity badge */}
              <div className="relative aspect-[16/10] bg-black overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.raw_url}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500 ease-water"
                />
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-abyss-950/90 hairline-all border-abyss-700 text-[10px] font-semibold text-[#D9822B]">
                  TIDE {item.severity_score.toFixed(1)} &bull; {item.severity_level}
                </div>
              </div>

              {/* Card metadata */}
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-sans font-medium text-sm text-silt-200 group-hover:text-silt-100 transition-colors">
                    {item.title}
                  </h3>
                  <div className="flex items-center space-x-1.5 text-silt-500 text-[10px] mt-1">
                    <MapPin className="w-3 h-3 text-silt-400" />
                    <span>{item.location} ({item.coordinates})</span>
                  </div>
                </div>

                <div className="pt-3 hairline-t border-abyss-800 flex items-center justify-between text-[11px] text-silt-400">
                  <span>{item.inundated_area_m2.toLocaleString()} m² flooded</span>
                  <div className="flex items-center space-x-1 text-silt-300 group-hover:text-[#D9822B] transition-colors">
                    <span>Inspect</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {filteredItems.length === 0 && !error && (
            <p className="col-span-full py-12 text-center text-silt-400">
              No saved imagery yet. Run an assessment to add it to your gallery.
            </p>
          )}
        </div>
      )}

      {/* Geospatial Map Distribution View */}
      {viewMode === 'map' && (
        <div className="bg-abyss-900 hairline-all border-abyss-700 p-8 space-y-6">
          <div className="flex items-center justify-between font-mono text-xs">
            <span className="text-silt-300">Assessment Locations</span>
            <span className="text-silt-500">Coordinates are not stored</span>
          </div>

          <div className="w-full h-96 bg-abyss-950 hairline-all border-abyss-800 relative flex items-center justify-center p-6 overflow-hidden">
            <div className="max-w-md text-center text-xs text-silt-400">
              Location coordinates are not part of the current database schema, so
              assessments cannot be plotted accurately yet.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
