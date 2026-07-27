"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  ArrowLeft,
  Calendar as CalendarIcon, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Clock, 
  MapPin, 
  TrendingUp, 
  Download, 
  Printer,
  ChevronLeft,
  ChevronRight,
  Info,
  Phone,
  User,
  Shield,
  Briefcase,
  X
} from 'lucide-react';

import { API_URL } from '../../../config';

interface EmployeeProfile {
  id: string;
  employee_id: string;
  full_name: string;
  mobile: string;
  joining_date: string;
  salary_type: string;
  role: string;
  is_active: boolean;
  profile_photo_url: string | null;
  department: string | null;
  designation: string | null;
  shift: string | null;
  manager_name: string | null;
  last_attendance_date: string | null;
  current_status: string | null;
}

interface MonthlySummary {
  presentDays: number;
  absentDays: number;
  workingDays: number;
  holidays: number;
  avgCheckInTime: string;
  avgCheckOutTime: string;
  totalWorkingHours: string;
  lateArrivals: number;
  missedCheckoutCount: number;
  lastAttendanceDate: string;
}

interface Analytics {
  sufficientData: boolean;
  monthlyAttendancePercentage: number;
  workingHoursTrend: { date: string; hours: number }[];
  checkInTrend: { date: string; time: string }[];
  checkOutTrend: { date: string; time: string }[];
}

interface AttendanceLog {
  id: string;
  date: string;
  check_in_time: string;
  check_out: string | null;
  working_hours: string | null;
  status: string;
  remarks: string | null;
  gps_lat_in: number | null;
  gps_lng_in: number | null;
  gps_lat_out: number | null;
  gps_lng_out: number | null;
  device_name: string | null;
  network_type: string | null;
  battery_percentage: number | null;
  face_image_url: string | null;
  source: string;
}

export default function EmployeeAttendanceProfilePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [activeTab, setActiveTab] = useState<'overview' | 'calendar' | 'history' | 'summary' | 'analytics' | 'reports'>('overview');
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected Month State (YYYY-MM)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
  });

  // Pagination for logs table
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Clicked Day Modal details
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLog, setDetailLog] = useState<AttendanceLog | null>(null);
  const [monthlyCalendarLogs, setMonthlyCalendarLogs] = useState<Record<string, AttendanceLog>>({});

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

  const fetchProfileData = async (targetMonth = currentMonth, pageNum = page) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoading(true);
      setError('');

      // 1. Fetch employee metadata
      const empRes = await fetch(`${API_URL}/employees/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!empRes.ok) {
        throw new Error('Employee profile could not be found.');
      }
      const empData = await empRes.json();
      if (empData.success) {
        setEmployee(empData.employee);
      }

      // 2. Fetch employee attendance stats/analytics for selected month
      const statsRes = await fetch(`${API_URL}/attendance/employee/${id}/stats?month=${targetMonth}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.success) {
          setSummary(statsData.summary);
          setAnalytics(statsData.analytics);
        }
      }

      // 3. Fetch paginated logs for selected month
      const parts = targetMonth.split('-');
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const startStr = `${targetMonth}-01`;
      const endStr = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const logsRes = await fetch(
        `${API_URL}/attendance/history?employee_id=${id}&start_date=${startStr}&end_date=${endStr}&page=${pageNum}&limit=${limit}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        if (logsData.success) {
          setLogs(logsData.logs || []);
          if (logsData.pagination) {
            setTotalCount(logsData.pagination.totalCount);
            setTotalPages(logsData.pagination.totalPages);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error pulling attendance logs.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendarLogs = async (targetMonth = currentMonth) => {
    try {
      const token = localStorage.getItem('access_token');
      const startStr = `${targetMonth}-01`;
      const parts = targetMonth.split('-');
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const endStr = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const res = await fetch(
        `${API_URL}/attendance/history?employee_id=${id}&start_date=${startStr}&end_date=${endStr}&limit=32`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, AttendanceLog> = {};
        if (data.success) {
          const rawLogs: AttendanceLog[] = data.logs || [];
          rawLogs.forEach(l => {
            const formatted = l.date.split('T')[0];
            map[formatted] = l;
          });
        }
        setMonthlyCalendarLogs(map);
      }
    } catch (e) {
      console.error('[Calendar Cache] Failed to load monthly logs:', e);
    }
  };

  useEffect(() => {
    fetchProfileData(currentMonth, page);
  }, [id, currentMonth, page]);

  useEffect(() => {
    fetchCalendarLogs(currentMonth);
  }, [id, currentMonth]);

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const parts = currentMonth.split('-');
    let year = parseInt(parts[0]);
    let month = parseInt(parts[1]);

    if (direction === 'prev') {
      month--;
      if (month === 0) {
        month = 12;
        year--;
      }
    } else {
      month++;
      if (month === 13) {
        month = 1;
        year++;
      }
    }

    const newMonth = `${year}-${String(month).padStart(2, '0')}`;
    setCurrentMonth(newMonth);
    setPage(1);
  };

  // Generate calendar days
  const getCalendarDays = () => {
    const parts = currentMonth.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const numDays = new Date(year, month + 1, 0).getDate();
    const days = [];

    // Empty spaces for previous month's alignment
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ type: 'empty', dayNum: 0, dateStr: '', isWeekend: false });
    }

    // Days in current month
    for (let i = 1; i <= numDays; i++) {
      const currentDate = new Date(year, month, i);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
      days.push({ type: 'day', dayNum: i, dateStr, isWeekend });
    }

    return days;
  };

  const handleDayClick = (dateStr: string) => {
    const log = monthlyCalendarLogs[dateStr];
    if (log) {
      setDetailLog(log);
      setDetailOpen(true);
    }
  };

  const getDayStyling = (day: { type: string; dayNum: number; dateStr: string; isWeekend: boolean }) => {
    if (day.type === 'empty') return 'border-transparent text-slate-700 bg-transparent cursor-default';
    
    const log = monthlyCalendarLogs[day.dateStr];
    if (!log) {
      const parts = day.dateStr.split('-');
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (d > today) {
        return 'border-slate-800 text-slate-500 bg-transparent cursor-default';
      }
      
      if (day.isWeekend) {
        return 'border-slate-800/40 text-slate-500 bg-slate-900/10 cursor-default';
      }
      return 'border-rose-500/20 text-rose-400 bg-rose-950/20 hover:border-rose-400 cursor-pointer';
    }

    const status = log.status;
    if (status === 'WORKING') {
      return 'border-sky-500/20 text-sky-400 bg-sky-950/25 hover:border-sky-400 cursor-pointer';
    }
    if (status === 'PRESENT') {
      return 'border-emerald-500/20 text-emerald-400 bg-emerald-950/25 hover:border-emerald-400 cursor-pointer';
    }
    if (status === 'LATE') {
      return 'border-amber-500/20 text-amber-400 bg-amber-950/25 hover:border-amber-400 cursor-pointer';
    }
    if (status === 'MISSED_CHECKOUT') {
      return 'border-rose-550/20 text-rose-455 bg-rose-950/25 hover:border-rose-550 cursor-pointer';
    }
    return 'border-slate-800 text-slate-200 bg-slate-800/30 hover:border-slate-600 cursor-pointer';
  };

  const getDayStatusDot = (dateStr: string) => {
    const log = monthlyCalendarLogs[dateStr];
    if (!log) return 'bg-rose-500';
    if (log.status === 'PRESENT') return 'bg-emerald-400';
    if (log.status === 'WORKING') return 'bg-sky-400';
    if (log.status === 'LATE') return 'bg-amber-400';
    if (log.status === 'MISSED_CHECKOUT') return 'bg-orange-500';
    return 'bg-slate-500';
  };

  const getCheckInPositionPercentage = (timeStr: string) => {
    if (!timeStr) return 0;
    try {
      const parts = timeStr.split(':');
      const hour = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const totalMinutes = hour * 60 + minutes;
      
      const startMin = 8 * 60; // 8:00 AM
      const endMin = 12 * 60;  // 12:00 PM
      
      const percent = ((totalMinutes - startMin) / (endMin - startMin)) * 100;
      return Math.max(0, Math.min(100, percent));
    } catch (e) {
      return 50;
    }
  };

  const exportToCSV = () => {
    if (!logs || logs.length === 0) return;
    const headers = ['Date', 'Check-In', 'Check-Out', 'Working Hours', 'Status', 'Remarks', 'Source'];
    const rows = logs.map(l => [
      l.date.split('T')[0],
      l.check_in_time || '',
      l.check_out || '',
      l.working_hours || '',
      l.status,
      l.remarks || '',
      l.source
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_report_${employee?.employee_id || 'employee'}.csv`);
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
          .calendar-grid { border: 1px solid #ccc !important; }
          .calendar-cell { border: 1px solid #ddd !important; background: white !important; color: black !important; }
          th, td { border: 1px solid #ddd !important; padding: 8px !important; color: black !important; }
          h2, h3, h4, span, p { color: black !important; }
        }
      `}</style>

      {/* Back navigation & Month selector */}
      <div className="flex items-center justify-between border-b border-slate-850 pb-4 no-print">
        <button
          onClick={() => router.push('/attendance')}
          className="flex items-center space-x-2 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Directory</span>
        </button>

        <div className="flex items-center space-x-3">
          {/* Month Navigator */}
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700 px-2 py-1 rounded-lg text-xs font-semibold">
            <button onClick={() => handleMonthChange('prev')} className="p-1 hover:text-cyan-400 cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-slate-100 uppercase tracking-wider font-bold min-w-[70px] text-center">
              {new Date(currentMonth + '-02').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
            <button onClick={() => handleMonthChange('next')} className="p-1 hover:text-cyan-400 cursor-pointer">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-350 text-xs font-semibold no-print">
          {error}
        </div>
      )}

      {/* PROFILE HEADER PANEL */}
      {employee && (
        <div className="glass-panel p-6 rounded-xl border border-slate-700 shadow-xl relative overflow-hidden flex flex-col md:flex-row gap-6 items-center">
          <div className="absolute top-0 right-0 p-4 bg-cyan-950/30 border-l border-b border-slate-700 text-[10px] text-cyan-400 font-extrabold rounded-bl-lg font-mono">
            {employee.is_active ? 'ACTIVE STATUS' : 'INACTIVE'}
          </div>

          {employee.profile_photo_url ? (
            <img 
              src={employee.profile_photo_url} 
              alt={employee.full_name} 
              className="w-24 h-24 rounded-full border border-slate-650 object-cover shadow-md"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-cyan-400 text-3xl shadow-md">
              {employee.full_name.charAt(0)}
            </div>
          )}

          <div className="text-center md:text-left space-y-2 flex-1">
            <h2 className="text-2xl font-extrabold text-white">{employee.full_name}</h2>
            <div className="flex flex-wrap justify-center md:justify-start gap-y-2 gap-x-4 text-xs text-slate-350 font-medium">
              <span className="flex items-center space-x-1.5">
                <Briefcase className="w-3.5 h-3.5 text-cyan-400" />
                <span>{employee.designation} ({employee.department || 'General'})</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>ID: {employee.employee_id}</span>
              </span>
              {employee.mobile && (
                <span className="flex items-center space-x-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{employee.mobile}</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap justify-center md:justify-start gap-y-2 gap-x-4 text-xs text-slate-400">
              <span>Shift: <strong className="text-cyan-400">{employee.shift || 'Default Shift'}</strong></span>
              {employee.manager_name && (
                <span>Manager: <strong className="text-slate-300">{employee.manager_name}</strong></span>
              )}
              <span>Salary Mode: <strong className="text-slate-300 capitalize">{employee.salary_type}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-800 space-x-6 no-print overflow-x-auto">
        {(['overview', 'calendar', 'history', 'summary', 'analytics', 'reports'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3.5 text-xs font-bold uppercase tracking-wider transition-all relative border-b-2 cursor-pointer bg-transparent ${
              activeTab === tab 
                ? 'border-cyan-400 text-cyan-400' 
                : 'border-transparent text-slate-450 hover:text-slate-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* TAB CONTENT SPANS */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
        </div>
      ) : (
        <div className="tab-contents">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-panel p-6 rounded-xl border border-slate-800 space-y-4">
                  <h3 className="font-bold text-white text-sm border-b border-slate-800 pb-2">Employment Information</h3>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Joined Date</span>
                      <span className="text-slate-200 font-bold">{employee ? formatDate(employee.joining_date) : '--'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">System Role</span>
                      <span className="text-slate-200 capitalize">{employee?.role || 'Staff'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Supervisor</span>
                      <span className="text-slate-200">{employee?.manager_name || 'None Linked'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Shift Timing</span>
                      <span className="text-cyan-400 font-bold font-mono">{employee?.shift || 'Default Shift'}</span>
                    </div>
                  </div>
                </div>

                <div className="glass-panel p-6 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-white text-sm border-b border-slate-800 pb-2 mb-4">Monthly Roster Ratio</h3>
                    {summary ? (
                      <div className="flex items-center space-x-6">
                        <div className="relative w-20 h-20 flex items-center justify-center border-4 border-cyan-400/25 rounded-full">
                          <span className="text-lg font-mono font-extrabold text-cyan-400">
                            {analytics?.monthlyAttendancePercentage || 0}%
                          </span>
                        </div>
                        <div className="text-xs text-slate-350 space-y-1">
                          <p>🟢 Present: <strong>{summary.presentDays}</strong> days</p>
                          <p>🔴 Absent: <strong>{summary.absentDays}</strong> days</p>
                          <p>🟠 Missed checkout: <strong>{summary.missedCheckoutCount}</strong> days</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Summary not loaded.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INTERACTIVE CALENDAR */}
          {activeTab === 'calendar' && (
            <div className="glass-panel p-6 rounded-xl border border-slate-700 shadow-lg animate-fade-in">
              <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                <h3 className="font-bold text-white text-base flex items-center space-x-2">
                  <CalendarIcon className="w-5 h-5 text-cyan-400" />
                  <span>Interactive Attendance Calendar</span>
                </h3>
              </div>

              <div className="grid grid-cols-7 gap-2.5 text-center text-[10px] font-extrabold text-slate-450 uppercase tracking-widest pb-3">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              <div className="grid grid-cols-7 gap-2.5">
                {getCalendarDays().map((day, idx) => {
                  const log = monthlyCalendarLogs[day.dateStr];
                  return (
                    <div 
                      key={idx}
                      onClick={() => day.type !== 'empty' && handleDayClick(day.dateStr)}
                      className={`aspect-square border rounded-lg p-1.5 flex flex-col justify-between transition-all relative group ${
                        day.type !== 'empty' ? 'cursor-pointer' : ''
                      } ${getDayStyling(day)}`}
                    >
                      {day.type !== 'empty' && (
                        <>
                          <span className="font-mono text-xs font-bold text-slate-400">{day.dayNum}</span>
                          {log && (
                            <div className="flex items-center space-x-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${getDayStatusDot(day.dateStr)}`} />
                              <span className="text-[9px] font-mono tracking-tighter truncate leading-none text-slate-200">
                                {log.check_in_time ? log.check_in_time.substring(0, 5) : '--:--'}
                              </span>
                            </div>
                          )}

                          {/* HOVER TOOLTIP */}
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 hidden group-hover:block bg-slate-900 border border-slate-750 p-2.5 rounded-lg shadow-2xl z-30 text-[10px] space-y-1.5 text-left pointer-events-none no-print">
                            <p className="font-bold border-b border-slate-800 pb-1 text-slate-200 flex justify-between">
                              <span>{formatDate(day.dateStr)}</span>
                              <span className="text-cyan-400">{log ? log.status : 'ABSENT'}</span>
                            </p>
                            {log ? (
                              <>
                                <p className="text-slate-350">Check-In: <strong className="text-white font-mono">{formatTo12Hour(log.check_in_time)}</strong></p>
                                <p className="text-slate-350">Check-Out: <strong className="text-white font-mono">{log.check_out ? formatTo12Hour(log.check_out) : '--:--'}</strong></p>
                                <p className="text-slate-350">Hours Worked: <strong className="text-cyan-400 font-mono">{log.working_hours || '--'}</strong></p>
                                {log.remarks && <p className="text-slate-500 italic mt-1 truncate">"{log.remarks}"</p>}
                              </>
                            ) : (
                              <p className="text-rose-400 italic">No attendance log filed.</p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-4 mt-5 text-[10px] font-bold text-slate-400 pt-4 border-t border-slate-850/80">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500 shadow-[0_0_8px_#10b981] inline-block" />
                  <span>Present</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-sky-400 shadow-[0_0_8px_#38bdf8] inline-block" />
                  <span>Working (Active)</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-amber-400 shadow-[0_0_8px_#fbbf24] inline-block" />
                  <span>Late Entry</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-orange-500 shadow-[0_0_8px_#f97316] inline-block" />
                  <span>Missed Checkout</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-rose-500 shadow-[0_0_8px_#f43f5e] inline-block" />
                  <span>Absent</span>
                </span>
              </div>
            </div>
          )}

          {/* TAB 3: ATTENDANCE HISTORY LOGS */}
          {activeTab === 'history' && (
            <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden shadow-lg animate-fade-in">
              <div className="overflow-x-auto">
                {logs.length === 0 ? (
                  <div className="text-center py-12 text-slate-455 font-semibold text-xs">
                    No logs logged for this month.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-200 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/30">
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Day</th>
                        <th className="px-6 py-4">Check-In</th>
                        <th className="px-6 py-4">Check-Out</th>
                        <th className="px-6 py-4">Working Hours</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/50 text-slate-350">
                      {logs.map((log) => {
                        const dayName = new Date(log.date).toLocaleDateString('en-US', { weekday: 'long' });
                        return (
                          <tr key={log.id} className="hover:bg-slate-900/30 transition-colors">
                            <td className="px-6 py-4 font-semibold text-white">{log.date.split('T')[0]}</td>
                            <td className="px-6 py-4 font-semibold text-slate-400">{dayName}</td>
                            <td className="px-6 py-4 font-mono text-slate-100 font-bold">{formatTo12Hour(log.check_in_time)}</td>
                            <td className="px-6 py-4 font-mono text-slate-100">
                              {log.check_out ? (
                                <span className="font-bold text-cyan-400">{formatTo12Hour(log.check_out)}</span>
                              ) : log.status === 'WORKING' ? (
                                <span className="text-sky-400 font-semibold italic bg-sky-950/20 border border-sky-500/10 px-2 py-0.5 rounded text-[10px]">Working</span>
                              ) : (
                                <span className="text-slate-500">--</span>
                              )}
                            </td>
                            <td className="px-6 py-4 font-mono text-cyan-400 font-bold">{log.working_hours || '-'}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                log.status === 'PRESENT'
                                  ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/20'
                                  : log.status === 'WORKING'
                                  ? 'bg-sky-950/30 text-sky-400 border border-sky-500/20'
                                  : log.status === 'LATE'
                                  ? 'bg-amber-950/30 text-amber-400 border border-amber-500/20'
                                  : 'bg-rose-950/30 text-rose-450 border border-rose-500/20'
                              }`}>
                                <span>{log.status}</span>
                              </span>
                            </td>
                            <td className="px-6 py-4 italic text-slate-450 truncate max-w-[200px]">{log.remarks || 'None'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {totalPages > 1 && (
                <div className="p-4 border-t border-slate-800 bg-slate-950/30 flex items-center justify-between no-print text-[11px] font-semibold text-slate-450">
                  <span>Showing page {page} of {totalPages}</span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MONTHLY SUMMARY DETAILS */}
          {activeTab === 'summary' && (
            <div className="space-y-6 animate-fade-in">
              {summary ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  <div className="glass-panel p-5 rounded-xl border border-slate-800 text-center">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Present Days</p>
                    <h4 className="text-3xl font-extrabold text-emerald-400 mt-2 font-mono">{summary.presentDays}</h4>
                  </div>
                  <div className="glass-panel p-5 rounded-xl border border-slate-800 text-center">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Absent Days</p>
                    <h4 className="text-3xl font-extrabold text-rose-400 mt-2 font-mono">{summary.absentDays}</h4>
                  </div>
                  <div className="glass-panel p-5 rounded-xl border border-slate-800 text-center">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Holidays</p>
                    <h4 className="text-3xl font-extrabold text-blue-400 mt-2 font-mono">{summary.holidays}</h4>
                  </div>
                  <div className="glass-panel p-5 rounded-xl border border-slate-800 text-center">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Avg Check-In</p>
                    <h4 className="text-xl font-extrabold text-white mt-3 font-mono">{summary.avgCheckInTime}</h4>
                  </div>
                  <div className="glass-panel p-5 rounded-xl border border-slate-800 text-center">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Avg Check-Out</p>
                    <h4 className="text-xl font-extrabold text-white mt-3 font-mono">{summary.avgCheckOutTime}</h4>
                  </div>
                  <div className="glass-panel p-5 rounded-xl border border-slate-800 text-center">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Work Hours</p>
                    <h4 className="text-xl font-extrabold text-cyan-400 mt-3 font-mono">{summary.totalWorkingHours}</h4>
                  </div>
                  <div className="glass-panel p-5 rounded-xl border border-slate-800 text-center">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Late Count</p>
                    <h4 className="text-3xl font-extrabold text-amber-400 mt-2 font-mono">{summary.lateArrivals}</h4>
                  </div>
                  <div className="glass-panel p-5 rounded-xl border border-slate-800 text-center">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Missed Checkouts</p>
                    <h4 className="text-3xl font-extrabold text-orange-450 mt-2 font-mono">{summary.missedCheckoutCount}</h4>
                  </div>
                  <div className="glass-panel p-5 rounded-xl border border-slate-800 text-center col-span-2">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Attendance Percentage</p>
                    <h4 className="text-2xl font-extrabold text-cyan-400 mt-2.5 font-mono">{analytics?.monthlyAttendancePercentage || 0}%</h4>
                  </div>
                </div>
              ) : (
                <div className="glass-panel p-6 text-center text-xs text-slate-450">Summary details unavailable.</div>
              )}
            </div>
          )}

          {/* TAB 5: ANALYTICS CHARTS */}
          {activeTab === 'analytics' && (
            <div className="glass-panel p-6 rounded-xl border border-slate-800 animate-fade-in shadow-lg">
              {analytics && analytics.sufficientData ? (
                <div className="space-y-8">
                  {/* Daily Hours Chart */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Daily Shift Hours Trend</h4>
                    <div className="h-44 w-full flex items-end justify-between bg-slate-950/40 border border-slate-850 p-4 pt-8 rounded-lg relative">
                      <span className="absolute top-2 left-2.5 text-[9px] text-slate-500">Duration (0h - 12h)</span>
                      {analytics.workingHoursTrend.slice(-15).map((t, index) => {
                        const hPercent = Math.min(100, (t.hours / 12) * 100);
                        return (
                          <div key={index} className="flex-1 flex flex-col items-center justify-end h-full group relative mx-0.5">
                            <div 
                              className="bg-cyan-550/80 hover:bg-cyan-400 rounded-t w-full transition-all"
                              style={{ height: `${hPercent}%` }}
                            />
                            <span className="absolute bottom-full mb-1.5 hidden group-hover:block bg-slate-900 border border-slate-750 text-[9px] text-cyan-455 px-1.5 py-0.5 rounded shadow font-mono">
                              {t.hours}h ({t.date.split('-')[2]})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Arrival Spread */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Arrival Timing Check-In Spread</h4>
                    <div className="h-20 w-full bg-slate-950/40 border border-slate-850 p-4 rounded-lg flex items-center relative">
                      <span className="absolute top-2 left-3 text-[9px] text-slate-500">8:00 AM</span>
                      <span className="absolute top-2 right-3 text-[9px] text-slate-500">12:00 PM</span>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full relative">
                        <div className="absolute left-[31.25%] top-1/2 transform -translate-y-1/2 w-0.5 h-3 bg-amber-500/60" title="Shift Grace Time" />
                        {analytics.checkInTrend.slice(-12).map((t, idx) => {
                          const leftPct = getCheckInPositionPercentage(t.time + ':00');
                          return (
                            <div 
                              key={idx}
                              className="absolute w-2.5 h-2.5 rounded-full bg-cyan-450 border border-slate-950 -translate-y-1/2 -translate-x-1/2 hover:scale-125 transition-transform cursor-pointer group"
                              style={{ left: `${leftPct}%`, top: '50%' }}
                            >
                              <span className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-900 border border-slate-750 text-[9px] text-white px-1.5 py-0.5 rounded font-mono">
                                {t.time}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-slate-500 italic text-xs space-y-2 border border-dashed border-slate-800 rounded-xl">
                  <Info className="w-6 h-6 text-slate-650 mx-auto" />
                  <p className="font-bold">Insufficient Data for Analytics</p>
                  <p className="text-[10px] px-6 text-slate-550 leading-relaxed">Requires at least 3 completed working/present logs in this month to chart trend lines.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: REPORTS & EXPORTS */}
          {activeTab === 'reports' && (
            <div className="glass-panel p-6 rounded-xl border border-slate-800 animate-fade-in space-y-6">
              <h3 className="font-bold text-white text-sm border-b border-slate-800 pb-2">Generate Attendance Statement</h3>
              <p className="text-xs text-slate-350 leading-relaxed">Select output options to print or compile static records for this employee for the selected month ({currentMonth}).</p>
              
              <div className="flex flex-wrap gap-4 pt-4">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-cyan-400 hover:border-cyan-400 text-xs font-bold flex items-center space-x-2 transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print PDF Statement</span>
                </button>

                <button
                  onClick={exportToCSV}
                  className="px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-emerald-400 hover:border-emerald-400 text-xs font-bold flex items-center space-x-2 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Download CSV Ledger</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DETAIL DIALOG MODAL (CLICK CELLS) */}
      {detailOpen && detailLog && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel border border-slate-700 rounded-xl max-w-md w-full overflow-hidden shadow-2xl animate-scale-up">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
              <h3 className="font-bold text-white text-sm flex items-center space-x-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>Attendance Log Details</span>
              </h3>
              <button onClick={() => setDetailOpen(false)} className="text-slate-400 hover:text-white cursor-pointer bg-transparent border-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-y-3 gap-x-4 border-b border-slate-850 pb-4">
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Log Date</p>
                  <p className="text-slate-200 mt-0.5 font-bold">{formatDate(detailLog.date)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Log Status</p>
                  <p className="text-cyan-400 mt-0.5 font-bold uppercase">{detailLog.status}</p>
                </div>
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
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Log Source</p>
                  <p className="text-cyan-455 mt-0.5 font-semibold uppercase">{detailLog.source}</p>
                </div>
              </div>

              {/* Mobile device details */}
              <div className="space-y-2 pt-2">
                <h5 className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Device Telemetry Logs</h5>
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
                  <p className="text-slate-550 italic">No telemetry data logged for this manual edit / shift.</p>
                )}
              </div>

              {/* GPS coordinates mapping */}
              <div className="space-y-2 pt-2">
                <h5 className="text-[10px] text-slate-455 font-bold uppercase tracking-wider">GPS Verification Bounds</h5>
                {detailLog.gps_lat_in || detailLog.gps_lat_out ? (
                  <div className="space-y-2 bg-slate-950/40 p-3 border border-slate-850 rounded">
                    {detailLog.gps_lat_in && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center space-x-1">
                          <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Check-In:</span>
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
                          <span>Check-Out:</span>
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
                  <p className="text-slate-550 italic font-medium">GPS location details not synchronized.</p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/30 flex justify-end">
              <button
                onClick={() => setDetailOpen(false)}
                className="px-4 py-2 rounded bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-xs font-bold transition-all cursor-pointer"
              >
                Close details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
