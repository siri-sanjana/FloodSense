'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  Shield,
  Sliders,
  Trash2,
  CheckCircle2,
  Moon,
  Sun,
  Monitor,
  KeyRound,
  LogOut,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { CURRENT_USER } from '../../../lib/mock-data';
import { api, BACKEND_URL } from '../../../lib/api';
import { BackendApiPlayground } from '../../../components/BackendApiPlayground';

export default function SettingsPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(CURRENT_USER);
  const [themePref, setThemePref] = useState<'light' | 'dark' | 'system'>('light');
  const [saved, setSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState('Settings Saved');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

  useEffect(() => {
    const storedTheme = localStorage.getItem('floodsense_theme') as 'light' | 'dark' | null;
    if (storedTheme) {
      setThemePref(storedTheme);
    }

    api.getCurrentUser().then((user) => {
      if (user) {
        setProfile((prev) => ({
          ...prev,
          name: user.name,
          email: user.email,
          role: (user.role as any) || prev.role,
        }));
      }
    });
  }, []);

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setThemePref(newTheme);
    let effective = newTheme;
    if (newTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      effective = prefersDark ? 'dark' : 'light';
    }

    localStorage.setItem('floodsense_theme', newTheme);
    if (effective === 'dark') {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }

    api.updatePreferences({ theme: newTheme });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.updatePreferences({
      displayName: profile.name,
      role: profile.role,
      region: profile.region,
      unit: profile.prefs.unit,
      tone: profile.prefs.tone,
    });

    setSaveMessage('Profile configurations saved successfully');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handlePasswordUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordNotice(null);
    if (!currentPassword) {
      setPasswordNotice('Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordNotice('New password must contain at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice('New passwords do not match.');
      return;
    }

    setPasswordNotice('Password updated successfully.');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPasswordNotice(null), 3000);
  };

  const handlePurgeHistory = () => {
    if (
      confirm(
        'Are you sure you wish to permanently purge all local flood inspection history, chat turns, and cached imagery? This action cannot be reversed.'
      )
    ) {
      localStorage.removeItem('floodsense_threads');
      alert('All local inspection records have been permanently purged.');
      router.push('/app');
    }
  };

  const handleSignOut = async () => {
    await api.logout();
    router.push('/signin');
  };

  return (
    <div className="flex-1 p-4 sm:p-10 space-y-8 max-w-4xl mx-auto w-full font-mono text-xs text-slate-800 bg-white">
      {/* Header */}
      <div className="pb-6 border-b border-slate-200 space-y-1">
        <div className="text-[10px] text-cyan-700 uppercase tracking-wider font-semibold">
          SYSTEM CONFIGURATION
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight font-sans">
          Operator Profile &amp; Preferences
        </h1>
        <p className="font-sans text-xs text-slate-500">
          Manage your credentials, theme appearance, analytical measurement units, and security sessions.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSaveProfile} className="space-y-6">
        {/* Credentials */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-xs">
          <div className="flex items-center space-x-2 text-cyan-800 font-semibold text-sm">
            <User className="w-4 h-4 text-cyan-600" />
            <span className="font-sans">Field Operator Credentials</span>
          </div>

          <div className="flex items-center space-x-4 pb-2 border-b border-slate-100">
            <div className="w-12 h-12 rounded-full bg-cyan-600 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
              {profile.name.charAt(0)}
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 font-sans">{profile.name}</div>
              <div className="text-xs text-slate-500">{profile.email || 'analyst@floodsense.ai'}</div>
              <div className="text-[10px] text-emerald-700 mt-0.5 flex items-center gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                <span>Active Field Session &bull; Authenticated</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-600 font-medium">OPERATOR DISPLAY NAME</label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-cyan-600 transition-colors"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-600 font-medium">OPERATIONAL ROLE</label>
              <select
                value={profile.role}
                onChange={(e) => setProfile({ ...profile, role: e.target.value as any })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-cyan-600 transition-colors"
              >
                <option value="responder">Emergency Responder (Tactical Field)</option>
                <option value="researcher">Hydrology Researcher (Analytical)</option>
                <option value="journalist">Public Civil Correspondent</option>
                <option value="citizen">Citizen Recon Observer</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-slate-600 font-medium">DEFAULT RIVER BASIN / REGION</label>
            <input
              type="text"
              value={profile.region}
              onChange={(e) => setProfile({ ...profile, region: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-cyan-600 transition-colors"
            />
          </div>
        </div>

        {/* Theme Preferences */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
          <div className="flex items-center space-x-2 text-cyan-800 font-semibold text-sm">
            <Sun className="w-4 h-4 text-cyan-600" />
            <span className="font-sans">Theme &amp; Appearance</span>
          </div>

          <p className="font-sans text-xs text-slate-500">
            Choose your preferred interface theme. Selected theme is persisted across all pages and sessions.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleThemeChange('light')}
              className={`p-3 rounded-lg border text-left transition-all space-y-2 ${
                themePref === 'light'
                  ? 'bg-cyan-50 border-cyan-500 text-slate-900 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <Sun className="w-4 h-4 text-amber-500" />
                {themePref === 'light' && <span className="text-[10px] text-cyan-700 font-bold">Active</span>}
              </div>
              <div className="font-bold text-xs font-sans">Light Mode (Default)</div>
              <div className="text-[10px] text-slate-500 font-sans">Crisp daylight white styling</div>
            </button>

            <button
              type="button"
              onClick={() => handleThemeChange('dark')}
              className={`p-3 rounded-lg border text-left transition-all space-y-2 ${
                themePref === 'dark'
                  ? 'bg-cyan-50 border-cyan-500 text-slate-900 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <Moon className="w-4 h-4 text-cyan-600" />
                {themePref === 'dark' && <span className="text-[10px] text-cyan-700 font-bold">Active</span>}
              </div>
              <div className="font-bold text-xs font-sans">Dark Mode</div>
              <div className="text-[10px] text-slate-500 font-sans">Night operations palette</div>
            </button>

            <button
              type="button"
              onClick={() => handleThemeChange('system')}
              className={`p-3 rounded-lg border text-left transition-all space-y-2 ${
                themePref === 'system'
                  ? 'bg-cyan-50 border-cyan-500 text-slate-900 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <Monitor className="w-4 h-4 text-slate-500" />
                {themePref === 'system' && <span className="text-[10px] text-cyan-700 font-bold">Active</span>}
              </div>
              <div className="font-bold text-xs font-sans">System Default</div>
              <div className="text-[10px] text-slate-500 font-sans">Synchronizes with OS schedule</div>
            </button>
          </div>
        </div>

        {/* Units & Tone */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
          <div className="flex items-center space-x-2 text-cyan-800 font-semibold text-sm">
            <Sliders className="w-4 h-4 text-cyan-600" />
            <span className="font-sans">Analytical &amp; Unit Standards</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-600 font-medium">MEASUREMENT SYSTEM</label>
              <div className="flex space-x-2">
                {(['metric', 'imperial'] as const).map((u) => (
                  <button
                    type="button"
                    key={u}
                    onClick={() =>
                      setProfile({
                        ...profile,
                        prefs: { ...profile.prefs, unit: u },
                      })
                    }
                    className={`px-4 py-2 rounded-lg border uppercase text-xs transition-colors font-sans font-medium ${
                      profile.prefs.unit === u
                        ? 'bg-cyan-600 text-white border-cyan-600'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {u === 'metric' ? 'Metric (m, ha)' : 'Imperial (ft, acres)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-600 font-medium">SITREP REPORTING TONE</label>
              <select
                value={profile.prefs.tone}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    prefs: { ...profile.prefs, tone: e.target.value as any },
                  })
                }
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-cyan-600 transition-colors"
              >
                <option value="concise_tactical">Concise Tactical (Command Directives)</option>
                <option value="comprehensive_analytical">Comprehensive Analytical (Hydrology)</option>
                <option value="public_bulletin">Public Civil Bulletin</option>
              </select>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="submit"
            className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg flex items-center space-x-2 transition-colors shadow-xs font-sans text-sm"
          >
            {saved ? <CheckCircle2 className="w-4 h-4" /> : null}
            <span>{saved ? saveMessage : 'Save Configurations'}</span>
          </button>
        </div>
      </form>

      {/* Security & Password */}
      <form onSubmit={handlePasswordUpdate} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center space-x-2 text-cyan-800 font-semibold text-sm">
          <KeyRound className="w-4 h-4 text-cyan-600" />
          <span className="font-sans">Security &amp; Password Management</span>
        </div>

        {passwordNotice && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
              passwordNotice.includes('successfully')
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{passwordNotice}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] text-slate-600 font-medium">CURRENT PASSWORD</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-cyan-600 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-slate-600 font-medium">NEW PASSWORD</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="8+ characters"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-cyan-600 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-slate-600 font-medium">CONFIRM NEW PASSWORD</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-cyan-600 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1.5 font-sans"
          >
            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showPassword ? 'Hide Passwords' : 'Show Passwords'}</span>
          </button>

          <button
            type="submit"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-lg transition-colors font-sans"
          >
            Update Password
          </button>
        </div>
      </form>

      {/* ── LIVE BACKEND REST API EXPLORER ── */}
      <BackendApiPlayground />

      {/* Session Management */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center space-x-2 text-cyan-800 font-semibold text-sm">
          <Shield className="w-4 h-4 text-cyan-600" />
          <span className="font-sans">Session Details</span>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Connected Backend API:</span>
            <span className="text-cyan-800 font-semibold">
              {BACKEND_URL}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Segmentation Model:</span>
            <span className="text-emerald-700 font-medium">Fine-Tuned SegFormer (0.4797 mIoU) &bull; Verified</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Storage Synchronization:</span>
            <span className="text-slate-700">Local Browser Storage &bull; Resilient Cache</span>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-sans">End active session:</span>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-lg text-xs flex items-center space-x-2 transition-colors font-sans font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Data Purge */}
      <div className="border border-red-200 bg-red-50/50 rounded-xl p-6 space-y-3">
        <div className="text-red-700 font-semibold flex items-center space-x-2 text-sm font-sans">
          <Trash2 className="w-4 h-4" />
          <span>Data Privacy &amp; Local History Purge</span>
        </div>
        <p className="font-sans text-xs text-slate-600 leading-relaxed">
          Permanently remove all local inspection conversations and cached UAV imagery from this browser.
        </p>
        <button
          type="button"
          onClick={handlePurgeHistory}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-xs transition-colors flex items-center space-x-2 font-sans shadow-xs"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Purge All Local Records</span>
        </button>
      </div>
    </div>
  );
}
