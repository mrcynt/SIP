import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { collection, getDocs, getDoc, addDoc, deleteDoc, doc, updateDoc, query, orderBy, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logActivity } from '../utils/auditLogger';
import Modal from '../components/Modal'; 

export default function Peralatan() {
  const { user } = useAuth();
  const [activeMainTab, setActiveMainTab] = useState('inventory');
  const [activeSubTab, setActiveSubTab] = useState('Rencana'); 
  
  const [peralatanList, setPeralatanList] = useState([]);
  const [pembelianList, setPembelianList] = useState([]);
  const [pemakaianList, setPemakaianList] = useState([]);
  const [peminjamanList, setPeminjamanList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- FILTER STATE ---
  const [searchInv, setSearchInv] = useState('');
  const [filterJenisInv, setFilterJenisInv] = useState('');

  // --- FORM PEMBELIAN BARU (ANTI-TYPO DROPDOWN) ---
  const [selectedBarangId, setSelectedBarangId] = useState('');
  const [newBeliNama, setNewBeliNama] = useState('');
  const [newBeliJumlah, setNewBeliJumlah] = useState('');
  const [newBeliSatuan, setNewBeliSatuan] = useState('');
  const [newBeliJenis, setNewBeliJenis] = useState('habis_pakai');
  const [isBarangBaru, setIsBarangBaru] = useState(true);

  // --- STATE MODAL ---
  const [modal, setModal] = useState({ isOpen: false, type: 'confirm', title: '', message: '', targetId: null, targetName: '', targetData: null, isDestructive: false, action: '' });
  const [editForm, setEditForm] = useState({ namaBarang: '', stok: '', satuan: '', jenis: 'habis_pakai', jumlah: '' });
  const [inputJumlah, setInputJumlah] = useState('');
  const [inputNamaPeminjam, setInputNamaPeminjam] = useState('');
  const [inputKeterangan, setInputKeterangan] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch Peralatan (Inventory)
      const pSnap = await getDocs(collection(db, 'peralatan'));
      setPeralatanList(pSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.namaBarang.localeCompare(b.namaBarang)));
      
      // Fetch Pembelian
      const bSnap = await getDocs(query(collection(db, 'pembelian'), orderBy('timestamp', 'desc')));
      setPembelianList(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Fetch Pemakaian
      const pkSnap = await getDocs(query(collection(db, 'pemakaian'), orderBy('timestamp', 'desc')));
      setPemakaianList(pkSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Fetch Peminjaman Aset
      const pjSnap = await getDocs(query(collection(db, 'peminjaman'), orderBy('timestamp', 'desc')));
      setPeminjamanList(pjSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (error) { console.error(error); }
    setIsLoading(false);
  };

  // --- HANDLER PEMBELIAN DROPDOWN ---
  const handleSelectBarangBeli = (e) => {
    const val = e.target.value;
    setSelectedBarangId(val);
    if (val === 'NEW' || val === '') {
      setIsBarangBaru(true);
      setNewBeliNama(''); setNewBeliSatuan(''); setNewBeliJenis('habis_pakai');
    } else {
      setIsBarangBaru(false);
      const selected = peralatanList.find(item => item.id === val);
      if (selected) {
        setNewBeliNama(selected.namaBarang);
        setNewBeliSatuan(selected.satuan);
        setNewBeliJenis(selected.jenis || 'habis_pakai');
      }
    }
  };

  const handleAddPembelian = async (e) => {
    e.preventDefault();
    if (!newBeliNama || !newBeliJumlah || !newBeliSatuan) return;
    await addDoc(collection(db, 'pembelian'), { 
      namaBarang: newBeliNama.trim().toUpperCase(), 
      jumlah: parseInt(newBeliJumlah, 10), 
      satuan: newBeliSatuan.trim().toUpperCase(), 
      jenis: newBeliJenis,
      status: 'Rencana', 
      timestamp: new Date().toISOString(),
      admin: user.username
    });
    logActivity(user.username, `Mengajukan rencana pembelian: ${newBeliNama}`);
    setNewBeliJumlah(''); setSelectedBarangId(''); setIsBarangBaru(true);
    setNewBeliNama(''); setNewBeliSatuan(''); setNewBeliJenis('habis_pakai');
    setActiveMainTab('logistik');
    setActiveSubTab('Rencana'); 
    fetchData();
  };

  // --- PEMBUKA MODAL INVENTORY ---
  const openEditInv = (alat) => {
    setEditForm({ namaBarang: alat.namaBarang, stok: alat.stok, satuan: alat.satuan, jenis: alat.jenis || 'habis_pakai' });
    setModal({ isOpen: true, type: 'custom', action: 'edit_inv', title: 'Edit Data Gudang', message: '', targetId: alat.id, targetName: alat.namaBarang, targetData: alat, isDestructive: false });
  };
  const openActionInv = (actionType, alat) => {
    setInputJumlah(''); setInputNamaPeminjam(''); setInputKeterangan('');
    setEditForm({ namaBarang: alat.namaBarang, stok: alat.stok, satuan: alat.satuan, jenis: alat.jenis }); 
    const titles = { pakai: 'Catat Pemakaian Barang', restock: 'Restock / Pembelian Instan', pinjam: 'Pinjamkan Aset' };
    setModal({ isOpen: true, type: 'custom', action: actionType, title: titles[actionType], message: '', targetId: alat.id, targetName: alat.namaBarang, targetData: alat, isDestructive: false });
  };
  const openDeleteInv = (id, nama) => setModal({ isOpen: true, type: 'confirm', action: 'hapus_inv', title: 'Hapus Dari Gudang?', message: `Yakin hapus ${nama} permanen?`, targetId: id, targetName: nama, isDestructive: true });

  // --- PEMBUKA MODAL LOGISTIK ---
  const openSelesaiBeli = (beli) => setModal({ isOpen: true, type: 'confirm', action: 'selesai_beli', title: 'Selesaikan Pembelian?', message: `Tandai ${beli.namaBarang} sebagai Diterima? Stok Gudang akan bertambah otomatis.`, targetId: beli.id, targetName: beli.namaBarang, targetData: beli, isDestructive: false });
  const openKembalikanAset = (pinjam) => setModal({ isOpen: true, type: 'confirm', action: 'kembali_aset', title: 'Terima Pengembalian?', message: `Terima aset ${pinjam.namaBarang} dari ${pinjam.namaPeminjam}?`, targetId: pinjam.id, targetName: pinjam.namaBarang, targetData: pinjam, isDestructive: false });
  const openDeleteLogistik = (collectionName, id, nama) => setModal({ isOpen: true, type: 'confirm', action: 'hapus_logistik', title: 'Hapus Riwayat?', message: `Yakin hapus data riwayat ${nama}?`, targetId: id, targetName: nama, targetData: collectionName, isDestructive: true });

  // --- EKSEKUSI MODAL ---
  const handleModalConfirm = async () => {
    const { action, targetId, targetName, targetData } = modal;
    const jumlahAngka = parseInt(inputJumlah, 10);
    const stokSaatIni = Number(editForm.stok);

    try {
      // AKSI INVENTORY
      if (action === 'edit_inv') {
        if (!editForm.namaBarang || !editForm.satuan) return alert("Semua kolom harus diisi!");
        await updateDoc(doc(db, 'peralatan', targetId), { namaBarang: editForm.namaBarang.trim().toUpperCase(), satuan: editForm.satuan.trim().toUpperCase(), jenis: editForm.jenis });
      } 
      else if (action === 'pakai') {
        if (isNaN(jumlahAngka) || jumlahAngka <= 0) return alert("Jumlah harus di atas 0!");
        if (stokSaatIni - jumlahAngka < 0) return alert(`Stok tidak cukup! Sisa: ${stokSaatIni}`);
        
        await updateDoc(doc(db, 'peralatan', targetId), { stok: stokSaatIni - jumlahAngka });
        await addDoc(collection(db, 'pemakaian'), { idBarang: targetId, namaBarang: targetName, jumlah: jumlahAngka, satuan: editForm.satuan, keterangan: inputKeterangan.trim(), timestamp: new Date().toISOString(), admin: user.username });
        logActivity(user.username, `Memakai: ${targetName} (${jumlahAngka} ${editForm.satuan})`);
      } 
      else if (action === 'pinjam') {
        if (isNaN(jumlahAngka) || jumlahAngka <= 0) return alert("Jumlah harus di atas 0!");
        if (stokSaatIni - jumlahAngka < 0) return alert(`Stok tidak cukup! Sisa: ${stokSaatIni}`);
        if (!inputNamaPeminjam.trim()) return alert("Nama peminjam wajib diisi!");
        
        const currentDipinjam = Number(targetData.dipinjam) || 0;
        await updateDoc(doc(db, 'peralatan', targetId), { stok: stokSaatIni - jumlahAngka, dipinjam: currentDipinjam + jumlahAngka });
        await addDoc(collection(db, 'peminjaman'), { idBarang: targetId, namaBarang: targetName, namaPeminjam: inputNamaPeminjam.toUpperCase(), jumlah: jumlahAngka, satuan: editForm.satuan, keterangan: inputKeterangan.trim(), status: 'Dipinjam', timestamp: new Date().toISOString(), admin: user.username });
        logActivity(user.username, `Meminjamkan ${targetName} (${jumlahAngka}) kepada ${inputNamaPeminjam.toUpperCase()}`);
      } 
      else if (action === 'restock') {
        if (isNaN(jumlahAngka) || jumlahAngka <= 0) return alert("Jumlah beli harus di atas 0!");
        await updateDoc(doc(db, 'peralatan', targetId), { stok: stokSaatIni + jumlahAngka });
        await addDoc(collection(db, 'pembelian'), { namaBarang: targetName, jumlah: jumlahAngka, satuan: editForm.satuan, jenis: editForm.jenis || 'habis_pakai', status: 'Selesai', timestamp: new Date().toISOString(), admin: user.username });
        logActivity(user.username, `Restock barang: ${targetName} (+${jumlahAngka})`);
      }
      else if (action === 'hapus_inv') {
        await deleteDoc(doc(db, 'peralatan', targetId));
      }
      
      // AKSI LOGISTIK
      else if (action === 'selesai_beli') {
        await updateDoc(doc(db, 'pembelian', targetId), { status: 'Selesai' });
        const qCek = query(collection(db, 'peralatan'), where('namaBarang', '==', targetName));
        const snapCek = await getDocs(qCek);
        if (!snapCek.empty) {
          const ex = snapCek.docs[0];
          await updateDoc(doc(db, 'peralatan', ex.id), { stok: Number(ex.data().stok) + targetData.jumlah });
        } else {
          await addDoc(collection(db, 'peralatan'), { namaBarang: targetName, stok: targetData.jumlah, dipinjam: 0, satuan: targetData.satuan || 'PCS', jenis: targetData.jenis || 'habis_pakai' });
        }
        logActivity(user.username, `Pembelian selesai: ${targetName} masuk gudang.`);
      } 
      else if (action === 'kembali_aset') {
        await updateDoc(doc(db, 'peminjaman', targetId), { status: 'Dikembalikan', waktuKembali: new Date().toISOString() });
        const barangRef = doc(db, 'peralatan', targetData.idBarang);
        const bSnap = await getDoc(barangRef);
        if (bSnap.exists()) {
          const bData = bSnap.data();
          await updateDoc(barangRef, { stok: Number(bData.stok) + targetData.jumlah, dipinjam: Math.max(0, Number(bData.dipinjam || 0) - targetData.jumlah) });
        }
        logActivity(user.username, `Menerima pengembalian ${targetName} dari ${targetData.namaPeminjam}`);
      }
      else if (action === 'hapus_logistik') {
        const collectionName = targetData; 
        await deleteDoc(doc(db, collectionName, targetId));
      }

    } catch (err) { 
      console.error(err); alert(`Kesalahan sistem!\n${err.message}`); 
    }
    
    setModal(prev => ({ ...prev, isOpen: false }));
    fetchData();
  };

  const filteredInv = peralatanList.filter(alat => {
    const matchSearch = alat.namaBarang.toLowerCase().includes(searchInv.toLowerCase());
    const matchJenis = filterJenisInv === '' || alat.jenis === filterJenisInv;
    if (filterJenisInv === 'habis_pakai' && !alat.jenis) return matchSearch; 
    return matchSearch && matchJenis;
  });

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans relative">
      
      {/* MODAL GLOBAL */}
      <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onConfirm={handleModalConfirm} onCancel={() => setModal(p => ({ ...p, isOpen: false }))} confirmText={['hapus_inv', 'hapus_logistik'].includes(modal.action) ? 'Ya, Hapus!' : modal.action === 'selesai_beli' ? 'Selesaikan' : modal.action === 'kembali_aset' ? 'Terima Aset' : 'Simpan'} isDestructive={modal.isDestructive}>
        
        {/* FORM EDIT MASTER KTP BARANG */}
        {modal.action === 'edit_inv' && (
          <div className="space-y-4 animate-in fade-in">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nama Barang / Aset</label>
              <input type="text" value={editForm.namaBarang} onChange={e => setEditForm({...editForm, namaBarang: e.target.value})} className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 uppercase" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Sifat Barang</label>
                <select value={editForm.jenis} onChange={e => setEditForm({...editForm, jenis: e.target.value})} className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500 cursor-pointer">
                  <option value="habis_pakai">Habis Pakai</option>
                  <option value="aset">Aset Tetap</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Satuan</label>
                <input type="text" value={editForm.satuan} onChange={e => setEditForm({...editForm, satuan: e.target.value})} className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 uppercase" />
              </div>
            </div>
          </div>
        )}

        {/* FORM INPUT JUMLAH UNTUK AKSI INVENTORY (PAKAI, RESTOCK, PINJAM) */}
        {['pakai', 'restock', 'pinjam'].includes(modal.action) && (
          <div className="space-y-4 animate-in zoom-in-95">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center">
              <span className="text-xs text-slate-500 font-bold uppercase">Stok Gudang Saat Ini:</span>
              <span className="text-sm font-black text-slate-800 bg-white px-3 py-1 rounded-lg shadow-sm border border-slate-200">{editForm.stok} {editForm.satuan}</span>
            </div>
            
            {modal.action === 'pinjam' && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Petugas Peminjam <span className="text-red-500">*</span></label>
                <input type="text" value={inputNamaPeminjam} onChange={e => setInputNamaPeminjam(e.target.value)} placeholder="Contoh: Budi Santoso" className="w-full mt-1 px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-blue-500 uppercase" required autoFocus />
              </div>
            )}

            <div>
              <label className={`text-xs font-bold uppercase ml-1 ${modal.action === 'restock' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {modal.action === 'restock' ? 'Jumlah Yang Dibeli/Masuk' : 'Jumlah Keluar / Dipinjam'} <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1">
                <input type="number" value={inputJumlah} onChange={e => setInputJumlah(e.target.value)} placeholder="0" className={`w-full px-5 py-4 border rounded-xl font-black font-mono text-center text-3xl outline-none focus:ring-4 transition-all ${modal.action === 'restock' ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 focus:border-emerald-500' : 'bg-amber-50/50 border-amber-200 text-amber-900 focus:border-amber-500'}`} min="1" autoFocus={modal.action !== 'pinjam'} required />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 font-bold text-slate-400">{editForm.satuan}</span>
              </div>
            </div>

            {['pakai', 'pinjam'].includes(modal.action) && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Keterangan / Digunakan Untuk Tahap (Opsional)</label>
                <input type="text" value={inputKeterangan} onChange={e => setInputKeterangan(e.target.value)} placeholder="Contoh: Pemasangan Tahap 1..." className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500" />
              </div>
            )}
          </div>
        )}
      </Modal>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Sistem Logistik Sentral</h1>
        <p className="text-slate-500 mt-1">Kelola master KTP barang, pengajuan pembelian, dan lacak pemakaian secara transparan.</p>
      </div>

      {/* NAVIGASI TAB UTAMA */}
      <div className="flex space-x-2 p-1.5 bg-slate-200/50 rounded-2xl mb-8 overflow-x-auto w-full lg:w-fit scrollbar-hide border border-slate-100">
        <button onClick={() => setActiveMainTab('inventory')} className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${activeMainTab === 'inventory' ? 'bg-white text-[#1A73E8] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          🧰 Master & Stok Gudang
        </button>
        <button onClick={() => setActiveMainTab('logistik')} className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${activeMainTab === 'logistik' ? 'bg-white text-[#107C41] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          📦 Buku Logistik
        </button>
      </div>
      
      <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-50 overflow-hidden animate-in fade-in duration-300">
        
        {/* TAMPILAN TAB 1: INVENTORY (MASTER BARANG) */}
        {activeMainTab === 'inventory' && (
          <div className="p-4 sm:p-6 md:p-8">

            <div className="flex flex-col sm:flex-row gap-3 mb-6 bg-slate-50 p-2 rounded-xl border border-slate-100">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">🔍</span>
                <input type="text" placeholder="Cari di Gudang..." value={searchInv} onChange={(e) => setSearchInv(e.target.value)} className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-[#4285F4]" />
              </div>
              <select value={filterJenisInv} onChange={(e) => setFilterJenisInv(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-[#4285F4] cursor-pointer font-semibold text-slate-700 sm:w-48">
                <option value="">Semua Jenis</option>
                <option value="habis_pakai">Habis Pakai</option>
                <option value="aset">Aset Tetap</option>
              </select>
            </div>

            {isLoading ? <div className="text-center text-[#4285F4] font-medium py-10 animate-pulse">Memuat Gudang...</div> : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
                <table className="w-full text-left text-sm text-slate-600 bg-white">
                  <thead className="bg-[#F8F9FA] border-b border-slate-200">
                    <tr className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                      <th className="py-4 px-6">Identitas Barang</th>
                      <th className="py-4 px-6 text-center w-40">Ketersediaan Stok</th>
                      <th className="py-4 px-6 text-right w-56">Tindakan Lapangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInv.map(alat => (
                      <tr key={alat.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="py-4 px-6">
                          <div className="font-extrabold text-slate-800">{alat.namaBarang}</div>
                          <div className="mt-1.5 flex items-center gap-2">
                            {alat.jenis === 'aset' ? (
                              <span className="bg-indigo-50 text-indigo-700 text-[9px] px-2 py-0.5 rounded font-black tracking-widest border border-indigo-200">ASET TETAP</span>
                            ) : (
                              <span className="bg-orange-50 text-orange-700 text-[9px] px-2 py-0.5 rounded font-black tracking-widest border border-orange-200">HABIS PAKAI</span>
                            )}
                            <button onClick={() => openEditInv(alat)} className="text-[10px] font-bold text-blue-500 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity">✏️ Edit KTP</button>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className={`inline-flex flex-col items-center justify-center px-4 py-2 rounded-xl font-mono font-bold border shadow-sm w-20 ${alat.stok <= 0 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                            <span className="text-xl leading-none">{alat.stok}</span>
                            <span className="font-sans font-semibold text-[9px] uppercase mt-1 tracking-wider">{alat.satuan}</span>
                          </div>
                          {alat.jenis === 'aset' && (alat.dipinjam > 0) && (
                            <div className="mt-1.5 text-[9px] font-bold text-amber-600 bg-amber-50 rounded border border-amber-100 px-1 py-0.5">
                              Dipinjam: {alat.dipinjam}
                            </div>
                          )}
                        </td>
                        
                        <td className="py-4 px-6 text-right">
                          <div className="flex justify-end items-center gap-1.5 w-full">
                            {alat.jenis === 'aset' ? (
                              <button onClick={() => openActionInv('pinjam', alat)} title="Pinjamkan Aset" className="w-9 h-9 flex items-center justify-center text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-base rounded-xl transition-all border border-indigo-200 hover:border-indigo-600 shadow-sm">📤</button>
                            ) : (
                              <button onClick={() => openActionInv('pakai', alat)} title="Pakai Stok Keluar" className="w-9 h-9 flex items-center justify-center text-amber-600 bg-amber-50 hover:bg-amber-500 hover:text-white text-base rounded-xl transition-all border border-amber-200 hover:border-amber-500 shadow-sm">✂️</button>
                            )}
                            <button onClick={() => openActionInv('restock', alat)} title="Restock Masuk" className="w-9 h-9 flex items-center justify-center text-emerald-600 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-base rounded-xl transition-all border border-emerald-200 hover:border-emerald-600 shadow-sm">🛒</button>
                            <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>
                            <button onClick={() => openDeleteInv(alat.id, alat.namaBarang)} title="Hapus Master Barang" className="w-9 h-9 flex items-center justify-center text-slate-400 bg-white hover:bg-red-500 hover:text-white hover:border-red-500 text-base rounded-xl transition-all border border-slate-200 shadow-sm">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredInv.length === 0 && <tr><td colSpan="3" className="py-12 text-center text-slate-400">Inventory kosong atau tidak ditemukan.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAMPILAN TAB 2: BUKU LOGISTIK (MASUK & KELUAR) */}
        {activeMainTab === 'logistik' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300 bg-slate-50">
            
            <div className="p-4 sm:p-6 md:p-8">
              {/* FORM PENGAJUAN PEMBELIAN ANTI TYPO */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-8">
                <h3 className="text-sm font-black text-emerald-800 mb-4 uppercase tracking-wider flex items-center gap-2">🛒 Buat Pengajuan Pembelian Baru</h3>
                <form onSubmit={handleAddPembelian} className="flex flex-col md:flex-row gap-3">
                  
                  {/* DROPDOWN ANTI TYPO */}
                  <select value={selectedBarangId} onChange={handleSelectBarangBeli} className="flex-1 px-4 py-3.5 bg-slate-50 border border-emerald-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-[#107C41] focus:ring-2 focus:ring-green-100 text-slate-800 cursor-pointer">
                    <option value="" disabled>-- Pilih Dari Katalog Gudang --</option>
                    {peralatanList.map(alat => (
                      <option key={alat.id} value={alat.id}>{alat.namaBarang} ({alat.satuan})</option>
                    ))}
                    <option value="NEW" className="text-blue-600 font-black">+ DAFTARKAN BARANG BARU (TANPA STOK)</option>
                  </select>

                  {/* JIKA BARANG BARU, MUNCULKAN INPUT MANUAL */}
                  {isBarangBaru && (
                    <>
                      <input type="text" value={newBeliNama} onChange={e=>setNewBeliNama(e.target.value)} placeholder="Ketik Nama Baru" className="flex-1 px-4 py-3.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:border-[#107C41] uppercase" required />
                      <select value={newBeliJenis} onChange={e=>setNewBeliJenis(e.target.value)} className="w-32 px-3 py-3.5 bg-white border border-slate-300 rounded-xl text-xs font-bold outline-none focus:border-[#107C41]">
                        <option value="habis_pakai">Habis Pakai</option>
                        <option value="aset">Aset Tetap</option>
                      </select>
                      <input type="text" value={newBeliSatuan} onChange={e=>setNewBeliSatuan(e.target.value)} placeholder="Satuan" className="w-24 px-4 py-3.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:border-[#107C41] uppercase" required />
                    </>
                  )}
                  
                  <input type="number" value={newBeliJumlah} onChange={e=>setNewBeliJumlah(e.target.value)} placeholder="Jml Beli" className="w-full md:w-32 px-5 py-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 font-black rounded-xl text-center outline-none focus:bg-white focus:border-[#107C41] focus:ring-2 focus:ring-green-100 transition-all" min="1" required />
                  <button type="submit" className="bg-[#107C41] hover:bg-[#0A572D] text-white font-bold text-sm px-8 py-3.5 rounded-xl shadow-md transition-all shrink-0">Ajukan</button>
                </form>
              </div>

              {/* SUB TAB NAVIGASI LOGISTIK */}
              <div className="flex space-x-2 p-1.5 bg-white rounded-xl mb-6 overflow-x-auto w-full scrollbar-hide border border-slate-200 shadow-sm">
                <button onClick={() => setActiveSubTab('Rencana')} className={`px-5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeSubTab === 'Rencana' ? 'bg-[#107C41] text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>📝 Proses Pengajuan</button>
                <button onClick={() => setActiveSubTab('Selesai')} className={`px-5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeSubTab === 'Selesai' ? 'bg-[#34A853] text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>✅ Riwayat Beli Masuk</button>
                <div className="w-[1px] bg-slate-200 my-1"></div>
                <button onClick={() => setActiveSubTab('Pemakaian')} className={`px-5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeSubTab === 'Pemakaian' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>✂️ Riwayat Pakai Keluar</button>
                <button onClick={() => setActiveSubTab('Peminjaman')} className={`px-5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeSubTab === 'Peminjaman' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>🤝 Status Peminjaman Aset</button>
              </div>

              {/* RENDER KONTEN SUB-TAB */}
              {isLoading ? <p className="text-center text-slate-500 py-10 animate-pulse font-medium">Membuka buku logistik...</p> : (
                <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
                  <table className="w-full text-left text-sm text-slate-600 bg-white">
                    <thead className="bg-[#F8F9FA] border-b border-slate-200">
                      
                      {/* HEADER DINAMIS SESUAI SUB TAB */}
                      {['Rencana', 'Selesai'].includes(activeSubTab) && (
                        <tr className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                          <th className="py-4 px-6">Tgl Masuk/Catat</th><th className="py-4 px-6">Nama & Jenis</th><th className="py-4 px-6 text-center">Jml Beli</th><th className="py-4 px-6 text-center">Status</th><th className="py-4 px-6 text-right w-32">Aksi</th>
                        </tr>
                      )}
                      {activeSubTab === 'Pemakaian' && (
                        <tr className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                          <th className="py-4 px-6 w-40">Tanggal Keluar</th><th className="py-4 px-6">Barang Habis Pakai</th><th className="py-4 px-6 text-center">Jml Keluar</th><th className="py-4 px-6">Keterangan / Tahap</th><th className="py-4 px-6 text-right w-20">Aksi</th>
                        </tr>
                      )}
                      {activeSubTab === 'Peminjaman' && (
                        <tr className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                          <th className="py-4 px-6 w-40">Tgl Pinjam</th><th className="py-4 px-6">Aset Terpinjam</th><th className="py-4 px-6">Nama Petugas</th><th className="py-4 px-6 text-center">Status</th><th className="py-4 px-6 text-right w-40">Aksi Pengembalian</th>
                        </tr>
                      )}

                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      
                      {/* ISI TAB RENCANA & SELESAI BELI */}
                      {['Rencana', 'Selesai'].includes(activeSubTab) && pembelianList.filter(b => b.status === activeSubTab).map(beli => (
                        <tr key={beli.id} className="hover:bg-green-50/20 transition-colors">
                          <td className="py-4 px-6 font-medium text-slate-500">{new Date(beli.timestamp).toLocaleDateString('id-ID')}</td>
                          <td className="py-4 px-6"><div className="font-extrabold text-slate-800">{beli.namaBarang}</div><div className="text-[10px] uppercase text-slate-400 font-bold mt-0.5">{beli.jenis === 'aset' ? 'Aset Tetap' : 'Habis Pakai'}</div></td>
                          <td className="py-4 px-6 text-center font-mono font-black text-[#107C41] bg-emerald-50/30">+{beli.jumlah} <span className="text-xs text-slate-500 font-sans font-semibold">{beli.satuan}</span></td>
                          <td className="py-4 px-6 text-center">
                            {beli.status === 'Selesai' ? <span className="inline-flex items-center gap-1.5 bg-[#E6F4EA] text-[#137333] px-3 py-1.5 rounded-full text-[9px] font-extrabold uppercase border border-[#CEEAD6]">Gudang</span> : <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full text-[9px] font-extrabold uppercase border border-amber-200 animate-pulse">Proses</span>}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex justify-end gap-1.5">
                              {beli.status === 'Rencana' && (
                                <>
                                  <button onClick={() => openSelesaiBeli(beli)} title="Barang Diterima" className="w-8 h-8 flex items-center justify-center text-emerald-600 bg-emerald-50 hover:bg-emerald-500 hover:text-white rounded-xl transition-all border border-emerald-200">✅</button>
                                  <button onClick={() => openEditBeli(beli)} title="Edit" className="w-8 h-8 flex items-center justify-center text-blue-600 bg-blue-50 hover:bg-blue-500 hover:text-white rounded-xl transition-all border border-blue-200">✏️</button>
                                </>
                              )}
                              <button onClick={() => openDeleteLogistik('pembelian', beli.id, beli.namaBarang)} title="Hapus" className="w-8 h-8 flex items-center justify-center text-red-500 bg-red-50 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-200">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {/* ISI TAB PEMAKAIAN KELUAR */}
                      {activeSubTab === 'Pemakaian' && pemakaianList.map(pakai => (
                        <tr key={pakai.id} className="hover:bg-amber-50/20 transition-colors">
                          <td className="py-4 px-6 font-medium text-slate-500 text-xs">{new Date(pakai.timestamp).toLocaleString('id-ID', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}</td>
                          <td className="py-4 px-6 font-extrabold text-slate-800">{pakai.namaBarang}</td>
                          <td className="py-4 px-6 text-center font-mono font-black text-amber-600 bg-amber-50/50">-{pakai.jumlah} <span className="text-[10px] text-slate-500 font-sans font-semibold">{pakai.satuan}</span></td>
                          <td className="py-4 px-6 font-medium text-slate-600 italic text-xs">{pakai.keterangan || '-'}</td>
                          <td className="py-4 px-6 text-right">
                            <button onClick={() => openDeleteLogistik('pemakaian', pakai.id, pakai.namaBarang)} title="Hapus Log" className="w-8 h-8 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all">🗑️</button>
                          </td>
                        </tr>
                      ))}

                      {/* ISI TAB PEMINJAMAN ASET */}
                      {activeSubTab === 'Peminjaman' && peminjamanList.map(pinjam => (
                        <tr key={pinjam.id} className={`transition-colors ${pinjam.status === 'Dikembalikan' ? 'bg-slate-50 opacity-60' : 'hover:bg-indigo-50/20'}`}>
                          <td className="py-4 px-6 font-medium text-slate-500 text-xs">
                            <div className="font-bold text-slate-700">{new Date(pinjam.timestamp).toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'})}</div>
                            {pinjam.status === 'Dikembalikan' && <div className="text-[9px] text-emerald-600 mt-1 flex flex-col"><span>Kembali tgl:</span><span>{new Date(pinjam.waktuKembali).toLocaleDateString('id-ID')}</span></div>}
                          </td>
                          <td className="py-4 px-6">
                            <div className="font-extrabold text-slate-800">{pinjam.namaBarang}</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">{pinjam.jumlah} {pinjam.satuan}</div>
                          </td>
                          <td className="py-4 px-6 font-bold text-indigo-700 uppercase">{pinjam.namaPeminjam}</td>
                          <td className="py-4 px-6 text-center">
                            {pinjam.status === 'Dipinjam' ? <span className="bg-amber-100 text-amber-700 text-[10px] px-3 py-1.5 rounded-full font-black tracking-widest border border-amber-200">OUT/DIPINJAM</span> : <span className="bg-slate-200 text-slate-500 text-[10px] px-3 py-1.5 rounded-full font-black tracking-widest border border-slate-300">DIKEMBALIKAN</span>}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex justify-end gap-1.5">
                              {pinjam.status === 'Dipinjam' && (
                                <button onClick={() => openKembalikanAset(pinjam)} className="bg-teal-50 hover:bg-teal-600 text-teal-700 hover:text-white border border-teal-200 font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm">📥 Terima</button>
                              )}
                              <button onClick={() => openDeleteLogistik('peminjaman', pinjam.id, pinjam.namaBarang)} title="Hapus Riwayat" className="w-8 h-8 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))}

                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
} 