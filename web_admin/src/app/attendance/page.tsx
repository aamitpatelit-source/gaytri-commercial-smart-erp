"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Calendar, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertCircle 
} from 'lucide-react';

import { API_URL } from '../../config';

interface AttendanceLog {
  date: string;
  check_in_time: string;
  check_out: string | null;
  checkout_type: string | null;
  working_hours: string | null;
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

  const formatDate = (dateStr: string, checkInTimeStr?: string) => {
    const sourceStr = checkInTimeStr || dateStr;
    if (!sourceStr) return '';
    try {
      const date = new Date(sourceStr);
      const options: Intl.DateTimeFormatOptions = {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata'
      };
      const formatter = new Intl.DateTimeFormat('en-US', options);
      const parts = formatter.formatToParts(date);
      const day = parts.find(p => p.type === 'day')?.value || '';
      const month = parts.find(p => p.type === 'month')?.value || '';
      const year = parts.find(p => p.type === 'year')?.value || '';
      return `${day} ${month} ${year}`;
    } catch (e) {
      return dateStr;
    }
  };

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

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoading(true);
      setError('');
      
      const res = await fetch(`${API_URL}/attendance/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned error status ${res.status}: ${res.statusText}`);
      }

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server returned an invalid non-JSON response.');
      }

      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      } else {
        setError(data.message || 'Failed to retrieve logs.');
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to backend database server.');
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
                  <th className="pb-3 pt-4 pl-6 w-[26%]">Employee</th>
                  <th className="pb-3 pt-4 w-[20%]">Department / Shift</th>
                  <th className="pb-3 pt-4 w-[14%]">Check-In</th>
                  <th className="pb-3 pt-4 w-[14%]">Check-Out</th>
                  <th className="pb-3 pt-4 w-[14%]">Hours</th>
                  <th className="pb-3 pt-4 pr-6 text-center w-[12%]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-350">
                {filteredLogs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                    <td className="py-4 pl-6">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-cyan-400">
                          {log.full_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm">{log.full_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{log.employee_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <p className="font-semibold text-slate-200">{log.department}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{log.shift}</p>
                    </td>
                    <td className="py-4 font-mono text-slate-100 font-bold">{formatTo12Hour(log.check_in_time)}</td>
                    <td className="py-4 font-mono text-slate-100">
                      {log.check_out ? (
                        <span className="font-bold text-cyan-400">{formatTo12Hour(log.check_out)}</span>
                      ) : (
                        <span className="text-amber-500 font-semibold italic bg-amber-950/20 border border-amber-500/10 px-2 py-0.5 rounded text-[10px]">On Duty</span>
                      )}
                    </td>
                    <td className="py-4 font-mono text-cyan-400 font-bold">{log.working_hours || '-'}</td>
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
