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
 * Evaluates Check-In immediately. Late status is set if Check-In > (Shift Start + Grace Period).
 */
export function evaluateCheckIn(
  checkInIso: string | Date,
  settings: AttendancePayrollSettings = DEFAULT_ATTENDANCE_PAYROLL_SETTINGS
): {
  isLate: boolean;
  lateMinutes: number;
  status: 'LATE' | 'WORKING';
} {
  const checkInMins = getMinutesFromInput(checkInIso);
  const shiftStartMins = parseTimeToMinutes(settings.shift_start_time || '09:00');
  const lateGrace = settings.late_grace_period ?? 15;
  const lateCutoffMins = shiftStartMins + lateGrace;

  const isLate = checkInMins > lateCutoffMins;
  const lateMinutes = isLate ? Math.max(0, checkInMins - shiftStartMins) : 0;
  const status = isLate ? 'LATE' : 'WORKING';

  return { isLate, lateMinutes, status };
}

/**
 * Calculates net worked hours considering lunch deduction
 */
export function calculateWorkedHours(
  checkInIso: string | Date | null,
  checkOutIso: string | Date | null,
  settings: AttendancePayrollSettings = DEFAULT_ATTENDANCE_PAYROLL_SETTINGS
): number {
  if (!checkInIso || !checkOutIso) return 0;

  const checkInMins = getMinutesFromInput(checkInIso);
  const checkOutMins = getMinutesFromInput(checkOutIso);
  let durMins = checkOutMins - checkInMins;
  if (durMins < 0) durMins += 24 * 60;

  if (durMins <= 0) return 0;

  if (settings.auto_lunch_deduction && settings.lunch_break_duration > 0 && durMins >= settings.lunch_break_duration) {
    durMins = Math.max(0, durMins - settings.lunch_break_duration);
  }

  return parseFloat((durMins / 60).toFixed(2));
}

/**
 * Evaluates Check-Out.
 * CRITICAL: NEVER recalculates isLate. Late status determined during Check-In is preserved.
 */
export function evaluateCheckOut(
  checkInIso: string | Date,
  checkOutIso: string | Date,
  existingIsLate: boolean,
  existingLateMinutes: number = 0,
  settings: AttendancePayrollSettings = DEFAULT_ATTENDANCE_PAYROLL_SETTINGS
): {
  status: string;
  isLate: boolean;
  lateMinutes: number;
  isEarlyDeparture: boolean;
  workedHours: number;
  paidHours: number;
  lunchDeductionHours: number;
  overtimeHours: number;
} {
  const isLate = existingIsLate;
  const lateMinutes = existingLateMinutes;

  const checkInMins = getMinutesFromInput(checkInIso);
  const checkOutMins = getMinutesFromInput(checkOutIso);
  const shiftEndMins = parseTimeToMinutes(settings.shift_end_time || '19:00');
  const earlyGrace = settings.early_checkout_grace_period ?? 15;
  const earlyCutoffMins = shiftEndMins - earlyGrace;
  const isEarlyDeparture = checkOutMins < earlyCutoffMins;

  let totalSpanMinutes = checkOutMins - checkInMins;
  if (totalSpanMinutes < 0) totalSpanMinutes += 24 * 60;

  let lunchDeductionMinutes = 0;
  if (settings.auto_lunch_deduction && settings.lunch_break_duration > 0 && totalSpanMinutes >= settings.lunch_break_duration) {
    lunchDeductionMinutes = settings.lunch_break_duration;
  }

  const netWorkedMinutes = Math.max(0, totalSpanMinutes - lunchDeductionMinutes);
  const workedHours = parseFloat((netWorkedMinutes / 60).toFixed(2));
  const lunchDeductionHours = parseFloat((lunchDeductionMinutes / 60).toFixed(2));

  const standardPaidHours = settings.paid_working_hours || 9;
  const paidHours = parseFloat(Math.min(workedHours, standardPaidHours).toFixed(2));

  let overtimeHours = 0;
  if (settings.overtime_enabled && workedHours > standardPaidHours) {
    overtimeHours = parseFloat((workedHours - standardPaidHours).toFixed(2));
  }

  let status = 'PRESENT';
  if (workedHours < settings.absent_threshold_hours) {
    status = 'ABSENT';
  } else if (workedHours < settings.min_hours_half_day) {
    status = 'HALF_DAY';
  } else if (isLate) {
    status = 'LATE';
  } else {
    status = 'PRESENT';
  }

  return {
    status,
    isLate,
    lateMinutes,
    isEarlyDeparture,
    workedHours,
    paidHours,
    lunchDeductionHours,
    overtimeHours
  };
}

/**
 * Standardized status evaluation function maintaining interface compatibility
 */
export function evaluateAttendanceStatus(
  checkInIso: string | Date | null,
  checkOutIso: string | Date | null,
  settings: AttendancePayrollSettings = DEFAULT_ATTENDANCE_PAYROLL_SETTINGS
): { status: string; isLate: boolean; isEarlyDeparture: boolean; workedHours: number } {
  if (!checkInIso) {
    return { status: 'ABSENT', isLate: false, isEarlyDeparture: false, workedHours: 0 };
  }

  const checkInEval = evaluateCheckIn(checkInIso, settings);
  if (!checkOutIso) {
    return {
      status: checkInEval.status,
      isLate: checkInEval.isLate,
      isEarlyDeparture: false,
      workedHours: 0
    };
  }

  const checkOutEval = evaluateCheckOut(checkInIso, checkOutIso, checkInEval.isLate, checkInEval.lateMinutes, settings);
  return {
    status: checkOutEval.status,
    isLate: checkOutEval.isLate,
    isEarlyDeparture: checkOutEval.isEarlyDeparture,
    workedHours: checkOutEval.workedHours
  };
}

/**
 * Calculates daily earnings for a single attendance session
 */
export function calculateDailySalary(
  monthlySalary: number,
  workedHours: number,
  paidHours: number,
  overtimeHours: number = 0,
  settings: AttendancePayrollSettings = DEFAULT_ATTENDANCE_PAYROLL_SETTINGS
): {
  monthlySalary: number;
  dailyRate: number;
  hourlyRate: number;
  earnedSalary: number;
  overtimePay: number;
  totalDailyEarnings: number;
} {
  const workingDays = settings.monthly_working_days || 26;
  const dailyRate = monthlySalary > 0 && workingDays > 0 ? monthlySalary / workingDays : 0;
  
  const paidHoursPerDay = settings.paid_working_hours || 9;
  const hourlyRate = dailyRate > 0 && paidHoursPerDay > 0 ? dailyRate / paidHoursPerDay : 0;

  let earnedSalary = 0;

  if (settings.payroll_calculation_method === 'HOURLY') {
    earnedSalary = paidHours * hourlyRate;
  } else if (settings.payroll_calculation_method === 'PER_MINUTE') {
    const minuteRate = hourlyRate / 60;
    earnedSalary = (workedHours * 60) * minuteRate;
  } else {
    // FIXED_MONTHLY
    if (workedHours > 0) {
      if (paidHours >= paidHoursPerDay || workedHours >= settings.min_hours_full_day) {
        earnedSalary = dailyRate;
      } else if (workedHours >= settings.min_hours_half_day) {
        earnedSalary = dailyRate * 0.5;
      } else {
        earnedSalary = dailyRate * (paidHours / paidHoursPerDay);
      }
    }
  }

  let overtimePay = 0;
  if (settings.overtime_enabled && overtimeHours > 0) {
    const multiplier = settings.overtime_multiplier || 1.5;
    overtimePay = overtimeHours * hourlyRate * multiplier;
  }

  let totalDailyEarnings = earnedSalary + overtimePay;

  if (settings.salary_rounding_method === 'NEAREST') {
    earnedSalary = Math.round(earnedSalary);
    totalDailyEarnings = Math.round(totalDailyEarnings);
  } else if (settings.salary_rounding_method === 'FLOOR') {
    earnedSalary = Math.floor(earnedSalary);
    totalDailyEarnings = Math.floor(totalDailyEarnings);
  } else if (settings.salary_rounding_method === 'CEIL') {
    earnedSalary = Math.ceil(earnedSalary);
    totalDailyEarnings = Math.ceil(totalDailyEarnings);
  } else {
    earnedSalary = parseFloat(earnedSalary.toFixed(2));
    totalDailyEarnings = parseFloat(totalDailyEarnings.toFixed(2));
  }

  return {
    monthlySalary,
    dailyRate: parseFloat(dailyRate.toFixed(2)),
    hourlyRate: parseFloat(hourlyRate.toFixed(2)),
    earnedSalary,
    overtimePay: parseFloat(overtimePay.toFixed(2)),
    totalDailyEarnings
  };
}

/**
 * Calculates monthly payroll summary
 */
export function calculatePayrollSalary(
  monthlySalary: number,
  presentDays: number,
  halfDays: number,
  totalWorkedHours: number,
  overtimeHours: number = 0,
  settings: AttendancePayrollSettings = DEFAULT_ATTENDANCE_PAYROLL_SETTINGS
): { baseSalary: number; earnedSalary: number; overtimePay: number; totalPay: number; dailyRate: number; hourlyRate: number } {
  const dailyResult = calculateDailySalary(monthlySalary, totalWorkedHours, totalWorkedHours, overtimeHours, settings);
  const workingDays = settings.monthly_working_days || 26;
  const dailyRate = monthlySalary > 0 && workingDays > 0 ? monthlySalary / workingDays : 0;

  const effectiveDays = presentDays + (halfDays * 0.5);
  let earnedSalary = dailyRate * effectiveDays;

  let overtimePay = 0;
  if (settings.overtime_enabled && overtimeHours > 0) {
    overtimePay = overtimeHours * dailyResult.hourlyRate * (settings.overtime_multiplier || 1.5);
  }

  let totalPay = earnedSalary + overtimePay;

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
    hourlyRate: dailyResult.hourlyRate
  };
}
