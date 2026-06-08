import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logActivity } from '../utils/auditLogger';
import Modal from '../components/Modal'; 

export default function Peralatan() {
  const { user } = useAuth();
  const [peralatanList, setPeralatanList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form Input Baru
  const [newAlatNama, setNewAlatNama] = useState('');
  const [newAlatStok, setNewAlatStok] = useState('');
  const [newAlatSatuan, setNewAlatSatuan] = useState('');

  // STATE KONTROL MODAL UTAMA
  const [modal, setModal] = useState({ isOpen: false, type: 'confirm', title: '', message: '', targetId: null, targetName: '', isDestructive: false, action: '' });
  // STATE KHUSUS FORM EDIT & FORM PAKAI BARANG
  const [editForm, setEditForm] = useState({ namaBarang: '', stok: '', satuan: '' });
  const [jumlahPakai, setJumlahPakai] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const pSnap = await getDocs(collection(db, 'peralatan'));
    setPeralatanList(pSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.namaBarang.localeCompare(b.namaBarang)));
    setIsLoading(false);
  };

  const handleAddPeralatan = async (e) => {
    e.preventDefault();
    if (!newAlatNama || !newAlatStok || !newAlatSatuan) return;
    await addDoc(collection(db, 'peralatan'), { namaBarang: newAlatNama.trim().toUpperCase(), stok: parseInt(newAlatStok, 10), satuan: newAlatSatuan.trim() });
    logActivity(user.username, `Menginput alat baru: ${newAlatNama}`);
    setNewAlatNama(''); setNewAlatStok(''); setNewAlatSatuan(''); fetchData();
  };

  // BUKA MODAL EDIT KESELURUHAN
  const openEditModal = (alat) => {
    setEditForm({ namaBarang: alat.namaBarang, stok: alat.stok, satuan: alat.satuan });
    setModal({ isOpen: true, type: 'custom', action: 'edit', title: 'Edit Data Peralatan', message: '', targetId: alat.id, targetName: alat.namaBarang, isDestructive: false });
  };

  // BUKA MODAL PAKAI BARANG (KECIL & INSTAN)
  const openPakaiModal = (alat) => {
    setJumlahPakai('');
    setEditForm({ namaBarang: alat.namaBarang, stok: alat.stok, satuan: alat.satuan }); 
    setModal({ isOpen: true, type: 'custom', action: 'pakai', title: 'Catat Pemakaian Barang', message: '', targetId: alat.id, targetName: alat.namaBarang, isDestructive: false });
  };

  // BUKA MODAL HAPUS
  const openDeleteModal = (id, namaBarang) => {
    setModal({ isOpen: true, type: 'confirm', action: 'hapus', title: 'Hapus Peralatan?', message: `Apakah Anda yakin ingin menghapus data ${namaBarang} secara permanen?`, targetId: id, targetName: namaBarang, isDestructive: true });
  };

  // EKSEKUSI TOMBOL DI MODAL
  const handleModalConfirm = async () => {
    const { type, action, targetId, targetName } = modal;

    if (action === 'edit') {
      if (!editForm.namaBarang || editForm.stok === '' || !editForm.satuan) return alert("Semua kolom harus diisi!");
      await updateDoc(doc(db, 'peralatan', targetId), { namaBarang: editForm.namaBarang.trim().toUpperCase(), stok: parseInt(editForm.stok, 10), satuan: editForm.satuan.trim() });
      logActivity(user.username, `Mengedit peralatan ${targetName}`);
    } 
    else if (action === 'pakai') {
      const pengurangan = parseInt(jumlahPakai, 10);
      if (isNaN(pengurangan) || pengurangan <= 0) return alert("Jumlah pemakaian harus angka di atas 0!");
      if (editForm.stok - pengurangan < 0) return alert(`Stok tidak mencukupi! Sisa stok saat ini hanya ${editForm.stok} ${editForm.satuan}.`);
      
      const sisaStokBaru = editForm.stok - pengurangan;
      await updateDoc(doc(db, 'peralatan', targetId), { stok: sisaStokBaru });
      logActivity(user.username, `Mengeluarkan barang harian: ${targetName} sebanyak ${pengurangan} ${editForm.satuan}`);
    } 
    else if (action === 'hapus') {
      await deleteDoc(doc(db, 'peralatan', targetId));
      logActivity(user.username, `Menghapus peralatan: ${targetName}`);
    }

    setModal(prev => ({ ...prev, isOpen: false }));
    fetchData();
  };

  // AKSI EXPORT AKTIF LENGKAP
  const exportData = (type) => {
    if (peralatanList.length === 0) return alert("Tidak ada data untuk diekspor!");
    const rows = peralatanList.map((rec, i) => [i + 1, rec.namaBarang, `${rec.stok} ${rec.satuan}`]);
    
    if (type === 'excel') {
      const dataExcel = peralatanList.map((rec, i) => ({ "No": i + 1, "Nama Peralatan": rec.namaBarang, "Sisa Stok": rec.stok, "Satuan": rec.satuan }));
      const ws = XLSX.utils.json_to_sheet(dataExcel);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventory");
      XLSX.writeFile(wb, `Laporan_Peralatan_${Date.now()}.xlsx`);
    } else {
      const docPdf = new jsPDF();
      docPdf.text("Inventory Peralatan Pemeriksaan Kantor", 14, 15);
      autoTable(docPdf, { head: [["No", "Nama Peralatan / Barang", "Sisa Stok Tersedia"]], body: rows, startY: 25, headStyles: { fillColor: [15, 23, 42] } });
      docPdf.save(`Laporan_Peralatan_${Date.now()}.pdf`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans relative">
      
      <Modal 
        isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type}
        onConfirm={handleModalConfirm} onCancel={() => setModal(p => ({ ...p, isOpen: false }))}
        confirmText={modal.action === 'hapus' ? 'Ya, Hapus!' : 'Simpan'}
        isDestructive={modal.isDestructive}
      >
        {/* VIEW FORM EDIT KUSTOM */}
        {modal.action === 'edit' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nama Barang</label>
              <input type="text" value={editForm.namaBarang} onChange={e => setEditForm({...editForm, namaBarang: e.target.value})} className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Stok</label>
                <input type="number" value={editForm.stok} onChange={e => setEditForm({...editForm, stok: e.target.value})} className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Satuan</label>
                <input type="text" value={editForm.satuan} onChange={e => setEditForm({...editForm, satuan: e.target.value})} className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
          </div>
        )}

        {/* VIEW FORM PEMAKAIAN BARANG KUSTOM */}
        {modal.action === 'pakai' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 font-medium">Stok saat ini: <strong className="text-slate-800">{editForm.stok} {editForm.satuan}</strong></p>
            <div>
              <label className="text-xs font-bold text-amber-600 uppercase ml-1">Jumlah Yang Dipakai / Keluar</label>
              <input type="number" value={jumlahPakai} onChange={e => setJumlahPakai(e.target.value)} placeholder={`0 ${editForm.satuan}`} className="w-full mt-1 px-5 py-3.5 bg-amber-50/50 border border-amber-200 text-amber-900 rounded-xl font-bold font-mono text-center text-xl outline-none focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/10 transition-all" min="1" autoFocus required />
            </div>
          </div>
        )}
      </Modal>

      <div className="mb-8"><h1 className="text-3xl font-bold text-slate-900 tracking-tight">Peralatan Pemeriksaan</h1></div>
      
      <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-50 overflow-hidden">
        <div className="p-4 sm:p-6 md:p-8 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">🧰 Inventory Gudang</h2>
          <div className="flex gap-2 w-full sm:w-auto">
            <button onClick={()=>exportData('excel')} className="flex-1 sm:flex-none justify-center bg-white border border-slate-200 hover:border-green-500 hover:bg-green-50 text-green-700 px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 transition-all">📊 Excel</button>
            <button onClick={()=>exportData('pdf')} className="flex-1 sm:flex-none justify-center bg-white border border-slate-200 hover:border-red-500 hover:bg-red-50 text-red-700 px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 transition-all">📄 PDF</button>
          </div>
        </div>

        <div className="p-4 sm:p-6 md:p-8">
          
          {/* PERBAIKAN FORM RESPONSIVE */}
          <form onSubmit={handleAddPeralatan} className="flex flex-col md:flex-row gap-3 mb-8 pb-8 border-b border-slate-100">
            <input type="text" value={newAlatNama} onChange={e=>setNewAlatNama(e.target.value)} placeholder="Nama Barang" className="flex-1 px-5 py-3.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 shadow-sm" required />
            <div className="flex gap-3 w-full md:w-auto">
              <input type="number" value={newAlatStok} onChange={e=>setNewAlatStok(e.target.value)} placeholder="Jumlah" className="flex-1 md:w-32 px-5 py-3.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 shadow-sm" min="0" required />
              <input type="text" value={newAlatSatuan} onChange={e=>setNewAlatSatuan(e.target.value)} placeholder="Satuan" className="flex-1 md:w-40 px-5 py-3.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 shadow-sm" required />
            </div>
            <button type="submit" className="w-full md:w-auto bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold text-sm px-6 py-3.5 rounded-xl shadow-md transition-all shrink-0">Tambah Data</button>
          </form>

          {isLoading ? <div className="text-center text-[#4285F4] font-medium py-10 animate-pulse">Memuat Inventory...</div> : (
            <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
              <table className="w-full text-left text-sm text-slate-600 bg-white">
                <thead className="bg-[#F8F9FA] border-b border-slate-200">
                  <tr className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-4 px-4 sm:px-6">Nama Peralatan</th>
                    <th className="py-4 px-4 sm:px-6 text-center w-32 sm:w-40">Stok</th>
                    <th className="py-4 px-4 sm:px-6 text-right w-40 sm:w-56">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {peralatanList.map(alat => (
                    <tr key={alat.id} className="hover:bg-blue-50/20 transition-colors">
                      <td className="py-4 px-4 sm:px-6 font-extrabold text-slate-800">{alat.namaBarang}</td>
                      <td className="py-4 px-4 sm:px-6 text-center">
                        
                        {/* PERBAIKAN STOK RESPONSIVE ANTI PATAH */}
                        <span className={`inline-block whitespace-nowrap px-3 sm:px-4 py-1.5 rounded-full font-mono font-bold border shadow-sm text-[11px] sm:text-sm ${alat.stok <= 5 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                          {alat.stok} <span className="font-sans font-semibold ml-0.5">{alat.satuan}</span>
                        </span>
                      </td>
                      
                      <td className="py-4 px-4 sm:px-6 text-right">
                        {/* PERBAIKAN TOMBOL AKSI MELIPAT DI HP */}
                        <div className="flex justify-end flex-wrap gap-1.5 w-full">
                          <button onClick={() => openPakaiModal(alat)} className="text-[#B06000] hover:text-white font-bold text-xs bg-amber-50 hover:bg-[#FBBC05] px-2.5 sm:px-3 py-2 rounded-xl transition-all shadow-sm">
                            🤝 Pakai
                          </button>
                          <button onClick={() => openEditModal(alat)} className="text-[#1A73E8] hover:text-white font-bold text-xs bg-[#E8F0FE] hover:bg-[#1A73E8] px-2.5 sm:px-3 py-2 rounded-xl transition-all shadow-sm">
                            Edit
                          </button>
                          <button onClick={() => openDeleteModal(alat.id, alat.namaBarang)} className="text-[#EA4335] hover:text-white font-bold text-xs bg-[#FCE8E6] hover:bg-[#EA4335] px-2.5 sm:px-3 py-2 rounded-xl transition-all shadow-sm">
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {peralatanList.length === 0 && <tr><td colSpan="3" className="py-12 text-center text-slate-400">Inventory kosong.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}