'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Box, ExternalLink } from 'lucide-react';

export default function ThreeDDigitalTwinRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/3d');
  }, [router]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 text-slate-800 font-mono text-xs">
      <div className="p-8 bg-white border border-slate-200 rounded-xl shadow-xs text-center space-y-4 max-w-md">
        <div className="w-12 h-12 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600 mx-auto">
          <Box className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 font-sans">
          Opening Standalone 3D Simulator...
        </h2>
        <p className="text-slate-500 text-xs font-sans">
          Launching full-screen spatial simulator outside the chat interface.
        </p>
        <Link
          href="/3d"
          className="inline-flex items-center space-x-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg transition-colors shadow-xs"
        >
          <span>Click if not redirected</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
