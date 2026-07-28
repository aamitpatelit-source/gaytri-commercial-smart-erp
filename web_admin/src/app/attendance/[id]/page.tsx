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
  ChevronLeft,
  ChevronRight,
  Info,
  Phone,
  User,
  Shield,
  Briefcase,
  Edit,
  Trash2,
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
  profile_image_url?: string | null;
  department: string | null;
  designation: string | null;
  shift: string | null;
  manager_name: string | null;
  manager_id: string | null;
  last_attendance_date: string | null;
  current_status: string | null;
  todays_check_in: string | null;
  todays_check_out: string | null;
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

interface ManagerOption {
  id: string;
  full_name?: string;
  name?: string;
}

const DESIGNATION_OPTIONS = [
  'Helper',
  'Machine Operator',
  'Supervisor',
  'Production Worker',
  'Packing Staff',
  'Loading Staff',
  'Quality Checker',
  'Store Keeper',
  'Electrician',
  'Technician'
];

const SHIFT_OPTIONS = [
  'Morning Shift',
  'Night Shift'
];

export default function EmployeeAttendanceProfilePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [activeTab, setActiveTab] = useState<'calendar' | 'history'>('calendar');
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals state
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleteRecordModalOpen, setIsDeleteRecordModalOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<AttendanceLog | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Manager lookup for edit modal
  const [metaManagers, setMetaManagers] = useState<ManagerOption[]>([]);

  // Edit form state
  const [editForm, setEditForm] = useState({
    full_name: '',
    mobile: '',
    designation: 'Machine Operator',
    shift: 'Morning Shift',
    manager_id: '',
    joining_date: '',
    is_active: true
  });

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

  const fetchMetaOptions = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;
      const res = await fetch(`${API_URL}/employees/meta/options`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMetaManagers(data.managers || []);
      }
    } catch (err) {
      console.error('Failed to load manager meta options', err);
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

      // 1. Fetch Employee Profile
      const empRes = await fetch(`${API_URL}/employees/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!empRes.ok) {
        throw new Error('Employee not found or access denied');
      }

      const empData = await empRes.json();
      const empProfile: EmployeeProfile = empData.employee;
      setEmployee(empProfile);

      // Pre-fill edit form
      setEditForm({
        full_name: empProfile.full_name || '',
        mobile: empProfile.mobile || '',
        designation: empProfile.designation || 'Machine Operator',
        shift: empProfile.shift || 'Morning Shift',
        manager_id: empProfile.manager_id || '',
        joining_date: empProfile.joining_date ? empProfile.joining_date.split('T')[0] : '',
        is_active: empProfile.is_active
      });



      // 3. Fetch Attendance History Logs
      const [year, month] = targetMonth.split('-');
      const firstDay = `${year}-${month}-01`;
      const lastDayNum = new Date(parseInt(year), parseInt(month), 0).getDate();
      const lastDay = `${year}-${month}-${String(lastDayNum).padStart(2, '0')}`;

      const logsRes = await fetch(`${API_URL}/attendance/history?employee_id=${id}&start_date=${firstDay}&end_date=${lastDay}&page=${pageNum}&limit=${limit}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData.logs || []);
        setTotalCount(logsData.pagination?.total || 0);
        setTotalPages(logsData.pagination?.totalPages || 1);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading employee profile');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendarLogs = async (targetMonth = currentMonth) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const [year, month] = targetMonth.split('-');
      const firstDay = `${year}-${month}-01`;
      const lastDayNum = new Date(parseInt(year), parseInt(month), 0).getDate();
      const lastDay = `${year}-${month}-${String(lastDayNum).padStart(2, '0')}`;

      const res = await fetch(`${API_URL}/attendance/history?employee_id=${id}&start_date=${firstDay}&end_date=${lastDay}&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const rawLogs: AttendanceLog[] = data.logs || [];
        const map: Record<string, AttendanceLog> = {};
        rawLogs.forEach(l => {
          const formatted = l.date.split('T')[0];
          map[formatted] = l;
        });
        setMonthlyCalendarLogs(map);
      }
    } catch (e) {
      console.error('[Calendar Cache] Failed to load monthly logs:', e);
    }
  };

  useEffect(() => {
    fetchProfileData(currentMonth, page);
    fetchMetaOptions();

    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        setUserRole(u.role);
      } catch (e) {}
    }
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

  // Handle Edit Employee Form Submit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');

    if (!editForm.full_name.trim() || !editForm.mobile.trim()) {
      setActionError('Full Name and Mobile Number are required.');
      return;
    }

    setSavingEdit(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/employees/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          full_name: editForm.full_name.trim(),
          mobile: editForm.mobile.trim(),
          designation: editForm.designation,
          shift: editForm.shift,
          manager_id: editForm.manager_id || null,
          joining_date: editForm.joining_date,
          is_active: editForm.is_active
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update employee');
      }

      setActionSuccess('Employee updated successfully!');
      setTimeout(() => {
        setIsEditModalOpen(false);
        setActionSuccess('');
        fetchProfileData();
      }, 1000);
    } catch (err: any) {
      setActionError(err.message || 'Error updating employee');
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Soft Delete Employee
  const handleConfirmDelete = async () => {
    setActionError('');
    setDeleting(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/employees/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete employee');
      }

      router.push('/attendance');
    } catch (err: any) {
      setActionError(err.message || 'Error deleting employee');
      setDeleting(false);
    }
  };

  // Handle Delete Attendance Record
  const handleConfirmDeleteRecord = async () => {
    if (!recordToDelete) return;
    setActionError('');
    setActionSuccess('');
    setDeletingRecord(true);

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/attendance/${recordToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete attendance record');
      }

      setActionSuccess('Attendance record deleted successfully.');
      setIsDeleteRecordModalOpen(false);
      setRecordToDelete(null);

      setTimeout(() => {
        setActionSuccess('');
      }, 3000);

      // Refresh all affected views: profile stats, history table, summary, analytics, and calendar
      fetchProfileData();
      fetchCalendarLogs();
    } catch (err: any) {
      setActionError(err.message || 'Error deleting attendance record');
    } finally {
      setDeletingRecord(false);
    }
  };

  interface CalendarDay {
    type: 'empty' | 'day';
    dayNum: number;
    dateStr: string;
    isSunday: boolean;
    isFuture: boolean;
  }

  // Generate calendar days (including leading and trailing empty cells for grid balance)
  const getCalendarDays = (): CalendarDay[] => {
    const parts = currentMonth.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const numDays = new Date(year, month + 1, 0).getDate();
    const days: CalendarDay[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Leading empty cells
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ type: 'empty', dayNum: 0, dateStr: '', isSunday: false, isFuture: false });
    }

    // Days of the month 1..numDays
    for (let i = 1; i <= numDays; i++) {
      const d = new Date(year, month, i);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isSunday = d.getDay() === 0;
      const isFuture = d > today;
      days.push({ type: 'day', dayNum: i, dateStr, isSunday, isFuture });
    }

    // Trailing empty cells to balance the 7-column grid
    while (days.length % 7 !== 0) {
      days.push({ type: 'empty', dayNum: 0, dateStr: '', isSunday: false, isFuture: false });
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

  const getDayStatusInfo = (day: CalendarDay) => {
    if (day.type === 'empty') {
      return {
        label: '',
        styling: 'border-transparent text-slate-700 bg-transparent cursor-default',
        clickable: false
      };
    }

    const log = monthlyCalendarLogs[day.dateStr];

    if (log) {
      const status = log.status;
      if (status === 'WORKING') {
        return {
          label: 'WORKING',
          styling: 'border-sky-500/30 text-sky-400 bg-sky-950/30 hover:border-sky-400 cursor-pointer shadow-sm',
          clickable: true
        };
      }
      if (status === 'PRESENT' || status === 'ON_DUTY') {
        return {
          label: 'PRESENT',
          styling: 'border-emerald-500/30 text-emerald-400 bg-emerald-950/30 hover:border-emerald-400 cursor-pointer shadow-sm',
          clickable: true
        };
      }
      if (status === 'LATE' || status === 'HALF_DAY') {
        return {
          label: status === 'HALF_DAY' ? 'HALF DAY' : 'LATE',
          styling: 'border-amber-500/30 text-amber-400 bg-amber-950/30 hover:border-amber-400 cursor-pointer shadow-sm',
          clickable: true
        };
      }
      return {
        label: status,
        styling: 'border-rose-500/30 text-rose-400 bg-rose-950/20 hover:border-rose-400 cursor-pointer shadow-sm',
        clickable: true
      };
    }

    // If no attendance log exists:
    if (day.isFuture) {
      return {
        label: 'FUTURE',
        styling: 'border-slate-800 text-slate-500 bg-slate-950/20 cursor-default',
        clickable: false
      };
    }

    if (day.isSunday) {
      return {
        label: 'WEEKLY OFF',
        styling: 'border-indigo-500/30 text-indigo-350 bg-indigo-950/25 hover:border-indigo-400/50 cursor-pointer',
        clickable: false
      };
    }

    // Past weekday without attendance record -> ABSENT
    return {
      label: 'ABSENT',
      styling: 'border-rose-500/30 text-rose-400 bg-rose-950/25 hover:border-rose-400/60 cursor-pointer',
      clickable: false
    };
  };

  // Today log calculation for profile header card
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLog = monthlyCalendarLogs[todayStr];
  const todayCheckIn = employee?.todays_check_in || (todayLog ? todayLog.check_in_time : null);
  const todayCheckOut = employee?.todays_check_out || (todayLog ? todayLog.check_out : null);
  const todayWorkingHours = todayLog ? todayLog.working_hours : null;



  return (
    <div className="space-y-8 animate-fade-in text-slate-100 pb-12">
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
          <ArrowLeft className="w-4 h-4 text-cyan-400" />
          <span>Back to Attendance Directory</span>
        </button>

        <div className="flex items-center space-x-3">
          {/* Month Navigator */}
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-750 px-3 py-1.5 rounded-lg text-xs font-semibold">
            <button onClick={() => handleMonthChange('prev')} className="p-1 hover:text-cyan-400 cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-slate-100 uppercase tracking-wider font-bold min-w-[80px] text-center">
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

      {/* Modern Profile Header Card (Without Department) */}
      {employee && (
        <div className="glass-panel p-6 rounded-xl border border-slate-750 shadow-xl relative overflow-hidden flex flex-col lg:flex-row justify-between gap-6 items-start">
          
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 w-full lg:w-auto">
            {employee.profile_photo_url || employee.profile_image_url ? (
              <img 
                src={employee.profile_photo_url || employee.profile_image_url!} 
                alt={employee.full_name} 
                className="w-24 h-24 rounded-2xl border-2 border-slate-700 object-cover shadow-lg shrink-0"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-slate-850 border-2 border-slate-750 flex items-center justify-center font-extrabold text-cyan-400 text-3xl shadow-lg shrink-0">
                {employee.full_name.charAt(0)}
              </div>
            )}

            <div className="text-center sm:text-left space-y-2">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h2 className="text-2xl font-extrabold text-white">{employee.full_name}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  employee.is_active ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950/60 text-rose-400 border border-rose-500/30'
                }`}>
                  {employee.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-slate-350 pt-1">
                <div><span className="text-slate-500">Employee ID:</span> <strong className="text-cyan-400 font-mono">{employee.employee_id}</strong></div>
                <div><span className="text-slate-500">Designation:</span> <strong className="text-slate-200">{employee.designation || 'Staff'}</strong></div>
                <div><span className="text-slate-500">Manager:</span> <strong className="text-slate-200">{employee.manager_name || 'Not Assigned'}</strong></div>
                <div><span className="text-slate-500">Assigned Shift:</span> <strong className="text-slate-200">{employee.shift || 'Morning Shift'}</strong></div>
                <div><span className="text-slate-500">Joining Date:</span> <strong className="text-slate-200">{formatDate(employee.joining_date)}</strong></div>
                <div><span className="text-slate-500">Status:</span> <strong className="text-emerald-400">{employee.current_status || 'PRESENT'}</strong></div>
              </div>
            </div>
          </div>

          {/* Right Column: Today's Metrics & Action Buttons */}
          <div className="w-full lg:w-auto flex flex-col justify-between items-end space-y-4 border-t lg:border-t-0 lg:border-l border-slate-800 pt-4 lg:pt-0 lg:pl-6">
            
            {/* Edit & Delete Employee Action Buttons */}
            <div className="flex items-center space-x-2 w-full justify-end no-print">
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-750 hover:bg-slate-800 text-cyan-400 text-xs font-bold transition-all cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Edit Employee</span>
              </button>
              
              <button
                onClick={() => setIsDeleteModalOpen(true)}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-rose-950/40 border border-rose-800/40 hover:bg-rose-900/40 text-rose-400 text-xs font-bold transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Employee</span>
              </button>
            </div>

            {/* Today's Live Attendance Metric Tiles */}
            <div className="grid grid-cols-3 gap-3 w-full font-mono text-center">
              <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[9px] text-slate-500 font-sans font-bold uppercase block">Today Check-In</span>
                <span className="text-xs font-bold text-emerald-400 mt-1 block">{formatTo12Hour(todayCheckIn)}</span>
              </div>
              <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[9px] text-slate-500 font-sans font-bold uppercase block">Today Check-Out</span>
                <span className="text-xs font-bold text-amber-400 mt-1 block">{formatTo12Hour(todayCheckOut)}</span>
              </div>
              <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[9px] text-slate-500 font-sans font-bold uppercase block">Working Hours</span>
                <span className="text-xs font-bold text-cyan-400 mt-1 block">{todayWorkingHours || '--'}</span>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-800 space-x-6 no-print overflow-x-auto">
        {(['calendar', 'history'] as const).map((tab) => (
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
          {/* TAB 1: ATTENDANCE CALENDAR */}
          {activeTab === 'calendar' && (
            <div className="glass-panel p-6 rounded-xl border border-slate-800 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-sm flex items-center space-x-2">
                  <CalendarIcon className="w-4 h-4 text-cyan-400" />
                  <span>Monthly Attendance Calendar</span>
                </h3>
                <span className="text-[10px] text-slate-500 uppercase font-mono">Click any logged date for details</span>
              </div>

              {/* Calendar Legend Bar */}
              <div className="flex flex-wrap items-center gap-4 text-[11px] font-bold text-slate-350 bg-slate-950/40 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span>Present</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <span>Absent</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span>Late / Half Day</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                  <span>Working</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                  <span>Weekly Off (Sunday)</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                  <span>Future Date</span>
                </div>
              </div>

              {/* 7-Column Days Header */}
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-400 border-b border-slate-800 pb-2">
                <span className="text-indigo-400">Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
              </div>

              {/* 7-Column Calendar Cells Grid */}
              <div className="grid grid-cols-7 gap-2">
                {getCalendarDays().map((day, idx) => {
                  const info = getDayStatusInfo(day);
                  return (
                    <div
                      key={idx}
                      onClick={() => info.clickable && handleDayClick(day.dateStr)}
                      className={`h-16 p-2 rounded-lg border flex flex-col justify-between text-xs transition-all ${info.styling}`}
                    >
                      {day.type === 'day' && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-[12px]">{day.dayNum}</span>
                            {day.isSunday && <span className="text-[8px] font-bold text-indigo-400 uppercase">Sun</span>}
                          </div>
                          {info.label && (
                            <span className="text-[9px] font-mono font-extrabold uppercase tracking-tight truncate block">
                              {info.label}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: ATTENDANCE HISTORY */}
          {activeTab === 'history' && (
            <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[10px] font-extrabold uppercase bg-slate-950/40">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Check-In</th>
                      <th className="px-4 py-3">Check-Out</th>
                      <th className="px-4 py-3">Working Hours</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/50">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No attendance logs found for this month.</td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-900/30">
                          <td className="px-4 py-3 font-mono">{log.date.split('T')[0]}</td>
                          <td className="px-4 py-3 font-mono">{formatTo12Hour(log.check_in_time)}</td>
                          <td className="px-4 py-3 font-mono">{formatTo12Hour(log.check_out)}</td>
                          <td className="px-4 py-3 font-mono text-cyan-400 font-bold">{log.working_hours || '--'}</td>
                          <td className="px-4 py-3 font-bold text-emerald-400">{log.status}</td>
                          <td className="px-4 py-3 text-right">
                            {(userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') && (
                              <button
                                onClick={() => { setRecordToDelete(log); setIsDeleteRecordModalOpen(true); }}
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-950/40 border border-rose-800/40 hover:bg-rose-900/40 text-rose-400 text-xs font-bold transition-all cursor-pointer"
                                title="Delete attendance record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}






        </div>
      )}

      {/* Edit Employee Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in no-print">
          <div className="glass-panel border border-slate-750 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            
            <div className="p-5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-cyan-400">
                <Edit className="w-5 h-5" />
                <h3 className="font-bold text-white text-base">Edit Employee Profile</h3>
              </div>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-850 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 text-xs">
              
              {actionError && (
                <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-300 font-semibold flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {actionSuccess && (
                <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 font-semibold flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {/* Balanced 2-Column Layout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Employee ID (Disabled) */}
                <div>
                  <label className="block text-slate-400 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Employee ID (Read Only)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={employee?.employee_id || ''}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 font-mono cursor-not-allowed"
                  />
                </div>

                {/* Employee Name */}
                <div>
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Full Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.full_name}
                    onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Mobile Number */}
                <div>
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Mobile Number <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.mobile}
                    onChange={e => setEditForm({ ...editForm, mobile: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Joining Date */}
                <div>
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Joining Date
                  </label>
                  <input
                    type="date"
                    value={editForm.joining_date}
                    onChange={e => setEditForm({ ...editForm, joining_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Designation (Predefined Dropdown) */}
                <div>
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Designation
                  </label>
                  <select
                    value={editForm.designation}
                    onChange={e => setEditForm({ ...editForm, designation: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-400"
                  >
                    {DESIGNATION_OPTIONS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {/* Shift (Predefined Dropdown) */}
                <div>
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Assigned Shift
                  </label>
                  <select
                    value={editForm.shift}
                    onChange={e => setEditForm({ ...editForm, shift: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-400"
                  >
                    {SHIFT_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Reporting Manager */}
                <div>
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Reporting Manager
                  </label>
                  <select
                    value={editForm.manager_id}
                    onChange={e => setEditForm({ ...editForm, manager_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="">Select Manager</option>
                    {metaManagers.length === 0 ? (
                      <option value="" disabled>No Managers Available</option>
                    ) : (
                      metaManagers.map(m => (
                        <option key={m.id} value={m.id}>{m.full_name || m.name}</option>
                      ))
                    )}
                  </select>
                </div>

                {/* Active Status */}
                <div className="flex items-center pt-5">
                  <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.is_active}
                      onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })}
                      className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-cyan-400"
                    />
                    <span className="font-bold">Active Employee Status</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-750 text-slate-300 font-semibold hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Employee Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in no-print">
          <div className="glass-panel border border-rose-900/60 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            
            <div className="p-5 border-b border-rose-900/40 bg-rose-950/20 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-rose-400">
                <Trash2 className="w-5 h-5" />
                <h3 className="font-bold text-white text-base">Delete Employee?</h3>
              </div>
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-850 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {actionError && (
                <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-300 font-semibold flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              <p className="text-slate-300 text-sm leading-relaxed">
                This employee will be removed from the active employee list.
              </p>
              <p className="text-slate-400 text-xs bg-slate-950 p-3 rounded-lg border border-slate-800">
                <strong className="text-emerald-400 block mb-1">Preservation Policy:</strong>
                Attendance history, monthly summaries, reports, and analytics will remain fully preserved in the database.
              </p>

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-750 text-slate-300 font-semibold hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-lg shadow-rose-600/20 transition-all disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Delete Attendance Record Confirmation Modal */}
      {isDeleteRecordModalOpen && recordToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in no-print">
          <div className="glass-panel border border-rose-900/60 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            
            <div className="p-5 border-b border-rose-900/40 bg-rose-950/20 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-rose-400">
                <Trash2 className="w-5 h-5" />
                <h3 className="font-bold text-white text-base">Delete Attendance Record</h3>
              </div>
              <button 
                onClick={() => { setIsDeleteRecordModalOpen(false); setRecordToDelete(null); }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-850 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {actionError && (
                <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-300 font-semibold flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              <p className="text-slate-300 text-sm font-semibold">
                Delete this attendance record?
              </p>
              <p className="text-rose-400/90 text-xs bg-rose-950/30 p-3 rounded-lg border border-rose-900/30 font-bold">
                This action cannot be undone.
              </p>

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setIsDeleteRecordModalOpen(false); setRecordToDelete(null); }}
                  className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-750 text-slate-300 font-semibold hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteRecord}
                  disabled={deletingRecord}
                  className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-lg shadow-rose-600/20 transition-all disabled:opacity-50"
                >
                  {deletingRecord ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
