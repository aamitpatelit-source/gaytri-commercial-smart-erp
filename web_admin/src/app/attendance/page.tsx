"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Calendar, 
  MapPin, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertCircle 
} from 'lucide-react';

import { API_URL } from '../../config';

interface AttendanceLog {
  date: string;
  check_in_time: string;
  status: string;
  gps_lat: number | null;
  gps_lng: number | null;
  device_id: string | null;
  full_name: string;
  employee_id: string;
  department: string;
  shift: string;
}

export default function AttendanceLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'PRESENT' | 'LATE' | 'ABSENT'>('ALL');
  const [error, setError] = useState('');

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoading(true);
      setError('');
      
      const res = await fetch(`${API_URL}/attendance`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      } else {
        setError(data.message || 'Failed to retrieve logs.');
      }
    } catch (err) {
      setError('Error connecting to backend database server.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    if (selectedStatus === 'ALL') return true;
    return log.status === selectedStatus;
  });

  return (
    <div className="space-y-8 animate-fade-in text-slate-100">
      
      {/* Search Filter Header toolbar */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="flex space-x-2">
          {(['ALL', 'PRESENT', 'LATE', 'ABSENT'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                selectedStatus === status 
                  ? 'bg-slate-800 text-cyan-400 border-cyan-500/20 shadow-neon-glow' 
                  : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700 px-3 py-2 rounded-lg text-xs font-semibold">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-200">
              {new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
            </span>
          </div>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-cyan-400 hover:border-cyan-400 text-xs font-bold flex items-center space-x-2 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing...' : 'Refresh Logs'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-350 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Database History Table */}
      <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
            Attendance Logs History ({filteredLogs.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs text-cyan-400 font-bold">Querying attendance registers...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-semibold text-xs">
              No attendance logs found in database.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-200 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/30">
                  <th className="pb-3 pt-4 pl-6">Date</th>
                  <th className="pb-3 pt-4">Employee</th>
                  <th className="pb-3 pt-4">Department / Shift</th>
                  <th className="pb-3 pt-4">Check-In Time</th>
                  <th className="pb-3 pt-4">Device ID</th>
                  <th className="pb-3 pt-4">GPS Verification</th>
                  <th className="pb-3 pt-4 pr-6 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-350">
                {filteredLogs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                    <td className="py-4 pl-6 font-mono text-slate-300 font-semibold">
                      {new Date(log.date).toISOString().split('T')[0]}
                    </td>
                    <td className="py-4">
                      <p className="font-bold text-white text-sm">{log.full_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{log.employee_id}</p>
                    </td>
                    <td className="py-4">
                      <p className="font-semibold text-slate-200">{log.department}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{log.shift}</p>
                    </td>
                    <td className="py-4 font-mono text-slate-200 font-bold">{log.check_in_time}</td>
                    <td className="py-4 font-mono text-slate-300">{log.device_id || 'Unknown'}</td>
                    <td className="py-4 text-slate-300">
                      {log.gps_lat && log.gps_lng ? (
                        <a 
                          href={`https://www.google.com/maps?q=${log.gps_lat},${log.gps_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-1 hover:text-cyan-400 transition-colors cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400" />
                          <span className="font-mono text-xs">{log.gps_lat.toFixed(4)}, {log.gps_lng.toFixed(4)}</span>
                        </a>
                      ) : (
                        <span className="text-slate-500">None</span>
                      )}
                    </td>
                    <td className="py-4 pr-6 text-center">
                      <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        log.status === 'PRESENT'
                          ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/20'
                          : log.status === 'LATE'
                          ? 'bg-amber-950/30 text-amber-400 border border-amber-500/20'
                          : 'bg-rose-950/30 text-rose-400 border border-rose-500/20'
                      }`}>
                        {log.status === 'PRESENT' && <CheckCircle className="w-3 h-3 text-emerald-400" />}
                        {log.status === 'LATE' && <AlertCircle className="w-3 h-3 text-amber-400" />}
                        {log.status === 'ABSENT' && <XCircle className="w-3 h-3 text-rose-450" />}
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
  );
}
