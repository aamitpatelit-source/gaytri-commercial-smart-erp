"use client";

import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  Clock, 
  Calendar, 
  DollarSign, 
  ShieldCheck, 
  Save, 
  RotateCcw, 
  History, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Briefcase
} from 'lucide-react';
import { AttendancePayrollSettings, DEFAULT_ATTENDANCE_PAYROLL_SETTINGS } from '../../utils/calculationService';
import { getActiveSettings, saveSettings, getSettingsAuditLogs, SettingsAuditLog } from '../../utils/settingsConfig';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AttendancePayrollSettings>(DEFAULT_ATTENDANCE_PAYROLL_SETTINGS);
  const [auditLogs, setAuditLogs] = useState<SettingsAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'SHIFT' | 'GRACE' | 'ATTENDANCE' | 'PAYROLL' | 'AUDIT'>('SHIFT');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const active = await getActiveSettings();
      setSettings(active);
      setAuditLogs(getSettingsAuditLogs());
      setLoading(false);
    }
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setToast(null);

    // Validation
    if (settings.paid_working_hours <= 0 || settings.paid_working_hours > 24) {
      setToast({ type: 'error', message: 'Paid working hours must be between 1 and 24 hours.' });
      setSaving(false);
      return;
    }
    if (settings.monthly_working_days <= 0 || settings.monthly_working_days > 31) {
      setToast({ type: 'error', message: 'Monthly working days must be between 1 and 31 days.' });
      setSaving(false);
      return;
    }
    if (settings.overtime_enabled && settings.overtime_multiplier < 1) {
      setToast({ type: 'error', message: 'Overtime multiplier must be at least 1.0.' });
      setSaving(false);
      return;
    }

    try {
      const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      const userObj = userStr ? JSON.parse(userStr) : null;
      const userName = userObj?.full_name || 'Super Admin';

      const result = await saveSettings(settings, userName);
      setAuditLogs(getSettingsAuditLogs());
      setToast({ type: 'success', message: result.message });
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (confirm('Are you sure you want to reset all attendance & payroll settings to production defaults?')) {
      setSettings(DEFAULT_ATTENDANCE_PAYROLL_SETTINGS);
      setToast({ type: 'success', message: 'Reset to default values. Click "Save Configuration" to apply.' });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Header */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-wide">Attendance &amp; Payroll Settings</h1>
              <p className="text-xs text-slate-400 font-medium">Enterprise rules, shift parameters, grace periods, and calculation logic</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs flex items-center space-x-2 shadow-neon-glow border-0 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-slate-950" />
            <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>
      </div>

      {/* Toast Alert HUD */}
      {toast && (
        <div className={`p-4 rounded-xl border flex items-center space-x-3 text-xs font-bold transition-all ${
          toast.type === 'success'
            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
            : 'bg-rose-950/80 text-rose-300 border-rose-500/30'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Settings Category Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 overflow-x-auto pb-2 scrollbar-none">
        {[
          { id: 'SHIFT', label: 'Shift Parameters', icon: Clock },
          { id: 'GRACE', label: 'Grace Periods', icon: ShieldCheck },
          { id: 'ATTENDANCE', label: 'Attendance Rules', icon: Calendar },
          { id: 'PAYROLL', label: 'Payroll & Overtime', icon: DollarSign },
          { id: 'AUDIT', label: 'Change Audit Log', icon: History }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-950/60 to-blue-950/40 text-cyan-400 border border-cyan-500/30 shadow-neon-glow'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="glass-panel p-12 rounded-2xl border border-slate-800 flex flex-col items-center justify-center space-y-3">
          <Clock className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-xs text-cyan-400 font-bold">Loading enterprise configuration...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* TAB 1: SHIFT PARAMETERS */}
          {activeTab === 'SHIFT' && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6 animate-fade-in">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-extrabold text-white flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span>Standard Shift Configuration</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">Configure default operational shift times and paid working duration.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Shift Start Time</label>
                  <input
                    type="time"
                    value={settings.shift_start_time}
                    onChange={(e) => setSettings({ ...settings, shift_start_time: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-xl py-2.5 px-3 text-sm text-white font-mono outline-none"
                  />
                  <p className="text-[10px] text-slate-500">Default morning shift start time (e.g. 09:00 AM)</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Shift End Time</label>
                  <input
                    type="time"
                    value={settings.shift_end_time}
                    onChange={(e) => setSettings({ ...settings, shift_end_time: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-xl py-2.5 px-3 text-sm text-white font-mono outline-none"
                  />
                  <p className="text-[10px] text-slate-500">Default evening checkout roster end (e.g. 07:00 PM)</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Lunch Break (Minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    value={settings.lunch_break_duration}
                    onChange={(e) => setSettings({ ...settings, lunch_break_duration: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-xl py-2.5 px-3 text-sm text-white font-mono outline-none"
                  />
                  <p className="text-[10px] text-slate-500">Duration subtracted from total shift duration (e.g. 60 min)</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Paid Working Hours Per Shift</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="24"
                    value={settings.paid_working_hours}
                    onChange={(e) => setSettings({ ...settings, paid_working_hours: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-xl py-2.5 px-3 text-sm text-white font-mono outline-none"
                  />
                  <p className="text-[10px] text-cyan-400 font-semibold">Standard paid quota: 10 Hours shift - 1 Hour lunch = 9 Paid Hours</p>
                </div>

                <div className="space-y-2 sm:col-span-2 flex items-center justify-between p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div>
                    <label className="text-xs font-bold text-white block">Auto Lunch Break Deduction</label>
                    <span className="text-[11px] text-slate-400">Automatically subtract lunch duration from raw shift duration</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.auto_lunch_deduction}
                    onChange={(e) => setSettings({ ...settings, auto_lunch_deduction: e.target.checked })}
                    className="w-5 h-5 accent-cyan-400 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GRACE PERIODS */}
          {activeTab === 'GRACE' && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6 animate-fade-in">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-extrabold text-white flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  <span>Check-In &amp; Check-Out Grace Periods</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">Configure allowable buffer time before marking Late or Early Departure penalties.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">Late Check-In Grace</label>
                    <span className="text-xs font-mono font-bold bg-amber-950/60 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded">
                      {settings.late_grace_period} mins
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={settings.late_grace_period}
                    onChange={(e) => setSettings({ ...settings, late_grace_period: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/40 rounded-xl py-2.5 px-3 text-sm text-white font-mono outline-none"
                  />
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Example: Shift starts at <strong>09:00 AM</strong>. With <strong>{settings.late_grace_period} min grace</strong>, check-ins up to 
                    <strong className="text-emerald-400"> 09:{15} AM</strong> are On Time. From <strong className="text-rose-400">09:{16} AM</strong> onward are marked Late.
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-extrabold text-cyan-400 uppercase tracking-wider">Early Check-Out Grace</label>
                    <span className="text-xs font-mono font-bold bg-cyan-950/60 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded">
                      {settings.early_checkout_grace_period} mins
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={settings.early_checkout_grace_period}
                    onChange={(e) => setSettings({ ...settings, early_checkout_grace_period: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-xl py-2.5 px-3 text-sm text-white font-mono outline-none"
                  />
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Example: Shift ends at <strong>07:00 PM</strong>. With <strong>{settings.early_checkout_grace_period} min grace</strong>, checkouts from 
                    <strong className="text-emerald-400"> 06:45 PM</strong> onward have no penalty. Before <strong>06:45 PM</strong> is Early Departure.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ATTENDANCE RULES */}
          {activeTab === 'ATTENDANCE' && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6 animate-fade-in">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-extrabold text-white flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  <span>Attendance Thresholds &amp; Work Days</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">Configure minimum worked hours required for full day, half day, and monthly working day totals.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Full Day Minimum (Hours)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="16"
                    value={settings.min_hours_full_day}
                    onChange={(e) => setSettings({ ...settings, min_hours_full_day: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-xl py-2.5 px-3 text-sm text-white font-mono outline-none"
                  />
                  <p className="text-[10px] text-slate-500">Minimum net worked hours to count as Full Day (e.g. 8 hrs)</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Half Day Minimum (Hours)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="12"
                    value={settings.min_hours_half_day}
                    onChange={(e) => setSettings({ ...settings, min_hours_half_day: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-xl py-2.5 px-3 text-sm text-white font-mono outline-none"
                  />
                  <p className="text-[10px] text-slate-500">Minimum worked hours required to avoid Absent mark (e.g. 4 hrs)</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Absent Threshold (Hours)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="8"
                    value={settings.absent_threshold_hours}
                    onChange={(e) => setSettings({ ...settings, absent_threshold_hours: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-xl py-2.5 px-3 text-sm text-white font-mono outline-none"
                  />
                  <p className="text-[10px] text-slate-500">Worked hours below this threshold automatically count as Absent (e.g. 2 hrs)</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Monthly Working Days</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={settings.monthly_working_days}
                    onChange={(e) => setSettings({ ...settings, monthly_working_days: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-xl py-2.5 px-3 text-sm text-white font-mono outline-none"
                  />
                  <p className="text-[10px] text-slate-500">Total standard paid working days per month (Default: 26 days)</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PAYROLL & OVERTIME */}
          {activeTab === 'PAYROLL' && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6 animate-fade-in">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-extrabold text-white flex items-center space-x-2">
                  <DollarSign className="w-4 h-4 text-cyan-400" />
                  <span>Payroll Calculation &amp; Overtime Rules</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">Configure salary calculation methods, hourly rates, salary rounding, and overtime multipliers.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Payroll Calculation Method</label>
                  <select
                    value={settings.payroll_calculation_method}
                    onChange={(e) => setSettings({ ...settings, payroll_calculation_method: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                  >
                    <option value="FIXED_MONTHLY">Fixed Monthly (Daily Rate = Salary / Working Days)</option>
                    <option value="HOURLY">Hourly Rate (Earned = Worked Hours * Hourly Rate)</option>
                    <option value="PER_MINUTE">Per-Minute Rate</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Salary Rounding Method</label>
                  <select
                    value={settings.salary_rounding_method}
                    onChange={(e) => setSettings({ ...settings, salary_rounding_method: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                  >
                    <option value="NEAREST">Round to Nearest Rupee</option>
                    <option value="FLOOR">Floor (Round Down)</option>
                    <option value="CEIL">Ceil (Round Up)</option>
                  </select>
                </div>

                <div className="space-y-2 flex items-center justify-between p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div>
                    <label className="text-xs font-bold text-white block">Enable Overtime Pay</label>
                    <span className="text-[11px] text-slate-400">Calculate extra pay for hours worked beyond shift end</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.overtime_enabled}
                    onChange={(e) => setSettings({ ...settings, overtime_enabled: e.target.checked })}
                    className="w-5 h-5 accent-cyan-400 rounded cursor-pointer"
                  />
                </div>

                {settings.overtime_enabled && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-amber-400 uppercase tracking-wider">Overtime Multiplier</label>
                    <input
                      type="number"
                      step="0.1"
                      min="1.0"
                      max="3.0"
                      value={settings.overtime_multiplier}
                      onChange={(e) => setSettings({ ...settings, overtime_multiplier: Number(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/40 rounded-xl py-2.5 px-3 text-sm text-white font-mono outline-none"
                    />
                    <p className="text-[10px] text-slate-500">Overtime rate multiplier (e.g. 1.5 = 150% of hourly rate)</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT LOG */}
          {activeTab === 'AUDIT' && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6 animate-fade-in">
              <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center space-x-2">
                    <History className="w-4 h-4 text-cyan-400" />
                    <span>Configuration Change Audit Trail</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Immutable record of settings modifications, previous values, and user timestamps.</p>
                </div>
              </div>

              {auditLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500 font-semibold text-xs">
                  No configuration modifications recorded. Currently operating on initial defaults.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/40">
                        <th className="px-4 py-3">Timestamp</th>
                        <th className="px-4 py-3">Changed By</th>
                        <th className="px-4 py-3">Setting Field</th>
                        <th className="px-4 py-3">Previous Value</th>
                        <th className="px-4 py-3">New Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/60">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-900/30">
                          <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 font-bold text-white">{log.changed_by_user}</td>
                          <td className="px-4 py-3 font-mono text-cyan-400 font-bold">{log.field_name}</td>
                          <td className="px-4 py-3 font-mono text-rose-400 line-through text-[11px]">{log.previous_value}</td>
                          <td className="px-4 py-3 font-mono text-emerald-400 font-bold text-[11px]">{log.new_value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
