'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Users, ThumbsUp, MapPin, ArrowUpRight, Filter } from 'lucide-react';
import { COMMUNITY_FEED } from '../../../lib/mock-data';

export default function CommunityPage() {
  const [feed, setFeed] = useState(COMMUNITY_FEED);
  const [selectedRegion, setSelectedRegion] = useState('ALL');

  const handleUpvote = (id: string) => {
    setFeed(prev =>
      prev.map(item => item.id === id ? { ...item, upvotes: item.upvotes + 1 } : item)
    );
  };

  return (
    <div className="flex-1 p-6 sm:p-10 space-y-8 max-w-5xl mx-auto w-full font-mono text-xs">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 hairline-b border-abyss-800">
        <div>
          <div className="text-[10px] text-[#D9822B] uppercase tracking-wider mb-1">
            Civil Protection &bull; Public Intelligence Feed
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl text-silt-100">
            Community Field SITREPs
          </h1>
          <p className="font-sans text-xs text-silt-400 mt-1">
            Anonymized operational field reports published by verified responders, researchers, and civil observers.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-[10px]">
          <span className="text-silt-500">Filter:</span>
          {['ALL', 'Kerala', 'Assam'].map((reg) => (
            <button
              key={reg}
              onClick={() => setSelectedRegion(reg)}
              className={`px-2 py-1 hairline-all transition-colors ${
                selectedRegion === reg
                  ? 'bg-abyss-700 text-silt-100'
                  : 'bg-abyss-950 text-silt-500 hover:text-silt-300'
              }`}
            >
              {reg}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {feed
          .filter(item => selectedRegion === 'ALL' || item.location.includes(selectedRegion))
          .map((report) => (
            <div
              key={report.id}
              className="bg-abyss-950 hairline-all border-abyss-800 p-6 space-y-4 hover:border-abyss-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-[10px] text-silt-500">
                    <span className="text-[#D9822B] font-semibold">TIDE {report.severity_score.toFixed(1)} &bull; {report.severity_level}</span>
                    <span>&bull;</span>
                    <span className="capitalize">Role: {report.author_role}</span>
                    <span>&bull;</span>
                    <span>{report.created_at}</span>
                  </div>
                  <h2 className="font-serif text-2xl text-silt-100">
                    {report.title}
                  </h2>
                  <div className="flex items-center space-x-1.5 text-silt-400 text-xs">
                    <MapPin className="w-3.5 h-3.5 text-[#D9822B]" />
                    <span>{report.location}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleUpvote(report.id)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-abyss-900 hover:bg-abyss-800 hairline-all border-abyss-700 text-silt-300 transition-colors"
                >
                  <ThumbsUp className="w-3 h-3 text-[#D9822B]" />
                  <span>{report.upvotes}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-8 font-sans text-xs text-silt-300 leading-relaxed">
                  <p>{report.summary}</p>
                </div>
                <div className="md:col-span-4 aspect-video bg-black hairline-all border-abyss-800 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={report.raw_image_url}
                    alt={report.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div className="pt-3 hairline-t border-abyss-800 flex items-center justify-between text-[11px] text-silt-500">
                <span>Verified with 10-Class SegFormer &amp; NDMA Guidelines</span>
                <Link
                  href="/app/chat/t-kochi-01"
                  className="flex items-center space-x-1 text-silt-300 hover:text-[#D9822B] transition-colors"
                >
                  <span>Inspect Full Telemetry &amp; Citations</span>
                  <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
