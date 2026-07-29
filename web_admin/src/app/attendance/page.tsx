"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, 
  Search, 
  ChevronRight, 
  RefreshCw, 
  UserPlus, 
  AlertCircle,
  X,
  CheckCircle,
  Camera,
  User,
  Trash2
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
  monthly_salary?: string | number;
  profile_photo_url: string | null;
  profile_image_url?: string | null;
}

interface AttendanceStatus {
  employee_id: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  working_hours: string | null;
  date: string;
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

export default function EmployeeAttendanceDirectoryPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [lastAttendanceDates, setLastAttendanceDates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShift, setSelectedShift] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [error, setError] = useState('');

  // Add Employee Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');

  // Dynamic Manager Lookup
  const [metaManagers, setMetaManagers] = useState<ManagerOption[]>([]);

  // Add Form State
  const [formData, setFormData] = useState({
    employee_id: '',
    full_name: '',
    mobile: '',
    designation: 'Machine Operator',
    shift: 'Morning Shift',
    monthly_salary: '',
    profile_photo_url: '',
    profile_image_url: '',
    manager_id: '',
    joining_date: new Date().toISOString().split('T')[0]
  });

  const validateAndReadImageFile = (
    file: File,
    onSuccess: (dataUrl: string) => void,
    onError: (msg: string) => void
  ) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const validExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const fileName = file.name.toLowerCase();
    const hasValidExt = validExts.some(ext => fileName.endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExt) {
      onError('Invalid file format. Only JPG, PNG, and WEBP images are allowed.');
      return;
    }

    const maxSize = 2 * 1024 * 1024; // 2 MB
    if (file.size > maxSize) {
      onError('File size exceeds 2 MB limit. Please select a smaller file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        onSuccess(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
    fetchMetaOptions();

    pollIntervalRef.current = setInterval(() => {
      fetchAttendanceData(true);
    }, 30000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [router]);

  // Handle Add Employee Form Submit
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setModalSuccess('');

    if (!formData.employee_id.trim() || !formData.full_name.trim() || !formData.mobile.trim()) {
      setModalError('Please fill in all required fields (Employee ID, Name, Mobile Number).');
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          employee_id: formData.employee_id.trim(),
          full_name: formData.full_name.trim(),
          mobile: formData.mobile.trim(),
          designation: formData.designation,
          shift: formData.shift,
          monthly_salary: formData.monthly_salary,
          profile_photo_url: formData.profile_photo_url || formData.profile_image_url || null,
          profile_image_url: formData.profile_image_url || formData.profile_photo_url || null,
          manager_id: formData.manager_id || null,
          joining_date: formData.joining_date
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create employee');
      }

      setModalSuccess('Employee created successfully!');
      setTimeout(() => {
        setIsAddModalOpen(false);
        setModalSuccess('');
        setFormData({
          employee_id: '',
          full_name: '',
          mobile: '',
          designation: 'Machine Operator',
          shift: 'Morning Shift',
          monthly_salary: '',
          profile_photo_url: '',
          profile_image_url: '',
          manager_id: '',
          joining_date: new Date().toISOString().split('T')[0]
        });
        fetchAttendanceData();
      }, 1000);
    } catch (err: any) {
      setModalError(err.message || 'Error creating employee');
    } finally {
      setSubmitting(false);
    }
  };

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

  const filtered = employees.filter(emp => {
    const matchesSearch = 
      emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employee_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.designation && emp.designation.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesShift = selectedShift === 'All' || emp.shift === selectedShift;

    const todayLog = attendance[emp.id];
    const matchesStatus = selectedStatus === 'All' || 
      (selectedStatus === 'ABSENT' && !todayLog) ||
      (todayLog && todayLog.status === selectedStatus);

    return matchesSearch && matchesShift && matchesStatus;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginatedEmployees = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-cyan-400">Loading Attendance Directory...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-slate-100 pb-12">
      
      {/* Directory Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 glass-panel p-6 rounded-xl border-l-4 border-cyan-400 shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Users className="w-6 h-6 text-cyan-400" />
            <span>Attendance Directory</span>
          </h2>
          <p className="text-xs text-slate-350 mt-1">Enterprise workforce monitoring & profile navigation.</p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {/* + Add Employee Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Add Employee</span>
          </button>

          {/* Reload Directory Button */}
          <button
            onClick={() => fetchAttendanceData()}
            disabled={refreshing}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-750 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Syncing...' : 'Reload Directory'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search Name, ID, Designation..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
            />
          </div>

          {/* Shift Filter */}
          <select
            value={selectedShift}
            onChange={(e) => { setSelectedShift(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-cyan-400 transition-colors"
          >
            <option value="All">All Shifts</option>
            <option value="Morning Shift">Morning Shift</option>
            <option value="Night Shift">Night Shift</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-cyan-400 transition-colors"
          >
            <option value="All">All Today Statuses</option>
            <option value="PRESENT">Present</option>
            <option value="WORKING">Working</option>
            <option value="LATE">Late</option>
            <option value="MISSED_CHECKOUT">Missed Checkout</option>
            <option value="ABSENT">Absent</option>
          </select>
        </div>
      </div>

      {/* Directory Data Table */}
      <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/40">
                <th className="px-4 py-3.5">Employee Info</th>
                <th className="px-4 py-3.5">Designation & Shift</th>
                <th className="px-4 py-3.5">Reporting Manager</th>
                <th className="px-4 py-3.5">Today Status</th>
                <th className="px-4 py-3.5">Check-In</th>
                <th className="px-4 py-3.5">Check-Out</th>
                <th className="px-4 py-3.5">Hours</th>
                <th className="px-4 py-3.5">Last Attendance</th>
                <th className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/60">
              {paginatedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500 font-semibold">
                    No matching employee records found.
                  </td>
                </tr>
              ) : (
                paginatedEmployees.map((emp) => {
                  const todayLog = attendance[emp.id];
                  const status = todayLog ? todayLog.status : 'ABSENT';
                  const checkIn = todayLog ? todayLog.check_in_time : null;
                  const checkOut = todayLog ? todayLog.check_out_time : null;
                  const workingHours = todayLog ? todayLog.working_hours : null;
                  const lastDate = lastAttendanceDates[emp.id] || emp.joining_date?.split('T')[0] || '--';

                  return (
                    <tr 
                      key={emp.id} 
                      className="hover:bg-slate-900/40 transition-colors group"
                    >
                      {/* Employee Photo & Name (Clickable Name) */}
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center space-x-3">
                          {emp.profile_photo_url || emp.profile_image_url ? (
                            <img 
                              src={emp.profile_photo_url || emp.profile_image_url!} 
                              alt={emp.full_name} 
                              className="w-8 h-8 rounded-full border border-slate-700 object-cover shrink-0" 
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-850 border border-slate-750 flex items-center justify-center font-bold text-cyan-400 text-xs shrink-0">
                              {emp.full_name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <button
                              onClick={() => router.push(`/attendance/${emp.id}`)}
                              className="font-bold text-slate-100 hover:text-cyan-400 transition-colors text-left font-sans block"
                            >
                              {emp.full_name}
                            </button>
                            <span className="text-[10px] text-slate-450 font-mono block">{emp.employee_id} • {emp.mobile}</span>
                          </div>
                        </div>
                      </td>

                      {/* Designation & Shift */}
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-200 block">{emp.designation || 'Staff'}</span>
                        <span className="text-[10px] text-slate-450 block">{emp.shift || 'Morning Shift'}</span>
                      </td>

                      {/* Reporting Manager */}
                      <td className="px-4 py-3 font-medium text-slate-300">
                        {emp.reporting_manager || 'Not Assigned'}
                      </td>

                      {/* Today Status Badge */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          status === 'PRESENT' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' :
                          status === 'WORKING' ? 'bg-sky-950/40 text-sky-400 border border-sky-500/20' :
                          status === 'LATE' ? 'bg-amber-950/40 text-amber-400 border border-amber-500/20' :
                          status === 'MISSED_CHECKOUT' ? 'bg-orange-950/40 text-orange-400 border border-orange-500/20' :
                          'bg-rose-950/40 text-rose-400 border border-rose-500/20'
                        }`}>
                          {status}
                        </span>
                      </td>

                      {/* Check-In */}
                      <td className="px-4 py-3 font-mono text-slate-300">
                        {formatTime(checkIn)}
                      </td>

                      {/* Check-Out */}
                      <td className="px-4 py-3 font-mono text-slate-300">
                        {formatTime(checkOut)}
                      </td>

                      {/* Working Hours */}
                      <td className="px-4 py-3 font-mono text-cyan-400 font-bold">
                        {workingHours || '--'}
                      </td>

                      {/* Last Attendance Date */}
                      <td className="px-4 py-3 font-mono text-slate-450 text-[11px]">
                        {lastDate}
                      </td>

                      {/* Action: View Profile */}
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => router.push(`/attendance/${emp.id}`)}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-750 text-cyan-400 text-xs font-bold transition-all group-hover:border-cyan-500/40 cursor-pointer"
                        >
                          <span>View Profile</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/30 flex items-center justify-between text-xs text-slate-400">
          <span>Showing {paginatedEmployees.length} of {filtered.length} employees</span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 hover:bg-slate-800 text-slate-300"
            >
              Previous
            </button>
            <span className="font-mono text-cyan-400 font-bold">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 hover:bg-slate-800 text-slate-300"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* + Add Employee Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel border border-slate-750 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2 text-cyan-400">
                <UserPlus className="w-5 h-5" />
                <h3 className="font-bold text-white text-base">Add New Employee</h3>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-850 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddEmployee} className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto">
              
              {modalError && (
                <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-300 font-semibold flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {modalSuccess && (
                <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 font-semibold flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{modalSuccess}</span>
                </div>
              )}

              {/* Profile Picture Uploader */}
              <div className="flex items-center space-x-4 p-3 bg-slate-950/60 border border-slate-800 rounded-xl mb-4">
                <div className="relative shrink-0">
                  {formData.profile_photo_url || formData.profile_image_url ? (
                    <img
                      src={formData.profile_photo_url || formData.profile_image_url}
                      alt="Preview"
                      className="w-14 h-14 rounded-full object-cover border-2 border-cyan-500/50 shadow-md"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-slate-900 border-2 border-slate-700 flex items-center justify-center text-cyan-400 font-bold text-lg shadow-inner">
                      {formData.full_name ? formData.full_name.charAt(0).toUpperCase() : <User className="w-7 h-7 text-slate-400" />}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Profile Picture (JPG, PNG, WEBP max 2MB)</span>
                  <div className="flex items-center space-x-2">
                    <label className="px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 hover:bg-cyan-900/40 text-cyan-300 font-bold text-[11px] cursor-pointer transition-colors inline-flex items-center space-x-1">
                      <Camera className="w-3.5 h-3.5" />
                      <span>{formData.profile_photo_url || formData.profile_image_url ? 'Change Photo' : 'Upload Photo'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            validateAndReadImageFile(
                              file,
                              (url) => setFormData(prev => ({ ...prev, profile_photo_url: url, profile_image_url: url })),
                              (err) => setModalError(err)
                            );
                          }
                        }}
                      />
                    </label>

                    {(formData.profile_photo_url || formData.profile_image_url) && (
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, profile_photo_url: '', profile_image_url: '' }))}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 border border-rose-500/30 hover:bg-rose-900/40 text-rose-400 font-semibold text-[11px] transition-colors flex items-center space-x-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Balanced 2-Column Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Row 1: Employee ID */}
                <div>
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Employee ID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GC-105"
                    required
                    value={formData.employee_id}
                    onChange={e => setFormData({ ...formData, employee_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Row 1: Employee Name */}
                <div>
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Full Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    required
                    value={formData.full_name}
                    onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Row 2: Mobile Number */}
                <div>
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Mobile Number <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 9876543210"
                    required
                    value={formData.mobile}
                    onChange={e => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Row 2: Joining Date */}
                <div>
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Joining Date
                  </label>
                  <input
                    type="date"
                    value={formData.joining_date}
                    onChange={e => setFormData({ ...formData, joining_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Row 3: Designation (Predefined Dropdown) */}
                <div>
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Designation
                  </label>
                  <select
                    value={formData.designation}
                    onChange={e => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-400"
                  >
                    {DESIGNATION_OPTIONS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {/* Row 3: Assigned Shift (Predefined Dropdown) */}
                <div>
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Assigned Shift
                  </label>
                  <select
                    value={formData.shift}
                    onChange={e => setFormData({ ...formData, shift: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-400"
                  >
                    {SHIFT_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Row 4: Monthly Salary (₹) (Full Width) */}
                <div className="sm:col-span-2">
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Monthly Salary (₹) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 12000, 15000, 18000"
                    required
                    value={formData.monthly_salary}
                    onChange={e => setFormData({ ...formData, monthly_salary: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>

                {/* Row 5: Reporting Manager (Full Width) */}
                <div className="sm:col-span-2">
                  <label className="block text-slate-350 font-bold uppercase text-[10px] tracking-wider mb-1">
                    Reporting Manager
                  </label>
                  <select
                    value={formData.manager_id}
                    onChange={e => setFormData({ ...formData, manager_id: e.target.value })}
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

              </div>

              {/* Form Buttons */}
              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-750 text-slate-300 font-semibold hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Employee'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
