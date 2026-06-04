import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { collection, getDocs, query, orderBy, where, writeBatch, doc, increment, getDoc } from 'firebase/firestore';
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

  // STATE MODAL DIPERBARUI UNTUK MENDUKUNG TIPE SUCCESS
  const [modal, setModal] = useState({
    isOpen: false, type: 'confirm', targetRecord: null, title: '', message: '', confirmText: 'Ya, Hapus & Urutkan', showCancel: true
  });

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

  const openDeleteModal = (record) => {
    setModal({
      isOpen: true, type: 'confirm', targetRecord: record, title: 'Hapus Berkas & Urutkan Ulang?',
      message: `Anda akan menghapus berkas SN: ${record.serialNumber}. Langkah ini akan otomatis menggeser maju nomor antrean di bawahnya, menyinkronkan ulang counter sistem, dan mengubah nama foldernya di Google Drive menjadi REVISI.`,
      confirmText: 'Ya, Hapus & Urutkan', showCancel: true
    });
  };

  // FUNGSI GABUNGAN UNTUK EKSEKUSI HAPUS & TUTUP NOTIF SUCCESS
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
            body: JSON.stringify({ action: 'rename_rev', unit: rec.unit, tahap: rec.tahap, serialNumber: rec.serialNumber, nomorUrut: rec.nomorUrut || 0 })
          });
        } catch (driveErr) { console.warn("API Google Drive sibuk."); }
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
      
      // MUNCULKAN POP-UP SUCCESS (MENGGANTIKAN ALERT)
      setModal({ isOpen: true, type: 'success', title: 'Berhasil Dihapus!', message: `Berkas SN ${rec.serialNumber} berhasil dihapus dan nomor antrean telah dirapikan.`, confirmText: 'Tutup', showCancel: false });

    } catch (err) {
      console.error(err); 
      alert("Terjadi kesalahan sistem saat menghapus data.");
    } finally {
      fetchData();
    }
  };

  const getFilteredRecords = () => {
    return records.filter(rec => {
      const matchSearch = (rec.serialNumber && rec.serialNumber.toLowerCase().includes(searchTerm.toLowerCase())) || (rec.petugas && rec.petugas.toLowerCase().includes(searchTerm.toLowerCase()));
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

  const exportToExcel = () => { /* Logic Export Excel */ 
    const dataArray = getFilteredRecords();
    if (dataArray.length === 0) return alert("Tidak ada data untuk diekspor!");
    const data = dataArray.map((rec) => ({ "No Antrean": rec.nomorUrut || '-', "Waktu Input": new Date(rec.timestamp).toLocaleString('id-ID'), "Unit": rec.unit, "Tahap": rec.tahap, "Serial Number": rec.serialNumber, "Petugas": rec.petugas }));
    const worksheet = XLSX.utils.json_to_sheet(data); const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan SIP"); XLSX.writeFile(workbook, `Laporan_${new Date().getTime()}.xlsx`);
  };

  const exportToPDF = () => { /* Logic Export PDF */ 
    const dataArray = getFilteredRecords();
    if (dataArray.length === 0) return alert("Tidak ada data untuk diekspor!");
    const docPdf = new jsPDF(); docPdf.text("Laporan Pemeriksaan Lapangan SIP", 14, 15);
    const tableRows = dataArray.map((rec) => [ rec.nomorUrut || '-', new Date(rec.timestamp).toLocaleString('id-ID'), `${rec.unit} - ${rec.tahap}`, rec.serialNumber, rec.petugas || '-' ]);
    autoTable(docPdf, { head: [["No Urut", "Waktu Input", "Kategori", "Serial Number", "Petugas"]], body: tableRows, startY: 25, headStyles: { fillColor: [66, 133, 244] } });
    docPdf.save(`Laporan_${new Date().getTime()}.pdf`);
  };

  const filteredRecords = getFilteredRecords();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans relative">
      <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onConfirm={handleModalConfirm} onCancel={() => setModal({ ...modal, isOpen: false })} confirmText={modal.confirmText} isDestructive={modal.type === 'confirm'} showCancel={modal.showCancel} />

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Pusat Laporan Data</h1>
        <p className="text-slate-500 mt-1">Cari, saring, dan kelola rekapitulasi data seluruh hasil pemeriksaan lapangan.</p>
      </div>

      <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-50 overflow-hidden mb-8">
        
        <div className="p-6 md:p-8 bg-slate-50 border-b border-slate-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-5">
          <div className="flex flex-col sm:flex-row w-full xl:w-auto gap-3 flex-wrap">
            <div className="relative w-full sm:w-64"><span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">🔍</span><input type="text" placeholder="Cari SN / Petugas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-50 w-full transition-all shadow-sm placeholder-slate-400" /></div>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-50 cursor-pointer shadow-sm w-full sm:w-40 transition-all hover:bg-slate-50" title="Filter Berdasarkan Tanggal" />
            <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-50 cursor-pointer shadow-sm w-full sm:w-40 transition-all hover:bg-slate-50"><option value="">Semua Unit</option>{units.map((u, i) => <option key={i} value={u}>{u}</option>)}</select>
            <select value={filterTahap} onChange={(e) => setFilterTahap(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-50 cursor-pointer shadow-sm w-full sm:w-40 transition-all hover:bg-slate-50"><option value="">Semua Tahap</option>{tahaps.map((t, i) => <option key={i} value={t}>{t}</option>)}</select>
          </div>

          <div className="flex gap-3 w-full sm:w-auto mt-2 xl:mt-0 xl:border-l xl:border-slate-200 xl:pl-5">
            <button onClick={exportToExcel} className="flex-1 sm:flex-none items-center justify-center gap-2 bg-white border border-slate-200 hover:border-green-500 hover:bg-green-50 text-green-700 px-5 py-3 rounded-xl text-sm font-bold transition-all shadow-sm flex">📊 Excel</button>
            <button onClick={exportToPDF} className="flex-1 sm:flex-none items-center justify-center gap-2 bg-white border border-slate-200 hover:border-red-500 hover:bg-red-50 text-red-700 px-5 py-3 rounded-xl text-sm font-bold transition-all shadow-sm flex">📄 PDF</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-white">
              <tr className="text-xs font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <th className="py-5 px-8">Waktu Input</th><th className="py-5 px-8">Serial Number</th><th className="py-5 px-8">Kategori / Unit</th><th className="py-5 px-8">Petugas</th>
                {isAdmin && <th className="py-5 px-8 text-right w-32">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={isAdmin ? "5" : "4"} className="py-16 text-center text-[#1A73E8] font-medium animate-pulse">Menyiapkan laporan...</td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan={isAdmin ? "5" : "4"} className="py-16 text-center text-slate-400">Tidak ada data yang ditemukan.</td></tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="py-4 px-8 text-xs text-slate-500 font-medium">{new Date(record.timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', year:'numeric', hour: '2-digit', minute:'2-digit' })}</td>
                    <td className="py-4 px-8 font-mono font-black text-[#1A73E8] text-base">{record.formatTampil ? record.formatTampil : (record.nomorUrut ? `${record.nomorUrut}. ${record.serialNumber}` : record.serialNumber)}</td>
                    <td className="py-4 px-8 font-extrabold text-slate-800">{record.unit} <span className="font-semibold text-xs text-slate-400 ml-1">({record.tahap})</span></td>
                    <td className="py-4 px-8 uppercase text-xs font-bold text-slate-500">{record.petugas || '-'}</td>
                    {isAdmin && (
                      <td className="py-4 px-8 text-right"><button onClick={() => openDeleteModal(record)} className="bg-red-50 hover:bg-[#EA4335] text-[#EA4335] hover:text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm">Hapus</button></td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}