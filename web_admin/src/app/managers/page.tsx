"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  UserPlus, 
  Trash2, 
  KeyRound, 
  X, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Shield, 
  Search,
  Edit3,
  Save,
  ShieldAlert
} from 'lucide-react';
import { API_URL } from '../../config';

interface Manager {
  id: string;
  email: string;
  full_name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER';
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  employee_count?: number;
  departments?: number[];
}

export default function ManagersPage() {
  const router = useRouter();
  const [managers, setManagers] = useState<Manager[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTargetUser, setEditTargetUser] = useState<Manager | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<Manager | null>(null);
  const [deletingUser, setDeletingUser] = useState<Manager | null>(null);

  // Assignment Modals state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTargetUser, setAssignTargetUser] = useState<Manager | null>(null);
  const [assignEmployeesList, setAssignEmployeesList] = useState<any[]>([]);
  const [assignSearchTerm, setAssignSearchTerm] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  // Form inputs state
  const [managerForm, setManagerForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'MANAGER' as 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER'
  });
  const [selectedDepts, setSelectedDepts] = useState<number[]>([]);
  const [resetPasswordVal, setResetPasswordVal] = useState('');

  const showToastMsg = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAssignEmployees = async (managerId: string) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;
      setAssignLoading(true);
      const res = await fetch(`${API_URL}/auth/managers/${managerId}/employees`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setAssignEmployeesList(data.employees || []);
      }
    } catch (e) {
      console.error(e);
      showToastMsg('error', 'Failed to fetch employee assignment list.');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleSaveAssignments = async () => {
    if (!assignTargetUser) return;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const selectedIds = assignEmployeesList
        .filter(emp => emp.is_assigned)
        .map(emp => emp.id);

      const res = await fetch(`${API_URL}/auth/managers/${assignTargetUser.id}/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ employee_ids: selectedIds })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Employee assignments updated successfully.');
        setShowAssignModal(false);
        setAssignTargetUser(null);
        fetchManagers();
      } else {
        showToastMsg('error', data.message || 'Failed to update assignments.');
      }
    } catch (e) {
      showToastMsg('error', 'Connection to server failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignAllEmployees = async (managerId: string) => {
    if (!confirm('Are you sure you want to assign all active employees to this manager?')) return;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/auth/managers/${managerId}/assign-all`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', data.message || 'All active employees assigned successfully.');
        fetchManagers();
        if (showAssignModal && assignTargetUser?.id === managerId) {
          fetchAssignEmployees(managerId);
        }
      } else {
        showToastMsg('error', data.message || 'Failed to assign all employees.');
      }
    } catch (e) {
      showToastMsg('error', 'Connection to server failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;
      const res = await fetch(`${API_URL}/company/departments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setDepartments(data.departments || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchManagers = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoading(true);
      setError('');
      
      const res = await fetch(`${API_URL}/auth/managers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setManagers(data.managers || []);
      } else {
        setError(data.message || 'Failed to retrieve manager accounts.');
      }
    } catch (err: any) {
      setError('Could not establish database connection.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManagers();
    fetchDepartments();
  }, []);

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const payload = {
        ...managerForm,
        departments: managerForm.role === 'MANAGER' ? selectedDepts : []
      };

      const res = await fetch(`${API_URL}/auth/managers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', `${managerForm.role} account created successfully.`);
        setShowAddModal(false);
        setManagerForm({
          full_name: '',
          email: '',
          password: '',
          role: 'MANAGER'
        });
        setSelectedDepts([]);
        fetchManagers();
      } else {
        showToastMsg('error', data.message || 'Failed to create account.');
      }
    } catch (err) {
      showToastMsg('error', 'Server temporarily unavailable');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTargetUser) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const payload = {
        full_name: managerForm.full_name,
        email: managerForm.email,
        role: managerForm.role,
        departments: managerForm.role === 'MANAGER' ? selectedDepts : []
      };

      const res = await fetch(`${API_URL}/auth/managers/${editTargetUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Operator account details updated.');
        setShowEditModal(false);
        setEditTargetUser(null);
        setSelectedDepts([]);
        fetchManagers();
      } else {
        showToastMsg('error', data.message || 'Failed to update account.');
      }
    } catch (err) {
      showToastMsg('error', 'Server connection failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (user: Manager) => {
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/auth/managers/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: !user.is_active })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', `Account ${user.is_active ? 'deactivated' : 'activated'} successfully.`);
        fetchManagers();
      } else {
        showToastMsg('error', data.message || 'Failed to toggle status.');
      }
    } catch (err) {
      showToastMsg('error', 'Connection to server failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    if (resetPasswordVal.length < 6) {
      showToastMsg('error', 'Password must be at least 6 characters.');
      return;
    }
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/auth/managers/${resetTargetUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: resetPasswordVal })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Password reset successfully. User will be prompted to change it.');
        setShowResetModal(false);
        setResetTargetUser(null);
        setResetPasswordVal('');
        fetchManagers();
      } else {
        showToastMsg('error', data.message || 'Failed to reset password.');
      }
    } catch (err) {
      showToastMsg('error', 'Connection to server failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteManager = async () => {
    if (!deletingUser) return;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/auth/managers/${deletingUser.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Account deleted successfully.');
        setDeletingUser(null);
        fetchManagers();
      } else {
        showToastMsg('error', data.message || 'Failed to delete account.');
      }
    } catch (err) {
      showToastMsg('error', 'Server temporarily unavailable');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeptToggle = (deptId: number) => {
    if (selectedDepts.includes(deptId)) {
      setSelectedDepts(selectedDepts.filter(id => id !== deptId));
    } else {
      setSelectedDepts([...selectedDepts, deptId]);
    }
  };

  const filteredManagers = managers.filter(user => {
    const matchesSearch = user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          user.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="space-y-8 text-slate-100 relative">
      {/* Toast HUD */}
      {toast && (
        <div className={`fixed top-6 right-6 z-55 flex items-center space-x-3 px-4 py-3 rounded-lg border shadow-lg text-sm font-semibold transition-all ${
          toast.type === 'success' 
            ? 'bg-emerald-950/90 text-emerald-450 border-emerald-500/30' 
            : 'bg-rose-955/90 text-rose-455 border-rose-500/30'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="glass-panel p-6 rounded-xl flex items-center justify-between border-l-4 border-cyan-400 shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <span>Operator & Manager Accounts</span>
            <Shield className="w-5 h-5 text-cyan-400" />
          </h2>
          <p className="text-sm text-slate-350 mt-1">Manage corporate operators, set department permissions, and configure mobile supervisor access scopes.</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-slate-350" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by operator name or email..."
            className="w-full pl-10 pr-4 py-2.5 glass-input text-sm text-white"
          />
        </div>

        <button
          onClick={() => {
            setManagerForm({ full_name: '', email: '', password: '', role: 'MANAGER' });
            setSelectedDepts([]);
            setShowAddModal(true);
          }}
          className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold flex items-center space-x-2 shadow-neon-glow text-xs border-0 cursor-pointer"
        >
          <UserPlus className="w-4 h-4 text-slate-950" />
          <span>Onboard Operator</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-955/40 border border-rose-500/40 text-rose-300 text-xs font-semibold animate-pulse">
          {error}
        </div>
      )}

      {/* Directory Table */}
      <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
            Operational Directory ({filteredManagers.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs text-cyan-400 font-bold">Querying directory...</p>
            </div>
          ) : filteredManagers.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-semibold text-xs">
              No accounts registered.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-200 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/30">
                  <th className="pb-3 pt-4 pl-6 w-[20%]">Name</th>
                  <th className="pb-3 pt-4 w-[25%]">Email</th>
                  <th className="pb-3 pt-4 w-[15%]">Role</th>
                  <th className="pb-3 pt-4 w-[20%] text-center">Assigned Employees Count</th>
                  <th className="pb-3 pt-4 w-[10%] text-center">Status</th>
                  <th className="pb-3 pt-4 pr-6 text-center w-[10%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-350">
                {filteredManagers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                    <td className="py-4 pl-6 font-bold text-white text-sm">{user.full_name}</td>
                    <td className="py-4 font-semibold text-slate-200">{user.email}</td>
                    <td className="py-4 font-mono font-semibold">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                        user.role === 'SUPER_ADMIN' 
                          ? 'bg-rose-955/20 text-rose-455 border-rose-500/20' 
                          : user.role === 'ADMIN'
                          ? 'bg-cyan-950/20 text-cyan-400 border-cyan-500/20'
                          : 'bg-amber-955/20 text-amber-450 border-amber-500/20'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-4 text-center font-mono font-bold text-slate-100 text-sm">
                      {user.role === 'MANAGER' ? (
                        <span className="text-cyan-400">
                          {user.employee_count ?? 0} Employees
                        </span>
                      ) : (
                        <span className="text-slate-500 font-semibold italic text-[10px]">Global Scope</span>
                      )}
                    </td>
                    <td className="py-4 text-center">
                      <button
                        onClick={() => handleToggleActive(user)}
                        disabled={actionLoading}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold border bg-transparent cursor-pointer transition-all ${
                          user.is_active 
                            ? 'text-emerald-450 border-emerald-500/20 hover:bg-rose-955/20 hover:text-rose-400 hover:border-rose-500/20' 
                            : 'text-rose-400 border-rose-500/20 hover:bg-emerald-950/20 hover:text-emerald-400 hover:border-emerald-500/20'
                        }`}
                        title={user.is_active ? "Suspend Account" : "Activate Account"}
                      >
                        {user.is_active ? 'ACTIVE' : 'SUSPENDED'}
                      </button>
                    </td>
                    <td className="py-4 pr-6 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        {user.role === 'MANAGER' && (
                          <button
                            onClick={() => {
                              setAssignTargetUser(user);
                              setAssignSearchTerm('');
                              fetchAssignEmployees(user.id);
                              setShowAssignModal(true);
                            }}
                            className="p-1.5 rounded bg-slate-900 border border-slate-750 hover:bg-cyan-950/20 hover:text-cyan-400 text-slate-400 transition-colors cursor-pointer"
                            title="Assign Employees"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditTargetUser(user);
                            setManagerForm({
                              full_name: user.full_name,
                              email: user.email,
                              password: '',
                              role: user.role
                            });
                            setSelectedDepts(user.departments || []);
                            setShowEditModal(true);
                          }}
                          className="p-1.5 rounded bg-slate-900 border border-slate-750 hover:bg-cyan-950/20 hover:text-cyan-400 text-slate-400 transition-colors cursor-pointer"
                          title="Edit Operator Settings"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setResetTargetUser(user);
                            setShowResetModal(true);
                          }}
                          className="p-1.5 rounded bg-slate-900 border border-slate-750 hover:bg-cyan-950/20 hover:text-cyan-400 text-slate-400 transition-colors cursor-pointer"
                          title="Reset Password"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingUser(user)}
                          className="p-1.5 rounded bg-slate-900 border border-slate-750 hover:bg-rose-955/20 hover:text-rose-455 text-slate-400 transition-colors cursor-pointer"
                          title="Delete Account"
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

      {/* Onboard Operator Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in animate-scale-up">
          <div className="w-full max-w-md glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setShowAddModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-355 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <UserPlus className="w-5 h-5 text-cyan-400" />
              <h3 className="font-extrabold text-base text-white">Onboard Operator Account</h3>
            </div>

            <form onSubmit={handleCreateManager} className="space-y-4">
              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Full Name</label>
                <input
                  type="text"
                  value={managerForm.full_name}
                  onChange={(e) => setManagerForm({...managerForm, full_name: e.target.value})}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-2.5 glass-input text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Email Address</label>
                <input
                  type="email"
                  value={managerForm.email}
                  onChange={(e) => setManagerForm({...managerForm, email: e.target.value})}
                  placeholder="e.g. ramesh@gaytri.com"
                  className="w-full px-3 py-2.5 glass-input text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Initial System Password</label>
                <input
                  type="password"
                  value={managerForm.password}
                  onChange={(e) => setManagerForm({...managerForm, password: e.target.value})}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3 py-2.5 glass-input text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Access Role</label>
                <select
                  value={managerForm.role}
                  onChange={(e) => setManagerForm({...managerForm, role: e.target.value as any})}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-750 rounded-lg text-xs font-bold text-white focus:outline-none cursor-pointer hover:border-cyan-400 transition-colors"
                >
                  <option value="MANAGER">MANAGER (Mobile App only)</option>
                  <option value="ADMIN">ADMIN (Web Admin panel)</option>
                  <option value="SUPER_ADMIN">SUPER ADMIN (Full system access)</option>
                </select>
              </div>



              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 mt-6 border-0 cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Creating Operator...' : 'Create Operator Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Operator Modal */}
      {showEditModal && editTargetUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in animate-scale-up">
          <div className="w-full max-w-md glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => {
                setShowEditModal(false);
                setEditTargetUser(null);
                setSelectedDepts([]);
              }}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-355 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <Edit3 className="w-5 h-5 text-cyan-400" />
              <h3 className="font-extrabold text-base text-white">Edit Operator Account</h3>
            </div>

            <form onSubmit={handleUpdateManager} className="space-y-4">
              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Full Name</label>
                <input
                  type="text"
                  value={managerForm.full_name}
                  onChange={(e) => setManagerForm({...managerForm, full_name: e.target.value})}
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Email Address</label>
                <input
                  type="email"
                  value={managerForm.email}
                  onChange={(e) => setManagerForm({...managerForm, email: e.target.value})}
                  className="w-full px-3 py-2.5 glass-input text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Access Role</label>
                <select
                  value={managerForm.role}
                  onChange={(e) => setManagerForm({...managerForm, role: e.target.value as any})}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-750 rounded-lg text-xs font-bold text-white focus:outline-none cursor-pointer hover:border-cyan-400 transition-colors"
                >
                  <option value="MANAGER">MANAGER (Mobile App only)</option>
                  <option value="ADMIN">ADMIN (Web Admin panel)</option>
                  <option value="SUPER_ADMIN">SUPER ADMIN (Full system access)</option>
                </select>
              </div>



              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 mt-6 border-0 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4 text-slate-950" />
                <span>Save Changes</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && resetTargetUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => {
                setShowResetModal(false);
                setResetTargetUser(null);
                setResetPasswordVal('');
              }}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-355 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <KeyRound className="w-5 h-5 text-cyan-400" />
              <h3 className="font-extrabold text-base text-white">Reset Password</h3>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <p className="text-xs text-slate-350">
                You are resetting the password for: <br />
                <span className="font-bold text-white">{resetTargetUser.full_name} ({resetTargetUser.email})</span>
              </p>
              
              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">New Secure Password</label>
                <input
                  type="password"
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3 py-2.5 glass-input text-xs text-white"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 mt-4 border-0 cursor-pointer disabled:opacity-50"
              >
                <span>Override & Secure Password</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Operator Modal */}
      {deletingUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-rose-500/30 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => setDeletingUser(null)}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-355 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <h3 className="font-extrabold text-base text-rose-455">Delete Account</h3>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to permanently delete the account for: <br />
                <span className="font-bold text-white">{deletingUser.full_name} ({deletingUser.email})</span>? <br />
                This action is irreversible and blocks all future system logins.
              </p>

              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => setDeletingUser(null)}
                  className="flex-1 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-750 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteManager}
                  disabled={actionLoading}
                  className="flex-1 py-2 rounded-lg bg-rose-955 hover:bg-rose-900 text-white text-xs font-bold transition-colors border-0 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Assign Employees Modal */}
      {showAssignModal && assignTargetUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in animate-scale-up">
          <div className="w-full max-w-lg glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => {
                setShowAssignModal(false);
                setAssignTargetUser(null);
              }}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-355 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="font-extrabold text-base text-white">Assign Employees</h3>
                  <p className="text-[10.5px] text-slate-400 font-semibold">{assignTargetUser.full_name} ({assignTargetUser.email})</p>
                </div>
              </div>
              
              <button
                type="button"
                onClick={() => handleAssignAllEmployees(assignTargetUser.id)}
                disabled={actionLoading}
                className="px-2.5 py-1.5 rounded bg-cyan-950/40 border border-cyan-800/30 hover:bg-cyan-950 text-cyan-400 font-bold text-[10.5px] tracking-wide uppercase transition-colors cursor-pointer disabled:opacity-50"
              >
                Assign All Active
              </button>
            </div>

            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by Employee Name or Code (e.g. GC-87)..."
                value={assignSearchTerm}
                onChange={(e) => setAssignSearchTerm(e.target.value)}
                className="w-full px-3 py-2.5 glass-input text-xs text-white"
              />
            </div>

            {assignLoading ? (
              <div className="py-12 text-center text-xs text-slate-400 font-semibold animate-pulse">Loading employee list...</div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  <span>
                    Selected: {assignEmployeesList.filter(e => e.is_assigned).length} / {assignEmployeesList.length}
                  </span>
                  <div className="space-x-3">
                    <button
                      type="button"
                      onClick={() => setAssignEmployeesList(assignEmployeesList.map(e => ({ ...e, is_assigned: true })))}
                      className="hover:text-white transition-colors cursor-pointer"
                    >
                      Select All
                    </button>
                    <span>|</span>
                    <button
                      type="button"
                      onClick={() => setAssignEmployeesList(assignEmployeesList.map(e => ({ ...e, is_assigned: false })))}
                      className="hover:text-white transition-colors cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-750 rounded-lg p-3 bg-slate-950/60 mb-6">
                  {assignEmployeesList.filter(emp => {
                    if (!assignSearchTerm.trim()) return true;
                    const term = assignSearchTerm.toLowerCase();
                    return emp.full_name.toLowerCase().includes(term) || emp.employee_id.toLowerCase().includes(term);
                  }).length === 0 ? (
                    <p className="text-[11px] text-slate-500 font-semibold text-center py-4">No matching active employees found.</p>
                  ) : (
                    assignEmployeesList.filter(emp => {
                      if (!assignSearchTerm.trim()) return true;
                      const term = assignSearchTerm.toLowerCase();
                      return emp.full_name.toLowerCase().includes(term) || emp.employee_id.toLowerCase().includes(term);
                    }).map((emp) => (
                      <label key={emp.id} className="flex items-center justify-between p-2 rounded hover:bg-slate-900/40 text-xs text-slate-300 hover:text-white cursor-pointer select-none border border-transparent hover:border-slate-800">
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={emp.is_assigned}
                            onChange={() => {
                              setAssignEmployeesList(assignEmployeesList.map(item => 
                                item.id === emp.id ? { ...item, is_assigned: !item.is_assigned } : item
                              ));
                            }}
                            className="w-4 h-4 bg-slate-900 border-slate-700 rounded text-cyan-500 focus:ring-0 cursor-pointer"
                          />
                          <div className="flex flex-col">
                            <span className="font-bold text-white text-xs">{emp.full_name}</span>
                            <span className="text-[9.5px] text-slate-500 font-semibold">{emp.role}</span>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-cyan-500 font-extrabold">{emp.employee_id}</span>
                      </label>
                    ))
                  )}
                </div>

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAssignModal(false);
                      setAssignTargetUser(null);
                    }}
                    className="flex-1 py-2.5 rounded-lg bg-slate-800 border border-slate-750 hover:bg-slate-700 text-slate-355 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAssignments}
                    disabled={actionLoading}
                    className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 border-0 cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading ? 'Saving...' : 'Save Assignments'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
