"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Calendar, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Search, 
  Download, 
  Printer, 
  Edit3, 
  ChevronLeft, 
  ChevronRight,
  Clock,
  MapPin,
  X
} from 'lucide-react';

import { API_URL } from '../../config';

interface AttendanceLog {
  id: string;
  date: string;
  check_in_time: string;
  check_out: string | null;
  working_hours: string | null;
  status: string;
  gps_lat_in: number | null;
  gps_lng_in: number | null;
  gps_lat_out: number | null;
  gps_lng_out: number | null;
  device_name: string | null;
  network_type: string | null;
  battery_percentage: number | null;
  face_image_url: string | null;
  remarks: string | null;
  source: string;
  employee_uuid: string;
  full_name: string;
  employee_id: string;
  mobile: string;
  department: string;
  shift: string;
}

interface Manager {
  id: string;
  full_name: string;
  email: string;
}

interface Department {
  id: string;
  name: string;
}

export default function AttendanceLogsPage() {
  const router = useRouter();
  
  // Roster logs state
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState('');

  // Filters state
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [reportingManager, setReportingManager] = useState('');

  // Dropdown options state
  const [managers, setManagers] = useState<Manager[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Correction workflow modal state
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctingLog, setCorrectingLog] = useState<AttendanceLog | null>(null);
  const [corrStatus, setCorrStatus] = useState('');
  const [corrCheckIn, setCorrCheckIn] = useState('');
  const [corrCheckOut, setCorrCheckOut] = useState('');
  const [corrRemarks, setCorrRemarks] = useState('');
  const [corrReason, setCorrReason] = useState('');
  const [corrError, setCorrError] = useState('');
  const [corrSubmitting, setCorrSubmitting] = useState(false);

  // Detail viewing modal state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLog, setDetailLog] = useState<AttendanceLog | null>(null);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  };

  const formatTo12Hour = (timeStr: string) => {
    if (!timeStr) return '--:--';
    try {
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

  // Fetch filter options: departments and managers
  const fetchFilterData = async (token: string) => {
    try {
      // Fetch departments
      const deptRes = await fetch(`${API_URL}/company/departments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (deptRes.ok) {
        const deptData = await deptRes.json();
        if (deptData.success) setDepartments(deptData.departments || []);
      }

      // Fetch managers
      const mgrRes = await fetch(`${API_URL}/auth/managers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (mgrRes.ok) {
        const mgrData = await mgrRes.json();
        if (mgrData.success) setManagers(mgrData.managers || []);
      }
    } catch (err) {
      console.error('[Logs Toolbar] Failed to fetch filter lists:', err);
    }
  };

  const fetchLogs = async (currentPage = page, isRefresh = false) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      if (!isRefresh) setLoading(true);
      setError('');
      
      // Build query string params
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: limit.toString(),
        search: search.trim(),
        start_date: startDate,
        end_date: endDate,
        status: status,
        department_id: departmentId,
        reporting_manager: reportingManager
      });

      const res = await fetch(`${API_URL}/attendance/history?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned error status ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        if (data.pagination) {
          setTotalCount(data.pagination.totalCount);
          setTotalPages(data.pagination.totalPages);
        }
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
    const token = localStorage.getItem('access_token');
    const role = localStorage.getItem('user_role') || '';
    setUserRole(role);
    
    if (token) {
      fetchFilterData(token);
    }
    fetchLogs(1);

    // Smart Polling fallback (30 seconds background sync)
    const pollInterval = setInterval(() => {
      fetchLogs(page, true);
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [page, status, departmentId, reportingManager]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setStatus('');
    setDepartmentId('');
    setReportingManager('');
    setPage(1);
    // Fetch directly to bypass standard hooks timing delay
    setTimeout(() => fetchLogs(1), 50);
  };

  // CSV Export helper
  const handleExportCSV = () => {
    if (logs.length === 0) return;
    
    const headers = [
      'Employee Name', 'Employee ID', 'Mobile', 'Department', 'Shift', 
      'Date', 'Check-In', 'Check-Out', 'Working Hours', 'Status', 
      'Source', 'Remarks'
    ];
    
    const csvRows = [headers.join(',')];
    
    logs.forEach(log => {
      const values = [
        `"${log.full_name}"`,
        `"${log.employee_id}"`,
        `"${log.mobile || ''}"`,
        `"${log.department}"`,
        `"${log.shift}"`,
        `"${log.date.split('T')[0]}"`,
        `"${log.check_in_time || ''}"`,
        `"${log.check_out || ''}"`,
        `"${log.working_hours || ''}"`,
        `"${log.status}"`,
        `"${log.source}"`,
        `"${log.remarks || ''}"`
      ];
      csvRows.push(values.join(','));
    });
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Gaytri_Attendance_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Open correction modal
  const openCorrectionModal = (log: AttendanceLog) => {
    setCorrectingLog(log);
    setCorrStatus(log.status);
    setCorrCheckIn(log.check_in_time ? log.check_in_time.substring(0, 5) : '');
    setCorrCheckOut(log.check_out ? log.check_out.substring(0, 5) : '');
    setCorrRemarks(log.remarks || '');
    setCorrReason('');
    setCorrError('');
    setCorrectionOpen(true);
  };

  // Submit corrected attendance details
  const submitCorrection = async () => {
    if (!correctingLog) return;
    if (!corrReason || corrReason.trim() === '') {
      setCorrError('A correction audit reason is mandatory.');
      return;
    }

    try {
      setCorrSubmitting(true);
      setCorrError('');
      const token = localStorage.getItem('access_token');
      
      const res = await fetch(`${API_URL}/attendance/correct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          employee_id: correctingLog.employee_uuid,
          date: correctingLog.date.split('T')[0],
          status: corrStatus,
          check_in_time: corrCheckIn ? `${corrCheckIn}:00` : null,
          check_out_time: corrCheckOut ? `${corrCheckOut}:00` : null,
          remarks: corrRemarks,
          reason: corrReason
        })
      });

      const data = await res.json();
      if (data.success) {
        setCorrectionOpen(false);
        fetchLogs(page, true);
      } else {
        setCorrError(data.message || 'Correction submission failed.');
      }
    } catch (err: any) {
      setCorrError('Error contacting the server.');
    } finally {
      setCorrSubmitting(false);
    }
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
          th, td { border: 1px solid #ddd !important; padding: 8px !important; color: black !important; font-size: 10pt !important; }
          .print-title { display: block !important; margin-bottom: 20px !important; color: black !important; }
        }
      `}</style>

      <div className="print-title hidden text-black text-center font-bold text-xl">
        Gaytri Commercial - Today's Attendance Roster Report ({new Date().toISOString().split('T')[0]})
      </div>

      {/* Advanced Toolbar Filters */}
      <div className="glass-panel p-6 rounded-xl border border-slate-700 space-y-4 no-print shadow-md">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-white text-sm flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <span>Search & Filter Attendance Registers</span>
          </h3>
          <button 
            onClick={handleResetFilters}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-bold transition-colors"
          >
            Reset Filters
          </button>
        </div>

        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Employee Search */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee Info</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search by Name, ID, Mobile..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-slate-550 outline-none transition-all"
              />
            </div>
          </div>

          {/* Department Filter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 px-3 text-xs text-white outline-none transition-all"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>

          {/* Reporting Manager Filter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reporting Manager</label>
            <select
              value={reportingManager}
              onChange={(e) => setReportingManager(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 px-3 text-xs text-white outline-none transition-all"
            >
              <option value="">All Managers</option>
              {managers.map((mgr) => (
                <option key={mgr.id} value={mgr.id}>{mgr.full_name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 px-3 text-xs text-white outline-none transition-all"
            >
              <option value="">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="WORKING">Working (Active)</option>
              <option value="LATE">Late</option>
              <option value="ABSENT">Absent</option>
              <option value="MISSED_CHECKOUT">Missed Checkout</option>
              <option value="HALF_DAY">Half Day</option>
              <option value="LEAVE">Leave</option>
              <option value="WORK_FROM_HOME">Work from Home</option>
              <option value="ON_DUTY">On Duty</option>
            </select>
          </div>

          {/* Custom Date Range */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 px-3 text-xs text-white outline-none transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 px-3 text-xs text-white outline-none transition-all"
            />
          </div>

          <div className="lg:col-span-2 flex items-end gap-3">
            <button
              type="submit"
              className="flex-1 bg-cyan-550 hover:bg-cyan-600 text-slate-900 py-2 rounded-lg text-xs font-bold transition-all shadow-md"
            >
              Apply Filter Query
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={logs.length === 0}
              className="px-3.5 py-2 bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 disabled:opacity-50"
              title="Export to CSV"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={logs.length === 0}
              className="px-3.5 py-2 bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 disabled:opacity-50"
              title="Print Roster List"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-350 text-xs font-semibold no-print">
          {error}
        </div>
      )}

      {/* Database History Table */}
      <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between no-print">
          <span className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
            Attendance Logs Ledger ({totalCount} records found)
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => fetchLogs(page, true)}
              disabled={loading}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-cyan-450 hover:border-cyan-450 transition-all disabled:opacity-50"
              title="Reload logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading && logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs text-cyan-400 font-bold">Querying attendance registers...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-semibold text-xs">
              No attendance logs found in database matching selection filters.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-200 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/30">
                  <th className="pb-3 pt-4 pl-6 w-[20%]">Employee</th>
                  <th className="pb-3 pt-4 w-[16%]">Dept & Manager</th>
                  <th className="pb-3 pt-4 w-[12%]">Date</th>
                  <th className="pb-3 pt-4 w-[10%]">Check-In</th>
                  <th className="pb-3 pt-4 w-[10%]">Check-Out</th>
                  <th className="pb-3 pt-4 w-[8%]">Hours</th>
                  <th className="pb-3 pt-4 text-center w-[12%]">Status</th>
                  <th className="pb-3 pt-4 pr-6 text-right w-[12%] no-print">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-350">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                    {/* Employee Profile Click leads to Profile calendar */}
                    <td className="py-4 pl-6">
                      <div 
                        onClick={() => router.push(`/attendance/employee/${log.employee_uuid || log.id}`)}
                        className="flex items-center space-x-3 cursor-pointer group"
                      >
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-cyan-400 group-hover:border-cyan-450 transition-all">
                          {log.full_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm group-hover:text-cyan-400 transition-colors">{log.full_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{log.employee_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <p className="font-semibold text-slate-200">{log.department}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{log.shift}</p>
                    </td>
                    <td className="py-4 text-slate-300 font-medium">{formatDate(log.date)}</td>
                    <td className="py-4 font-mono text-slate-100 font-bold">{formatTo12Hour(log.check_in_time)}</td>
                    <td className="py-4 font-mono text-slate-100">
                      {log.check_out ? (
                        <span className="font-bold text-cyan-400">{formatTo12Hour(log.check_out)}</span>
                      ) : log.status === 'WORKING' ? (
                        <span className="text-sky-400 font-semibold italic bg-sky-950/20 border border-sky-500/10 px-2 py-0.5 rounded text-[10px]">Working</span>
                      ) : (
                        <span className="text-slate-500">--</span>
                      )}
                    </td>
                    <td className="py-4 font-mono text-cyan-400 font-bold">{log.working_hours || '-'}</td>
                    <td className="py-4 text-center">
                      <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        log.status === 'PRESENT'
                          ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/20'
                          : log.status === 'WORKING'
                          ? 'bg-sky-950/30 text-sky-400 border border-sky-500/20'
                          : log.status === 'LATE'
                          ? 'bg-amber-950/30 text-amber-400 border border-amber-500/20'
                          : 'bg-rose-950/30 text-rose-450 border border-rose-500/20'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          log.status === 'PRESENT' ? 'bg-emerald-450' : 
                          log.status === 'WORKING' ? 'bg-sky-450' : 
                          log.status === 'LATE' ? 'bg-amber-450' : 'bg-rose-550'
                        }`} />
                        <span>{log.status}</span>
                      </span>
                    </td>
                    <td className="py-4 pr-6 text-right space-x-2 no-print">
                      <button
                        onClick={() => {
                          setDetailLog(log);
                          setDetailOpen(true);
                        }}
                        className="px-2.5 py-1 text-[10px] bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-slate-300 rounded font-bold transition-all"
                      >
                        Info
                      </button>
                      {(userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') && (
                        <button
                          onClick={() => openCorrectionModal(log)}
                          className="px-2.5 py-1 text-[10px] bg-cyan-950/30 border border-cyan-800 hover:border-cyan-400 text-cyan-400 rounded font-bold transition-all"
                          title="Correct attendance record"
                        >
                          Correct
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Toolbar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/30 flex items-center justify-between no-print text-xs">
            <span className="text-slate-400">
              Showing page <strong className="text-slate-200">{page}</strong> of <strong className="text-slate-200">{totalPages}</strong> ({totalCount} total logs)
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:border-cyan-500/35 transition-all disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:border-cyan-500/35 transition-all disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CORRECTION DIALOG MODAL */}
      {correctionOpen && correctingLog && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel border border-slate-700 rounded-xl max-w-md w-full overflow-hidden shadow-2xl animate-scale-up">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
              <h3 className="font-bold text-white text-sm flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-cyan-400" />
                <span>Correct Roster Log: {correctingLog.full_name}</span>
              </h3>
              <button onClick={() => setCorrectionOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {corrError && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/30 text-rose-350 rounded font-semibold">
                  {corrError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-450 font-bold uppercase">Date</label>
                  <input
                    type="text"
                    value={correctingLog.date.split('T')[0]}
                    disabled
                    className="w-full bg-slate-950 border border-slate-800 text-slate-500 py-2 px-3 rounded outline-none cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-450 font-bold uppercase">Status</label>
                  <select
                    value={corrStatus}
                    onChange={(e) => setCorrStatus(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-white py-2 px-2.5 rounded outline-none focus:border-cyan-500/35"
                  >
                    <option value="PRESENT">Present</option>
                    <option value="WORKING">Working (Active)</option>
                    <option value="LATE">Late</option>
                    <option value="ABSENT">Absent</option>
                    <option value="MISSED_CHECKOUT">Missed Checkout</option>
                    <option value="HALF_DAY">Half Day</option>
                    <option value="LEAVE">Leave</option>
                    <option value="WORK_FROM_HOME">Work from Home</option>
                    <option value="ON_DUTY">On Duty</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-450 font-bold uppercase">Check-In Time</label>
                  <input
                    type="time"
                    value={corrCheckIn}
                    onChange={(e) => setCorrCheckIn(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-white py-2 px-3 rounded outline-none focus:border-cyan-500/35 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-450 font-bold uppercase">Check-Out Time</label>
                  <input
                    type="time"
                    value={corrCheckOut}
                    onChange={(e) => setCorrCheckOut(e.target.value)}
                    disabled={corrStatus === 'WORKING'}
                    className="w-full bg-slate-900 border border-slate-800 text-white py-2 px-3 rounded outline-none focus:border-cyan-500/35 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-450 font-bold uppercase">Public Shift Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Cleared client visit logs"
                  value={corrRemarks}
                  onChange={(e) => setCorrRemarks(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-white py-2 px-3 rounded outline-none focus:border-cyan-500/35"
                />
              </div>

              {/* Correction workflow reason prompt (mandatory audit logs requirement) */}
              <div className="space-y-1">
                <label className="text-[10px] text-cyan-400 font-bold uppercase flex items-center space-x-1">
                  <AlertCircle className="w-3 h-3 text-cyan-400" />
                  <span>Mandatory Audit Edit Reason</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="State the legitimate reason for this attendance edit (saved in immutable audits)..."
                  value={corrReason}
                  onChange={(e) => setCorrReason(e.target.value)}
                  className="w-full bg-slate-900 border border-cyan-950 focus:border-cyan-500/35 text-white py-2 px-3 rounded outline-none placeholder-slate-550"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/30 flex justify-end space-x-2">
              <button
                onClick={() => setCorrectionOpen(false)}
                className="px-4 py-2 rounded bg-slate-900 border border-slate-800 text-slate-350 hover:text-white text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={submitCorrection}
                disabled={corrSubmitting}
                className="px-4 py-2 rounded bg-cyan-550 hover:bg-cyan-600 text-slate-900 text-xs font-bold transition-all disabled:opacity-50"
              >
                {corrSubmitting ? 'Saving...' : 'Commit Correction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL AUDIT DIALOG MODAL */}
      {detailOpen && detailLog && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel border border-slate-700 rounded-xl max-w-md w-full overflow-hidden shadow-2xl animate-scale-up">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
              <h3 className="font-bold text-white text-sm flex items-center space-x-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>Attendance Audit Details</span>
              </h3>
              <button onClick={() => setDetailOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="flex items-center space-x-4 border-b border-slate-850 pb-4">
                <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-cyan-400 text-lg">
                  {detailLog.full_name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">{detailLog.full_name}</h4>
                  <p className="text-slate-400 font-mono mt-0.5">{detailLog.employee_id}</p>
                  <p className="text-[10px] text-cyan-400 font-bold uppercase mt-1">{detailLog.department}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Check-In</p>
                  <p className="text-slate-200 mt-0.5 font-mono">{formatTo12Hour(detailLog.check_in_time)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Check-Out</p>
                  <p className="text-slate-200 mt-0.5 font-mono">{detailLog.check_out ? formatTo12Hour(detailLog.check_out) : '--:--'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Working Hours</p>
                  <p className="text-slate-200 mt-0.5 font-mono">{detailLog.working_hours || '--'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Source Channel</p>
                  <p className="text-slate-200 mt-0.5 font-semibold text-cyan-455">{detailLog.source}</p>
                </div>
              </div>

              {/* Device and network audit context */}
              <div className="border-t border-slate-850 pt-4 space-y-2">
                <h5 className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Device & Sync Context</h5>
                
                {detailLog.device_name || detailLog.network_type || detailLog.battery_percentage !== null ? (
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 bg-slate-950/40 p-3 border border-slate-850 rounded">
                    <div>
                      <p className="text-[10px] text-slate-500">Device Name</p>
                      <p className="text-slate-350 truncate">{detailLog.device_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Network connection</p>
                      <p className="text-slate-350">{detailLog.network_type || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Battery Level</p>
                      <p className="text-slate-350">{detailLog.battery_percentage !== null ? `${detailLog.battery_percentage}%` : 'N/A'}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 italic">No mobile telemetry data sync logged (manual mark).</p>
                )}
              </div>

              {/* GPS audit trail */}
              <div className="space-y-2">
                <h5 className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">GPS Coordinates Verification</h5>
                
                {detailLog.gps_lat_in || detailLog.gps_lat_out ? (
                  <div className="space-y-2 bg-slate-950/40 p-3 border border-slate-850 rounded">
                    {detailLog.gps_lat_in && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center space-x-1">
                          <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Check-In Location:</span>
                        </span>
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${detailLog.gps_lat_in},${detailLog.gps_lng_in}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-cyan-400 hover:underline"
                        >
                          {detailLog.gps_lat_in.toFixed(5)}, {detailLog.gps_lng_in?.toFixed(5)}
                        </a>
                      </div>
                    )}
                    {detailLog.gps_lat_out && (
                      <div className="flex items-center justify-between border-t border-slate-900 pt-2">
                        <span className="text-slate-400 flex items-center space-x-1">
                          <MapPin className="w-3.5 h-3.5 text-amber-450" />
                          <span>Check-Out Location:</span>
                        </span>
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${detailLog.gps_lat_out},${detailLog.gps_lng_out}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-amber-450 hover:underline"
                        >
                          {detailLog.gps_lat_out.toFixed(5)}, {detailLog.gps_lng_out?.toFixed(5)}
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 italic">No GPS coordinates sync log.</p>
                )}
              </div>

              {detailLog.remarks && (
                <div className="border-t border-slate-850 pt-4">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Remarks</p>
                  <p className="text-slate-300 mt-1 italic">"{detailLog.remarks}"</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/30 flex justify-end">
              <button
                onClick={() => setDetailOpen(false)}
                className="px-4 py-2 rounded bg-cyan-550 hover:bg-cyan-600 text-slate-900 text-xs font-bold transition-all"
              >
                Close Audit panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
