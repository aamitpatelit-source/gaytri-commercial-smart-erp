"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  UserPlus, 
  Filter, 
  Smile, 
  Trash2, 
  Edit3, 
  X, 
  Camera,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Video,
  ShieldCheck,
  Upload
} from 'lucide-react';
import { API_URL } from '../../config';

const validateAndCompressImage = (
  fileOrDataUrl: File | string,
  maxWidth = 800,
  quality = 0.85
): Promise<{ success: boolean; dataUrl?: string; error?: string }> => {
  return new Promise((resolve) => {
    const processImgSrc = (src: string) => {
      const img = new Image();
      img.src = src;
      img.onerror = () => resolve({ success: false, error: 'Failed to load image for validation.' });
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve({ success: false, error: 'Could not create canvas context.' });
        }
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        const imgData = ctx.getImageData(0, 0, width, height);
        const pixels = imgData.data;
        
        let brightnessSum = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i+1];
          const b = pixels[i+2];
          brightnessSum += 0.299 * r + 0.587 * g + 0.114 * b;
        }
        const avgBrightness = brightnessSum / (pixels.length / 4);
        
        if (avgBrightness < 25) {
          return resolve({ success: false, error: 'Image is too dark. Please use better lighting.' });
        }
        if (avgBrightness > 250) {
          return resolve({ success: false, error: 'Image is overexposed. Please adjust lighting.' });
        }
        
        let contrastDiffSum = 0;
        let samples = 0;
        const startX = Math.floor(width * 0.25);
        const startY = Math.floor(height * 0.25);
        const endX = Math.floor(width * 0.75);
        const endY = Math.floor(height * 0.75);
        const step = Math.max(1, Math.floor((endX - startX) / 15));
        
        for (let y = startY; y < endY; y += step) {
          for (let x = startX; x < endX; x += step) {
            const idx = (y * width + x) * 4;
            const val = pixels[idx];
            const rightVal = pixels[idx + step * 4];
            const downVal = pixels[idx + step * width * 4];
            if (rightVal !== undefined) {
              contrastDiffSum += Math.abs(val - rightVal);
              samples++;
            }
            if (downVal !== undefined) {
              contrastDiffSum += Math.abs(val - downVal);
              samples++;
            }
          }
        }
        const avgContrastDiff = contrastDiffSum / samples;
        if (avgContrastDiff < 1.2) {
          return resolve({ success: false, error: 'Image is too blurry or lacks contrast. Please use a clear front-facing camera.' });
        }
        
        try {
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ success: true, dataUrl: compressedDataUrl });
        } catch (e) {
          resolve({ success: false, error: 'Image conversion failed.' });
        }
      };
    };

    if (typeof fileOrDataUrl === 'string') {
      processImgSrc(fileOrDataUrl);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          processImgSrc(e.target.result);
        } else {
          resolve({ success: false, error: 'Failed to read image file.' });
        }
      };
      reader.onerror = () => resolve({ success: false, error: 'Failed to read image file.' });
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
};


interface Employee {
  id: string;
  employee_id: string;
  full_name: string;
  department: string;
  shift: string;
  mobile: string;
  has_face_data: boolean;
  biometric_enrolled: boolean;
  is_active: boolean;
}

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Add/Edit Modals states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [onboardedCredentials, setOnboardedCredentials] = useState<{ employee_id: string; full_name: string } | null>(null);

  // Form inputs state
  const [empForm, setEmpForm] = useState({
    employee_id: '',
    full_name: '',
    department: 'Production',
    shift: 'Morning Shift',
    mobile: '',
    is_active: true,
  });

  // Face Registration camera modal states
  const [faceRegEmp, setFaceRegEmp] = useState<Employee | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraInitializing, setIsCameraInitializing] = useState(false);
  const [captureSuccess, setCaptureSuccess] = useState(false);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [regError, setRegError] = useState('');
  const [deletingEmp, setDeletingEmp] = useState<{ id: string; name: string } | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const playBeepNode = (type: 'success' | 'failure') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'success') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.stop(ctx.currentTime + 0.18);
      } else {
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    videoElementRef.current = node;
    if (node && cameraStream) {
      node.srcObject = cameraStream;
      node.play().catch(e => console.error("Error playing video:", e));
    }
  }, [cameraStream]);

  const showToastMsg = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchEmployees = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoading(true);
      const res = await fetch(`${API_URL}/employees`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setEmployees(data.employees || []);
      } else {
        setError(data.message || 'Failed to retrieve employee directory.');
      }
    } catch (err: any) {
      setError('Could not establish database connection.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          employee_id: empForm.employee_id,
          full_name: empForm.full_name,
          department: empForm.department,
          shift: empForm.shift,
          mobile: empForm.mobile,
          is_active: empForm.is_active,
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setOnboardedCredentials({
          employee_id: data.employee.employee_id,
          full_name: data.employee.full_name,
        });
        showToastMsg('success', 'Employee onboarded successfully');
        setShowAddModal(false);
        setEmpForm({
          employee_id: '',
          full_name: '',
          department: 'Production',
          shift: 'Morning Shift',
          mobile: '',
          is_active: true,
        });
        fetchEmployees();
      } else {
        let errorMsg = data.message || 'Failed to onboard employee.';
        if (errorMsg.includes('Internal server error')) {
          errorMsg = 'Server temporarily unavailable';
        }
        showToastMsg('error', errorMsg);
      }
    } catch (err) {
      showToastMsg('error', 'Server temporarily unavailable');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/employees/${editingEmployee.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          full_name: empForm.full_name,
          department: empForm.department,
          shift: empForm.shift,
          mobile: empForm.mobile,
          is_active: empForm.is_active,
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Employee updated successfully');
        setEditingEmployee(null);
        fetchEmployees();
      } else {
        let errorMsg = data.message || 'Failed to edit employee.';
        if (errorMsg.includes('Internal server error')) {
          errorMsg = 'Server temporarily unavailable';
        }
        showToastMsg('error', errorMsg);
      }
    } catch (err) {
      showToastMsg('error', 'Server temporarily unavailable');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!deletingEmp) return;
    const { id } = deletingEmp;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/employees/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToastMsg('success', 'Employee deleted successfully');
        setDeletingEmp(null);
        fetchEmployees();
      } else {
        let errorMsg = data.message || 'Failed to remove employee.';
        if (errorMsg.includes('Internal server error')) {
          errorMsg = 'Server temporarily unavailable';
        }
        showToastMsg('error', errorMsg);
      }
    } catch (err) {
      showToastMsg('error', 'Server temporarily unavailable');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Webcam Stream
  const startCamera = async () => {
    setCameraError('');
    setIsCameraInitializing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 400, height: 300, facingMode: 'user' }
      });
      setCameraStream(stream);
    } catch (err: any) {
      setCameraError('Webcam access blocked or camera device not connected. Check browser permissions.');
      console.error(err);
    } finally {
      setIsCameraInitializing(false);
    }
  };

  // Close Webcam Stream
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  const openFaceRegistration = (emp: Employee) => {
    setFaceRegEmp(emp);
    setCameraError('');
    setCaptureSuccess(false);
    setCapturedPhotoUrl(null);
    setFlashActive(false);
    setRegError('');
    // Wait for DOM update, then start camera
    setTimeout(() => startCamera(), 100);
  };

  const closeFaceRegistration = () => {
    stopCamera();
    setFaceRegEmp(null);
    setCaptureSuccess(false);
    setCapturedPhotoUrl(null);
    setFlashActive(false);
    setRegError('');
  };

  const captureAndRegisterFace = async () => {
    if (!faceRegEmp) return;
    setIsCapturing(true);
    setRegError('');

    let finalPhotoUrl = capturedPhotoUrl;

    if (!finalPhotoUrl) {
      setFlashActive(true);
      setTimeout(() => setFlashActive(false), 150);

      if (videoElementRef.current && canvasRef.current) {
        const video = videoElementRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 400;
        canvas.height = video.videoHeight || 300;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg');
          
          const validateResult = await validateAndCompressImage(dataUrl);
          if (!validateResult.success) {
            playBeepNode('failure');
            setRegError(validateResult.error || 'Quality validation failed.');
            setIsCapturing(false);
            return;
          }
          finalPhotoUrl = validateResult.dataUrl!;
          setCapturedPhotoUrl(finalPhotoUrl);
        }
      }
    }

    if (!finalPhotoUrl) {
      setRegError('Please capture or upload a photo first.');
      setIsCapturing(false);
      return;
    }

    try {
      const token = localStorage.getItem('access_token');

      const res = await fetch(`${API_URL}/employees/${faceRegEmp.id}/register-face`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          profile_photo_url: finalPhotoUrl
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCaptureSuccess(true);
        playBeepNode('success');

        showToastMsg('success', `Face photo registered for ${faceRegEmp.full_name}. Complete biometric enrollment on the scanner device.`);
        closeFaceRegistration();
        fetchEmployees();
      } else {
        throw new Error(data.message || 'Face enrollment failed.');
      }
    } catch (err: any) {
      console.error(err);
      playBeepNode('failure');
      const errorMessage = err?.message || 'Face photo upload failed.';
      setRegError(errorMessage);
      showToastMsg('error', errorMessage);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleImageFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    
    if (file.size > 5 * 1024 * 1024) {
      playBeepNode('failure');
      setRegError('File size exceeds 5MB limit.');
      return;
    }
    
    setIsCapturing(true);
    setRegError('');
    
    const result = await validateAndCompressImage(file);
    if (!result.success) {
      playBeepNode('failure');
      setRegError(result.error || 'Quality validation failed.');
      setIsCapturing(false);
      return;
    }
    
    setCapturedPhotoUrl(result.dataUrl!);
    stopCamera();
    setIsCapturing(false);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmpForm({
      employee_id: emp.employee_id,
      full_name: emp.full_name,
      department: emp.department,
      shift: emp.shift,
      mobile: emp.mobile,
      is_active: emp.is_active !== false,
    });
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.employee_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = selectedDept === 'ALL' || emp.department === selectedDept;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-8 text-slate-100 relative">
      <div className="space-y-8 animate-fade-in">
      
      {/* Toast Alert Header Bar */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center space-x-3 px-4 py-3 rounded-lg border shadow-lg text-sm font-semibold transition-all ${
          toast.type === 'success' 
            ? 'bg-emerald-950/90 text-emerald-450 border-emerald-500/30' 
            : 'bg-rose-950/90 text-rose-450 border-rose-500/30'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-450" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Search and Action Toolbar header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-slate-350" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or employee ID..."
            className="w-full pl-10 pr-4 py-2.5 glass-input text-sm text-white"
          />
        </div>

        <div className="flex space-x-3">
          {/* Department Filter dropdown */}
          <div className="relative">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="pl-3 pr-8 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold text-cyan-400 focus:outline-none focus:border-cyan-500 appearance-none cursor-pointer hover:border-cyan-400"
            >
              <option value="ALL">All Departments</option>
              <option value="Production">Production</option>
              <option value="Quality Control">Quality Control</option>
              <option value="Logistics">Logistics</option>
              <option value="Administration">Administration</option>
            </select>
            <Filter className="absolute right-2.5 top-3.5 w-3.5 h-3.5 text-cyan-400 pointer-events-none" />
          </div>

          <button
            onClick={() => {
              setEmpForm({
                employee_id: '',
                full_name: '',
                department: 'Production',
                shift: 'Morning Shift',
                mobile: '',
                is_active: true,
              });
              setShowAddModal(true);
            }}
            className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold flex items-center space-x-2 shadow-neon-glow text-xs"
          >
            <UserPlus className="w-4 h-4 text-slate-950" />
            <span>Onboard Employee</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-350 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Main Employee Directory list */}
      <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
            Active Staff Register ({filteredEmployees.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs text-cyan-400 font-bold">Querying employees directory...</p>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-semibold text-xs">
              No employees registered under current selection criteria.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-200 text-[10px] font-extrabold uppercase tracking-wider bg-slate-950/30">
                  <th className="pb-3 pt-4 pl-6 w-[12%]">Employee ID</th>
                  <th className="pb-3 pt-4 w-[20%]">Name</th>
                  <th className="pb-3 pt-4 w-[14%]">Department</th>
                  <th className="pb-3 pt-4 w-[14%]">Assigned Shift</th>
                  <th className="pb-3 pt-4 w-[14%]">Mobile</th>
                  <th className="pb-3 pt-4 w-[14%]">Status & Face ID</th>
                  <th className="pb-3 pt-4 pr-6 text-center w-[12%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-xs text-slate-300">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-900/30 transition-colors border-b border-slate-800">
                    <td className="py-4 pl-6 font-mono text-cyan-400 font-extrabold">{emp.employee_id}</td>
                    <td className="py-4 font-bold text-white text-sm">{emp.full_name}</td>
                    <td className="py-4 font-semibold text-slate-200">{emp.department}</td>
                    <td className="py-4 font-medium text-slate-200">{emp.shift}</td>
                    <td className="py-4 font-mono text-slate-200">{emp.mobile}</td>
                    <td className="py-4">
                      <div className="flex flex-col space-y-1">
                        {emp.is_active !== false ? (
                          <span className="w-fit px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-950/35 text-emerald-450 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="w-fit px-2 py-0.5 rounded text-[9px] font-bold bg-rose-950/30 text-rose-400 border border-rose-500/20">
                            SUSPENDED
                          </span>
                        )}
                        {emp.has_face_data ? (
                          <span className="w-fit inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950/30 text-emerald-400 border border-emerald-500/20 neon-glow-emerald">
                            <Smile className="w-3 h-3 text-emerald-400" />
                            <span>Face Photo Registered</span>
                          </span>
                        ) : (
                          <span className="w-fit inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-950/30 text-amber-400 border border-amber-500/20">
                            <Camera className="w-3 h-3 text-amber-400" />
                            <span>Pending Face Photo</span>
                          </span>
                        )}
                        {emp.biometric_enrolled ? (
                          <span className="w-fit inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-950/30 text-cyan-300 border border-cyan-500/20">
                            <ShieldCheck className="w-3 h-3 text-cyan-300" />
                            <span>Biometric Enrolled</span>
                          </span>
                        ) : (
                          <span className="w-fit inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-900/60 text-slate-300 border border-slate-700">
                            <Video className="w-3 h-3 text-slate-300" />
                            <span>Biometric Pending</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 pr-6 text-center">
                      <div className="flex items-center justify-center space-x-2.5">
                        <button
                          onClick={() => openFaceRegistration(emp)}
                          className="px-2 py-1 rounded bg-slate-900 border border-slate-700 hover:border-emerald-500/30 hover:text-emerald-400 text-slate-300 font-semibold text-[10px] flex items-center space-x-1 transition-colors"
                        >
                          <Camera className="w-3 h-3" />
                          <span>Register Face</span>
                        </button>
                        <button
                          onClick={() => openEditModal(emp)}
                          className="p-1.5 rounded bg-slate-900 border border-slate-750 hover:bg-cyan-950/20 hover:text-cyan-400 text-slate-400 transition-colors"
                          title="Edit Profile"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingEmp({ id: emp.id, name: emp.full_name })}
                          className="p-1.5 rounded bg-slate-900 border border-slate-750 hover:bg-rose-950/20 hover:text-rose-450 text-slate-400 transition-colors"
                          title="Delete Profile"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      </div>

      {/* Onboard Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => setShowAddModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-350 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <UserPlus className="w-5 h-5 text-cyan-400" />
              <h3 className="font-extrabold text-base text-white">Onboard New Employee</h3>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-4">
              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Employee ID</label>
                <input
                  type="text"
                  value={empForm.employee_id}
                  onChange={(e) => setEmpForm({...empForm, employee_id: e.target.value})}
                  placeholder="e.g. GC-025"
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Full Name</label>
                <input
                  type="text"
                  value={empForm.full_name}
                  onChange={(e) => setEmpForm({...empForm, full_name: e.target.value})}
                  placeholder="e.g. Rajesh Sharma"
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Mobile Number</label>
                <input
                  type="text"
                  value={empForm.mobile}
                  onChange={(e) => setEmpForm({...empForm, mobile: e.target.value})}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Department</label>
                  <select
                    value={empForm.department}
                    onChange={(e) => setEmpForm({...empForm, department: e.target.value})}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-500 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-cyan-400 transition-colors"
                  >
                    <option value="Production">Production</option>
                    <option value="Quality Control">Quality Control</option>
                    <option value="Logistics">Logistics</option>
                    <option value="Administration">Administration</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Assigned Shift</label>
                  <select
                    value={empForm.shift}
                    onChange={(e) => setEmpForm({...empForm, shift: e.target.value})}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-500 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-cyan-400 transition-colors"
                  >
                    <option value="Morning Shift">Morning Shift</option>
                    <option value="Night Shift">Night Shift</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 mt-6 disabled:opacity-50"
              >
                {actionLoading ? 'Creating...' : 'Onboard Employee'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md glass-panel rounded-2xl border border-slate-700 shadow-glass-shadow p-6 relative">
            <button 
              onClick={() => setEditingEmployee(null)}
              className="absolute right-4 top-4 p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-350 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-6">
              <Edit3 className="w-5 h-5 text-cyan-400" />
              <h3 className="font-extrabold text-base text-white">Edit Employee Profile</h3>
            </div>

            <form onSubmit={handleUpdateEmployee} className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-350 font-extrabold uppercase tracking-wider block mb-1">Employee ID (Read-only)</label>
                <input
                  type="text"
                  value={empForm.employee_id}
                  disabled
                  className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-xs font-mono text-slate-400 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Full Name</label>
                <input
                  type="text"
                  value={empForm.full_name}
                  onChange={(e) => setEmpForm({...empForm, full_name: e.target.value})}
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Mobile Number</label>
                <input
                  type="text"
                  value={empForm.mobile}
                  onChange={(e) => setEmpForm({...empForm, mobile: e.target.value})}
                  className="w-full px-3 py-2.5 glass-input text-xs text-white font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Department</label>
                  <select
                    value={empForm.department}
                    onChange={(e) => setEmpForm({...empForm, department: e.target.value})}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-500 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-cyan-400 transition-colors"
                  >
                    <option value="Production">Production</option>
                    <option value="Quality Control">Quality Control</option>
                    <option value="Logistics">Logistics</option>
                    <option value="Administration">Administration</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Assigned Shift</label>
                  <select
                    value={empForm.shift}
                    onChange={(e) => setEmpForm({...empForm, shift: e.target.value})}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-500 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-cyan-400 transition-colors"
                  >
                    <option value="Morning Shift">Morning Shift</option>
                    <option value="Night Shift">Night Shift</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider block mb-1">Account Status</label>
                <select
                  value={empForm.is_active ? "true" : "false"}
                  onChange={(e) => setEmpForm({...empForm, is_active: e.target.value === "true"})}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-550 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-cyan-400 transition-colors"
                >
                  <option value="true">Active</option>
                  <option value="false">Suspended</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all duration-300 shadow-neon-glow flex items-center justify-center space-x-1.5 mt-6 disabled:opacity-50"
              >
                {actionLoading ? 'Saving...' : 'Update Employee Profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Webcam Face Registration Modal */}
      {faceRegEmp && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex z-50 animate-fade-in"
          style={{
            marginTop: '40px',
            paddingTop: '24px',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {/* Custom Scanner Animations */}
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes scan {
              0%, 100% { transform: translateY(-70px); opacity: 0.3; }
              50% { transform: translateY(70px); opacity: 1; }
            }
            .animate-scanner-scan {
              animation: scan 3.5s infinite ease-in-out;
            }
            @keyframes spin-slow {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            .animate-spin-slow {
              animation: spin-slow 10s linear infinite;
            }
            @keyframes flash-animation {
              0% { opacity: 0; }
              10% { opacity: 1; }
              100% { opacity: 0; }
            }
            .flash-overlay {
              animation: flash-animation 0.5s ease-out forwards;
            }
          `}} />

            <div className="w-full max-w-md glass-panel rounded-2xl border border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.6)] p-5 relative">
              {/* Close Button */}
              <button 
                onClick={closeFaceRegistration}
                className="absolute right-4 top-4 p-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Modal Header */}
              <div className="flex items-center space-x-3 border-b border-slate-800/80 pb-4 mb-5">
                <div className="p-2.5 bg-cyan-950/30 border border-cyan-500/30 rounded-lg text-cyan-400">
                  <Camera className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Face Biometric Scanner</h3>
                  <p className="text-xs text-slate-350 mt-0.5 font-bold uppercase tracking-wider">
                    Registering: <span className="text-cyan-400 font-mono">{faceRegEmp.full_name} ({faceRegEmp.employee_id})</span>
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Hidden Canvas for Capturing Snapshots */}
                <canvas ref={canvasRef} className="hidden" />

                {/* Camera Frame Preview Container */}
                <div className={`bg-slate-950 border rounded-2xl overflow-hidden relative w-full aspect-square max-w-[300px] mx-auto flex items-center justify-center transition-all duration-300 ${
                  captureSuccess 
                    ? 'border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.25)]'
                    : regError
                      ? 'border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)]'
                      : cameraStream 
                        ? 'border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                        : 'border-slate-800'
                }`}>
                {/* 1. Loading/Initializing State */}
                {isCameraInitializing && (
                  <div className="text-center space-y-3 z-10">
                    <RefreshCw className="w-8 h-8 text-cyan-400 mx-auto animate-spin" />
                    <p className="text-xs text-slate-300 font-bold uppercase tracking-wider">Initializing Camera...</p>
                  </div>
                )}

                {/* 2. Connecting State (Non-error, no stream yet) */}
                {!isCameraInitializing && !cameraError && !cameraStream && (
                  <div className="text-center space-y-3 z-10">
                    <Video className="w-8 h-8 text-cyan-400 mx-auto animate-pulse" />
                    <p className="text-xs text-slate-300 font-bold uppercase tracking-wider">Connecting webcam input...</p>
                  </div>
                )}

                {/* 3. Error state */}
                {cameraError && (
                  <div className="p-6 text-center space-y-3 z-10 bg-slate-950/95 absolute inset-0 flex flex-col justify-center items-center">
                    <AlertTriangle className="w-10 h-10 text-rose-500" />
                    <p className="text-xs text-rose-400 font-bold max-w-[85%] leading-relaxed">{cameraError}</p>
                    <button
                      onClick={startCamera}
                      className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-cyan-400 hover:text-cyan-300 hover:border-cyan-500/30 text-xs font-bold transition-all mt-4 cursor-pointer"
                    >
                      Retry Camera Hook
                    </button>
                  </div>
                )}

                {/* 4. Uploaded Image Preview */}
                {capturedPhotoUrl && !captureSuccess && (
                  <img
                    src={capturedPhotoUrl}
                    alt="Selected face preview"
                    className="w-full h-full object-cover object-center"
                  />
                )}

                {/* 5. Active Video Stream */}
                {cameraStream && !capturedPhotoUrl && (
                  <video 
                    ref={videoRef}
                    autoPlay 
                    playsInline 
                    muted
                    className="w-full h-full object-cover object-center scale-x-[-1]" // mirror preview
                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                  />
                )}

                {/* 6. Live Camera Status Badges Overlay */}
                {cameraStream && !capturedPhotoUrl && !isCapturing && !captureSuccess && (
                  <div className="absolute top-3 left-3 right-3 flex justify-between pointer-events-none z-10">
                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold bg-slate-950/90 border border-emerald-500/30 text-emerald-400">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                      <span>Camera Active</span>
                    </span>
                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold bg-slate-950/90 border border-cyan-500/30 text-cyan-400">
                      <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                      <span>AI Face Ready</span>
                    </span>
                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold bg-slate-950/90 border border-slate-850 text-slate-350">
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Secure Link</span>
                    </span>
                  </div>
                )}

                {/* 7. Face Scan Target Guide Overlay */}
                {cameraStream && !capturedPhotoUrl && !isCapturing && !captureSuccess && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center translate-y-4 pointer-events-none z-10">
                    {/* Scanner Outer Ring with Spinning Effect */}
                    <div className="w-48 h-48 rounded-full border border-dashed border-cyan-400/25 animate-spin-slow" />
                    
                    {/* Glowing Target Circle */}
                    <div className="absolute w-40 h-40 rounded-full border-2 border-cyan-400/60 shadow-[0_0_20px_rgba(0,229,255,0.2)] flex items-center justify-center">
                      <div className="absolute inset-2 rounded-full border border-cyan-500/15" />
                    </div>

                    {/* Scanning pulse bar */}
                    <div className="absolute w-40 h-[2px] bg-cyan-400/80 shadow-[0_0_12px_rgba(0,229,255,0.9)] animate-scanner-scan" />

                    {/* Instruction Tag */}
                    <span className="absolute bottom-6 text-[9px] font-extrabold text-cyan-400 tracking-widest uppercase bg-slate-950/90 border border-cyan-500/20 px-3 py-1 rounded-full shadow-[0_0_12px_rgba(0,229,255,0.1)]">
                      Align Face in Frame
                    </span>
                  </div>
                )}

                {/* 8. Flash Overlay Animation */}
                {flashActive && (
                  <div className="absolute inset-0 bg-white flash-overlay z-25 pointer-events-none" />
                )}

                {/* 9. Uploaded Preview Badge */}
                {capturedPhotoUrl && !isCapturing && !captureSuccess && (
                  <div className="absolute top-3 left-3 z-10">
                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold bg-slate-950/90 border border-cyan-500/30 text-cyan-300">
                      <Upload className="w-3.5 h-3.5 text-cyan-300" />
                      <span>Uploaded Image Ready</span>
                    </span>
                  </div>
                )}

                {/* 10. Generating Embeddings Overlay */}
                {isCapturing && !captureSuccess && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 z-30">
                    <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                    <p className="text-xs text-emerald-400 font-extrabold tracking-widest uppercase">Saving face photo...</p>
                  </div>
                )}

                {/* 11. Success Captured State Overlay */}
                {captureSuccess && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center space-y-4 z-40 animate-fade-in">
                    {capturedPhotoUrl && (
                      <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-emerald-400 shadow-neon-glow neon-glow-emerald animate-scale-up">
                        <img src={capturedPhotoUrl} alt="Capture Thumbnail" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="text-center space-y-1.5">
                      <div className="flex items-center justify-center space-x-1.5 text-emerald-400 font-extrabold text-sm">
                        <CheckCircle className="w-5 h-5" />
                        <span>Face Captured Successfully</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Face photo saved</p>
                    </div>
                  </div>
                )}
              </div>

              {/* File Upload Selector */}
              {!captureSuccess && !isCapturing && (
                <div className="mt-3 flex flex-col items-center justify-center border border-dashed border-slate-800 hover:border-cyan-500/40 rounded-xl p-3 bg-slate-950/40 transition-all max-w-[300px] mx-auto w-full">
                  <label className="text-xs font-bold text-slate-300 cursor-pointer flex items-center space-x-1.5 hover:text-cyan-400">
                    <Upload className="w-4 h-4 text-cyan-400" />
                    <span>Upload Profile Image File</span>
                    <input 
                      type="file" 
                      accept="image/png, image/jpeg, image/jpg" 
                      className="hidden" 
                      onChange={handleImageFileUpload}
                    />
                  </label>
                  <span className="text-[9px] text-slate-400 mt-1 font-semibold uppercase tracking-wider">Supports JPEG, PNG (Max 5MB)</span>
                  {capturedPhotoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setCapturedPhotoUrl(null);
                        setRegError('');
                        startCamera();
                      }}
                      className="mt-2 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      Retake With Camera
                    </button>
                  )}
                </div>
              )}

              {/* Instructional Guidelines / Errors panel */}
              {regError ? (
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/35 text-rose-300 text-xs space-y-2 animate-fade-in shadow-[0_0_15px_rgba(244,63,94,0.05)]">
                  <div className="flex items-center space-x-1.5 font-extrabold text-rose-250">
                    <AlertTriangle className="w-4 h-4 text-rose-450" />
                    <span className="uppercase tracking-wider">Detection Conflict</span>
                  </div>
                  <p className="font-semibold text-rose-350 leading-relaxed">{regError}</p>
                </div>
              ) : (
                <div className="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-xl text-slate-350 text-xs leading-relaxed">
                  <span className="font-extrabold text-white block mb-1">Onboarding Checklist:</span>
                  <ul className="list-disc pl-4 space-y-1 text-slate-350 font-medium">
                    <li>Ensure the face is well-lit and not shadowed.</li>
                    <li>Remove caps, masks, or large sunglasses.</li>
                    <li>Position your face directly in the center guide frame.</li>
                  </ul>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3 pt-1">
                <button
                  onClick={closeFaceRegistration}
                  type="button"
                  className="flex-1 py-2.5 rounded-lg bg-slate-900 border border-slate-750 hover:bg-slate-850 hover:text-white text-slate-300 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={captureAndRegisterFace}
                  disabled={(!cameraStream && !capturedPhotoUrl) || isCapturing || isCameraInitializing || captureSuccess}
                  type="button"
                  className="flex-[2] py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs transition-all shadow-neon-glow hover:shadow-[0_0_20px_rgba(6,182,212,0.2)] flex items-center justify-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isCapturing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                      <span>Saving face photo...</span>
                    </>
                  ) : (
                    <>
                      <Smile className="w-4 h-4 text-slate-950" />
                      <span>Save Face Photo</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingEmp && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.6)] p-6 relative text-center">
            <div className="w-12 h-12 rounded-full bg-rose-950/30 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-rose-500 animate-pulse" />
            </div>
            <h3 className="font-extrabold text-base text-white mb-2">Delete Employee Profile</h3>
            <p className="text-xs text-slate-355 leading-relaxed mb-6">
              Are you sure you want to permanently remove <span className="text-white font-bold">{deletingEmp.name}</span> from the employee directory? This action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setDeletingEmp(null)}
                className="flex-1 py-2.5 rounded-lg bg-slate-900 border border-slate-750 text-slate-350 hover:text-white hover:bg-slate-850 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEmployee}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-40"
              >
                {actionLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarded Confirmation Modal */}
      {onboardedCredentials && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.15)] p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto mb-4">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="font-extrabold text-base text-white mb-1">Employee Profile Created!</h3>
            <p className="text-xs text-slate-350 mb-6">
              Employee profile has been successfully created. You can now register their face biometric scan.
            </p>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-left font-mono space-y-2 mb-6 text-xs select-all">
              <div>
                <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider">Employee ID:</span>
                <span className="text-cyan-400 font-bold">{onboardedCredentials.employee_id}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider">Full Name:</span>
                <span className="text-white font-bold">{onboardedCredentials.full_name}</span>
              </div>
            </div>

            <button
              onClick={() => setOnboardedCredentials(null)}
              className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs transition-all shadow-neon-glow flex items-center justify-center cursor-pointer"
            >
              Done Onboarding
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
