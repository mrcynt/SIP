import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { processSyncQueue } from '../utils/syncManager'; 
import { dbLocal } from '../db/offlineDB'; 
import Modal from './Modal'; 

function PingIndicator() {
  const [ping, setPing] = useState(null);

  useEffect(() => {
    if (!navigator.onLine) { setPing('OFFLINE'); return; }
    const measurePing = async () => {
      if (!navigator.onLine) { setPing('OFFLINE'); return; }
      const startTime = performance.now();
      try {
        await fetch(`${window.location.origin}/favicon.ico?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
        const endTime = performance.now();
        setPing(Math.round(endTime - startTime));
      } catch (err) { setPing('ERR'); }
    };
    measurePing();
    const interval = setInterval(measurePing, 4000);
    return () => clearInterval(interval);
  }, []);

  if (ping === 'OFFLINE') return (<span className="bg-red-50 text-[#C5221F] px-3 py-1 rounded-full font-mono font-bold flex items-center gap-1.5 border border-red-200 text-[11px] whitespace-nowrap"><span className="w-1.5 h-1.5 bg-[#EA4335] rounded-full animate-ping"></span>OFFLINE</span>);
  if (ping === 'ERR' || ping === null) return (<span className="bg-slate-100 text-slate-400 px-3 py-1 rounded-full font-mono font-bold flex items-center gap-1.5 border border-slate-200 text-[11px] whitespace-nowrap"><span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>-- ms</span>);

  let badgeStyle = "bg-emerald-50 text-[#137333] border-emerald-200"; let dotStyle = "bg-[#34A853]";
  if (ping > 150 && ping <= 300) { badgeStyle = "bg-amber-50 text-[#B06000] border-amber-200"; dotStyle = "bg-[#FBBC05] animate-pulse"; } 
  else if (ping > 300) { badgeStyle = "bg-red-50 text-[#A50E0E] border-red-200"; dotStyle = "bg-[#EA4335] animate-pulse"; }

  return (<span className={`px-2.5 sm:px-3 py-1 rounded-full font-mono font-black text-[10px] sm:text-[11px] flex items-center gap-1.5 border ${badgeStyle} transition-all shadow-sm whitespace-nowrap`}><span className={`w-1.5 h-1.5 rounded-full ${dotStyle}`}></span>{ping} ms</span>);
}

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false); 
  const [pendingCount, setPendingCount] = useState(0); 
  const [pendingList, setPendingList] = useState([]);
  const [showQueueModal, setShowQueueModal] = useState(false);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  
  // STATE BARU: KONTROL MODAL PUSAT BANTUAN
  const [showHelpModal, setShowHelpModal] = useState(false);

  useEffect(() => { document.documentElement.classList.remove('dark'); }, []);

  const fetchPendingData = async () => {
    const list = await dbLocal.antrean_pemeriksaan.toArray();
    setPendingList(list); setPendingCount(list.length);
  };

  useEffect(() => { fetchPendingData(); }, [location]); 

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true); setShowBackOnline(true);
      const count = await dbLocal.antrean_pemeriksaan.count();
      if (count > 0) {
        setIsSyncing(true);
        const sukses = await processSyncQueue();
        setIsSyncing(false); await fetchPendingData(); 
        if (sukses > 0) alert(`✅ SINKRONISASI BERHASIL!\n${sukses} data offline telah dikirim ke server.`);
      }
      setTimeout(() => setShowBackOnline(false), 3000);
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => { window.location.reload(); }, 400);
  };

  const handleExecuteLogout = () => {
    setShowLogoutModal(false);
    logout();
    navigate('/login');
  };

  const allMenuItems = [
    { name: 'Dashboard', path: '/dashboard', roles: ['admin', 'supervisor'], icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> },
    { name: 'Pemeriksaan', path: '/pemeriksaan', roles: ['pemeriksa'], icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zM15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
    { name: 'Laporan Data', path: '/laporan', roles: ['admin', 'supervisor'], icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
    { name: 'Folder Arsip', path: '/arsip', roles: ['admin', 'supervisor'], icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg> },
    { name: 'Peralatan', path: '/peralatan', roles: ['admin'], icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg> },
    { name: 'Pembelian', path: '/pembelian', roles: ['admin'], icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
    { name: 'Konfigurasi', path: '/admin', roles: ['admin'], icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg> },
    { name: 'Audit Log', path: '/audit', roles: ['admin'], icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> }
  ];

  const menuItems = allMenuItems.filter(item => user && item.roles.includes(user.role));

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-800 font-sans overflow-hidden flex-col relative select-none">
      
      {/* POP-UP MODAL PUSAT BANTUAN HYBRID */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-slate-900/70 z-[80] flex justify-center items-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">
            <div className="p-5 sm:p-6 bg-[#1A73E8] text-white flex justify-between items-center shrink-0">
              <h3 className="font-extrabold text-lg flex items-center gap-2"><span>ℹ️</span> Pusat Bantuan SIP</h3>
              <button onClick={() => setShowHelpModal(false)} className="text-white hover:bg-white/20 w-8 h-8 rounded-full flex items-center justify-center transition-colors font-bold text-lg">✕</button>
            </div>
            
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 bg-slate-50 space-y-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                <h4 className="font-black text-slate-800 text-sm mb-1.5">📸 Kamera Scanner Tidak Terbuka?</h4>
                <p className="text-xs font-medium text-slate-600 leading-relaxed">Pastikan Anda sudah memberikan izin (allow) akses kamera pada browser Chrome Anda. Jika macet, coba segarkan (refresh) halaman.</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                <h4 className="font-black text-slate-800 text-sm mb-1.5">📡 Sinyal Hilang di Lapangan?</h4>
                <p className="text-xs font-medium text-slate-600 leading-relaxed">Jangan panik! Tetap lanjutkan proses scan dan simpan. Data akan otomatis masuk ke memori HP Anda dan akan langsung dikirim ke server saat sinyal internet kembali.</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                <h4 className="font-black text-slate-800 text-sm mb-1.5">📦 Cara Memotong Stok Alat Gudang?</h4>
                <p className="text-xs font-medium text-slate-600 leading-relaxed">Gunakan tombol <span className="font-bold text-amber-700 bg-amber-50 px-1 rounded">🤝 Pakai</span> berwarna kuning di halaman Peralatan. Jangan mengedit stok secara manual agar histori pemakaian tercatat akurat.</p>
              </div>
            </div>

            <div className="p-5 sm:p-6 bg-white border-t border-slate-100 flex flex-col gap-3 shrink-0">
              <p className="text-xs font-bold text-slate-500 text-center">Butuh panduan yang lebih detail beserta gambar?</p>
              <a 
                href="/Panduan_SIP.pdf" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="w-full py-4 bg-slate-900 hover:bg-black text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
              >
                📖 Buka Buku Panduan Lengkap (PDF)
              </a>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP DIALOG KONFIRMASI KELUAR SESI */}
      <Modal 
        isOpen={showLogoutModal} 
        title="Keluar dari Aplikasi?" 
        message="Apakah Anda yakin ingin mengakhiri sesi ini? Anda harus memasukkan password kembali untuk masuk ke sistem SIP." 
        type="confirm" 
        onConfirm={handleExecuteLogout} 
        onCancel={() => setShowLogoutModal(false)} 
        confirmText="Ya, Keluar Sesi"
        cancelText="Batal"
        isDestructive={true} 
      />

      {showQueueModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[70] flex justify-center items-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold">Daftar Antrean Sinkronisasi</h3>
              <button onClick={() => setShowQueueModal(false)} className="text-slate-300 hover:text-white font-bold px-3 py-1 bg-slate-700 rounded-xl text-xs">Tutup</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {pendingList.length === 0 ? (<p className="text-center text-slate-500 py-8 text-sm">Tidak ada data tertunda.</p>) : (
                <ul className="space-y-3">
                  {pendingList.map((item) => (
                    <li key={item.id} className="p-3 border border-slate-200 bg-slate-50 rounded-xl flex justify-between items-center">
                      <div><p className="font-bold text-sm text-slate-800">{item.unit} - {item.tahap}</p><p className="text-xs font-mono font-bold text-blue-600 mt-1">{item.serialNumber}</p></div>
                      <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full border border-amber-200">Menunggu</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {!isOnline && (<div className="bg-red-500 text-white text-xs font-bold text-center py-2 px-4 shadow-md flex items-center justify-center gap-2 z-[60]"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-300 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span></span>KONEKSI UTAMA TERPUTUS - Mode Luring Otomatis Aktif</div>)}
      {showBackOnline && (<div className="bg-emerald-500 text-white text-xs font-bold text-center py-2 px-4 shadow-md flex items-center justify-center gap-2 z-[60]">✓ Koneksi Pulih. Menyinkronkan Antrean...</div>)}
      {isSyncing && (<div className="bg-amber-400 text-amber-900 text-xs font-bold text-center py-2 px-4 shadow-md flex items-center justify-center gap-2 z-[60]"><div className="w-3 h-3 border-2 border-amber-900 border-t-transparent rounded-full animate-spin"></div>Menyinkronkan database lokal ke server cloud... Mohon jangan tutup jendela.</div>)}
      {!isSyncing && pendingCount > 0 && (<div className="bg-blue-600 text-white text-xs font-bold text-center py-2 px-4 shadow-md flex items-center justify-center gap-3 z-[60]"><span>Ada {pendingCount} data tertunda di memori lokal.</span><button onClick={() => setShowQueueModal(true)} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors font-bold text-[10px]">Lihat Daftar</button></div>)}

      <div className="flex flex-1 overflow-hidden relative">
        <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white border-r border-slate-200 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.05)] z-20">
          
          <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-100">
            <img src="/logo-192.png" alt="Logo SIP" className="w-8 h-8 object-contain drop-shadow-sm" />
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">SIP</h1>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
            {menuItems.map((item) => {
              const isActive = location.pathname.includes(item.path);
              return (
                <Link key={item.name} to={item.path} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 font-medium'}`}>
                  <div className={`${isActive ? 'text-blue-600' : 'text-slate-400'}`}>{item.icon}</div>
                  <span className="text-sm">{item.name}</span>
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t border-slate-100">
            <button onClick={() => setShowLogoutModal(true)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 hover:bg-red-50 font-semibold text-sm transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg> Keluar Sesi
            </button>
          </div>
        </aside>

        <main className="flex-1 h-full overflow-y-auto relative w-full flex flex-col">
          <div className="h-14 bg-white border-b border-slate-200 px-3 sm:px-8 flex items-center justify-between md:justify-end gap-2 shrink-0">
            
            <div className="md:hidden flex items-center gap-2">
              <img src="/logo-192.png" alt="Logo SIP" className="w-6 h-6 object-contain" />
              <span className="text-sm font-extrabold text-blue-600 tracking-tight">SIP</span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5 text-xs font-semibold">
              <PingIndicator />
              
              <button 
                onClick={handleRefresh} 
                title="Muat Ulang Data dari Server"
                className="flex items-center justify-center w-8 h-8 bg-white text-slate-500 hover:text-[#1A73E8] hover:bg-[#E8F0FE] border border-slate-200 hover:border-blue-200 rounded-full transition-all shadow-sm focus:outline-none"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-[#1A73E8]' : 'hover:rotate-180 transition-transform duration-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>

              {/* TOMBOL PUSAT BANTUAN */}
              <button 
                onClick={() => setShowHelpModal(true)} 
                title="Pusat Bantuan & Panduan"
                className="flex items-center justify-center w-8 h-8 bg-blue-50 text-[#1A73E8] hover:bg-blue-100 border border-blue-200 rounded-full transition-all shadow-sm focus:outline-none font-black text-sm"
              >
                ?
              </button>

              <span className="bg-slate-100 text-slate-600 px-2 sm:px-3 py-1.5 rounded-full uppercase tracking-wider border border-slate-200 shadow-sm flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-[10px] text-slate-400 hidden sm:inline">User:</span>
                <span className="text-[#1A73E8] font-black">{user?.username}</span>
              </span>
              
              <button 
                onClick={() => setShowLogoutModal(true)} 
                className="md:hidden text-red-600 p-1.5 sm:p-2 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100 shadow-sm"
                title="Keluar Sesi"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto w-full max-w-7xl mx-auto p-4 md:p-8 pb-24 md:pb-8">{children}</div>
        </main>

        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex justify-around items-center h-14 px-2 z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
          {menuItems.map((item) => {
            const isActive = location.pathname.includes(item.path);
            return (
              <Link key={item.name} to={item.path} title={item.name} className={`flex items-center justify-center w-full h-full transition-colors ${isActive ? 'text-[#1A73E8]' : 'text-slate-400 hover:text-slate-600'}`}>
                <div className={`transition-all duration-300 ${isActive ? 'transform -translate-y-1 scale-125 drop-shadow-md' : 'scale-110'}`}>
                  {item.icon}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}