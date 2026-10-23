'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  UploadCloud,
  Camera,
  FolderOpen,
  Image as ImageIcon,
  ArrowRight,
  ShieldAlert,
  X,
  MessageSquare,
  Box,
  Compass,
  FileCheck,
  AlertTriangle,
  Layers,
  HelpCircle
} from 'lucide-react';
import { api } from '../../lib/api';
import { FloodSenseLogo } from '../../components/ui/FloodSenseLogo';

export default function AppWelcomePage() {
  const router = useRouter();
  const uploadPhotoRef = useRef<HTMLInputElement>(null);
  const cameraCaptureRef = useRef<HTMLInputElement>(null);
  const browseFilesRef = useRef<HTMLInputElement>(null);

  const [question, setQuestion] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const SAMPLE_QUESTIONS = [
    'What areas appear to be flooded in this image?',
    'Which buildings appear to be affected?',
    'Can you summarize the visible flood damage?',
    'Explain the assessment results in simple terms.',
  ];

  const handleFile = (file: File) => {
    setErrorMsg(null);
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setErrorMsg('Invalid file format. Please upload JPEG, PNG, or WebP images.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMsg('Image size exceeds 20MB limit. Please upload an optimized aerial capture.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setSelectedImage(previewUrl);
    setSelectedFile(file);
    setSelectedFileName(file.name);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleStartAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() && !selectedImage) {
      setErrorMsg('Please upload a flood image or enter a question to start.');
      return;
    }

    setIsSubmitting(true);
    let createdThreadId: string | null = null;
    try {
      const thread = await api.createChat({
        title: question.trim() ? question.slice(0, 32) : 'New UAV Assessment',
        location_tag: 'Sector Aerial Pass',
        severity: 'MODERATE',
      });
      createdThreadId = thread.id;
      await api.saveChatMessage({
        id: `draft-${crypto.randomUUID()}`,
        thread_id: thread.id,
        role: 'user',
        content: question.trim() || 'Analyze this uploaded flood image.',
        raw_image_url: selectedImage || undefined,
        image_file: selectedFile || undefined,
        created_at: new Date().toISOString(),
      });

      router.push(`/app/chat/${thread.id}`);
    } catch (error) {
      let message = error instanceof Error ? error.message : 'Could not create a Supabase conversation.';
      if (createdThreadId) {
        try {
          await api.deleteChat(createdThreadId);
        } catch (cleanupError) {
          const cleanupMessage =
            cleanupError instanceof Error ? cleanupError.message : 'conversation cleanup failed';
          message = `${message} Also, ${cleanupMessage}`;
        }
      }
      setErrorMsg(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-4xl mx-auto w-full font-mono text-xs text-slate-800">
      <div className="w-full space-y-8 my-auto py-6">
        {/* Header Greeting */}
        <div className="text-center space-y-3 flex flex-col items-center">
          <FloodSenseLogo size="lg" href="/app" />
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs text-slate-600">
            <span className="text-slate-900 font-semibold">FloodSense Studio</span>
            <span>&bull;</span>
            <span>UAV Disaster Assessment</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 font-sans">
            Start Flood Assessment
          </h1>
          <p className="font-sans text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
          Upload aerial imagery to run segmentation, inspect scene classes,
            and inspect flood boundaries in conversational natural language.
          </p>
        </div>

        {/* Upload & Question Composer Card */}
        <form onSubmit={handleStartAssessment} className="bg-white border border-slate-200 rounded-xl p-5 sm:p-7 space-y-5 shadow-sm">
          {/* Drag & Drop File Upload Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
              isDragging
                ? 'border-cyan-600 bg-cyan-50'
                : 'border-slate-300 hover:border-cyan-500 bg-slate-50'
            }`}
          >
            {selectedImage ? (
              <div className="relative inline-block">
                <img
                  src={selectedImage}
                  alt="Upload preview"
                  className="max-h-48 rounded border border-slate-200 object-cover mx-auto shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedImage(null);
                    setSelectedFile(null);
                    setSelectedFileName(null);
                  }}
                  className="absolute -top-2 -right-2 p-1 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-xs"
                  title="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="text-[11px] text-slate-600 mt-2 truncate max-w-xs mx-auto">
                  {selectedFileName}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-lg bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700 mx-auto">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-900 font-sans">
                    Drag and drop flood drone imagery here
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Supports JPEG, PNG, WebP (up to 20MB)
                  </div>
                </div>
                <input
                  ref={uploadPhotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFile(e.target.files[0]);
                    }
                    e.currentTarget.value = '';
                  }}
                />
                <input
                  ref={cameraCaptureRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFile(e.target.files[0]);
                    e.currentTarget.value = '';
                  }}
                />
                <input
                  ref={browseFilesRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFile(e.target.files[0]);
                    e.currentTarget.value = '';
                  }}
                />
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => uploadPhotoRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-600 bg-cyan-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-cyan-700"
                  >
                    <ImageIcon className="h-4 w-4" />
                    Upload photo
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraCaptureRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    <Camera className="h-4 w-4" />
                    Take photo
                  </button>
                  <button
                    type="button"
                    onClick={() => browseFilesRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    <FolderOpen className="h-4 w-4" />
                    Browse files
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Multiline Question Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-600">
              <span className="font-medium text-slate-700">Question / Objective:</span>
              <span className="text-[10px] text-slate-400">Shift + Enter for newline</span>
            </div>
            <textarea
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleStartAssessment(e);
                }
              }}
              placeholder="Ask a question about your flood image... (e.g. 'What areas appear to be flooded?')"
              className="w-full p-3 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600 resize-none font-sans"
            />
          </div>

          {/* Starter Questions */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              Suggested Questions:
            </div>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setQuestion(q)}
                  className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] text-slate-700 transition-colors text-left"
                >
                  &ldquo;{q}&rdquo;
                </button>
              ))}
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
            <Link
              href="/3d"
              className="text-cyan-700 hover:text-cyan-900 flex items-center gap-1.5 text-xs order-2 sm:order-1 font-sans font-medium"
            >
              <Box className="w-4 h-4 text-cyan-600" />
              <span>Or explore 3D Simulator &rarr;</span>
            </Link>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg flex items-center justify-center space-x-2 transition-colors shadow-xs disabled:opacity-50 order-1 sm:order-2 font-sans"
            >
              <span>{isSubmitting ? 'Starting Session...' : 'Launch Assessment'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
