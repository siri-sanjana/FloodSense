'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Mail, AlertCircle, ArrowRight } from 'lucide-react';
import { FloodSenseLogo } from '../../components/ui/FloodSenseLogo';
import { api } from '../../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const res = await api.forgotPassword(email);
      setMessage(res.message);
      setSubmitted(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to send password recovery instructions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center px-4 py-12 relative select-none">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 shadow-sm relative z-10 space-y-6">
        <div className="text-center space-y-1.5 flex flex-col items-center">
          <FloodSenseLogo size="md" href="/" />
          <h1 className="font-sans text-2xl font-bold tracking-tight text-slate-900 pt-1">
            Recover Password
          </h1>
          <p className="font-sans text-xs text-slate-500 leading-relaxed">
            Enter your official email to receive password reset instructions.
          </p>
        </div>

        {submitted ? (
          <div className="space-y-6 text-center">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex flex-col items-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              <div className="font-bold text-sm">Reset Link Sent</div>
              <p className="text-emerald-700 text-xs font-sans">
                {message || `Instructions have been sent to ${email}. Please check your inbox and follow the secure link.`}
              </p>
            </div>

            <Link
              href="/signin"
              className="inline-flex items-center justify-center space-x-2 w-full py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-sans text-slate-800 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Sign In</span>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-600 font-medium">EMAIL ADDRESS</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@disaster-control.org"
                required
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center space-x-2 shadow-xs disabled:opacity-50 font-sans text-sm"
            >
              <span>{loading ? 'Dispatching Link...' : 'Send Recovery Link'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="text-center pt-2">
              <Link
                href="/signin"
                className="inline-flex items-center space-x-1.5 text-xs text-slate-500 hover:text-slate-800 font-sans"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
