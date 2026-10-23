'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, LogOut, Save, UserRound } from 'lucide-react';
import { api } from '../../../lib/api';
import { CURRENT_USER } from '../../../lib/mock-data';
import type { User } from '../../../lib/api';
import type { UserRole } from '../../../lib/types';

type MeasurementUnit = 'metric' | 'imperial';
type ReportTone = 'concise_tactical' | 'comprehensive_analytical' | 'public_bulletin';

const isUserRole = (role: string): role is UserRole =>
  role === 'responder' || role === 'researcher' || role === 'citizen' || role === 'journalist';

export default function SettingsPage() {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<User>({
    ...CURRENT_USER,
    email: '',
    created_at: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    api.getCurrentUser().then((user) => {
      if (active && user) setProfile(user);
    }).catch((loadError: unknown) => {
      if (active) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load your profile.');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.updatePreferences({
        displayName: profile.name,
        role: profile.role,
        region: profile.region,
        unit: profile.prefs?.unit || 'metric',
        tone: profile.prefs?.tone || 'concise_tactical',
      });
      setNotice('Profile and preferences saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError(null);
    setNotice(null);
    setIsUploadingAvatar(true);
    try {
      const updatedProfile = await api.uploadProfileAvatar(file);
      setProfile(updatedProfile);
      setNotice('Profile photo updated.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload your profile photo.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setError(null);
    try {
      await api.logout();
      router.replace('/signin');
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'Could not sign out.');
      setIsSigningOut(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Settings &amp; Preferences</h1>
        <p className="mt-1 text-sm text-slate-600">Update your operator profile and analysis preferences.</p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      <form onSubmit={(event) => void handleSave(event)} className="space-y-6">
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <UserRound className="h-4 w-4 text-cyan-700" />
            <h2>Operator information</h2>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 pb-4">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-cyan-700 text-lg font-semibold text-white">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="Profile photo" className="h-full w-full object-cover" />
              ) : (
                profile.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">{profile.name}</p>
              <p className="truncate text-sm text-slate-500">{profile.email}</p>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => void handleAvatarUpload(event)}
            />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              <Camera className="h-4 w-4" />
              {isUploadingAvatar ? 'Uploading…' : 'Upload profile photo'}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm text-slate-700">
              <span>Display name</span>
              <input
                type="text"
                required
                value={profile.name}
                onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-cyan-600"
              />
            </label>

            <label className="space-y-1.5 text-sm text-slate-700">
              <span>Email</span>
              <input
                type="email"
                value={profile.email}
                readOnly
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600"
              />
            </label>

            <label className="space-y-1.5 text-sm text-slate-700">
              <span>Operational role</span>
              <select
                value={profile.role}
                onChange={(event) => {
                  if (isUserRole(event.target.value)) {
                    setProfile({ ...profile, role: event.target.value });
                  }
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-cyan-600"
              >
                <option value="responder">Emergency responder</option>
                <option value="researcher">Hydrology researcher</option>
                <option value="journalist">Public correspondent</option>
                <option value="citizen">Citizen observer</option>
              </select>
            </label>

            <label className="space-y-1.5 text-sm text-slate-700">
              <span>Default region</span>
              <input
                type="text"
                value={profile.region || ''}
                onChange={(event) => setProfile({ ...profile, region: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-cyan-600"
              />
            </label>
          </div>
        </section>

        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
          <h2 className="text-sm font-semibold text-slate-900">Analysis preferences</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm text-slate-700">
              <span>Measurement units</span>
              <select
                value={profile.prefs?.unit || 'metric'}
                onChange={(event) => setProfile({
                  ...profile,
                  prefs: { ...CURRENT_USER.prefs, ...profile.prefs, unit: event.target.value as MeasurementUnit },
                })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-cyan-600"
              >
                <option value="metric">Metric</option>
                <option value="imperial">Imperial</option>
              </select>
            </label>

            <label className="space-y-1.5 text-sm text-slate-700">
              <span>Report tone</span>
              <select
                value={profile.prefs?.tone || 'concise_tactical'}
                onChange={(event) => setProfile({
                  ...profile,
                  prefs: {
                    ...CURRENT_USER.prefs,
                    ...profile.prefs,
                    tone: event.target.value as ReportTone,
                  },
                })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-cyan-600"
              >
                <option value="concise_tactical">Concise and tactical</option>
                <option value="comprehensive_analytical">Comprehensive and analytical</option>
                <option value="public_bulletin">Public bulletin</option>
              </select>
            </label>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cyan-800 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save profile and preferences'}
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={isSigningOut}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </form>
    </div>
  );
}
