import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { collection, getDocs, deleteDoc, doc, updateDoc, query, orderBy, addDoc } from 'firebase/firestore';
import Modal from '../components/Modal';

export default function Absensi() {
  const { user } = useAuth();
  const [absensiList, setAbsensiList] = useState([]);
  const [tahaps, setTahaps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [modal, setModal] = useState({ isOpen: false, action: '', title: '', message: '', targetId: null, targetData: null, isDestructive: false });
  const [editForm, setEditForm] = useState({ namaLengkap: '', instansi: '', jabatan: '' });
  const [selectedBiodata, setSelectedBiodata] = useState(null);

  // STATE UNTUK FITUR TARIK DATA LAMA
  const [isTarikModalOpen, setIsTarikModalOpen] = useState(false);
  const [tarikTahapTarget, setTarikTahapTarget] = useState('');
  const [tarikSelectedUsers, setTarikSelectedUsers] = useState([]);
  const [uniquePastUsers, setUniquePastUsers] = useState([]);
  const [isTarikSubmitting, setIsTarikSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const tahapSnap = await getDocs(collection(db, 'master_tahaps'));
      const listTahap = tahapSnap.docs.map(d => d.data().name);
      listTahap.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      setTahaps(listTahap);

      const q = query(collection(db, 'absensi'), orderBy('timestamp', 'desc'));
      const snap = await getDocs(q);
      const dataAbsensi = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAbsensiList(dataAbsensi);

      // Siapkan data unik untuk modal Tarik Data (hanya ambil 1 data terbaru per nama)
      const mapUnik = new Map();
      dataAbsensi.forEach(item => {
        if (!mapUnik.has(item.namaLengkap.toLowerCase())) {
          mapUnik.set(item.namaLengkap.toLowerCase(), item);
        }
      });
      setUniquePastUsers(Array.from(mapUnik.values()));

    } catch (error) {
      console.error("Gagal memuat data:", error);
    }
    setIsLoading(false);
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/absen`;
    navigator.clipboard.writeText(link);
    alert("✅ Link Absensi Publik berhasil disalin!\nSilakan bagikan ke peserta.");
  };

  const handlePrint = () => { window.print(); };

  const openEditModal = (e, item) => {
    e.stopPropagation();
    setEditForm({ namaLengkap: item.namaLengkap, instansi: item.instansi, jabatan: item.jabatan });
    setModal({ isOpen: true, action: 'edit', title: 'Edit Data Kehadiran', message: '', targetId: item.id, targetData: item, isDestructive: false });
  };

  const openDeleteModal = (e, item) => {
    e.stopPropagation();
    setModal({ isOpen: true, action: 'hapus', title: 'Hapus Data Kehadiran?', message: `Yakin ingin menghapus ${item.namaLengkap} dari daftar hadir?`, targetId: item.id, targetData: item, isDestructive: true });
  };

  const handleModalConfirm = async () => {
    const { action, targetId } = modal;
    try {
      if (action === 'hapus') {
        await deleteDoc(doc(db, 'absensi', targetId));
      } else if (action === 'edit') {
        await updateDoc(doc(db, 'absensi', targetId), {
          namaLengkap: editForm.namaLengkap,
          instansi: editForm.instansi,
          jabatan: editForm.jabatan
        });
      }
      setModal({ ...modal, isOpen: false });
      fetchData(); 
    } catch (error) {
      alert("Terjadi kesalahan sistem.");
      console.error(error);
    }
  };

  // LOGIKA EKSEKUSI TARIK DATA
  const handleTarikDataSubmit = async () => {
    if (!tarikTahapTarget) return alert("Pilih Tahap target terlebih dahulu!");
    if (tarikSelectedUsers.length === 0) return alert("Pilih minimal 1 peserta untuk ditarik!");
    
    setIsTarikSubmitting(true);
    try {
      // Duplikasi data peserta yang dipilih ke tahap baru dengan timestamp hari ini
      const promises = tarikSelectedUsers.map(user => {
        return addDoc(collection(db, 'absensi'), {
          namaLengkap: user.namaLengkap,
          tempatLahir: user.tempatLahir || '',
          tanggalLahir: user.tanggalLahir || '',
          umur: user.umur || 0,
          instansi: user.instansi,
          jabatan: user.jabatan,
          alamat: user.alamat || '',
          tahap: tarikTahapTarget,
          timestamp: new Date().toISOString()
        });
      });
      await Promise.all(promises);
      
      setIsTarikModalOpen(false);
      setTarikSelectedUsers([]);
      setTarikTahapTarget('');
      alert(`✅ Berhasil menarik ${promises.length} data peserta ke ${tarikTahapTarget}!`);
      fetchData();
    } catch (error) {
      console.error("Gagal menarik data", error);
      alert("Gagal menarik data peserta.");
    }
    setIsTarikSubmitting(false);
  };

  const toggleTarikUser = (user) => {
    const isSelected = tarikSelectedUsers.find(u => u.id === user.id);
    if (isSelected) {
      setTarikSelectedUsers(tarikSelectedUsers.filter(u => u.id !== user.id));
    } else {
      setTarikSelectedUsers([...tarikSelectedUsers, user]);
    }
  };

  const formatTanggalClean = (isoString) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans relative">
      
      {/* MODAL BIODATA A4 PRINTABLE */}
      {selectedBiodata && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 flex items-start justify-center p-4 sm:p-8 overflow-y-auto print:p-0 print:bg-white backdrop-blur-sm transition-opacity">
          <div className="bg-white max-w-3xl w-full mt-10 mb-10 rounded-2xl shadow-2xl overflow-hidden print:mt-0 print:shadow-none print:w-full print:max-w-none print:rounded-none relative print:absolute print:inset-0">
            <div className="p-4 bg-slate-100 border-b border-slate-200 flex justify-end gap-3 print:hidden sticky top-0 z-10">
              <button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-sm flex items-center gap-2">🖨️ Cetak / Simpan PDF</button>
              <button onClick={() => setSelectedBiodata(null)} className="bg-white hover:bg-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-xl text-sm transition-all border border-slate-300">Tutup</button>
            </div>
            <div className="p-10 sm:p-16 bg-white text-black font-serif print:p-8">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold uppercase tracking-wide">Biodata Peserta Inspeksi</h1>
                <h2 className="text-lg font-semibold uppercase mt-1">Kegiatan Pemeriksaan {selectedBiodata.tahap}</h2>
                <div className="w-full h-1 bg-black mt-6 mb-1"></div>
                <div className="w-full h-0.5 bg-black"></div>
              </div>
              <div className="space-y-6 mt-10 text-lg">
                <div className="flex"><div className="w-52 font-bold">Nama Lengkap</div><div className="w-4">:</div><div className="flex-1 font-semibold uppercase">{selectedBiodata.namaLengkap}</div></div>
                <div className="flex"><div className="w-52 font-bold">Tempat, Tanggal Lahir</div><div className="w-4">:</div><div className="flex-1">{selectedBiodata.tempatLahir || '-'}, {selectedBiodata.tanggalLahir ? new Date(selectedBiodata.tanggalLahir).toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'}) : '-'}</div></div>
                <div className="flex"><div className="w-52 font-bold">Umur saat ini</div><div className="w-4">:</div><div className="flex-1">{selectedBiodata.umur || '-'} Tahun</div></div>
                <div className="flex"><div className="w-52 font-bold">Instansi</div><div className="w-4">:</div><div className="flex-1 uppercase">{selectedBiodata.instansi}</div></div>
                <div className="flex"><div className="w-52 font-bold">Jabatan</div><div className="w-4">:</div><div className="flex-1 uppercase">{selectedBiodata.jabatan}</div></div>
                <div className="flex"><div className="w-52 font-bold">Alamat Domisili</div><div className="w-4">:</div><div className="flex-1 leading-relaxed">{selectedBiodata.alamat}</div></div>
                <div className="flex"><div className="w-52 font-bold">Tanggal Kehadiran</div><div className="w-4">:</div><div className="flex-1">{formatTanggalClean(selectedBiodata.timestamp)}</div></div>
              </div>
              <div className="mt-32 flex justify-end">
                <div className="text-center"><p className="mb-24">Mengetahui & Menyetujui,</p><p className="font-bold underline uppercase">{selectedBiodata.namaLengkap}</p><p className="text-sm mt-1">{selectedBiodata.jabatan}</p></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT HAPUS */}
      <div className="print:hidden">
        <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.action === 'edit' ? 'custom' : 'confirm'} onConfirm={handleModalConfirm} onCancel={() => setModal({ ...modal, isOpen: false })} confirmText={modal.action === 'hapus' ? 'Ya, Hapus' : 'Simpan Perubahan'} isDestructive={modal.isDestructive}>
          {modal.action === 'edit' && (
            <div className="space-y-4">
              <div><label className="text-xs font-bold text-slate-500 uppercase ml-1">Nama Lengkap</label><input type="text" value={editForm.namaLengkap} onChange={e => setEditForm({...editForm, namaLengkap: e.target.value})} className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase ml-1">Instansi</label><input type="text" value={editForm.instansi} onChange={e => setEditForm({...editForm, instansi: e.target.value})} className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase ml-1">Jabatan</label><input type="text" value={editForm.jabatan} onChange={e => setEditForm({...editForm, jabatan: e.target.value})} className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div>
            </div>
          )}
        </Modal>
      </div>

      {/* MODAL TARIK DATA PESERTA LAMA */}
      <div className="print:hidden">
        <Modal isOpen={isTarikModalOpen} title="Tarik Data Peserta Lama" message="Pilih peserta yang sudah pernah hadir sebelumnya untuk dimasukkan ke tahap baru." type="custom" onConfirm={handleTarikDataSubmit} onCancel={() => setIsTarikModalOpen(false)} confirmText={isTarikSubmitting ? "Memproses..." : "Tarik Data Terpilih"} isDestructive={false}>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Masukkan ke Tahap <span className="text-red-500">*</span></label>
              <select value={tarikTahapTarget} onChange={e => setTarikTahapTarget(e.target.value)} className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 font-bold text-slate-800">
                <option value="">-- Pilih Tahap Target --</option>
                {tahaps.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            
            <div className="pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1 block mb-2">Pilih Peserta Sebelumnya <span className="text-blue-500">({tarikSelectedUsers.length} Terpilih)</span></label>
              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 p-2 space-y-1">
                {uniquePastUsers.map(u => (
                  <label key={u.id} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-lg hover:border-blue-200 cursor-pointer transition-all shadow-sm">
                    <input type="checkbox" checked={!!tarikSelectedUsers.find(x => x.id === u.id)} onChange={() => toggleTarikUser(u)} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                    <div className="flex-1">
                      <div className="text-sm font-bold text-slate-800">{u.namaLengkap}</div>
                      <div className="text-xs text-slate-500">{u.instansi} - {u.jabatan}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      </div>

      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Data Kehadiran</h1>
          <p className="text-slate-500 mt-1">Daftar kartu per tahap diambil otomatis dari konfigurasi sistem.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* TOMBOL TARIK DATA */}
          <button onClick={() => setIsTarikModalOpen(true)} className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-bold px-5 py-3 rounded-xl transition-all shadow-sm text-sm whitespace-nowrap">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Tarik Data Lama
          </button>
          
          <button onClick={handleCopyLink} className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold px-5 py-3 rounded-xl transition-all shadow-sm text-sm whitespace-nowrap">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" /><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" /></svg>
            Salin Link Absen
          </button>
        </div>
      </div>
      
      <div className="space-y-4 print:hidden">
        {isLoading ? <p className="text-center text-blue-500 py-10 animate-pulse font-medium">Memuat data...</p> : (
          tahaps.map((tahap) => {
            const pesertaDiTahapIni = absensiList.filter(item => item.tahap === tahap);
            return (
              <details key={tahap} className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:border-blue-300 transition-colors" open={pesertaDiTahapIni.length > 0}>
                <summary className="font-bold cursor-pointer p-4 sm:p-5 flex items-center justify-between bg-slate-50/50 outline-none select-none hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shadow-inner shrink-0 text-xl">👥</span>
                    <div>
                      <h3 className="text-slate-800 tracking-wide uppercase text-base sm:text-lg">{tahap}</h3>
                      <p className="text-xs font-semibold text-slate-500 font-mono mt-0.5">{pesertaDiTahapIni.length} Orang Hadir</p>
                    </div>
                  </div>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform duration-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </span>
                </summary>

                <div className="p-0 sm:p-2 border-t border-slate-100">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 bg-white">
                      <thead className="bg-[#F8F9FA] border-y border-slate-100">
                        <tr className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                          <th className="py-4 px-6 w-16 text-center">No</th>
                          <th className="py-4 px-6">Nama & Umur</th>
                          <th className="py-4 px-6">Instansi & Jabatan</th>
                          <th className="py-4 px-6">Tanggal Absen</th>
                          {user?.role === 'admin' && <th className="py-4 px-6 text-right">Aksi</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {pesertaDiTahapIni.map((item, index) => {
                          return (
                            <tr key={item.id} onClick={() => setSelectedBiodata(item)} className="hover:bg-blue-50/50 transition-colors cursor-pointer" title="Klik untuk buka Format Biodata A4">
                              <td className="py-4 px-6 text-center font-bold text-slate-400">{index + 1}</td>
                              <td className="py-4 px-6">
                                <div className="font-extrabold text-[#1A73E8]">{item.namaLengkap}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{item.umur || '-'} Tahun</div>
                              </td>
                              <td className="py-4 px-6">
                                <div className="font-bold text-slate-700">{item.instansi}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{item.jabatan}</div>
                              </td>
                              <td className="py-4 px-6 font-semibold text-slate-500 text-xs">
                                {formatTanggalClean(item.timestamp)}
                              </td>
                              {user?.role === 'admin' && (
                                <td className="py-4 px-6 text-right">
                                  <div className="flex justify-end gap-2">
                                    <button onClick={(e) => openEditModal(e, item)} className="text-blue-600 hover:bg-blue-50 font-bold text-xs px-3 py-2 rounded-xl transition-all border border-transparent hover:border-blue-100">Edit</button>
                                    <button onClick={(e) => openDeleteModal(e, item)} className="text-red-600 hover:bg-red-50 font-bold text-xs px-3 py-2 rounded-xl transition-all border border-transparent hover:border-red-100">Hapus</button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                        {pesertaDiTahapIni.length === 0 && (
                          <tr><td colSpan={user?.role === 'admin' ? "5" : "4"} className="py-8 text-center text-slate-400 font-medium">Belum ada peserta di tahap ini.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            );
          })
        )}
      </div>
    </div>
  );
}