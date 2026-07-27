"use client";

import {
  Users,
  UserCheck,
  UserX,
  Sparkles,
  Clock
} from 'lucide-react';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { API_URL } from '../config';

interface Stats {
  totalStaff: number;
  present: number;
  absent: number;
  working?: number;
  missedCheckout?: number;
  lastCheckout: {
    full_name: string;
    check_out_time: string;
  } | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({
    totalStaff: 0,
    present: 0,
    absent: 0,
    lastCheckout: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const formatTo12Hour = (timeStr: string) => {
    if (!timeStr) return '';
    try {
      if (timeStr.includes('T') || timeStr.includes('-')) {
        const date = new Date(timeStr);
        return date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      }
      const parts = timeStr.split(':');
      if (parts.length < 2) return timeStr;
      let hours = parseInt(parts[0]);
      const minutes = parts[1];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const strHour = hours < 10 ? '0' + hours : hours;
      return `${strHour}:${minutes} ${ampm}`;
    } catch (e) {
      return timeStr;
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    const fetchDashboardData = async () => {
      try {
        setError('');
        const res = await fetch(`${API_URL}/attendance/dashboard`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (res.status === 401 || res.status === 403) {
          localStorage.clear();
          router.push('/login');
          return;
        }

        const data = await res.json();
        if (data.success) {
          setStats(data.stats);
        } else {
          setError(data.message || 'Failed to fetch operations data.');
        }
      } catch (err: any) {
        setError('Error connecting to backend database server.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
    
    // Polling setup: 30 seconds interval (Smart polling configuration)
    const pollInterval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(pollInterval);
  }, [router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-cyan-400">Loading operations console...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in text-slate-100">
      {/* Top Banner Greeting */}
      <div className="glass-panel p-6 rounded-xl flex items-center justify-between border-l-4 border-cyan-400 shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <span>Gaytri Commercial Operations Center</span>
            <Sparkles className="w-5 h-5 text-cyan-400" />
          </h2>
          <p className="text-sm text-slate-350 mt-1">Real-time enterprise management & attendance dashboard active.</p>
        </div>
        <div className="text-right hidden sm:block">
          <span className="text-xs text-slate-400 block font-semibold">Current System Date</span>
          <span className="text-sm text-cyan-400 font-extrabold font-mono tracking-wider">
            {new Date().toISOString().split('T')[0]}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Stats Cards Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Present Today */}
        <div className="glass-panel p-6 rounded-xl relative overflow-hidden shadow-[0_0_15px_rgba(16,185,129,0.06)] border border-slate-700">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Present Employees</p>
              <h3 className="text-3xl font-extrabold text-white mt-2 font-sans">{stats.present}</h3>
            </div>
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700 text-emerald-400">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>
          <p className="text-[11px] text-emerald-400 mt-4 font-semibold">
            Active checked-in count ({stats.working ?? 0} currently working)
          </p>
        </div>

        {/* Absent Today */}
        <div className="glass-panel p-6 rounded-xl relative overflow-hidden shadow-[0_0_15px_rgba(244,63,94,0.06)] border border-slate-700">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Absent Employees</p>
              <h3 className="text-3xl font-extrabold text-white mt-2 font-sans">{stats.absent}</h3>
            </div>
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700 text-rose-400">
              <UserX className="w-6 h-6" />
            </div>
          </div>
          <p className="text-[11px] text-rose-400 mt-4 font-semibold">
            Unmarked or absent on shift roster ({stats.missedCheckout ?? 0} missed EOD checkout)
          </p>
        </div>

        {/* Last Checkout Today */}
        <div className="glass-panel p-6 rounded-xl relative overflow-hidden shadow-[0_0_15px_rgba(245,158,11,0.06)] border border-slate-700">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Last Checkout</p>
              {stats.lastCheckout ? (
                <>
                  <h4 className="text-lg font-bold text-slate-200 mt-2 truncate max-w-[190px]">{stats.lastCheckout.full_name}</h4>
                  <p className="text-xl font-extrabold text-amber-400 font-mono mt-0.5">{formatTo12Hour(stats.lastCheckout.check_out_time)}</p>
                </>
              ) : (
                <h3 className="text-2xl font-bold text-slate-400 mt-3 italic font-sans">No checkouts yet</h3>
              )}
            </div>
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700 text-amber-450">
              <Clock className="w-6 h-6" />
            </div>
          </div>
          <p className="text-[11px] text-amber-400 mt-4 font-semibold">Latest EOD sync checkout</p>
        </div>
      </div>
    </div>
  );
}
