import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { collection, addDoc, runTransaction, doc, query, where, getDocs, orderBy } from 'firebase/firestore';
import { dbLocal } from '../db/offlineDB';
import { fetchWithRetry } from '../utils/network';

// IMPORT ZXING SEBAGAI CADANGAN
import { BrowserMultiFormatReader } from '@zxing/browser';

const DRIVE_API_URL = "https://script.google.com/macros/s/AKfycbyJwmBp6pfgIgO9jSOl-RbQ6RMBTQPUX0zJFd_3TYqQ-egca9WNOImoKrLYW6PkQUDBYQ/exec";

const KATEGORI_WAJIB = [
  "Serial Number Fisik", "Serial Number Kardus", "Serial Number Remote",
  "System", "Memori", "Kamera", "CPU-Z", "Kelengkapan",
  "Jaringan Internet", "Bluetooth", "Konektivitas Display", "Lainnya"
];

const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
    };
  });
};

export default function Pemeriksaan() {
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState('form'); 
  const [notifKerjaan, setNotifKerjaan] = useState({ isOpen: false, isOffline: false });
  
  const [serialNumber, setSerialNumber] = useState('');
  const [isSnLocked, setIsSnLocked] = useState(false);
  const [isCheckingSN, setIsCheckingSN] = useState(false); 
  
  const [uploadMode, setUploadMode] = useState('kategori'); 
  const [photos, setPhotos] = useState([]); 
  
  const [mediaSheet, setMediaSheet] = useState({ isOpen: false, kategori: null });
  
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  const [laporanRecords, setLaporanRecords] = useState([]);
  const [isLaporanLoading, setIsLaporanLoading] = useState(false);
  const [searchLaporan, setSearchLaporan] = useState('');

  // ========================================================
  // STATE SCANNER HYBRID (NATIVE API + ZXING)
  // ========================================================
  const [isScanning, setIsScanning] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [boxWidth, setBoxWidth] = useState(340);
  const [boxHeight, setBoxHeight] = useState(140);
  
  const videoRef = useRef(null);
  const scannerTrackRef = useRef(null);

  useEffect(() => {
    if (!isScanning) return;

    const codeReader = new BrowserMultiFormatReader();
    let localStream = null;
    let isScanned = false; 
    let scanTimeout = null;

    setIsTorchOn(false);

    const startScanner = async () => {
      try {
        // 1. Ambil stream kamera dengan resolusi 720p (Lebih ringan & cepat diproses JS)
        localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        if (!videoRef.current) return;
        videoRef.current.srcObject = localStream;
        videoRef.current.setAttribute("playsinline", true);
        await videoRef.current.play();

        const track = localStream.getVideoTracks()[0];
        scannerTrackRef.current = track;

        // Autofocus & Zoom Sedikit biar barcode makin jelas
        setTimeout(async () => {
          try {
            const capabilities = track.getCapabilities?.() || {};
            const advanced = [];
            if (capabilities.focusMode?.includes("continuous")) {
              advanced.push({ focusMode: "continuous" });
            }
            if (capabilities.zoom) {
              advanced.push({ zoom: Math.min(1.5, capabilities.zoom.max || 1) });
            }
            if (advanced.length > 0) {
              await track.applyConstraints({ advanced });
            }
          } catch (e) {
            console.log("Autofocus manual tidak didukung");
          }
        }, 1000);

        // 2. Cek apakah HP mendukung NATIVE BARCODE SCANNER (Super Cepat)
        const isNativeSupported = 'BarcodeDetector' in window;
        let nativeDetector = null;
        if (isNativeSupported) {
          nativeDetector = new window.BarcodeDetector({ 
            formats: ['code_128', 'code_39', 'ean_13', 'qr_code'] 
          });
        }

        // 3. Scan Loop Manual
        const scanFrame = async () => {
          if (isScanned || !videoRef.current) return;

          try {
            let foundText = null;

            // 1. Coba Native Barcode Detector
            if (nativeDetector) {
              const barcodes = await nativeDetector.detect(videoRef.current);
              if (barcodes.length > 0) foundText = barcodes[0].rawValue;
            }

            // 2. Jika gagal, baru pakai ZXing yang sekali baca (decodeOnce) agar tidak hang
            if (!foundText) {
              try {
                const result = await codeReader.decodeOnceFromVideoElement(videoRef.current);
                if (result) foundText = result.text;
              } catch (e) {
                // Abaikan error saat tidak ketemu barcode
              }
            }

            // 3. JIKA BARCODE KETEMU
            if (foundText) {
              isScanned = true;
              const cleanValue = foundText.trim().toUpperCase();
              
              // Update state data
              setSerialNumber(cleanValue);
              
              // Tutup scanner secara instan
              setIsScanning(false);
              return; 
            }
          } catch (err) {
            console.error("Scan error:", err);
          }

          if (!isScanned) {
            scanTimeout = setTimeout(scanFrame, 150);
          }
        };

        // Mulai loop
        scanFrame();

      } catch (err) {
        console.error("Gagal inisialisasi kamera:", err);
        setError("Kamera gagal diakses. Pastikan izin kamera sudah diberikan.");
        setIsScanning(false);
      }
    };

    startScanner();

    // CLEANUP KETIKA MODAL DITUTUP (Mencegah Kamera Nyala Terus & Anti-Blank)
    return () => {
      isScanned = true;
      if (scanTimeout) clearTimeout(scanTimeout);
      
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      scannerTrackRef.current = null;
    };
  }, [isScanning]);

  // ========================================================
  // FUNGSI SENTER (ASLI KODEMU TANPA DIUBAH SAMA SEKALI)
  // ========================================================
  const toggleTorch = async () => {
  try {
    const track = scannerTrackRef.current;
    if (!track) {
      alert("Kamera belum siap, tunggu sebentar.");
      return;
    }

    const capabilities = track.getCapabilities?.();
    if (!capabilities?.torch) {
      alert("Fitur senter tidak didukung di perangkat/browser ini.");
      return;
    }

    const nextState = !isTorchOn;
    await track.applyConstraints({ advanced: [{ torch: nextState }] });
    setIsTorchOn(nextState);

  } catch (err) {
    console.error("Torch error:", err);
    alert("Senter gagal dinyalakan. HP/Browser ini mungkin memblokir akses senter via web.");
  }
};
  // ========================================================

  useEffect(() => { return () => { photos.forEach(p => URL.revokeObjectURL(p.preview)); }; }, [photos]);
  useEffect(() => { if (activeTab === 'laporan') fetchLaporan(); }, [activeTab]);

  const fetchLaporan = async () => {
    setIsLaporanLoading(true);
    try {
      const qRec = query(collection(db, 'pemeriksaan_records'), orderBy('timestamp', 'desc'));
      const snap = await getDocs(qRec);
      setLaporanRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error("Gagal mengambil laporan:", err); } 
    finally { setIsLaporanLoading(false); }
  };

  if (!user?.assignedUnit || !user?.assignedTahap) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] font-sans">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4"><span className="text-4xl">🚷</span></div>
        <h2 className="text-xl font-bold text-slate-800">Anda Belum Mendapat Tugas</h2>
        <p className="text-slate-500 mt-2 text-center max-w-sm">Hubungi Admin/Supervisor untuk mengatur Unit dan Tahap Anda.</p>
      </div>
    );
  }

  const handleLockSN = async (e) => {
    e?.preventDefault();
    const finalSN = serialNumber.trim().toUpperCase();
    if (!finalSN) { setError("Silakan isi/scan Serial Number terlebih dahulu."); return; }
    setIsCheckingSN(true); setError('');
    try {
      const cekLokal = await dbLocal.antrean_pemeriksaan.toArray();
      const isAdaDiLokal = cekLokal.some(item => item.serialNumber === finalSN);
      if (isAdaDiLokal) { setError(`DITOLAK: SN [${finalSN}] sudah ada di antrean offline Anda!`); setIsCheckingSN(false); return; }
      if (navigator.onLine) {
        const qCekOnline = query(collection(db, 'pemeriksaan_records'), where('serialNumber', '==', finalSN));
        const snapCekOnline = await getDocs(qCekOnline);
        if (!snapCekOnline.empty) {
          const ex = snapCekOnline.docs[0].data();
          setError(`DITOLAK: Barang [${finalSN}] sudah pernah diperiksa pada tahap ${ex.tahap} oleh ${ex.petugas}.`);
          setIsCheckingSN(false); return; 
        }
      }
      setIsSnLocked(true);
    } catch (err) { console.error(err); setError("Terjadi gangguan saat memvalidasi SN. Periksa internet."); } 
    finally { setIsCheckingSN(false); }
  };

  const handleKategoriChange = (kategori, e) => {
    const file = e.target.files[0]; if (!file) return;
    const preview = URL.createObjectURL(file);
    setPhotos(prev => { const filtered = prev.filter(p => p.kategori !== kategori); return [...filtered, { id: Date.now().toString(), file, preview, kategori }]; });
  };

  const handleBulkChange = (e) => {
    const files = Array.from(e.target.files); if (files.length === 0) return;
    const newPhotos = files.map((file, i) => ({ id: `${Date.now()}_${i}`, file, preview: URL.createObjectURL(file), kategori: `Foto Pemeriksaan${i + 1}` }));
    setPhotos(prev => [...prev, ...newPhotos]);
  };

  const removePhoto = (id) => { setPhotos(prev => prev.filter(p => p.id !== id)); };
  const handleBatal = () => { setSerialNumber(''); setIsSnLocked(false); setPhotos([]); setError(''); };

  const handleSimpanData = async () => {
    if (uploadMode === 'kategori') {
      const isLengkap = KATEGORI_WAJIB.every(kat => photos.some(p => p.kategori === kat));
      if (!isLengkap) return setError("Mohon lengkapi seluruh 12 kategori foto wajib!");
    } else { if (photos.length === 0) return setError("Mohon unggah minimal 1 foto!"); }
    setIsUploading(true); setError('');
    try {
      const finalSerialNumber = serialNumber.trim().toUpperCase();
      const pemeriksaanId = `${user.assignedUnit}_${user.assignedTahap}_${finalSerialNumber}`;
      if (!navigator.onLine) {
        await dbLocal.antrean_pemeriksaan.add({ id: pemeriksaanId, unit: user.assignedUnit, tahap: user.assignedTahap, serialNumber: finalSerialNumber, petugas: user.username, timestamp: new Date().toISOString() });
        for (const p of photos) { await dbLocal.antrean_foto.add({ pemeriksaan_id: pemeriksaanId, kategori: p.kategori, file_blob: p.file }); }
        handleBatal(); setIsUploading(false); setNotifKerjaan({ isOpen: true, isOffline: true }); return;
      }
      const counterDocRef = doc(db, 'counters', `${user.assignedUnit}_${user.assignedTahap}`);
      let nomorUrutResmi = 1;
      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterDocRef);
        if (!counterDoc.exists()) { transaction.set(counterDocRef, { currentNumber: 1 }); nomorUrutResmi = 1; } 
        else { const newNumber = counterDoc.data().currentNumber + 1; transaction.update(counterDocRef, { currentNumber: newNumber }); nomorUrutResmi = newNumber; }
      });
      const processedPhotos = await Promise.all(photos.map(async (p, index) => { const base64 = await compressImage(p.file); return { kategori: p.kategori, filename: `${p.kategori}_${index + 1}.jpg`, base64: base64 }; }));
      const result = await fetchWithRetry(DRIVE_API_URL, { redirect: "follow", method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ unit: user.assignedUnit, tahap: user.assignedTahap, serialNumber: finalSerialNumber, nomorUrut: nomorUrutResmi, photos: processedPhotos }) }, 3, 15000);
      if (result.status === 'success') {
        await addDoc(collection(db, 'pemeriksaan_records'), { unit: user.assignedUnit, tahap: user.assignedTahap, nomorUrut: nomorUrutResmi, serialNumber: finalSerialNumber, formatTampil: `${nomorUrutResmi}. ${finalSerialNumber}`, petugas: user.username, timestamp: new Date().toISOString() });
        handleBatal(); setIsUploading(false); setNotifKerjaan({ isOpen: true, isOffline: false });
      } else { throw new Error(result.message); }
    } catch (err) { console.error(err); setError(`Gagal mengirim data: ${err.message}`); setIsUploading(false); }
  };

  const progressCount = uploadMode === 'kategori' ? KATEGORI_WAJIB.filter(kat => photos.some(p => p.kategori === kat)).length : photos.length;
  const progressPercent = uploadMode === 'kategori' ? Math.round((progressCount / KATEGORI_WAJIB.length) * 100) : (photos.length > 0 ? 100 : 0);
  const filteredLaporan = laporanRecords.filter(rec => rec.serialNumber?.toLowerCase().includes(searchLaporan.toLowerCase()) || rec.petugas?.toLowerCase().includes(searchLaporan.toLowerCase()));

  return (
    <div className="max-w-4xl mx-auto pb-24 font-sans relative select-none">
      
      {/* MODAL SCANNER HYBRID */}
      {isScanning && (
        <div className="fixed inset-0 bg-slate-900/95 z-[120] flex flex-col justify-center items-center backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl m-4 flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-4 bg-slate-800 flex justify-between items-center text-white shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">📷</span>
                <h3 className="font-bold text-sm tracking-wide">Pindai Serial Number</h3>
              </div>
              <button onClick={() => setIsScanning(false)} className="text-slate-300 hover:text-white bg-slate-700 hover:bg-red-500 rounded-full w-8 h-8 flex items-center justify-center transition-colors font-bold">✕</button>
            </div>
            
            {/* AREA VIDEO KAMERA */}
            <div className="relative bg-black w-full h-[360px] flex items-center justify-center overflow-hidden shrink-0">
              <video 
                ref={videoRef}
                className="w-full h-full object-cover" 
                muted
                playsInline
              />
              
              {/* TARGET BOX OVERLAY (Visual Guide) */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div style={{ width: `${boxWidth}px`, height: `${boxHeight}px` }} className="border-2 border-[#34A853] relative shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] transition-all duration-150">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-[#34A853] -mt-1 -ml-1"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-[#34A853] -mt-1 -mr-1"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-[#34A853] -mb-1 -ml-1"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-[#34A853] -mb-1 -mr-1"></div>
                  <div className="absolute w-full h-0.5 bg-red-500/90 top-1/2 left-0 transform -translate-y-1/2 animate-pulse shadow-[0_0_8px_rgba(239,68,68,1)]"></div>
                </div>
              </div>
            </div>

            {/* PANEL KONTROL UKURAN & SENTER */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-3 shrink-0">
              <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                <span>Sesuaikan Panduan Bidik:</span>
                <button type="button" onClick={toggleTorch} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-bold transition-all ${isTorchOn ? 'bg-amber-400 text-amber-900 border-amber-300 shadow-sm' : 'bg-slate-800 text-white border-transparent'}`}>
                  {isTorchOn ? '💡 Senter Menyala' : '🔦 Saklar Senter'}
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-black text-slate-400 pl-1 uppercase">Lebar</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setBoxWidth(w => Math.max(160, w - 20))} className="w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-lg font-black transition-colors">-</button>
                    <span className="font-mono text-xs font-black text-slate-700 w-12 text-center">{boxWidth}px</span>
                    <button type="button" onClick={() => setBoxWidth(w => Math.min(360, w + 20))} className="w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-lg font-black transition-colors">+</button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-black text-slate-400 pl-1 uppercase">Tinggi</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setBoxHeight(h => Math.max(40, h - 15))} className="w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-lg font-black transition-colors">-</button>
                    <span className="font-mono text-xs font-black text-slate-700 w-12 text-center">{boxHeight}px</span>
                    <button type="button" onClick={() => setBoxHeight(h => Math.min(200, h + 15))} className="w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-lg font-black transition-colors">+</button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL PILIHAN KAMERA/GALERI */}
      {mediaSheet.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[110] flex justify-center items-end sm:items-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 pb-10 sm:pb-6 shadow-2xl animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">Pilih Sumber Foto</h3>
                <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wide">{mediaSheet.kategori}</p>
              </div>
              <button onClick={() => setMediaSheet({isOpen:false, kategori:null})} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold hover:bg-slate-200 transition-colors">✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <label className="w-full flex items-center justify-center gap-3 bg-[#1A73E8] text-white py-4 rounded-2xl font-bold cursor-pointer hover:bg-[#1557B0] transition-colors shadow-sm active:scale-95">
                <span className="text-xl">📷</span> Ambil Foto Langsung
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { handleKategoriChange(mediaSheet.kategori, e); setMediaSheet({isOpen:false, kategori:null}); }} />
              </label>
              <label className="w-full flex items-center justify-center gap-3 bg-[#F8F9FA] text-slate-700 border border-slate-200 py-4 rounded-2xl font-bold cursor-pointer hover:bg-slate-100 transition-colors shadow-sm active:scale-95">
                <span className="text-xl">🖼️</span> Pilih dari Galeri HP
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleKategoriChange(mediaSheet.kategori, e); setMediaSheet({isOpen:false, kategori:null}); }} />
              </label>
            </div>
          </div>
        </div>
      )}

      {isUploading && (
        <div className="fixed inset-0 bg-white/95 z-[100] flex flex-col justify-center items-center backdrop-blur-sm transition-all">
          <div className="relative w-20 h-20 mb-6">
            <div className="absolute inset-0 rounded-full border-[3px] border-[#F1F3F4]"></div>
            <div className="absolute inset-0 rounded-full border-[3px] border-[#1A73E8] border-t-transparent animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center text-2xl animate-bounce">🚀</div>
          </div>
          <h2 className="text-xl font-bold text-slate-800 tracking-wide">Menyimpan Data...</h2>
          <p className="text-[#EA4335] text-xs font-bold mt-2 bg-red-50 px-3 py-1 rounded-full border border-red-100">Mohon tidak menutup halaman ini</p>
        </div>
      )}

      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div className="border-l-4 border-[#1A73E8] pl-4">
          <p className="text-[#1A73E8] text-xs font-extrabold uppercase tracking-widest mb-1">Penugasan Terkunci</p>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{user.assignedUnit} <span className="font-medium text-slate-400">| {user.assignedTahap}</span></h1>
        </div>
        <div className="flex bg-[#F1F3F4] p-1 rounded-full border border-slate-200 w-full sm:w-auto">
          <button onClick={() => setActiveTab('form')} className={`flex-1 sm:flex-none px-5 py-2 text-xs font-bold rounded-full transition-all ${activeTab === 'form' ? 'bg-white text-[#1A73E8] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>📝 Form Input</button>
          <button onClick={() => setActiveTab('laporan')} className={`flex-1 sm:flex-none px-5 py-2 text-xs font-bold rounded-full transition-all ${activeTab === 'laporan' ? 'bg-white text-[#1A73E8] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>📋 Riwayat Data</button>
        </div>
      </div>

      {activeTab === 'form' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {error && (
            <div className="mb-6 p-4 bg-[#FCE8E6] text-[#C5221F] rounded-2xl text-sm font-bold flex items-start gap-3 border border-[#FAD2CF] shadow-sm animate-in fade-in duration-200">
              <span className="text-lg leading-none">⚠️</span> <span>{error}</span>
            </div>
          )}

          <div className={`bg-white p-6 rounded-3xl border transition-all duration-300 mb-6 ${isSnLocked ? 'border-emerald-200 shadow-sm bg-emerald-50/10' : 'border-[#1A73E8]/60 shadow-[0_8px_30px_rgba(26,115,232,0.06)]'}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white ${isSnLocked ? 'bg-[#34A853]' : 'bg-[#1A73E8]'}`}>1</span>
                Identifikasi Serial Number
              </h2>
              {isSnLocked && (
                <button onClick={() => setIsSnLocked(false)} className="text-[#1A73E8] text-xs font-bold hover:underline bg-blue-50 px-3 py-1 rounded-full">Batal / Ganti SN</button>
              )}
            </div>

            {!isSnLocked ? (
              <form onSubmit={handleLockSN}>
                <div className="relative flex items-center mb-4">
                  <input 
                    type="text" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
                    placeholder="Ketik Serial Number..."
                    className="w-full pl-5 pr-14 py-3.5 bg-[#F8F9FA] border border-slate-200 rounded-2xl text-lg font-mono font-bold text-slate-800 outline-none focus:bg-white focus:border-[#1A73E8] focus:ring-1 focus:ring-[#1A73E8] transition-all uppercase placeholder:text-slate-300 placeholder:font-sans placeholder:font-normal"
                    autoFocus disabled={isCheckingSN}
                  />
                  <button type="button" onClick={() => setIsScanning(true)} disabled={isCheckingSN} className="absolute right-2 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-white bg-white hover:bg-[#1A73E8] border border-slate-200 hover:border-transparent rounded-xl transition-all shadow-sm group" title="Buka Kamera Scanner">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zM15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </button>
                </div>
                <button type="submit" disabled={isCheckingSN} className="px-6 py-2.5 bg-[#1A73E8] hover:bg-[#1557B0] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-full transition-colors shadow-sm flex items-center gap-2">
                  {isCheckingSN ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : 'Kunci & Verifikasi SN'}
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3 bg-[#F8F9FA] p-4 rounded-xl border border-slate-100">
                <div className="w-9 h-9 bg-[#E6F4EA] text-[#34A853] rounded-full flex items-center justify-center text-sm font-bold shadow-sm">✓</div>
                <div><p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Terverifikasi Unik & Terkunci</p><p className="text-xl font-mono font-black text-slate-800 tracking-wide">{serialNumber}</p></div>
              </div>
            )}
          </div>

          <div className={`transition-all duration-500 transform ${isSnLocked ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-40 translate-y-2 pointer-events-none'}`}>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.02)] mb-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2"><span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white ${progressPercent === 100 ? 'bg-[#34A853]' : 'bg-slate-400'}`}>2</span> Foto Kelengkapan</h2>
                <span className="text-xs font-bold text-slate-500 bg-[#F1F3F4] px-3 py-1 rounded-full font-mono">{progressCount} Item</span>
              </div>
              <div className="flex p-1 bg-[#F1F3F4] rounded-full mb-6 w-full sm:w-fit mx-auto border border-slate-200/50">
                <button onClick={() => { setUploadMode('kategori'); setPhotos([]); }} className={`flex-1 sm:px-8 py-2 text-xs font-bold rounded-full transition-all whitespace-nowrap ${uploadMode === 'kategori' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>📊 Form 12 Kategori</button>
                <button onClick={() => { setUploadMode('bulk'); setPhotos([]); }} className={`flex-1 sm:px-8 py-2 text-xs font-bold rounded-full transition-all whitespace-nowrap ${uploadMode === 'bulk' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>📂 Mode Cepat</button>
              </div>
              <div className="w-full h-1.5 bg-[#F1F3F4] rounded-full mb-8 overflow-hidden"><div className="h-full bg-[#1A73E8] rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div></div>

              {uploadMode === 'kategori' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {KATEGORI_WAJIB.map((kat) => {
                    const photo = photos.find(p => p.kategori === kat);
                    return (
                      <div key={kat} onClick={() => setMediaSheet({ isOpen: true, kategori: kat })} className={`relative flex flex-col items-center justify-center p-3 border ${photo ? 'border-[#34A853] bg-[#E6F4EA]/20' : 'border-slate-200 bg-white hover:bg-[#F8F9FA]'} rounded-2xl cursor-pointer transition-all h-28 overflow-hidden group`}
                      >
                        {photo ? (
                          <>
                            <img src={photo.preview} className="absolute inset-0 w-full h-full object-cover" alt={kat} />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-white text-[10px] font-bold bg-black/40 px-2 py-0.5 rounded-full">Ganti</span></div>
                            <div className="absolute top-1 right-1 bg-[#34A853] text-white rounded-full w-5 h-5 flex items-center justify-center shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg></div>
                          </>
                        ) : (
                          <><span className="text-[10px] font-bold text-slate-500 text-center leading-tight px-1">{kat}</span></>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div>
                  <label className="border border-dashed border-[#1A73E8]/40 bg-[#F8F9FA] rounded-2xl p-8 text-center flex flex-col items-center justify-center hover:bg-blue-50/20 transition-colors cursor-pointer group mb-6">
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleBulkChange} />
                    <div className="w-12 h-12 bg-white text-[#1A73E8] rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:scale-105 transition-transform mb-3">➕</div>
                    <h3 className="font-bold text-slate-700 text-sm">Pilih Dokumen Galeri</h3>
                  </label>
                  {photos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 animate-in fade-in duration-200">
                      {photos.map(p => (
                        <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 shadow-sm group">
                          <img src={p.preview} className="w-full h-full object-cover" alt="Preview" />
                          <button onClick={() => removePhoto(p.id)} className="absolute top-1 right-1 bg-white/90 hover:bg-[#EA4335] text-[#EA4335] w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-sm">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 justify-end px-1">
              <button onClick={handleBatal} className="px-5 py-2.5 rounded-full font-bold text-xs text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">Reset Form</button>
              <button onClick={handleSimpanData} disabled={isUploading || progressPercent !== 100} className="px-6 py-2.5 bg-[#1A73E8] hover:bg-[#1557B0] disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-xs rounded-full transition-all flex items-center gap-1.5 shadow-sm">
                <span>Kirim Berkas Pemeriksaan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'laporan' && (
        <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="p-5 sm:p-6 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row justify-between gap-4">
            <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">📋 Riwayat Data</h2>
            <input type="text" placeholder="Cari Serial Number / Petugas..." value={searchLaporan} onChange={(e) => setSearchLaporan(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-50 w-full sm:w-64" />
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-[#F8F9FA] border-b border-slate-100">
                <tr className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-4 px-6">Waktu Input</th><th className="py-4 px-6">Serial Number</th><th className="py-4 px-6">Unit / Tahap</th><th className="py-4 px-6">Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLaporanLoading ? (
                  <tr><td colSpan="4" className="py-12 text-center text-[#1A73E8] font-medium animate-pulse">Memuat riwayat pemeriksaan...</td></tr>
                ) : filteredLaporan.length === 0 ? (
                  <tr><td colSpan="4" className="py-12 text-center text-slate-400">Tidak ada data ditemukan.</td></tr>
                ) : (
                  filteredLaporan.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6 text-xs font-mono text-slate-500">{new Date(rec.timestamp).toLocaleString('id-ID', {day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit'})}</td>
                      <td className="py-4 px-6 font-mono font-black text-[#1A73E8]">{rec.serialNumber}</td>
                      <td className="py-4 px-6 font-bold text-slate-700">{rec.unit} <span className="font-medium text-slate-400 text-xs block mt-0.5">{rec.tahap}</span></td>
                      <td className="py-4 px-6 text-xs font-bold uppercase">{rec.petugas}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {notifKerjaan.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex justify-center items-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-300">
            <div className={`p-6 flex flex-col items-center text-center ${notifKerjaan.isOffline ? 'bg-amber-50' : 'bg-green-50'}`}>
              <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-4 shadow-inner ${notifKerjaan.isOffline ? 'bg-amber-100' : 'bg-green-100'}`}>
                {notifKerjaan.isOffline ? '📡' : '🎉'}
              </div>
              <h3 className={`text-xl font-extrabold tracking-tight mb-2 ${notifKerjaan.isOffline ? 'text-amber-800' : 'text-green-800'}`}>
                {notifKerjaan.isOffline ? 'Tersimpan Offline!' : 'Berhasil Terkirim!'}
              </h3>
              <p className="text-sm font-medium text-slate-600 leading-relaxed px-2">
                {notifKerjaan.isOffline ? 'Data & foto disimpan aman di memori HP. Sistem akan mengunggahnya otomatis saat internet tersedia.' : 'Pekerjaan ini sudah diunggah ke server dan folder Drive dengan aman.'}
              </p>
            </div>
            <div className="p-5 bg-white border-t border-slate-100">
              <button onClick={() => setNotifKerjaan({ isOpen: false, isOffline: false })} className={`w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all shadow-md ${notifKerjaan.isOffline ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'}`}>Oke, Lanjut Bekerja</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}