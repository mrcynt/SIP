import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, where, writeBatch, doc, increment, getDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logActivity } from '../utils/auditLogger';
import Modal from '../components/Modal';

export default function Laporan() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [units, setUnits] = useState([]);
  const [tahaps, setTahaps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterTahap, setFilterTahap] = useState('');
  const [filterDate, setFilterDate] = useState(''); 

  const [driveApiUrl, setDriveApiUrl] = useState('');

  const [modal, setModal] = useState({
    isOpen: false, type: 'confirm', targetRecord: null, title: '', message: '', confirmText: 'Ya, Hapus & Urutkan', showCancel: true
  });

  // --- STATE BARU: TAB & TINDAK LANJUT MASSAL ---
  const [activeTab, setActiveTab] = useState('semua');
  const [tindakLanjutModal, setTindakLanjutModal] = useState({ isOpen: false, record: null, note: '' });
  const [selectedPengganti, setSelectedPengganti] = useState([]); 
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
      if (settingsSnap.exists()) {
        setDriveApiUrl(settingsSnap.data().driveApiUrl || '');
      }

      const unitSnap = await getDocs(collection(db, 'master_units'));
      setUnits(unitSnap.docs.map(d => d.data().name).sort());

      const tahapSnap = await getDocs(collection(db, 'master_tahaps'));
      setTahaps(tahapSnap.docs.map(d => d.data().name).sort());

      const recordSnap = await getDocs(query(collection(db, 'pemeriksaan_records'), orderBy('timestamp', 'desc')));
      setRecords(recordSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Gagal mengambil data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const isRecordError = (record) => {
    if (!record.ifpData) return false;
    try {
      const data = JSON.parse(record.ifpData);
      return Object.values(data).some(item => item.status === 'tidak');
    } catch (e) { return false; }
  };

  // --- FUNGSI BUKA MODAL EDIT ---
  const openEditTindakLanjut = (record) => {
    const manualNote = record.tindakLanjut ? record.tindakLanjut.split('\n[Sistem]')[0].trim() : '';
    const existingReplacements = records
      .filter(r => r.linkedErrorSN === record.serialNumber)
      .map(r => r.id);

    setTindakLanjutModal({ isOpen: true, record, note: manualNote });
    setSelectedPengganti(existingReplacements);
  };

  // --- FUNGSI SIMPAN TINDAK LANJUT & PENGIKATAN (Bisa Insert & Edit) ---
  const handleSimpanTindakLanjut = async () => {
    if (!tindakLanjutModal.note.trim() && selectedPengganti.length === 0) return;
    setIsSavingNote(true);
    try {
      const batch = writeBatch(db);
      const targetSNError = tindakLanjutModal.record.serialNumber;
      
      const oldReplacements = records.filter(r => r.linkedErrorSN === targetSNError).map(r => r.id);
      const unlinkedIds = oldReplacements.filter(id => !selectedPengganti.includes(id));
      const linkedSNsText = records.filter(r => selectedPengganti.includes(r.id)).map(r => r.serialNumber).join(', ');

      let finalNote = tindakLanjutModal.note.trim();
      if (linkedSNsText) {
        finalNote += `\n[Sistem] Digantikan oleh: ${linkedSNsText}`;
      }

      const recRef = doc(db, 'pemeriksaan_records', tindakLanjutModal.record.id);
      batch.update(recRef, { tindakLanjut: finalNote });

      unlinkedIds.forEach(id => {
        batch.update(doc(db, 'pemeriksaan_records', id), { linkedErrorSN: null });
      });
      selectedPengganti.forEach(id => {
        batch.update(doc(db, 'pemeriksaan_records', id), { linkedErrorSN: targetSNError });
      });

      await batch.commit();
      
      setRecords(records.map(r => {
        if (r.id === tindakLanjutModal.record.id) return { ...r, tindakLanjut: finalNote };
        if (unlinkedIds.includes(r.id)) return { ...r, linkedErrorSN: null };
        if (selectedPengganti.includes(r.id)) return { ...r, linkedErrorSN: targetSNError };
        return r;
      }));

      setTindakLanjutModal({ isOpen: false, record: null, note: '' });
      setSelectedPengganti([]);
    } catch (error) {
      console.error("Gagal menyimpan tindak lanjut:", error);
      alert("Gagal menyimpan data. Coba lagi.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const getFilteredRecords = () => {
    return records.filter(record => {
      const keyword = searchTerm || ''; 
      const matchesSearch = 
        record.serialNumber?.toLowerCase().includes(keyword.toLowerCase()) ||
        record.petugas?.toLowerCase().includes(keyword.toLowerCase());

      const matchesUnit = filterUnit ? record.unit === filterUnit : true;
      const matchesTahap = filterTahap ? record.tahap === filterTahap : true;
      
      let matchesDate = true;
      if (filterDate) {
        const recordDate = new Date(record.timestamp).toISOString().split('T')[0];
        matchesDate = recordDate === filterDate;
      }

      if (activeTab === 'error') return matchesSearch && matchesUnit && matchesTahap && matchesDate && isRecordError(record);
      if (activeTab === 'pengganti') return matchesSearch && matchesUnit && matchesTahap && matchesDate && record.isPengganti === true;

      return matchesSearch && matchesUnit && matchesTahap && matchesDate && !record.isPengganti;
    });
  };

  const recordsToDisplay = getFilteredRecords();

  // --- LOGIKA MENCARI PENGGANTI ---
  const getAvailableReplacements = (unitError, tahapError, targetSNError) => {
    return records.filter(r => 
      r.isPengganti === true && 
      (r.linkedErrorSN === null || r.linkedErrorSN === targetSNError) && 
      r.unit === unitError && 
      r.tahap === tahapError
    );
  };

  const handleTogglePengganti = (id) => {
    setSelectedPengganti(prev => {
      if (prev.includes(id)) return prev.filter(pId => pId !== id);
      if (prev.length >= 10) { alert("Maksimal hanya 10 Unit Pengganti per SN Error!"); return prev; }
      return [...prev, id];
    });
  };

  // --- FUNGSI EXPORT & HAPUS ---
  const openDeleteModal = (record) => {
    setModal({
      isOpen: true, type: 'confirm', targetRecord: record, title: 'Konfirmasi Hapus',
      message: `Anda yakin ingin menghapus laporan SN ${record.serialNumber}? Sistem akan otomatis menyusun ulang nomor antrean setelahnya.`,
      confirmText: 'Ya, Hapus', showCancel: true
    });
  };

  const handleModalConfirm = async () => {
    if (modal.type === 'success') { setModal(prev => ({ ...prev, isOpen: false })); return; }
    const rec = modal.targetRecord; if (!rec) return;

    setIsLoading(true); setModal(prev => ({ ...prev, isOpen: false }));
    try {
      if (navigator.onLine && driveApiUrl) {
        try { await fetch(driveApiUrl, { method: 'POST', body: JSON.stringify({ action: 'delete_and_reorder', unit: rec.unit, tahap: rec.tahap, serialNumber: rec.serialNumber, nomorUrut: rec.nomorUrut || 0 }) }); } catch (driveErr) { console.warn("API Google Drive sibuk."); }
      }
      const batch = writeBatch(db);
      batch.delete(doc(db, 'pemeriksaan_records', rec.id));

      if (rec.nomorUrut !== undefined && rec.nomorUrut !== null) {
        const qUrutanLanjutan = query(collection(db, 'pemeriksaan_records'), where('unit', '==', rec.unit), where('tahap', '==', rec.tahap), where('nomorUrut', '>', rec.nomorUrut));
        const snapUrutanLanjutan = await getDocs(qUrutanLanjutan);
        snapUrutanLanjutan.docs.forEach(docSnap => {
          const dataLama = docSnap.data();
          const nomorBaru = dataLama.nomorUrut - 1;
          batch.update(doc(db, 'pemeriksaan_records', docSnap.id), { nomorUrut: nomorBaru, formatTampil: `${nomorBaru}. ${dataLama.serialNumber}` });
        });
        batch.update(doc(db, 'counters', `${rec.unit}_${rec.tahap}`), { currentNumber: increment(-1) });
      }

      await batch.commit();
      logActivity(user.username, `Menghapus berkas SN ${rec.serialNumber}`);
      setModal({ isOpen: true, type: 'success', title: 'Berhasil Dihapus!', message: `Berkas SN ${rec.serialNumber} berhasil dihapus.`, confirmText: 'Tutup', showCancel: false });
    } catch (err) { alert("Terjadi kesalahan sistem saat menghapus data."); } finally { fetchData(); }
  };

  const exportToExcel = () => { 
    const dataArray = getFilteredRecords();
    if (dataArray.length === 0) return alert("Tidak ada data untuk diekspor!");
    const data = dataArray.map((rec) => ({ "No Antrean": rec.nomorUrut || '-', "Waktu Input": new Date(rec.timestamp).toLocaleString('id-ID'), "Unit": rec.unit, "Tahap": rec.tahap, "Serial Number": rec.serialNumber, "Petugas": rec.petugas }));
    const worksheet = XLSX.utils.json_to_sheet(data); const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan SIP"); XLSX.writeFile(workbook, `Laporan_${new Date().getTime()}.xlsx`);
  };

  const exportToPDF = () => { 
    const dataArray = getFilteredRecords();
    if (dataArray.length === 0) return alert("Tidak ada data untuk diekspor!");
    const docPdf = new jsPDF(); docPdf.text("Laporan Pemeriksaan Lapangan SIP", 14, 15);
    const tableRows = dataArray.map((rec) => [ rec.nomorUrut || '-', new Date(rec.timestamp).toLocaleString('id-ID'), `${rec.unit} - ${rec.tahap}`, rec.serialNumber, rec.petugas || '-' ]);
    autoTable(docPdf, { head: [["No Urut", "Waktu Input", "Kategori", "Serial Number", "Petugas"]], body: tableRows, startY: 25, headStyles: { fillColor: [66, 133, 244] } });
    docPdf.save(`Laporan_${new Date().getTime()}.pdf`);
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans relative">
      <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onConfirm={handleModalConfirm} onCancel={() => setModal({ ...modal, isOpen: false })} confirmText={modal.confirmText} isDestructive={modal.type === 'confirm'} showCancel={modal.showCancel} />

      {/* HEADER DAN TOMBOL EXPORT */}
      <div className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Pusat Laporan Data</h1>
          <p className="text-slate-500 mt-1">Kelola data reguler, perbaiki unit bermasalah, dan pantau unit pengganti secara terpusat.</p>
        </div>
        
        <div className="flex gap-2 shrink-0 bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto">
          <button onClick={exportToExcel} className="flex-1 md:flex-none px-5 py-2.5 bg-[#107C41] hover:bg-[#0B5C30] text-white rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap">📥 Excel</button>
          <button onClick={exportToPDF} className="flex-1 md:flex-none px-5 py-2.5 bg-[#C5221F] hover:bg-[#A50E0E] text-white rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap">📄 PDF</button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-50 overflow-hidden mb-8 p-6 md:p-8">
        
        {/* --- FILTER BAR SEJAJAR YANG SANGAT ELEGAN --- */}
        <div className="flex flex-col xl:flex-row items-center gap-3 mb-6 bg-slate-50/50 p-2 md:p-3 rounded-2xl border border-slate-100">
          
          {/* TAB STATUS (Kiri) */}
          <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm shrink-0 w-full xl:w-auto overflow-x-auto">
            <button 
              onClick={() => setActiveTab('semua')} 
              className={`flex-1 xl:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'semua' ? 'bg-[#1A73E8] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              📦 Semua Data
            </button>
            <button 
              onClick={() => setActiveTab('error')} 
              className={`flex-1 xl:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'error' ? 'bg-[#C5221F] text-white shadow-sm' : 'text-slate-500 hover:bg-red-50 hover:text-[#C5221F]'}`}
            >
              ⚠️ Unit Bermasalah
            </button>
            <button 
              onClick={() => setActiveTab('pengganti')} 
              className={`flex-1 xl:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'pengganti' ? 'bg-[#9333EA] text-white shadow-sm' : 'text-slate-500 hover:bg-purple-50 hover:text-[#9333EA]'}`}
            >
              🔄 Unit Pengganti
            </button>
          </div>

          <button 
            onClick={() => { setSearchTerm(''); setFilterDate(''); setFilterUnit(''); setFilterTahap(''); }} 
            className="px-3 py-2 bg-white text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition-all border border-slate-200 hover:border-red-200 shadow-sm whitespace-nowrap flex items-center justify-center shrink-0 w-full xl:w-auto"
          >
            🗑️ Reset
          </button>

          <div className="w-[1px] h-8 bg-slate-300 hidden xl:block mx-1"></div>

          {/* INPUT DAN DROPDOWN (Kanan) */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full xl:w-auto flex-grow">
            <div className="flex-grow min-w-[150px] w-full sm:w-auto">
              <input 
                type="text" 
                placeholder="🔍 Cari SN / Petugas..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-[#4285F4] text-slate-800 shadow-sm" 
              />
            </div>
            
            <input 
              type="date" 
              value={filterDate} 
              onChange={(e) => setFilterDate(e.target.value)} 
              className="w-full sm:w-36 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-[#4285F4] text-slate-800 shadow-sm shrink-0 cursor-pointer" 
              title="Filter Tanggal" 
            />
            
            <select 
              value={filterUnit} 
              onChange={(e) => setFilterUnit(e.target.value)} 
              className="w-full sm:w-32 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-[#4285F4] text-slate-800 shadow-sm shrink-0 cursor-pointer"
            >
              <option value="">Semua Unit</option>
              {units.map((u, i) => <option key={i} value={u}>{u}</option>)}
            </select>

            <select 
              value={filterTahap} 
              onChange={(e) => setFilterTahap(e.target.value)} 
              className="w-full sm:w-36 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-[#4285F4] text-slate-800 shadow-sm shrink-0 cursor-pointer"
            >
              <option value="">Semua Tahap</option>
              {tahaps.map((t, i) => <option key={i} value={t}>{t}</option>)}
            </select>
          </div>

        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm max-h-[600px] overflow-y-auto relative">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-[#F8F9FA] sticky top-0 z-10 shadow-sm">
              <tr className="text-xs font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <th className="py-4 px-6 whitespace-nowrap">Waktu Input</th>
                <th className="py-4 px-6 whitespace-nowrap">Serial Number</th>
                <th className="py-4 px-6 whitespace-nowrap">Kategori / Tahap</th>
                {activeTab === 'error' && <th className="py-4 px-6 w-1/3">Status & Tindak Lanjut</th>}
                {activeTab === 'pengganti' && <th className="py-4 px-6">Keterikatan Pengganti</th>}
                {activeTab === 'semua' && <th className="py-4 px-6 whitespace-nowrap">Petugas</th>}
                {isAdmin && <th className="py-4 px-6 text-right w-32">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={isAdmin ? "5" : "4"} className="py-16 text-center text-[#1A73E8] font-medium animate-pulse">Menyiapkan laporan...</td></tr>
              ) : recordsToDisplay.length === 0 ? (
                <tr><td colSpan={isAdmin ? "5" : "4"} className="py-16 text-center text-slate-400">Tidak ada data di tab ini yang sesuai dengan filter.</td></tr>
              ) : (
                recordsToDisplay.map((record) => (
                  <tr key={record.id} className={`transition-colors group ${activeTab === 'error' ? 'hover:bg-red-50/30' : activeTab === 'pengganti' ? 'hover:bg-blue-50/20' : 'hover:bg-blue-50/30'}`}>
                    <td className="py-4 px-6 text-xs text-slate-500 font-medium whitespace-nowrap">{new Date(record.timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', year:'numeric', hour: '2-digit', minute:'2-digit' })}</td>
                    <td className="py-4 px-6 font-mono font-black text-[#1A73E8] text-base whitespace-nowrap">
                      {record.formatTampil ? record.formatTampil : (record.nomorUrut ? `${record.nomorUrut}. ${record.serialNumber}` : record.serialNumber)}
                    </td>
                    <td className="py-4 px-6 font-extrabold text-slate-800 whitespace-nowrap">
                      {record.unit} <span className="font-semibold text-xs text-slate-400 ml-1">({record.tahap})</span>
                    </td>
                    
                    {/* KOLOM TAB ERROR (DENGAN TOMBOL EDIT) */}
                    {activeTab === 'error' && (
                      <td className="py-4 px-6">
                        {record.tindakLanjut ? (
                           <div className="bg-green-50 border border-green-200 p-3 rounded-xl whitespace-pre-line relative group/edit transition-all hover:shadow-md hover:-translate-y-0.5">
                             <div className="flex justify-between items-start gap-4">
                               <div>
                                 <p className="text-[10px] font-bold text-green-700 uppercase mb-1">Sudah Ditindaklanjuti:</p>
                                 <p className="text-xs text-green-900 font-medium leading-relaxed">{record.tindakLanjut}</p>
                               </div>
                               {/* TOMBOL EDIT MUNCUL SAAT DI HOVER */}
                               <button 
                                 onClick={() => openEditTindakLanjut(record)} 
                                 className="opacity-0 group-hover/edit:opacity-100 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-green-300 text-green-700 text-[10px] font-bold rounded-lg shadow-sm transition-all hover:bg-green-100 shrink-0"
                               >
                                 ✏️ Edit
                               </button>
                             </div>
                           </div>
                        ) : (
                           <button onClick={() => setTindakLanjutModal({ isOpen: true, record, note: '' })} className="bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm border border-amber-300">
                             + Tindak Lanjut & Pilih Pengganti
                           </button>
                        )}
                      </td>
                    )}

                    {/* KOLOM TAB PENGGANTI */}
                    {activeTab === 'pengganti' && (
                      <td className="py-4 px-6">
                        {record.linkedErrorSN ? (
                          <div className="bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl inline-block">
                             <p className="text-[10px] text-blue-600 font-bold uppercase mb-0.5">Digunakan Untuk:</p>
                             <p className="text-xs font-mono font-black text-blue-800">{record.linkedErrorSN}</p>
                          </div>
                        ) : (
                          <span className="text-amber-600 text-[10px] font-bold uppercase bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
                            ⏳ Menganggur (Belum Dikaitkan)
                          </span>
                        )}
                      </td>
                    )}

                    {/* KOLOM TAB SEMUA */}
                    {activeTab === 'semua' && (
                      <td className="py-4 px-6 uppercase text-xs font-bold text-slate-500 whitespace-nowrap">{record.petugas || '-'}</td>
                    )}

                    {isAdmin && (
                      <td className="py-4 px-6 text-right flex flex-col gap-2 items-end">
                        <button onClick={() => openDeleteModal(record)} className="bg-red-50 hover:bg-[#EA4335] text-[#EA4335] hover:text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm w-fit">Hapus</button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* --- MODAL TINDAK LANJUT ERROR + PILIH PENGGANTI --- */}
          {tindakLanjutModal.isOpen && (
            <div className="fixed inset-0 bg-slate-900/70 z-[100] flex justify-center items-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col animate-in zoom-in-95">
                
                <div className="p-6 bg-[#FCE8E6] border-b border-[#FAD2CF] shrink-0 flex justify-between items-center">
                  <div>
                    <h3 className="font-extrabold text-[#C5221F] text-lg flex items-center gap-2">⚠️ Catat Tindak Lanjut & Ikat Pengganti</h3>
                    <p className="text-xs text-[#C5221F]/80 font-medium mt-1">
                      Menyelesaikan error untuk SN: <span className="font-mono font-black">{tindakLanjutModal.record?.serialNumber}</span>
                    </p>
                  </div>
                  <button onClick={() => { setTindakLanjutModal({ isOpen: false, record: null, note: '' }); setSelectedPengganti([]); }} className="w-8 h-8 rounded-full bg-white/50 text-red-800 flex items-center justify-center font-bold hover:bg-white transition-colors">✕</button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                  
                  {/* Bagian Catatan */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Deskripsi Solusi / Tindakan</label>
                    <textarea 
                      autoFocus
                      rows="3" 
                      value={tindakLanjutModal.note}
                      onChange={(e) => setTindakLanjutModal(prev => ({ ...prev, note: e.target.value }))}
                      placeholder="Misal: Unit ditarik ke pabrik dan sudah diganti dengan unit baru..."
                      className="w-full p-4 bg-[#F8F9FA] border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-[#C5221F] focus:ring-2 focus:ring-red-50 transition-all resize-none text-sm font-medium"
                    />
                  </div>

                  {/* Bagian Pilih Unit Pengganti */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">Pilih Unit Pengganti (Maks 10)</label>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{selectedPengganti.length} / 10 Dipilih</span>
                    </div>
                    
                    <div className="bg-[#F8F9FA] border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto">
                      {(() => {
                        const available = getAvailableReplacements(tindakLanjutModal.record?.unit, tindakLanjutModal.record?.tahap, tindakLanjutModal.record?.serialNumber);
                        if (available.length === 0) {
                          return <p className="text-xs text-slate-400 text-center py-4 font-medium italic">Tidak ada SN Pengganti yang menganggur di Unit & Tahap ini.</p>;
                        }
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {available.map(pengganti => {
                              const isChecked = selectedPengganti.includes(pengganti.id);
                              return (
                                <label key={pengganti.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isChecked ? 'bg-blue-50 border-[#1A73E8] shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                                  <input 
                                    type="checkbox" 
                                    className="w-4 h-4 text-[#1A73E8] rounded border-slate-300 focus:ring-[#1A73E8]"
                                    checked={isChecked}
                                    onChange={() => handleTogglePengganti(pengganti.id)}
                                  />
                                  <span className={`font-mono text-sm font-bold ${isChecked ? 'text-[#1A73E8]' : 'text-slate-700'}`}>{pengganti.serialNumber}</span>
                                </label>
                              )
                            })}
                          </div>
                        );
                      })()}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">*Hanya menampilkan SN Pengganti yang belum ditautkan ke error manapun (atau yang terikat dengan SN ini).</p>
                  </div>

                </div>

                <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button disabled={isSavingNote} onClick={() => { setTindakLanjutModal({ isOpen: false, record: null, note: '' }); setSelectedPengganti([]); }} className="px-5 py-2.5 rounded-full font-bold text-xs text-slate-500 hover:bg-slate-200 transition-colors">Batal</button>
                  <button disabled={isSavingNote || (!tindakLanjutModal.note.trim() && selectedPengganti.length === 0)} onClick={handleSimpanTindakLanjut} className="px-6 py-2.5 bg-[#C5221F] hover:bg-[#A50E0E] disabled:bg-slate-300 text-white font-bold text-xs rounded-full transition-all shadow-sm flex items-center gap-2">
                    {isSavingNote ? 'Menyimpan & Mengikat...' : 'Simpan Tindakan'}
                  </button>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}