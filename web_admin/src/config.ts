const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
export const API_URL = isLocal 
  ? 'http://localhost:5000/api/v1' 
  : (process.env.NEXT_PUBLIC_API_URL || 'https://gaytri-commercial-smart-erp.onrender.com/api/v1');
