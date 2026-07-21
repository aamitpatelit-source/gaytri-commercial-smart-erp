"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Save, Search, RefreshCw, AlertTriangle, CheckCircle2, X, Edit3 } from 'lucide-react';
import { API_URL } from '../../config';

interface LeaveBalance {
  id: string;
  employee_id: string;
  casual_leave: number;
  sick_leave: number;
  paid_leave: number;
  full_name: string;
  emp_code: string;
  department: string | null;
}

export default function LeaveBalancesPage() {
  const router = useRouter();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Edit Modal State
  const [editModal, setEditModal] = useState<{
    show: boolean;
    balance: LeaveBalance | null;
    casual_leave: number;
    sick_leave: number;
    paid_leave: number;
  }>({
    show: false,
    balance: null,
    casual_leave: 12,
    sick_leave: 12,
    paid_leave: 12
  });

  const showToastMsg = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchBalances = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoading(true);
      setError('');

      const res = await fetch(`${API_URL}/leaves/balances`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setBalances(data.balances || []);
      } else {
        setError(data.message || 'Failed to retrieve leave balances.');
      }
    } catch (err: any) {
      setError('Connection to server failed.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { balance, casual_leave, sick_leave, paid_leave } = editModal;
    if (!balance) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/leaves/balances/${balance.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ casual_leave, sick_leave, paid_leave })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Leave balances adjusted successfully.');
        setEditModal({ show: false, balance: null, casual_leave: 12, sick_leave: 12, paid_leave: 12 });
        fetchBalances();
      } else {
        showToastMsg('error', data.message || 'Failed to update leave balances.');
      }
    } catch (err) {
      showToastMsg('error', 'Server connection offline.');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredBalances = balances.filter(b => {
    const matchesSearch = 
      b.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.emp_code.toLowerCase().includes(searchTerm.toLowerCase());
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
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Banner */}
      <div className="glass-panel p-6 rounded-xl flex items-center justify-between border-l-4 border-cyan-400 shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <span>Leave Balances Directory</span>
            <Settings className="w-5 h-5 text-cyan-400" />
          </h2>
          <p className="text-sm text-slate-355 mt-1">Check remaining balances and perform manual balance overrides/corrections for employees.</p>
        </div>
        <button
          onClick={fetchBalances}
          disabled={loading}
          className="px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-cyan-400 hover:border-cyan-400 text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Refreshing...' : 'Refresh Balances'}</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-slate-350" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search employee by name or code..."
            className="w-full pl-10 pr-4 py-2.5 glass-input text-sm text-white"
          />
        </div>
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
            Employee Leave Balances ({filteredBalances.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs text-cyan-400 font-bold">Querying balance logs...</p>
            </div>
          ) : filteredBalances.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-semibold text-xs">
              No leave balance registers found.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-200 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/30">
                  <th className="pb-3 pt-4 pl-6 w-[30%]">Employee</th>
                  <th className="pb-3 pt-4 w-[15%] text-center">Casual Leave (CL)</th>
                  <th className="pb-3 pt-4 w-[15%] text-center">Sick Leave (SL)</th>
                  <th className="pb-3 pt-4 w-[15%] text-center">Paid Leave (PL)</th>
                  <th className="pb-3 pt-4 pr-6 text-center w-[15%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-350">
                {filteredBalances.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                    {/* Employee */}
                    <td className="py-4 pl-6">
                      <div className="font-bold text-white text-sm">{b.full_name}</div>
                      <div className="text-[10px] text-slate-450 font-mono mt-0.5">
                        Code: {b.emp_code}  •  {b.department || 'General'}
                      </div>
                    </td>

                    {/* Casual */}
                    <td className="py-4 text-center font-mono font-extrabold text-sm text-cyan-400">
                      {b.casual_leave} days
                    </td>

                    {/* Sick */}
                    <td className="py-4 text-center font-mono font-extrabold text-sm text-amber-450">
                      {b.sick_leave} days
                    </td>

                    {/* Paid */}
                    <td className="py-4 text-center font-mono font-extrabold text-sm text-emerald-400">
                      {b.paid_leave} days
                    </td>

                    {/* Action */}
                    <td className="py-4 pr-6 text-center">
                      <button
                        onClick={() => setEditModal({
                          show: true,
                          balance: b,
                          casual_leave: b.casual_leave,
                          sick_leave: b.sick_leave,
                          paid_leave: b.paid_leave
                        })}
                        className="p-2 rounded bg-slate-900 border border-slate-750 hover:border-cyan-400 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                        title="Edit Balance"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editModal.show && editModal.balance && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => setEditModal({ show: false, balance: null, casual_leave: 12, sick_leave: 12, paid_leave: 12 })}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-355 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <Edit3 className="w-5 h-5 text-cyan-400" />
              <h3 className="font-extrabold text-base text-white">Adjust Leave Balances</h3>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4">
              <p className="text-xs text-slate-300">
                Modifying balances for employee: <br />
                <span className="font-bold text-white">
                  {editModal.balance.full_name} ({editModal.balance.emp_code})
                </span>
              </p>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1.5">Casual Leave (Days)</label>
                <input
                  type="number"
                  value={editModal.casual_leave}
                  onChange={(e) => setEditModal({ ...editModal, casual_leave: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-mono"
                  min="0"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-amber-450 font-extrabold uppercase tracking-wider block mb-1.5">Sick Leave (Days)</label>
                <input
                  type="number"
                  value={editModal.sick_leave}
                  onChange={(e) => setEditModal({ ...editModal, sick_leave: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-mono"
                  min="0"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-wider block mb-1.5">Paid Leave (Days)</label>
                <input
                  type="number"
                  value={editModal.paid_leave}
                  onChange={(e) => setEditModal({ ...editModal, paid_leave: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-mono"
                  min="0"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 disabled:opacity-50 mt-6 border-0 cursor-pointer"
              >
                <Save className="w-4 h-4 text-slate-950" />
                <span>{actionLoading ? 'Saving...' : 'Apply Balances Adjustments'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
