'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { FloodSenseLogo } from '../../components/ui/FloodSenseLogo';
import { api } from '../../lib/api';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please provide both your email and account password.');
      return;
    }

    setLoading(true);
    try {
      await api.login({ email, password });
      router.push('/app');
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to authenticate. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = () => {
    setEmail('analyst@floodsense.ops');
    setPassword('DisasterResponse2026!');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center px-4 py-12 relative select-none">
      {/* Main Authentication Card */}
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 shadow-sm relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-1.5 flex flex-col items-center">
          <FloodSenseLogo size="md" href="/" />
          <h1 className="font-sans text-2xl font-bold tracking-tight text-slate-900 pt-1">
            Sign In to FloodSense
          </h1>
          <p className="font-sans text-xs text-slate-500 leading-relaxed">
            Disaster Reconnaissance &amp; Inundation Assessment Platform
          </p>
        </div>

        {/* Error Feedback */}
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Sign In Form */}
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-slate-600 font-medium">PASSWORD</label>
              <Link
                href="/forgot-password"
                className="text-[11px] text-cyan-700 hover:text-cyan-800 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full pl-3.5 pr-10 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="flex items-center space-x-2 pt-1 font-sans text-xs text-slate-600">
            <input
              type="checkbox"
              id="remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
            />
            <label htmlFor="remember" className="cursor-pointer text-slate-600">
              Remember active session on this device
            </label>
          </div>

          {/* Primary Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center space-x-2 shadow-xs disabled:opacity-50 font-sans text-sm"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In to Workspace'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Quick Demo Credentials */}
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={handleQuickDemo}
              className="text-xs text-cyan-700 hover:text-cyan-800 font-sans hover:underline"
            >
              Autofill Demo Credentials
            </button>
          </div>
        </form>

        {/* Footer Navigation */}
        <div className="text-center pt-2 border-t border-slate-100 text-xs font-sans text-slate-600">
          <span>Don&apos;t have an account? </span>
          <Link href="/signup" className="text-cyan-700 hover:underline font-medium">
            Create an Account
          </Link>
        </div>
      </div>
    </div>
  );
}
