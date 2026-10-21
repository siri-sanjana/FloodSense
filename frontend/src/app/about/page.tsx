'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Compass, Shield, Users, Layers, ExternalLink } from 'lucide-react';
import { UnderwaterScene } from '../../components/three/UnderwaterScene';
import { CustomCursor } from '../../components/ui/CustomCursor';
import { WaterLoader } from '../../components/ui/WaterLoader';
import { FloodSenseLogo } from '../../components/ui/FloodSenseLogo';
import { initSmoothScroll } from '../../lib/scroll/lenis';

export default function AboutStoryPage() {
  const [loaderComplete, setLoaderComplete] = useState(false);
  const [activeChapter, setActiveChapter] = useState(0);

  useEffect(() => {
    // Initialize Lenis smooth scroll and connect to GSAP ScrollTrigger
    const lenis = initSmoothScroll();
    return () => {
      // Lenis cleanup handled
    };
  }, []);

  return (
    <div className="relative bg-abyss-950 text-silt-200 select-none overflow-x-hidden">
      {/* Editorial Magnetic Cursor */}
      <CustomCursor />

      {/* Preloader with rising water percentage */}
      <WaterLoader onComplete={() => setLoaderComplete(true)} />

      {/* Persistent WebGL Background Canvas */}
      <UnderwaterScene onLoaded={() => setLoaderComplete(true)} />

      {/* Top Floating Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-40 px-6 py-5 flex items-center justify-between font-mono text-xs mix-blend-difference">
        <div className="flex items-center space-x-2">
          <FloodSenseLogo size="sm" href="/" />
          <span className="text-silt-500 font-normal">/ THE DISASTER ESSAY</span>
        </div>
        <div className="flex items-center space-x-6">
          <Link href="/app" className="text-silt-300 hover:text-[#D9822B] transition-colors">
            Workspace
          </Link>
          <Link
            href="/signup"
            className="px-3 py-1 bg-abyss-900 hairline-all border-abyss-700 text-silt-100 hover:border-[#D9822B] transition-colors"
          >
            Operator Access
          </Link>
        </div>
      </nav>

      {/* ────────────────────────── CONTINUOUS SCROLL STORY ────────────────────────── */}
      <div id="about-story-container" className="relative z-10">

        {/* ── CHAPTER 00: SURFACE (HERO) ── */}
        <section className="min-h-screen flex flex-col justify-end p-8 sm:p-20 relative">
          <div className="max-w-5xl space-y-6">
            <div className="text-xs font-mono text-[#D9822B] uppercase tracking-widest flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-[#D9822B] animate-ping" />
              <span>00 / Surface Sensor Telemetry</span>
            </div>
            <h1 className="font-serif text-6xl sm:text-8xl md:text-9xl font-normal tracking-tight text-silt-100 leading-[0.95] max-w-4xl">
              Water doesn’t wait.
            </h1>
            <p className="font-sans text-sm sm:text-base text-silt-400 max-w-xl leading-relaxed pt-2">
              When monsoon cloudbursts overwhelm riverine dykes, municipal gauge telemetry fails. Survival is measured in the minutes required to verify which roads still stand above the waterline.
            </p>
            <div className="pt-6 font-mono text-xs text-silt-500 flex items-center space-x-2">
              <span className="animate-bounce text-[#D9822B]">&darr;</span>
              <span>Scroll to commence underwater dive</span>
            </div>
          </div>
        </section>

        {/* ── CHAPTER 01: THE FLOOD (SUBMERGED TOWN) ── */}
        <section className="min-h-screen flex items-center p-8 sm:p-20 relative">
          <div className="max-w-3xl space-y-8 bg-abyss-950/70 backdrop-blur-xs p-8 sm:p-12 hairline-all border-abyss-800">
            <div className="text-xs font-mono text-[#D9822B] uppercase tracking-widest">
              01 / The Inundation Problem
            </div>
            <h2 className="font-serif text-4xl sm:text-6xl text-silt-100 font-normal leading-tight">
              The town below the crest.
            </h2>
            <div className="space-y-4 font-sans text-sm sm:text-base text-silt-300 leading-relaxed">
              <p>
                In standard flood operations, optical satellite passes arrive 48 hours too late due to persistent cloud cover. First responders rely on fragmented radio chatter and unverified civilian telephone reports.
              </p>
              <p className="text-silt-400">
                Ground electrical isolation is delayed. Motorized inflatable boats navigate blindly over submerged iron railings, road signposts, and drowning automobiles.
              </p>
            </div>
            {/* Real Counter Metric (Rust Accent) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-6 hairline-t border-abyss-800 font-mono">
              <div>
                <div className="text-3xl sm:text-4xl font-serif text-[#D9822B]">14.2 km</div>
                <div className="text-[11px] text-silt-500 uppercase mt-1">Average Cutoff Feeder Road</div>
              </div>
              <div>
                <div className="text-3xl sm:text-4xl font-serif text-[#D9822B]">1.65 m</div>
                <div className="text-[11px] text-silt-500 uppercase mt-1">Ground Floor Ingress Depth</div>
              </div>
              <div>
                <div className="text-3xl sm:text-4xl font-serif text-silt-200">60 min</div>
                <div className="text-[11px] text-silt-500 uppercase mt-1">NDMA Mandated De-energize</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CHAPTER 02: THE SENSOR (DRONE & 10-CLASS MASK) ── */}
        <section className="min-h-screen flex items-center justify-end p-8 sm:p-20 relative">
          <div className="max-w-2xl space-y-6 bg-abyss-950/70 backdrop-blur-xs p-8 sm:p-12 hairline-all border-abyss-800 text-right">
            <div className="text-xs font-mono text-[#D9822B] uppercase tracking-widest">
              02 / The Sensor &amp; Fine-Tuned SegFormer
            </div>
            <h2 className="font-serif text-4xl sm:text-6xl text-silt-100 font-normal leading-tight">
              Eyes through the deluge.
            </h2>
            <p className="font-sans text-sm sm:text-base text-silt-300 leading-relaxed text-left">
              Small tactical UAVs fly below cloud ceilings. As the drone orbits, our fine-tuned <strong>SegFormer MiT-B0</strong> sweeps the frame, resolving 10 semantic classes without human labeling latency:
            </p>
            <div className="flex flex-wrap justify-end gap-2 text-[11px] font-mono">
              <span className="px-2 py-1 bg-red-950/60 hairline-all border-red-800 text-red-300">Building-Flooded</span>
              <span className="px-2 py-1 bg-amber-950/60 hairline-all border-amber-800 text-amber-300">Road-Flooded</span>
              <span className="px-2 py-1 bg-cyan-950/60 hairline-all border-cyan-800 text-cyan-300">Standing Water</span>
              <span className="px-2 py-1 bg-abyss-900 hairline-all border-abyss-700 text-silt-400">Road-Safe</span>
              <span className="px-2 py-1 bg-abyss-900 hairline-all border-abyss-700 text-silt-400">Building-Safe</span>
            </div>
            <div className="p-4 bg-abyss-900/60 hairline-all border-abyss-700 font-mono text-xs text-left space-y-1">
              <div className="text-[#D9822B] font-semibold">Fine-Tuned Verification Benchmark:</div>
              <div className="text-silt-400">Multi-Class mIoU: <strong>0.4797</strong> (up from 0.0937 pre-trained baseline)</div>
              <div className="text-silt-400">Pixel Accuracy: <strong>83.46%</strong> across high-res DJI Phantom 4 UAV imagery.</div>
            </div>
          </div>
        </section>

        {/* ── CHAPTER 03: THE PROTOCOL (CHROMA-DB VECTOR STACK) ── */}
        <section className="min-h-screen flex items-center p-8 sm:p-20 relative">
          <div className="max-w-2xl space-y-6 bg-abyss-950/70 backdrop-blur-xs p-8 sm:p-12 hairline-all border-abyss-800">
            <div className="text-xs font-mono text-[#D9822B] uppercase tracking-widest">
              03 / Statutory Protocol Engine
            </div>
            <h2 className="font-serif text-4xl sm:text-6xl text-silt-100 font-normal leading-tight">
              Code grounded in law.
            </h2>
            <p className="font-sans text-sm sm:text-base text-silt-300 leading-relaxed">
              Detection without directive is useless in crisis. Extracted damage metrics query a ChromaDB semantic index containing official government flood protocols:
            </p>
            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-abyss-900 hairline-all border-abyss-700 space-y-1">
                <span className="text-[10px] text-[#D9822B]">NDMA Urban Flood SOP Section 4.2.1</span>
                <p className="font-sans text-xs text-silt-300">
                  Mandatory electrical isolation protocols triggered automatically when water depth reaches ground meter clearance limits.
                </p>
              </div>
              <div className="p-3 bg-abyss-900 hairline-all border-abyss-700 space-y-1">
                <span className="text-[10px] text-[#D9822B]">NDRF Tactical Rescue SOP 08/2022</span>
                <p className="font-sans text-xs text-silt-300">
                  Vehicle passability safety limits (&gt;0.45m depth classified impassable for wheeled ambulance extraction).
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── CHAPTER 04: THE TIDE GAUGE ── */}
        <section className="min-h-screen flex items-center justify-end p-8 sm:p-20 relative">
          <div className="max-w-2xl space-y-6 bg-abyss-950/70 backdrop-blur-xs p-8 sm:p-12 hairline-all border-abyss-800">
            <div className="text-xs font-mono text-[#D9822B] uppercase tracking-widest">
              04 / The Severity Tide Gauge
            </div>
            <h2 className="font-serif text-4xl sm:text-6xl text-silt-100 font-normal leading-tight">
              The signature water mark.
            </h2>
            <p className="font-sans text-sm sm:text-base text-silt-300 leading-relaxed">
              Beside every drone inspection runs the FloodSense vertical water gauge. Rather than a vague percentage, it scales precisely with computed building inundation depths, road severance, and riverine basin stage levels.
            </p>
            <div className="p-4 bg-abyss-900 hairline-all border-abyss-700 flex items-center justify-between font-mono text-xs">
              <div>
                <div className="text-silt-500 text-[10px] uppercase">Peak Flood Hazard Score</div>
                <div className="text-2xl font-serif text-[#D9822B]">TIDE 8.4 / 10.0</div>
              </div>
              <span className="px-2 py-1 bg-[#D9822B]/10 text-[#D9822B] hairline-all border-[#D9822B]/30 uppercase text-[10px]">
                CRITICAL EVACUATION TIER
              </span>
            </div>
          </div>
        </section>

        {/* ── CHAPTER 05: THE PEOPLE (HORIZONTAL 3D TILT CARDS) ── */}
        <section className="min-h-screen py-24 px-8 sm:px-20 relative flex flex-col justify-center">
          <div className="max-w-6xl mx-auto w-full space-y-10">
            <div className="space-y-2">
              <div className="text-xs font-mono text-[#D9822B] uppercase tracking-widest">
                05 / The People &amp; Shared Grid
              </div>
              <h2 className="font-serif text-4xl sm:text-5xl text-silt-100">
                Commanders, Hydrologists, Citizens
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  role: 'Disaster Responders',
                  tag: 'TACTICAL COMMAND',
                  quote: '“We can verify whether an ambulance will float off an arterial bridge before dispatching the team.”',
                  author: 'Insp. R. Verma, NDRF 4th Bn',
                },
                {
                  role: 'Hydrology Researchers',
                  tag: 'ANALYTICAL SCIENCE',
                  quote: '“Comparing drone passes 6 hours apart gives us exact volumetric surface expansion curves.”',
                  author: 'Dr. Aris Thorne, Riverine Modeling Institute',
                },
                {
                  role: 'Civil Observers',
                  tag: 'COMMUNITY ADVISORY',
                  quote: '“Anonymized verified field SITREPs replace social media rumors with statutory directives.”',
                  author: 'Meera Nair, Coastal Resident Council',
                },
              ].map((card, i) => (
                <div
                  key={i}
                  className="bg-abyss-900/80 hairline-all border-abyss-800 p-8 space-y-6 hover:border-[#D9822B] transition-all duration-300 flex flex-col justify-between"
                  style={{ transform: `rotate(${(i - 1) * 0.8}deg)` }}
                >
                  <div className="space-y-3">
                    <span className="text-[10px] font-mono text-[#D9822B] uppercase tracking-wider">
                      {card.tag}
                    </span>
                    <h3 className="font-serif text-2xl text-silt-100">{card.role}</h3>
                    <p className="font-sans text-xs text-silt-300 leading-relaxed italic">
                      {card.quote}
                    </p>
                  </div>
                  <div className="pt-4 hairline-t border-abyss-800 font-mono text-[11px] text-silt-400">
                    {card.author}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CHAPTER 06: RESURFACE (DAYLIGHT CTA) ── */}
        <section className="min-h-screen flex items-center justify-center p-8 sm:p-20 relative bg-[#E9E4D8] text-[#04161A] transition-colors duration-1000">
          <div className="max-w-3xl text-center space-y-8">
            <div className="text-xs font-mono text-[#D9822B] uppercase tracking-widest font-semibold">
              Resurface / Daylight Ops
            </div>
            <h2 className="font-serif text-5xl sm:text-7xl font-normal leading-tight text-[#04161A]">
              Deploy the intelligent sensor analyst for your river basin.
            </h2>
            <p className="font-sans text-sm sm:text-base text-[#0E3B43] max-w-xl mx-auto leading-relaxed">
              Sign up, configure your primary catchment zone, and upload aerial drone flight passes into an interactive SITREP workspace.
            </p>
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4 font-mono text-xs">
              <Link
                href="/signup"
                className="w-full sm:w-auto px-6 py-3.5 bg-[#04161A] hover:bg-[#0E3B43] text-[#E9E4D8] font-medium transition-colors flex items-center justify-center space-x-2"
              >
                <span>Register Operational Call Sign</span>
                <ArrowRight className="w-4 h-4 text-[#D9822B]" />
              </Link>
              <Link
                href="/app"
                className="w-full sm:w-auto px-6 py-3.5 border border-[#04161A] text-[#04161A] hover:bg-[#04161A]/10 transition-colors"
              >
                Enter Field Workspace
              </Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
