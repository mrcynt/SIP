import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
// Tambahkan import writeBatch dan doc untuk fitur hapus semua
import { collection, getDocs, query, orderBy, writeBatch, doc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from '../components/Modal'; // Pastikan path Modal sudah benar

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Pencarian
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Pagination (Pecah per 30 baris)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  // State untuk Password Input & Kontrol Modal Universal
  const [passwordInput, setPasswordInput] = useState('');
  const [modal, setModal] = useState({
    isOpen: false, type: 'confirm', title: '', message: '', confirmText: 'Ya', isDestructive: false, onConfirm: () => {}
  });

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const logsSnap = await getDocs(query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc')));
      setLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Gagal memuat audit log:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================
  // LOGIKA DETEKSI PINTAR (ANTI-KOSONG / ANTI-DIRAHASIAKAN)
  // =========================================================
  const getActionText = (log) => {
    // 1. Cek fallback standar dahulu
    if (log.activity) return log.activity;
    if (log.action) return log.action;
    if (log.message) return log.message;
    if (log.keterangan) return log.keterangan;
    if (log.deskripsi) return log.deskripsi;
    
    // 2. Jika tidak ketemu, cari properti string apa saja secara dinamis selain metadata utama
    const dynamicKey = Object.keys(log).find(key => 
      key !== 'id' && 
      key !== 'username' && 
      key !== 'timestamp' && 
      key !== 'role' &&
      typeof log[key] === 'string'
    );
    
    return dynamicKey ? log[dynamicKey] : '[Aktivitas Sistem Berhasil Dicatat]';
  };

  // Dekorasi UI Pastel ala Gmail
  const getAvatarColor = (name) => {
    if (!name) return 'bg-slate-100 text-slate-500';
    const colors = ['bg-[#FCE8E6] text-[#D93025]', 'bg-[#E8F0FE] text-[#1A73E8]', 'bg-[#E6F4EA] text-[#137333]', 'bg-[#FEF7E0] text-[#E37400]', 'bg-[#F3E8FD] text-[#A142F4]', 'bg-[#FDE293] text-[#E52D27]'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const getActionIcon = (text) => {
    const t = text.toLowerCase();
    if (t.includes('hapus') || t.includes('delete') || t.includes('revisi')) return '🗑️';
    if (t.includes('tambah') || t.includes('buat') || t.includes('baru')) return '✨';
    if (t.includes('ubah') || t.includes('edit') || t.includes('update')) return '✏️';
    if (t.includes('login') || t.includes('masuk') || t.includes('sesi')) return '🔑';
    if (t.includes('export') || t.includes('unduh')) return '📥';
    return '📝';
  };

  const formatTime = (ts) => {
    if (!ts) return '-';
    try {
      const d = new Date(ts);
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch { return '-'; }
  };

  // =========================================================
  // FILTER & PAGINATION CONTROL
  // =========================================================
  const getFilteredLogs = () => {
    return logs.filter(log => {
      const actionText = getActionText(log);
      const matchSearch = (log.username && log.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (actionText.toLowerCase().includes(searchTerm.toLowerCase()));
      
      let matchDate = true;
      if (filterDate) {
        const logDate = new Date(log.timestamp);
        const formattedLogDate = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`;
        matchDate = formattedLogDate === filterDate;
      }
      return matchSearch && matchDate;
    });
  };

  const filteredLogs = getFilteredLogs();
  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLogsDisplay = filteredLogs.slice(indexOfFirstItem, indexOfLastItem);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterDate]);

  // =========================================================
  // FUNGSI UTAMA: HAPUS ALL AUDIT LOGS (DENGAN PASSWORD PROTECTION)
  // =========================================================
  const handleOpenDeleteAllModal = () => {
    setPasswordInput(''); // Reset isi input password
    setModal({
      isOpen: true,
      type: 'prompt',
      title: 'Hapus Seluruh Riwayat?',
      message: 'Tindakan ini akan membuang seluruh rekam jejak aktivitas secara permanen dari cloud database. Masukkan kata sandi konfirmasi untuk mengeksekusi:',
      confirmText: 'Bersihkan Semua Log',
      isDestructive: true,
      onConfirm: handleExecuteDeleteAll
    });
  };

  const handleExecuteDeleteAll = async () => {
    // Validasi password rahasia dari kamu
    if (passwordInput !== 'yakin?') {
      alert('❌ Kata sandi salah! Penghapusan log dibatalkan.');
      setModal(p => ({ ...p, isOpen: false }));
      return;
    }

    setIsLoading(true);
    setModal(p => ({ ...p, isOpen: false }));

    try {
      const logsSnap = await getDocs(collection(db, 'audit_logs'));
      const batch = writeBatch(db);
      
      logsSnap.docs.forEach(docSnap => {
        batch.delete(doc(db, 'audit_logs', docSnap.id));
      });
      
      await batch.commit();

      // Pemicu Pop-up sukses modern buatan kita
      setModal({
        isOpen: true,
        type: 'success',
        title: 'Database Bersih!',
        message: 'Seluruh riwayat jejak audit log berhasil dihapus total dari server.',
        confirmText: 'Tutup Selesai',
        onConfirm: () => setModal(p => ({ ...p, isOpen: false }))
      });
      
      fetchLogs();
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat mengosongkan database.');
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================
  // EXPORT HANDLERS
  // =========================================================
  const exportToExcel = () => {
    if (filteredLogs.length === 0) return alert("Tidak ada data log!");
    const dataExcel = filteredLogs.map((log, i) => ({
      "No": i + 1, "Waktu Kejadian": new Date(log.timestamp).toLocaleString('id-ID'), "Pengguna": log.username, "Aktivitas": getActionText(log)
    }));
    const ws = XLSX.utils.json_to_sheet(dataExcel); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Audit Logs"); XLSX.writeFile(wb, `Audit_Logs_${Date.now()}.xlsx`);
  };

  const exportToPDF = () => {
    if (filteredLogs.length === 0) return alert("Tidak ada data log!");
    const docPdf = new jsPDF(); docPdf.text("Rekam Jejak Aktivitas Sistem", 14, 15);
    const rows = filteredLogs.map((log, i) => [ i + 1, new Date(log.timestamp).toLocaleString('id-ID'), log.username?.toUpperCase(), getActionText(log) ]);
    autoTable(docPdf, { head: [["No", "Waktu", "User", "Aktivitas Sistem"]], body: rows, startY: 25, headStyles: { fillColor: [66, 133, 244] } });
    docPdf.save(`Audit_Logs_${Date.now()}.pdf`);
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans relative">
      
      {/* MODAL UNIVERSAL UNTUK PROMPT PASSWORD & NOTIFIKASI SUCCESS */}
      <Modal 
        isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type}
        inputValue={passwordInput} onInputChange={setPasswordInput} inputPlaceholder="Ketik password di sini..." inputType="password"
        onConfirm={modal.onConfirm} onCancel={() => setModal({ ...modal, isOpen: false })} 
        confirmText={modal.confirmText} isDestructive={modal.isDestructive} showCancel={modal.type !== 'success'} 
      />

      {/* HEADER UTAMA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-5 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <span className="text-4xl drop-shadow-sm">🛡️</span> Audit Log
          </h1>
          <p className="text-slate-500 mt-1 ml-12 text-sm font-medium">Rekam jejak dan pantau seluruh aktivitas pengguna.</p>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto ml-12 md:ml-0 flex-wrap">
          <input 
            type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} 
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:border-[#4285F4] transition-all shadow-sm flex-1 md:flex-none cursor-pointer hover:bg-slate-50"
          />
          <button onClick={exportToExcel} className="bg-white border border-slate-200 hover:border-green-500 hover:text-green-600 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2">📊 Excel</button>
          <button onClick={exportToPDF} className="bg-white border border-slate-200 hover:border-red-500 hover:text-red-600 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2">📄 PDF</button>
          
          {/* TOMBOL SECURE DELETE ALL LOGS */}
          <button onClick={handleOpenDeleteAllModal} className="bg-red-50 border border-red-100 hover:bg-[#EA4335] text-[#EA4335] hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ml-0 sm:ml-2">
            🗑️ Hapus Semua Log
          </button>
        </div>
      </div>

      {/* KOTAK BOX MINIMALIS ALA GMAIL */}
      <div className="bg-white rounded-[24px] shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        
        {/* TOOLBAR ATAS ALA GMAIL */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-3 sm:px-6 border-b border-slate-100 gap-4 bg-white shrink-0">
          <div className="flex bg-[#F1F3F4] rounded-full px-4 py-2.5 w-full max-w-md items-center focus-within:bg-white focus-within:shadow-md transition-all border border-transparent focus-within:border-slate-200">
            <span className="text-slate-400 mr-3 text-sm">🔍</span>
            <input 
              type="text" placeholder="Telusuri rekam jejak..." 
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
              className="bg-transparent outline-none w-full text-sm font-medium text-slate-700 placeholder-slate-500" 
            />
          </div>

          <div className="flex items-center gap-4 text-xs font-bold text-slate-500 ml-auto">
            <span>{totalItems === 0 ? 0 : indexOfFirstItem + 1}–{Math.min(indexOfLastItem, totalItems)} dari {totalItems}</span>
            <div className="flex gap-1">
              <button 
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-lg"
              >
                ‹
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-lg"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        {/* LIST ROW TABEL */}
        <div className="overflow-x-auto min-h-[50vh]">
          <table className="w-full text-left text-sm text-slate-700 border-collapse">
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td className="py-20 text-center text-[#1A73E8] font-medium animate-pulse">Menyinkronkan log...</td></tr>
              ) : currentLogsDisplay.length === 0 ? (
                <tr><td className="py-20 text-center text-slate-400">Pencarian tidak membuahkan hasil.</td></tr>
              ) : (
                currentLogsDisplay.map((log) => {
                  const actionText = getActionText(log);
                  return (
                    <tr key={log.id} className="group hover:shadow-[inset_1px_0_0_#dadce0,inset_-1px_0_0_#dadce0,0_1px_2px_0_rgba(60,64,67,.3),0_1px_3px_1px_rgba(60,64,67,.15)] hover:bg-white transition-all bg-[#F8F9FA]/60 cursor-default">
                      <td className="py-2.5 px-4 sm:pl-6 w-12 text-center align-middle">
                        <div className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center font-black text-[13px] shadow-sm ${getAvatarColor(log.username)}`}>
                          {log.username ? log.username.charAt(0).toUpperCase() : '?'}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 w-32 sm:w-44 font-bold text-slate-800 text-[13px] tracking-wide truncate align-middle uppercase">
                        {log.username || 'SISTEM'}
                      </td>
                      <td className="py-2.5 px-2 text-[13px] text-slate-600 align-middle">
                        <span className="font-bold text-slate-800 mr-2 text-sm">{getActionIcon(actionText)}</span>
                        {actionText}
                      </td>
                      <td className="py-2.5 px-4 sm:pr-6 w-32 sm:w-40 text-right text-xs font-bold text-slate-400 group-hover:text-slate-700 align-middle transition-colors">
                        {formatTime(log.timestamp)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}