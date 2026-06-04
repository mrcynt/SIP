import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc, setDoc } from 'firebase/firestore'; // <-- TAMBAH getDoc & setDoc
import { logActivity } from '../utils/auditLogger';
import Modal from '../components/Modal';

export default function Admin() {
  const { user } = useAuth();
  
  // TAB BARU: DITAMBAHKAN 'settings'
  const [activeTab, setActiveTab] = useState('master');

  const [units, setUnits] = useState([]);
  const [tahaps, setTahaps] = useState([]);
  const [users, setUsers] = useState([]);
  const [targets, setTargets] = useState([]); 
  const [unitGrandTotals, setUnitGrandTotals] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const [newUnit, setNewUnit] = useState('');
  const [newTahap, setNewTahap] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('pemeriksa');
  const [targetUnit, setTargetUnit] = useState('');
  const [targetTahap, setTargetTahap] = useState('');
  const [targetJumlah, setTargetJumlah] = useState('');
  const [assignments, setAssignments] = useState({});

  // STATE BARU KHUSUS UNTUK PENGATURAN API URL
  const [driveApiUrl, setDriveApiUrl] = useState('');

  const [modal, setModal] = useState({
    isOpen: false, collection: '', title: '', message: '', targetId: null, targetName: '', type: 'confirm', showCancel: true, confirmText: 'Ya, Hapus'
  });

  useEffect(() => { fetchAllData(); }, [activeTab]);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      // Fetch Master Units
      const unitSnap = await getDocs(collection(db, 'master_units'));
      const unitData = unitSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.name.localeCompare(b.name));
      setUnits(unitData);
      
      const gt = {}; unitData.forEach(u => gt[u.id] = u.grandTotal || 0); setUnitGrandTotals(gt);
      
      // Fetch Master Tahap
      const tahapSnap = await getDocs(collection(db, 'master_tahaps'));
      setTahaps(tahapSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.name.localeCompare(b.name)));

      // Fetch Users & Targets based on active tab
      if (activeTab === 'users' || activeTab === 'assignments') {
        const userSnap = await getDocs(collection(db, 'users'));
        const userData = userSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.username.localeCompare(b.username));
        setUsers(userData);
        const initialAssignments = {};
        userData.forEach(u => { if(u.role === 'pemeriksa') initialAssignments[u.id] = { unit: u.assignedUnit || '', tahap: u.assignedTahap || '' }; });
        setAssignments(initialAssignments);
      } else if (activeTab === 'targets') {
        const targetSnap = await getDocs(collection(db, 'master_targets'));
        setTargets(targetSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.id !== 'GLOBAL_PROJECT'));
      } else if (activeTab === 'settings') {
        // FETCH PENGATURAN SISTEM DARI FIRESTORE
        const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
        if (settingsSnap.exists()) {
          setDriveApiUrl(settingsSnap.data().driveApiUrl || '');
        }
      }
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
  };

  const handleAddUnit = async (e) => { 
    e.preventDefault(); if (!newUnit) return; 
    await addDoc(collection(db, 'master_units'), { name: newUnit.trim().toUpperCase(), grandTotal: 0 }); 
    logActivity(user.username, `Menambahkan Unit: ${newUnit.trim().toUpperCase()}`);
    setNewUnit(''); fetchAllData(); 
  };

  const handleAddTahap = async (e) => { 
    e.preventDefault(); if (!newTahap) return;
    await addDoc(collection(db, 'master_tahaps'), { name: newTahap.trim() }); 
    logActivity(user.username, `Menambahkan Tahap: ${newTahap.trim()}`);
    setNewTahap(''); fetchAllData(); 
  };

  const handleAddUser = async (e) => { 
    e.preventDefault(); if (!newUsername || !newPassword) return;
    await addDoc(collection(db, 'users'), { username: newUsername.trim().toLowerCase(), password: newPassword.trim(), role: newUserRole, assignedUnit: '', assignedTahap: '' }); 
    logActivity(user.username, `Membuat akun: ${newUsername.trim().toLowerCase()} (${newUserRole})`);
    setNewUsername(''); setNewPassword(''); fetchAllData(); 
  };

  const handleAddTarget = async (e) => {
    e.preventDefault();
    if (!targetUnit || !targetTahap || !targetJumlah) return;
    await addDoc(collection(db, 'master_targets'), { unit: targetUnit, tahap: targetTahap, jumlah: parseInt(targetJumlah, 10) });
    logActivity(user.username, `Menambahkan target baru: ${targetUnit} - ${targetTahap}`);
    setTargetUnit(''); setTargetTahap(''); setTargetJumlah(''); fetchAllData();
  };

  const handleAssignTask = async (userId, targetUsername) => { 
    try { 
      await updateDoc(doc(db, 'users', userId), { assignedUnit: assignments[userId].unit, assignedTahap: assignments[userId].tahap }); 
      logActivity(user.username, `Mengubah penugasan ${targetUsername}`);
      setModal({ isOpen: true, type: 'success', title: 'Tugas Dikunci!', message: `Hak akses lapangan untuk petugas ${targetUsername} berhasil diperbarui.`, showCancel: false, confirmText: 'Tutup' });
      fetchAllData(); 
    } catch (err) { console.error(err); } 
  };

  const handleUpdateGrandTotal = async (unitId, unitName) => {
    try {
      const newValue = parseInt(unitGrandTotals[unitId], 10) || 0;
      await updateDoc(doc(db, 'master_units', unitId), { grandTotal: newValue });
      logActivity(user.username, `Mengubah Grand Total unit ${unitName} menjadi ${newValue}`);
      setModal({ isOpen: true, type: 'success', title: 'Grand Total Tersimpan', message: `Target keseluruhan untuk unit ${unitName} berhasil diubah menjadi ${newValue}.`, showCancel: false, confirmText: 'Tutup' });
      fetchAllData();
    } catch (error) { console.error(error); }
  };

  // ==========================================
  // FUNGSI SIMPAN PENGATURAN API URL BARU
  // ==========================================
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      // setDoc dengan merge: true akan membuat dokumen baru jika belum ada
      await setDoc(doc(db, 'settings', 'general'), { 
        driveApiUrl: driveApiUrl.trim() 
      }, { merge: true });
      
      logActivity(user.username, `Memperbarui URL API Google Drive`);
      setModal({ 
        isOpen: true, type: 'success', title: 'Sistem Terhubung!', 
        message: 'Tautan Google Drive berhasil diperbarui secara global. Semua upload harian kini akan mengarah ke server baru ini.', 
        showCancel: false, confirmText: 'Oke, Paham' 
      });
    } catch (error) {
      console.error(error);
      alert("Gagal menyimpan pengaturan.");
    }
  };

  const confirmDelete = (collectionName, id, itemName) => {
    setModal({
      isOpen: true, type: 'confirm', collection: collectionName, targetId: id, targetName: itemName,
      title: 'Konfirmasi Penghapusan', message: `Apakah Anda yakin ingin menghapus "${itemName}" secara permanen dari sistem?`, showCancel: true, confirmText: 'Ya, Hapus', isDestructive: true
    });
  };

  const handleModalConfirm = async () => {
    if (modal.type === 'success') {
      setModal(prev => ({ ...prev, isOpen: false }));
      return;
    }
    await deleteDoc(doc(db, modal.collection, modal.targetId));
    logActivity(user.username, `Menghapus data dari ${modal.collection}: ${modal.targetName}`);
    setModal(prev => ({ ...prev, isOpen: false }));
    fetchAllData();
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans relative">
      <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onConfirm={handleModalConfirm} onCancel={() => setModal({ ...modal, isOpen: false })} confirmText={modal.confirmText} isDestructive={modal.isDestructive} showCancel={modal.showCancel} />

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Konfigurasi Sistem</h1>
        <p className="text-slate-500 mt-1">Kelola master data, target kerja, hak akses, dan pengaturan integrasi aplikasi.</p>
      </div>

      {/* MENU NAVIGASI TAB */}
      <div className="flex space-x-2 p-1.5 bg-slate-200/50 rounded-2xl mb-8 overflow-x-auto w-full lg:w-fit scrollbar-hide border border-slate-100">
        {['master', 'targets', 'users', 'assignments', 'settings'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all capitalize whitespace-nowrap ${activeTab === tab ? 'bg-white text-[#1A73E8] shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}>
            {tab === 'master' ? 'Master Kategori' : tab === 'targets' ? 'Target & KPI' : tab === 'users' ? 'Akun Login' : tab === 'assignments' ? 'Penugasan Lapangan' : '⚙️ Sistem'}
          </button>
        ))}
      </div>

      {isLoading ? <div className="p-12 text-center text-[#4285F4] animate-pulse font-medium">Menyesuaikan konfigurasi...</div> : (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          {/* TAB MASTER KATEGORI */}
          {activeTab === 'master' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               {/* ... (Isi tab master tidak ada yang diubah) ... */}
               <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
                 <h2 className="font-extrabold mb-6 text-slate-800 text-lg flex items-center gap-2"><span className="text-xl">📦</span> Kelola Unit / Kategori</h2>
                 <form onSubmit={handleAddUnit} className="flex gap-3 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-100"><input type="text" value={newUnit} onChange={e=>setNewUnit(e.target.value)} placeholder="Contoh: BRACKET" className="flex-1 border-0 bg-white shadow-sm p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4285F4]/20 transition-all font-bold text-slate-700 uppercase" required/><button className="bg-[#1A73E8] hover:bg-[#1557B0] text-white px-6 rounded-xl text-sm font-bold transition-colors shadow-sm">Tambah</button></form>
                 <div className="space-y-2">{units.map(u => (<div key={u.id} className="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 hover:shadow-sm transition-all group"><span className="text-sm font-extrabold text-slate-700">{u.name}</span><button onClick={()=>confirmDelete('master_units', u.id, u.name)} className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-[#EA4335] opacity-0 group-hover:opacity-100 hover:bg-[#EA4335] hover:text-white transition-all">✕</button></div>))}{units.length === 0 && <p className="text-center text-slate-400 text-sm italic py-4">Belum ada unit terdaftar.</p>}</div>
               </div>
               <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
                 <h2 className="font-extrabold mb-6 text-slate-800 text-lg flex items-center gap-2"><span className="text-xl">📂</span> Kelola Tahap</h2>
                 <form onSubmit={handleAddTahap} className="flex gap-3 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-100"><input type="text" value={newTahap} onChange={e=>setNewTahap(e.target.value)} placeholder="Contoh: TAHAP 1" className="flex-1 border-0 bg-white shadow-sm p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4285F4]/20 transition-all font-bold text-slate-700 uppercase" required/><button className="bg-[#1A73E8] hover:bg-[#1557B0] text-white px-6 rounded-xl text-sm font-bold transition-colors shadow-sm">Tambah</button></form>
                 <div className="space-y-2">{tahaps.map(t => (<div key={t.id} className="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 hover:shadow-sm transition-all group"><span className="text-sm font-extrabold text-slate-700">{t.name}</span><button onClick={()=>confirmDelete('master_tahaps', t.id, t.name)} className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-[#EA4335] opacity-0 group-hover:opacity-100 hover:bg-[#EA4335] hover:text-white transition-all">✕</button></div>))}{tahaps.length === 0 && <p className="text-center text-slate-400 text-sm italic py-4">Belum ada tahap terdaftar.</p>}</div>
               </div>
             </div>
          )}

          {/* TAB TARGET KESELURUHAN */}
          {activeTab === 'targets' && (
             <div className="space-y-8">
               {/* ... (Isi tab target tidak ada yang diubah) ... */}
               <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"><div className="mb-6"><h2 className="text-xl font-bold text-slate-900 mb-1">Target Keseluruhan (Grand Total)</h2></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{units.map(u => (<div key={u.id} className="p-5 rounded-2xl border border-slate-200 bg-[#F8F9FA] flex flex-col gap-3 transition-all focus-within:border-[#4285F4] focus-within:shadow-md"><span className="font-extrabold text-slate-800 text-sm uppercase flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#4285F4]"></span> {u.name}</span><div className="flex gap-2"><input type="number" value={unitGrandTotals[u.id] !== undefined ? unitGrandTotals[u.id] : ''} onChange={(e) => setUnitGrandTotals({...unitGrandTotals, [u.id]: e.target.value})} placeholder="0" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-mono font-bold text-[#1A73E8] outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 bg-white transition-all"/><button onClick={() => handleUpdateGrandTotal(u.id, u.name)} className="bg-slate-800 hover:bg-black text-white px-5 rounded-xl text-sm font-bold transition-colors shadow-sm">Save</button></div></div>))}</div></div>
               <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"><h2 className="text-xl font-bold text-slate-900 mb-6">Target Spesifik per Tahap</h2><form onSubmit={handleAddTarget} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-8 bg-slate-50 p-5 rounded-2xl border border-slate-100"><select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 font-medium" required><option value="">Pilih Unit...</option>{units.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}</select><select value={targetTahap} onChange={(e) => setTargetTahap(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 font-medium" required><option value="">Pilih Tahap...</option>{tahaps.map(tahap => <option key={tahap.id} value={tahap.name}>{tahap.name}</option>)}</select><input type="number" value={targetJumlah} onChange={(e) => setTargetJumlah(e.target.value)} placeholder="Jumlah Target" className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 font-mono font-bold" min="1" required /><button type="submit" className="bg-[#34A853] hover:bg-[#2B8A44] text-white font-bold text-sm rounded-xl transition-colors shadow-sm">Tambah Target</button></form><div className="overflow-x-auto border border-slate-200 rounded-2xl"><table className="w-full text-left text-sm text-slate-600 bg-white"><thead className="bg-[#F8F9FA] border-b border-slate-200"><tr className="text-xs font-bold text-slate-500 uppercase tracking-wider"><th className="py-4 px-6">Unit</th><th className="py-4 px-6">Tahap</th><th className="py-4 px-6 text-center">Jumlah Target</th><th className="py-4 px-6 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{targets.map(t => (<tr key={t.id} className="hover:bg-blue-50/30 transition-colors"><td className="py-4 px-6 font-extrabold text-slate-800">{t.unit}</td><td className="py-4 px-6 font-medium">{t.tahap}</td><td className="py-4 px-6 text-center font-mono font-black text-[#1A73E8] bg-blue-50/50">{t.jumlah}</td><td className="py-4 px-6 text-right"><button onClick={() => confirmDelete('master_targets', t.id, `Target ${t.unit} - ${t.tahap}`)} className="text-[#EA4335] hover:text-white font-bold text-xs bg-[#FCE8E6] hover:bg-[#EA4335] px-4 py-2 rounded-xl transition-all shadow-sm">Hapus</button></td></tr>))}{targets.length === 0 && <tr><td colSpan="4" className="py-8 text-center text-slate-400">Belum ada target tahap spesifik.</td></tr>}</tbody></table></div></div>
             </div>
          )}

          {/* TAB AKUN LOGIN */}
          {activeTab === 'users' && (
             <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
                {/* ... (Isi tab users tidak ada yang diubah) ... */}
                <div className="mb-6"><h2 className="text-xl font-bold text-slate-900">Manajemen Akun Login</h2></div><form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-8 bg-slate-50 p-5 rounded-2xl border border-slate-100"><input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Username" className="px-5 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 lowercase" required /><input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Tentukan Password" className="px-5 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100" required /><select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)} className="px-5 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 font-medium"><option value="pemeriksa">Pemeriksa Lapangan</option><option value="supervisor">Supervisor</option></select><button type="submit" className="bg-slate-900 hover:bg-black text-white font-bold text-sm rounded-xl transition-colors shadow-sm">Daftarkan Akun</button></form><div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm"><table className="w-full text-left text-sm text-slate-600 bg-white"><thead className="bg-[#F8F9FA] border-b border-slate-200"><tr className="text-xs font-bold text-slate-500 uppercase tracking-wider"><th className="py-4 px-6">Username</th><th className="py-4 px-6">Password Akses</th><th className="py-4 px-6">Peran / Role</th><th className="py-4 px-6 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{users.map(u => (<tr key={u.id} className="hover:bg-blue-50/30 transition-colors"><td className="py-4 px-6 font-extrabold text-slate-800 uppercase flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs">👤</div>{u.username}</td><td className="py-4 px-6"><span className="font-mono text-[#1A73E8] font-bold bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">{u.password}</span></td><td className="py-4 px-6"><span className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${u.role === 'supervisor' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{u.role}</span></td><td className="py-4 px-6 text-right"><button onClick={() => confirmDelete('users', u.id, `Akun ${u.username}`)} className="text-[#EA4335] hover:text-white font-bold text-xs bg-[#FCE8E6] hover:bg-[#EA4335] px-4 py-2 rounded-xl transition-all shadow-sm">Hapus</button></td></tr>))}</tbody></table></div>
             </div>
          )}

          {/* TAB PENUGASAN */}
          {activeTab === 'assignments' && (
             <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
               {/* ... (Isi tab assignments tidak ada yang diubah) ... */}
               <div className="mb-6"><h2 className="text-xl font-bold text-slate-900 mb-1">Penugasan Pemeriksa Lapangan</h2></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">{users.filter(u => u.role === 'pemeriksa').map(u => (<div key={u.id} className="p-5 rounded-3xl border border-blue-100 bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"><div className="mb-5 flex flex-col items-center"><div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-2xl mb-3 shadow-inner group-hover:scale-110 transition-transform">👷</div><h3 className="font-extrabold text-slate-800 uppercase text-lg tracking-wide">{u.username}</h3></div><div className="space-y-3 pt-4 border-t border-slate-100"><select value={assignments[u.id]?.unit || ''} onChange={(e) => setAssignments(p => ({...p, [u.id]: {...p[u.id], unit: e.target.value}}))} className="w-full text-sm border-2 border-slate-100 bg-slate-50 px-4 py-2.5 rounded-xl outline-none focus:border-[#4285F4] focus:bg-white font-medium transition-colors"><option value="">-- Bebas Unit --</option>{units.map(unit => <option key={unit.id} value={unit.name}>{unit.name}</option>)}</select><select value={assignments[u.id]?.tahap || ''} onChange={(e) => setAssignments(p => ({...p, [u.id]: {...p[u.id], tahap: e.target.value}}))} className="w-full text-sm border-2 border-slate-100 bg-slate-50 px-4 py-2.5 rounded-xl outline-none focus:border-[#4285F4] focus:bg-white font-medium transition-colors"><option value="">-- Bebas Tahap --</option>{tahaps.map(tahap => <option key={tahap.id} value={tahap.name}>{tahap.name}</option>)}</select><button onClick={() => handleAssignTask(u.id, u.username)} className="w-full mt-2 py-3 bg-[#E8F0FE] hover:bg-[#1A73E8] text-[#1A73E8] hover:text-white font-bold text-xs rounded-xl transition-colors shadow-sm">Kunci Tugas</button></div></div>))}{users.filter(u => u.role === 'pemeriksa').length === 0 && <p className="text-slate-400 text-sm italic col-span-full py-8 text-center bg-slate-50 rounded-2xl">Belum ada akun Pemeriksa Lapangan.</p>}</div>
             </div>
          )}

          {/* TAB BARU: PENGATURAN SISTEM */}
          {activeTab === 'settings' && (
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)] max-w-3xl">
              <div className="mb-8 border-b border-slate-100 pb-6">
                <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2"><span className="text-2xl">🔗</span> Integrasi Google Drive</h2>
                <p className="text-sm text-slate-500 leading-relaxed">Masukkan tautan (URL) Deployment dari Google Apps Script untuk menghubungkan aplikasi ini dengan akun Google Drive milik Pimpinan atau Perusahaan. Semua foto dan folder akan otomatis dibuat di akun tersebut.</p>
              </div>
              
              <form onSubmit={handleSaveSettings} className="space-y-5">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">URL Google Apps Script (API Web App)</label>
                  <input 
                    type="url" 
                    value={driveApiUrl} 
                    onChange={(e) => setDriveApiUrl(e.target.value)} 
                    placeholder="https://script.google.com/macros/s/.../exec" 
                    className="w-full mt-2 px-5 py-4 bg-[#F8F9FA] border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-[#4285F4] focus:ring-4 focus:ring-blue-50 transition-all font-mono font-medium text-slate-800 placeholder-slate-300" 
                    required 
                  />
                  {driveApiUrl === '' && <p className="text-amber-500 text-xs font-bold mt-2 ml-1">⚠️ URL belum diatur! Fitur simpan ke Drive tidak akan berfungsi.</p>}
                </div>
                
                <div className="pt-4 flex justify-end">
                  <button type="submit" className="bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold text-sm px-8 py-3.5 rounded-xl transition-all shadow-md w-full sm:w-auto">
                    Simpan Pengaturan
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      )}
    </div>
  );
}