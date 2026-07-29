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
  daily_rate: number;
  hourly_rate: number;
  today_status: string;
  today_check_in: string | null;
  today_check_out: string | null;
  today_worked_hours: number;
  today_paid_hours: number;
  today_late_minutes: number;
  today_daily_salary: number;
  month_worked_hours: number;
  month_paid_hours: number;
  month_payroll: number;
  total_worked_hours: number;
  present_days: number;
  standard_hours: number;
  attendance_percentage: number;
  late_count: number;
  half_day_count: number;
  absent_count: number;
  overtime_hours: number;
  current_payroll_amount: number;
  projected_salary: number;
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

  // Live Summary Metrics
  const [summary, setSummary] = useState({
    totalEmployees: 0,
    presentToday: 0,
    lateToday: 0,
    workingNow: 0,
    checkedOutToday: 0,
    todayWorkedHours: 0,
    todayPayrollEarned: 0,
    currentMonthPayroll: 0,
    avgAttendancePercentage: 0
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

        let present = 0;
        let late = 0;
        let working = 0;
        let checkedOut = 0;
        let todayHours = 0;
        let todayPay = 0;
        let monthPay = 0;
        let sumAttPct = 0;

        items.forEach(item => {
          if (item.today_status === 'PRESENT' || item.today_status === 'LATE' || item.today_status === 'WORKING' || item.today_status === 'HALF_DAY') {
            present++;
          }
          if (item.today_status === 'LATE' || item.today_late_minutes > 0) {
            late++;
          }
          if (item.today_status === 'WORKING' || (!item.today_check_out && item.today_check_in)) {
            working++;
          }
          if (item.today_check_out) {
            checkedOut++;
          }
          todayHours += item.today_worked_hours || 0;
          todayPay += item.today_daily_salary || 0;
          monthPay += item.month_payroll || item.payable_salary || 0;
          sumAttPct += item.attendance_percentage || 100;
        });

        const avgPct = items.length > 0 ? Math.round(sumAttPct / items.length) : 100;

        setSummary({
          totalEmployees: items.length,
          presentToday: present,
          lateToday: late,
          workingNow: working,
          checkedOutToday: checkedOut,
          todayWorkedHours: parseFloat(todayHours.toFixed(2)),
          todayPayrollEarned: parseFloat(todayPay.toFixed(2)),
          currentMonthPayroll: parseFloat(monthPay.toFixed(2)),
          avgAttendancePercentage: avgPct
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

  const numberToWords = (num: number): string => {
    if (num <= 0) return 'Rupees Zero Only';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const inWords = (n: number): string => {
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
      if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + inWords(n % 100) : '');
      if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + inWords(n % 1000) : '');
      if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + inWords(n % 100000) : '');
      return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + inWords(n % 10000000) : '');
    };

    return `Rupees ${inWords(Math.floor(num))} Only`;
  };

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
    // BASE PAGE & FADED WATERMARK
    // -------------------------------------------------------------
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, 'F');

    // Faded Center Watermark (5-8% Opacity #F1F5F9 - Clean Faded Text Watermark)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(32);
    doc.setTextColor(241, 245, 249);
    doc.text('GAYTRI COMMERCIAL', 105, 148, { align: 'center' });
    doc.setFontSize(14);
    doc.text('ENTERPRISE PAYROLL SYSTEM', 105, 156, { align: 'center' });

    // -------------------------------------------------------------
    // TOP ACCENT & CORPORATE HEADER
    // -------------------------------------------------------------
    // Primary Navy Accent Bar (Top Edge)
    doc.setFillColor(15, 23, 42); // Navy #0F172A
    doc.rect(0, 0, 210, 3, 'F');

    // Company Name (Top Left - Clean Official Text Header, NO "GC" circle placeholder)
    doc.setTextColor(15, 23, 42); // Dark Navy #0F172A
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('GAYTRI COMMERCIAL', 14, 16);

    // Subtitle
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // Slate Gray #64748B
    doc.text('Smart Enterprise Resource Planning System', 14, 21.5);

    // --- Payslip Title & Period (Top Right) ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('MONTHLY SALARY PAYSLIP', 196, 16, { align: 'right' });

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Payroll Month: ${monthName} ${year}`, 196, 21.5, { align: 'right' });

    // Thin Premium Teal Divider Line Underneath Header
    doc.setDrawColor(6, 182, 212); // Accent Teal #06B6D4
    doc.setLineWidth(0.4);
    doc.line(14, 28, 196, 28);

    // -------------------------------------------------------------
    // EMPLOYEE INFORMATION (Floating White Card)
    // -------------------------------------------------------------
    doc.setFillColor(255, 255, 255); // White background
    doc.roundedRect(14, 34, 182, 34, 2.5, 2.5, 'F');
    doc.setDrawColor(229, 231, 235); // Border #E5E7EB
    doc.setLineWidth(0.4);
    doc.roundedRect(14, 34, 182, 34, 2.5, 2.5, 'D');

    doc.setFontSize(8.5);

    // Column 1 (Left: Label x=20, Value x=54)
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Employee Name:', 20, 42);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(item.full_name, 54, 42);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Employee ID:', 20, 49);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 182, 212); // Teal Accent for ID
    doc.text(item.employee_id, 54, 49);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Designation:', 20, 56);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(item.designation || 'Staff', 54, 56);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Department:', 20, 63);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(item.department || 'General', 54, 63);

    // Column 2 (Right: Label x=110, Value x=148)
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Assigned Shift:', 110, 42);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(item.shift || 'Morning Shift', 148, 42);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Reporting Manager:', 110, 49);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(item.reporting_manager || 'N/A', 148, 49);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Payroll Month:', 110, 56);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${monthName} ${year}`, 148, 56);

    // -------------------------------------------------------------
    // ATTENDANCE SUMMARY (Three Elegant Statistic Cards)
    // -------------------------------------------------------------
    const cardW = 58;
    const cardH = 20;

    // Card 1: Worked Hours (x=14)
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 72, cardW, cardH, 2, 2, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.4);
    doc.roundedRect(14, 72, cardW, cardH, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('WORKED HOURS', 20, 79);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(`${item.total_worked_hours} Hours`, 20, 87);

    // Card 2: Worked Days (x=76)
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(76, 72, cardW, cardH, 2, 2, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.4);
    doc.roundedRect(76, 72, cardW, cardH, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('WORKED DAYS', 82, 79);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(`${item.present_days} Days`, 82, 87);

    // Card 3: Late Days (x=138)
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(138, 72, cardW, cardH, 2, 2, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.4);
    doc.roundedRect(138, 72, cardW, cardH, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('LATE DAYS', 144, 79);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('0 Days', 144, 87);

    // -------------------------------------------------------------
    // SALARY BREAKDOWN TABLE (Luxury Executive Table)
    // -------------------------------------------------------------
    // Table Header Bar (Dark Navy #0F172A)
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(14, 96, 182, 8.5, 1.5, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text('DESCRIPTION', 20, 101.5);
    doc.text('AMOUNT', 190, 101.5, { align: 'right' });

    let y = 111;

    // Format numbers with "INR " prefix for clean rendering without superscript "¹" bug!
    const rows = [
      { label: 'Monthly Salary Rate', value: `INR ${item.monthly_salary.toLocaleString('en-IN')}`, bold: false },
      { label: 'Standard Working Hours', value: `${item.standard_hours} Hours`, bold: false },
      { label: 'Hourly Rate', value: `INR ${item.hourly_rate} / hr`, bold: false },
      { label: 'Worked Hours Recorded', value: `${item.total_worked_hours} Hours`, bold: false },
      { label: 'Gross Salary', value: `INR ${item.payable_salary.toLocaleString('en-IN')}`, bold: true },
      { label: 'Total Deductions', value: `INR 0.00`, bold: false },
    ];

    rows.forEach((r, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y - 5.5, 182, 9.5, 'F');
      }

      // Soft row border
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.3);
      doc.line(14, y + 4, 196, y + 4);

      doc.setFont('helvetica', r.bold ? 'bold' : 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text(r.label, 20, y);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(r.value, 190, y, { align: 'right' });

      y += 9.5;
    });

    // -------------------------------------------------------------
    // NET PAY HERO SECTION (Full Width Premium Hero Card)
    // -------------------------------------------------------------
    const heroY = y + 5;
    doc.setFillColor(15, 23, 42); // Solid Dark Navy #0F172A Card
    doc.roundedRect(14, heroY, 182, 25, 3, 3, 'F');
    doc.setDrawColor(6, 182, 212); // Soft Teal Accent Border #06B6D4
    doc.setLineWidth(0.5);
    doc.roundedRect(14, heroY, 182, 25, 3, 3, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text('NET PAY', 22, heroY + 11);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(56, 189, 248);
    doc.text('(Take Home Salary)', 22, heroY + 17);

    // Large Amount
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(56, 189, 248); // Sky Blue / Teal Highlight
    doc.text(`INR ${item.net_pay.toLocaleString('en-IN')}`, 188, heroY + 12.5, { align: 'right' });

    // Amount in Words
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225); // Slate-300
    doc.text(numberToWords(item.net_pay), 188, heroY + 19, { align: 'right' });

    // -------------------------------------------------------------
    // FOOTER SECTION (3 Equal Sections + Slim Dark Navy Bottom Strip)
    // -------------------------------------------------------------
    const footerY = 234;

    // Container Card
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, footerY, 182, 34, 3, 3, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.4);
    doc.roundedRect(14, footerY, 182, 34, 3, 3, 'D');

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const fullYear = now.getFullYear();
    const hoursStr = String(now.getHours()).padStart(2, '0');
    const minsStr = String(now.getMinutes()).padStart(2, '0');
    const generatedTimeStr = `${day}/${month}/${fullYear} ${hoursStr}:${minsStr}`;

    // --- LEFT COLUMN: Generated Date & Version ---
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Generated Date & Time:', 20, footerY + 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(generatedTimeStr, 20, footerY + 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Payroll Version: v2.4 Enterprise', 20, footerY + 26);

    // --- CENTER COLUMN: System Generated Document Notice ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('GAYTRI COMMERCIAL', 105, footerY + 13, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Official System Generated Document', 105, footerY + 19, { align: 'center' });
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('No Signature Required', 105, footerY + 26, { align: 'center' });

    // --- RIGHT COLUMN: Authorized Signatory ---
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.line(152, footerY + 17, 190, footerY + 17);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Authorized Signatory', 190, footerY + 22, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Gaytri Commercial ERP', 190, footerY + 26.5, { align: 'right' });

    // --- SLIM DARK NAVY STRIP ACROSS FULL PAGE WIDTH ---
    doc.setFillColor(15, 23, 42); // Solid Dark Navy #0F172A
    doc.rect(0, 284, 210, 13, 'F');
    doc.setFillColor(6, 182, 212); // Accent Teal #06B6D4
    doc.rect(0, 284, 210, 0.8, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(56, 189, 248);
    doc.text('Gaytri Commercial ERP  •  Official Payroll Statement  •  Confidential Document', 105, 291, { align: 'center' });

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

      {/* LIVE TOP REPORT SUMMARY CARDS */}
      {payrollData.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="glass-panel p-3.5 sm:p-4 rounded-xl border border-slate-800 flex items-center justify-between min-w-0">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Present Today</span>
              <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-emerald-400 font-mono truncate">{summary.presentToday}</h4>
            </div>
            <Users className="w-6 h-6 text-emerald-400/50 shrink-0 ml-2" />
          </div>

          <div className="glass-panel p-3.5 sm:p-4 rounded-xl border border-slate-800 flex items-center justify-between min-w-0">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Late Today</span>
              <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-amber-400 font-mono truncate">{summary.lateToday}</h4>
            </div>
            <BarChart3 className="w-6 h-6 text-amber-400/50 shrink-0 ml-2" />
          </div>

          <div className="glass-panel p-3.5 sm:p-4 rounded-xl border border-slate-800 flex items-center justify-between min-w-0">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Working Now</span>
              <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-sky-400 font-mono truncate">{summary.workingNow}</h4>
            </div>
            <RefreshCw className="w-6 h-6 text-sky-400/50 shrink-0 ml-2" />
          </div>

          <div className="glass-panel p-3.5 sm:p-4 rounded-xl border border-slate-800 flex items-center justify-between min-w-0">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Checked Out</span>
              <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-purple-400 font-mono truncate">{summary.checkedOutToday}</h4>
            </div>
            <Users className="w-6 h-6 text-purple-400/50 shrink-0 ml-2" />
          </div>

          <div className="glass-panel p-3.5 sm:p-4 rounded-xl border border-slate-800 flex items-center justify-between min-w-0">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Today Worked Hours</span>
              <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-cyan-400 font-mono truncate">{summary.todayWorkedHours}h</h4>
            </div>
            <Calendar className="w-6 h-6 text-cyan-400/50 shrink-0 ml-2" />
          </div>

          <div className="glass-panel p-3.5 sm:p-4 rounded-xl border border-slate-800 flex items-center justify-between min-w-0">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Today Payroll Earned</span>
              <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-emerald-400 font-mono truncate">₹{summary.todayPayrollEarned.toLocaleString('en-IN')}</h4>
            </div>
            <DollarSign className="w-6 h-6 text-emerald-400/50 shrink-0 ml-2" />
          </div>

          <div className="glass-panel p-3.5 sm:p-4 rounded-xl border border-slate-800 flex items-center justify-between min-w-0">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Current Month Payroll</span>
              <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-emerald-300 font-mono truncate">₹{summary.currentMonthPayroll.toLocaleString('en-IN')}</h4>
            </div>
            <DollarSign className="w-6 h-6 text-emerald-300/50 shrink-0 ml-2" />
          </div>

          <div className="glass-panel p-3.5 sm:p-4 rounded-xl border border-slate-800 flex items-center justify-between min-w-0">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Attendance Rate</span>
              <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-amber-300 font-mono truncate">{summary.avgAttendancePercentage}%</h4>
            </div>
            <BarChart3 className="w-6 h-6 text-amber-300/50 shrink-0 ml-2" />
          </div>
        </div>
      )}

      {/* REAL-TIME PAYROLL REGISTER TABLE */}
      {payrollData.length > 0 && (
        <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden shadow-lg">
          <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
              Real-Time Payroll Register & Attendance Dashboard ({selectedMonth})
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-300 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider bg-slate-950/40">
                  <th className="py-3 px-4 pl-4 sm:pl-6">Employee</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 font-mono text-center">In / Out</th>
                  <th className="py-3 px-3 font-mono text-center">Today Worked / Paid</th>
                  <th className="py-3 px-3 font-mono text-right">Today Salary</th>
                  <th className="py-3 px-3 font-mono text-center">Month Hours</th>
                  <th className="py-3 px-3 font-mono text-right">Month Payroll</th>
                  <th className="py-3 px-3 text-center font-mono">Att %</th>
                  <th className="py-3 px-3 text-center font-mono">OT Hours</th>
                  <th className="py-3 px-4 pr-4 sm:pr-6 text-center">Payslip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-300">
                {payrollData.map((item) => (
                  <tr key={item.employee_uuid} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                    <td className="py-3 px-4 pl-4 sm:pl-6">
                      <p className="font-bold text-white text-xs">{item.full_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{item.employee_id} • {item.department}</p>
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                        item.today_status === 'PRESENT' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50' :
                        item.today_status === 'LATE' ? 'bg-amber-950/60 text-amber-400 border border-amber-800/50' :
                        item.today_status === 'WORKING' ? 'bg-sky-950/60 text-sky-400 border border-sky-800/50' :
                        item.today_status === 'HALF_DAY' ? 'bg-indigo-950/60 text-indigo-400 border border-indigo-800/50' :
                        'bg-rose-950/60 text-rose-400 border border-rose-800/50'
                      }`}>
                        {item.today_status}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-center text-slate-300 text-[11px] whitespace-nowrap">
                      <div>In: {item.today_check_in || '--:--'}</div>
                      <div className="text-slate-400 text-[10px]">Out: {item.today_check_out || '--:--'}</div>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-sky-400 text-center whitespace-nowrap">
                      <div>{item.today_worked_hours || 0}h worked</div>
                      <div className="text-slate-400 text-[10px] font-normal">{item.today_paid_hours || 0}h paid</div>
                    </td>
                    <td className="py-3 px-3 font-mono font-extrabold text-emerald-400 text-right text-xs whitespace-nowrap">
                      ₹{(item.today_daily_salary || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-200 text-center whitespace-nowrap">
                      {item.month_worked_hours || item.total_worked_hours || 0}h
                    </td>
                    <td className="py-3 px-3 font-mono font-extrabold text-emerald-300 text-right text-xs whitespace-nowrap">
                      ₹{(item.month_payroll || item.payable_salary || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 font-mono text-amber-400 text-center font-bold whitespace-nowrap">
                      {item.attendance_percentage || 100}%
                    </td>
                    <td className="py-3 px-3 font-mono text-purple-400 text-center font-semibold whitespace-nowrap">
                      {item.overtime_hours || 0}h
                    </td>
                    <td className="py-3 px-4 pr-4 sm:pr-6 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleDownloadPayslipPDF(item)}
                        className="px-2.5 py-1 bg-slate-900 border border-slate-700 hover:border-cyan-500/50 hover:bg-cyan-950/20 text-cyan-400 hover:text-cyan-300 font-bold rounded-lg text-xs transition-all shadow-sm flex items-center justify-center space-x-1.5 mx-auto cursor-pointer"
                        title={`Download PDF Payslip for ${item.full_name}`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Payslip</span>
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
