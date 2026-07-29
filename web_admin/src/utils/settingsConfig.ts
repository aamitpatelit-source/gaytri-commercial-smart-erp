import { AttendancePayrollSettings, DEFAULT_ATTENDANCE_PAYROLL_SETTINGS } from './calculationService';
import { API_URL } from '../config';

const SETTINGS_KEY = 'gaytri_attendance_payroll_settings';
const AUDIT_LOGS_KEY = 'gaytri_settings_audit_logs';

export interface SettingsAuditLog {
  id: string;
  changed_by_user: string;
  field_name: string;
  previous_value: string;
  new_value: string;
  created_at: string;
}

/**
 * Gets active settings for the company (with local & DB fallback to default)
 */
export async function getActiveSettings(): Promise<AttendancePayrollSettings> {
  if (typeof window === 'undefined') {
    return DEFAULT_ATTENDANCE_PAYROLL_SETTINGS;
  }

  // 1. Check localStorage fallback
  let localSettings: AttendancePayrollSettings = DEFAULT_ATTENDANCE_PAYROLL_SETTINGS;
  try {
    const cached = localStorage.getItem(SETTINGS_KEY);
    if (cached) {
      localSettings = { ...DEFAULT_ATTENDANCE_PAYROLL_SETTINGS, ...JSON.parse(cached) };
    }
  } catch (e) {
    console.error('Failed to parse cached settings:', e);
  }

  // 2. Fetch from backend API
  try {
    const token = localStorage.getItem('access_token');
    if (token) {
      const res = await fetch(`${API_URL}/company/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.settings && data.settings.attendance_payroll_config) {
          const remoteConfig = typeof data.settings.attendance_payroll_config === 'string'
            ? JSON.parse(data.settings.attendance_payroll_config)
            : data.settings.attendance_payroll_config;

          const merged = { ...DEFAULT_ATTENDANCE_PAYROLL_SETTINGS, ...remoteConfig };
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
          return merged;
        }
      }
    }
  } catch (e) {
    console.warn('Backend settings fetch failed, using local/default:', e);
  }

  return localSettings;
}

/**
 * Saves updated settings, generates Audit Logs, and syncs to DB & localStorage
 */
export async function saveSettings(
  newSettings: AttendancePayrollSettings,
  userName: string = 'Super Admin'
): Promise<{ success: boolean; message: string; auditLogs: SettingsAuditLog[] }> {
  const currentSettings = await getActiveSettings();
  const logs: SettingsAuditLog[] = [];
  const now = new Date().toISOString();

  // Generate audit diffs
  const keys = Object.keys(DEFAULT_ATTENDANCE_PAYROLL_SETTINGS) as (keyof AttendancePayrollSettings)[];
  for (const key of keys) {
    const oldVal = JSON.stringify(currentSettings[key] ?? '');
    const newVal = JSON.stringify(newSettings[key] ?? '');
    if (oldVal !== newVal) {
      logs.push({
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        changed_by_user: userName,
        field_name: key,
        previous_value: oldVal.replace(/^"|"$/g, ''),
        new_value: newVal.replace(/^"|"$/g, ''),
        created_at: now
      });
    }
  }

  // Save to localStorage
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    
    // Save audit logs locally
    const existingLogsStr = localStorage.getItem(AUDIT_LOGS_KEY);
    const existingLogs: SettingsAuditLog[] = existingLogsStr ? JSON.parse(existingLogsStr) : [];
    const updatedLogs = [...logs, ...existingLogs].slice(0, 100);
    localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(updatedLogs));
  } catch (e) {
    console.error('Failed to persist settings locally:', e);
  }

  // Sync to Backend Database
  try {
    const token = localStorage.getItem('access_token');
    if (token) {
      await fetch(`${API_URL}/company/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          attendance_payroll_config: newSettings,
          audit_logs: logs
        })
      });
    }
  } catch (e) {
    console.warn('Backend sync failed, saved locally:', e);
  }

  // Dispatch global window event for live listeners
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('settingsUpdated'));
  }

  return {
    success: true,
    message: logs.length > 0 ? `Successfully updated ${logs.length} settings.` : 'No changes were detected.',
    auditLogs: logs
  };
}

/**
 * Gets audit logs history
 */
export function getSettingsAuditLogs(): SettingsAuditLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const logsStr = localStorage.getItem(AUDIT_LOGS_KEY);
    return logsStr ? JSON.parse(logsStr) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Deletes a specific audit log entry by ID
 */
export function deleteSettingsAuditLog(logId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const logsStr = localStorage.getItem(AUDIT_LOGS_KEY);
    if (!logsStr) return false;
    const existingLogs: SettingsAuditLog[] = JSON.parse(logsStr);
    const updatedLogs = existingLogs.filter(log => log.id !== logId);
    localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(updatedLogs));
    return true;
  } catch (e) {
    console.error('Failed to delete audit log:', e);
    return false;
  }
}
