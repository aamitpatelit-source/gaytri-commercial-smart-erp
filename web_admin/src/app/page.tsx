"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  UserCheck,
  UserX,
  Sparkles,
  MapPin,
  Clock,
  ArrowRight,
  UserPlus,
  Camera,
  History
} from 'lucide-react';

import { API_URL } from '../config';
interface Stats {
  totalStaff: number;
  present: number;
  absent: number;
}

interface ScanLog {
  check_in_time: string;
  check_out: string | null;
  checkout_type: string | null;
  working_hours: string | null;
  status: string;
  full_name: string;
  employee_id: string;
  department: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ totalStaff: 0, present: 0, absent: 0 });
  const [logs, setLogs] = useState<ScanLog[]>([]);
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
          setLogs(data.feed || []);
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
          <p className="text-sm text-slate-350 mt-1">Real-time attendance dashboard active. System restricted to Admin controls.</p>
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
        {/* Total Employees */}
        <div className="glass-panel p-6 rounded-xl relative overflow-hidden shadow-[0_0_15px_rgba(0,229,255,0.06)] border border-slate-700">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Total Registered Employees</p>
              <h3 className="text-3xl font-extrabold text-white mt-2 font-sans">{stats.totalStaff}</h3>
            </div>
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700 text-cyan-400">
              <Users className="w-6 h-6" />
            </div>
          </div>
          <p className="text-[11px] text-cyan-400 mt-4 font-semibold">Registered staff profile database</p>
        </div>

        {/* Present Today */}
        <div className="glass-panel p-6 rounded-xl relative overflow-hidden shadow-[0_0_15px_rgba(16,185,129,0.06)] border border-slate-700">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Present Today</p>
              <h3 className="text-3xl font-extrabold text-white mt-2 font-sans">{stats.present}</h3>
            </div>
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700 text-emerald-400">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>
          <p className="text-[11px] text-emerald-400 mt-4 font-semibold">
            {stats.totalStaff > 0 ? ((stats.present / stats.totalStaff) * 100).toFixed(1) : 0}% Attendance Rate
          </p>
        </div>

        {/* Absent Today */}
        <div className="glass-panel p-6 rounded-xl relative overflow-hidden shadow-[0_0_15px_rgba(244,63,94,0.06)] border border-slate-700">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Absent Today</p>
              <h3 className="text-3xl font-extrabold text-white mt-2 font-sans">{stats.absent}</h3>
            </div>
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700 text-rose-450">
              <UserX className="w-6 h-6" />
            </div>
          </div>
          <p className="text-[11px] text-rose-400 mt-4 font-semibold">Unchecked roster profiles</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions Panel */}
        <div className="glass-panel p-6 rounded-xl border border-slate-700 flex flex-col justify-between h-full">
          <div>
            <h3 className="font-bold text-white text-base">Quick Action Console</h3>
            <p className="text-xs text-slate-350 mt-1">Roster updates and profile registers</p>
          </div>

          <div className="space-y-3 my-6">
            <button
              onClick={() => router.push('/employees')}
              className="w-full flex items-center justify-between p-4 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-cyan-500/30 text-slate-200 hover:text-white transition-all text-xs font-bold group"
            >
              <div className="flex items-center space-x-3">
                <UserPlus className="w-5 h-5 text-cyan-400" />
                <span>Onboard Employee</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => router.push('/employees')}
              className="w-full flex items-center justify-between p-4 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-cyan-500/30 text-slate-200 hover:text-white transition-all text-xs font-bold group"
            >
              <div className="flex items-center space-x-3">
                <Camera className="w-5 h-5 text-emerald-450" />
                <span>Register Face Signature</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-450 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => router.push('/attendance')}
              className="w-full flex items-center justify-between p-4 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-cyan-500/30 text-slate-200 hover:text-white transition-all text-xs font-bold group"
            >
              <div className="flex items-center space-x-3">
                <History className="w-5 h-5 text-amber-500" />
                <span>View Full Roster Logs</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
            </button>
          </div>

          <div className="p-3 rounded-lg bg-cyan-950/20 border border-cyan-500/10 flex items-center justify-between text-[11px] font-semibold text-slate-300">
            <span>Operational Mode:</span>
            <span className="font-extrabold text-cyan-400">ACTIVE MVP</span>
          </div>
        </div>

        {/* Recent Attendance Logs */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-xl border border-slate-700">
          <div className="flex items-center space-x-2 border-b border-slate-850 pb-4 mb-4">
            <Clock className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-base">Recent Check-In Activity</h3>
          </div>

          <div className="overflow-x-auto">
            {logs.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-semibold text-xs">
                No check-in actions recorded yet today.
              </div>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-350 text-[10px] font-extrabold uppercase tracking-wider">
                    <th className="pb-3 pt-2">Employee</th>
                    <th className="pb-3 pt-2">Department</th>
                    <th className="pb-3 pt-2">Check-In</th>
                    <th className="pb-3 pt-2">Check-Out</th>
                    <th className="pb-3 pt-2">Hours</th>
                    <th className="pb-3 pt-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850/50 text-xs">
                  {logs.map((log, index) => (
                    <tr key={index} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3.5 flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-cyan-400">
                          {log.full_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-200">{log.full_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{log.employee_id}</p>
                        </div>
                      </td>
                      <td className="py-3.5 font-semibold text-slate-300">{log.department}</td>
                      <td className="py-3.5 font-mono text-slate-350">{formatTo12Hour(log.check_in_time)}</td>
                      <td className="py-3.5 font-mono text-slate-350">
                        {log.check_out ? (
                          <span className="font-bold text-cyan-400">{formatTo12Hour(log.check_out)}</span>
                        ) : (
                          <span className="text-slate-500 font-medium italic">Active</span>
                        )}
                      </td>
                      <td className="py-3.5 font-mono text-slate-350">{log.working_hours || '-'}</td>
                      <td className="py-3.5">
                        <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          log.status === 'PRESENT'
                            ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-950/30 text-amber-400 border border-amber-500/20'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'PRESENT' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          <span>{log.status}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
