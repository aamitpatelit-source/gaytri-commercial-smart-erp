"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Sparkles, 
  Clock, 
  TrendingUp, 
  PieChart as PieIcon, 
  Activity, 
  Briefcase, 
  ChevronRight, 
  AlertCircle,
  LogIn,
  LogOut,
  CalendarCheck,
  CheckCircle2
} from 'lucide-react';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';

import { API_URL } from '../config';

interface DashboardStats {
  totalStaff: number;
  totalEmployees: number;
  totalManagers: number;
  present: number;
  absent: number;
  working: number;
  missedCheckout: number;
  late: number;
  halfDay: number;
  leave: number;
  wfh: number;
  onDuty: number;
  todaysVisits: number;
  livePresentCount: number;
  lastCheckout: {
    full_name: string;
    check_out_time: string;
  } | null;
  firstCheckIn: {
    full_name: string;
    check_in_time: string;
  } | null;
  attendanceRate: number;
  onTimeRate: number;
  weeklyTrend: {
    date: string;
    present: number;
    absent: number;
  }[];
  distribution: {
    present: number;
    absent: number;
    working: number;
    missedCheckout: number;
  };
  operationalInsights: {
    firstCheckIn: { full_name: string; check_in_time: string } | null;
    lastCheckOut: { full_name: string; check_out_time: string } | null;
    currentlyWorking: number;
    attendanceRate: number;
    missedCheckoutCount: number;
  };
}

interface FeedItem {
  log_id: string;
  date: string;
  time: string;
  check_in_time: string | null;
  check_out: string | null;
  status: string;
  remarks: string | null;
  employee_uuid: string;
  full_name: string;
  employee_id: string;
  profile_photo_url: string | null;
  department: string | null;
  working_hours: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const formatTo12Hour = (timeStr: string | null) => {
    if (!timeStr) return '--:--';
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
      let hours = parseInt(parts[0], 10);
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

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setError('');

      const res = await fetch(`${API_URL}/attendance/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setFeed(data.feed || []);
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

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, [router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-cyan-400">Loading operations console...</p>
      </div>
    );
  }

  // Distribution Pie Data
  const dist = stats?.distribution || { present: 0, absent: 0, working: 0, missedCheckout: 0 };
  const pieData = [
    { name: 'Present', value: dist.present, color: '#10b981' },
    { name: 'Working', value: dist.working, color: '#38bdf8' },
    { name: 'Missed Checkout', value: dist.missedCheckout, color: '#f97316' },
    { name: 'Absent', value: dist.absent, color: '#f43f5e' }
  ].filter(d => d.value > 0);

  const totalDistCount = dist.present + dist.working + dist.missedCheckout + dist.absent;

  // Trend Data Empty Check
  const hasTrendData = stats?.weeklyTrend && stats.weeklyTrend.some(t => t.present > 0 || t.absent > 0);

  return (
    <div className="space-y-8 animate-fade-in text-slate-100 pb-12">
      
      {/* 1. Welcome Banner */}
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
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Top Summary Cards (Section 1) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Present Today */}
        <div className="glass-panel p-6 rounded-xl relative overflow-hidden shadow-[0_0_15px_rgba(16,185,129,0.06)] border border-slate-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Present Employees</p>
              <h3 className="text-3xl font-extrabold text-white mt-2 font-mono">{stats?.present || 0}</h3>
            </div>
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-750 text-emerald-400">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>
          <p className="text-[11px] text-emerald-400 mt-4 font-semibold">
            Active checked-in count ({stats?.working || 0} currently working)
          </p>
        </div>

        {/* Absent Today */}
        <div className="glass-panel p-6 rounded-xl relative overflow-hidden shadow-[0_0_15px_rgba(244,63,94,0.06)] border border-slate-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Absent Employees</p>
              <h3 className="text-3xl font-extrabold text-white mt-2 font-mono">{stats?.absent || 0}</h3>
            </div>
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-750 text-rose-400">
              <UserX className="w-6 h-6" />
            </div>
          </div>
          <p className="text-[11px] text-rose-400 mt-4 font-semibold">
            Unmarked or absent on shift roster ({stats?.missedCheckout || 0} missed EOD checkout)
          </p>
        </div>

        {/* Last Checkout Today */}
        <div className="glass-panel p-6 rounded-xl relative overflow-hidden shadow-[0_0_15px_rgba(245,158,11,0.06)] border border-slate-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Last Checkout</p>
              {stats?.lastCheckout ? (
                <>
                  <h4 className="text-lg font-bold text-slate-200 mt-2 truncate max-w-[190px]">{stats.lastCheckout.full_name}</h4>
                  <p className="text-xl font-extrabold text-amber-400 font-mono mt-0.5">{formatTo12Hour(stats.lastCheckout.check_out_time)}</p>
                </>
              ) : (
                <h3 className="text-xl font-bold text-slate-500 mt-3 italic font-sans">No checkouts yet</h3>
              )}
            </div>
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-750 text-amber-400">
              <Clock className="w-6 h-6" />
            </div>
          </div>
          <p className="text-[11px] text-amber-400 mt-4 font-semibold">Latest EOD sync checkout</p>
        </div>
      </div>

      {/* Charts Grid: Weekly Trend & Attendance Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Section 2: Weekly Attendance Trend Line Chart (2 Cols) */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-xl border border-slate-800 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="font-bold text-white text-base flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
                <span>Weekly Attendance Trend (Last 7 Days)</span>
              </h3>
              <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">Line Chart</span>
            </div>

            {hasTrendData ? (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats?.weeklyTrend || []} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                    <XAxis 
                      dataKey="date" 
                      stroke="#64748b" 
                      fontSize={10} 
                      tickLine={false}
                      tickFormatter={(val) => val.split('-').slice(1).join('/')}
                    />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.5rem', fontSize: '11px' }}
                      labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Line type="monotone" dataKey="present" name="Present" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="absent" name="Absent" stroke="#f43f5e" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center space-y-2 text-slate-500 border border-dashed border-slate-800/80 rounded-xl bg-slate-950/20">
                <TrendingUp className="w-8 h-8 text-slate-600" />
                <p className="text-xs font-bold">No attendance data available.</p>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Attendance Distribution Donut Chart (1 Col) */}
        <div className="glass-panel p-6 rounded-xl border border-slate-800 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="font-bold text-white text-base flex items-center space-x-2">
                <PieIcon className="w-5 h-5 text-cyan-400" />
                <span>Today's Distribution</span>
              </h3>
              <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">Donut</span>
            </div>

            {totalDistCount > 0 && pieData.length > 0 ? (
              <div className="h-64 w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.5rem', fontSize: '11px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center text badge */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-extrabold text-white font-mono">{stats?.present || 0}</span>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Present</span>
                </div>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center space-y-2 text-slate-500 border border-dashed border-slate-800/80 rounded-xl bg-slate-950/20">
                <PieIcon className="w-8 h-8 text-slate-600" />
                <p className="text-xs font-bold">No attendance recorded today.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 5: Quick Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-slate-800 text-center">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Employees</p>
          <h4 className="text-2xl font-extrabold text-white mt-2 font-mono">{stats?.totalStaff || 0}</h4>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-slate-800 text-center">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Present Today</p>
          <h4 className="text-2xl font-extrabold text-emerald-400 mt-2 font-mono">{stats?.present || 0}</h4>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-slate-800 text-center">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Absent Today</p>
          <h4 className="text-2xl font-extrabold text-rose-400 mt-2 font-mono">{stats?.absent || 0}</h4>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-slate-800 text-center">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Attendance Rate</p>
          <h4 className="text-2xl font-extrabold text-cyan-400 mt-2 font-mono">{stats?.attendanceRate || 0}%</h4>
        </div>
      </div>

      {/* Feed & Status Grid: Recent Activity (Section 4) & Status Overview (Section 6) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Section 4: Recent Attendance Activity */}
        <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden shadow-lg">
          <div className="p-4 border-b border-slate-800 bg-slate-950/30 flex items-center justify-between">
            <h3 className="font-bold text-white text-sm flex items-center space-x-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>Recent Attendance Activity</span>
            </h3>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Latest 5 Logs</span>
          </div>

          {feed.length === 0 ? (
            <div className="text-center py-12 text-slate-500 font-semibold text-xs border-b border-slate-850">
              No attendance activity yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-850/60">
              {feed.slice(0, 5).map((item) => (
                <div 
                  key={item.log_id || item.employee_id}
                  onClick={() => router.push(`/attendance/${item.employee_uuid}`)}
                  className="p-4 flex items-center justify-between hover:bg-slate-900/30 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center space-x-3">
                    {item.profile_photo_url ? (
                      <img 
                        src={item.profile_photo_url} 
                        alt={item.full_name} 
                        className="w-9 h-9 rounded-full border border-slate-700 object-cover" 
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-850 border border-slate-750 flex items-center justify-center font-bold text-cyan-400 text-xs">
                        {item.full_name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-slate-200 text-xs group-hover:text-cyan-400 transition-colors">{item.full_name}</h4>
                      <p className="text-[10px] text-slate-450 font-mono mt-0.5">{item.employee_id} • {item.department || 'General'}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-xs font-mono font-bold text-slate-200">
                        {item.check_out ? formatTo12Hour(item.check_out) : formatTo12Hour(item.check_in_time)}
                      </p>
                      <p className="text-[9px] text-slate-450 font-medium">
                        {item.check_out ? 'Check-Out' : 'Check-In'}
                      </p>
                    </div>

                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold ${
                      item.status === 'PRESENT' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' :
                      item.status === 'WORKING' ? 'bg-sky-950/40 text-sky-400 border border-sky-500/20' :
                      item.status === 'LATE' ? 'bg-amber-950/40 text-amber-400 border border-amber-500/20' :
                      'bg-rose-950/40 text-rose-400 border border-rose-500/20'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 6: Employee Status Overview */}
        <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden shadow-lg flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-slate-800 bg-slate-950/30 flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-cyan-400" />
                <span>Employee Status Overview</span>
              </h3>
              <button
                onClick={() => router.push('/attendance')}
                className="inline-flex items-center space-x-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <span>View All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {feed.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-semibold text-xs">
                No employees available.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/20">
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Check-In</th>
                      <th className="px-4 py-3">Check-Out</th>
                      <th className="px-4 py-3 text-right">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/50">
                    {feed.slice(0, 5).map((item) => (
                      <tr 
                        key={item.log_id || item.employee_id}
                        onClick={() => router.push(`/attendance/${item.employee_uuid}`)}
                        className="hover:bg-slate-900/30 transition-colors cursor-pointer group"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors">
                          {item.full_name}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold ${
                            item.status === 'PRESENT' ? 'text-emerald-400' :
                            item.status === 'WORKING' ? 'text-sky-400' :
                            item.status === 'LATE' ? 'text-amber-400' : 'text-rose-400'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300">{formatTo12Hour(item.check_in_time)}</td>
                        <td className="px-4 py-3 font-mono text-slate-300">{formatTo12Hour(item.check_out)}</td>
                        <td className="px-4 py-3 font-mono text-cyan-400 font-bold text-right">{item.working_hours || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ⭐ Today's Operational Insights (Bottom Section) */}
      <div className="glass-panel p-6 rounded-xl border border-slate-800 shadow-lg space-y-4">
        <h3 className="font-bold text-white text-sm border-b border-slate-800 pb-3 flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Today's Operational Insights</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
          {/* First Check-In */}
          <div className="bg-slate-950/40 p-4 border border-slate-800 rounded-lg flex items-center space-x-3">
            <div className="p-2.5 rounded bg-slate-900 border border-slate-750 text-cyan-400 shrink-0">
              <LogIn className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block">First Check-In</span>
              {stats?.operationalInsights?.firstCheckIn ? (
                <>
                  <p className="font-bold text-slate-200 truncate max-w-[130px]">{stats.operationalInsights.firstCheckIn.full_name}</p>
                  <p className="font-mono text-cyan-400 font-bold text-[11px]">{formatTo12Hour(stats.operationalInsights.firstCheckIn.check_in_time)}</p>
                </>
              ) : (
                <p className="text-slate-500 italic">None logged</p>
              )}
            </div>
          </div>

          {/* Last Check-Out */}
          <div className="bg-slate-950/40 p-4 border border-slate-800 rounded-lg flex items-center space-x-3">
            <div className="p-2.5 rounded bg-slate-900 border border-slate-750 text-amber-400 shrink-0">
              <LogOut className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block">Last Check-Out</span>
              {stats?.operationalInsights?.lastCheckOut ? (
                <>
                  <p className="font-bold text-slate-200 truncate max-w-[130px]">{stats.operationalInsights.lastCheckOut.full_name}</p>
                  <p className="font-mono text-amber-400 font-bold text-[11px]">{formatTo12Hour(stats.operationalInsights.lastCheckOut.check_out_time)}</p>
                </>
              ) : (
                <p className="text-slate-500 italic">None logged</p>
              )}
            </div>
          </div>

          {/* Currently Working */}
          <div className="bg-slate-950/40 p-4 border border-slate-800 rounded-lg flex items-center space-x-3">
            <div className="p-2.5 rounded bg-slate-900 border border-slate-750 text-sky-400 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block">Active Working</span>
              <p className="font-mono text-sky-400 font-extrabold text-lg mt-0.5">{stats?.operationalInsights?.currentlyWorking || 0}</p>
            </div>
          </div>

          {/* Today's Attendance Rate */}
          <div className="bg-slate-950/40 p-4 border border-slate-800 rounded-lg flex items-center space-x-3">
            <div className="p-2.5 rounded bg-slate-900 border border-slate-750 text-emerald-400 shrink-0">
              <CalendarCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block">Attendance Ratio</span>
              <p className="font-mono text-emerald-400 font-extrabold text-lg mt-0.5">{stats?.operationalInsights?.attendanceRate || 0}%</p>
            </div>
          </div>

          {/* Missed Checkouts */}
          <div className="bg-slate-950/40 p-4 border border-slate-800 rounded-lg flex items-center space-x-3">
            <div className="p-2.5 rounded bg-slate-900 border border-slate-750 text-orange-400 shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block">Missed Checkout</span>
              <p className="font-mono text-orange-400 font-extrabold text-lg mt-0.5">{stats?.operationalInsights?.missedCheckoutCount || 0}</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
