import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';

// IMPORT SEMUA HALAMAN
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Pemeriksaan from './pages/Pemeriksaan';
import Laporan from './pages/Laporan';
import Admin from './pages/Admin';
import Peralatan from './pages/Peralatan';
import Pembelian from './pages/Pembelian';
import Arsip from './pages/Arsip';
import AuditLog from './pages/AuditLog';

// Import Halaman Publik & Absensi Baru
import AbsensiPublik from './pages/AbsensiPublik';
import Absensi from './pages/Absensi';

// IMPORT HALAMAN LAPORAN BERKAS (BARU)
import LaporanBerkas from './pages/LaporanBerkas';

// KOMPONEN PELINDUNG RUTE (PROTECTED ROUTE)
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="w-12 h-12 border-4 border-[#1A73E8] border-t-transparent rounded-full animate-spin"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'pemeriksa') return <Navigate to="/pemeriksaan" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<Login />} />
          
          {/* RUTE PUBLIK (TIDAK PERLU LOGIN) */}
          <Route path="/absen" element={<AbsensiPublik />} />
          
          <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin', 'supervisor']}><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/laporan" element={<ProtectedRoute allowedRoles={['admin', 'supervisor']}><Layout><Laporan /></Layout></ProtectedRoute>} />
          
          {/* RUTE LAPORAN BERKAS (BARU) */}
          <Route path="/laporan-berkas" element={<ProtectedRoute allowedRoles={['admin', 'supervisor']}><Layout><LaporanBerkas /></Layout></ProtectedRoute>} />
          
          <Route path="/pemeriksaan" element={<ProtectedRoute allowedRoles={['admin', 'pemeriksa']}><Layout><Pemeriksaan /></Layout></ProtectedRoute>} />
          
          {/* RUTE REKAP ABSENSI BARU */}
          <Route path="/absensi" element={<ProtectedRoute allowedRoles={['admin', 'supervisor']}><Layout><Absensi /></Layout></ProtectedRoute>} />
          
          {/* RUTE-RUTE PECAHAN DARI PANEL ADMIN */}
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><Layout><Admin /></Layout></ProtectedRoute>} />
          <Route path="/peralatan" element={<ProtectedRoute allowedRoles={['admin']}><Layout><Peralatan /></Layout></ProtectedRoute>} />
          <Route path="/pembelian" element={<ProtectedRoute allowedRoles={['admin']}><Layout><Pembelian /></Layout></ProtectedRoute>} />
          <Route path="/arsip" element={<ProtectedRoute allowedRoles={['admin', 'supervisor']}><Layout><Arsip /></Layout></ProtectedRoute>} />
          <Route path="/audit" element={<ProtectedRoute allowedRoles={['admin']}><Layout><AuditLog /></Layout></ProtectedRoute>} />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}