"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Trash2, Plus, X, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { API_URL } from '../../config';

interface Holiday {
  id: string;
  name: string;
  date: string;
}

export default function HolidaysPage() {
  const router = useRouter();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '' });
  const [deletingHoliday, setDeletingHoliday] = useState<Holiday | null>(null);

  const showToastMsg = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchHolidays = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoading(true);
      setError('');

      const res = await fetch(`${API_URL}/company/holidays`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        // Sort holidays by date
        const sorted = (data.holidays || []).sort((a: Holiday, b: Holiday) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setHolidays(sorted);
      } else {
        setError(data.message || 'Failed to retrieve holidays calendar.');
      }
    } catch (err: any) {
      setError('Connection to server failed.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHoliday.name || !newHoliday.date) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/company/holidays`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newHoliday)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Holiday registered successfully.');
        setShowAddModal(false);
        setNewHoliday({ name: '', date: '' });
        fetchHolidays();
      } else {
        showToastMsg('error', data.message || 'Failed to register holiday.');
      }
    } catch (err) {
      showToastMsg('error', 'Server offline.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingHoliday) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/company/holidays/${deletingHoliday.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Holiday deleted successfully.');
        setDeletingHoliday(null);
        fetchHolidays();
      } else {
        showToastMsg('error', data.message || 'Failed to delete holiday.');
      }
    } catch (err) {
      showToastMsg('error', 'Server temporarily unavailable.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
      return dateStr;
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
            <span>Holidays Calendar Management</span>
            <Calendar className="w-5 h-5 text-cyan-400" />
          </h2>
          <p className="text-sm text-slate-355 mt-1">Configure company holidays. Approved holidays block normal attendance locks and show as scheduled off days.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold flex items-center space-x-2 shadow-neon-glow text-xs border-0 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-slate-950" />
          <span>Add Holiday</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-955/40 border border-rose-500/40 text-rose-350 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Calendar List */}
      <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
            Scheduled Holidays ({holidays.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs text-cyan-400 font-bold">Querying calendar...</p>
            </div>
          ) : holidays.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-semibold text-xs">
              No holidays registered for the current calendar year.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-200 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/30">
                  <th className="pb-3 pt-4 pl-6 w-[50%]">Holiday Event Name</th>
                  <th className="pb-3 pt-4 w-[35%]">Scheduled Date</th>
                  <th className="pb-3 pt-4 pr-6 text-center w-[15%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-350">
                {holidays.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                    <td className="py-4 pl-6 font-bold text-white text-sm">{h.name}</td>
                    <td className="py-4 font-mono font-semibold text-slate-200">{formatDate(h.date)}</td>
                    <td className="py-4 pr-6 text-center">
                      <button
                        onClick={() => setDeletingHoliday(h)}
                        className="p-1.5 rounded bg-slate-900 border border-slate-750 hover:bg-rose-955/20 hover:text-rose-455 text-slate-400 transition-colors cursor-pointer"
                        title="Delete Holiday"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Holiday Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => setShowAddModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-355 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <Calendar className="w-5 h-5 text-cyan-400" />
              <h3 className="font-extrabold text-base text-white">Add New Holiday</h3>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1.5">Holiday Name</label>
                <input
                  type="text"
                  value={newHoliday.name}
                  onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                  placeholder="e.g. Diwali Festival"
                  className="w-full px-3 py-2.5 glass-input text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1.5">Scheduled Date</label>
                <input
                  type="date"
                  value={newHoliday.date}
                  onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-mono"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 mt-6 border-0 cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Registering...' : 'Register Holiday'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Holiday Modal */}
      {deletingHoliday && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-rose-500/30 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => setDeletingHoliday(null)}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-355 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              <h3 className="font-extrabold text-base text-rose-455">Delete Holiday</h3>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to delete the holiday: <br />
                <span className="font-bold text-white">{deletingHoliday.name} ({formatDate(deletingHoliday.date)})</span>? <br />
                This action will remove the holiday exception from the scheduling engine immediately.
              </p>

              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => setDeletingHoliday(null)}
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
