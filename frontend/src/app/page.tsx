'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  UploadCloud,
  Eye,
  MessageSquare,
  Layers,
  Building,
  Cpu,
  ChevronRight,
  Waves,
  AlertTriangle,
  Droplets,
  ShieldCheck,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { FloodHero3D } from '../components/three/FloodHero3D';
import { MaskViewer } from '../components/MaskViewer';
import { TideGauge } from '../components/TideGauge';
import { FloodSenseLogo } from '../components/ui/FloodSenseLogo';

export default function LandingPage() {
  const [selectedWalkthrough, setSelectedWalkthrough] = useState<'10169' | '10815' | '6423'>('10169');

  const WALKTHROUGH_SAMPLES = {
    '10169': {
      title: 'Pass 10169: Residential Periyar Basin Inundation',
      image: '/samples/10169.jpg',
      mask: '/samples/10169_mask.png',
      location: 'Kochi Suburban Basin (Periyar Axis)',
      floodedBuildings: 16,
      inundatedArea: '3.82 Hectares',
      waterLevel: 1.92,
      dangerThreshold: 2.20,
      tidePhase: 'Rising Surge',
      impassableRoad: '1.4 km Submerged',
      cause: 'Embankment Overflow',
      severity: '8.1 / 10',
      sampleQ: 'What areas appear to be flooded in this image?',
      sampleA: 'Residential inundation detected spanning 3.82 hectares. Submersion extends across residential parcel perimeters with 16 structural footprints confirmed compromised under disaster management protocols.',
      roadStatus: 'Access Arterial 12-B Cut Off',
    },
    '10815': {
      title: 'Pass 10815: Canal Breach & Highway Overwash',
      image: '/samples/10815.jpg',
      mask: '/samples/10815_mask.png',
      location: 'Cuttack Mahanadi Embankment',
      floodedBuildings: 21,
      inundatedArea: '5.14 Hectares',
      waterLevel: 2.45,
      dangerThreshold: 2.20,
      tidePhase: 'Crest Stage',
      impassableRoad: '2.8 km Submerged',
      cause: 'Canal Dike Rupture',
      severity: '8.7 / 10',
      sampleQ: 'Which buildings appear to be affected?',
      sampleA: 'A total of 21 single- and multi-story structures show immediate standing water at foundation sill levels. The evacuation corridor along the western canal bank is submerged and impassable.',
      roadStatus: 'Secondary Highway 4 Severed',
    },
    '6423': {
      title: 'Pass 6423: Riverine Bridge Embankment Scour',
      image: '/samples/6423.jpg',
      mask: '/samples/6423_mask.png',
      location: 'Brahmaputra Lowland Causeway',
      floodedBuildings: 9,
      inundatedArea: '2.90 Hectares',
      waterLevel: 1.65,
      dangerThreshold: 2.20,
      tidePhase: 'Receding Flood',
      impassableRoad: '0.8 km Submerged',
      cause: 'Bridge Backwater Surge',
      severity: '7.2 / 10',
      sampleQ: 'Can you summarize the visible flood damage?',
      sampleA: 'Rapid surface runoff has submerged approach spans on both banks. 9 riverfront storage depots are affected; the bridge deck remains above crest line but pier scouring inspection is recommended.',
      roadStatus: 'Bridge Access Restricted',
    },
  };

  const activeWalkthrough = WALKTHROUGH_SAMPLES[selectedWalkthrough];

  return (
    <div className="relative min-h-screen bg-white text-slate-900 selection:bg-cyan-100 selection:text-cyan-900 font-sans">
      {/* ─────────────────────────── TOP NAVIGATION ─────────────────────────── */}
      <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FloodSenseLogo size="sm" href="/" />
          </div>

          <nav className="hidden md:flex items-center space-x-8 text-xs font-mono text-slate-600">
            <a href="#capabilities-workflow" className="hover:text-cyan-700 transition-colors">
              Capabilities &amp; Workflow
            </a>
            <a href="#dashboard-walkthrough" className="hover:text-cyan-700 transition-colors">
              Dashboard &amp; Walkthrough
            </a>
          </nav>

          <div className="flex items-center space-x-3 text-xs font-mono">
            <Link
              href="/signin"
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded transition-colors flex items-center space-x-1.5 shadow-xs"
            >
              <span>Launch Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ─────────────────────────── SECTION 1: HERO ─────────────────────────── */}
      <section className="relative border-b border-slate-200 overflow-hidden bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Hero Column */}
            <div className="lg:col-span-7 space-y-6">
              {/* Main Heading */}
              <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-slate-900 leading-[1.08]">
                Understand Floods.{' '}
                <span className="text-cyan-700">
                  Assess Impact.
                </span>{' '}
                Act Faster.
              </h1>

              {/* Supporting Description */}
              <p className="text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
                Inspect high-resolution drone and aerial flood imagery, run verified 10-class segmentation,
                ask questions in natural language, and generate grounded impact assessments.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-2 font-mono text-xs">
                <Link
                  href="/signin"
                  className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded transition-colors flex items-center space-x-2 shadow-xs"
                >
                  <span>Launch FloodSense</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <a
                  href="#capabilities-workflow"
                  className="px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-medium rounded transition-colors flex items-center space-x-2 shadow-xs"
                >
                  <span>Explore Features</span>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </a>

              </div>

            </div>

            {/* Right Hero Column: 3D Surface Model Preview */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-3 shadow-md overflow-hidden">
              <FloodHero3D />

              {/* Summary Metrics Bar below 3D scene */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 rounded-b-lg grid grid-cols-3 gap-2 font-mono text-center">
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-base font-bold text-slate-900">3.82 ha</div>
                  <div className="text-[10px] text-slate-500">Inundation Extent</div>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-base font-bold text-cyan-700">16 Structures</div>
                  <div className="text-[10px] text-slate-500">Submerged</div>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-base font-bold text-slate-900">1.92 m</div>
                  <div className="text-[10px] text-slate-500">Water Depth</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────── COMBINED SECTION 2: CAPABILITIES & WORKFLOW ─────────────────────────── */}
      <section id="capabilities-workflow" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-b border-slate-200">
        <div className="text-center space-y-3 max-w-3xl mx-auto mb-14">
          <div className="text-xs font-mono text-cyan-700 tracking-wider uppercase font-semibold">
            OPERATIONAL METHODOLOGY &amp; CAPABILITIES
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            How FloodSense Works &amp; Supported Capabilities
          </h2>
          <p className="text-base text-slate-600">
            From raw drone optical frames to actionable disaster situation reports in three structured steps, powered by 10-class segmentation.
          </p>
        </div>

        {/* 3-Step Methodology Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {/* Step 1 */}
          <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4 shadow-xs hover:border-cyan-400 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700 font-mono font-bold text-sm">
              01
            </div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-cyan-600" />
              Upload Aerial Imagery
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Upload drone captures or aerial survey photographs in JPEG, PNG, or WebP formats.
              System validates resolution, coordinates, and image metadata.
            </p>
            <div className="text-[11px] font-mono text-slate-500 pt-2 border-t border-slate-100">
              Validates resolution and aspect ratio on client and server.
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4 shadow-xs hover:border-cyan-400 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700 font-mono font-bold text-sm">
              02
            </div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Eye className="w-5 h-5 text-cyan-600" />
              Inspect &amp; Classify
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Inundation boundaries are categorized across 10 critical classes, differentiating
              flooded buildings, clear structures, submerged roadways, standing water, and natural drainage.
            </p>
            <div className="text-[11px] font-mono text-slate-500 pt-2 border-t border-slate-100">
              Sub-meter precision overlay with opacity and wipe comparison.
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4 shadow-xs hover:border-cyan-400 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700 font-mono font-bold text-sm">
              03
            </div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-cyan-600" />
              Analyze &amp; Report
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Inquire naturally in the chat studio to receive grounded impact summaries, structural compromise
              tallies, and statutory situation reports citing disaster protocols.
            </p>
            <div className="text-[11px] font-mono text-slate-500 pt-2 border-t border-slate-100">
              Compliant with emergency management documentation standards.
            </div>
          </div>
        </div>

        {/* Capabilities Grid */}
        <div className="border-t border-slate-200 pt-14">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-slate-900">
              Core Technical Capabilities
            </h3>
            <Link
              href="/signin"
              className="text-xs font-mono text-cyan-700 hover:text-cyan-900 flex items-center gap-1 font-semibold"
            >
              <span>Open Studio to Try</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
              <Layers className="w-6 h-6 text-cyan-600" />
              <h4 className="font-bold text-slate-900 text-sm">10-Class Semantic Mapping</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Pinpoints flooded buildings, safe buildings, flooded roads, safe roads, water bodies, vehicles, and tree canopy.
              </p>
            </div>

            <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
              <MessageSquare className="w-6 h-6 text-cyan-600" />
              <h4 className="font-bold text-slate-900 text-sm">Interactive Image Q&amp;A</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Ask natural questions about water depth, route connectivity, and building access directly tied to visual evidence.
              </p>
            </div>

            <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
              <Building className="w-6 h-6 text-cyan-600" />
              <h4 className="font-bold text-slate-900 text-sm">Structural Triage Scoring</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Calculates structural compromise tiers (Critical, Moderate, Low) based on water boundary proximity and submersion.
              </p>
            </div>

            <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
              <Cpu className="w-6 h-6 text-cyan-600" />
              <h4 className="font-bold text-slate-900 text-sm">Offline Field Resilience</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Maintains full local inspection capability with persistent storage when network connectivity is lost in the field.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────── COMBINED SECTION 3: DASHBOARD & WALKTHROUGH ─────────────────────────── */}
      <section id="dashboard-walkthrough" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-b border-slate-200">
        <div className="text-center space-y-3 max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-50 border border-cyan-200 rounded text-xs font-mono text-cyan-800">
            <span>LIVE INTERACTIVE EVALUATION</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Interactive Dashboard &amp; Reconnaissance Walkthrough
          </h2>
          <p className="text-base text-slate-600">
            Select a reconnaissance pass to inspect verified segmentation mask overlays, gauge hydrological severity, and review impact summaries.
          </p>
        </div>

        {/* Reconnaissance Pass Switcher Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-8 font-mono text-xs">
          {(['10169', '10815', '6423'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setSelectedWalkthrough(id)}
              className={`px-4 py-2 rounded-lg transition-colors border ${
                selectedWalkthrough === id
                  ? 'bg-cyan-600 text-white font-semibold border-cyan-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {WALKTHROUGH_SAMPLES[id].title.split(':')[0]}
            </button>
          ))}
        </div>

        {/* Combined Dashboard & Walkthrough Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Inspection & Walkthrough Q&A View */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs font-mono">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span className="text-slate-900 font-semibold">{activeWalkthrough.title}</span>
                <span className="text-slate-500 hidden sm:inline">({activeWalkthrough.location})</span>
              </div>
              <span className="text-[10px] text-cyan-700 px-2 py-0.5 bg-cyan-50 border border-cyan-200 rounded font-semibold">
                SEVERITY {activeWalkthrough.severity}
              </span>
            </div>

            {/* Mask Viewer Component */}
            <div className="rounded-lg overflow-hidden border border-slate-200">
              <MaskViewer
                sampleId={String(selectedWalkthrough)}
                rawImageUrl={activeWalkthrough.image}
                maskImageUrl={activeWalkthrough.mask}
              />
            </div>

            <div className="text-[11px] font-mono text-slate-500">
              Drag slider or toggle opacity to verify flood boundary classification against true optical imagery.
            </div>

            {/* Interactive Q&A Turn for Active Pass */}
            <div className="pt-3 border-t border-slate-200 space-y-3 font-mono text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="text-[10px] text-slate-500 font-semibold">FIELD OPERATOR INQUIRY:</div>
                <div className="text-sm font-sans text-slate-900">&ldquo;{activeWalkthrough.sampleQ}&rdquo;</div>
              </div>

              <div className="p-4 bg-white border border-cyan-200 rounded-lg space-y-2 shadow-2xs">
                <div className="text-[10px] text-cyan-800 font-semibold flex items-center justify-between">
                  <span>FLOODSENSE SITREP SUMMARY</span>
                  <span className="text-emerald-700 font-medium">VERIFIED</span>
                </div>
                <p className="text-xs font-sans text-slate-700 leading-relaxed">
                  {activeWalkthrough.sampleA}
                </p>
                <div className="pt-2 text-[11px] text-amber-700 flex items-center gap-1.5 border-t border-slate-100 font-medium font-sans">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Roadway Status: {activeWalkthrough.roadStatus}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Metrics & Tide Gauge */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <TideGauge
                currentWaterLevelMeters={activeWalkthrough.waterLevel}
                dangerThresholdMeters={activeWalkthrough.dangerThreshold}
                tidePhase={activeWalkthrough.tidePhase}
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 font-mono text-xs shadow-sm">
              <div className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
                <span>Sector Damage Tallies</span>
                <span className="text-amber-700 font-semibold">Live Incident</span>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border border-slate-200">
                  <span className="text-slate-600">Total Inundated Area:</span>
                  <span className="font-bold text-cyan-800">{activeWalkthrough.inundatedArea}</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border border-slate-200">
                  <span className="text-slate-600">Flooded Structures:</span>
                  <span className="font-bold text-red-600">{activeWalkthrough.floodedBuildings} Buildings</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border border-slate-200">
                  <span className="text-slate-600">Impassable Roadway:</span>
                  <span className="font-bold text-amber-700">{activeWalkthrough.impassableRoad}</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border border-slate-200">
                  <span className="text-slate-600">Primary Cause:</span>
                  <span className="text-slate-900 font-medium">{activeWalkthrough.cause}</span>
                </div>
              </div>

              <Link
                href="/signin"
                className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium text-xs font-mono rounded-lg flex items-center justify-center space-x-2 transition-colors shadow-xs"
              >
                <span>Launch This Incident in Studio</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────── SECTION 4: 3D DIGITAL TWIN ─────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-b border-slate-200">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-4">
            <div className="text-xs font-mono text-cyan-700 tracking-wider uppercase font-semibold">
              INTERACTIVE 3D SIMULATOR
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              Real-Time 3D Flood Simulator
            </h2>
            <p className="text-base text-slate-600 leading-relaxed">
              Simulate water level surges dynamically. Observe real-time building submersion,
              color shifts, and drone camera orbits in an optimized WebGL spatial environment.
            </p>
          </div>

          <div className="lg:col-span-6 p-6 bg-slate-50 border border-slate-200 rounded-xl space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200">
              <span className="text-slate-900 font-semibold flex items-center gap-2">
                <Waves className="w-4 h-4 text-cyan-600" />
                HYDRO SIMULATION PARAMETERS
              </span>
              <span className="text-slate-500">60 FPS WEBGL</span>
            </div>
            <div className="space-y-2">
              <div className="p-3 bg-white rounded border border-slate-200 flex items-center justify-between">
                <span className="text-slate-600">Elevation Contours:</span>
                <span className="text-slate-900 font-medium">3D Sinusoidal Relief</span>
              </div>
              <div className="p-3 bg-white rounded border border-slate-200 flex items-center justify-between">
                <span className="text-slate-600">Volumetric Water:</span>
                <span className="text-cyan-800 font-medium">Reflective Mesh with Wave Harmonics</span>
              </div>
              <div className="p-3 bg-white rounded border border-slate-200 flex items-center justify-between">
                <span className="text-slate-600">Camera Orbit:</span>
                <span className="text-slate-900 font-medium">Mouse Parallax &amp; Touch Flyover</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────── SECTION 5: FINAL CTA ─────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-b border-slate-200">
        <div className="p-8 sm:p-12 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-5 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-cyan-100 border border-cyan-300 mx-auto flex items-center justify-center text-cyan-700">
            <Droplets className="w-6 h-6" />
          </div>

          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 max-w-xl mx-auto">
            Ready to Accelerate Flood Assessment?
          </h2>

          <p className="text-base text-slate-600 max-w-lg mx-auto leading-relaxed">
            Upload aerial drone imagery, query inundation boundaries, and generate compliant situation reports.
          </p>

          <div className="flex flex-wrap justify-center gap-3 pt-2 font-mono text-xs">
            <Link
              href="/signin"
              className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg flex items-center space-x-2 transition-colors shadow-xs"
            >
              <span>Launch FloodSense Studio</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/signup"
              className="px-6 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-medium rounded-lg transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────────────────────── SECTION 6: FOOTER ─────────────────────────── */}
      <footer className="py-12 px-4 sm:px-6 max-w-7xl mx-auto font-mono text-xs text-slate-600">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 pb-10 border-b border-slate-200">
          <div className="space-y-2">
            <FloodSenseLogo size="sm" href="/" />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Disaster Reconnaissance &amp; SITREP Generation Platform.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-slate-900 font-semibold text-xs uppercase tracking-wider">
              Application
            </div>
            <ul className="space-y-1.5 text-[11px]">
              <li><Link href="/signin" className="hover:text-cyan-700">Chat Studio</Link></li>
              <li><Link href="/signin" className="hover:text-cyan-700">Recon Gallery</Link></li>
              <li><Link href="/signin" className="hover:text-cyan-700">Settings</Link></li>
            </ul>
          </div>

          <div className="space-y-2">
            <div className="text-slate-900 font-semibold text-xs uppercase tracking-wider">
              Sections
            </div>
            <ul className="space-y-1.5 text-[11px]">
              <li><a href="#capabilities-workflow" className="hover:text-cyan-700">Capabilities &amp; Workflow</a></li>
              <li><a href="#dashboard-walkthrough" className="hover:text-cyan-700">Dashboard &amp; Walkthrough</a></li>
            </ul>
          </div>

          <div className="space-y-2">
            <div className="text-slate-900 font-semibold text-xs uppercase tracking-wider">
              Authentication
            </div>
            <ul className="space-y-1.5 text-[11px]">
              <li><Link href="/signin" className="hover:text-cyan-700">Sign In</Link></li>
              <li><Link href="/signup" className="hover:text-cyan-700">Create Account</Link></li>
              <li><Link href="/forgot-password" className="hover:text-cyan-700">Reset Password</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
          <div>
            &copy; {new Date().getFullYear()} FloodSense Platform.
          </div>
          <div className="flex items-center space-x-4">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              <span>System Operational</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
