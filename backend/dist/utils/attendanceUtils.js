"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEffectiveCheckOut = void 0;
/**
 * Resolves the effective checkout time for an attendance record.
 * Priority: Manual Checkout > Configured Shift End Time > Null
 */
const getEffectiveCheckOut = (dbCheckOut, dbCheckIn, settings) => {
    if (dbCheckOut)
        return dbCheckOut;
    if (!dbCheckIn)
        return null;
    const shiftEnd = settings.shift_end_time || '19:00';
    return shiftEnd.length === 5 ? `${shiftEnd}:00` : shiftEnd;
};
exports.getEffectiveCheckOut = getEffectiveCheckOut;
