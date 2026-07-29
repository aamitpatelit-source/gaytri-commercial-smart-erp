export interface AttendancePayrollSettings {
  company_id?: string;
  shift_start_time: string; // e.g. "09:00"
  shift_end_time: string;   // e.g. "19:00"
  lunch_break_duration: number; // minutes (default 60)
  paid_working_hours: number;   // hours (default 9)
  auto_lunch_deduction: boolean; // default true
  late_grace_period: number;     // minutes (default 15)
  early_checkout_grace_period: number; // minutes (default 15)
  min_hours_full_day: number;   // hours (default 8)
  min_hours_half_day: number;   // hours (default 4)
  absent_threshold_hours: number; // hours (default 2)
  weekly_off_days: string[];     // e.g. ["Sunday"]
  monthly_working_days: number;  // days (default 26)
  payroll_calculation_method: 'FIXED_MONTHLY' | 'HOURLY' | 'PER_MINUTE';
  hourly_salary_calc: 'PAID_HOURS' | 'TOTAL_SHIFT';
  per_minute_calc: boolean;
  salary_rounding_method: 'NEAREST' | 'FLOOR' | 'CEIL';
  overtime_enabled: boolean;
  overtime_multiplier: number;  // default 1.5
}

export const DEFAULT_ATTENDANCE_PAYROLL_SETTINGS: AttendancePayrollSettings = {
  company_id: 'default',
  shift_start_time: '09:00',
  shift_end_time: '19:00',
  lunch_break_duration: 60,
  paid_working_hours: 9,
  auto_lunch_deduction: true,
  late_grace_period: 15,
  early_checkout_grace_period: 15,
  min_hours_full_day: 8,
  min_hours_half_day: 4,
  absent_threshold_hours: 2,
  weekly_off_days: ['Sunday'],
  monthly_working_days: 26,
  payroll_calculation_method: 'FIXED_MONTHLY',
  hourly_salary_calc: 'PAID_HOURS',
  per_minute_calc: false,
  salary_rounding_method: 'NEAREST',
  overtime_enabled: false,
  overtime_multiplier: 1.5,
};

/**
 * Parses time string (e.g. "09:00" or "09:00:00" or "09:00 AM") to total minutes from midnight
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const str = timeStr.trim().toUpperCase();
  const isPM = str.includes('PM');
  const isAM = str.includes('AM');
  const cleanStr = str.replace(/AM|PM/g, '').trim();
  const parts = cleanStr.split(':').map(Number);
  let hours = parts[0] || 0;
  const minutes = parts[1] || 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

/**
 * Extracts minutes from midnight for a Date, ISO string, or time string
 */
export function getMinutesFromInput(input: string | Date | null): number {
  if (!input) return 0;
  if (input instanceof Date) {
    return input.getHours() * 60 + input.getMinutes();
  }
  const str = String(input).trim();
  if (str.includes('T') || str.includes('-')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.getHours() * 60 + d.getMinutes();
    }
  }
  return parseTimeToMinutes(str);
}

/**
 * Calculates net worked hours considering lunch deduction and paid hours cap
 */
export function calculateWorkedHours(
  checkInIso: string | Date | null,
  checkOutIso: string | Date | null,
  settings: AttendancePayrollSettings = DEFAULT_ATTENDANCE_PAYROLL_SETTINGS
): number {
  if (!checkInIso || !checkOutIso) return 0;

  const checkIn = new Date(checkInIso);
  const checkOut = new Date(checkOutIso);

  let diffMs = 0;
  if (!isNaN(checkIn.getTime()) && !isNaN(checkOut.getTime())) {
    diffMs = checkOut.getTime() - checkIn.getTime();
  } else {
    const inMins = getMinutesFromInput(checkInIso);
    const outMins = getMinutesFromInput(checkOutIso);
    let dur = outMins - inMins;
    if (dur < 0) dur += 24 * 60;
    diffMs = dur * 60 * 1000;
  }

  if (diffMs <= 0) return 0;

  let totalMinutes = Math.floor(diffMs / (1000 * 60));

  // Subtract lunch break if auto lunch deduction is enabled
  if (settings.auto_lunch_deduction && settings.lunch_break_duration > 0) {
    totalMinutes = Math.max(0, totalMinutes - settings.lunch_break_duration);
  }

  const hours = parseFloat((totalMinutes / 60).toFixed(2));
  return hours;
}

/**
 * Evaluates attendance status using configured grace periods and thresholds
 */
export function evaluateAttendanceStatus(
  checkInIso: string | Date | null,
  checkOutIso: string | Date | null,
  settings: AttendancePayrollSettings = DEFAULT_ATTENDANCE_PAYROLL_SETTINGS
): { status: string; isLate: boolean; isEarlyDeparture: boolean; workedHours: number } {
  if (!checkInIso) {
    return { status: 'ABSENT', isLate: false, isEarlyDeparture: false, workedHours: 0 };
  }

  const checkInMins = getMinutesFromInput(checkInIso);
  const shiftStartMins = parseTimeToMinutes(settings.shift_start_time || '09:00');
  const lateGrace = settings.late_grace_period ?? 15;
  const lateCutoffMins = shiftStartMins + lateGrace;

  // Late check-in evaluation: checkIn after shiftStart + grace period
  const isLate = checkInMins > lateCutoffMins;

  let isEarlyDeparture = false;
  if (checkOutIso) {
    const checkOutMins = getMinutesFromInput(checkOutIso);
    const shiftEndMins = parseTimeToMinutes(settings.shift_end_time || '19:00');
    const earlyGrace = settings.early_checkout_grace_period ?? 15;
    const earlyCutoffMins = shiftEndMins - earlyGrace;
    isEarlyDeparture = checkOutMins < earlyCutoffMins;
  }

  const workedHours = checkOutIso ? calculateWorkedHours(checkInIso, checkOutIso, settings) : 0;

  let status = 'PRESENT';
  if (isLate) {
    status = 'LATE';
  } else if (!checkOutIso) {
    status = 'WORKING';
  } else if (workedHours < settings.absent_threshold_hours) {
    status = 'ABSENT';
  } else if (workedHours < settings.min_hours_half_day) {
    status = 'HALF_DAY';
  } else {
    status = 'PRESENT';
  }

  return { status, isLate, isEarlyDeparture, workedHours };
}

/**
 * Calculates payroll earnings based on configured calculation methods
 */
export function calculatePayrollSalary(
  monthlySalary: number,
  presentDays: number,
  halfDays: number,
  totalWorkedHours: number,
  overtimeHours: number = 0,
  settings: AttendancePayrollSettings = DEFAULT_ATTENDANCE_PAYROLL_SETTINGS
): { baseSalary: number; earnedSalary: number; overtimePay: number; totalPay: number; dailyRate: number; hourlyRate: number } {
  const workingDays = settings.monthly_working_days || 26;
  const dailyRate = monthlySalary > 0 && workingDays > 0 ? monthlySalary / workingDays : 0;
  
  const paidHoursPerDay = settings.paid_working_hours || 9;
  const hourlyRate = dailyRate > 0 && paidHoursPerDay > 0 ? dailyRate / paidHoursPerDay : 0;

  // Calculate earned salary based on attendance days
  const effectiveDays = presentDays + (halfDays * 0.5);
  let earnedSalary = dailyRate * effectiveDays;

  // Calculate overtime pay if enabled
  let overtimePay = 0;
  if (settings.overtime_enabled && overtimeHours > 0) {
    const multiplier = settings.overtime_multiplier || 1.5;
    overtimePay = overtimeHours * hourlyRate * multiplier;
  }

  let totalPay = earnedSalary + overtimePay;

  // Apply rounding
  if (settings.salary_rounding_method === 'NEAREST') {
    earnedSalary = Math.round(earnedSalary);
    totalPay = Math.round(totalPay);
  } else if (settings.salary_rounding_method === 'FLOOR') {
    earnedSalary = Math.floor(earnedSalary);
    totalPay = Math.floor(totalPay);
  } else if (settings.salary_rounding_method === 'CEIL') {
    earnedSalary = Math.ceil(earnedSalary);
    totalPay = Math.ceil(totalPay);
  } else {
    earnedSalary = parseFloat(earnedSalary.toFixed(2));
    totalPay = parseFloat(totalPay.toFixed(2));
  }

  return {
    baseSalary: monthlySalary,
    earnedSalary,
    overtimePay: parseFloat(overtimePay.toFixed(2)),
    totalPay,
    dailyRate: parseFloat(dailyRate.toFixed(2)),
    hourlyRate: parseFloat(hourlyRate.toFixed(2))
  };
}
