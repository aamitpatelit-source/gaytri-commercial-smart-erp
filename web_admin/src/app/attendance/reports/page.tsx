"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FileSpreadsheet, 
  Download, 
  Printer, 
  RefreshCw, 
  BarChart3,
  Calendar,
  Users,
  DollarSign
} from 'lucide-react';
import jsPDF from 'jspdf';
import { API_URL } from '../../../config';

interface PayrollItem {
  employee_uuid: string;
  employee_id: string;
  full_name: string;
  department: string;
  designation: string;
  shift: string;
  reporting_manager: string;
  month: string;
  monthly_salary: number;
  standard_hours: number;
  hourly_rate: number;
  total_worked_hours: number;
  present_days: number;
  payable_salary: number;
  gross_payable_salary: number;
  net_pay: number;
}

interface Manager {
  id: string;
  full_name: string;
  email: string;
}

export default function ReportsPage() {
  const router = useRouter();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });
  const [reportingManager, setReportingManager] = useState('');
  const [status, setStatus] = useState('');

  const [managers, setManagers] = useState<Manager[]>([]);
  const [payrollData, setPayrollData] = useState<PayrollItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Summary Metrics
  const [summary, setSummary] = useState({
    totalEmployees: 0,
    totalWorkedHours: 0,
    totalPayrollAmount: 0
  });

  const fetchManagers = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const mgrRes = await fetch(`${API_URL}/auth/managers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (mgrRes.ok) {
        const m = await mgrRes.json();
        setManagers(m.managers || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGeneratePayrollReport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        month: selectedMonth,
        reporting_manager: reportingManager,
        status: status,
      });

      const res = await fetch(`${API_URL}/attendance/payroll-report?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        const items: PayrollItem[] = data.payroll || [];
        setPayrollData(items);

        let totalHours = 0;
        let totalPay = 0;
        items.forEach(item => {
          totalHours += item.total_worked_hours;
          totalPay += item.payable_salary;
        });

        setSummary({
          totalEmployees: items.length,
          totalWorkedHours: totalHours,
          totalPayrollAmount: totalPay
        });
      } else {
        setError(data.message || 'Payroll report compilation failed.');
      }
    } catch (err: any) {
      setError('Connection to server lost. Please retry.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManagers();
    handleGeneratePayrollReport();
  }, []);

  const handleDownloadPayslipPDF = (item: PayrollItem) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Format Month and Year
    const [yearStr, monthStr] = item.month.split('-');
    const dateObj = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    const monthName = dateObj.toLocaleString('en-US', { month: 'long' });
    const year = yearStr;

    // File Name: Payslip_<EmployeeID>_<Month>_<Year>.pdf
    const cleanEmpId = item.employee_id.replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `Payslip_${cleanEmpId}_${monthName}_${year}.pdf`;

    // -------------------------------------------------------------
    // BACKGROUND & WATERMARK
    // -------------------------------------------------------------
    // Base White Background
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, 'F');

    // Light Opacity Watermark Emblem in Background Center (x=105, y=145)
    doc.setDrawColor(241, 245, 249); // slate-100
    doc.setLineWidth(1.5);
    doc.roundedRect(65, 105, 80, 80, 16, 16, 'D');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(42);
    doc.setTextColor(241, 245, 249);
    doc.text('GC', 105, 153, { align: 'center' });

    // -------------------------------------------------------------
    // TOP ACCENT BARS & HEADER
    // -------------------------------------------------------------
    // Top Primary Bar (Navy)
    doc.setFillColor(15, 23, 42); // slate-900 / navy
    doc.rect(0, 0, 210, 4, 'F');

    // Top Accent Bar (Cyan)
    doc.setFillColor(6, 182, 212); // cyan-500
    doc.rect(0, 0, 210, 1.5, 'F');

    // --- Official Company Logo Badge (Top Left) ---
    // Outer Logo Container Box
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(14, 11, 13, 13, 2.5, 2.5, 'F');
    doc.setDrawColor(6, 182, 212);
    doc.setLineWidth(0.6);
    doc.roundedRect(14, 11, 13, 13, 2.5, 2.5, 'D');

    // Monogram "GC" inside Logo Box
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(6, 182, 212);
    doc.text('GC', 20.5, 19.5, { align: 'center' });

    // Company Name
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('GAYTRI COMMERCIAL', 31, 17);

    // Enterprise Subtitle
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('Smart Enterprise Resource Planning System', 31, 22.5);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('Official Payroll Statement • Confidential', 31, 26.5);

    // --- Payslip Title Badge & Period (Top Right) ---
    // Title Pill Badge
    doc.setFillColor(240, 249, 255); // sky-50 / light cyan
    doc.roundedRect(132, 11, 64, 8, 2, 2, 'F');
    doc.setDrawColor(186, 230, 253); // sky-200
    doc.setLineWidth(0.4);
    doc.roundedRect(132, 11, 64, 8, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(3, 105, 161); // sky-700
    doc.text('MONTHLY SALARY PAYSLIP', 164, 16.2, { align: 'center' });

    // Period Detail Right Aligned
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Payroll Period:', 196, 23, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${monthName} ${year}`, 196, 27.5, { align: 'right' });

    // Thin Premium Divider Line
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.4);
    doc.line(14, 32, 196, 32);

    // -------------------------------------------------------------
    // SECTION 1: EMPLOYEE INFORMATION CARD (y = 36 to 76)
    // -------------------------------------------------------------
    doc.setFillColor(248, 250, 252); // slate-50 background
    doc.roundedRect(14, 36, 182, 40, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.roundedRect(14, 36, 182, 40, 3, 3, 'D');

    // Section Header Strip
    doc.setFillColor(6, 182, 212); // cyan indicator bar
    doc.rect(18, 41, 3, 5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('EMPLOYEE INFORMATION', 24, 45);

    doc.setDrawColor(241, 245, 249);
    doc.line(18, 48, 192, 48);

    // Grid Layout Details
    doc.setFontSize(8.5);

    // Column 1 (Left: Label x=20, Value x=56)
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Employee Name:', 20, 54);
    doc.setTextColor(15, 23, 42);
    doc.text(item.full_name, 56, 54);

    doc.setTextColor(100, 116, 139);
    doc.text('Employee ID:', 20, 60.5);
    doc.setTextColor(2, 132, 199); // blue accent for ID
    doc.text(item.employee_id, 56, 60.5);

    doc.setTextColor(100, 116, 139);
    doc.text('Designation:', 20, 67);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(item.designation || 'Staff', 56, 67);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Department:', 20, 73.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(item.department || 'General', 56, 73.5);

    // Column 2 (Right: Label x=110, Value x=148)
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Assigned Shift:', 110, 54);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(item.shift || 'Morning Shift', 148, 54);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Reporting Manager:', 110, 60.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(item.reporting_manager || 'N/A', 148, 60.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Payroll Month:', 110, 67);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(`${monthName} ${year}`, 148, 67);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Salary Basis:', 110, 73.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text('Monthly / Attendance Hours', 148, 73.5);

    // -------------------------------------------------------------
    // SECTION 2: ATTENDANCE SUMMARY CARDS (y = 80 to 104)
    // -------------------------------------------------------------
    // Card 1: Total Worked Hours (x=14 to 101, width=87mm)
    doc.setFillColor(240, 249, 255); // sky-50
    doc.roundedRect(14, 80, 87, 23, 3, 3, 'F');
    doc.setDrawColor(186, 230, 253);
    doc.setLineWidth(0.4);
    doc.roundedRect(14, 80, 87, 23, 3, 3, 'D');

    // Icon Circle Badge
    doc.setFillColor(186, 230, 253);
    doc.circle(23, 91.5, 4.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(3, 105, 161);
    doc.text('H', 23, 94.2, { align: 'center' });

    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL WORKED HOURS', 31, 88);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${item.total_worked_hours} Hours`, 31, 96.5);

    // Card 2: Present Days Logged (x=109 to 196, width=87mm)
    doc.setFillColor(236, 253, 245); // emerald-50
    doc.roundedRect(109, 80, 87, 23, 3, 3, 'F');
    doc.setDrawColor(167, 243, 208);
    doc.setLineWidth(0.4);
    doc.roundedRect(109, 80, 87, 23, 3, 3, 'D');

    // Icon Circle Badge
    doc.setFillColor(167, 243, 208);
    doc.circle(118, 91.5, 4.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(6, 95, 70);
    doc.text('D', 118, 94.2, { align: 'center' });

    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('PRESENT DAYS LOGGED', 126, 88);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(6, 95, 70);
    doc.text(`${item.present_days} Days`, 126, 96.5);

    // -------------------------------------------------------------
    // SECTION 3: SALARY DETAILS BREAKDOWN TABLE (y = 108 to 156)
    // -------------------------------------------------------------
    // Table Header Bar
    doc.setFillColor(15, 23, 42); // slate-900 / navy
    doc.roundedRect(14, 108, 182, 9, 1.5, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text('DESCRIPTION', 20, 114);
    doc.text('CALCULATION BASIS / FORMULA', 90, 114);
    doc.text('AMOUNT (INR)', 190, 114, { align: 'right' });

    let y = 124;

    const rows = [
      { 
        label: 'Monthly Salary', 
        detail: 'Base Monthly Salary Rate', 
        amount: `₹${item.monthly_salary.toLocaleString('en-IN')}`,
        highlight: true 
      },
      { 
        label: 'Standard Monthly Hours', 
        detail: `26 Working Days × 8 Hours = ${item.standard_hours} Hours`, 
        amount: `${item.standard_hours} Hours`,
        highlight: false 
      },
      { 
        label: 'Hourly Rate', 
        detail: `Monthly Salary ÷ ${item.standard_hours} Hours`, 
        amount: `₹${item.hourly_rate}/hr`,
        highlight: true 
      },
      { 
        label: 'Worked Hours', 
        detail: 'Actual Attendance Worked Hours', 
        amount: `${item.total_worked_hours} Hours`,
        highlight: true 
      },
    ];

    rows.forEach((r, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y - 6, 182, 9.5, 'F');
      }

      // Soft row border
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.3);
      doc.line(14, y + 3.5, 196, y + 3.5);

      doc.setFont('helvetica', r.highlight ? 'bold' : 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text(r.label, 20, y);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(r.detail, 90, y);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(r.highlight ? 15 : 51, r.highlight ? 23 : 65, r.highlight ? 42 : 85);
      doc.text(r.amount, 190, y, { align: 'right' });

      y += 10;
    });

    // -------------------------------------------------------------
    // SECTION 4: SALARY SUMMARY CARDS (y = 154 to 196)
    // -------------------------------------------------------------
    // Gross Payable Salary Card (Subtle Emerald Highlight)
    doc.setFillColor(236, 253, 245); // emerald-50
    doc.roundedRect(14, 154, 182, 14, 2.5, 2.5, 'F');
    doc.setDrawColor(167, 243, 208); // emerald-200
    doc.setLineWidth(0.4);
    doc.roundedRect(14, 154, 182, 14, 2.5, 2.5, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(6, 95, 70); // emerald-800
    doc.text('GROSS PAYABLE SALARY', 20, 163);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Worked Hours (${item.total_worked_hours}h) × Hourly Rate (₹${item.hourly_rate})`, 76, 163);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(6, 95, 70);
    doc.text(`₹${item.payable_salary.toLocaleString('en-IN')}`, 190, 163, { align: 'right' });

    // Net Payable Salary Card (Solid Navy & Cyan Highlight - Visually Most Prominent)
    doc.setFillColor(15, 23, 42); // slate-900 / solid navy
    doc.roundedRect(14, 173, 182, 19, 3.5, 3.5, 'F');
    doc.setDrawColor(6, 182, 212); // cyan glow border
    doc.setLineWidth(0.6);
    doc.roundedRect(14, 173, 182, 19, 3.5, 3.5, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('NET PAYABLE SALARY (NET PAY)', 20, 182.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(56, 189, 248); // sky-400 subtext
    doc.text('Final Credited Amount • Disbursed via Gaytri Commercial Payroll Engine', 20, 187);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(56, 189, 248); // sky-400 prominent value
    doc.text(`₹${item.net_pay.toLocaleString('en-IN')}`, 190, 185.5, { align: 'right' });

    // -------------------------------------------------------------
    // FOOTER SECTION (y = 268 to 285)
    // -------------------------------------------------------------
    const footerY = 268;
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.4);
    doc.line(14, footerY, 196, footerY);

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const fullYear = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const generatedTimeStr = `${day}/${month}/${fullYear} ${hours}:${mins}`;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated On: ${generatedTimeStr}`, 14, footerY + 5.5);
    doc.text('System Generated Payslip • Gaytri Commercial ERP • No Signature Required', 14, footerY + 10);

    doc.text('Gaytri Commercial Enterprise Resource Planning', 196, footerY + 5.5, { align: 'right' });
    doc.text('Page 1 of 1', 196, footerY + 10, { align: 'right' });

    // Download PDF
    doc.save(fileName);
  };

  const handleExportCSV = () => {
    if (payrollData.length === 0) return;
    
    const headers = [
      'Employee Name', 'Employee ID', 'Department', 'Shift', 'Reporting Manager',
      'Month', 'Worked Hours', 'Monthly Salary (INR)', 'Hourly Rate (INR)', 'Payable Salary (INR)'
    ];
    
    const csvContent = [
      headers.join(','),
      ...payrollData.map(item => [
        `"${item.full_name}"`,
        `"${item.employee_id}"`,
        `"${item.department}"`,
        `"${item.shift}"`,
        `"${item.reporting_manager}"`,
        `"${item.month}"`,
        `"${item.total_worked_hours}h"`,
        `"${item.monthly_salary}"`,
        `"${item.hourly_rate}"`,
        `"${item.payable_salary}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Gaytri_ERP_Payroll_Report_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-fade-in text-slate-100">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, html, main { background: white !important; color: black !important; padding: 0 !important; margin: 0 !important; }
          .glass-panel { border: none !important; background: transparent !important; box-shadow: none !important; }
          tr { page-break-inside: avoid; }
          table { border-collapse: collapse !important; width: 100% !important; }
          th, td { border: 1px solid #ddd !important; padding: 8px !important; color: black !important; font-size: 9pt !important; }
          .print-title { display: block !important; margin-bottom: 20px !important; color: black !important; }
        }
      `}</style>

      <div className="print-title hidden text-black text-center font-bold text-xl">
        Gaytri Commercial - Monthly Payroll Summary Sheet ({selectedMonth})
      </div>

      {/* FILTER PANEL */}
      <div className="glass-panel p-4 sm:p-6 rounded-xl border border-slate-700 space-y-4 no-print shadow-md">
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
          <FileSpreadsheet className="w-5 h-5 text-cyan-400 shrink-0" />
          <h3 className="font-bold text-white text-sm">Monthly Payroll Report</h3>
        </div>

        <form onSubmit={handleGeneratePayrollReport} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="space-y-1">
            <label className="text-[10px] sm:text-xs lg:text-[10px] text-slate-400 font-bold uppercase">Select Month</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 px-3 text-xs text-white outline-none font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] sm:text-xs lg:text-[10px] text-slate-400 font-bold uppercase">Reporting Manager (Optional)</label>
            <select
              value={reportingManager}
              onChange={(e) => setReportingManager(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 px-3 text-xs text-white outline-none"
            >
              <option value="">All Managers</option>
              {managers.map(m => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] sm:text-xs lg:text-[10px] text-slate-400 font-bold uppercase">Status (Optional)</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500/35 rounded-lg py-2 px-3 text-xs text-white outline-none"
            >
              <option value="">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="WORKING">Working (Active)</option>
              <option value="LATE">Late</option>
              <option value="HALF_DAY">Half Day</option>
            </select>
          </div>

          <div className="flex items-end gap-2 sm:gap-3 flex-wrap sm:flex-nowrap sm:col-span-2 lg:col-span-1 pt-1 sm:pt-0">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 px-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold rounded-lg transition-all shadow-md flex items-center justify-center space-x-1.5 disabled:opacity-50 h-[38px] min-w-[110px]"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Compiling...</span>
                </>
              ) : (
                <>
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Compile Report</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={payrollData.length === 0}
              className="py-2 px-3 bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 h-[38px]"
              title="Export CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              disabled={payrollData.length === 0}
              className="py-2 px-3 bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 h-[38px]"
              title="Print Sheet"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-350 text-xs font-semibold no-print">
          {error}
        </div>
      )}

      {/* PAYROLL SUMMARY METRICS */}
      {payrollData.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="glass-panel p-3.5 sm:p-4 rounded-xl border border-slate-800 flex items-center justify-between min-w-0">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Staff Evaluated</span>
              <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-white font-mono truncate">{summary.totalEmployees} Employees</h4>
            </div>
            <Users className="w-7 h-7 sm:w-8 sm:h-8 text-cyan-400/50 shrink-0 ml-2" />
          </div>
          <div className="glass-panel p-3.5 sm:p-4 rounded-xl border border-slate-800 flex items-center justify-between min-w-0">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Worked Hours</span>
              <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-sky-400 font-mono truncate">{summary.totalWorkedHours} Hours</h4>
            </div>
            <Calendar className="w-7 h-7 sm:w-8 sm:h-8 text-sky-400/50 shrink-0 ml-2" />
          </div>
          <div className="glass-panel p-3.5 sm:p-4 rounded-xl border border-slate-800 flex items-center justify-between min-w-0">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Payable Payroll</span>
              <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-emerald-400 font-mono truncate">₹{summary.totalPayrollAmount.toLocaleString('en-IN')}</h4>
            </div>
            <DollarSign className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400/50 shrink-0 ml-2" />
          </div>
        </div>
      )}

      {/* PAYROLL TABLE */}
      {payrollData.length > 0 && (
        <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden shadow-lg">
          <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
              Payroll Register - {selectedMonth}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-300 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider bg-slate-950/40">
                  <th className="py-3 px-4 pl-4 sm:pl-6">Employee</th>
                  <th className="py-3 px-3 font-mono text-center">Worked Hours</th>
                  <th className="py-3 px-3 font-mono text-right">Monthly Salary</th>
                  <th className="py-3 px-3 font-mono text-right">Hourly Rate</th>
                  <th className="py-3 px-3 font-mono text-right">Payable Salary</th>
                  <th className="py-3 px-4 pr-4 sm:pr-6 text-center">Payslip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-300">
                {payrollData.map((item) => (
                  <tr key={item.employee_uuid} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                    <td className="py-3 px-4 pl-4 sm:pl-6">
                      <p className="font-bold text-white text-xs">{item.full_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{item.employee_id}</p>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-sky-400 text-center whitespace-nowrap">
                      {item.total_worked_hours}h
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-200 text-right whitespace-nowrap">
                      ₹{item.monthly_salary.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 font-mono text-cyan-400 text-right font-semibold whitespace-nowrap">
                      ₹{item.hourly_rate}/hr
                    </td>
                    <td className="py-3 px-3 font-mono font-extrabold text-emerald-400 text-right text-xs sm:text-sm whitespace-nowrap">
                      ₹{item.payable_salary.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 pr-4 sm:pr-6 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleDownloadPayslipPDF(item)}
                        className="px-2.5 py-1 bg-slate-900 border border-slate-700 hover:border-cyan-500/50 hover:bg-cyan-950/20 text-cyan-400 hover:text-cyan-300 font-bold rounded-lg text-xs transition-all shadow-sm flex items-center justify-center space-x-1.5 mx-auto cursor-pointer"
                        title={`Download PDF Payslip for ${item.full_name}`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>📄 Download</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
