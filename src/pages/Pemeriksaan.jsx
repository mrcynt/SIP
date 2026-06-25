import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { collection, addDoc, runTransaction, doc, query, where, getDocs, orderBy } from 'firebase/firestore';
import { dbLocal } from '../db/offlineDB';
import { fetchWithRetry } from '../utils/network';
import { BrowserMultiFormatReader } from '@zxing/browser';
import html2pdf from 'html2pdf.js';

const DRIVE_API_URL = "https://script.google.com/macros/s/AKfycbyJwmBp6pfgIgO9jSOl-RbQ6RMBTQPUX0zJFd_3TYqQ-egca9WNOImoKrLYW6PkQUDBYQ/exec";

// =======================================================
// MASTER DATA IFP
// =======================================================
const CEKLIS_FISIK = [
  { id: "f1", label: "Kemasan tanpa kerusakan atau cacat fisik" },
  { id: "f2", label: "Serial number pada kemasan sama dengan pada perangkat" },
  { id: "f3", label: "Alat merupakan barang baru" },
  { id: "f4", label: "Alat kuat dan kokoh" },
  { id: "f5", label: "Alat tanpa kerusakan atau cacat fisik" },
  { id: "f6", label: "Alat memiliki identitas permanen (lambang/merk) dari produsen" }
];

const CEKLIS_KELENGKAPAN = [
  { id: "k1", label: "Kartu Garansi" },
  { id: "k2", label: "Petunjuk Instalasi atau Petunjuk Operasi dan video tutorial penggunaan" },
  { id: "k3", label: "Kabel Power (1 pcs)" },
  { id: "k4", label: "Kabel HDMI 3 Meter (1 pcs)" },
  { id: "k5", label: "Kabel USB-A to USB-B 3 Meter (1 pcs)" },
  { id: "k6", label: "Remote + Baterai A3 (2 pcs)" },
  { id: "k7", label: "Pena Stylus (2 pcs)" }
];

const CEKLIS_SPESIFIKASI = [
  { id: "s1", label: "Merk", spek: "Hisense" },
  { id: "s2", label: "Tipe", spek: "75WM61FE" },
  { id: "s3", label: "Processor", spek: "AMLA311D2 Octa Core (4x2.21 Ghz Cortex-A73 & 4x2.02 Ghz Cortex-A53) GPU Mali-G52" },
  { id: "s4", label: "Memory", spek: "16 GB" },
  { id: "s5", label: "Kapasitas Penyimpanan", spek: "256 GB" },
  { id: "s6", label: "Layar Monitor", spek: "75 Inch" },
  { id: "s7", label: "Layar Sentuh", spek: "Ya" },
  { id: "s8", label: "OS", spek: "Android 13" },
  { id: "s9", label: "Audio", spek: "Terintegrasi" },
  { id: "s10", label: "Kamera", spek: "Ya, terintegrasi dan dilengkapi pelindung/pengaman" },
  { id: "s11", label: "Power Supply/Daya", spek: "440 Watt" },
  { id: "s12", label: "Konektivitas", spek: "Support Wifi 6, LAN, Bluetooth" },
  { id: "s13", label: "IO/Ports", spek: "USBType A 3 port, USB Type B, USB Type C 1 port , HDMI In 3 port, HDMI Out 1 port, Lan 1 port, Audio 1 port, Data 1 port" },
  { id: "s14", label: "Garansi", spek: "3 Tahun" }
];

const CEKLIS_OPERASIONAL = [
  { id: "o1", label: "Tombol Power dan Lampu Indikator berfungsi dengan baik" },
  { id: "o2", label: "OS dapat dioperasikan" },
  { id: "o3", label: "USB Type A (3) (Bagian Depan)", isSub: true },
  { id: "o4", label: "HDMI In (1) (Bagian Depan)", isSub: true },
  { id: "o5", label: "USB Type C (1) (Bagian Depan)", isSub: true },
  { id: "o6", label: "Line Out (1) (Bagian Belakang)", isSub: true },
  { id: "o7", label: "HDMI In 1 (1) (Bagian Belakang)", isSub: true },
  { id: "o8", label: "HDMI In 2 (1) (Bagian Belakang)", isSub: true },
  { id: "o9", label: "HDMI Out (1) (Bagian Belakang)", isSub: true },
  { id: "o10", label: "LAN Port (1) (Bagian Belakang)", isSub: true },
  { id: "o11", label: "USB Type A (1) (Bagian Belakang)", isSub: true },
  { id: "o12", label: "USB type B/Touch (1) (Bagian Belakang)", isSub: true },
  { id: "o13", label: "LAN RS232-1 (1) (Bagian Belakang Kiri Bawah)", isSub: true, defaultState: "-", defaultKet: "Tidak dilakukan karena membutuhkan alat khusus seperti mesin CNC dan sejenisnya" },
  { id: "o14", label: "LAN RS232-2 (1) (Bagian Belakang Kiri Bawah)", isSub: true, defaultState: "-", defaultKet: "Tidak dilakukan karena hanya untuk maintenance pihak vendor" },
  { id: "o15", label: "Line In (1) (Bagian Belakang Kiri Bawah)", isSub: true, defaultState: "-", defaultKet: "Tidak dilakukan karena alat pemeriksaan tidak tersedia." },
  { id: "o16", label: "Handle (Pegangan IFP) (2)" },
  { id: "o17", label: "Pengaturan layar ( brightness, contras , dll)", isSub: true },
  { id: "o18", label: "Fitur Papan Tulis Digital dapat dioperasikan" },
  { id: "o19", label: "Fitur Multi Finger" },
  { id: "o20", label: "Fitur multi touch" },
  { id: "o21", label: "Pena Stilus" },
  { id: "o22", label: "Keyboard digital (karakter dalam alfabet latin)" },
  { id: "o23", label: "Fitur Berbagi Layar dengan kabel dapat dioperasikan (Fitur mirror screening)" },
  { id: "o24", label: "Fitur Berbagi Layar tanpa kabel dapat dioperasikan (Fitur mirror screening)" },
  { id: "o25", label: "Koneksi Wifi", isSub: true },
  { id: "o26", label: "Koneksi Hotspot", isSub: true },
  { id: "o27", label: "Koneksi Bluetooth", isSub: true },
  { id: "o28", label: "Menambahkan Akun", isSub: true },
  { id: "o29", label: "Update Sistem", isSub: true },
  { id: "o30", label: "Keberfungsian Kamera" },
  { id: "o31", label: "Menambahkan Aplikasi (Hwinfo / CPU-Z)" },
  { id: "o32", label: "Output Audio dapat berfungsi dengan baik", isSub: true },
  { id: "o33", label: "Pengaturan Suara dapat berfungsi dengan baik", isSub: true }
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
  
  const [isPengganti, setIsPengganti] = useState(false);

  const [uploadMode, setUploadMode] = useState('kategori'); 
  const [photos, setPhotos] = useState([]); 
  const [mediaSheet, setMediaSheet] = useState({ isOpen: false, kategori: null });
  
  const [previewPhoto, setPreviewPhoto] = useState(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  const [laporanRecords, setLaporanRecords] = useState([]);
  const [isLaporanLoading, setIsLaporanLoading] = useState(false);
  const [searchLaporan, setSearchLaporan] = useState('');

  const [kategoriWajib, setKategoriWajib] = useState([]);
  const [ifpData, setIfpData] = useState({});

  const [isScanning, setIsScanning] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [boxWidth, setBoxWidth] = useState(340);
  const [boxHeight, setBoxHeight] = useState(140);
  
  const videoRef = useRef(null);
  const scannerTrackRef = useRef(null);
  const pdfOutputRef = useRef(null);

  useEffect(() => {
    if(!user?.assignedUnit) return;
    const fetchDokumentasi = async () => {
      try {
        const q = query(collection(db, 'dokumentasi_wajib'), where('unit', '==', user.assignedUnit));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => d.data().name);
        setKategoriWajib(list.length > 0 ? list : ["Foto Fisik Depan", "Foto Serial Number"]);
      } catch (e) {}
    };
    fetchDokumentasi();
  }, [user]);

  useEffect(() => {
    const initIfp = {};
    const allItems = [...CEKLIS_FISIK, ...CEKLIS_KELENGKAPAN, ...CEKLIS_SPESIFIKASI, ...CEKLIS_OPERASIONAL];
    allItems.forEach(item => {
      initIfp[item.id] = { status: item.defaultState || null, ket: item.defaultKet || '' };
    });
    setIfpData(initIfp);

    window.history.pushState(null, null, window.location.pathname);
    const handleBackButton = (e) => {
      if (!window.confirm("Apakah kamu yakin ingin keluar dari halaman Pemeriksaan?")) {
        window.history.pushState(null, null, window.location.pathname);
      } else { window.history.back(); }
    };
    window.addEventListener('popstate', handleBackButton);
    return () => { window.removeEventListener('popstate', handleBackButton); };
  }, []);

  const handleCheckAll = () => {
    const updatedIfp = { ...ifpData };
    const allItems = [...CEKLIS_FISIK, ...CEKLIS_KELENGKAPAN, ...CEKLIS_SPESIFIKASI, ...CEKLIS_OPERASIONAL];
    allItems.forEach(item => {
      if (!item.defaultState) updatedIfp[item.id] = { status: 'sesuai', ket: '' };
    });
    setIfpData(updatedIfp);
  };

  const handleUncheckAll = () => {
    const updatedIfp = { ...ifpData };
    const allItems = [...CEKLIS_FISIK, ...CEKLIS_KELENGKAPAN, ...CEKLIS_SPESIFIKASI, ...CEKLIS_OPERASIONAL];
    allItems.forEach(item => {
      if (!item.defaultState) updatedIfp[item.id] = { status: null, ket: '' };
    });
    setIfpData(updatedIfp);
  };

  const handleIfpChange = (id, field, value) => {
    setIfpData(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  useEffect(() => {
    if (!isScanning) return;
    const codeReader = new BrowserMultiFormatReader();
    let localStream = null;
    let isScanned = false; 
    let scanTimeout = null;
    setIsTorchOn(false);

    const startScanner = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = localStream;
        videoRef.current.setAttribute("playsinline", true);
        await videoRef.current.play();
        scannerTrackRef.current = localStream.getVideoTracks()[0];

        const scanFrame = async () => {
          if (isScanned || !videoRef.current) return;
          try {
            const result = await codeReader.decodeOnceFromVideoElement(videoRef.current);
            if (result && !isScanned) {
              isScanned = true;
              setSerialNumber(result.text.trim().toUpperCase());
              setTimeout(() => { setIsScanning(false); }, 200);
              return; 
            }
          } catch (err) {}
          if (!isScanned) scanTimeout = setTimeout(scanFrame, 150);
        };
        scanFrame();
      } catch (err) { setError("Kamera gagal diakses."); setIsScanning(false); }
    };
    startScanner();

    return () => {
      isScanned = true;
      if (scanTimeout) clearTimeout(scanTimeout);
      if (localStream) localStream.getTracks().forEach(track => track.stop());
      scannerTrackRef.current = null;
    };
  }, [isScanning]);

  const toggleTorch = async () => {
    try {
      const track = scannerTrackRef.current;
      if (!track) return alert("Kamera belum siap.");
      const nextState = !isTorchOn;
      await track.applyConstraints({ advanced: [{ torch: nextState }] });
      setIsTorchOn(nextState);
    } catch (err) { alert("Senter gagal dinyalakan."); }
  };

  // --- PERBAIKAN BUG PREVIEW FOTO ---
  // Kita HAPUS useEffect yang sebelumnya merusak memori foto.
  // Pembersihan memori akan dilakukan secara langsung saat foto diganti, dihapus, atau di-reset.

  const handleKategoriChange = (kategori, e) => {
    const file = e.target.files[0]; if (!file) return;
    setPhotos(prev => {
      // Bersihkan preview lama dari memori jika fotonya ditimpa
      const existingPhoto = prev.find(p => p.kategori === kategori);
      if (existingPhoto) URL.revokeObjectURL(existingPhoto.preview);
      
      return [...prev.filter(p => p.kategori !== kategori), { id: Date.now().toString(), file, preview: URL.createObjectURL(file), kategori }];
    });
  };

  const handleBulkChange = (e) => {
    const files = Array.from(e.target.files); if (files.length === 0) return;
    setPhotos(prev => {
      const existingIds = new Set(prev.map(p => p.file.name + p.file.size));
      const newFiles = files.filter(f => !existingIds.has(f.name + f.size)).map((file, i) => ({ id: `${Date.now()}_${i}`, file, preview: URL.createObjectURL(file), kategori: `Foto Tambahan ${prev.length + i + 1}` }));
      return [...prev, ...newFiles];
    });
  };

  const removePhoto = (id) => { 
    setPhotos(prev => {
      // Bersihkan preview dari memori sebelum dihapus dari state
      const photoToDelete = prev.find(p => p.id === id);
      if (photoToDelete) URL.revokeObjectURL(photoToDelete.preview);
      
      return prev.filter(p => p.id !== id);
    }); 
  };
  
  const handleBatal = () => { 
    setSerialNumber(''); setIsSnLocked(false); setError(''); setIsPengganti(false);
    
    // Bersihkan semua preview dari memori sebelum reset array
    photos.forEach(p => URL.revokeObjectURL(p.preview));
    setPhotos([]); 

    const resetIfp = {};
    [...CEKLIS_FISIK, ...CEKLIS_KELENGKAPAN, ...CEKLIS_SPESIFIKASI, ...CEKLIS_OPERASIONAL].forEach(item => { resetIfp[item.id] = { status: item.defaultState || null, ket: item.defaultKet || '' }; });
    setIfpData(resetIfp);
  };

  useEffect(() => { if (activeTab === 'laporan') fetchLaporan(); }, [activeTab]);

  const fetchLaporan = async () => {
    setIsLaporanLoading(true);
    try {
      const qRec = query(collection(db, 'pemeriksaan_records'), orderBy('timestamp', 'desc'));
      const snap = await getDocs(qRec);
      setLaporanRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {} finally { setIsLaporanLoading(false); }
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
      if (cekLokal.some(item => item.serialNumber === finalSN)) { setError(`DITOLAK: SN [${finalSN}] sudah ada di antrean offline Anda!`); setIsCheckingSN(false); return; }
      if (navigator.onLine) {
        const snapCekOnline = await getDocs(query(collection(db, 'pemeriksaan_records'), where('serialNumber', '==', finalSN)));
        if (!snapCekOnline.empty) { const ex = snapCekOnline.docs[0].data(); setError(`DITOLAK: Barang [${finalSN}] sudah pernah diperiksa.`); setIsCheckingSN(false); return; }
      }
      setIsSnLocked(true);
    } catch (err) { setError("Terjadi gangguan saat memvalidasi SN."); } finally { setIsCheckingSN(false); }
  };

  const handleSimpanData = async () => {
    if (uploadMode === 'kategori') {
      if (!kategoriWajib.every(kat => photos.some(p => p.kategori === kat))) return setError(`Mohon lengkapi seluruh ${kategoriWajib.length} kategori foto wajib!`);
    } else { if (photos.length === 0) return setError("Mohon unggah minimal 1 foto!"); }
    
    if (user.assignedUnit === 'IFP') {
      const allItems = [...CEKLIS_FISIK, ...CEKLIS_KELENGKAPAN, ...CEKLIS_SPESIFIKASI, ...CEKLIS_OPERASIONAL];
      const incomplete = allItems.find(item => !item.defaultState && ifpData[item.id]?.status === null);
      if (incomplete) return setError(`Mohon lengkapi Form IFP. Bagian [${incomplete.label}] belum diisi!`);
    }

    setIsUploading(true); setError('');
    try {
      const finalSerialNumber = serialNumber.trim().toUpperCase();
      const pemeriksaanId = `${user.assignedUnit}_${user.assignedTahap}_${finalSerialNumber}`;
      
      const pdfElement = pdfOutputRef.current;
      const opt = {
        margin:       0.4,
        filename:     `Laporan_${finalSerialNumber}.pdf`,
        image:        { type: 'jpeg', quality: 1 },
        html2canvas:  { scale: 4, useCORS: true, logging: false }, 
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
      };
      
      let pdfBase64Data = null;
      if (user.assignedUnit === 'IFP') {
        pdfBase64Data = await html2pdf().set(opt).from(pdfElement).outputPdf('datauristring');
      }

      if (!navigator.onLine) {
        await dbLocal.antrean_pemeriksaan.add({ id: pemeriksaanId, unit: user.assignedUnit, tahap: user.assignedTahap, serialNumber: finalSerialNumber, petugas: user.namaLengkap || user.username, timestamp: new Date().toISOString(), ifpData: JSON.stringify(ifpData), isPengganti: isPengganti });
        for (const p of photos) { await dbLocal.antrean_foto.add({ pemeriksaan_id: pemeriksaanId, kategori: p.kategori, file_blob: p.file }); }
        handleBatal(); setIsUploading(false); setNotifKerjaan({ isOpen: true, isOffline: true }); return;
      }

      const counterDocRef = doc(db, 'counters', `${user.assignedUnit}_${user.assignedTahap}`);
      let nomorUrutResmi = 1;
      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterDocRef);
        if (!counterDoc.exists()) { transaction.set(counterDocRef, { currentNumber: 1 }); } 
        else { nomorUrutResmi = counterDoc.data().currentNumber + 1; transaction.update(counterDocRef, { currentNumber: nomorUrutResmi }); }
      });
      
      const processedPhotos = await Promise.all(photos.map(async (p, idx) => ({ 
        kategori: p.kategori, filename: `${p.kategori}_${idx + 1}.jpg`, base64: await compressImage(p.file), mimeType: 'image/jpeg' 
      })));

      if (pdfBase64Data) {
        processedPhotos.push({
          kategori: 'Laporan_PDF',
          filename: `Laporan_IFP_${finalSerialNumber}.pdf`,
          base64: pdfBase64Data, 
          mimeType: 'application/pdf'
        });
      }

      const result = await fetchWithRetry(DRIVE_API_URL, { 
        redirect: "follow", method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, 
        body: JSON.stringify({
            unit: user.assignedUnit,
            tahap: user.assignedTahap,
            serialNumber: finalSerialNumber,
            nomorUrut: nomorUrutResmi,
            petugas: user.namaLengkap || user.username,
            photos: processedPhotos
          }) 
      }, 1, 60000); 
      
      if (result.status === 'success') {
        await addDoc(collection(db, 'pemeriksaan_records'), { 
          unit: user.assignedUnit, 
          tahap: user.assignedTahap, 
          nomorUrut: nomorUrutResmi, 
          serialNumber: finalSerialNumber, 
          formatTampil: `${nomorUrutResmi}. ${finalSerialNumber}`, 
          petugas: user.namaLengkap || user.username, 
          timestamp: new Date().toISOString(), 
          ifpData: JSON.stringify(ifpData),
          driveUrl: result.driveUrl,
          isPengganti: isPengganti,
          linkedErrorSN: null
        });
        handleBatal(); setIsUploading(false); setNotifKerjaan({ isOpen: true, isOffline: false });
      } else { throw new Error(result.message); }
    } catch (err) { setError(`Gagal mengirim: ${err.message}`); setIsUploading(false); }
  };

  const progressCount = uploadMode === 'kategori' ? kategoriWajib.filter(kat => photos.some(p => p.kategori === kat)).length : photos.length;
  const progressPercent = uploadMode === 'kategori' ? Math.round((progressCount / kategoriWajib.length) * 100) : (photos.length > 0 ? 100 : 0);
  const filteredLaporan = laporanRecords.filter(rec => rec.serialNumber?.toLowerCase().includes(searchLaporan.toLowerCase()) || rec.petugas?.toLowerCase().includes(searchLaporan.toLowerCase()));

  const currentDateFormatted = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      {/* ========================================================= */}
      {/* TEMPLATE PDF TERSEMBUNYI (HIDDEN) UNTUK DIKONVERSI HTML2PDF */}
      {/* ========================================================= */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '800px', backgroundColor: 'white' }}>
        <div ref={pdfOutputRef} style={{ padding: '20px', fontFamily: 'serif', color: 'black', fontSize: '14px', lineHeight: '1.4', backgroundColor: 'white' }}>
          
          <h1 style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '18px', marginBottom: '20px' }}>Instrumen Pemeriksaan Peralatan Digitalisasi Pembelajaran (IFP)</h1>
          
          <table style={{ width: '100%', marginBottom: '20px' }}>
            <tbody>
              <tr><td style={{ width: '200px' }}>Nama Perusahaan</td><td>: PT Hisense International Indonesia</td></tr>
              <tr><td>Tanggal Pemeriksaan</td><td>: {currentDateFormatted}</td></tr>
              <tr><td style={{ verticalAlign: 'top' }}>Tempat</td><td>: Kawasan Industri SKI PT. Global Anugerah Setia (GAS). Jalan. Purwakarta, Sukajaya, Kec. Sukatani, Kabupaten Purwakarta, Jawa Barat 41167</td></tr>
              <tr><td>Nama Pemeriksa</td><td style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>: {user.namaLengkap || user.username}</td></tr>
              <tr><td>Nama Item Barang</td><td>: Interactive Flat Panel (IFP) {isPengganti && "(UNIT PENGGANTI)"}</td></tr>
              <tr><td>Merk, Tipe</td><td>: 75WM61FE</td></tr>
              <tr><td>No Seri Fisik</td><td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>: {serialNumber || '............................'}</td></tr>
              <tr><td>No Seri pada kemasan Dus</td><td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>: {serialNumber || '............................'}</td></tr>
            </tbody>
          </table>

          {/* PAGE 1: Fisik & Kelengkapan */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', border: '1px solid black' }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left', width: '60%' }}>Kondisi Fisik, IFP</th>
                <th style={{ border: '1px solid black', padding: '8px', textAlign: 'center', width: '20%' }}>Ya (√) / Tidak (×)</th>
                <th style={{ border: '1px solid black', padding: '8px', textAlign: 'center', width: '20%' }}>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {CEKLIS_FISIK.map(item => (
                <tr key={item.id}>
                  <td style={{ border: '1px solid black', padding: '8px' }}>{item.label}</td>
                  <td style={{ border: '1px solid black', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{ifpData[item.id]?.status === 'sesuai' ? '√' : ifpData[item.id]?.status === 'tidak' ? '×' : ifpData[item.id]?.status === '-' ? '-' : ''}</td>
                  <td style={{ border: '1px solid black', padding: '8px', fontSize: '12px' }}>{ifpData[item.id]?.ket}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', border: '1px solid black' }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left', width: '60%' }}>Kelengkapan Dokumen dan Aksesori IFP</th>
                <th style={{ border: '1px solid black', padding: '8px', textAlign: 'center', width: '20%' }}>Ada (√) / Tidak Ada (×)</th>
                <th style={{ border: '1px solid black', padding: '8px', textAlign: 'center', width: '20%' }}>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {CEKLIS_KELENGKAPAN.map(item => (
                <tr key={item.id}>
                  <td style={{ border: '1px solid black', padding: '8px' }}>{item.label}</td>
                  <td style={{ border: '1px solid black', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{ifpData[item.id]?.status === 'sesuai' ? '√' : ifpData[item.id]?.status === 'tidak' ? '×' : ifpData[item.id]?.status === '-' ? '-' : ''}</td>
                  <td style={{ border: '1px solid black', padding: '8px', fontSize: '12px' }}>{ifpData[item.id]?.ket}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* BREAK PAGE UNTUK PDF */}
          <div className="html2pdf__page-break"></div>

          {/* PAGE 2: Kesesuaian Spesifikasi */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', border: '1px solid black' }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }} colSpan={2}>Spesifikasi Barang yang akan dikirim</th>
                <th style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }} colSpan={2}>Hasil Pemeriksaan</th>
              </tr>
              <tr style={{ backgroundColor: '#f3f4f6', fontSize: '12px' }}>
                <th style={{ border: '1px solid black', padding: '6px', textAlign: 'center' }}>Fitur</th>
                <th style={{ border: '1px solid black', padding: '6px', textAlign: 'center' }}>Spesifikasi Target</th>
                <th style={{ border: '1px solid black', padding: '6px', textAlign: 'center' }}>Sesuai (√) / Tidak (×)</th>
                <th style={{ border: '1px solid black', padding: '6px', textAlign: 'center' }}>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {CEKLIS_SPESIFIKASI.map(item => (
                <tr key={item.id}>
                  <td style={{ border: '1px solid black', padding: '6px', fontWeight: 'bold' }}>{item.label}</td>
                  <td style={{ border: '1px solid black', padding: '6px' }}>{item.spek}</td>
                  <td style={{ border: '1px solid black', padding: '6px', textAlign: 'center', fontWeight: 'bold', fontSize: '16px' }}>{ifpData[item.id]?.status === 'sesuai' ? '√' : ifpData[item.id]?.status === 'tidak' ? '×' : ifpData[item.id]?.status === '-' ? '-' : ''}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '12px' }}>{ifpData[item.id]?.ket}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* BREAK PAGE UNTUK PDF */}
          <div className="html2pdf__page-break"></div>

          {/* PAGE 3: Operasional */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', border: '1px solid black' }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left', width: '60%' }}>Pemeriksaan Operasional</th>
                <th style={{ border: '1px solid black', padding: '8px', textAlign: 'center', width: '20%' }}>Ya (√) / Tidak (×)</th>
                <th style={{ border: '1px solid black', padding: '8px', textAlign: 'center', width: '20%' }}>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {CEKLIS_OPERASIONAL.map(item => (
                <tr key={item.id}>
                  <td style={{ border: '1px solid black', padding: '6px', paddingLeft: item.isSub ? '20px' : '6px', fontWeight: item.isSub ? 'normal' : 'bold', fontSize: item.isSub ? '12px' : '14px' }}>{item.label}</td>
                  <td style={{ border: '1px solid black', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>{ifpData[item.id]?.status === 'sesuai' ? '√' : ifpData[item.id]?.status === 'tidak' ? '×' : ifpData[item.id]?.status === '-' ? '-' : ''}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '11px' }}>{ifpData[item.id]?.ket}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Tanda Tangan */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ marginBottom: '60px' }}>Purwakarta, {currentDateFormatted}<br/>Pemeriksa,</p>
              <p style={{ fontWeight: 'bold', textDecoration: 'underline', textTransform: 'uppercase' }}>( {user.namaLengkap || user.username} )</p>
            </div>
          </div>

          {/* PAGE TAMBAHAN: LAMPIRAN FOTO DI UJUNG PDF */}
          {photos.length > 0 && (
            <div>
              <div className="html2pdf__page-break"></div>
              <h2 style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '16px', margin: '20px 0' }}>LAMPIRAN FOTO DOKUMENTASI</h2>
              <div style={{ display: 'block', width: '100%' }}>
                {photos.map((p) => (
                  <div key={p.id} style={{ display: 'inline-block', width: '48%', margin: '1%', border: '1px solid #000', padding: '10px', boxSizing: 'border-box', verticalAlign: 'top', breakInside: 'avoid' }}>
                    <img src={p.preview} style={{ width: '100%', height: '200px', objectFit: 'contain' }} alt={p.kategori} />
                    <p style={{ fontSize: '12px', fontWeight: 'bold', textAlign: 'center', marginTop: '8px' }}>{p.kategori}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ========================================================= */}
      {/* TAMPILAN APLIKASI WEB NORMAL */}
      {/* ========================================================= */}
      <div className="max-w-4xl mx-auto pb-24 font-sans relative select-none">
        
        {/* MODAL SCANNER */}
        {isScanning && (
          <div className="fixed inset-0 bg-slate-900/95 z-[120] flex flex-col justify-center items-center backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl m-4 flex flex-col animate-in zoom-in-95 duration-300">
              <div className="p-4 bg-slate-800 flex justify-between items-center text-white shrink-0"><div className="flex items-center gap-2"><span className="text-xl">📷</span><h3 className="font-bold text-sm tracking-wide">Pindai Serial Number</h3></div><button onClick={() => setIsScanning(false)} className="text-slate-300 hover:text-white bg-slate-700 hover:bg-red-500 rounded-full w-8 h-8 flex items-center justify-center transition-colors font-bold">✕</button></div>
              <div className="relative bg-black w-full h-[360px] flex items-center justify-center overflow-hidden shrink-0">
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><div style={{ width: `${boxWidth}px`, height: `${boxHeight}px` }} className="border-2 border-[#34A853] relative shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]"><div className="absolute w-full h-0.5 bg-red-500/90 top-1/2 left-0 transform -translate-y-1/2 animate-pulse"></div></div></div>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-3 shrink-0"><div className="flex justify-between items-center text-xs font-bold text-slate-600"><span>Sesuaikan Panduan Bidik:</span><button type="button" onClick={toggleTorch} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-bold transition-all ${isTorchOn ? 'bg-amber-400 text-amber-900 border-amber-300 shadow-sm' : 'bg-slate-800 text-white border-transparent'}`}>{isTorchOn ? '💡 Matikan Senter' : '🔦 Saklar Senter'}</button></div><div className="grid grid-cols-2 gap-3"><div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200"><span className="text-[11px] font-black text-slate-400 pl-1 uppercase">Lebar</span><div className="flex items-center gap-2"><button type="button" onClick={() => setBoxWidth(w => Math.max(160, w - 20))} className="w-8 h-8 bg-slate-100 text-slate-800 rounded-lg text-lg font-black">-</button><span className="font-mono text-xs font-black text-slate-700 w-12 text-center">{boxWidth}px</span><button type="button" onClick={() => setBoxWidth(w => Math.min(360, w + 20))} className="w-8 h-8 bg-slate-100 text-slate-800 rounded-lg text-lg font-black">+</button></div></div><div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200"><span className="text-[11px] font-black text-slate-400 pl-1 uppercase">Tinggi</span><div className="flex items-center gap-2"><button type="button" onClick={() => setBoxHeight(h => Math.max(40, h - 15))} className="w-8 h-8 bg-slate-100 text-slate-800 rounded-lg text-lg font-black">-</button><span className="font-mono text-xs font-black text-slate-700 w-12 text-center">{boxHeight}px</span><button type="button" onClick={() => setBoxHeight(h => Math.min(200, h + 15))} className="w-8 h-8 bg-slate-100 text-slate-800 rounded-lg text-lg font-black">+</button></div></div></div></div>
            </div>
          </div>
        )}

        {/* MODAL PILIH SUMBER FOTO */}
        {mediaSheet.isOpen && (
          <div className="fixed inset-0 bg-slate-900/60 z-[110] flex justify-center items-end sm:items-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 pb-10 sm:pb-6 shadow-2xl animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300"><div className="flex justify-between items-center mb-6"><div><h3 className="font-extrabold text-slate-800 text-lg">Pilih Sumber Foto</h3><p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wide">{mediaSheet.kategori}</p></div><button onClick={() => setMediaSheet({isOpen:false, kategori:null})} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold hover:bg-slate-200 transition-colors">✕</button></div><div className="flex flex-col gap-3"><label className="w-full flex items-center justify-center gap-3 bg-[#1A73E8] text-white py-4 rounded-2xl font-bold cursor-pointer hover:bg-[#1557B0] transition-colors shadow-sm active:scale-95"><span className="text-xl">📷</span> Ambil Foto Langsung<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { handleKategoriChange(mediaSheet.kategori, e); setMediaSheet({isOpen:false, kategori:null}); }} /></label><label className="w-full flex items-center justify-center gap-3 bg-[#F8F9FA] text-slate-700 border border-slate-200 py-4 rounded-2xl font-bold cursor-pointer hover:bg-slate-100 transition-colors shadow-sm active:scale-95"><span className="text-xl">🖼️</span> Pilih dari Galeri HP<input type="file" accept="image/*" className="hidden" onChange={(e) => { handleKategoriChange(mediaSheet.kategori, e); setMediaSheet({isOpen:false, kategori:null}); }} /></label></div></div>
          </div>
        )}

        {/* MODAL PREVIEW FOTO FULL SCREEN */}
        {previewPhoto && (
          <div className="fixed inset-0 bg-black/90 z-[130] flex flex-col justify-center items-center backdrop-blur-md animate-in fade-in duration-300">
            {/* Header Toolbar */}
            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent flex justify-between items-center z-10">
               <div>
                  <p className="text-white/70 text-xs font-bold uppercase tracking-widest">Kategori Foto</p>
                  <h3 className="text-white font-black text-lg">{previewPhoto.kategori}</h3>
               </div>
               <button onClick={() => setPreviewPhoto(null)} className="w-10 h-10 bg-white/20 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-xl transition-colors backdrop-blur-sm">✕</button>
            </div>
            
            {/* Image Container */}
            <div className="w-full h-full p-4 flex items-center justify-center mt-8">
               <img src={previewPhoto.preview} alt="Preview Full" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95" />
            </div>

            {/* Tombol Aksi Bawah */}
            <div className="absolute bottom-8 flex gap-4 z-10">
               <button 
                 onClick={() => { setMediaSheet({ isOpen: true, kategori: previewPhoto.kategori }); setPreviewPhoto(null); }} 
                 className="px-6 py-3 bg-white text-slate-800 rounded-full font-bold shadow-lg hover:bg-slate-100 transition-colors"
               >
                 🔄 Ganti Foto
               </button>
               {uploadMode === 'bulk' && (
                 <button 
                   onClick={() => { removePhoto(previewPhoto.id); setPreviewPhoto(null); }} 
                   className="px-6 py-3 bg-red-500 text-white rounded-full font-bold shadow-lg hover:bg-red-600 transition-colors"
                 >
                   🗑️ Hapus Foto
                 </button>
               )}
            </div>
          </div>
        )}

        {/* LOADING UPLOAD OVERLAY */}
        {isUploading && (
          <div className="fixed inset-0 bg-white/95 z-[100] flex flex-col justify-center items-center backdrop-blur-sm transition-all"><div className="relative w-20 h-20 mb-6"><div className="absolute inset-0 rounded-full border-[3px] border-[#F1F3F4]"></div><div className="absolute inset-0 rounded-full border-[3px] border-[#1A73E8] border-t-transparent animate-spin"></div><div className="absolute inset-0 flex items-center justify-center text-2xl animate-bounce">🚀</div></div><h2 className="text-xl font-bold text-slate-800 tracking-wide text-center">Menyimpan &<br/>Mengirim PDF ke Drive...</h2><p className="text-[#EA4335] text-xs font-bold mt-2 bg-red-50 px-3 py-1 rounded-full border border-red-100">Mohon tidak menutup halaman ini</p></div>
        )}

        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
          <div className="border-l-4 border-[#1A73E8] pl-4"><p className="text-[#1A73E8] text-xs font-extrabold uppercase tracking-widest mb-1">Penugasan Terkunci</p><h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{user.assignedUnit} <span className="font-medium text-slate-400">| {user.assignedTahap}</span></h1></div>
          <div className="flex bg-[#F1F3F4] p-1 rounded-full border border-slate-200 w-full sm:w-auto"><button onClick={() => setActiveTab('form')} className={`flex-1 sm:flex-none px-5 py-2 text-xs font-bold rounded-full transition-all ${activeTab === 'form' ? 'bg-white text-[#1A73E8] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>📝 Form Input</button><button onClick={() => setActiveTab('laporan')} className={`flex-1 sm:flex-none px-5 py-2 text-xs font-bold rounded-full transition-all ${activeTab === 'laporan' ? 'bg-white text-[#1A73E8] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>📋 Riwayat Data</button></div>
        </div>

        {activeTab === 'form' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {error && (<div className="mb-6 p-4 bg-[#FCE8E6] text-[#C5221F] rounded-2xl text-sm font-bold flex items-start gap-3 border border-[#FAD2CF] shadow-sm"><span className="text-lg leading-none">⚠️</span> <span>{error}</span></div>)}

            {/* URUTAN 1: SERIAL NUMBER */}
            <div className={`bg-white p-6 rounded-3xl border transition-all duration-300 mb-6 ${isSnLocked ? 'border-emerald-200 shadow-sm bg-emerald-50/10' : 'border-[#1A73E8]/60 shadow-[0_8px_30px_rgba(26,115,232,0.06)]'}`}>
              <div className="flex justify-between items-center mb-4"><h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2"><span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white ${isSnLocked ? 'bg-[#34A853]' : 'bg-[#1A73E8]'}`}>1</span>Identifikasi Produk</h2>{isSnLocked && (<button onClick={() => setIsSnLocked(false)} className="text-[#1A73E8] text-xs font-bold hover:underline bg-blue-50 px-3 py-1 rounded-full">Batal / Ganti SN</button>)}</div>
              {!isSnLocked ? (
                <form onSubmit={handleLockSN}>
                  <div className="relative flex items-center mb-4">
                    <input type="text" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value.toUpperCase())} placeholder="Ketik/Scan Serial Number..." className="w-full pl-5 pr-14 py-3.5 bg-[#F8F9FA] border border-slate-200 rounded-2xl text-lg font-mono font-bold text-slate-800 outline-none focus:bg-white focus:border-[#1A73E8] focus:ring-1 focus:ring-[#1A73E8] transition-all uppercase placeholder:text-slate-300 placeholder:font-sans placeholder:font-normal" autoFocus disabled={isCheckingSN} />
                    <button type="button" onClick={() => setIsScanning(true)} disabled={isCheckingSN} className="absolute right-2 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-white bg-white hover:bg-[#1A73E8] border border-slate-200 hover:border-transparent rounded-xl transition-all shadow-sm group" title="Buka Kamera"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transform group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7V5a2 2 0 012-2h2M21 7V5a2 2 0 00-2-2h-2M3 17v2a2 2 0 002 2h2M21 17v2a2 2 0 01-2 2h-2M7 8v8M11 8v8M13 8v8M17 8v8" /></svg></button>
                  </div>
                  <button type="submit" disabled={isCheckingSN} className="px-6 py-2.5 bg-[#1A73E8] hover:bg-[#1557B0] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-full transition-colors shadow-sm flex items-center gap-2">{isCheckingSN ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : 'Kunci & Verifikasi SN'}</button>
                </form>
              ) : (
                <div className="flex items-center gap-3 bg-[#F8F9FA] p-4 rounded-xl border border-slate-100"><div className="w-9 h-9 bg-[#E6F4EA] text-[#34A853] rounded-full flex items-center justify-center text-sm font-bold shadow-sm">✓</div><div><p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Terverifikasi & Terkunci</p><p className="text-xl font-mono font-black text-slate-800 tracking-wide">{serialNumber}</p></div></div>
              )}
            </div>

            <div className={`transition-all duration-500 transform ${isSnLocked ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-40 translate-y-2 pointer-events-none'}`}>
              
              {/* URUTAN 2: FOTO DOKUMENTASI WAJIB */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.02)] mb-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2"><span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white ${progressPercent === 100 ? 'bg-[#34A853]' : 'bg-[#1A73E8]'}`}>2</span> Foto Dokumentasi Wajib</h2>
                  <span className="text-xs font-bold text-slate-500 bg-[#F1F3F4] px-3 py-1 rounded-full font-mono">{progressCount} / {kategoriWajib.length}</span>
                </div>
                
                <div className="flex p-1 bg-[#F1F3F4] rounded-full mb-6 w-full sm:w-fit mx-auto border border-slate-200/50">
                  <button onClick={() => { photos.forEach(p => URL.revokeObjectURL(p.preview)); setUploadMode('kategori'); setPhotos([]); }} className={`flex-1 sm:px-8 py-2 text-xs font-bold rounded-full transition-all whitespace-nowrap ${uploadMode === 'kategori' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>📊 Mode Kategori</button>
                  <button onClick={() => { photos.forEach(p => URL.revokeObjectURL(p.preview)); setUploadMode('bulk'); setPhotos([]); }} className={`flex-1 sm:px-8 py-2 text-xs font-bold rounded-full transition-all whitespace-nowrap ${uploadMode === 'bulk' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>📂 Mode Cepat</button>
                </div>
                
                <div className="w-full h-1.5 bg-[#F1F3F4] rounded-full mb-8 overflow-hidden"><div className="h-full bg-[#1A73E8] rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div></div>

                {uploadMode === 'kategori' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {kategoriWajib.map((kat) => {
                      const photo = photos.find(p => p.kategori === kat);
                      return (
                        <div key={kat} onClick={() => photo ? setPreviewPhoto(photo) : setMediaSheet({ isOpen: true, kategori: kat })} className={`relative flex flex-col items-center justify-center p-3 border ${photo ? 'border-[#34A853] bg-[#E6F4EA]/20' : 'border-slate-200 bg-white hover:bg-[#F8F9FA]'} rounded-2xl cursor-pointer transition-all h-28 overflow-hidden group`}>
                          {photo ? (
                            <>
                              <img src={photo.preview} className="absolute inset-0 w-full h-full object-cover" alt={kat} />
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-white text-[10px] font-bold bg-black/40 px-2 py-0.5 rounded-full">🔍 Lihat</span></div>
                              <div className="absolute top-1 right-1 bg-[#34A853] text-white rounded-full w-5 h-5 flex items-center justify-center shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg></div>
                            </>
                          ) : ( <><span className="text-[10px] font-bold text-slate-500 text-center leading-tight px-1 uppercase">{kat}</span></> )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    <label className="border border-dashed border-[#1A73E8]/40 bg-[#F8F9FA] rounded-2xl p-8 text-center flex flex-col items-center justify-center hover:bg-blue-50/20 transition-colors cursor-pointer group mb-6">
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleBulkChange} />
                      <div className="w-12 h-12 bg-white text-[#1A73E8] rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:scale-105 transition-transform mb-3">➕</div>
                      <h3 className="font-bold text-slate-700 text-sm">Pilih Dokumen Sekaligus</h3>
                    </label>
                    {photos.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 animate-in fade-in duration-200">
                        {photos.map(p => (
                          <div key={p.id} onClick={() => setPreviewPhoto(p)} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 shadow-sm group cursor-pointer">
                            <img src={p.preview} className="w-full h-full object-cover" alt="Preview" />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-white text-[10px] font-bold">🔍 Lihat</span></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* URUTAN 3: FORM CEKLIS IFP */}
              {user.assignedUnit === 'IFP' && (
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.02)] mb-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2"><span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white bg-[#1A73E8]">3</span> Instrumen Pemeriksaan</h2>
                    
                    {/* FITUR BARU: TOMBOL CHECK ALL & UNCHECK ALL BERSAMAAN */}
                    <div className="flex gap-2">
                       <button onClick={handleCheckAll} className="px-4 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full text-xs font-black uppercase transition-all active:scale-95 shadow-sm">
                         ✓ Check All
                       </button>
                       <button onClick={handleUncheckAll} className="px-4 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-full text-xs font-black uppercase transition-all active:scale-95 shadow-sm">
                         ✗ Uncheck All
                       </button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {[
                      { title: "Kondisi Fisik", data: CEKLIS_FISIK },
                      { title: "Kelengkapan Aksesori", data: CEKLIS_KELENGKAPAN },
                      { title: "Kesesuaian Spesifikasi", data: CEKLIS_SPESIFIKASI },
                      { title: "Pemeriksaan Operasional", data: CEKLIS_OPERASIONAL }
                    ].map(group => (
                      <div key={group.title} className="border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="bg-[#F8F9FA] px-4 py-3 border-b border-slate-200"><h3 className="font-bold text-slate-700 text-sm">{group.title}</h3></div>
                        <div className="divide-y divide-slate-100">
                          {group.data.filter(item => !item.defaultState).map((item, idx) => (
                            <div key={item.id} className={`p-4 flex flex-col gap-3 ${ifpData[item.id]?.status === 'tidak' ? 'bg-red-50/50' : 'hover:bg-slate-50/50'}`}>
                              <div className="flex justify-between items-start gap-4">
                                <div>
                                  <div className={`text-sm font-semibold text-slate-800 ${item.isSub ? 'ml-4' : ''}`}>{idx + 1}. {item.label}</div>
                                  {item.spek && <div className="text-xs font-mono text-[#1A73E8] bg-blue-50 px-2 py-0.5 rounded mt-1 inline-block border border-blue-100">Target: {item.spek}</div>}
                                </div>
                                <div className="flex gap-2 shrink-0">
                                  <button onClick={() => handleIfpChange(item.id, 'status', 'sesuai')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${ifpData[item.id]?.status === 'sesuai' ? 'bg-[#34A853] text-white shadow-sm border border-[#2B8A44]' : 'bg-slate-100 text-slate-400 hover:bg-slate-200 border border-transparent'}`}>Sesuai / Ya</button>
                                  <button onClick={() => handleIfpChange(item.id, 'status', 'tidak')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${ifpData[item.id]?.status === 'tidak' ? 'bg-[#EA4335] text-white shadow-sm border border-[#C5221F]' : 'bg-slate-100 text-slate-400 hover:bg-slate-200 border border-transparent'}`}>Silang / Tidak</button>
                                </div>
                              </div>
                              
                              {ifpData[item.id]?.status === 'tidak' && (
                                <textarea value={ifpData[item.id]?.ket || ''} onChange={(e) => handleIfpChange(item.id, 'ket', e.target.value)} placeholder="Tuliskan keterangan detail..." className="w-full text-xs p-3 bg-white border border-red-200 rounded-xl outline-none focus:border-red-400 shadow-inner resize-none" rows="2" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FITUR BARU: TOGGLE UNIT PENGGANTI & SIMPAN */}
              <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
                
                {/* Switch "Tandai sebagai Pengganti" */}
                <div className="flex items-center gap-4 bg-white px-4 py-3 rounded-2xl border border-slate-200 w-full md:w-auto cursor-pointer" onClick={() => setIsPengganti(!isPengganti)}>
                  <div className={`relative w-12 h-6 transition-colors rounded-full flex items-center shrink-0 ${isPengganti ? 'bg-[#1A73E8]' : 'bg-slate-300'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-300 ${isPengganti ? 'translate-x-6' : 'translate-x-1'}`}></div>
                  </div>
                  <div>
                    <h4 className={`text-sm font-black tracking-wide ${isPengganti ? 'text-[#1A73E8]' : 'text-slate-600'}`}>Unit Pengganti</h4>
                    <p className="text-[10px] font-medium text-slate-400 leading-tight">Nyalakan jika ini adalah SN pengganti<br/>dari unit yang rusak/error sebelumnya.</p>
                  </div>
                </div>

                {/* Tombol Simpan */}
                <div className="flex gap-3 w-full md:w-auto">
                  <button onClick={handleBatal} className="px-5 py-2.5 rounded-2xl font-bold text-xs text-slate-500 bg-white border border-slate-200 hover:bg-slate-100 transition-colors w-full md:w-auto shadow-sm">Reset</button>
                  <button onClick={handleSimpanData} disabled={isUploading || progressPercent !== 100} className="px-6 py-2.5 bg-[#1A73E8] hover:bg-[#1557B0] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-2xl transition-all shadow-md w-full md:w-auto">
                    🚀 Simpan Laporan
                  </button>
                </div>

              </div>

            </div>
          </div>
        )}

        {/* TAB RIWAYAT DATA */}
        {activeTab === 'laporan' && (
          <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300"><div className="p-5 sm:p-6 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row justify-between gap-4"><h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">📋 Riwayat Data</h2><input type="text" placeholder="Cari Serial Number / Petugas..." value={searchLaporan} onChange={(e) => setSearchLaporan(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-blue-50 w-full sm:w-64" /></div><div className="overflow-x-auto"><table className="w-full text-left text-sm text-slate-600"><thead className="bg-[#F8F9FA] border-b border-slate-100"><tr className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider"><th className="py-4 px-6">Waktu Input</th><th className="py-4 px-6">Serial Number</th><th className="py-4 px-6">Unit / Tahap</th><th className="py-4 px-6">Petugas</th></tr></thead><tbody className="divide-y divide-slate-100">{isLaporanLoading ? ( <tr><td colSpan="4" className="py-12 text-center text-[#1A73E8] font-medium animate-pulse">Memuat riwayat pemeriksaan...</td></tr> ) : filteredLaporan.length === 0 ? ( <tr><td colSpan="4" className="py-12 text-center text-slate-400">Tidak ada data ditemukan.</td></tr> ) : ( filteredLaporan.map((rec) => ( <tr key={rec.id} className="hover:bg-slate-50/50 transition-colors"><td className="py-4 px-6 text-xs font-mono text-slate-500">{new Date(rec.timestamp).toLocaleString('id-ID', {day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit'})}</td><td className="py-4 px-6 font-mono font-black text-[#1A73E8]">{rec.serialNumber}</td><td className="py-4 px-6 font-bold text-slate-700">{rec.unit} <span className="font-medium text-slate-400 text-xs block mt-0.5">{rec.tahap}</span></td><td className="py-4 px-6 text-xs font-bold uppercase">{rec.petugas}</td></tr> )) )}</tbody></table></div></div>
        )}

        {notifKerjaan.isOpen && (
          <div className="fixed inset-0 bg-slate-900/60 z-[100] flex justify-center items-center p-4 backdrop-blur-sm animate-in fade-in duration-300"><div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-300"><div className={`p-6 flex flex-col items-center text-center ${notifKerjaan.isOffline ? 'bg-amber-50' : 'bg-green-50'}`}><div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-4 shadow-inner ${notifKerjaan.isOffline ? 'bg-amber-100' : 'bg-green-100'}`}> {notifKerjaan.isOffline ? '📡' : '🎉'} </div><h3 className={`text-xl font-extrabold tracking-tight mb-2 ${notifKerjaan.isOffline ? 'text-amber-800' : 'text-green-800'}`}> {notifKerjaan.isOffline ? 'Tersimpan Offline!' : 'Berhasil Terkirim!'} </h3><p className="text-sm font-medium text-slate-600 leading-relaxed px-2"> {notifKerjaan.isOffline ? 'Data & foto disimpan aman di memori HP. Sistem akan mengunggahnya otomatis saat internet tersedia.' : 'Pekerjaan ini sudah diunggah ke server dan folder Drive dengan aman.'} </p></div><div className="p-5 bg-white border-t border-slate-100"><button onClick={() => setNotifKerjaan({ isOpen: false, isOffline: false })} className={`w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all shadow-md ${notifKerjaan.isOffline ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'}`}>Oke, Lanjut Bekerja</button></div></div></div>
        )}
      </div>
    </>
  );
}