"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Activity,
  Calendar, 
  DollarSign, 
  Users, 
  Clock, 
  FileSpreadsheet, 
  Download, 
  Printer, 
  RefreshCw, 
  BarChart3, 
  Search, 
  Eye, 
  X, 
  ChevronRight, 
  UserCheck, 
  UserX, 
  ShieldAlert, 
  Briefcase,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import jsPDF from 'jspdf';
import { API_URL } from '../../../config';

// Interface definitions
interface Manager {
  id: string;
  full_name: string;
  email: string;
}

interface LiveFeedItem {
  log_id: string;
  employee_uuid: string;
  full_name: string;
  employee_id: string;
  department: string;
  shift?: string;
  status: string;
  check_in_time: string | null;
  check_out: string | null;
  working_hours: number | string;
  remarks?: string;
}

interface AttendanceReportItem {
  employee_uuid: string;
  employee_id: string;
  full_name: string;
  department: string;
  designation: string;
  shift: string;
  reporting_manager: string;
  month: string;
  present_days: number;
  absent_count: number;
  late_count: number;
  half_day_count: number;
  month_worked_hours: number;
  attendance_percentage: number;
  monthly_working_days?: number;
  half_day_weight?: number;
}

interface PayrollReportItem {
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
  monthly_working_days: number;
  paid_days: number;
  month_worked_hours: number;
  overtime_hours: number;
  month_payroll: number;
  payable_salary: number;
  net_pay: number;
  allowance?: number;
  deduction?: number;
}

interface EmployeeDailyLog {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out: string | null;
  working_hours: string | number | null;
  status: string;
  remarks: string | null;
}

export default function ReportsPage() {
  const router = useRouter();

  // Navigation Tab State
  const [activeTab, setActiveTab] = useState<'live' | 'attendance' | 'payroll'>('live');

  // Shared Filters
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportingManager, setReportingManager] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdown options
  const [managers, setManagers] = useState<Manager[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  // Module 1: Live Dashboard Data
  const [liveStats, setLiveStats] = useState({
    presentToday: 0,
    workingNow: 0,
    checkedOutToday: 0,
    lateToday: 0,
    activeEmployees: 0,
    totalStaff: 0
  });
  const [liveFeed, setLiveFeed] = useState<LiveFeedItem[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);

  // Module 2 & 3: Report Data
  const [reportData, setReportData] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState({
    monthly_working_days: 26,
    half_day_weight: 0.5,
    paid_working_hours: 9
  });
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState('');

  // Daily Detail Modal State (Module 2)
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<AttendanceReportItem | null>(null);
  const [dailyLogs, setDailyLogs] = useState<EmployeeDailyLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Fetch Managers
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
      console.error('Failed to load managers:', e);
    }
  };

  // Module 1: Fetch Live Dashboard Stats
  const fetchLiveDashboard = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoadingLive(true);
      setError('');

      const res = await fetch(`${API_URL}/attendance/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success && data.stats) {
        setLiveStats({
          presentToday: data.stats.present || 0,
          workingNow: data.stats.working || 0,
          checkedOutToday: data.stats.lastCheckout ? (data.stats.present - data.stats.working) : 0,
          lateToday: data.stats.late || 0,
          activeEmployees: data.stats.totalEmployees || data.stats.totalStaff || 0,
          totalStaff: data.stats.totalStaff || 0
        });

        const feed: LiveFeedItem[] = data.feed || [];
        setLiveFeed(feed);

        // Extract departments for filter dropdown
        const depts = Array.from(new Set(feed.map(f => f.department).filter(Boolean)));
        if (depts.length > 0) setDepartments(depts);
      }
    } catch (err) {
      console.error('Live Dashboard fetch error:', err);
      setError('Unable to load live dashboard metrics.');
    } finally {
      setLoadingLive(false);
    }
  };

  // Module 2 & 3: Fetch Report Data (Attendance & Payroll)
  const fetchReportData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoadingReport(true);
      setError('');

      const params = new URLSearchParams({
        month: selectedMonth,
        reporting_manager: reportingManager,
        status: statusFilter,
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
        setReportData(data.payroll || []);
        if (data.settings) {
          setSystemSettings({
            monthly_working_days: data.settings.monthly_working_days || 26,
            half_day_weight: data.settings.half_day_weight !== undefined ? data.settings.half_day_weight : 0.5,
            paid_working_hours: data.settings.paid_working_hours || 9
          });
        }
        // Extract departments
        const depts = Array.from(new Set((data.payroll || []).map((i: any) => i.department).filter(Boolean)));
        if (depts.length > 0) setDepartments(depts as string[]);
      } else {
        setError(data.message || 'Report compilation failed.');
      }
    } catch (err) {
      console.error('Report fetch error:', err);
      setError('Connection to server lost. Please retry.');
    } finally {
      setLoadingReport(false);
    }
  };

  // Open Employee Daily History Modal (Module 2)
  const handleOpenEmployeeDetails = async (emp: AttendanceReportItem) => {
    setSelectedEmployee(emp);
    setDetailModalOpen(true);
    setLoadingLogs(true);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const [year, month] = selectedMonth.split('-');
      const start = startDate || `${selectedMonth}-01`;
      const end = endDate || `${year}-${month}-31`;

      const params = new URLSearchParams({
        employee_id: emp.employee_uuid,
        start_date: start,
        end_date: end,
        limit: '100'
      });

      const res = await fetch(`${API_URL}/attendance/history?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setDailyLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to load employee daily logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchManagers();
    if (activeTab === 'live') {
      fetchLiveDashboard();
    } else {
      fetchReportData();
    }
  }, [activeTab, selectedMonth]);

  // Formatter helpers
  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '-';
    let str = timeStr.trim();
    if (str.includes('T')) str = str.split('T')[1];
    str = str.replace(/Z|\+\d{2}:\d{2}|-\d{2}:\d{2}|\.\d+/g, '').trim();
    const parts = str.split(':');
    if (parts.length < 2) return str;
    let hrs = parseInt(parts[0], 10);
    const mins = parts[1];
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    hrs = hrs % 12 || 12;
    return `${String(hrs).padStart(2, '0')}:${mins} ${ampm}`;
  };

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

  // Module 3: PDF Payslip Generator
  const handleDownloadPayslipPDF = (item: PayrollReportItem) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const [yearStr, monthStr] = item.month.split('-');
    const dateObj = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    const monthName = dateObj.toLocaleString('en-US', { month: 'long' });
    const year = yearStr;
    const cleanEmpId = item.employee_id.replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `Payslip_${cleanEmpId}_${monthName}_${year}.pdf`;

    // Background Watermark
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(30);
    doc.setTextColor(241, 245, 249);
    doc.text('GAYTRI COMMERCIAL', 105, 148, { align: 'center' });
    doc.setFontSize(13);
    doc.text('ENTERPRISE PAYROLL SYSTEM', 105, 156, { align: 'center' });

    // Top Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 3, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('GAYTRI COMMERCIAL', 14, 16);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Smart Enterprise Resource Planning System', 14, 21.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('MONTHLY SALARY PAYSLIP', 196, 16, { align: 'right' });
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Payroll Period: ${monthName} ${year}`, 196, 21.5, { align: 'right' });

    doc.setDrawColor(6, 182, 212);
    doc.setLineWidth(0.4);
    doc.line(14, 28, 196, 28);

    // Employee Box
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, 34, 182, 34, 2.5, 2.5, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.4);
    doc.roundedRect(14, 34, 182, 34, 2.5, 2.5, 'D');

    doc.setFontSize(8.5);
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
    doc.setTextColor(6, 182, 212);
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

    // Cards
    const cardW = 58;
    const cardH = 20;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 72, cardW, cardH, 2, 2, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(14, 72, cardW, cardH, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('WORKED HOURS', 20, 79);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(`${item.month_worked_hours} Hours`, 20, 87);

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(76, 72, cardW, cardH, 2, 2, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(76, 72, cardW, cardH, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('PAID DAYS', 82, 79);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(`${item.paid_days} / ${item.monthly_working_days || 26} Days`, 82, 87);

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(138, 72, cardW, cardH, 2, 2, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(138, 72, cardW, cardH, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('OVERTIME HOURS', 144, 79);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(`${item.overtime_hours || 0} Hours`, 144, 87);

    // Salary Table
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(14, 96, 182, 8.5, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text('DESCRIPTION', 20, 101.5);
    doc.text('AMOUNT', 190, 101.5, { align: 'right' });

    let y = 111;
    const rows = [
      { label: 'Monthly Salary Rate', value: `INR ${item.monthly_salary.toLocaleString('en-IN')}`, bold: false },
      { label: 'Configured Working Days', value: `${item.monthly_working_days || 26} Days`, bold: false },
      { label: 'Daily Salary Rate', value: `INR ${item.daily_rate.toLocaleString('en-IN')}`, bold: false },
      { label: 'Hourly Salary Rate', value: `INR ${item.hourly_rate} / hr`, bold: false },
      { label: 'Total Paid Days Earned', value: `${item.paid_days} Days`, bold: false },
      { label: 'Overtime Pay', value: `INR 0.00`, bold: false },
      { label: 'Gross Payable Salary', value: `INR ${item.payable_salary.toLocaleString('en-IN')}`, bold: true },
      { label: 'Deductions / Penalties', value: `INR 0.00`, bold: false },
    ];

    rows.forEach((r, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y - 5.5, 182, 9.5, 'F');
      }
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

    // Net Pay Card
    const heroY = y + 5;
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(14, heroY, 182, 25, 3, 3, 'F');
    doc.setDrawColor(6, 182, 212);
    doc.setLineWidth(0.5);
    doc.roundedRect(14, heroY, 182, 25, 3, 3, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text('NET SALARY PAYABLE', 22, heroY + 11);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(56, 189, 248);
    doc.text('(Take Home Salary)', 22, heroY + 17);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(56, 189, 248);
    doc.text(`INR ${item.net_pay.toLocaleString('en-IN')}`, 188, heroY + 12.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(numberToWords(item.net_pay), 188, heroY + 19, { align: 'right' });

    // Footer
    const footerY = 234;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, footerY, 182, 34, 3, 3, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(14, footerY, 182, 34, 3, 3, 'D');

    const now = new Date();
    const generatedTimeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Generated Date:', 20, footerY + 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(generatedTimeStr, 20, footerY + 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('GAYTRI COMMERCIAL ERP', 105, footerY + 13, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('System Generated Payroll Document', 105, footerY + 19, { align: 'center' });

    doc.setDrawColor(203, 213, 225);
    doc.line(152, footerY + 17, 190, footerY + 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Authorized Signatory', 190, footerY + 22, { align: 'right' });

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 284, 210, 13, 'F');
    doc.setFillColor(6, 182, 212);
    doc.rect(0, 284, 210, 0.8, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(56, 189, 248);
    doc.text('Gaytri Commercial ERP  •  Official Payroll Statement  •  Confidential', 105, 291, { align: 'center' });

    doc.save(fileName);
  };

  // CSV Export for Module 2 or Module 3
  const handleExportCSV = () => {
    if (activeTab === 'attendance') {
      const filtered = getFilteredAttendanceReport();
      if (filtered.length === 0) return;
      const headers = ['Employee Name', 'Employee ID', 'Department', 'Designation', 'Present Days', 'Absent Days', 'Late Days', 'Half Days', 'Worked Hours', 'Attendance %'];
      const csv = [
        headers.join(','),
        ...filtered.map(i => [
          `"${i.full_name}"`, `"${i.employee_id}"`, `"${i.department}"`, `"${i.designation}"`,
          i.present_days, i.absent_count, i.late_count, i.half_day_count, `"${i.month_worked_hours}h"`, `"${i.attendance_percentage}%"`
        ].join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Attendance_Report_${selectedMonth}.csv`;
      link.click();
    } else if (activeTab === 'payroll') {
      const filtered = getFilteredPayrollReport();
      if (filtered.length === 0) return;
      const headers = ['Employee Name', 'Employee ID', 'Department', 'Designation', 'Monthly Salary (INR)', 'Working Days', 'Paid Days', 'Worked Hours', 'Overtime Hours', 'Net Salary (INR)'];
      const csv = [
        headers.join(','),
        ...filtered.map(i => [
          `"${i.full_name}"`, `"${i.employee_id}"`, `"${i.department}"`, `"${i.designation}"`,
          i.monthly_salary, i.monthly_working_days || 26, i.paid_days, `"${i.month_worked_hours}h"`, i.overtime_hours || 0, i.net_pay
        ].join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Payroll_Report_${selectedMonth}.csv`;
      link.click();
    }
  };

  // Filtered List Computations
  const getFilteredLiveFeed = () => {
    return liveFeed.filter(item => {
      const matchSearch = !searchQuery || 
        item.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.employee_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDept = !departmentFilter || item.department === departmentFilter;
      const matchStatus = !statusFilter || item.status === statusFilter;
      return matchSearch && matchDept && matchStatus;
    });
  };

  const getFilteredAttendanceReport = (): AttendanceReportItem[] => {
    return reportData.filter(item => {
      const matchSearch = !searchQuery || 
        item.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.employee_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDept = !departmentFilter || item.department === departmentFilter;
      const matchStatus = !statusFilter || (
        statusFilter === 'PRESENT' ? item.present_days > 0 :
        statusFilter === 'ABSENT' ? item.absent_count > 0 :
        statusFilter === 'LATE' ? item.late_count > 0 :
        statusFilter === 'HALF_DAY' ? item.half_day_count > 0 : true
      );
      return matchSearch && matchDept && matchStatus;
    });
  };

  const getFilteredPayrollReport = (): PayrollReportItem[] => {
    return reportData.filter(item => {
      const matchSearch = !searchQuery || 
        item.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.employee_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDept = !departmentFilter || item.department === departmentFilter;
      return matchSearch && matchDept;
    });
  };

  // Summary Metrics for Module 2 (Attendance Report)
  const calculateAttendanceSummary = () => {
    const items = getFilteredAttendanceReport();
    let totalEmp = items.length;
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLate = 0;
    let totalHalfDays = 0;
    let totalHours = 0;
    let sumAttPct = 0;

    items.forEach(i => {
      totalPresent += i.present_days || 0;
      totalAbsent += i.absent_count || 0;
      totalLate += i.late_count || 0;
      totalHalfDays += i.half_day_count || 0;
      totalHours += i.month_worked_hours || 0;
      sumAttPct += i.attendance_percentage || 0;
    });

    const avgAttPct = totalEmp > 0 ? Math.round(sumAttPct / totalEmp) : 100;

    return {
      totalEmp,
      totalPresent,
      totalAbsent,
      totalLate,
      totalHalfDays,
      totalHours: parseFloat(totalHours.toFixed(2)),
      avgAttPct
    };
  };

  // Summary Metrics for Module 3 (Payroll Report)
  const calculatePayrollSummary = () => {
    const items = getFilteredPayrollReport();
    let totalPayroll = 0;
    let totalPaidDays = 0;
    let totalOT = 0;
    let sumDailyRate = 0;

    items.forEach(i => {
      totalPayroll += i.net_pay || i.payable_salary || 0;
      totalPaidDays += i.paid_days || 0;
      totalOT += i.overtime_hours || 0;
      sumDailyRate += i.daily_rate || 0;
    });

    const avgDailyRate = items.length > 0 ? Math.round(sumDailyRate / items.length) : 0;

    return {
      totalPayroll: parseFloat(totalPayroll.toFixed(2)),
      totalPaidDays: parseFloat(totalPaidDays.toFixed(1)),
      totalOT: parseFloat(totalOT.toFixed(2)),
      avgDailyRate
    };
  };

  const attSummary = calculateAttendanceSummary();
  const paySummary = calculatePayrollSummary();

  return (
    <div className="space-y-6 animate-fade-in text-slate-100 pb-12">
      {/* HEADER TITLE */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2 tracking-tight">
            <BarChart3 className="w-6 h-6 text-cyan-400" />
            Attendance & Payroll Reports
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Enterprise Activity Dashboard, Historical Attendance Metrics & Salary Registers
          </p>
        </div>

        {/* TOP MODULE TABS SWITCHER */}
        <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800 self-start sm:self-auto shrink-0 shadow-lg">
          <button
            onClick={() => setActiveTab('live')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'live'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Live Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('attendance')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'attendance'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Attendance Report</span>
          </button>

          <button
            onClick={() => setActiveTab('payroll')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'payroll'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Payroll Report</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODULE 1: LIVE ATTENDANCE DASHBOARD                                      */}
      {/* ========================================================================= */}
      {activeTab === 'live' && (
        <div className="space-y-6">
          {/* KPI CARDS (NO PAYROLL INFORMATION HERE) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
            <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Present Today</span>
                <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-emerald-400 font-mono">{liveStats.presentToday}</h4>
              </div>
              <UserCheck className="w-6 h-6 text-emerald-400/50 shrink-0 ml-2" />
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Working Now</span>
                <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-sky-400 font-mono">{liveStats.workingNow}</h4>
              </div>
              <Activity className="w-6 h-6 text-sky-400/50 shrink-0 ml-2" />
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Checked Out</span>
                <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-purple-400 font-mono">{liveStats.checkedOutToday}</h4>
              </div>
              <Clock className="w-6 h-6 text-purple-400/50 shrink-0 ml-2" />
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Late Today</span>
                <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-amber-400 font-mono">{liveStats.lateToday}</h4>
              </div>
              <AlertTriangle className="w-6 h-6 text-amber-400/50 shrink-0 ml-2" />
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between col-span-2 md:col-span-1">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Active Employees</span>
                <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-slate-200 font-mono">{liveStats.activeEmployees}</h4>
              </div>
              <Users className="w-6 h-6 text-slate-400/50 shrink-0 ml-2" />
            </div>
          </div>

          {/* LIVE STATUS TABLE & FILTERS */}
          <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden shadow-lg space-y-4 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Activity className="w-5 h-5 text-cyan-400 shrink-0 animate-pulse" />
                <div>
                  <h3 className="font-bold text-white text-sm">Today Live Activity Monitor</h3>
                  <p className="text-[11px] text-slate-400">Real-time check-in and active shift status</p>
                </div>
              </div>

              <button
                onClick={fetchLiveDashboard}
                disabled={loadingLive}
                className="py-1.5 px-3 bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 self-start sm:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLive ? 'animate-spin' : ''}`} />
                <span>Refresh Live</span>
              </button>
            </div>

            {/* LIVE FILTERS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search employee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500/40"
                />
              </div>

              <div>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs text-white outline-none focus:border-cyan-500/40"
                >
                  <option value="">All Departments</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs text-white outline-none focus:border-cyan-500/40"
                >
                  <option value="">All Live Statuses</option>
                  <option value="WORKING">Working (Active Now)</option>
                  <option value="PRESENT">Present</option>
                  <option value="LATE">Late</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="ABSENT">Absent</option>
                </select>
              </div>
            </div>

            {/* LIVE TABLE */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-slate-950/60">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3 text-center">Live Status</th>
                    <th className="py-3 px-3 font-mono text-center">Check-In</th>
                    <th className="py-3 px-3 font-mono text-center">Check-Out</th>
                    <th className="py-3 px-3 font-mono text-center">Hours Worked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
                  {loadingLive ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-400" />
                        Fetching live attendance feed...
                      </td>
                    </tr>
                  ) : getFilteredLiveFeed().length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No live activity records found for today matching your search.
                      </td>
                    </tr>
                  ) : (
                    getFilteredLiveFeed().map((item) => (
                      <tr key={item.log_id || item.employee_uuid} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-bold text-white">{item.full_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{item.employee_id}</p>
                        </td>
                        <td className="py-3 px-3 text-slate-400">{item.department || 'General'}</td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded text-[10px] font-extrabold uppercase tracking-wide ${
                            item.status === 'WORKING' ? 'bg-sky-950/70 text-sky-400 border border-sky-800/60' :
                            item.status === 'PRESENT' ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60' :
                            item.status === 'LATE' ? 'bg-amber-950/70 text-amber-400 border border-amber-800/60' :
                            item.status === 'HALF_DAY' ? 'bg-indigo-950/70 text-indigo-400 border border-indigo-800/60' :
                            'bg-rose-950/70 text-rose-400 border border-rose-800/60'
                          }`}>
                            {item.status === 'WORKING' ? 'Working Now' : item.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-center text-slate-200">
                          {item.status === 'ABSENT' ? '-' : formatTime(item.check_in_time)}
                        </td>
                        <td className="py-3 px-3 font-mono text-center text-slate-200">
                          {item.status === 'ABSENT' ? '-' : formatTime(item.check_out)}
                        </td>
                        <td className="py-3 px-3 font-mono text-center font-bold text-cyan-400">
                          {item.status === 'ABSENT' ? '0h' : `${item.working_hours || 0}h`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODULE 2: ATTENDANCE REPORT (HISTORICAL)                                 */}
      {/* ========================================================================= */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          {/* FILTERS PANEL */}
          <div className="glass-panel p-4 sm:p-6 rounded-xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-cyan-400 shrink-0" />
                <h3 className="font-bold text-white text-sm">Historical Attendance Report Filters</h3>
              </div>

              <button
                type="button"
                onClick={handleExportCSV}
                disabled={reportData.length === 0}
                className="py-1.5 px-3 bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Select Month</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-lg py-2 px-3 text-xs text-white outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Reporting Manager</label>
                <select
                  value={reportingManager}
                  onChange={(e) => setReportingManager(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-lg py-2 px-3 text-xs text-white outline-none"
                >
                  <option value="">All Managers</option>
                  {managers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Department</label>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-lg py-2 px-3 text-xs text-white outline-none"
                >
                  <option value="">All Departments</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Search Employee</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Search name or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500/40"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SUMMARY CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="glass-panel p-3.5 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Employees</span>
              <h4 className="text-lg font-mono font-extrabold text-white mt-0.5">{attSummary.totalEmp}</h4>
            </div>

            <div className="glass-panel p-3.5 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Present Days</span>
              <h4 className="text-lg font-mono font-extrabold text-emerald-400 mt-0.5">{attSummary.totalPresent}</h4>
            </div>

            <div className="glass-panel p-3.5 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Absent Days</span>
              <h4 className="text-lg font-mono font-extrabold text-rose-400 mt-0.5">{attSummary.totalAbsent}</h4>
            </div>

            <div className="glass-panel p-3.5 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Late Days</span>
              <h4 className="text-lg font-mono font-extrabold text-amber-400 mt-0.5">{attSummary.totalLate}</h4>
            </div>

            <div className="glass-panel p-3.5 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Half Days</span>
              <h4 className="text-lg font-mono font-extrabold text-indigo-400 mt-0.5">{attSummary.totalHalfDays}</h4>
            </div>

            <div className="glass-panel p-3.5 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Attendance %</span>
              <h4 className="text-lg font-mono font-extrabold text-cyan-400 mt-0.5">{attSummary.avgAttPct}%</h4>
            </div>

            <div className="glass-panel p-3.5 rounded-xl border border-slate-800 text-center col-span-2 lg:col-span-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Worked Hours</span>
              <h4 className="text-lg font-mono font-extrabold text-sky-400 mt-0.5">{attSummary.totalHours}h</h4>
            </div>
          </div>

          {/* ATTENDANCE REPORT TABLE */}
          <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden shadow-lg">
            <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Historical Employee Attendance Summary ({selectedMonth})
              </span>
              <span className="text-[11px] text-slate-400">
                Working Days: <strong className="text-cyan-400 font-mono">{systemSettings.monthly_working_days}</strong> (System Setting)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-slate-950/60">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-3 text-center">Present</th>
                    <th className="py-3 px-3 text-center">Absent</th>
                    <th className="py-3 px-3 text-center">Late</th>
                    <th className="py-3 px-3 text-center">Half Day</th>
                    <th className="py-3 px-3 font-mono text-center">Worked Hours</th>
                    <th className="py-3 px-3 font-mono text-center">Attendance %</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
                  {loadingReport ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-400" />
                        Compiling attendance summary...
                      </td>
                    </tr>
                  ) : getFilteredAttendanceReport().length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No historical attendance records found for selected month.
                      </td>
                    </tr>
                  ) : (
                    getFilteredAttendanceReport().map((item) => (
                      <tr key={item.employee_uuid} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-bold text-white">{item.full_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{item.employee_id} • {item.department}</p>
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-emerald-400 font-bold">{item.present_days}</td>
                        <td className="py-3 px-3 text-center font-mono text-rose-400 font-bold">{item.absent_count}</td>
                        <td className="py-3 px-3 text-center font-mono text-amber-400 font-bold">{item.late_count}</td>
                        <td className="py-3 px-3 text-center font-mono text-indigo-400 font-bold">{item.half_day_count}</td>
                        <td className="py-3 px-3 font-mono text-center text-slate-200">{item.month_worked_hours}h</td>
                        <td className="py-3 px-3 font-mono text-center">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            item.attendance_percentage >= 85 ? 'bg-emerald-950/60 text-emerald-400' :
                            item.attendance_percentage >= 70 ? 'bg-amber-950/60 text-amber-400' :
                            'bg-rose-950/60 text-rose-400'
                          }`}>
                            {item.attendance_percentage}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleOpenEmployeeDetails(item)}
                            className="py-1 px-3 bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-cyan-400 rounded-md text-[11px] font-bold transition-all flex items-center space-x-1 mx-auto"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View Details</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODULE 3: PAYROLL REPORT (SALARY CALCULATION)                            */}
      {/* ========================================================================= */}
      {activeTab === 'payroll' && (
        <div className="space-y-6">
          {/* FILTERS PANEL */}
          <div className="glass-panel p-4 sm:p-6 rounded-xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-emerald-400 shrink-0" />
                <h3 className="font-bold text-white text-sm">Monthly Payroll Register & Salary Filters</h3>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={reportData.length === 0}
                  className="py-1.5 px-3 bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  disabled={reportData.length === 0}
                  className="py-1.5 px-3 bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Select Month</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-lg py-2 px-3 text-xs text-white outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Reporting Manager</label>
                <select
                  value={reportingManager}
                  onChange={(e) => setReportingManager(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/40 rounded-lg py-2 px-3 text-xs text-white outline-none"
                >
                  <option value="">All Managers</option>
                  {managers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Search Employee</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Search name or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500/40"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SUMMARY CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Monthly Payroll</span>
                <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-emerald-400 font-mono">₹{paySummary.totalPayroll.toLocaleString('en-IN')}</h4>
              </div>
              <DollarSign className="w-6 h-6 text-emerald-400/50 shrink-0 ml-2" />
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Paid Days</span>
                <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-sky-400 font-mono">{paySummary.totalPaidDays}</h4>
              </div>
              <Calendar className="w-6 h-6 text-sky-400/50 shrink-0 ml-2" />
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Overtime Hours</span>
                <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-purple-400 font-mono">{paySummary.totalOT}h</h4>
              </div>
              <Clock className="w-6 h-6 text-purple-400/50 shrink-0 ml-2" />
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Avg Daily Rate</span>
                <h4 className="text-xl sm:text-2xl font-extrabold mt-1 text-slate-200 font-mono">₹{paySummary.avgDailyRate.toLocaleString('en-IN')}</h4>
              </div>
              <Briefcase className="w-6 h-6 text-slate-400/50 shrink-0 ml-2" />
            </div>
          </div>

          {/* PAYROLL REGISTER TABLE */}
          <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden shadow-lg">
            <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Salary Computation Register ({selectedMonth})
              </span>
              <span className="text-[11px] text-slate-400">
                Monthly Working Days: <strong className="text-cyan-400 font-mono">{systemSettings.monthly_working_days}</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-slate-950/60">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-3 font-mono text-center">Working Days</th>
                    <th className="py-3 px-3 font-mono text-center">Paid Days</th>
                    <th className="py-3 px-3 font-mono text-center">Worked Hours</th>
                    <th className="py-3 px-3 font-mono text-center">Overtime</th>
                    <th className="py-3 px-3 font-mono text-right">Allowance</th>
                    <th className="py-3 px-3 font-mono text-right">Deduction</th>
                    <th className="py-3 px-3 font-mono text-right">Net Salary</th>
                    <th className="py-3 px-4 text-center">Payslip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
                  {loadingReport ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-400" />
                        Calculating monthly payroll...
                      </td>
                    </tr>
                  ) : getFilteredPayrollReport().length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        No payroll data found for selected month.
                      </td>
                    </tr>
                  ) : (
                    getFilteredPayrollReport().map((item) => (
                      <tr key={item.employee_uuid} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-bold text-white">{item.full_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{item.employee_id} • {item.department}</p>
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-slate-300 font-bold">
                          {item.monthly_working_days || systemSettings.monthly_working_days || 26}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-emerald-400 font-bold">{item.paid_days}</td>
                        <td className="py-3 px-3 text-center font-mono text-slate-200">{item.month_worked_hours}h</td>
                        <td className="py-3 px-3 text-center font-mono text-purple-400">{item.overtime_hours || 0}h</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-400">₹0.00</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-400">₹0.00</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400 text-sm">
                          ₹{(item.net_pay || item.payable_salary || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleDownloadPayslipPDF(item)}
                            className="py-1 px-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-md text-[11px] font-bold transition-all flex items-center space-x-1 mx-auto shadow-sm"
                          >
                            <FileSpreadsheet className="w-3 h-3" />
                            <span>Payslip</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DAILY ATTENDANCE HISTORY MODAL (MODULE 2)                                */}
      {/* ========================================================================= */}
      {detailModalOpen && selectedEmployee && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">{selectedEmployee.full_name}</h3>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedEmployee.employee_id} • {selectedEmployee.department} • {selectedEmployee.designation}
                </p>
              </div>
              <button
                onClick={() => setDetailModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono">
              <span>Present: <strong className="text-emerald-400">{selectedEmployee.present_days}</strong></span>
              <span>Absent: <strong className="text-rose-400">{selectedEmployee.absent_count}</strong></span>
              <span>Late: <strong className="text-amber-400">{selectedEmployee.late_count}</strong></span>
              <span>Half Day: <strong className="text-indigo-400">{selectedEmployee.half_day_count}</strong></span>
              <span>Att Rate: <strong className="text-cyan-400">{selectedEmployee.attendance_percentage}%</strong></span>
            </div>

            <div className="max-h-[350px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 font-mono text-center">Check-In</th>
                    <th className="py-2.5 px-3 font-mono text-center">Check-Out</th>
                    <th className="py-2.5 px-3 font-mono text-center">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {loadingLogs ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-cyan-400" />
                        Loading daily logs...
                      </td>
                    </tr>
                  ) : dailyLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        No daily logs found for this period.
                      </td>
                    </tr>
                  ) : (
                    dailyLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-950/40">
                        <td className="py-2.5 px-3 font-mono text-slate-200">
                          {log.date ? new Date(log.date).toLocaleDateString('en-GB') : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            log.status === 'PRESENT' ? 'bg-emerald-950/70 text-emerald-400' :
                            log.status === 'LATE' ? 'bg-amber-950/70 text-amber-400' :
                            log.status === 'HALF_DAY' ? 'bg-indigo-950/70 text-indigo-400' :
                            'bg-rose-950/70 text-rose-400'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-center">
                          {log.status === 'ABSENT' ? '-' : formatTime(log.check_in_time)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-center">
                          {log.status === 'ABSENT' ? '-' : formatTime(log.check_out)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-center text-cyan-400 font-bold">
                          {log.status === 'ABSENT' ? '0h' : `${log.working_hours || 0}h`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setDetailModalOpen(false)}
                className="py-1.5 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
