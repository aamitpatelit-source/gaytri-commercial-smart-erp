"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, RefreshCw, AlertTriangle, Calendar, User, Info, Smartphone, Network } from 'lucide-react';
import { API_URL } from '../../config';

interface AuditLog {
  id: string;
  changed_at: string;
  old_status: string;
  new_status: string;
  old_remarks: string | null;
  new_remarks: string | null;
  reason: string;
  ip_address: string | null;
  device_id: string | null;
  employee_name: string;
  employee_id: string; // employee code
  changed_by_name: string | null;
}

export default function AuditLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
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

      const res = await fetch(`${API_URL}/attendance/audit-logs`, {
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
        setError(data.message || 'Failed to retrieve audit logs.');
      }
    } catch (err: any) {
      setError('Could not connect to server.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="space-y-8 text-slate-100 animate-fade-in">
      {/* Banner */}
      <div className="glass-panel p-6 rounded-xl flex items-center justify-between border-l-4 border-cyan-400 shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <span>Attendance Change Logs (Immutable)</span>
            <ShieldAlert className="w-5 h-5 text-cyan-400 animate-pulse" />
          </h2>
          <p className="text-sm text-slate-350 mt-1">
            System records of manual supervisor adjustments. These logs are write-once and cannot be modified or deleted.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-cyan-400 hover:border-cyan-400 text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Refreshing...' : 'Refresh Logs'}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-955/40 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
            Immutable Audit Trail ({logs.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs text-cyan-400 font-bold">Querying audit registers...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-semibold text-xs">
              No manual changes recorded in the system.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-200 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/30">
                  <th className="pb-3 pt-4 pl-6 w-[20%]">Timestamp</th>
                  <th className="pb-3 pt-4 w-[20%]">Employee</th>
                  <th className="pb-3 pt-4 w-[15%]">Status Transition</th>
                  <th className="pb-3 pt-4 w-[25%]">Adjustment Reason & Remarks</th>
                  <th className="pb-3 pt-4 w-[10%]">Changer</th>
                  <th className="pb-3 pt-4 pr-6 w-[10%]">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-350">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                    {/* Timestamp */}
                    <td className="py-4 pl-6">
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="font-mono text-slate-200">{formatDate(log.changed_at)}</span>
                      </div>
                    </td>

                    {/* Employee */}
                    <td className="py-4">
                      <div className="font-bold text-white text-sm">{log.employee_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">Code: {log.employee_id}</div>
                    </td>

                    {/* Transition */}
                    <td className="py-4">
                      <div className="flex items-center space-x-2">
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-950/40 text-slate-400 border border-slate-800">
                          {log.old_status || 'EMPTY'}
                        </span>
                        <span className="text-cyan-400 font-extrabold">&rarr;</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                          log.new_status === 'PRESENT'
                            ? 'bg-emerald-950/20 text-emerald-450 border-emerald-500/20'
                            : log.new_status === 'LATE'
                            ? 'bg-amber-955/20 text-amber-450 border-amber-500/20'
                            : log.new_status === 'LEAVE'
                            ? 'bg-blue-955/20 text-blue-450 border-blue-500/20'
                            : 'bg-rose-955/20 text-rose-455 border-rose-500/20'
                        }`}>
                          {log.new_status}
                        </span>
                      </div>
                    </td>

                    {/* Remarks & Reason */}
                    <td className="py-4 pr-4">
                      <div className="text-slate-100 font-semibold flex items-start space-x-1">
                        <Info className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" />
                        <span>{log.reason}</span>
                      </div>
                      <div className="text-[10.5px] text-slate-400 mt-1 italic">
                        Remarks: {log.new_remarks || 'None'}
                      </div>
                    </td>

                    {/* Changer */}
                    <td className="py-4">
                      <div className="flex items-center space-x-1 text-slate-200 font-semibold">
                        <User className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{log.changed_by_name || 'System / Seed'}</span>
                      </div>
                    </td>

                    {/* IP & Device */}
                    <td className="py-4 pr-6 font-mono text-[9.5px] text-slate-400 space-y-1">
                      <div className="flex items-center space-x-1">
                        <Network className="w-3 h-3 text-slate-500" />
                        <span>{log.ip_address || 'unknown-ip'}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Smartphone className="w-3 h-3 text-slate-500" />
                        <span className="truncate max-w-[80px]" title={log.device_id || ''}>
                          {log.device_id || 'web-admin'}
                        </span>
                      </div>
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
