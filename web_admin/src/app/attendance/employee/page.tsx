"use client";

import React, { useState, useEffect } from 'react';
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

import { API_URL } from '../../../config';

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
  profile_photo_url: string | null;
}

interface AttendanceStatus {
  employee_id: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
}

export default function EmployeeAttendanceListPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  const fetchEmployeesData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setError('');
      
      // 1. Fetch all employees
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

      // 2. Fetch today's attendance logs to display current status
      const todayStr = new Date().toISOString().split('T')[0];
      const attRes = await fetch(`${API_URL}/attendance/history?start_date=${todayStr}&end_date=${todayStr}&limit=200`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const attMap: Record<string, AttendanceStatus> = {};
      if (attRes.ok) {
        const attData = await attRes.json();
        const logs = attData.logs || [];
        logs.forEach((log: any) => {
          attMap[log.employee_uuid || log.id] = {
            employee_id: log.employee_uuid || log.id,
            status: log.status,
            check_in_time: log.check_in_time,
            check_out_time: log.check_out
          };
        });
      }

      setEmployees(empList);
      setAttendance(attMap);
    } catch (err: any) {
      setError(err.message || 'Error connecting to database server.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployeesData();
  }, [router]);

  const filteredEmployees = employees.filter(emp => 
    emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.employee_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (emp.department && emp.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (emp.designation && emp.designation.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getStatusBadge = (empId: string) => {
    const record = attendance[empId];
    if (!record) {
      return (
        <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-955/30 text-rose-400 border border-rose-500/20">
          <UserX className="w-3 h-3 text-rose-400" />
          <span>Absent</span>
        </span>
      );
    }

    const status = record.status;
    if (status === 'WORKING') {
      return (
        <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-950/30 text-sky-400 border border-sky-500/20">
          <Clock className="w-3 h-3 text-sky-400" />
          <span>Working ({record.check_in_time ? record.check_in_time.substring(0, 5) : '--:--'})</span>
        </span>
      );
    }

    if (status === 'PRESENT') {
      return (
        <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/30 text-emerald-400 border border-emerald-500/20">
          <UserCheck className="w-3 h-3 text-emerald-400" />
          <span>Present</span>
        </span>
      );
    }

    if (status === 'LATE') {
      return (
        <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/30 text-amber-400 border border-amber-500/20">
          <AlertCircle className="w-3 h-3 text-amber-400" />
          <span>Late</span>
        </span>
      );
    }

    if (status === 'MISSED_CHECKOUT') {
      return (
        <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/35 text-rose-450 border border-rose-500/20">
          <AlertCircle className="w-3 h-3 text-rose-450" />
          <span>Missed Checkout</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900/60 text-slate-400 border border-slate-700/30">
        <span>{status}</span>
      </span>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in text-slate-100">
      
      {/* Search Header toolbar */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by Employee name, ID, department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-slate-550 outline-none transition-all"
          />
        </div>

        <button
          onClick={fetchEmployeesData}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-cyan-400 hover:border-cyan-400 text-xs font-bold flex items-center space-x-2 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Syncing...' : 'Reload Directory'}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Grid of employees cards */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-sm text-cyan-400 font-bold">Querying corporate staff listings...</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="glass-panel text-center py-20 text-slate-400 font-semibold text-xs border border-slate-750">
          No employees found matching search query.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEmployees.map((emp) => (
            <div 
              key={emp.id} 
              className="glass-panel p-5 rounded-xl border border-slate-700 hover:border-cyan-500/30 transition-all flex flex-col justify-between shadow-lg relative group overflow-hidden"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3.5">
                    {emp.profile_photo_url ? (
                      <img 
                        src={emp.profile_photo_url} 
                        alt={emp.full_name} 
                        className="w-11 h-11 rounded-full border border-slate-650 object-cover" 
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-slate-800 border border-slate-650 flex items-center justify-center font-bold text-cyan-400 text-base">
                        {emp.full_name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-white text-sm group-hover:text-cyan-400 transition-colors">{emp.full_name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{emp.employee_id}</p>
                    </div>
                  </div>
                  {getStatusBadge(emp.id)}
                </div>

                <div className="grid grid-cols-2 gap-y-2.5 mt-5 border-t border-slate-800/80 pt-4 text-[11px] text-slate-350">
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase block">Department</span>
                    <span className="font-semibold">{emp.department || 'General'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase block">Designation</span>
                    <span className="font-semibold">{emp.designation || 'Staff'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase block">Assigned Shift</span>
                    <span className="font-semibold font-mono text-cyan-400">{emp.shift || 'Default Shift'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase block">Mobile</span>
                    <span className="font-semibold font-mono">{emp.mobile || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-slate-850 pt-4 flex justify-between items-center">
                <span className="text-[10px] text-slate-500">Joined: {new Date(emp.joining_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                <button
                  onClick={() => router.push(`/attendance/employee/${emp.id}`)}
                  className="px-3.5 py-1.5 bg-slate-900 border border-slate-850 hover:border-cyan-400 text-cyan-400 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5"
                >
                  <span>Profile Console</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
