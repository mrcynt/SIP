import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, orderBy, where } from 'firebase/firestore';
import { logActivity } from '../utils/auditLogger';
import Modal from '../components/Modal';

export default function LaporanBerkas() {
  const { user } = useAuth();
  const [tahaps, setTahaps] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Navigasi Folder
  const [activeFolder, setActiveFolder] = useState(null); 

  // State Modal Folder
  const [folderModal, setFolderModal] = useState({ isOpen: false, action: 'add', id: null, tahap: '', name: '' });
  
  // State Modal File
  const [fileModal, setFileModal] = useState({ isOpen: false, name: '', url: '' });

  // State Modal Konfirmasi Hapus
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, type: '', id: null, title: '', message: '' });

  useEffect(() => {
    fetchTahapsAndFolders();
  }, []);

  const fetchTahapsAndFolders = async () => {
    setIsLoading(true);
    try {
      // Ambil daftar Tahap
      const tahapSnap = await getDocs(collection(db, 'master_tahaps'));
      const listTahap = tahapSnap.docs.map(d => d.data().name);
      listTahap.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      setTahaps(listTahap);

      // Ambil daftar Folder
      const folderSnap = await getDocs(query(collection(db, 'berkas_folders'), orderBy('timestamp', 'asc')));
      setFolders(folderSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Gagal memuat data:", error);
    }
    setIsLoading(false);
  };

  const fetchFiles = async (folderId) => {
    try {
      const q = query(collection(db, 'berkas_files'), where('folderId', '==', folderId));
      const fileSnap = await getDocs(q);
      const fileData = fileSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      fileData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setFiles(fileData);
    } catch (error) {
      console.error("Gagal memuat file:", error);
    }
  };

  // --- HANDLER FOLDER (KATEGORI BERKAS) ---
  const handleSaveFolder = async (e) => {
    e.preventDefault();
    if (!folderModal.name.trim()) return;

    try {
      if (folderModal.action === 'add') {
        await addDoc(collection(db, 'berkas_folders'), {
          tahap: folderModal.tahap,
          name: folderModal.name.trim(),
          timestamp: new Date().toISOString()
        });
        logActivity(user.username, `Membuat folder berkas ${folderModal.name} di ${folderModal.tahap}`);
      } else {
        await updateDoc(doc(db, 'berkas_folders', folderModal.id), {
          name: folderModal.name.trim()
        });
        logActivity(user.username, `Mengedit nama folder berkas menjadi ${folderModal.name}`);
      }
      setFolderModal({ isOpen: false, action: 'add', id: null, tahap: '', name: '' });
      fetchTahapsAndFolders();
    } catch (error) {
      alert("Gagal menyimpan folder.");
    }
  };

  // --- HANDLER FILE (ISI DALAM FOLDER) ---
  const handleOpenFolder = (folder) => {
    setActiveFolder(folder);
    fetchFiles(folder.id);
  };

  const handleSaveFile = async (e) => {
    e.preventDefault();
    if (!fileModal.name.trim() || !fileModal.url.trim()) return;

    try {
      await addDoc(collection(db, 'berkas_files'), {
        folderId: activeFolder.id,
        name: fileModal.name.trim(),
        url: fileModal.url.trim(),
        timestamp: new Date().toISOString()
      });
      logActivity(user.username, `Menambahkan file ${fileModal.name} ke folder ${activeFolder.name}`);
      setFileModal({ isOpen: false, name: '', url: '' });
      fetchFiles(activeFolder.id); 
    } catch (error) {
      alert("Gagal menyimpan file.");
    }
  };

  // --- HANDLER HAPUS ---
  const confirmDelete = (type, id, name) => {
    setDeleteModal({
      isOpen: true,
      type: type,
      id: id,
      title: type === 'folder' ? 'Hapus Folder Berkas?' : 'Hapus Link File?',
      message: type === 'folder' 
        ? `Apakah Anda yakin ingin menghapus folder "${name}"? Semua file di dalamnya tidak akan bisa diakses lagi.` 
        : `Hapus file "${name}" dari arsip?`
    });
  };

  const executeDelete = async () => {
    try {
      if (deleteModal.type === 'folder') {
        await deleteDoc(doc(db, 'berkas_folders', deleteModal.id));
        logActivity(user.username, `Menghapus folder berkas`);
        fetchTahapsAndFolders();
      } else {
        await deleteDoc(doc(db, 'berkas_files', deleteModal.id));
        logActivity(user.username, `Menghapus file berkas`);
        fetchFiles(activeFolder.id);
      }
      setDeleteModal({ isOpen: false, type: '', id: null, title: '', message: '' });
    } catch (error) {
      alert("Gagal menghapus data.");
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans relative">
      
      {/* MODAL KONFIRMASI HAPUS */}
      <Modal 
        isOpen={deleteModal.isOpen} 
        title={deleteModal.title} 
        message={deleteModal.message} 
        type="confirm" 
        onConfirm={executeDelete} 
        onCancel={() => setDeleteModal({ ...deleteModal, isOpen: false })} 
        confirmText="Ya, Hapus" 
        isDestructive={true} 
      />

      {/* MODAL TAMBAH/EDIT FOLDER */}
      {folderModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/70 z-[100] flex justify-center items-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl flex flex-col animate-in zoom-in-95 overflow-hidden">
            <div className="p-5 bg-blue-600 text-white flex justify-between items-center">
              <h3 className="font-extrabold text-lg flex items-center gap-2">📂 {folderModal.action === 'add' ? 'Tambah Folder Baru' : 'Edit Nama Folder'}</h3>
              <button onClick={() => setFolderModal({ ...folderModal, isOpen: false })} className="w-8 h-8 bg-white/20 hover:bg-white/40 rounded-full font-bold transition-colors">✕</button>
            </div>
            <form onSubmit={handleSaveFolder} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nama Folder / Kartu</label>
                <input 
                  autoFocus
                  type="text" 
                  value={folderModal.name} 
                  onChange={(e) => setFolderModal({ ...folderModal, name: e.target.value })} 
                  placeholder="Misal: Berita Acara, BAST, dll..." 
                  className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all" 
                  required 
                />
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setFolderModal({ ...folderModal, isOpen: false })} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm rounded-xl transition-colors">Batal</button>
                <button type="submit" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH FILE */}
      {fileModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/70 z-[100] flex justify-center items-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl flex flex-col animate-in zoom-in-95 overflow-hidden">
            <div className="p-5 bg-indigo-600 text-white flex justify-between items-center">
              <h3 className="font-extrabold text-lg flex items-center gap-2">📄 Tambah Link File</h3>
              <button onClick={() => setFileModal({ ...fileModal, isOpen: false })} className="w-8 h-8 bg-white/20 hover:bg-white/40 rounded-full font-bold transition-colors">✕</button>
            </div>
            <form onSubmit={handleSaveFile} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nama File / Dokumen</label>
                <input 
                  autoFocus
                  type="text" 
                  value={fileModal.name} 
                  onChange={(e) => setFileModal({ ...fileModal, name: e.target.value })} 
                  placeholder="Misal: Scan BAST Sekolah A..." 
                  className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all" 
                  required 
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase ml-1 flex justify-between">
                  <span>Tautan (Link Drive/Cloud)</span>
                  <span className="text-[10px] text-indigo-500 lowercase normal-case font-medium border border-indigo-200 bg-indigo-50 px-2 rounded">Harus Publik/Viewer</span>
                </label>
                <input 
                  type="url" 
                  value={fileModal.url} 
                  onChange={(e) => setFileModal({ ...fileModal, url: e.target.value })} 
                  placeholder="https://drive.google.com/..." 
                  className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all" 
                  required 
                />
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setFileModal({ ...fileModal, isOpen: false })} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm rounded-xl transition-colors">Batal</button>
                <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm">Simpan File</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HEADER UTAMA */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Laporan Berkas</h1>
        <p className="text-slate-500 mt-1">Sistem pengarsipan digital untuk menyimpan tautan dokumen per tahap.</p>
      </div>

      {isLoading && !activeFolder ? (
        <div className="p-12 text-center text-[#1A73E8] font-bold animate-pulse">Menyiapkan rak arsip...</div>
      ) : activeFolder ? (
        // ==========================================
        // TAMPILAN: DI DALAM FOLDER (DAFTAR FILE)
        // ==========================================
        <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-50 overflow-hidden animate-in slide-in-from-right-8 duration-300">
          
          <div className="p-6 md:p-8 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <button onClick={() => setActiveFolder(null)} className="text-sm font-bold text-slate-500 hover:text-[#1A73E8] mb-2 flex items-center gap-1 transition-colors">
                ← Kembali ke Daftar Tahap
              </button>
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                <span className="text-3xl">📂</span> {activeFolder.name}
              </h2>
              <p className="text-xs font-bold text-[#1A73E8] uppercase tracking-widest mt-1 ml-10">Arsip / {activeFolder.tahap}</p>
            </div>
            {isAdmin && (
              <button onClick={() => setFileModal({ isOpen: true, name: '', url: '' })} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 w-full sm:w-auto justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                Tambah Tautan File
              </button>
            )}
          </div>

          <div className="p-6 md:p-8 min-h-[400px]">
            {files.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <span className="text-4xl mb-3 opacity-50">📭</span>
                <p className="text-slate-400 font-bold text-sm">Folder ini masih kosong.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {files.map(file => (
                  <div key={file.id} className="group border border-slate-200 rounded-2xl p-4 hover:border-indigo-300 hover:shadow-md transition-all bg-white flex flex-col justify-between h-full">
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl shrink-0">📄</div>
                        {isAdmin && (
                          <button onClick={() => confirmDelete('file', file.id, file.name)} className="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0" title="Hapus File">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                          </button>
                        )}
                      </div>
                      <h4 className="font-extrabold text-slate-800 text-sm leading-snug line-clamp-2" title={file.name}>{file.name}</h4>
                      <p className="text-[10px] text-slate-400 font-medium mt-2">{new Date(file.timestamp).toLocaleString('id-ID', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'})}</p>
                    </div>
                    
                    <a 
                      href={file.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="mt-4 w-full bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white py-2.5 rounded-xl text-xs font-bold text-center transition-all block border border-indigo-100 hover:border-indigo-600 shadow-sm"
                    >
                      Buka Tautan ↗
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      ) : (
        // ==========================================
        // TAMPILAN: UTAMA (DAFTAR TAHAP & FOLDER)
        // ==========================================
        <div className="space-y-6 animate-in fade-in duration-500">
          {tahaps.map((tahap) => {
            const foldersDiTahapIni = folders.filter(f => f.tahap === tahap);
            
            return (
              <details key={tahap} className="group bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:border-[#1A73E8] transition-colors" open>
                
                <summary className="font-bold cursor-pointer p-5 sm:p-6 flex items-center justify-between bg-slate-50/50 outline-none select-none hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="w-12 h-12 rounded-2xl bg-[#E8F0FE] flex items-center justify-center text-[#1A73E8] shadow-inner shrink-0 text-2xl">📄</span>
                    <div className="flex items-center gap-3">
                      <div>
                        <h3 className="text-slate-800 tracking-wide uppercase text-lg sm:text-xl font-black">{tahap}</h3>
                        <p className="text-xs font-semibold text-slate-500 mt-1">{foldersDiTahapIni.length} Folder Tersimpan</p>
                      </div>
                      
                      {/* TOMBOL + KECIL SEJAJAR DENGAN TULISAN TAHAP */}
                      {isAdmin && (
                        <button 
                          onClick={(e) => {
                            e.preventDefault(); // Cegah Accordion Tertutup
                            e.stopPropagation(); // Cegah event bocor
                            setFolderModal({ isOpen: true, action: 'add', id: null, tahap: tahap, name: '' });
                          }}
                          className="ml-2 w-8 h-8 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white flex items-center justify-center font-bold text-lg transition-all shadow-sm z-10"
                          title="Tambah Folder / Kartu Baru"
                        >
                          +
                        </button>
                      )}
                    </div>
                  </div>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform duration-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                  </span>
                </summary>

                <div className="p-6 border-t border-slate-100 bg-white">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    
                    {/* DAFTAR KARTU FOLDER */}
                    {foldersDiTahapIni.map(folder => (
                      <div 
                        key={folder.id} 
                        onClick={() => handleOpenFolder(folder)}
                        className="group/card h-32 border border-slate-200 rounded-2xl p-4 bg-white hover:border-[#1A73E8] hover:shadow-md transition-all flex flex-col cursor-pointer relative"
                      >
                        {isAdmin && (
                          <div className="absolute top-2 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover/card:opacity-100 transition-opacity z-10">
                            <button onClick={(e) => { e.stopPropagation(); setFolderModal({ isOpen: true, action: 'edit', id: folder.id, tahap: folder.tahap, name: folder.name }); }} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center transition-colors" title="Edit">✏️</button>
                            <button onClick={(e) => { e.stopPropagation(); confirmDelete('folder', folder.id, folder.name); }} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors" title="Hapus">✕</button>
                          </div>
                        )}
                        
                        <div className="flex-1 flex flex-col justify-end">
                          <span className="text-4xl mb-2 drop-shadow-sm group-hover/card:scale-110 transition-transform origin-left">📂</span>
                          <h4 className="font-extrabold text-slate-800 text-sm leading-tight group-hover/card:text-[#1A73E8] transition-colors">{folder.name}</h4>
                        </div>
                      </div>
                    ))}
                    
                    {foldersDiTahapIni.length === 0 && (
                      <div className="col-span-full py-4 text-center text-sm font-medium text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl">
                        Klik tombol + di atas untuk membuat folder baru.
                      </div>
                    )}

                  </div>
                </div>

              </details>
            );
          })}
          {tahaps.length === 0 && !isLoading && (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-100 text-slate-500">Konfigurasi Master Tahap belum tersedia.</div>
          )}
        </div>
      )}

    </div>
  );
}