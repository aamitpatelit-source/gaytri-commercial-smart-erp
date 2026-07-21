"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Clock, 
  Check, 
  X, 
  Search, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  MessageSquare,
  RefreshCw
} from 'lucide-react';
import { API_URL } from '../../config';

interface LeaveRequest {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  type: 'CASUAL' | 'SICK' | 'PAID' | 'UNPAID';
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  remarks: string | null;
  approved_at: string | null;
  employee_name: string;
  emp_code: string;
  department: string | null;
  approved_by_name: string | null;
}

export default function LeaveRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Approval/Rejection Modal states
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    type: 'APPROVE' | 'REJECT';
    request: LeaveRequest | null;
    remarks: string;
  }>({
    show: false,
    type: 'APPROVE',
    request: null,
    remarks: ''
  });

  const showToastMsg = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchRequests = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoading(true);
      setError('');

      const res = await fetch(`${API_URL}/leaves/requests`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setRequests(data.requests || []);
      } else {
        setError(data.message || 'Failed to retrieve leave requests.');
      }
    } catch (err: any) {
      setError('Connection to server failed.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const { type, request, remarks } = confirmModal;
    if (!request) return;

    if (type === 'REJECT' && !remarks.trim()) {
      showToastMsg('error', 'Rejection remarks are mandatory.');
      return;
    }

    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const actionPath = type === 'APPROVE' ? 'approve' : 'reject';
      
      const res = await fetch(`${API_URL}/leaves/requests/${request.id}/${actionPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ remarks })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', `Leave request successfully ${type.toLowerCase()}d.`);
        setConfirmModal({ show: false, type: 'APPROVE', request: null, remarks: '' });
        fetchRequests();
      } else {
        showToastMsg('error', data.message || 'Failed to process request.');
      }
    } catch (err) {
      showToastMsg('error', 'Server offline.');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch = 
      req.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.emp_code.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || req.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  };

  const getDuration = (start: string, end: string) => {
    try {
      const s = new Date(start);
      const e = new Date(end);
      const diff = e.getTime() - s.getTime();
      return Math.round(diff / (1000 * 60 * 60 * 24)) + 1;
    } catch (_) {
      return 1;
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
            <span>Leave Management Console</span>
            <Clock className="w-5 h-5 text-cyan-400 animate-pulse" />
          </h2>
          <p className="text-sm text-slate-350 mt-1">Review leave requests, verify operational calendars, and authorize balances deductions.</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Search */}
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

        {/* Status Filters */}
        <div className="flex space-x-2">
          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all border ${
                statusFilter === status 
                  ? 'bg-slate-800 text-cyan-400 border-cyan-500/20 shadow-neon-glow' 
                  : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:text-slate-200 cursor-pointer'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-955/40 border border-rose-500/40 text-rose-350 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Requests Directory */}
      <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
            Leave Requests Directory ({filteredRequests.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs text-cyan-400 font-bold">Querying leave logs...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-semibold text-xs">
              No leave requests registered under selection criteria.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-200 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/30">
                  <th className="pb-3 pt-4 pl-6 w-[20%]">Employee</th>
                  <th className="pb-3 pt-4 w-[15%]">Leave Type</th>
                  <th className="pb-3 pt-4 w-[20%]">Date Range & Duration</th>
                  <th className="pb-3 pt-4 w-[25%]">Reason / Remarks</th>
                  <th className="pb-3 pt-4 w-[10%] text-center">Status</th>
                  <th className="pb-3 pt-4 pr-6 text-center w-[10%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-350">
                {filteredRequests.map((req) => {
                  const duration = getDuration(req.start_date, req.end_date);
                  return (
                    <tr key={req.id} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                      {/* Employee */}
                      <td className="py-4 pl-6">
                        <div className="font-bold text-white text-sm">{req.employee_name}</div>
                        <div className="text-[10px] text-slate-450 font-mono mt-0.5">
                          Code: {req.emp_code}  •  {req.department || 'General'}
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-4 font-semibold">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${
                          req.type === 'CASUAL' 
                            ? 'bg-cyan-950/20 text-cyan-400 border-cyan-500/20'
                            : req.type === 'SICK'
                            ? 'bg-amber-955/20 text-amber-450 border-amber-500/20'
                            : req.type === 'PAID'
                            ? 'bg-emerald-950/20 text-emerald-450 border-emerald-500/20'
                            : 'bg-slate-950/40 text-slate-400 border-slate-700'
                        }`}>
                          {req.type}
                        </span>
                      </td>

                      {/* Range */}
                      <td className="py-4">
                        <div className="flex items-center space-x-1.5 text-slate-200">
                          <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="font-semibold">{formatDate(req.start_date)}</span>
                          <span className="text-slate-500 font-bold">&rarr;</span>
                          <span className="font-semibold">{formatDate(req.end_date)}</span>
                        </div>
                        <div className="text-[10px] text-slate-450 mt-1 font-extrabold uppercase">
                          Duration: {duration} {duration === 1 ? 'day' : 'days'}
                        </div>
                      </td>

                      {/* Reason */}
                      <td className="py-4 pr-4">
                        <div className="text-slate-200 font-medium leading-relaxed">{req.reason}</div>
                        {req.remarks && (
                          <div className="mt-1 text-[10.5px] text-slate-450 flex items-center space-x-1">
                            <MessageSquare className="w-3 h-3 text-cyan-500 shrink-0" />
                            <span className="italic">
                              Response: {req.remarks} (by {req.approved_by_name || 'System'})
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold border ${
                          req.status === 'PENDING'
                            ? 'bg-amber-955/20 text-amber-450 border-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.05)]'
                            : req.status === 'APPROVED'
                            ? 'bg-emerald-950/20 text-emerald-450 border-emerald-500/20'
                            : 'bg-rose-955/20 text-rose-455 border-rose-500/20'
                        }`}>
                          {req.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 pr-6 text-center">
                        {req.status === 'PENDING' ? (
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => setConfirmModal({ show: true, type: 'APPROVE', request: req, remarks: '' })}
                              className="p-1.5 rounded bg-slate-900 border border-slate-750 hover:bg-emerald-950/30 hover:text-emerald-400 text-slate-400 transition-colors cursor-pointer"
                              title="Approve Leave"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setConfirmModal({ show: true, type: 'REJECT', request: req, remarks: '' })}
                              className="p-1.5 rounded bg-slate-900 border border-slate-750 hover:bg-rose-955/20 hover:text-rose-455 text-slate-400 transition-colors cursor-pointer"
                              title="Reject Leave"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-semibold italic">Processed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal.show && confirmModal.request && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => setConfirmModal({ show: false, type: 'APPROVE', request: null, remarks: '' })}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-350 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              {confirmModal.type === 'APPROVE' ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-extrabold text-base text-white">Approve Leave Request</h3>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                  <h3 className="font-extrabold text-base text-rose-455">Reject Leave Request</h3>
                </>
              )}
            </div>

            <form onSubmit={handleAction} className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                You are updating the status for: <br />
                <span className="font-bold text-white">
                  {confirmModal.request.employee_name} ({confirmModal.request.emp_code})
                </span> <br />
                Leave Type: <span className="font-bold text-cyan-400">{confirmModal.request.type}</span> <br />
                Duration: <span className="font-bold text-white">
                  {formatDate(confirmModal.request.start_date)} to {formatDate(confirmModal.request.end_date)} ({getDuration(confirmModal.request.start_date, confirmModal.request.end_date)} days)
                </span>
              </p>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">
                  Manager Review / Response Remarks {confirmModal.type === 'REJECT' && <span className="text-rose-400">*</span>}
                </label>
                <textarea
                  value={confirmModal.remarks}
                  onChange={(e) => setConfirmModal({ ...confirmModal, remarks: e.target.value })}
                  placeholder={confirmModal.type === 'APPROVE' ? "Optional approval notes..." : "Enter reason for rejection..."}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-white h-20 focus:outline-none focus:border-cyan-400 transition-colors"
                  required={confirmModal.type === 'REJECT'}
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmModal({ show: false, type: 'APPROVE', request: null, remarks: '' })}
                  className="flex-1 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-755 text-slate-350 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className={`flex-1 py-2 rounded-lg text-slate-950 text-xs font-extrabold transition-all border-0 cursor-pointer disabled:opacity-50 ${
                    confirmModal.type === 'APPROVE'
                      ? 'bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-350 hover:to-teal-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                      : 'bg-rose-500 hover:bg-rose-400 text-white'
                  }`}
                >
                  {actionLoading ? 'Processing...' : confirmModal.type === 'APPROVE' ? 'Authorize Approval' : 'Submit Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
