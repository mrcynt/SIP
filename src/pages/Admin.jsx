import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc, setDoc, query, orderBy } from 'firebase/firestore'; 
import { logActivity } from '../utils/auditLogger';
import Modal from '../components/Modal';

export default function Admin() {
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState('master');

  const [units, setUnits] = useState([]);
  const [tahaps, setTahaps] = useState([]);
  const [users, setUsers] = useState([]);
  const [targets, setTargets] = useState([]); 
  const [unitGrandTotals, setUnitGrandTotals] = useState({});
  const [absensiList, setAbsensiList] = useState([]); 
  
  // STATE MASTER DOKUMENTASI WAJIB
  const [dokItems, setDokItems] = useState([]);
  const [newDokName, setNewDokName] = useState('');
  const [newDokUnit, setNewDokUnit] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);

  const [newUnit, setNewUnit] = useState('');
  const [newTahap, setNewTahap] = useState('');
  
  const [newUserRole, setNewUserRole] = useState('pemeriksa');
  const [newUserTahap, setNewUserTahap] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [targetUnit, setTargetUnit] = useState('');
  const [targetTahap, setTargetTahap] = useState('');
  const [targetJumlah, setTargetJumlah] = useState('');
  const [assignments, setAssignments] = useState({});

  const [driveApiUrl, setDriveApiUrl] = useState('');

  const [modal, setModal] = useState({ isOpen: false, collection: '', title: '', message: '', targetId: null, targetName: '', type: 'confirm', showCancel: true, confirmText: 'Ya, Hapus' });

  useEffect(() => { fetchAllData(); }, [activeTab]);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const unitSnap = await getDocs(collection(db, 'master_units'));
      const unitData = unitSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.name.localeCompare(b.name));
      setUnits(unitData);
      const gt = {}; unitData.forEach(u => gt[u.id] = u.grandTotal || 0); setUnitGrandTotals(gt);
      
      const tahapSnap = await getDocs(collection(db, 'master_tahaps'));
      setTahaps(tahapSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.name.localeCompare(b.name)));

      if (activeTab === 'users' || activeTab === 'assignments') {
        const userSnap = await getDocs(collection(db, 'users'));
        const userData = userSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.username.localeCompare(b.username));
        setUsers(userData);
        const absenSnap = await getDocs(collection(db, 'absensi'));
        setAbsensiList(absenSnap.docs.map(d => d.data()));
        const initialAssignments = {};
        userData.forEach(u => { if(u.role === 'pemeriksa') initialAssignments[u.id] = { unit: u.assignedUnit || '', tahap: u.assignedTahap || '' }; });
        setAssignments(initialAssignments);
      } else if (activeTab === 'targets') {
        const targetSnap = await getDocs(collection(db, 'master_targets'));
        setTargets(targetSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.id !== 'GLOBAL_PROJECT'));
      } else if (activeTab === 'settings') {
        const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
        if (settingsSnap.exists()) setDriveApiUrl(settingsSnap.data().driveApiUrl || '');
      } else if (activeTab === 'dokumentasi') {
        const dokQ = query(collection(db, 'dokumentasi_wajib'), orderBy('timestamp', 'asc'));
        const dokSnap = await getDocs(dokQ);
        setDokItems(dokSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
  };

  const handleAddDokItem = async (e) => {
    e.preventDefault(); 
    if (!newDokName || !newDokUnit) return;
    await addDoc(collection(db, 'dokumentasi_wajib'), { name: newDokName.trim(), unit: newDokUnit, timestamp: new Date().toISOString() });
    logActivity(user.username, `Menambahkan item Dokumentasi ${newDokUnit}: ${newDokName.trim()}`);
    setNewDokName(''); fetchAllData();
  };

  const handleAddUnit = async (e) => { e.preventDefault(); if (!newUnit) return; await addDoc(collection(db, 'master_units'), { name: newUnit.trim().toUpperCase(), grandTotal: 0 }); logActivity(user.username, `Menambahkan Unit: ${newUnit.trim().toUpperCase()}`); setNewUnit(''); fetchAllData(); };
  const handleAddTahap = async (e) => { e.preventDefault(); if (!newTahap) return; await addDoc(collection(db, 'master_tahaps'), { name: newTahap.trim() }); logActivity(user.username, `Menambahkan Tahap: ${newTahap.trim()}`); setNewTahap(''); fetchAllData(); };

  const handleAddUser = async (e) => { 
    e.preventDefault(); if (!newUsername || !newPassword) return;
    const finalUsername = newUsername.trim().toLowerCase().replace(/\s+/g, '');
    const realName = newUserRole === 'pemeriksa' ? newUsername : '';
    const existingUser = users.find(u => u.username === finalUsername);

    if (existingUser) {
      let riwayatBaru = existingUser.riwayatTahap || [];
      if (existingUser.assignedTahap && !riwayatBaru.includes(existingUser.assignedTahap)) riwayatBaru.push(existingUser.assignedTahap);
      if (newUserTahap && !riwayatBaru.includes(newUserTahap)) riwayatBaru.push(newUserTahap);

      await updateDoc(doc(db, 'users', existingUser.id), { password: newPassword.trim(), assignedTahap: newUserRole === 'pemeriksa' ? newUserTahap : existingUser.assignedTahap, riwayatTahap: riwayatBaru, isActive: true, assignedUnit: '' });
      logActivity(user.username, `Memperbarui akun & memindahkan tahap: ${finalUsername}`);
    } else {
      await addDoc(collection(db, 'users'), { username: finalUsername, namaLengkap: realName, password: newPassword.trim(), role: newUserRole, isActive: true, assignedUnit: '', assignedTahap: newUserRole === 'pemeriksa' ? newUserTahap : '', riwayatTahap: newUserRole === 'pemeriksa' && newUserTahap ? [newUserTahap] : [] }); 
      logActivity(user.username, `Membuat akun: ${finalUsername} (${newUserRole})`);
    }
    setNewUsername(''); setNewPassword(''); setNewUserTahap(''); fetchAllData(); 
  };

  const handleToggleStatus = async (userId, currentStatus, username) => { try { const newStatus = currentStatus === false ? true : false; await updateDoc(doc(db, 'users', userId), { isActive: newStatus }); logActivity(user.username, `Mengubah status akun ${username} menjadi ${newStatus ? 'Aktif' : 'Suspend'}`); fetchAllData(); } catch (error) { console.error(error); } };
  const handleAssignTask = async (userId, targetUsername) => { try { await updateDoc(doc(db, 'users', userId), { assignedUnit: assignments[userId].unit }); logActivity(user.username, `Mengubah penugasan unit ${targetUsername}`); setModal({ isOpen: true, type: 'success', title: 'Tugas Dikunci!', message: `Hak akses lapangan untuk petugas ${targetUsername} berhasil diperbarui.`, showCancel: false, confirmText: 'Tutup' }); fetchAllData(); } catch (err) { console.error(err); } };

  const handleSelesaikanTahap = async (tahapName) => {
    if(!window.confirm(`PERINGATAN!\n\nApakah Anda yakin ingin menyelesaikan ${tahapName}?`)) return;
    setIsLoading(true);
    try {
      const usersToSuspend = users.filter(u => u.role === 'pemeriksa' && u.assignedTahap === tahapName);
      const promises = usersToSuspend.map(u => updateDoc(doc(db, 'users', u.id), { isActive: false, assignedUnit: '' }));
      await Promise.all(promises);
      logActivity(user.username, `Menyelesaikan penugasan ${tahapName} dan membekukan akses lapangan`);
      alert(`✅ ${tahapName} dinyatakan SELESAI!\nAkses seluruh pemeriksa pada tahap ini telah ditutup.`); fetchAllData();
    } catch (error) { console.error(error); alert("Terjadi kesalahan sistem."); setIsLoading(false); }
  };

  const handleUpdateGrandTotalExecute = async (unitId, unitName) => { try { const newValue = parseInt(unitGrandTotals[unitId], 10) || 0; await updateDoc(doc(db, 'master_units', unitId), { grandTotal: newValue }); logActivity(user.username, `Mengubah Grand Total unit ${unitName} menjadi ${newValue}`); setModal({ isOpen: true, type: 'success', title: 'Grand Total Tersimpan', message: `Target keseluruhan untuk unit ${unitName} berhasil diubah menjadi ${newValue}.`, showCancel: false, confirmText: 'Tutup' }); fetchAllData(); } catch (error) { console.error(error); } };
  const handleSaveSettings = async (e) => { e.preventDefault(); try { await setDoc(doc(db, 'settings', 'general'), { driveApiUrl: driveApiUrl.trim() }, { merge: true }); logActivity(user.username, `Memperbarui URL API Google Drive`); setModal({ isOpen: true, type: 'success', title: 'Sistem Terhubung!', message: 'Tautan Google Drive berhasil diperbarui.', showCancel: false, confirmText: 'Oke, Paham' }); } catch (error) { alert("Gagal menyimpan pengaturan."); } };
  const handleAddTargetExecute = async (e) => { e.preventDefault(); if (!targetUnit || !targetTahap || !targetJumlah) return; await addDoc(collection(db, 'master_targets'), { unit: targetUnit, tahap: targetTahap, jumlah: parseInt(targetJumlah, 10) }); logActivity(user.username, `Menambahkan target baru: ${targetUnit} - ${targetTahap}`); setTargetUnit(''); setTargetTahap(''); setTargetJumlah(''); fetchAllData(); };

  const confirmDelete = (collectionName, id, itemName) => { setModal({ isOpen: true, type: 'confirm', collection: collectionName, targetId: id, targetName: itemName, title: 'Konfirmasi Penghapusan', message: `Apakah Anda yakin ingin menghapus "${itemName}" secara permanen?`, showCancel: true, confirmText: 'Ya, Hapus', isDestructive: true }); };
  const handleModalConfirm = async () => { if (modal.type === 'success') { setModal(prev => ({ ...prev, isOpen: false })); return; } await deleteDoc(doc(db, modal.collection, modal.targetId)); logActivity(user.username, `Menghapus data dari ${modal.collection}: ${modal.targetName}`); setModal(prev => ({ ...prev, isOpen: false })); fetchAllData(); };

  const userGroups = [ { name: 'Akun Global (Admin & Supervisor)', icon: '👑', users: users.filter(u => u.role !== 'pemeriksa') }, ...tahaps.map(t => ({ name: t.name, icon: '👥', users: users.filter(u => u.role === 'pemeriksa' && ((u.riwayatTahap && u.riwayatTahap.includes(t.name)) || u.assignedTahap === t.name)) })), { name: 'Pemeriksa (Belum Ada Tahap)', icon: '❓', users: users.filter(u => u.role === 'pemeriksa' && !u.assignedTahap && (!u.riwayatTahap || u.riwayatTahap.length === 0)) } ].filter(g => g.users.length > 0 || g.name === 'Akun Global (Admin & Supervisor)');

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans relative">
      <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onConfirm={handleModalConfirm} onCancel={() => setModal({ ...modal, isOpen: false })} confirmText={modal.confirmText} isDestructive={modal.isDestructive} showCancel={modal.showCancel} />

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Konfigurasi Sistem</h1>
        <p className="text-slate-500 mt-1">Kelola master data, target kerja, hak akses, dan pengaturan integrasi aplikasi.</p>
      </div>

      <div className="flex space-x-2 p-1.5 bg-slate-200/50 rounded-2xl mb-8 overflow-x-auto w-full lg:w-fit scrollbar-hide border border-slate-100">
        {['master', 'dokumentasi', 'targets', 'users', 'assignments', 'settings'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all capitalize whitespace-nowrap ${activeTab === tab ? 'bg-white text-[#1A73E8] shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}>
            {tab === 'master' ? 'Master Kategori' : tab === 'dokumentasi' ? 'Dokumentasi Wajib' : tab === 'targets' ? 'Target & KPI' : tab === 'users' ? 'Akun Login' : tab === 'assignments' ? 'Penugasan Lapangan' : '⚙️ Sistem'}
          </button>
        ))}
      </div>

      {isLoading ? <div className="p-12 text-center text-[#4285F4] animate-pulse font-medium">Menyesuaikan konfigurasi...</div> : (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          {activeTab === 'master' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"><h2 className="font-extrabold mb-6 text-slate-800 text-lg flex items-center gap-2"><span className="text-xl">📦</span> Kelola Unit / Kategori</h2><form onSubmit={handleAddUnit} className="flex flex-col sm:flex-row gap-3 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-100"><input type="text" value={newUnit} onChange={e=>setNewUnit(e.target.value)} placeholder="Contoh: BRACKET" className="flex-1 border-0 bg-white shadow-sm p-3.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4285F4]/20 transition-all font-bold text-slate-700 uppercase" required/><button className="bg-[#1A73E8] hover:bg-[#1557B0] text-white py-3.5 sm:py-0 px-6 rounded-xl text-sm font-bold transition-colors shadow-sm shrink-0">Tambah</button></form><div className="space-y-2">{units.map(u => (<div key={u.id} className="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 hover:shadow-sm transition-all group"><span className="text-sm font-extrabold text-slate-700">{u.name}</span><button onClick={()=>confirmDelete('master_units', u.id, u.name)} className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-[#EA4335] sm:opacity-0 sm:group-hover:opacity-100 hover:bg-[#EA4335] hover:text-white transition-all">✕</button></div>))}{units.length === 0 && <p className="text-center text-slate-400 text-sm italic py-4">Belum ada unit terdaftar.</p>}</div></div>
               <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"><h2 className="font-extrabold mb-6 text-slate-800 text-lg flex items-center gap-2"><span className="text-xl">📂</span> Kelola Tahap</h2><form onSubmit={handleAddTahap} className="flex flex-col sm:flex-row gap-3 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-100"><input type="text" value={newTahap} onChange={e=>setNewTahap(e.target.value)} placeholder="Contoh: TAHAP 1" className="flex-1 border-0 bg-white shadow-sm p-3.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4285F4]/20 transition-all font-bold text-slate-700 uppercase" required/><button className="bg-[#1A73E8] hover:bg-[#1557B0] text-white py-3.5 sm:py-0 px-6 rounded-xl text-sm font-bold transition-colors shadow-sm shrink-0">Tambah</button></form><div className="space-y-2">{tahaps.map(t => (<div key={t.id} className="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 hover:shadow-sm transition-all group"><span className="text-sm font-extrabold text-slate-700">{t.name}</span><button onClick={()=>confirmDelete('master_tahaps', t.id, t.name)} className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-[#EA4335] sm:opacity-0 sm:group-hover:opacity-100 hover:bg-[#EA4335] hover:text-white transition-all">✕</button></div>))}{tahaps.length === 0 && <p className="text-center text-slate-400 text-sm italic py-4">Belum ada tahap terdaftar.</p>}</div></div>
             </div>
          )}

          {/* TAB DOKUMENTASI WAJIB (CARD LIST PER UNIT) */}
          {activeTab === 'dokumentasi' && (
             <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
               <div className="mb-6"><h2 className="text-xl font-bold text-slate-900 mb-1 flex items-center gap-2"><span className="text-2xl">📸</span> Master Dokumentasi Wajib</h2><p className="text-slate-500 text-sm">Tambahkan daftar foto yang wajib diunggah oleh petugas lapangan berdasarkan Kategori Unit.</p></div>
               
               <form onSubmit={handleAddDokItem} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-8 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                 <select value={newDokUnit} onChange={e=>setNewDokUnit(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4285F4] font-medium cursor-pointer" required>
                   <option value="">Pilih Kategori Unit...</option>
                   {units.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                 </select>
                 <input type="text" value={newDokName} onChange={e=>setNewDokName(e.target.value)} placeholder="Nama Kategori Foto (misal: Tampak Depan)" className="sm:col-span-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4285F4] transition-all font-bold text-slate-800" required/>
                 <button className="bg-[#1A73E8] hover:bg-[#1557B0] text-white py-3.5 sm:py-0 px-6 rounded-xl text-sm font-bold transition-colors shadow-sm">Tambah Foto Wajib</button>
               </form>

               <div className="space-y-4">
                 {units.map(unit => {
                   const doksInUnit = dokItems.filter(d => d.unit === unit.name);
                   return (
                     <details key={unit.id} className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:border-blue-300 transition-colors" open>
                       <summary className="font-bold cursor-pointer p-4 flex items-center justify-between bg-slate-50/50 outline-none select-none hover:bg-slate-100 transition-colors">
                         <div className="flex items-center gap-3">
                           <span className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner shrink-0 text-xl">📦</span>
                           <div><h3 className="text-slate-800 tracking-wide uppercase text-sm sm:text-base">{unit.name}</h3><p className="text-xs font-semibold text-slate-500">{doksInUnit.length} Syarat Foto</p></div>
                         </div>
                         <span className="text-slate-400 group-open:rotate-180 transition-transform duration-300"><svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></span>
                       </summary>
                       <div className="p-0 sm:p-2 border-t border-slate-100 overflow-x-auto">
                         <table className="w-full text-left text-sm text-slate-600 bg-white">
                           <thead className="bg-[#F8F9FA] border-y border-slate-100"><tr className="text-xs font-bold text-slate-500 uppercase tracking-wider"><th className="py-4 px-6 w-16 text-center">No</th><th className="py-4 px-6">Nama Syarat Foto</th><th className="py-4 px-6 text-right">Aksi</th></tr></thead>
                           <tbody className="divide-y divide-slate-50">
                             {doksInUnit.map((item, index) => (
                               <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                 <td className="py-4 px-6 text-center font-bold text-slate-400">{index + 1}</td>
                                 <td className="py-4 px-6 font-extrabold text-slate-800 uppercase">{item.name}</td>
                                 <td className="py-4 px-6 text-right"><button onClick={()=>confirmDelete('dokumentasi_wajib', item.id, item.name)} className="text-[#EA4335] hover:text-white font-bold text-xs bg-[#FCE8E6] hover:bg-[#EA4335] px-4 py-2 rounded-xl transition-all shadow-sm">Hapus</button></td>
                               </tr>
                             ))}
                             {doksInUnit.length === 0 && <tr><td colSpan="3" className="py-8 text-center text-slate-400">Belum ada syarat foto untuk unit ini.</td></tr>}
                           </tbody>
                         </table>
                       </div>
                     </details>
                   );
                 })}
               </div>
             </div>
          )}

          {activeTab === 'targets' && (
             <div className="space-y-8">
               <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"><div className="mb-6"><h2 className="text-xl font-bold text-slate-900 mb-1">Target Keseluruhan (Grand Total)</h2></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{units.map(u => (<div key={u.id} className="p-5 rounded-2xl border border-slate-200 bg-[#F8F9FA] flex flex-col gap-3 transition-all focus-within:border-[#4285F4] focus-within:shadow-md"><span className="font-extrabold text-slate-800 text-sm uppercase flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#4285F4]"></span> {u.name}</span><div className="flex gap-2"><input type="number" value={unitGrandTotals[u.id] !== undefined ? unitGrandTotals[u.id] : ''} onChange={(e) => setUnitGrandTotals({...unitGrandTotals, [u.id]: e.target.value})} placeholder="0" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-mono font-bold text-[#1A73E8] outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 bg-white transition-all"/><button onClick={() => handleUpdateGrandTotalExecute(u.id, u.name)} className="bg-slate-800 hover:bg-black text-white px-5 rounded-xl text-sm font-bold transition-colors shadow-sm shrink-0">Save</button></div></div>))}</div></div>
               <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"><h2 className="text-xl font-bold text-slate-900 mb-6">Target Spesifik per Tahap</h2><form onSubmit={handleAddTargetExecute} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-8 bg-slate-50 p-5 rounded-2xl border border-slate-100"><select value={targetTahap} onChange={(e) => setTargetTahap(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 font-medium cursor-pointer" required><option value="">Pilih Tahap...</option>{tahaps.map(tahap => <option key={tahap.id} value={tahap.name}>{tahap.name}</option>)}</select><select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 font-medium cursor-pointer" required><option value="">Pilih Unit...</option>{units.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}</select><input type="number" value={targetJumlah} onChange={(e) => setTargetJumlah(e.target.value)} placeholder="Jumlah Target" className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 font-mono font-bold" min="1" required /><button type="submit" className="bg-[#34A853] hover:bg-[#2B8A44] text-white font-bold text-sm py-3.5 sm:py-0 rounded-xl transition-colors shadow-sm">Tambah Target</button></form><div className="space-y-4">{tahaps.map(tahap => { const targetsInTahap = targets.filter(t => t.tahap === tahap.name); if (targetsInTahap.length === 0) return null; return ( <details key={tahap.id} className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:border-blue-300 transition-colors" open> <summary className="font-bold cursor-pointer p-4 flex items-center justify-between bg-slate-50/50 outline-none select-none hover:bg-slate-100 transition-colors"> <div className="flex items-center gap-3"> <span className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shadow-inner shrink-0 text-xl">🎯</span> <div> <h3 className="text-slate-800 tracking-wide uppercase text-sm sm:text-base">{tahap.name}</h3> <p className="text-xs font-semibold text-slate-500">{targetsInTahap.length} Unit Ditargetkan</p> </div> </div> <span className="text-slate-400 group-open:rotate-180 transition-transform duration-300"> <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg> </span> </summary> <div className="p-0 sm:p-2 border-t border-slate-100 overflow-x-auto"> <table className="w-full text-left text-sm text-slate-600 bg-white"> <thead className="bg-[#F8F9FA] border-y border-slate-100"> <tr className="text-xs font-bold text-slate-500 uppercase tracking-wider"> <th className="py-4 px-6 w-1/2">Nama Unit Kategori</th> <th className="py-4 px-6 text-center">Jumlah Target</th> <th className="py-4 px-6 text-right">Aksi</th> </tr> </thead> <tbody className="divide-y divide-slate-50"> {targetsInTahap.map(t => ( <tr key={t.id} className="hover:bg-blue-50/30 transition-colors"> <td className="py-4 px-6 font-extrabold text-slate-800">{t.unit}</td> <td className="py-4 px-6 text-center font-mono font-black text-[#1A73E8] bg-blue-50/50">{t.jumlah}</td> <td className="py-4 px-6 text-right"> <button onClick={() => confirmDelete('master_targets', t.id, `Target ${t.unit} - ${t.tahap}`)} className="text-[#EA4335] hover:text-white font-bold text-xs bg-[#FCE8E6] hover:bg-[#EA4335] px-4 py-2 rounded-xl transition-all shadow-sm">Hapus</button> </td> </tr> ))} </tbody> </table> </div> </details> ); })} </div></div>
             </div>
          )}

          {activeTab === 'users' && (
             <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"><div className="mb-6"><h2 className="text-xl font-bold text-slate-900">Manajemen Akun Login</h2></div><form onSubmit={handleAddUser} className="flex flex-col md:flex-row gap-3 mb-8 bg-slate-50 p-5 rounded-2xl border border-slate-100"><select value={newUserRole} onChange={(e) => { setNewUserRole(e.target.value); setNewUsername(''); setNewUserTahap(''); }} className="flex-1 px-5 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 font-medium cursor-pointer"><option value="pemeriksa">Pemeriksa Lapangan</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option></select>{newUserRole === 'pemeriksa' && ( <select value={newUserTahap} onChange={(e) => { setNewUserTahap(e.target.value); setNewUsername(''); }} className="flex-1 px-5 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 font-medium cursor-pointer" required><option value="">Pilih Tahap Tugas...</option>{tahaps.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select>)}{newUserRole === 'pemeriksa' ? ( <select value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="flex-1 px-5 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 font-medium cursor-pointer" required disabled={!newUserTahap}><option value="">Pilih Nama Peserta...</option>{absensiList.filter(a => a.tahap === newUserTahap).map((a, idx) => ( <option key={idx} value={a.namaLengkap}>{a.namaLengkap} ({a.instansi})</option>))}</select>) : ( <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Tulis Username" className="flex-1 px-5 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 lowercase" required />)}<input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Tentukan Password" className="flex-1 px-5 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100" required /><button type="submit" className="shrink-0 w-full md:w-auto px-8 bg-slate-900 hover:bg-black text-white font-bold text-sm py-3.5 md:py-0 rounded-xl transition-colors shadow-sm">Daftarkan / Pindah Tahap</button></form><div className="space-y-4">{userGroups.map((group) => ( <details key={group.name} className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:border-blue-300 transition-colors" open> <summary className="font-bold cursor-pointer p-4 flex items-center justify-between bg-slate-50/50 outline-none select-none hover:bg-slate-100 transition-colors"> <div className="flex items-center gap-3"> <span className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shadow-inner shrink-0 text-xl">{group.icon}</span> <div> <h3 className="text-slate-800 tracking-wide uppercase text-sm sm:text-base">{group.name}</h3> <p className="text-xs font-semibold text-slate-500">{group.users.length} Akun Tercatat</p> </div> </div> <span className="text-slate-400 group-open:rotate-180 transition-transform duration-300"><svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></span> </summary> <div className="p-0 sm:p-2 border-t border-slate-100 overflow-x-auto"> <table className="w-full text-left text-sm text-slate-600 bg-white"> <thead className="bg-[#F8F9FA] border-y border-slate-100"><tr className="text-xs font-bold text-slate-500 uppercase tracking-wider"><th className="py-4 px-6">Username</th><th className="py-4 px-6">Password</th><th className="py-4 px-6">Role / Posisi Saat Ini</th><th className="py-4 px-6 text-center">Status Akses</th><th className="py-4 px-6 text-right">Aksi</th></tr></thead> <tbody className="divide-y divide-slate-50"> {group.users.map(u => { const isActive = u.isActive !== false; const isCurrentTahap = u.assignedTahap === group.name; return ( <tr key={u.id} className={`hover:bg-blue-50/30 transition-colors ${!isActive ? 'opacity-60 bg-slate-50' : ''}`}> <td className="py-4 px-6 font-extrabold text-slate-800 uppercase"><div>{u.username}</div>{u.namaLengkap && <div className="text-[10px] text-slate-400 capitalize mt-0.5 font-medium">Asli: {u.namaLengkap}</div>}</td> <td className="py-4 px-6"><span className="font-mono text-[#1A73E8] font-bold bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">{u.password}</span></td> <td className="py-4 px-6 flex flex-col gap-1 items-start"><span className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap ${u.role === 'supervisor' ? 'bg-amber-100 text-amber-700' : u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{u.role}</span>{u.role === 'pemeriksa' && !isCurrentTahap && u.assignedTahap && ( <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Pindah ke: {u.assignedTahap}</span>)}</td> <td className="py-4 px-6 text-center"><button onClick={() => handleToggleStatus(u.id, isActive, u.username)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all ${isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}>{isActive ? '✅ AKTIF' : '❌ SUSPEND'}</button></td> <td className="py-4 px-6 text-right"><button onClick={() => confirmDelete('users', u.id, `Akun ${u.username}`)} className="text-[#EA4335] hover:text-white font-bold text-xs bg-[#FCE8E6] hover:bg-[#EA4335] px-4 py-2 rounded-xl transition-all shadow-sm">Hapus</button></td> </tr> ); })} </tbody> </table> </div> </details> ))} </div></div>
          )}

          {activeTab === 'assignments' && (
             <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"><div className="mb-8"><h2 className="text-2xl font-bold text-slate-900 mb-1">Penugasan Lapangan</h2><p className="text-slate-500 text-sm">Hanya menampilkan pemeriksa yang AKTIF ditugaskan pada tahap tersebut.</p></div><div className="space-y-6">{tahaps.map(tahap => { const usersInTahap = users.filter(u => u.role === 'pemeriksa' && u.assignedTahap === tahap.name); return ( <details key={tahap.id} className="group bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm open:bg-white transition-colors" open> <summary className="font-bold cursor-pointer p-5 flex items-center justify-between outline-none select-none hover:bg-slate-100 transition-colors border-b border-transparent group-open:border-slate-100"> <div className="flex items-center gap-4"> <div className="w-12 h-12 rounded-xl bg-[#1A73E8] flex items-center justify-center text-white shadow-md text-xl">📋</div> <div> <h3 className="text-slate-800 tracking-wide uppercase text-lg">{tahap.name}</h3> <p className="text-xs font-semibold text-slate-500">{usersInTahap.length} Petugas Ditugaskan</p> </div> </div> <span className="text-slate-400 group-open:rotate-180 transition-transform duration-300"><svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></span> </summary> <div className="p-5"> <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"> {usersInTahap.map(u => { const isActive = u.isActive !== false; return ( <div key={u.id} className={`p-5 rounded-2xl border bg-white transition-all flex flex-col justify-between ${!isActive ? 'border-red-200 opacity-75 grayscale-[50%]' : 'border-blue-100 hover:shadow-md'}`}> <div className="mb-4 flex flex-col items-center"> <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-2xl mb-3 shadow-inner">👷</div> <h3 className="font-extrabold text-slate-800 uppercase text-lg tracking-wide text-center">{u.username}</h3> {!isActive && <span className="bg-red-100 text-red-700 text-[10px] font-black px-2 py-0.5 rounded mt-1">AKUN SUSPEND</span>} </div> <div className="space-y-3 pt-4 border-t border-slate-100"> <div className="text-xs font-bold text-slate-400 uppercase text-center mb-1">Pilih Unit Tugas:</div> <select value={assignments[u.id]?.unit || ''} onChange={(e) => setAssignments(p => ({...p, [u.id]: {...p[u.id], unit: e.target.value}}))} disabled={!isActive} className="w-full text-sm border-2 border-slate-100 bg-slate-50 px-4 py-2.5 rounded-xl outline-none focus:border-[#4285F4] focus:bg-white font-medium transition-colors cursor-pointer"> <option value="">-- Bebas Unit --</option> {units.map(unit => <option key={unit.id} value={unit.name}>{unit.name}</option>)} </select> <button onClick={() => handleAssignTask(u.id, u.username)} disabled={!isActive} className={`w-full py-3 font-bold text-xs rounded-xl transition-colors shadow-sm ${!isActive ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-[#E8F0FE] hover:bg-[#1A73E8] text-[#1A73E8] hover:text-white'}`}>Kunci Unit</button> </div> </div> ); })} {usersInTahap.length === 0 && <p className="text-slate-400 text-sm italic col-span-full py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">Belum ada pemeriksa yang didaftarkan aktif ke tahap ini.</p>} </div> {usersInTahap.length > 0 && ( <div className="mt-6 pt-5 border-t-2 border-dashed border-slate-200 flex justify-end"> <button onClick={() => handleSelesaikanTahap(tahap.name)} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-black px-6 py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 active:scale-95 text-sm"> <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> SELESAIKAN TAHAP INI </button> </div> )} </div> </details> ); })} </div></div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)] max-w-3xl"><div className="mb-8 border-b border-slate-100 pb-6"><h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2"><span className="text-2xl">🔗</span> Integrasi Google Drive</h2><p className="text-sm text-slate-500 leading-relaxed">Masukkan tautan (URL) Deployment dari Google Apps Script untuk menghubungkan aplikasi ini dengan akun Google Drive.</p></div><form onSubmit={handleSaveSettings} className="space-y-5"><div><label className="text-xs font-bold text-slate-500 uppercase ml-1">URL Google Apps Script (API Web App)</label><input type="url" value={driveApiUrl} onChange={(e) => setDriveApiUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" className="w-full mt-2 px-5 py-4 bg-[#F8F9FA] border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-[#4285F4] focus:ring-4 focus:ring-blue-50 transition-all font-mono font-medium text-slate-800" required /></div><div className="pt-4 flex justify-end"><button type="submit" className="bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold text-sm px-8 py-3.5 rounded-xl transition-all shadow-md">Simpan Pengaturan</button></div></form></div>
          )}

        </div>
      )}
    </div>
  );
}