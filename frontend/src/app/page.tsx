'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  UploadCloud,
  Eye,
  MessageSquare,
  Layers,
  ChevronRight,
  Waves,
  Droplets,
  FileText
} from 'lucide-react';
import { FloodHero3D } from '../components/three/FloodHero3D';
import { MaskViewer } from '../components/MaskViewer';
import { FloodSenseLogo } from '../components/ui/FloodSenseLogo';
import {
  FLOODNET_DATASET_DESCRIPTION,
  FLOODNET_CLASS_NAMES,
  FLOODNET_SAMPLES,
  type FloodNetSampleId,
} from '../lib/floodnet-samples';

export default function LandingPage() {
  const [selectedWalkthrough, setSelectedWalkthrough] = useState<FloodNetSampleId>('10169');

  const WALKTHROUGH_SAMPLES = {
    '10169': FLOODNET_SAMPLES['10169'],
    '10815': FLOODNET_SAMPLES['10815'],
    '6423': FLOODNET_SAMPLES['6423'],
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
                Inspect high-resolution drone and aerial flood imagery, run 10-class segmentation,
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
            <div className="lg:col-span-5 overflow-hidden rounded-xl">
              <FloodHero3D />
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

          </div>
        </div>
      </section>

      {/* ─────────────────────────── COMBINED SECTION 3: DASHBOARD & WALKTHROUGH ─────────────────────────── */}
      <section id="dashboard-walkthrough" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-b border-slate-200">
        <div className="text-center space-y-3 max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-50 border border-cyan-200 rounded text-xs font-mono text-cyan-800">
            <span>FLOODNET SAMPLE EXPLORER</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Explore FloodNet Aerial Samples
          </h2>
          <p className="text-base text-slate-600">
            Compare each aerial image with its pixel-level annotation mask. Sample IDs are dataset identifiers; this project does not provide verified locations for these images.
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
              Image {id}
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
              </div>
              <span className="text-[10px] text-cyan-700 px-2 py-0.5 bg-cyan-50 border border-cyan-200 rounded font-semibold">
                DATASET IMAGE
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
            Compare the source aerial image with its dataset annotation mask.
            </div>

            <p className="text-xs font-sans text-slate-600 leading-relaxed border-t border-slate-200 pt-3">
            {activeWalkthrough.scene} The caption describes visible content only; it does not identify a real-world location or confirm flood impact.
            </p>
          </div>

          {/* Dataset description */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3">About the FloodNet dataset</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{FLOODNET_DATASET_DESCRIPTION}</p>
            <p className="text-xs text-slate-600 leading-relaxed mt-3">
              Classes: {FLOODNET_CLASS_NAMES.join(', ')}.
            </p>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-3">
              Reference: Rahnemoonfar et al., “FloodNet: A High Resolution Aerial Imagery Dataset
              for Post Flood Scene Understanding” (2020).
            </p>

            <Link
              href="/signin"
                className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium text-xs font-mono rounded-lg flex items-center justify-center space-x-2 transition-colors shadow-xs"
              >
                <span>Analyze an image in Studio</span>
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
        </div>
      </footer>
    </div>
  );
}
