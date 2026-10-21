'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Compass, ShieldCheck, FileText, Check } from 'lucide-react';
import { UserRole } from '../../lib/types';

export default function OnboardingPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('responder');
  const [region, setRegion] = useState('Brahmaputra Basin & Coastal Kerala');
  const [tone, setTone] = useState<'concise_tactical' | 'comprehensive_analytical' | 'public_bulletin'>('concise_tactical');
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric');

  const handleFinish = (e: React.FormEvent) => {
    e.preventDefault();
    router.push('/app');
  };

  return (
    <div className="min-h-screen bg-abyss-950 text-silt-200 flex flex-col justify-center items-center px-6 py-12">
      <div className="w-full max-w-2xl bg-abyss-900/80 hairline-all border-abyss-700 p-8 sm:p-12 shadow-depth space-y-8">
        <div>
          <div className="text-[10px] font-mono text-[#D9822B] uppercase tracking-wider mb-2">
            Step 2 of 2 &mdash; Personalization Grid
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl text-silt-100">
            Define Operational Scope
          </h1>
          <p className="font-sans text-xs text-silt-400 mt-2">
            Configures the default analytical tone of generated SITREPs, regional hazard models, and unit measurements.
          </p>
        </div>

        <form onSubmit={handleFinish} className="space-y-6 font-mono text-xs">
          {/* 1. Operational Role */}
          <div className="space-y-2">
            <label className="text-[11px] text-silt-400 uppercase tracking-wider">
              Primary Role in Flood Management
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'responder', label: 'Responder', sub: 'Tactical field rescue' },
                { id: 'researcher', label: 'Researcher', sub: 'Hydrological analysis' },
                { id: 'journalist', label: 'Journalist', sub: 'Verified reportage' },
                { id: 'citizen', label: 'Citizen', sub: 'Community awareness' },
              ].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setRole(item.id as UserRole)}
                  className={`p-3 text-left hairline-all transition-colors ${
                    role === item.id
                      ? 'bg-abyss-800 border-[#D9822B] text-silt-100'
                      : 'bg-abyss-950 border-abyss-800 text-silt-400 hover:border-abyss-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-silt-200">{item.label}</div>
                  <div className="text-[9px] text-silt-500 mt-1">{item.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Region of Interest */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-silt-400 uppercase tracking-wider">
              Primary Geographic Catchment / River Basin
            </label>
            <input
              type="text"
              required
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="e.g. Brahmaputra Valley, Periyar Basin, Godavari Delta"
              className="w-full px-3 py-2.5 bg-abyss-950 hairline-all border-abyss-700 text-silt-200 placeholder-silt-600 focus:outline-none"
            />
          </div>

          {/* 3. Report Tone */}
          <div className="space-y-2">
            <label className="text-[11px] text-silt-400 uppercase tracking-wider">
              SITREP Synthesis Tone
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'concise_tactical', title: 'Concise Tactical', desc: 'Prioritizes route severance, building damage, and urgent life-safety directives.' },
                { id: 'comprehensive_analytical', title: 'Comprehensive', desc: 'Includes full multi-class surface area tables, depth models, and historical precedent.' },
                { id: 'public_bulletin', title: 'Public Bulletin', desc: 'Plain-language advisories formatted for civil protection notices.' },
              ].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setTone(item.id as any)}
                  className={`p-3 text-left hairline-all transition-colors ${
                    tone === item.id
                      ? 'bg-abyss-800 border-[#D9822B] text-silt-100'
                      : 'bg-abyss-950 border-abyss-800 text-silt-400 hover:border-abyss-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-silt-200">{item.title}</div>
                  <div className="text-[9px] text-silt-500 mt-1 font-sans leading-normal">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Measurement Units */}
          <div className="space-y-2">
            <label className="text-[11px] text-silt-400 uppercase tracking-wider">
              Units of Measurement
            </label>
            <div className="flex space-x-3">
              {[
                { id: 'metric', label: 'Metric (Meters, km, m²)' },
                { id: 'imperial', label: 'Imperial (Feet, Miles, Acres)' },
              ].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setUnit(item.id as any)}
                  className={`px-3 py-1.5 hairline-all text-xs transition-colors ${
                    unit === item.id
                      ? 'bg-abyss-800 border-silt-300 text-silt-100'
                      : 'bg-abyss-950 border-abyss-800 text-silt-400'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-[#0E3B43] hover:bg-[#134B55] hairline-all border-[#1D6470] text-silt-100 font-medium transition-colors flex items-center justify-center space-x-2 text-xs"
          >
            <span>Complete Setup & Enter Reconnaissance Center</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#D9822B]" />
          </button>
        </form>
      </div>
    </div>
  );
}
