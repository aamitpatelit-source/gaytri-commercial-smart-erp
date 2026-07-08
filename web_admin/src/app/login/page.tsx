"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, ShieldCheck, KeyRound, ArrowRight, X } from 'lucide-react';
import { API_URL } from '../../config';

export default function LoginPage() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: employeeId, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Authentication failed.');
      }

      // Restrict web panel to SUPER_ADMIN and ADMIN roles
      if (data.user.role !== 'SUPER_ADMIN' && data.user.role !== 'ADMIN') {
        throw new Error('Access denied. Administrator privileges required.');
      }

      // Clear any potential stale state
      localStorage.clear();

      // Store tokens and details
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('user', JSON.stringify(data.user));

      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Connecting to server failed.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[450px] h-[450px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Glass login Container */}
      <div className="w-full max-w-md glass-panel rounded-2xl border border-slate-800 shadow-glass-shadow p-8 z-10 animate-fade-in">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center shadow-neon-glow mb-4">
            <Layers className="w-7 h-7 text-slate-950" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-wide">GAYTRI COMMERCIAL</h1>
          <p className="text-xs text-cyan-400 font-bold uppercase tracking-wider mt-1">Workforce & Attendance Portal</p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-450 text-xs text-center font-semibold whitespace-pre-line animate-pulse">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Employee ID Field */}
          <div>
            <label className="text-xs text-slate-200 font-bold uppercase tracking-wider block mb-2">Admin Email</label>
            <div className="relative">
              <ShieldCheck className="absolute left-3 top-3 w-5 h-5 text-slate-350" />
              <input
                type="email"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="email@example.com"
                className="w-full pl-10 pr-4 py-2.5 glass-input text-white text-sm"
                required
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs text-slate-200 font-bold uppercase tracking-wider block">Password</label>
              <button 
                type="button" 
                onClick={() => setShowForgotModal(true)}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold hover:underline bg-transparent border-0 cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 w-5 h-5 text-slate-355" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 glass-input text-white text-sm"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold flex items-center justify-center space-x-2 transition-all duration-300 shadow-neon-glow disabled:opacity-50 mt-6 text-sm"
          >
            <span>{loading ? 'Authenticating...' : 'Admin Sign In'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>

        <div className="mt-8 border-t border-slate-800/80 pt-4 text-center">
          <p className="text-xs text-slate-400 font-medium">
            Gaytri Commercial Workforce • Secure Authorization System v4.0
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-slate-800 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => setShowForgotModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-450 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400 shadow-neon-glow">
                <KeyRound className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Reset Account Password</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                For security compliance, password recovery must be initiated by a **Super Administrator** via the Manager Management panel.
              </p>
              <div className="pt-3 text-left bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-[10px] text-slate-450 leading-normal">
                <span className="font-semibold text-slate-200 block mb-0.5">Need assistance?</span>
                Contact your system supervisor or the primary Super Admin to reset your administrator credentials.
              </div>
              <button
                onClick={() => setShowForgotModal(false)}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-bold text-xs transition-all shadow-neon-glow"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
