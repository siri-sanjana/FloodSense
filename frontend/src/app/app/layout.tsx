'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Image as ImageIcon,
  Settings,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  AlertTriangle,
  Trash2,
  MoreVertical,
  LogOut,
  X,
  Menu,
  Server
} from 'lucide-react';
import { CommandPalette } from '../../components/CommandPalette';
import { CitationDrawer } from '../../components/CitationDrawer';
import { FloodSenseLogo } from '../../components/ui/FloodSenseLogo';
import { CURRENT_USER } from '../../lib/mock-data';
import { CitationClause } from '../../lib/types';
import { api } from '../../lib/api';
import type { ChatThread } from '../../lib/api';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [activeCitation, setActiveCitation] = useState<CitationClause | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [searchQuery, setSearchQuery] = useState('');
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadToDelete, setThreadToDelete] = useState<{ id: string; title: string } | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [user, setUser] = useState(CURRENT_USER);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    // Default to clean white/light theme
    const savedTheme = localStorage.getItem('floodsense_theme') as 'light' | 'dark' | null;
    const initialTheme = savedTheme || 'light';
    setTheme(initialTheme);
    if (initialTheme === 'dark') {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }

    const loadWorkspace = async () => {
      try {
        const u = await api.getCurrentUser();
        if (!u) {
          router.replace('/signin');
          return;
        }
        setUser((prev) => ({
          ...prev,
          name: u.name,
          email: u.email,
          role: (u.role as any) || prev.role,
        }));
        setThreads(await api.getChats());
        setDataError(null);
      } catch (error) {
        setDataError(error instanceof Error ? error.message : 'Could not load your Supabase workspace.');
      }
    };
    void loadWorkspace();

    setMobileDrawerOpen(false);
  }, [pathname, router]);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('floodsense_theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  };

  const handleNewChat = async () => {
    try {
      const thread = await api.createChat();
      setThreads((previous) => [thread, ...previous]);
      router.push(`/app/chat/${thread.id}`);
      setMobileDrawerOpen(false);
      setDataError(null);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Could not create a conversation.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!threadToDelete) return;
    const deletedId = threadToDelete.id;
    try {
      await api.deleteChat(deletedId);
      setThreads((prev) => prev.filter((t) => t.id !== deletedId));
      setThreadToDelete(null);
      setDataError(null);
      if (pathname === `/app/chat/${deletedId}`) router.push('/app');
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Could not delete the conversation.');
    }
  };

  const handleSignOut = async () => {
    try {
      await api.logout();
      router.push('/signin');
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Could not sign out.');
    }
  };

  const filteredThreads = threads.filter(
    (t) =>
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.location_tag && t.location_tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.severity && t.severity.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const now = Date.now();
  const todayThreads = filteredThreads.filter(
    (t) => now - new Date(t.created_at).getTime() < 1000 * 60 * 60 * 24
  );
  const yesterdayThreads = filteredThreads.filter((t) => {
    const diff = now - new Date(t.created_at).getTime();
    return diff >= 1000 * 60 * 60 * 24 && diff < 1000 * 60 * 60 * 48;
  });
  const pastWeekThreads = filteredThreads.filter((t) => {
    const diff = now - new Date(t.created_at).getTime();
    return diff >= 1000 * 60 * 60 * 48 && diff < 1000 * 60 * 60 * 24 * 7;
  });
  const olderThreads = filteredThreads.filter((t) => {
    const diff = now - new Date(t.created_at).getTime();
    return diff >= 1000 * 60 * 60 * 24 * 7;
  });

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-mono text-xs border-r border-slate-200 select-none">
      {/* Top Header: Brand & New Chat */}
      <div className="p-3.5 border-b border-slate-200 space-y-3 bg-white">
        <div className="flex items-center justify-between">
          <FloodSenseLogo size="sm" href="/app" />
        </div>

        {/* New Chat Button */}
        <button
          onClick={handleNewChat}
          className="w-full py-2 px-3 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg flex items-center justify-between transition-colors shadow-xs"
        >
          <div className="flex items-center space-x-2">
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="text-xs">New Chat</span>
          </div>
          <span className="text-[10px] opacity-75 font-mono">Ctrl+N</span>
        </button>

        {/* Search Chats Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search incident passes..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-cyan-600 focus:bg-white transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Nav Links: Gallery & Settings */}
      <div className="px-3 py-2 space-y-1 border-b border-slate-200 text-[11px] bg-white/50">
        <Link
          href="/app/gallery"
          className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-lg transition-colors ${
            pathname.startsWith('/app/gallery')
              ? 'bg-slate-200 text-slate-900 font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
          <span>Recon Gallery &amp; Maps</span>
        </Link>

        <Link
          href="/app/settings"
          className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-lg transition-colors ${
            pathname === '/app/settings'
              ? 'bg-slate-200 text-slate-900 font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Server className="w-3.5 h-3.5 text-cyan-600" />
          <span>API Explorer &amp; Endpoints</span>
        </Link>
      </div>

      {/* Middle: Grouped Conversation History */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {filteredThreads.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500 space-y-2">
            <div>No conversations match &ldquo;{searchQuery}&rdquo;</div>
            <button
              onClick={() => setSearchQuery('')}
              className="text-cyan-700 hover:underline text-[11px]"
            >
              Clear search
            </button>
          </div>
        ) : null}

        {/* Today */}
        {todayThreads.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 px-2 py-0.5 font-semibold">
              Today
            </div>
            {todayThreads.map((thread) => {
              const active = pathname === `/app/chat/${thread.id}`;
              return (
                <div
                  key={thread.id}
                  className={`group relative flex items-center justify-between rounded-lg px-2.5 py-2 transition-all border ${
                    active
                      ? 'bg-white border-cyan-500 text-slate-900 shadow-xs'
                      : 'border-transparent hover:bg-white text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Link href={`/app/chat/${thread.id}`} className="flex-1 min-w-0 pr-2">
                    <div className="truncate text-xs font-sans font-medium text-slate-900">
                      {thread.title}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 font-mono">
                      <span className="truncate">{(thread.location_tag || 'Sector').split('(')[0]}</span>
                      <span
                        className={`px-1 text-[9px] rounded font-medium ${
                          thread.severity === 'CRITICAL'
                            ? 'text-red-700 bg-red-50'
                            : 'text-cyan-800 bg-cyan-50'
                        }`}
                      >
                        {thread.severity}
                      </span>
                    </div>
                  </Link>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setThreadToDelete({ id: thread.id, title: thread.title });
                    }}
                    title="Delete conversation"
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Yesterday */}
        {yesterdayThreads.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 px-2 py-0.5 font-semibold">
              Yesterday
            </div>
            {yesterdayThreads.map((thread) => {
              const active = pathname === `/app/chat/${thread.id}`;
              return (
                <div
                  key={thread.id}
                  className={`group relative flex items-center justify-between rounded-lg px-2.5 py-2 transition-all border ${
                    active
                      ? 'bg-white border-cyan-500 text-slate-900 shadow-xs'
                      : 'border-transparent hover:bg-white text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Link href={`/app/chat/${thread.id}`} className="flex-1 min-w-0 pr-2">
                    <div className="truncate text-xs font-sans font-medium text-slate-900">
                      {thread.title}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 font-mono">
                      <span className="truncate">{(thread.location_tag || 'Sector').split('(')[0]}</span>
                      <span className="text-[9px] text-cyan-800 font-medium">{thread.severity}</span>
                    </div>
                  </Link>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setThreadToDelete({ id: thread.id, title: thread.title });
                    }}
                    title="Delete conversation"
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Previous 7 Days */}
        {pastWeekThreads.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 px-2 py-0.5 font-semibold">
              Previous 7 Days
            </div>
            {pastWeekThreads.map((thread) => {
              const active = pathname === `/app/chat/${thread.id}`;
              return (
                <div
                  key={thread.id}
                  className={`group relative flex items-center justify-between rounded-lg px-2.5 py-2 transition-all border ${
                    active
                      ? 'bg-white border-cyan-500 text-slate-900 shadow-xs'
                      : 'border-transparent hover:bg-white text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Link href={`/app/chat/${thread.id}`} className="flex-1 min-w-0 pr-2">
                    <div className="truncate text-xs font-sans font-medium text-slate-900">
                      {thread.title}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 font-mono">
                      <span className="truncate">{(thread.location_tag || 'Sector').split('(')[0]}</span>
                      <span className="text-[9px] text-slate-500 font-medium">{thread.severity}</span>
                    </div>
                  </Link>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setThreadToDelete({ id: thread.id, title: thread.title });
                    }}
                    title="Delete conversation"
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Older */}
        {olderThreads.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 px-2 py-0.5 font-semibold">
              Older
            </div>
            {olderThreads.map((thread) => {
              const active = pathname === `/app/chat/${thread.id}`;
              return (
                <div
                  key={thread.id}
                  className={`group relative flex items-center justify-between rounded-lg px-2.5 py-2 transition-all border ${
                    active
                      ? 'bg-white border-cyan-500 text-slate-900 shadow-xs'
                      : 'border-transparent hover:bg-white text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Link href={`/app/chat/${thread.id}`} className="flex-1 min-w-0 pr-2">
                    <div className="truncate text-xs font-sans font-medium text-slate-900">
                      {thread.title}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 font-mono">
                      <span className="truncate">{(thread.location_tag || 'Sector').split('(')[0]}</span>
                      <span className="text-[9px] text-slate-500 font-medium">{thread.severity}</span>
                    </div>
                  </Link>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setThreadToDelete({ id: thread.id, title: thread.title });
                    }}
                    title="Delete conversation"
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom User Profile Section */}
      <div className="p-3 border-t border-slate-200 bg-white relative">
        {/* Profile Menu Popup */}
        {profileMenuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 p-2 bg-white border border-slate-200 rounded-xl shadow-xl space-y-1 z-50">
            <div className="px-3 py-2 border-b border-slate-100">
              <div className="text-xs font-bold text-slate-900">{user.name}</div>
              <div className="text-[10px] text-slate-500 truncate">{user.email || 'analyst@floodsense.ai'}</div>
            </div>

            <Link
              href="/app/settings"
              onClick={() => setProfileMenuOpen(false)}
              className="flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-cyan-600" />
              <span>Settings &amp; Preferences</span>
            </Link>

            <button
              onClick={() => {
                toggleTheme();
                setProfileMenuOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center space-x-2">
                {theme === 'dark' ? (
                  <Moon className="w-3.5 h-3.5 text-cyan-600" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span>Theme: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
              </div>
              <span className="text-[10px] text-slate-400">Toggle</span>
            </button>

            <div className="pt-1 border-t border-slate-100">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}

        {/* Profile Button */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex items-center space-x-2.5 text-left flex-1 min-w-0 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-cyan-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">
                {user.name.split(',')[0]}
              </div>
              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                <span className="capitalize">{user.role}</span>
              </div>
            </div>
            <MoreVertical className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      {dataError && (
        <div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-md rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 shadow-lg">
          {dataError}
        </div>
      )}
      {/* ─────────────────────────── TOP HEADER ─────────────────────────── */}
      <header className="h-14 w-full bg-white border-b border-slate-200 flex items-center justify-between px-4 z-30 font-mono text-xs select-none shadow-2xs">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="md:hidden p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg"
            title="Open Mobile Navigation"
          >
            <Menu className="w-4 h-4" />
          </button>

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden md:flex p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors"
            title="Toggle Sidebar"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>

          <div className="flex items-center space-x-2">
            <FloodSenseLogo size="sm" href="/app" />
            <span className="text-[10px] text-cyan-800 px-1.5 py-0.2 bg-cyan-50 border border-cyan-200 rounded font-medium">
              STUDIO
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center space-x-2 px-3 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-cyan-600" />
            <span className="text-[11px] hidden sm:inline-block">Command Palette...</span>
            <kbd className="text-[10px] bg-white px-1.5 py-0.2 border border-slate-200 rounded text-slate-500 shadow-2xs">
              Ctrl+K
            </kbd>
          </button>

          <button
            onClick={toggleTheme}
            className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors"
            title="Toggle Light / Dark Mode"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-500" />
            ) : (
              <Moon className="w-4 h-4 text-cyan-700" />
            )}
          </button>

          <Link
            href="/app/settings"
            className="flex items-center space-x-2 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span className="truncate max-w-[120px]">{user.name.split(',')[0]}</span>
          </Link>
        </div>
      </header>

      {/* ─────────────────────────── MAIN WRAPPER ─────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {sidebarOpen && (
          <aside className="hidden md:flex w-72 shrink-0 flex-col">
            {renderSidebarContent()}
          </aside>
        )}

        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="relative w-80 max-w-[85vw] h-full z-10 shadow-2xl">
              {renderSidebarContent()}
            </div>
          </div>
        )}

        <main className="flex-1 flex flex-col overflow-y-auto bg-white relative">
          {children}
        </main>
      </div>

      {/* Delete Confirmation Modal */}
      {threadToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full space-y-4 shadow-xl font-mono text-xs">
            <div className="flex items-center space-x-2 text-red-600 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>Permanently Delete Conversation?</span>
            </div>

            <p className="font-sans text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-slate-900">&ldquo;{threadToDelete.title}&rdquo;</strong>?
              All associated chat turns and generated situation reports will be removed from your personal history.
            </p>

            <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setThreadToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-lg transition-colors font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-1.5 font-sans"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <CommandPalette
        isOpen={cmdOpen}
        onClose={() => setCmdOpen(false)}
        threads={threads}
        onNewInspection={handleNewChat}
        onExportPDF={() => window.dispatchEvent(
          new CustomEvent('floodsense:export-sitrep', { detail: { format: 'pdf' } }),
        )}
      />

      <CitationDrawer
        citation={activeCitation}
        onClose={() => setActiveCitation(null)}
      />
    </div>
  );
}
