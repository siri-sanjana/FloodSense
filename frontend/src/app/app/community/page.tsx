'use client';

import React, { useEffect, useState } from 'react';
import { ThumbsUp, MapPin, AlertCircle, MessageSquare } from 'lucide-react';
import { api } from '../../../lib/api';
import type { PublishedReport } from '../../../lib/types';

export default function CommunityPage() {
  const [feed, setFeed] = useState<PublishedReport[]>([]);
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [error, setError] = useState<string | null>(null);
  const regions = Array.from(
    new Set(
      feed
        .map((report) => report.location.split(',').at(-1)?.trim())
        .filter((region): region is string => Boolean(region)),
    ),
  ).sort();

  useEffect(() => {
    api.getPublishedReports()
      .then(setFeed)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Could not load public reports.');
      });
  }, []);

  const handleUpvote = async (id: string) => {
    try {
      const upvotes = await api.upvotePublishedReport(id);
      setFeed((previous) => previous.map((item) => item.id === id ? { ...item, upvotes } : item));
      setError(null);
    } catch (upvoteError) {
      setError(upvoteError instanceof Error ? upvoteError.message : 'Could not upvote this report.');
    }
  };

  return (
    <div className="flex-1 p-6 sm:p-10 space-y-8 max-w-5xl mx-auto w-full select-none">
      {/* ────────────────── HEADER BAR ────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-mono font-bold text-cyan-800 uppercase tracking-wider mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-600 animate-pulse" />
            <span>Civil Protection &bull; Public Intelligence Feed</span>
          </div>
          <h1 className="font-sans text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Community Field SITREPs
          </h1>
          <p className="font-sans text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Field reports shared by responders and researchers. Author roles, locations, and model outputs are logged for cross-agency situational awareness.
          </p>
        </div>

        {/* Region Filter */}
        <div className="flex items-center space-x-2 text-[11px] font-mono">
          <span className="text-slate-400">Filter:</span>
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {['ALL', ...regions].map((reg) => (
              <button
                key={reg}
                onClick={() => setSelectedRegion(reg)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  selectedRegion === reg
                    ? 'bg-white text-slate-900 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {reg}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="border border-red-200 bg-red-50 rounded-lg p-3 text-red-800 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ────────────────── REPORT CARDS ────────────────── */}
      <div className="space-y-6">
        {feed
          .filter(item => selectedRegion === 'ALL' || item.location.includes(selectedRegion))
          .map((report) => (
            <div
              key={report.id}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 hover:border-slate-300 shadow-xs transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-500">
                    <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                      PROXY {report.severity_score.toFixed(1)} &bull; {report.severity_level}
                    </span>
                    <span>&bull;</span>
                    <span className="capitalize font-medium text-slate-700">Role: {report.author_role}</span>
                    <span>&bull;</span>
                    <span>{new Date(report.created_at).toLocaleDateString()}</span>
                  </div>
                  <h2 className="font-sans font-bold text-lg text-slate-900 pt-1">
                    {report.title}
                  </h2>
                  <div className="flex items-center space-x-1.5 text-slate-500 text-xs font-mono">
                    <MapPin className="w-3.5 h-3.5 text-cyan-600" />
                    <span>{report.location}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleUpvote(report.id)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-mono font-medium transition-colors shadow-2xs cursor-pointer"
                >
                  <ThumbsUp className="w-3.5 h-3.5 text-cyan-600" />
                  <span>{report.upvotes}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-8 font-sans text-xs text-slate-600 leading-relaxed">
                  <p>{report.summary}</p>
                </div>
                <div className="md:col-span-4 aspect-video bg-slate-100 rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={report.raw_image_url}
                    alt={report.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Verified situational transmission &bull; automated damage estimation</span>
                <span>Community Contributor</span>
              </div>
            </div>
          ))}

        {feed.length === 0 && !error && (
          <div className="py-16 text-center space-y-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <MessageSquare className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-medium text-slate-700">No published SITREPs yet</p>
            <p className="text-xs text-slate-400">Published field reports will appear in this shared intelligence feed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
