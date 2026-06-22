import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { collection, getDocs, query, orderBy, where, writeBatch, doc, increment, getDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logActivity } from '../utils/auditLogger';
import Modal from '../components/Modal'; 

function GoogleDriveIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 cursor-pointer transform hover:scale-110 transition-transform" viewBox="0 0 87.3 75.6" title="Buka di Google Drive">
      <path fill="#0066da" d="M6 51.3l14.7-25.4 39.9 69.2H20.7L6 51.3z"/><path fill="#00aa47" d="M43.7 25.9L58.3.5h29l-14.6 25.4H43.7z"/><path fill="#ea4335" d="M58.3.5L87.3 51.3l-14.6 25.4L58.3.5z"/><path fill="#ffba00" d="M20.7 25.9h52l14.6 25.4h-52L20.7 25.9z"/>
    </svg>
  );
}

export default function Arsip() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [units, setUnits] = useState([]);
  const [tahaps, setTahaps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchMonitoring, setSearchMonitoring] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterTahap, setFilterTahap] = useState('');
  const [filterDate, setFilterDate] = useState('');

  const [driveApiUrl, setDriveApiUrl] = useState('');

  const [modal, setModal] = useState({
    isOpen: false, type: 'confirm', targetRecord: null, title: '', message: '', confirmText: 'Ya, Hapus & Urutkan', showCancel: true
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
      if (settingsSnap.exists()) { setDriveApiUrl(settingsSnap.data().driveApiUrl || ''); }

      const unitSnap = await getDocs(collection(db, 'master_units'));
      setUnits(unitSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.name.localeCompare(b.name)));
      
      const tahapSnap = await getDocs(collection(db, 'master_tahaps'));
      setTahaps(tahapSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.name.localeCompare(b.name)));
      
      const recordSnap = await getDocs(query(collection(db, 'pemeriksaan_records'), orderBy('nomorUrut', 'asc')));
      setRecords(recordSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
  };

  const openDeleteModal = (record) => {
    setModal({
      isOpen: true, type: 'confirm', targetRecord: record, title: 'Hapus Berkas & Urutkan Ulang?',
      message: `Anda akan menghapus ${record.formatTampil || record.serialNumber}. Seluruh nomor antrean setelah berkas ini akan bergeser maju, baris di Excel akan dihapus, dan folder Drive akan ditandai [DIHAPUS].`,
      confirmText: 'Ya, Hapus & Urutkan', showCancel: true
    });
  };

  const handleModalConfirm = async () => {
    if (modal.type === 'success') {
      setModal(prev => ({ ...prev, isOpen: false }));
      return;
    }

    const rec = modal.targetRecord;
    if (!rec) return;

    setIsLoading(true); 
    setModal(prev => ({ ...prev, isOpen: false }));

    try {
      if (navigator.onLine && driveApiUrl) {
        try {
          await fetch(driveApiUrl, { 
            method: 'POST', 
            // PERBAIKAN SAKTI: Action diganti agar memicu penghapusan di Excel dan Folder Drive
            body: JSON.stringify({ action: 'delete_and_reorder', unit: rec.unit, tahap: rec.tahap, serialNumber: rec.serialNumber, nomorUrut: rec.nomorUrut || 0 }) 
          });
        } catch (driveErr) { console.warn("API Drive sibuk."); }
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
      logActivity(user.username, `Menghapus berkas ${rec.serialNumber} dari antrean.`);
      
      setModal({ isOpen: true, type: 'success', title: 'Berhasil Dihapus!', message: `Berkas SN ${rec.serialNumber} berhasil dihapus dari sistem arsip dan Excel.`, confirmText: 'Tutup', showCancel: false });

    } catch (err) { 
      console.error(err); alert("Gagal sinkronisasi antrean."); 
    } finally { 
      fetchData(); 
    }
  };

  const getFilteredRecordsArray = () => {
    return records.filter(rec => {
      const matchSearch = (rec.serialNumber && rec.serialNumber.toLowerCase().includes(searchMonitoring.toLowerCase())) || (rec.petugas && rec.petugas.toLowerCase().includes(searchMonitoring.toLowerCase()));
      const matchUnit = filterUnit === '' || rec.unit === filterUnit;
      const matchTahap = filterTahap === '' || rec.tahap === filterTahap;
      let matchDate = true;
      if (filterDate) {
        const recDate = new Date(rec.timestamp);
        const formattedRecDate = `${recDate.getFullYear()}-${String(recDate.getMonth() + 1).padStart(2, '0')}-${String(recDate.getDate()).padStart(2, '0')}`;
        matchDate = formattedRecDate === filterDate;
      }
      return matchSearch && matchUnit && matchTahap && matchDate;
    });
  };

  const getFilteredAndGroupedRecords = () => {
    const filteredRecords = getFilteredRecordsArray();
    const grouped = {};
    filteredRecords.forEach(rec => {
      const u = rec.unit || 'Tanpa Unit'; const t = rec.tahap || 'Tanpa Tahap';
      const hariTanggal = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(rec.timestamp));
      if (!grouped[u]) grouped[u] = {}; if (!grouped[u][t]) grouped[u][t] = {}; if (!grouped[u][t][hariTanggal]) grouped[u][t][hariTanggal] = [];
      grouped[u][t][hariTanggal].push(rec);
    });
    return { grouped, totalFiltered: filteredRecords.length };
  };

  const exportToExcel = () => {
    const data = getFilteredRecordsArray().map((rec) => ({ "No Antrean": rec.nomorUrut || '-', "Waktu Scan": new Date(rec.timestamp).toLocaleString('id-ID'), "Unit": rec.unit, "Tahap": rec.tahap, "Serial Number": rec.serialNumber, "Petugas": rec.petugas }));
    if (data.length === 0) return alert("Data kosong!");
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Arsip"); XLSX.writeFile(wb, `Arsip_${Date.now()}.xlsx`);
  };

  const exportToPDF = () => {
    const dataArray = getFilteredRecordsArray();
    if (dataArray.length === 0) return alert("Data kosong!");
    const docPdf = new jsPDF(); docPdf.text("Laporan Arsip SIP", 14, 15);
    autoTable(docPdf, { head: [["No Urut", "Waktu Scan", "Kategori", "Serial Number", "Petugas"]], body: dataArray.map(rec => [ rec.nomorUrut || '-', new Date(rec.timestamp).toLocaleString('id-ID'), `${rec.unit} - ${rec.tahap}`, rec.serialNumber, rec.petugas || '-' ]), startY: 25, headStyles: { fillColor: [66, 133, 244] } });
    docPdf.save(`Arsip_${Date.now()}.pdf`);
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans relative">
      <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onConfirm={handleModalConfirm} onCancel={() => setModal({ ...modal, isOpen: false })} confirmText={modal.confirmText} isDestructive={modal.type === 'confirm'} showCancel={modal.showCancel} />

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Folder Arsip Digital</h1>
        <p className="text-slate-500 mt-1">Struktur folder berkas otomatis yang sinkron dengan Google Drive.</p>
      </div>

      <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-50 overflow-hidden">
        
        <div className="p-4 sm:p-6 md:p-8 bg-slate-50 border-b border-slate-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-5">
          <div className="flex flex-col sm:flex-row w-full xl:w-auto gap-3 flex-wrap">
            <div className="relative w-full sm:w-64"><span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">🔍</span><input type="text" placeholder="Cari SN / Petugas..." value={searchMonitoring} onChange={(e) => setSearchMonitoring(e.target.value)} className="pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-50 w-full transition-all shadow-sm placeholder-slate-400" /></div>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-50 cursor-pointer shadow-sm w-full sm:w-40 transition-all hover:bg-slate-50" title="Filter Berdasarkan Tanggal" />
            <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-50 cursor-pointer shadow-sm w-full sm:w-40 transition-all hover:bg-slate-50"><option value="">Semua Unit</option>{units.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}</select>
            <select value={filterTahap} onChange={(e) => setFilterTahap(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-50 cursor-pointer shadow-sm w-full sm:w-40 transition-all hover:bg-slate-50"><option value="">Semua Tahap</option>{tahaps.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select>
          </div>
          
          <div className="flex gap-3 w-full sm:w-auto mt-2 xl:mt-0 xl:border-l xl:border-slate-200 xl:pl-5">
            <button onClick={exportToExcel} className="flex-1 sm:flex-none items-center justify-center gap-2 bg-white border border-slate-200 hover:border-green-500 hover:bg-green-50 text-green-700 px-5 py-3 rounded-xl text-sm font-bold transition-all shadow-sm flex">📊 Excel</button>
            <button onClick={exportToPDF} className="flex-1 sm:flex-none items-center justify-center gap-2 bg-white border border-slate-200 hover:border-red-500 hover:bg-red-50 text-red-700 px-5 py-3 rounded-xl text-sm font-bold transition-all shadow-sm flex">📄 PDF</button>
          </div>
        </div>

        <div className="p-4 sm:p-6 md:p-8">
          {isLoading ? (
            <div className="text-center py-12 text-[#1A73E8] font-medium animate-pulse">Menyusun dan menyinkronkan data...</div>
          ) : (() => {
            const { grouped, totalFiltered } = getFilteredAndGroupedRecords();
            if (totalFiltered === 0) return (<div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl"><span className="text-4xl">📁</span><p className="text-slate-500 font-medium mt-4">Arsip kosong atau kata kunci tidak ditemukan.</p></div>);
            
            return (
              <div className="space-y-4">
                {Object.entries(grouped).map(([unitName, tabTahaps]) => (
                  <details key={unitName} className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:border-blue-300 transition-colors" open>
                    <summary className="font-bold cursor-pointer p-4 sm:p-5 flex items-center justify-between bg-slate-50/50 outline-none select-none">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shadow-inner shrink-0">🗂️</span>
                        <span className="text-slate-800 tracking-wide uppercase text-base sm:text-lg">{unitName}</span>
                      </div>
                      <a href={`https://drive.google.com/drive/search?q=${encodeURIComponent(unitName)}`} target="_blank" rel="noreferrer" className="p-2 hover:bg-slate-200 rounded-xl transition-colors shrink-0"><GoogleDriveIcon /></a>
                    </summary>

                    <div className="p-3 sm:p-4 pt-2 pl-4 sm:pl-14 space-y-3">
                      {Object.entries(tabTahaps).map(([tahapName, haris]) => (
                        <details key={tahapName} className="group/tahap bg-white rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]" open>
                          <summary className="font-bold cursor-pointer p-3 sm:p-4 flex items-center justify-between outline-none select-none hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 text-xs sm:text-sm shadow-inner shrink-0">📂</span>
                              <span className="text-slate-700 text-sm sm:text-base">{tahapName}</span>
                            </div>
                            <a href={`https://drive.google.com/drive/search?q=${encodeURIComponent(unitName + ' ' + tahapName)}`} target="_blank" rel="noreferrer" className="p-2 hover:bg-slate-100 rounded-xl transition-colors shrink-0"><GoogleDriveIcon /></a>
                          </summary>

                          <div className="p-3 sm:p-4 pt-0 pl-4 sm:pl-14 space-y-5">
                            {Object.entries(haris).map(([hariName, listRecord]) => (
                              <div key={hariName} className="mt-2">
                                
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
                                  <span className="text-xs sm:text-sm font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 whitespace-nowrap shadow-sm">📅 {hariName}</span>
                                  <span className="text-[10px] font-extrabold bg-[#E8F0FE] text-[#1A73E8] px-3 py-1.5 rounded-full uppercase tracking-wider whitespace-nowrap shadow-sm">{listRecord.length} Berkas</span>
                                </div>

                                <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
                                  <table className="w-full text-left text-sm text-slate-600 bg-white">
                                    <thead className="bg-[#F8F9FA] border-b border-slate-200">
                                      <tr className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        <th className="py-3 sm:py-4 px-4 sm:px-6">Waktu Input</th>
                                        <th className="py-3 sm:py-4 px-4 sm:px-6">Nama Berkas</th>
                                        <th className="py-3 sm:py-4 px-4 sm:px-6">Petugas</th>
                                        <th className="py-3 sm:py-4 px-4 sm:px-6 text-center">Drive Link</th>
                                        <th className="py-3 sm:py-4 px-4 sm:px-6 text-right">Aksi</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {listRecord.map(rec => (
                                        <tr key={rec.id} className="hover:bg-blue-50/30 transition-colors">
                                          <td className="py-3 sm:py-4 px-4 sm:px-6 font-mono text-[11px] sm:text-xs text-slate-500 whitespace-nowrap">{new Date(rec.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</td>
                                          <td className="py-3 sm:py-4 px-4 sm:px-6 font-mono font-bold text-slate-800 whitespace-nowrap">📄 {rec.formatTampil ? rec.formatTampil : (rec.nomorUrut ? `${rec.nomorUrut}. ${rec.serialNumber}` : rec.serialNumber)}</td>
                                          <td className="py-3 sm:py-4 px-4 sm:px-6 font-semibold text-slate-700 uppercase text-[11px] sm:text-xs whitespace-nowrap">{rec.petugas || '-'}</td>
                                          <td className="py-3 sm:py-4 px-4 sm:px-6 text-center">
                                            <a href={rec.driveUrl || `https://drive.google.com/drive/search?q=${encodeURIComponent(rec.serialNumber)}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center p-2 hover:bg-blue-100 rounded-xl transition-colors shrink-0"><GoogleDriveIcon /></a>
                                          </td>
                                          <td className="py-3 sm:py-4 px-4 sm:px-6 text-right">
                                            <button onClick={() => openDeleteModal(rec)} className="bg-red-50 hover:bg-[#EA4335] text-[#EA4335] hover:text-white text-xs font-bold px-3 sm:px-4 py-2 rounded-xl transition-all shadow-sm">
                                              Hapus
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                              </div>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}