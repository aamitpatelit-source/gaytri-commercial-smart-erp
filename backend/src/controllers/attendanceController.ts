import { Response } from 'express';
import poolProxy, { query } from '../config/db';
import { AuthRequest } from '../middleware/auth';
import moment from 'moment-timezone';

// Typography / Timezone / Provider Core Domain Interfaces
export interface AttendanceProviderPayload {
  employeeId: string;
  managerId: string | null;
  date: string;
  time: string;
  status: string;
  remarks?: string;
  createdDevice?: string;
}

export interface AttendanceProvider {
  readonly sourceName: string;
  processAttendance(client: any, payload: AttendanceProviderPayload): Promise<{ success: boolean; id: string }>;
}

export class ManagerManualProvider implements AttendanceProvider {
  readonly sourceName = 'MANAGER_MANUAL';

  async processAttendance(client: any, payload: AttendanceProviderPayload): Promise<{ success: boolean; id: string }> {
    const res = await client.query(
      `INSERT INTO attendance (employee_id, manager_id, date, time, status, remarks, created_device, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        payload.employeeId,
        payload.managerId,
        payload.date,
        payload.time,
        payload.status,
        payload.remarks || null,
        payload.createdDevice || null,
        this.sourceName
      ]
    );
    return { success: true, id: res.rows[0].id };
  }
}

// Registry of extensible sources
const providers: Record<string, AttendanceProvider> = {
  'MANAGER_MANUAL': new ManagerManualProvider()
};

// Retrieve company timezone dynamically from settings
export const getCompanyTimezone = async (): Promise<string> => {
  try {
    const settings = await query('SELECT timezone FROM company_settings LIMIT 1');
    return settings.rows[0]?.timezone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
};

// Void attendance (ADMIN only)
export const voidAttendance = async (req: AuthRequest, res: Response) => {
  const { id, reason } = req.body;

  if (!id || !reason || reason.trim() === '') {
    return res.status(400).json({ success: false, message: 'Attendance ID and a valid reason are required.' });
  }

  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, message: 'Access denied. Administrator privileges required to void records.' });
  }

  const client = await poolProxy.connect();
  try {
    await client.query('BEGIN');

    // SELECT existing row FOR UPDATE to prevent concurrency race conditions
    const existing = await client.query('SELECT status, remarks, is_locked FROM attendance WHERE id = $1 FOR UPDATE', [id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Attendance record not found.' });
    }

    const row = existing.rows[0];
    const oldStatus = row.status;
    const oldRemarks = row.remarks;

    // Void the record
    await client.query(
      `UPDATE attendance 
       SET status = 'VOIDED', remarks = $1, manager_id = $2, updated_at = NOW() 
       WHERE id = $3`,
      [`VOIDED - Reason: ${reason.trim()}`, req.user.id, id]
    );

    // Insert to immutable audit log within the same transaction
    await client.query(
      `INSERT INTO attendance_audit_logs (attendance_id, changed_by, old_status, new_status, old_remarks, new_remarks, reason)
       VALUES ($1, $2, $3, 'VOIDED', $4, $5, $6)`,
      [id, req.user.id, oldStatus, oldRemarks, `VOIDED - Reason: ${reason.trim()}`, reason.trim()]
    );

    await client.query('COMMIT');
    console.log(`[Admin Action] Voided attendance ${id} for reason: ${reason.trim()}`);
    return res.status(200).json({ success: true, message: 'Attendance record voided successfully.' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[Admin Action Error] Void attendance failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to void attendance record.' });
  } finally {
    client.release();
  }
};

// Mark / Edit Attendance (Manager same-day rules, Admin historical access)
export const markAttendance = async (req: AuthRequest, res: Response) => {
  const { date, records } = req.body;
  const changedBy = req.user?.id;
  const userRole = req.user?.role;
  const ipAddress = req.ip || null;
  const deviceId = req.headers['x-device-id'] as string || null;

  if (!date || !records || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ success: false, message: 'Missing required fields (date, records array).' });
  }

  const tz = await getCompanyTimezone();
  const todayStr = moment().tz(tz).format('YYYY-MM-DD');

  // Same-day manager restriction
  const isToday = date === todayStr;
  if (userRole === 'MANAGER' && !isToday) {
    return res.status(403).json({ success: false, message: 'Managers are restricted to logging/editing same-day attendance only.' });
  }

  const client = await poolProxy.connect();
  try {
    await client.query('BEGIN');

    for (const record of records) {
      const { employee_id, status, remarks, reason } = record;

      if (!employee_id || !status) {
        throw new Error('Each record must include employee_id and status.');
      }

      // 1. Verify Manager Scope Boundary
      if (userRole === 'MANAGER') {
        const scopeCheck = await client.query(
          `SELECT EXISTS (
             SELECT 1 FROM employees e
             JOIN manager_departments md ON e.department_id = md.department_id
             WHERE e.id = $1 AND md.manager_id = $2
           )`,
          [employee_id, changedBy]
        );
        if (!scopeCheck.rows[0].exists) {
          throw new Error(`Employee ${employee_id} is outside your managed department scope.`);
        }
      }

      // SELECT existing row FOR UPDATE to capture database-read old values
      const existingRes = await client.query(
        'SELECT id, status, remarks, is_locked FROM attendance WHERE employee_id = $1 AND date = $2 FOR UPDATE',
        [employee_id, date]
      );

      const timeStr = moment().tz(tz).format('HH:mm:ss');

      if (existingRes.rows.length === 0) {
        // Create new record using extensible AttendanceProvider
        const provider = providers['MANAGER_MANUAL'];
        await provider.processAttendance(client, {
          employeeId: employee_id,
          managerId: changedBy || null,
          date,
          time: timeStr,
          status,
          remarks,
          createdDevice: deviceId || undefined
        });
      } else {
        const row = existingRes.rows[0];

        // Verify edit locking rules
        if (row.is_locked && userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
          throw new Error(`Attendance for employee ${employee_id} on date ${date} is locked.`);
        }

        // Verify mandatory reason
        if (!reason || reason.trim() === '') {
          throw new Error('A mandatory reason is required to modify existing attendance records.');
        }

        // Capture authoritative old values from DB (preventing client spoofing)
        const oldStatus = row.status;
        const oldRemarks = row.remarks;

        // Perform transactional update
        await client.query(
          `UPDATE attendance 
           SET status = $1, remarks = $2, manager_id = $3, updated_at = NOW() 
           WHERE id = $4`,
          [status, remarks || null, changedBy, row.id]
        );

        // Insert immutable audit log record
        await client.query(
          `INSERT INTO attendance_audit_logs (attendance_id, changed_by, old_status, new_status, old_remarks, new_remarks, reason, ip_address, device_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [row.id, changedBy, oldStatus, status, oldRemarks, remarks || null, reason.trim(), ipAddress, deviceId]
        );
      }
    }

    await client.query('COMMIT');
    return res.status(200).json({ success: true, message: 'Attendance records saved successfully.' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[Attendance API Error] Transaction aborted:', error.message);
    return res.status(error.message.includes('scope') || error.message.includes('locked') ? 403 : 400).json({
      success: false,
      message: error.message || 'Transaction failed.'
    });
  } finally {
    client.release();
  }
};

// Retrieve Attendance Dashboard Stats
export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  const tz = await getCompanyTimezone();
  const today = moment().tz(tz).format('YYYY-MM-DD');

  try {
    // Total staff count
    const totalEmpRes = await query('SELECT COUNT(*) as count FROM employees WHERE is_active = TRUE');
    const totalStaff = parseInt(totalEmpRes.rows[0].count, 10);

    // Group counts by status
    const attendanceRes = await query(
      `SELECT status, COUNT(*) as count 
       FROM attendance 
       WHERE date = $1 AND is_deleted = FALSE
       GROUP BY status`,
      [today]
    );

    let present = 0;
    let absent = 0;
    let late = 0;
    let halfDay = 0;
    let leave = 0;
    let wfh = 0;
    let onDuty = 0;

    attendanceRes.rows.forEach((row) => {
      if (row.status === 'PRESENT') present += parseInt(row.count, 10);
      if (row.status === 'LATE') late += parseInt(row.count, 10);
      if (row.status === 'HALF_DAY') halfDay += parseInt(row.count, 10);
      if (row.status === 'ABSENT') absent += parseInt(row.count, 10);
      if (row.status === 'LEAVE') leave += parseInt(row.count, 10);
      if (row.status === 'WORK_FROM_HOME') wfh += parseInt(row.count, 10);
      if (row.status === 'ON_DUTY') onDuty += parseInt(row.count, 10);
    });

    const totalMarked = present + late + halfDay + absent + leave + wfh + onDuty;
    const autoAbsent = Math.max(0, totalStaff - totalMarked);
    absent += autoAbsent;

    // Fetch recent logs feed
    const feedRes = await query(
      `SELECT a.date, a.time, a.status, a.remarks, e.full_name, e.employee_id, d.name as department
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE a.date = $1 AND a.is_deleted = FALSE
       ORDER BY a.updated_at DESC
       LIMIT 10`,
      [today]
    );

    return res.status(200).json({
      success: true,
      stats: {
        totalStaff,
        present: present + late + halfDay + wfh + onDuty,
        absent,
        late,
        halfDay,
        leave,
        wfh,
        onDuty
      },
      feed: feedRes.rows,
    });
  } catch (error) {
    console.error('[Dashboard Stats Error] Aggregation failed:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// Retrieve Attendance History with advanced filtering
export const getAttendanceHistory = async (req: AuthRequest, res: Response) => {
  const { start_date, end_date, status, department_id, shift_id, search } = req.query;

  try {
    let selectFields = `
      a.id, a.date, a.time, a.status, a.remarks, a.created_device, a.source, a.is_locked,
      e.full_name, e.employee_id, d.name as department, s.name as shift
    `;
    let queryStr = `
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE a.is_deleted = FALSE
    `;
    let params: any[] = [];
    let counter = 1;

    if (req.user && req.user.role === 'EMPLOYEE') {
      queryStr += ` AND e.id = $${counter++}`;
      params.push(req.user.id);
    } else {
      if (search) {
        queryStr += ` AND (e.full_name ILIKE $${counter} OR e.employee_id ILIKE $${counter})`;
        params.push(`%${search}%`);
        counter++;
      }
      if (department_id) {
        queryStr += ` AND e.department_id = $${counter++}`;
        params.push(department_id);
      }
      if (shift_id) {
        queryStr += ` AND e.shift_id = $${counter++}`;
        params.push(shift_id);
      }
    }

    if (start_date) {
      queryStr += ` AND a.date >= $${counter++}`;
      params.push(start_date);
    }
    if (end_date) {
      queryStr += ` AND a.date <= $${counter++}`;
      params.push(end_date);
    }
    if (status) {
      queryStr += ` AND a.status = $${counter++}`;
      params.push(status);
    }

    const finalQuery = `SELECT ${selectFields} ${queryStr} ORDER BY a.date DESC, a.time DESC`;
    const result = await query(finalQuery, params);

    return res.status(200).json({
      success: true,
      logs: result.rows,
    });
  } catch (error) {
    console.error('[Attendance History Error] Fetch failed:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// Retrieve Audit logs (ADMIN only)
export const getAuditLogs = async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, message: 'Access denied. Administrator privileges required.' });
  }

  try {
    const result = await query(
      `SELECT al.id, al.changed_at, al.old_status, al.new_status, al.old_remarks, al.new_remarks, al.reason, al.ip_address, al.device_id,
              e.full_name as employee_name, e.employee_id, adm.full_name as changed_by_name
       FROM attendance_audit_logs al
       JOIN attendance a ON al.attendance_id = a.id
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN admins adm ON al.changed_by = adm.id
       ORDER BY al.changed_at DESC`
    );

    return res.status(200).json({ success: true, logs: result.rows });
  } catch (error) {
    console.error('[Audit Logs Error] Fetch failed:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// Retrieve Employee Personal Summary
export const getEmployeeSummary = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'EMPLOYEE') {
    return res.status(403).json({ success: false, message: 'Forbidden. Employee context required.' });
  }

  const employeeId = req.user.id;
  const tz = await getCompanyTimezone();
  const now = moment().tz(tz);
  const startOfMonth = now.clone().startOf('month').format('YYYY-MM-DD');
  const endOfMonth = now.clone().endOf('month').format('YYYY-MM-DD');

  try {
    // 1. Get Leave Balance
    const balanceRes = await query(
      'SELECT casual_leave, sick_leave, paid_leave FROM leave_balances WHERE employee_id = $1',
      [employeeId]
    );

    // 2. Count Monthly attendance stats
    const monthlyLogs = await query(
      `SELECT status, COUNT(*) as count 
       FROM attendance 
       WHERE employee_id = $1 AND date >= $2 AND date <= $3 AND is_deleted = FALSE
       GROUP BY status`,
      [employeeId, startOfMonth, endOfMonth]
    );

    let present = 0;
    let late = 0;
    let halfDay = 0;
    let absent = 0;
    let leaveCount = 0;

    monthlyLogs.rows.forEach((row) => {
      if (row.status === 'PRESENT') present = parseInt(row.count, 10);
      if (row.status === 'LATE') late = parseInt(row.count, 10);
      if (row.status === 'HALF_DAY') halfDay = parseInt(row.count, 10);
      if (row.status === 'ABSENT') absent = parseInt(row.count, 10);
      if (row.status === 'LEAVE') leaveCount = parseInt(row.count, 10);
    });

    const totalWorkingDays = present + late + halfDay + absent;
    const presentSum = present + late + (halfDay * 0.5);
    const attendancePercentage = totalWorkingDays > 0 ? Math.round((presentSum / totalWorkingDays) * 100) : 100;

    // 3. Get today's attendance status
    const todayStr = now.format('YYYY-MM-DD');
    const todayRes = await query(
      'SELECT status, time FROM attendance WHERE employee_id = $1 AND date = $2 AND is_deleted = FALSE LIMIT 1',
      [employeeId, todayStr]
    );

    return res.status(200).json({
      success: true,
      summary: {
        attendancePercentage,
        todayStatus: todayRes.rows[0]?.status || 'NOT_MARKED',
        todayTime: todayRes.rows[0]?.time || null,
        leaves: balanceRes.rows[0] || { casual_leave: 0, sick_leave: 0, paid_leave: 0 },
        stats: {
          present: present + late,
          absent,
          late,
          halfDay,
          leave: leaveCount
        }
      }
    });
  } catch (error) {
    console.error('[Employee Summary Error] Fetch failed:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// EOD Auto-Lock Scheduler Query
export const lockDailyAttendance = async () => {
  const tz = await getCompanyTimezone();
  const today = moment().tz(tz).format('YYYY-MM-DD');
  
  try {
    console.log(`[Auto Lock] Locking daily attendance for date: ${today}`);
    await query(
      `UPDATE attendance 
       SET is_locked = TRUE 
       WHERE date = $1 AND is_locked = FALSE`,
      [today]
    );
    console.log(`[Auto Lock] Daily attendance for ${today} locked successfully.`);
  } catch (err) {
    console.error('[Auto Lock Error] Failed to lock records:', err);
  }
};

// Scheduler bootstrap
export const startAutoLockScheduler = () => {
  console.log('[Auto Lock Scheduler] Initializing EOD lock routines...');
  
  const scheduleNextRun = async () => {
    const tz = await getCompanyTimezone();
    const now = moment().tz(tz);
    
    // Set target EOD time to 6:00 PM (18:00:00)
    const target = moment().tz(tz).set({ hour: 18, minute: 0, second: 0, millisecond: 0 });
    
    if (now.isAfter(target)) {
      target.add(1, 'day');
    }
    
    const delay = target.diff(now);
    console.log(`[Auto Lock Scheduler] Next lock event in ${Math.round(delay / 1000 / 60)} minutes (at ${target.format()})`);
    
    setTimeout(async () => {
      await lockDailyAttendance();
      scheduleNextRun();
    }, delay);
  };

  scheduleNextRun().catch(err => console.error('[Auto Lock Scheduler Boot Error] Failed:', err));
};

