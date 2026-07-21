"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Plus, Trash2, Edit3, X, Save, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { API_URL } from '../../config';

interface Department {
  id: number;
  name: string;
  created_at: string;
}

export default function DepartmentsPage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [deletingTarget, setDeletingTarget] = useState<Department | null>(null);

  // Form input state
  const [deptForm, setDeptForm] = useState({ name: '' });

  const showToastMsg = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchDepartments = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoading(true);
      setError('');

      const res = await fetch(`${API_URL}/company/departments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setDepartments(data.departments || []);
      } else {
        setError(data.message || 'Failed to retrieve departments.');
      }
    } catch (err: any) {
      setError('Connection to server failed.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptForm.name.trim()) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/company/departments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: deptForm.name.trim() })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Department created successfully.');
        setShowAddModal(false);
        setDeptForm({ name: '' });
        fetchDepartments();
      } else {
        showToastMsg('error', data.message || 'Failed to create department.');
      }
    } catch (err) {
      showToastMsg('error', 'Server offline.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !deptForm.name.trim()) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/company/departments/${editTarget.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: deptForm.name.trim() })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Department updated successfully.');
        setShowEditModal(false);
        setEditTarget(null);
        fetchDepartments();
      } else {
        showToastMsg('error', data.message || 'Failed to update department.');
      }
    } catch (err) {
      showToastMsg('error', 'Server offline.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTarget) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/company/departments/${deletingTarget.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Department deleted successfully.');
        setDeletingTarget(null);
        fetchDepartments();
      } else {
        showToastMsg('error', data.message || 'Failed to delete department.');
      }
    } catch (err) {
      showToastMsg('error', 'Connection failed.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-8 text-slate-100 relative">
      {/* Toast HUD */}
      {toast && (
        <div className={`fixed top-6 right-6 z-55 flex items-center space-x-3 px-4 py-3 rounded-lg border shadow-lg text-sm font-semibold transition-all ${
          toast.type === 'success' 
            ? 'bg-emerald-950/90 text-emerald-450 border-emerald-500/30' 
            : 'bg-rose-955/90 text-rose-455 border-rose-500/30'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Banner */}
      <div className="glass-panel p-6 rounded-xl flex items-center justify-between border-l-4 border-cyan-400 shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <span>Departments Directory</span>
            <Layers className="w-5 h-5 text-cyan-400" />
          </h2>
          <p className="text-sm text-slate-355 mt-1">Manage corporate departments. Departments organize employee rosters and define manager operational scopes.</p>
        </div>
        <button
          onClick={() => {
            setDeptForm({ name: '' });
            setShowAddModal(true);
          }}
          className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold flex items-center space-x-2 shadow-neon-glow text-xs border-0 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-slate-950" />
          <span>New Department</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-955/40 border border-rose-500/40 text-rose-350 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Directory Table */}
      <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
            Departments List ({departments.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs text-cyan-400 font-bold">Querying directory...</p>
            </div>
          ) : departments.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-semibold text-xs">
              No departments registered yet. Click New Department to create one.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-200 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/30">
                  <th className="pb-3 pt-4 pl-6 w-[20%]">Department ID</th>
                  <th className="pb-3 pt-4 w-[60%]">Department Name</th>
                  <th className="pb-3 pt-4 pr-6 text-center w-[20%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-350">
                {departments.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                    <td className="py-4 pl-6 font-mono font-bold text-slate-200">{d.id}</td>
                    <td className="py-4 font-bold text-white text-sm">{d.name}</td>
                    <td className="py-4 pr-6 text-center">
                      <div className="flex items-center justify-center space-x-3">
                        <button
                          onClick={() => {
                            setEditTarget(d);
                            setDeptForm({ name: d.name });
                            setShowEditModal(true);
                          }}
                          className="p-1.5 rounded bg-slate-900 border border-slate-750 hover:bg-cyan-950/20 hover:text-cyan-400 text-slate-400 transition-colors cursor-pointer"
                          title="Rename Department"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingTarget(d)}
                          className="p-1.5 rounded bg-slate-900 border border-slate-750 hover:bg-rose-955/20 hover:text-rose-455 text-slate-400 transition-colors cursor-pointer"
                          title="Delete Department"
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

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => setShowAddModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-755 text-slate-355 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <Layers className="w-5 h-5 text-cyan-400" />
              <h3 className="font-extrabold text-base text-white">Create Department</h3>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1.5">Department Name</label>
                <input
                  type="text"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ name: e.target.value })}
                  placeholder="e.g. Quality Assurance"
                  className="w-full px-3 py-2.5 glass-input text-xs text-white"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 mt-6 border-0 cursor-pointer disabled:opacity-50"
              >
                <span>Save Department</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => {
                setShowEditModal(false);
                setEditTarget(null);
              }}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-355 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <Edit3 className="w-5 h-5 text-cyan-400" />
              <h3 className="font-extrabold text-base text-white">Rename Department</h3>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1.5">Department Name</label>
                <input
                  type="text"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ name: e.target.value })}
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-bold"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 mt-6 border-0 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4 text-slate-950" />
                <span>Rename Department</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-rose-500/30 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => setDeletingTarget(null)}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-355 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              <h3 className="font-extrabold text-base text-rose-455">Delete Department</h3>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to delete department: <br />
                <span className="font-bold text-white">{deletingTarget.name}</span>? <br />
                This will unmap manager scopes and employee assignments for this department. This action cannot be undone.
              </p>

              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => setDeletingTarget(null)}
                  className="flex-1 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-750 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
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
    </div>
  );
}
