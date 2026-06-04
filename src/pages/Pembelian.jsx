import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, orderBy, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logActivity } from '../utils/auditLogger';
import Modal from '../components/Modal';

export default function Pembelian() {
  const { user } = useAuth();
  const [pembelianList, setPembelianList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form Input
  const [newBeliNama, setNewBeliNama] = useState('');
  const [newBeliJumlah, setNewBeliJumlah] = useState('');
  const [newBeliSatuan, setNewBeliSatuan] = useState('');

  // FILTER STATE BARU
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // STATE UNTUK MODAL
  const [modal, setModal] = useState({ isOpen: false, action: '', title: '', message: '', targetId: null, targetName: '', targetData: null, isDestructive: false });
  const [editForm, setEditForm] = useState({ namaBarang: '', jumlah: '', satuan: '' });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const bSnap = await getDocs(query(collection(db, 'pembelian'), orderBy('timestamp', 'desc')));
    setPembelianList(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setIsLoading(false);
  };

  const handleAddPembelian = async (e) => {
    e.preventDefault();
    if (!newBeliNama || !newBeliJumlah || !newBeliSatuan) return;
    await addDoc(collection(db, 'pembelian'), { namaBarang: newBeliNama.trim().toUpperCase(), jumlah: parseInt(newBeliJumlah, 10), satuan: newBeliSatuan.trim(), status: 'Rencana', timestamp: new Date().toISOString() });
    logActivity(user.username, `Rencana pembelian: ${newBeliNama}`);
    setNewBeliNama(''); setNewBeliJumlah(''); setNewBeliSatuan(''); fetchData();
  };

  const openSelesaiModal = (beli) => { setModal({ isOpen: true, action: 'selesai', title: 'Selesaikan Pembelian?', message: `Tandai ${beli.namaBarang} sebagai Diterima? Barang akan otomatis ditransfer ke stok peralatan.`, targetId: beli.id, targetName: beli.namaBarang, targetData: beli, isDestructive: false }); };
  const openEditModal = (beli) => { setEditForm({ namaBarang: beli.namaBarang, jumlah: beli.jumlah, satuan: beli.satuan }); setModal({ isOpen: true, action: 'edit', title: 'Edit Rencana Pembelian', message: '', targetId: beli.id, targetName: beli.namaBarang, isDestructive: false }); };
  const openDeleteModal = (id, namaBarang) => { setModal({ isOpen: true, action: 'hapus', title: 'Hapus Riwayat Pembelian?', message: `Apakah Anda yakin ingin menghapus data pembelian ${namaBarang} dari sistem?`, targetId: id, targetName: namaBarang, isDestructive: true }); };

  const handleModalConfirm = async () => {
    const { action, targetId, targetName, targetData } = modal;

    if (action === 'selesai') {
      await updateDoc(doc(db, 'pembelian', targetId), { status: 'Selesai' });
      const qCek = query(collection(db, 'peralatan'), where('namaBarang', '==', targetName));
      const snapCek = await getDocs(qCek);
      if (!snapCek.empty) {
        const ex = snapCek.docs[0];
        await updateDoc(doc(db, 'peralatan', ex.id), { stok: ex.data().stok + targetData.jumlah, satuan: targetData.satuan });
      } else {
        await addDoc(collection(db, 'peralatan'), { namaBarang: targetName, stok: targetData.jumlah, satuan: targetData.satuan });
      }
      logActivity(user.username, `Pembelian selesai: ${targetName}`);
    } 
    else if (action === 'edit') {
      if (!editForm.namaBarang || editForm.jumlah === '' || !editForm.satuan) return alert("Isi semua kolom!");
      await updateDoc(doc(db, 'pembelian', targetId), { namaBarang: editForm.namaBarang.trim().toUpperCase(), jumlah: parseInt(editForm.jumlah, 10), satuan: editForm.satuan.trim() });
      logActivity(user.username, `Mengedit rencana pembelian: ${targetName}`);
    } 
    else if (action === 'hapus') {
      await deleteDoc(doc(db, 'pembelian', targetId));
      logActivity(user.username, `Menghapus data pembelian: ${targetName}`);
    }
    
    setModal({ ...modal, isOpen: false });
    fetchData();
  };

  // LOGIKA FILTER
  const getFilteredPembelian = () => {
    return pembelianList.filter(beli => {
      const matchSearch = beli.namaBarang.toLowerCase().includes(searchTerm.toLowerCase());
      let matchDate = true;
      if (filterDate) {
        const bDate = new Date(beli.timestamp);
        const bYear = bDate.getFullYear();
        const bMonth = String(bDate.getMonth() + 1).padStart(2, '0');
        const bDay = String(bDate.getDate()).padStart(2, '0');
        const formatted = `${bYear}-${bMonth}-${bDay}`;
        matchDate = formatted === filterDate;
      }
      return matchSearch && matchDate;
    });
  };

  const exportData = (type) => {
    const dataArray = getFilteredPembelian();
    if (dataArray.length === 0) return alert("Tidak ada data untuk diekspor!");
    const rows = dataArray.map((rec, i) => [ i + 1, new Date(rec.timestamp).toLocaleDateString('id-ID'), rec.namaBarang, `${rec.jumlah} ${rec.satuan}`, rec.status ]);
    
    if (type === 'excel') {
      const dataExcel = dataArray.map((rec, i) => ({ "No": i + 1, "Tanggal": new Date(rec.timestamp).toLocaleDateString('id-ID'), "Nama Barang": rec.namaBarang, "Jumlah": rec.jumlah, "Satuan": rec.satuan, "Status": rec.status }));
      const ws = XLSX.utils.json_to_sheet(dataExcel);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pembelian");
      XLSX.writeFile(wb, `Laporan_Pembelian_${Date.now()}.xlsx`);
    } else {
      const docPdf = new jsPDF();
      docPdf.text("Laporan Rencana & Realisasi Pembelian", 14, 15);
      autoTable(docPdf, { head: [["No", "Tanggal Pengajuan", "Nama Barang", "Jumlah & Satuan", "Status Logistik"]], body: rows, startY: 25, headStyles: { fillColor: [30, 41, 59] } });
      docPdf.save(`Laporan_Pembelian_${Date.now()}.pdf`);
    }
  };

  const filteredList = getFilteredPembelian();

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans relative">
      <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.action === 'edit' ? 'custom' : 'confirm'} onConfirm={handleModalConfirm} onCancel={() => setModal({ ...modal, isOpen: false })} confirmText={modal.action === 'hapus' ? 'Ya, Hapus' : modal.action === 'edit' ? 'Simpan' : 'Selesaikan'} isDestructive={modal.isDestructive}>
        {modal.action === 'edit' && (
          <div className="space-y-4">
            <div><label className="text-xs font-bold text-slate-500 uppercase ml-1">Nama Barang</label><input type="text" value={editForm.namaBarang} onChange={e => setEditForm({...editForm, namaBarang: e.target.value})} className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div>
            <div className="flex gap-3"><div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase ml-1">Jumlah</label><input type="number" value={editForm.jumlah} onChange={e => setEditForm({...editForm, jumlah: e.target.value})} className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" min="1" /></div><div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase ml-1">Satuan</label><input type="text" value={editForm.satuan} onChange={e => setEditForm({...editForm, satuan: e.target.value})} className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div></div>
          </div>
        )}
      </Modal>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Rencana Pembelian</h1>
        <p className="text-slate-500 mt-1">Buat daftar belanja dan pantau transfer stok otomatis ke gudang.</p>
      </div>
      
      <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-50 overflow-hidden">
        
        {/* BAR FILTER DAN EXPORT DI HEADER */}
        <div className="p-6 md:p-8 bg-slate-50 border-b border-slate-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-5">
          <div className="flex flex-col sm:flex-row w-full xl:w-auto gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mr-4"><span className="text-2xl">🛒</span> Daftar Antrean</h2>
            <div className="relative w-full sm:w-64">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">🔍</span>
              <input type="text" placeholder="Cari Nama Barang..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-50 w-full transition-all shadow-sm placeholder-slate-400" />
            </div>
            <input 
              type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} 
              className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-50 cursor-pointer shadow-sm w-full sm:w-40 transition-all hover:bg-slate-50"
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button onClick={()=>exportData('excel')} className="flex-1 sm:flex-none bg-white border border-slate-200 hover:border-green-500 hover:bg-green-50 text-green-700 px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center justify-center gap-2 transition-all">📊 Excel</button>
            <button onClick={()=>exportData('pdf')} className="flex-1 sm:flex-none bg-white border border-slate-200 hover:border-red-500 hover:bg-red-50 text-red-700 px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center justify-center gap-2 transition-all">📄 PDF</button>
          </div>
        </div>

        <div className="p-6 md:p-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm mb-8">
            <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Buat Rencana Baru</h3>
            <form onSubmit={handleAddPembelian} className="flex flex-col md:flex-row gap-3">
              <input type="text" value={newBeliNama} onChange={e=>setNewBeliNama(e.target.value)} placeholder="Nama Barang" className="flex-1 px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 transition-all" required />
              <input type="number" value={newBeliJumlah} onChange={e=>setNewBeliJumlah(e.target.value)} placeholder="Jumlah" className="w-full md:w-32 px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 transition-all" min="1" required />
              <input type="text" value={newBeliSatuan} onChange={e=>setNewBeliSatuan(e.target.value)} placeholder="Satuan (Pcs)" className="w-full md:w-40 px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 transition-all" required />
              <button type="submit" className="bg-slate-800 hover:bg-black text-white font-bold text-sm px-8 py-3.5 rounded-xl shadow-md transition-all">Ajukan</button>
            </form>
          </div>

          {isLoading ? <p className="text-center text-blue-500 py-10 animate-pulse font-medium">Memuat data...</p> : (
            <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
              <table className="w-full text-left text-sm text-slate-600 bg-white">
                <thead className="bg-[#F8F9FA] border-b border-slate-200">
                  <tr className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-4 px-6">Tanggal</th><th className="py-4 px-6">Nama Barang</th><th className="py-4 px-6 text-center">Jumlah</th><th className="py-4 px-6 text-center">Status</th><th className="py-4 px-6 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredList.map(beli => (
                    <tr key={beli.id} className="hover:bg-blue-50/20 transition-colors">
                      <td className="py-4 px-6 font-medium text-slate-500">{new Date(beli.timestamp).toLocaleDateString('id-ID')}</td>
                      <td className="py-4 px-6 font-extrabold text-slate-800">{beli.namaBarang}</td>
                      <td className="py-4 px-6 text-center font-mono font-black text-[#1A73E8] bg-blue-50/50">{beli.jumlah} <span className="text-xs text-slate-500 font-sans font-semibold">{beli.satuan}</span></td>
                      <td className="py-4 px-6 text-center">
                        {beli.status === 'Selesai' ? <span className="inline-flex items-center gap-1.5 bg-[#E6F4EA] text-[#137333] px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase border border-[#CEEAD6]"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> Diterima</span> : <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase border border-amber-200"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span> Proses</span>}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end gap-2">
                          {beli.status === 'Rencana' ? (
                            <>
                              <button onClick={() => openSelesaiModal(beli)} className="bg-[#E6F4EA] hover:bg-[#34A853] text-[#137333] hover:text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm">Selesai</button>
                              <button onClick={() => openEditModal(beli)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm">Edit</button>
                            </>
                          ) : (
                            <span className="text-slate-400 text-xs font-semibold bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">Sudah Di Gudang</span>
                          )}
                          <button onClick={() => openDeleteModal(beli.id, beli.namaBarang)} className="bg-[#FCE8E6] hover:bg-[#EA4335] text-[#EA4335] hover:text-white font-bold text-xs px-3 py-2 rounded-xl transition-all shadow-sm">Hapus</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredList.length === 0 && <tr><td colSpan="5" className="py-12 text-center text-slate-400">Tidak ada data yang sesuai.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}