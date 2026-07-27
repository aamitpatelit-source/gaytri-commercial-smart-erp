"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, 
  Search, 
  ChevronRight, 
  RefreshCw, 
  UserCheck, 
  UserX, 
  Clock, 
  AlertCircle
} from 'lucide-react';

import { API_URL } from '../../config';

interface Employee {
  id: string;
  employee_id: string;
  full_name: string;
  mobile: string;
  joining_date: string;
  is_active: boolean;
  department: string;
  designation: string;
  shift: string;
  reporting_manager: string | null;
  profile_photo_url: string | null;
}

interface AttendanceStatus {
  employee_id: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  working_hours: string | null;
  date: string;
}

export default function EmployeeAttendanceDirectoryPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [lastAttendanceDates, setLastAttendanceDates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedShift, setSelectedShift] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [error, setError] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAttendanceData = async (isPoll = false) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      
      if (!isPoll) {
        if (employees.length === 0) setLoading(true);
        else setRefreshing(true);
      }
      setError('');

      // 1. Fetch employee directory
      const empRes = await fetch(`${API_URL}/employees`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (empRes.status === 401 || empRes.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      if (!empRes.ok) {
        throw new Error('Failed to retrieve employee directory');
      }

      const empData = await empRes.json();
      const empList: Employee[] = empData.employees || [];

      // 2. Fetch today's logs
      const todayStr = new Date().toISOString().split('T')[0];
      const todayRes = await fetch(`${API_URL}/attendance/history?start_date=${todayStr}&end_date=${todayStr}&limit=500`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const attMap: Record<string, AttendanceStatus> = {};
      if (todayRes.ok) {
        const todayData = await todayRes.json();
        const logs = todayData.logs || [];
        logs.forEach((log: any) => {
          attMap[log.employee_uuid || log.id] = {
            employee_id: log.employee_uuid || log.id,
            status: log.status,
            check_in_time: log.check_in_time,
            check_out_time: log.check_out,
            working_hours: log.working_hours,
            date: log.date
          };
        });
      }

      // 3. Fetch past logs to establish "Last Attendance Date"
      const lastMonth = new Date();
      lastMonth.setDate(lastMonth.getDate() - 30);
      const startHistStr = lastMonth.toISOString().split('T')[0];
      
      const histRes = await fetch(`${API_URL}/attendance/history?start_date=${startHistStr}&end_date=${todayStr}&limit=1000`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const datesMap: Record<string, string> = {};
      if (histRes.ok) {
        const histData = await histRes.json();
        const pastLogs = histData.logs || [];
        // Iterate backward so newest overrides
        pastLogs.slice().reverse().forEach((log: any) => {
          if (log.status === 'PRESENT' || log.status === 'LATE' || log.status === 'WORKING') {
            datesMap[log.employee_uuid || log.id] = log.date.split('T')[0];
          }
        });
      }

      setEmployees(empList);
      setAttendance(attMap);
      setLastAttendanceDates(datesMap);
    } catch (err: any) {
      setError(err.message || 'Error connecting to database server.');
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAttendanceData();

    // 30 seconds Polling
    pollIntervalRef.current = setInterval(() => {
      fetchAttendanceData(true);
    }, 30000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [router]);

  // Unique departments and shifts from employee data
  const departments = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));
  const shifts = Array.from(new Set(employees.map(e => e.shift).filter(Boolean)));

  // Format 12-hour time
  const formatTime = (timeStr: string | null) => {
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

  // Build the list filtering logic
  const filtered = employees.filter(emp => {
    const matchesSearch = 
      emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employee_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.department && emp.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (emp.designation && emp.designation.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDept = selectedDept === 'All' || emp.department === selectedDept;
    const matchesShift = selectedShift === 'All' || emp.shift === selectedShift;

    const todayLog = attendance[emp.id];
    const matchesStatus = selectedStatus === 'All' || 
      (selectedStatus === 'ABSENT' && !todayLog) ||
      (todayLog && todayLog.status === selectedStatus);

    return matchesSearch && matchesDept && matchesShift && matchesStatus;
  });

  // Paginated Slice
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedEmployees = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Quick Status Indicators
  const renderQuickIndicator = (empId: string) => {
    const record = attendance[empId];
    if (!record) {
      return (
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
          <div className="flex flex-col">
            <span className="text-[10px] text-rose-400 font-bold">Absent</span>
            <span className="text-[9px] text-slate-500 font-mono">--:-- | --:--</span>
          </div>
        </div>
      );
    }

    const status = record.status;
    const checkIn = formatTime(record.check_in_time);
    const checkOut = formatTime(record.check_out_time);
    const hours = record.working_hours || '--';

    if (status === 'WORKING') {
      return (
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-450 animate-pulse shadow-[0_0_8px_#fbbf24]" />
          <div className="flex flex-col">
            <span className="text-[10px] text-amber-400 font-bold">Working</span>
            <span className="text-[9px] text-slate-350 font-mono">{checkIn} | --:--</span>
          </div>
        </div>
      );
    }

    if (status === 'PRESENT' || status === 'LATE') {
      const isLate = status === 'LATE';
      return (
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
          <div className="flex flex-col">
            <span className="text-[10px] text-emerald-400 font-bold">{isLate ? 'Late' : 'Present'}</span>
            <span className="text-[9px] text-slate-300 font-mono">{checkIn} | {checkOut} ({hours})</span>
          </div>
        </div>
      );
    }

    if (status === 'MISSED_CHECKOUT') {
      return (
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_#f97316]" />
          <div className="flex flex-col">
            <span className="text-[10px] text-orange-400 font-bold">Missed Checkout</span>
            <span className="text-[9px] text-slate-350 font-mono">{checkIn} | --:--</span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center space-x-2">
        <span className="w-2.5 h-2.5 rounded-full bg-slate-500 shadow-[0_0_6px_#6b7280]" />
        <span className="text-[10px] text-slate-400 font-bold">{status}</span>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in text-slate-100">
      
      {/* Search Header toolbar */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 bg-slate-900/50 p-5 rounded-xl border border-slate-800/80">
        <div className="flex flex-wrap items-center gap-4 flex-1">
          {/* Search Box */}
          <div className="relative min-w-[260px] flex-1 max-w-xs">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search employee, ID, department..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-slate-550 outline-none transition-all"
            />
          </div>

          {/* Department Filter */}
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Dept</span>
            <select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500/30 outline-none cursor-pointer"
            >
              <option value="All">All Departments</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Shift Filter */}
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Shift</span>
            <select
              value={selectedShift}
              onChange={(e) => {
                setSelectedShift(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500/30 outline-none cursor-pointer"
            >
              <option value="All">All Shifts</option>
              {shifts.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Status</span>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500/30 outline-none cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="WORKING">Working (Checked-In)</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late</option>
              <option value="MISSED_CHECKOUT">Missed Checkout</option>
              <option value="ABSENT">Absent</option>
            </select>
          </div>
        </div>

        {/* Reload Action Button */}
        <button
          onClick={() => fetchAttendanceData(false)}
          disabled={loading || refreshing}
          className="px-4 py-2 rounded-lg bg-slate-950 border border-slate-800 text-cyan-400 hover:border-cyan-400/40 text-xs font-bold flex items-center justify-center space-x-2 transition-all disabled:opacity-50 h-9"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${(loading || refreshing) ? 'animate-spin' : ''}`} />
          <span>{(loading || refreshing) ? 'Syncing...' : 'Reload Directory'}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Directory Table Grid Layout */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-sm text-cyan-400 font-bold font-mono">Querying corporate staff listings...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel text-center py-24 text-slate-400 font-semibold text-xs border border-slate-750">
          No employees found matching selected filters.
        </div>
      ) : (
        <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden shadow-lg animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/30 text-slate-350 text-[10px] font-extrabold uppercase tracking-wider">
                  <th className="px-6 py-4">Employee Details</th>
                  <th className="px-6 py-4">Dept / Designation</th>
                  <th className="px-6 py-4">Shift / Manager</th>
                  <th className="px-6 py-4">Quick Status Indicator</th>
                  <th className="px-6 py-4">Check-In</th>
                  <th className="px-6 py-4">Check-Out</th>
                  <th className="px-6 py-4">Hours</th>
                  <th className="px-6 py-4">Last active Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50">
                {paginatedEmployees.map((emp) => {
                  const todayLog = attendance[emp.id];
                  const lastActiveDate = lastAttendanceDates[emp.id] || 'N/A';
                  return (
                    <tr key={emp.id} className="hover:bg-slate-900/25 transition-colors group">
                      {/* Photo + Name + ID */}
                      <td className="px-6 py-4 flex items-center space-x-3.5 min-w-[200px]">
                        {emp.profile_photo_url ? (
                          <img 
                            src={emp.profile_photo_url} 
                            alt={emp.full_name} 
                            className="w-10 h-10 rounded-full border border-slate-700 object-cover" 
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-850 border border-slate-700 flex items-center justify-center font-bold text-cyan-400 text-sm">
                            {emp.full_name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <h4 className="font-bold text-slate-200 group-hover:text-cyan-400 transition-colors leading-snug">{emp.full_name}</h4>
                          <p className="text-[10px] text-slate-450 font-mono mt-0.5">{emp.employee_id}</p>
                        </div>
                      </td>

                      {/* Dept / Designation */}
                      <td className="px-6 py-4 min-w-[150px]">
                        <p className="font-semibold text-slate-200">{emp.department || 'General'}</p>
                        <p className="text-[10px] text-slate-450 font-medium mt-0.5">{emp.designation || 'Staff Member'}</p>
                      </td>

                      {/* Shift / Manager */}
                      <td className="px-6 py-4 min-w-[160px]">
                        <p className="font-bold font-mono text-cyan-500">{emp.shift || 'Default Shift'}</p>
                        <p className="text-[10px] text-slate-450 mt-0.5 italic">Mgr: {emp.reporting_manager || 'None Linked'}</p>
                      </td>

                      {/* Quick Status Indicator */}
                      <td className="px-6 py-4 min-w-[160px]">
                        {renderQuickIndicator(emp.id)}
                      </td>

                      {/* Check-In */}
                      <td className="px-6 py-4 font-mono font-bold text-slate-300">
                        {todayLog && todayLog.check_in_time ? formatTime(todayLog.check_in_time) : '--:--'}
                      </td>

                      {/* Check-Out */}
                      <td className="px-6 py-4 font-mono font-bold text-slate-300">
                        {todayLog && todayLog.check_out_time ? formatTime(todayLog.check_out_time) : '--:--'}
                      </td>

                      {/* Total Hours */}
                      <td className="px-6 py-4 font-mono font-bold text-cyan-400">
                        {todayLog ? (todayLog.working_hours || '0h 0m') : '--'}
                      </td>

                      {/* Last active Date */}
                      <td className="px-6 py-4 font-mono text-slate-400">
                        {todayLog ? 'Today' : lastActiveDate}
                      </td>

                      {/* Link profile console */}
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => router.push(`/attendance/${emp.id}`)}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-cyan-400/50 text-cyan-400 hover:text-cyan-300 rounded-lg text-[11px] font-bold transition-all"
                        >
                          <span>Profile Console</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center px-6 py-4 bg-slate-950/20 border-t border-slate-800">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                Showing page {currentPage} of {totalPages} ({totalItems} employees total)
              </span>
              <div className="flex space-x-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-bold hover:border-cyan-500/20 disabled:opacity-40 transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-bold hover:border-cyan-500/20 disabled:opacity-40 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
