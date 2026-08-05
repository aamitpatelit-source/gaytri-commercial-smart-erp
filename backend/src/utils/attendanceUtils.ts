import { AttendancePayrollSettings } from '../services/calculationService';

/**
 * Resolves the effective checkout time for an attendance record.
 * Priority: Manual Checkout > Configured Shift End Time > Null
 */
export const getEffectiveCheckOut = (
  dbCheckOut: string | null | undefined,
  dbCheckIn: string | null | undefined,
  settings: AttendancePayrollSettings
): string | null => {
  if (dbCheckOut) return dbCheckOut;
  if (!dbCheckIn) return null;
  
  const shiftEnd = settings.shift_end_time || '19:00';
  return shiftEnd.length === 5 ? `${shiftEnd}:00` : shiftEnd;
};
