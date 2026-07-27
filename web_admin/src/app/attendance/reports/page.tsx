"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FileSpreadsheet, 
  Download, 
  Printer, 
  Calendar, 
  Search, 
  RefreshCw, 
  BarChart,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

import { API_URL } from '../../../config';

interface ReportRow {
  employee_id: string;
  full_name: string;
  department: string;
  shift: string;
  date: string;
  check_in_time: string;
  check_out: string | null;
  working_hours: string | null;
  status: string;
  remarks: string | null;
}

interface Manager {
  id: string;
  full_name: string;
}

interface Department {
  id: string;
  name: string;
}

export default function ReportsPage() {
  const router = useRouter();

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // Default to start of month
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [reportingManager, setReportingManager] = useState('');

  const [departments, setDepartments] = useState<Department[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Summary Metrics
  const [summary, setSummary] = useState({
    totalRows: 0,
    presentCount: 0,
    lateCount: 0,
    missedCheckouts: 0,
    absentCount: 0
  });

  const fetchFilterData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const deptRes = await fetch(`${API_URL}/company/departments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (deptRes.ok) {
        const d = await deptRes.json();
        setDepartments(d.departments || []);
      }

      const mgrRes = await fetch(`${API_URL}/auth/managers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (mgrRes.ok) {
        const m = await mgrRes.json();
        setManagers(m.managers || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        status: status,
        department_id: departmentId,
        reporting_manager: reportingManager,
        limit: '1000' // High limit for report compilation
      });

      const res = await fetch(`${API_URL}/attendance/history?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        const rows: ReportRow[] = data.logs || [];
        setReportData(rows);

        // Aggregate summary metrics
        let present = 0;
        let late = 0;
        let missed = 0;
        let absent = 0;

        rows.forEach(r => {
          if (r.status === 'PRESENT') present++;
          if (r.status === 'LATE') {
            present++;
            late++;
          }
          if (r.status === 'MISSED_CHECKOUT') missed++;
          if (r.status === 'ABSENT') absent++;
        });

        setSummary({
          totalRows: rows.length,
          presentCount: present,
          lateCount: late,
          missedCheckouts: missed,
          absentCount: absent
        });
      } else {
        setError(data.message || 'Report generation failed.');
      }
    } catch (err: any) {
      setError('Connection to server lost. Please retry.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFilterData();
  }, []);

  const handleExportCSV = () => {
    if (reportData.length === 0) return;
    
    const headers = [
      'Employee Name', 'Employee ID', 'Department', 'Shift', 
      'Date', 'Check-In Time', 'Check-Out Time', 'Hours Worked', 'Status', 'Remarks'
    ];
    
    const csvContent = [
      headers.join(','),
      ...reportData.map(r => [
        `"${r.full_name}"`,
        `"${r.employee_id}"`,
        `"${r.department}"`,
        `"${r.shift}"`,
        `"${r.date.split('T')[0]}"`,
        `"${r.check_in_time || ''}"`,
        `"${r.check_out || ''}"`,
        `"${r.working_hours || ''}"`,
        `"${r.status}"`,
        `"${r.remarks || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Gaytri_ERP_Attendance_Report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-fade-in text-slate-100">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, html, main { background: white !important; color: black !important; padding: 0 !important; margin: 0 !important; }
          .glass-panel { border: none !important; background: transparent !important; box-shadow: none !important; }
          tr { page-break-inside: avoid; }
          table { border-collapse: collapse !important; width: 100% !important; }
          th, td { border: 1px solid #ddd !important; padding: 8px !important; color: black !important; font-size: 9pt !important; }
          .print-title { display: block !important; margin-bottom: 20px !important; color: black !important; }
        }
      `}</style>

      <div className="print-title hidden text-black text-center font-bold text-xl">
        Gaytri Commercial - Attendance Compilation Sheet ({startDate} to {endDate})
      </div>

      {/* FILTER PANEL */}
      <div className="glass-panel p-6 rounded-xl border border-slate-700 space-y-4 no-print shadow-md">
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
          <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
          <h3 className="font-bold text-white text-sm">Attendance Report Generator</h3>
        </div>

        <form onSubmit={handleGenerateReport} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-450 font-bold uppercase">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 px-3 text-xs text-white outline-none font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-455 font-bold uppercase">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 px-3 text-xs text-white outline-none font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-450 font-bold uppercase">Department</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 px-3 text-xs text-white outline-none"
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-450 font-bold uppercase">Reporting Manager</label>
            <select
              value={reportingManager}
              onChange={(e) => setReportingManager(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 px-3 text-xs text-white outline-none"
            >
              <option value="">All Managers</option>
              {managers.map(m => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-450 font-bold uppercase">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 px-3 text-xs text-white outline-none"
            >
              <option value="">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="WORKING">Working (Active)</option>
              <option value="LATE">Late</option>
              <option value="ABSENT">Absent</option>
              <option value="MISSED_CHECKOUT">Missed Checkout</option>
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-5 flex justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-cyan-550 hover:bg-cyan-600 text-slate-900 text-xs font-bold rounded-lg transition-all shadow-md flex items-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Compiling...</span>
                </>
              ) : (
                <>
                  <BarChart className="w-3.5 h-3.5" />
                  <span>Compile Report</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={reportData.length === 0}
              className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-cyan-405 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              disabled={reportData.length === 0}
              className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-cyan-405 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>Print Sheet</span>
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-955/30 border border-rose-500/30 text-rose-350 text-xs font-semibold no-print">
          {error}
        </div>
      )}

      {/* REPORT SUMMARY CARD */}
      {reportData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="glass-panel p-4 rounded-xl border border-slate-800 text-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Total Logs</span>
            <h4 className="text-xl font-extrabold mt-1 text-white font-mono">{summary.totalRows}</h4>
          </div>
          <div className="glass-panel p-4 rounded-xl border border-slate-800 text-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Presents</span>
            <h4 className="text-xl font-extrabold mt-1 text-emerald-400 font-mono">{summary.presentCount}</h4>
          </div>
          <div className="glass-panel p-4 rounded-xl border border-slate-800 text-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Lates</span>
            <h4 className="text-xl font-extrabold mt-1 text-amber-400 font-mono">{summary.lateCount}</h4>
          </div>
          <div className="glass-panel p-4 rounded-xl border border-slate-800 text-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Missed Checkouts</span>
            <h4 className="text-xl font-extrabold mt-1 text-rose-455 font-mono">{summary.missedCheckouts}</h4>
          </div>
          <div className="glass-panel p-4 rounded-xl border border-slate-800 text-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Absents</span>
            <h4 className="text-xl font-extrabold mt-1 text-rose-400 font-mono">{summary.absentCount}</h4>
          </div>
        </div>
      )}

      {/* REPORT TABLE */}
      {reportData.length > 0 && (
        <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-200 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/30">
                  <th className="pb-3 pt-4 pl-6">Employee</th>
                  <th className="pb-3 pt-4">Dept / Shift</th>
                  <th className="pb-3 pt-4">Date</th>
                  <th className="pb-3 pt-4 font-mono">In</th>
                  <th className="pb-3 pt-4 font-mono">Out</th>
                  <th className="pb-3 pt-4 font-mono">Hours</th>
                  <th className="pb-3 pt-4">Status</th>
                  <th className="pb-3 pt-4 pr-6">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-350">
                {reportData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                    <td className="py-3.5 pl-6">
                      <p className="font-bold text-white text-xs">{row.full_name}</p>
                      <p className="text-[9px] text-slate-500 font-mono">{row.employee_id}</p>
                    </td>
                    <td className="py-3.5">
                      <p className="font-semibold text-slate-200">{row.department}</p>
                      <p className="text-[9px] text-slate-500">{row.shift}</p>
                    </td>
                    <td className="py-3.5 font-medium text-slate-300">
                      {new Date(row.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-3.5 font-mono font-bold text-slate-100">
                      {row.check_in_time ? row.check_in_time.substring(0, 5) : '--:--'}
                    </td>
                    <td className="py-3.5 font-mono text-slate-100">
                      {row.check_out ? (
                        <span className="font-bold text-cyan-400">{row.check_out.substring(0, 5)}</span>
                      ) : row.status === 'WORKING' ? (
                        <span className="text-sky-400 font-semibold italic bg-sky-950/20 border border-sky-500/10 px-2 py-0.5 rounded text-[10px]">Working</span>
                      ) : (
                        <span className="text-slate-500">--</span>
                      )}
                    </td>
                    <td className="py-3.5 font-mono text-cyan-400 font-bold">{row.working_hours || '-'}</td>
                    <td className="py-3.5">
                      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[9px] font-bold ${
                        row.status === 'PRESENT'
                          ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/20'
                          : row.status === 'WORKING'
                          ? 'bg-sky-950/30 text-sky-400 border border-sky-500/20'
                          : row.status === 'LATE'
                          ? 'bg-amber-950/30 text-amber-400 border border-amber-500/20'
                          : 'bg-rose-955/30 text-rose-400 border border-rose-500/20'
                      }`}>
                        <span>{row.status}</span>
                      </span>
                    </td>
                    <td className="py-3.5 pr-6 italic text-slate-500 truncate max-w-[120px]" title={row.remarks || ''}>
                      {row.remarks || '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
