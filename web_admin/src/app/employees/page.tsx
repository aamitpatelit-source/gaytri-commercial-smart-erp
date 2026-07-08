"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  UserPlus, 
  Filter, 
  Trash2, 
  Edit3, 
  X, 
  AlertTriangle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import { API_URL } from '../../config';




interface Employee {
  id: string;
  employee_id: string;
  full_name: string;
  department: string;
  shift: string;
  mobile: string;
  is_active: boolean;
}

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Add/Edit Modals states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [onboardedCredentials, setOnboardedCredentials] = useState<{ employee_id: string; full_name: string } | null>(null);

  // Form inputs state
  const [empForm, setEmpForm] = useState({
    employee_id: '',
    full_name: '',
    department: 'Production',
    shift: 'Morning Shift',
    mobile: '',
    is_active: true,
  });

  const [deletingEmp, setDeletingEmp] = useState<{ id: string; name: string } | null>(null);


  const showToastMsg = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchEmployees = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoading(true);
      const res = await fetch(`${API_URL}/employees`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setEmployees(data.employees || []);
      } else {
        setError(data.message || 'Failed to retrieve employee directory.');
      }
    } catch (err: any) {
      setError('Could not establish database connection.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          employee_id: empForm.employee_id,
          full_name: empForm.full_name,
          department: empForm.department,
          shift: empForm.shift,
          mobile: empForm.mobile,
          is_active: empForm.is_active,
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setOnboardedCredentials({
          employee_id: data.employee.employee_id,
          full_name: data.employee.full_name,
        });
        showToastMsg('success', 'Employee onboarded successfully');
        setShowAddModal(false);
        setEmpForm({
          employee_id: '',
          full_name: '',
          department: 'Production',
          shift: 'Morning Shift',
          mobile: '',
          is_active: true,
        });
        fetchEmployees();
      } else {
        let errorMsg = data.message || 'Failed to onboard employee.';
        if (errorMsg.includes('Internal server error')) {
          errorMsg = 'Server temporarily unavailable';
        }
        showToastMsg('error', errorMsg);
      }
    } catch (err) {
      showToastMsg('error', 'Server temporarily unavailable');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/employees/${editingEmployee.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          full_name: empForm.full_name,
          department: empForm.department,
          shift: empForm.shift,
          mobile: empForm.mobile,
          is_active: empForm.is_active,
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Employee updated successfully');
        setEditingEmployee(null);
        fetchEmployees();
      } else {
        let errorMsg = data.message || 'Failed to edit employee.';
        if (errorMsg.includes('Internal server error')) {
          errorMsg = 'Server temporarily unavailable';
        }
        showToastMsg('error', errorMsg);
      }
    } catch (err) {
      showToastMsg('error', 'Server temporarily unavailable');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!deletingEmp) return;
    const { id } = deletingEmp;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/employees/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Employee deleted successfully');
        setDeletingEmp(null);
        fetchEmployees();
      } else {
        let errorMsg = data.message || 'Failed to remove employee.';
        if (errorMsg.includes('Internal server error')) {
          errorMsg = 'Server temporarily unavailable';
        }
        showToastMsg('error', errorMsg);
      }
    } catch (err) {
      showToastMsg('error', 'Server temporarily unavailable');
    } finally {
      setActionLoading(false);
    }
  };



  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmpForm({
      employee_id: emp.employee_id,
      full_name: emp.full_name,
      department: emp.department,
      shift: emp.shift,
      mobile: emp.mobile,
      is_active: emp.is_active !== false,
    });
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.employee_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = selectedDept === 'ALL' || emp.department === selectedDept;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-8 text-slate-100 relative">
      <div className="space-y-8 animate-fade-in">
      
      {/* Toast Alert Header Bar */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center space-x-3 px-4 py-3 rounded-lg border shadow-lg text-sm font-semibold transition-all ${
          toast.type === 'success' 
            ? 'bg-emerald-950/90 text-emerald-450 border-emerald-500/30' 
            : 'bg-rose-950/90 text-rose-450 border-rose-500/30'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-450" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Search and Action Toolbar header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-slate-350" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or employee ID..."
            className="w-full pl-10 pr-4 py-2.5 glass-input text-sm text-white"
          />
        </div>

        <div className="flex space-x-3">
          {/* Department Filter dropdown */}
          <div className="relative">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="pl-3 pr-8 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold text-cyan-400 focus:outline-none focus:border-cyan-500 appearance-none cursor-pointer hover:border-cyan-400"
            >
              <option value="ALL">All Departments</option>
              <option value="Production">Production</option>
              <option value="Quality Control">Quality Control</option>
              <option value="Logistics">Logistics</option>
              <option value="Administration">Administration</option>
            </select>
            <Filter className="absolute right-2.5 top-3.5 w-3.5 h-3.5 text-cyan-400 pointer-events-none" />
          </div>

          <button
            onClick={() => {
              setEmpForm({
                employee_id: '',
                full_name: '',
                department: 'Production',
                shift: 'Morning Shift',
                mobile: '',
                is_active: true,
              });
              setShowAddModal(true);
            }}
            className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold flex items-center space-x-2 shadow-neon-glow text-xs"
          >
            <UserPlus className="w-4 h-4 text-slate-950" />
            <span>Onboard Employee</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-350 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Main Employee Directory list */}
      <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
            Active Staff Register ({filteredEmployees.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs text-cyan-400 font-bold">Querying employees directory...</p>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-semibold text-xs">
              No employees registered under current selection criteria.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-200 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/30">
                  <th className="pb-3 pt-4 pl-6 w-[12%]">Employee ID</th>
                  <th className="pb-3 pt-4 w-[20%]">Name</th>
                  <th className="pb-3 pt-4 w-[14%]">Department</th>
                  <th className="pb-3 pt-4 w-[14%]">Assigned Shift</th>
                  <th className="pb-3 pt-4 w-[14%]">Mobile</th>
                  <th className="pb-3 pt-4 w-[14%]">Status</th>
                  <th className="pb-3 pt-4 pr-6 text-center w-[12%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-300">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                    <td className="py-4 pl-6 font-mono text-cyan-400 font-extrabold">{emp.employee_id}</td>
                    <td className="py-4 font-bold text-white text-sm">{emp.full_name}</td>
                    <td className="py-4 font-semibold text-slate-200">{emp.department}</td>
                    <td className="py-4 font-medium text-slate-200">{emp.shift}</td>
                    <td className="py-4 font-mono text-slate-200">{emp.mobile}</td>
                    <td className="py-4">
                      {emp.is_active !== false ? (
                        <span className="w-fit px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-950/35 text-emerald-450 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="w-fit px-2 py-0.5 rounded text-[9px] font-bold bg-rose-950/30 text-rose-400 border border-rose-500/20">
                          SUSPENDED
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-6 text-center">
                      <div className="flex items-center justify-center space-x-2.5">
                        <button
                          onClick={() => openEditModal(emp)}
                          className="p-1.5 rounded bg-slate-900 border border-slate-750 hover:bg-cyan-950/20 hover:text-cyan-400 text-slate-400 transition-colors"
                          title="Edit Profile"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingEmp({ id: emp.id, name: emp.full_name })}
                          className="p-1.5 rounded bg-slate-900 border border-slate-750 hover:bg-rose-950/20 hover:text-rose-450 text-slate-400 transition-colors"
                          title="Delete Profile"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Onboard Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => setShowAddModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-350 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <UserPlus className="w-5 h-5 text-cyan-400" />
              <h3 className="font-extrabold text-base text-white">Onboard New Employee</h3>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-4">
              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Employee ID</label>
                <input
                  type="text"
                  value={empForm.employee_id}
                  onChange={(e) => setEmpForm({...empForm, employee_id: e.target.value})}
                  placeholder="e.g. GC-025"
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Full Name</label>
                <input
                  type="text"
                  value={empForm.full_name}
                  onChange={(e) => setEmpForm({...empForm, full_name: e.target.value})}
                  placeholder="e.g. Rajesh Sharma"
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Mobile Number</label>
                <input
                  type="text"
                  value={empForm.mobile}
                  onChange={(e) => setEmpForm({...empForm, mobile: e.target.value})}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Department</label>
                  <select
                    value={empForm.department}
                    onChange={(e) => setEmpForm({...empForm, department: e.target.value})}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-500 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-cyan-400 transition-colors"
                  >
                    <option value="Production">Production</option>
                    <option value="Quality Control">Quality Control</option>
                    <option value="Logistics">Logistics</option>
                    <option value="Administration">Administration</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Assigned Shift</label>
                  <select
                    value={empForm.shift}
                    onChange={(e) => setEmpForm({...empForm, shift: e.target.value})}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-500 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-cyan-400 transition-colors"
                  >
                    <option value="Morning Shift">Morning Shift</option>
                    <option value="Night Shift">Night Shift</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 mt-6 disabled:opacity-50"
              >
                {actionLoading ? 'Creating...' : 'Onboard Employee'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => setEditingEmployee(null)}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-350 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <Edit3 className="w-5 h-5 text-cyan-400" />
              <h3 className="font-extrabold text-base text-white">Edit Employee Profile</h3>
            </div>

            <form onSubmit={handleUpdateEmployee} className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-350 font-extrabold uppercase tracking-wider block mb-1">Employee ID (Read-only)</label>
                <input
                  type="text"
                  value={empForm.employee_id}
                  disabled
                  className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-xs font-mono text-slate-400 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Full Name</label>
                <input
                  type="text"
                  value={empForm.full_name}
                  onChange={(e) => setEmpForm({...empForm, full_name: e.target.value})}
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Mobile Number</label>
                <input
                  type="text"
                  value={empForm.mobile}
                  onChange={(e) => setEmpForm({...empForm, mobile: e.target.value})}
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Department</label>
                  <select
                    value={empForm.department}
                    onChange={(e) => setEmpForm({...empForm, department: e.target.value})}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-500 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-cyan-400 transition-colors"
                  >
                    <option value="Production">Production</option>
                    <option value="Quality Control">Quality Control</option>
                    <option value="Logistics">Logistics</option>
                    <option value="Administration">Administration</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Assigned Shift</label>
                  <select
                    value={empForm.shift}
                    onChange={(e) => setEmpForm({...empForm, shift: e.target.value})}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-500 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-cyan-400 transition-colors"
                  >
                    <option value="Morning Shift">Morning Shift</option>
                    <option value="Night Shift">Night Shift</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Account Status</label>
                <select
                  value={empForm.is_active ? "true" : "false"}
                  onChange={(e) => setEmpForm({...empForm, is_active: e.target.value === "true"})}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-550 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-cyan-400 transition-colors"
                >
                  <option value="true">Active</option>
                  <option value="false">Suspended</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 mt-6 disabled:opacity-50"
              >
                {actionLoading ? 'Saving...' : 'Update Employee Profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingEmp && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.6)] p-6 relative text-center">
            <div className="w-12 h-12 rounded-full bg-rose-950/30 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-rose-500 animate-pulse" />
            </div>
            <h3 className="font-extrabold text-base text-white mb-2">Delete Employee Profile</h3>
            <p className="text-xs text-slate-355 leading-relaxed mb-6">
              Are you sure you want to permanently remove <span className="text-white font-bold">{deletingEmp.name}</span> from the employee directory? This action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setDeletingEmp(null)}
                className="flex-1 py-2.5 rounded-lg bg-slate-900 border border-slate-750 text-slate-350 hover:text-white hover:bg-slate-850 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEmployee}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-40"
              >
                {actionLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarded Confirmation Modal */}
      {onboardedCredentials && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.15)] p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto mb-4">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="font-extrabold text-base text-white mb-1">Employee Profile Created!</h3>
            <p className="text-xs text-slate-350 mb-6">
              Employee profile has been successfully created. You can now activate their secure credentials.
            </p>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-left font-mono space-y-2 mb-6 text-xs select-all">
              <div>
                <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider">Employee ID:</span>
                <span className="text-cyan-400 font-bold">{onboardedCredentials.employee_id}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider">Full Name:</span>
                <span className="text-white font-bold">{onboardedCredentials.full_name}</span>
              </div>
            </div>

            <button
              onClick={() => setOnboardedCredentials(null)}
              className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs transition-all shadow-neon-glow flex items-center justify-center cursor-pointer"
            >
              Done Onboarding
            </button>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
