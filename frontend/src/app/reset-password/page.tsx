'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { FloodSenseLogo } from '../../components/ui/FloodSenseLogo';
import { api } from '../../lib/api';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters in length.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.updatePassword(password);
      setMessage('Your password has been updated. You can now sign in.');
      setTimeout(() => router.replace('/signin'), 1800);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Could not reset your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 shadow-sm space-y-6">
        <div className="text-center space-y-2 flex flex-col items-center">
          <FloodSenseLogo size="md" href="/" />
          <h1 className="font-sans text-2xl font-bold tracking-tight">Set a new password</h1>
          <p className="font-sans text-xs text-slate-500">
            Choose a new password for your FloodSense account.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5 text-xs">
            <span className="text-[11px] text-slate-600 font-medium">NEW PASSWORD</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600"
            />
          </label>
          <label className="block space-y-1.5 text-xs">
            <span className="text-[11px] text-slate-600 font-medium">CONFIRM PASSWORD</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span>{loading ? 'Updating...' : 'Update Password'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-center text-xs text-slate-600">
          <Link href="/signin" className="text-cyan-700 hover:underline font-medium">
            Return to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
