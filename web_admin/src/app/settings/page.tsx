"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Save, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { API_URL } from '../../config';

// Helper function for fetch with timeout
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 6000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Connection timed out. Please check if the backend server is running.');
    }
    throw error;
  }
};

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'loading'; message: string } | null>(null);

  // Shift Settings Form State
  const [form, setForm] = useState({
    shift_name: 'Morning Shift',
    checkin_start: '09:00:00',
    late_after: '09:15:00',
    checkout_time: '17:00:00',
    grace_minutes: 15
  });

  const showToastMsg = (type: 'success' | 'error' | 'loading', message: string, persist = false) => {
    setToast({ type, message });
    if (!persist) {
      setTimeout(() => setToast(current => current?.message === message ? null : current), 4000);
    }
  };

  useEffect(() => {
    let active = true;

    const fetchSettings = async (retries = 2, delay = 800) => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) {
          if (active) router.push('/login');
          return;
        }

        const res = await fetchWithTimeout(`${API_URL}/attendance/settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }, 5000);

        if (!res.ok) {
          throw new Error(`Server returned error status ${res.status}: ${res.statusText}`);
        }

        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Server returned an invalid non-JSON response.');
        }

        const data = await res.json();
        if (active) {
          if (data.success && data.settings) {
            setForm({
              shift_name: data.settings.shift_name || 'Morning Shift',
              checkin_start: data.settings.checkin_start || '09:00:00',
              late_after: data.settings.late_after || '09:15:00',
              checkout_time: data.settings.checkout_time || '17:00:00',
              grace_minutes: data.settings.grace_minutes ?? 15
            });
            
            if (data.warning) {
              showToastMsg('error', data.warning);
              setError(data.warning);
            }
            
            setLoading(false);
          } else {
            if (retries > 0) {
              setTimeout(() => fetchSettings(retries - 1, delay * 1.5), delay);
            } else {
              setError(data.message || 'Failed to retrieve shift settings from the database.');
              setLoading(false);
            }
          }
        }
      } catch (err: any) {
        console.error('[Frontend Fetch Error] Settings page failed:', err);
        if (active) {
          if (retries > 0) {
            setTimeout(() => fetchSettings(retries - 1, delay * 1.5), delay);
          } else {
            setError('Unable to establish connection with the backend server. Default parameters are loaded below.');
            setForm({
              shift_name: 'Morning Shift (Local Cache)',
              checkin_start: '09:00:00',
              late_after: '09:15:00',
              checkout_time: '17:00:00',
              grace_minutes: 15
            });
            setLoading(false);
            showToastMsg('error', 'Backend connection offline. Loaded default configurations.');
          }
        }
      }
    };

    fetchSettings();

    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    showToastMsg('loading', 'Saving configuration parameters...', true);

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetchWithTimeout(`${API_URL}/attendance/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(form)
      }, 6000);
      if (!res.ok) {
        throw new Error(`Server returned error status ${res.status}: ${res.statusText}`);
      }

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server returned an invalid non-JSON response.');
      }

      const data = await res.json();
      
      if (data.success) {
        showToastMsg('success', 'Settings saved and synchronized successfully.');
      } else {
        showToastMsg('error', data.message || 'Failed to update shift settings.');
        setError(data.message || 'Error updating settings.');
      }
    } catch (err: any) {
      console.error('[Frontend Submit Error] Failed to save settings:', err);
      showToastMsg('error', err.message || 'Database connection error. Could not persist settings.');
      setError('Connection failed. Database server is currently offline.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-8 animate-pulse text-slate-100 relative">
        <div className="glass-panel p-6 rounded-xl border border-slate-800 flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-5 w-48 bg-slate-800 rounded"></div>
            <div className="h-3.5 w-64 bg-slate-800/60 rounded"></div>
          </div>
        </div>
        <div className="glass-panel p-8 rounded-2xl border border-slate-800 space-y-6">
          <div className="h-3 w-24 bg-slate-800 rounded"></div>
          <div className="h-10 w-full bg-slate-850 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in text-slate-100 relative">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center space-x-3 px-4 py-3 rounded-lg border shadow-lg text-sm font-semibold transition-all ${
          toast.type === 'success' 
            ? 'bg-emerald-950/90 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
            : toast.type === 'error'
            ? 'bg-rose-955/90 text-rose-455 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.2)]'
            : 'bg-slate-900/95 text-cyan-400 border-cyan-500/30 shadow-[0_0_15px_rgba(0,229,255,0.15)]'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          ) : toast.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          ) : (
            <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="glass-panel p-6 rounded-xl border border-slate-700 shadow-lg flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            <span>Attendance Shift Settings</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">Configure factory shift timings, grace limit values, and cut-off points.</p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-955/40 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center space-x-2 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="glass-panel p-8 rounded-2xl border border-slate-700 shadow-glass-shadow">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-xs text-cyan-400 font-extrabold uppercase tracking-wider block mb-2">Shift Name</label>
            <input
              type="text"
              value={form.shift_name}
              onChange={(e) => setForm({ ...form, shift_name: e.target.value })}
              className="w-full px-3 py-2.5 glass-input text-xs text-white font-medium"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs text-cyan-400 font-extrabold uppercase tracking-wider block mb-2">Check-in Start Time</label>
              <input
                type="text"
                value={form.checkin_start}
                onChange={(e) => setForm({ ...form, checkin_start: e.target.value })}
                placeholder="e.g. 09:00:00"
                className="w-full px-3 py-2.5 glass-input text-xs text-white font-mono"
                required
              />
            </div>
            <div>
              <label className="text-xs text-cyan-400 font-extrabold uppercase tracking-wider block mb-2">Late Marking Time</label>
              <input
                type="text"
                value={form.late_after}
                onChange={(e) => setForm({ ...form, late_after: e.target.value })}
                placeholder="e.g. 09:15:00"
                className="w-full px-3 py-2.5 glass-input text-xs text-white font-mono"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs text-cyan-400 font-extrabold uppercase tracking-wider block mb-2">Check-out Time</label>
              <input
                type="text"
                value={form.checkout_time}
                onChange={(e) => setForm({ ...form, checkout_time: e.target.value })}
                placeholder="e.g. 17:00:00"
                className="w-full px-3 py-2.5 glass-input text-xs text-white font-mono"
                required
              />
            </div>
            <div>
              <label className="text-xs text-cyan-455 font-extrabold uppercase tracking-wider block mb-2">Grace Period (Minutes)</label>
              <input
                type="number"
                value={form.grace_minutes}
                onChange={(e) => setForm({ ...form, grace_minutes: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2.5 glass-input text-xs text-white font-medium"
                required
              />
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Saving Settings...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-slate-950" />
                  <span>Save Config Parameters</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
