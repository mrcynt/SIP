import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';

export default function AbsensiPublik() {
  const [tahaps, setTahaps] = useState([]);
  const [formData, setFormData] = useState({
    tahap: '',
    namaLengkap: '',
    tempatLahir: '',
    tanggalLahir: '',
    alamat: '',
    instansi: '',
    jabatan: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // MENGAMBIL DATA TAHAP SECARA DINAMIS DARI MASTER TAHAP ADMIN
  useEffect(() => {
    const fetchTahaps = async () => {
      try {
        const snap = await getDocs(collection(db, 'master_tahaps'));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Urutkan berdasarkan nama tahap secara alfabetis/angka
        list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        setTahaps(list);
      } catch (err) {
        console.error("Gagal memuat master tahap:", err);
      }
    };
    fetchTahaps();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // LOGIKA HITUNG UMUR OTOMATIS
  const calculateAge = (birthDateString) => {
    if (!birthDateString) return 0;
    const today = new Date();
    const birthDate = new Date(birthDateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Hitung umur secara instan dari tanggal lahir sebelum diupload
    const calculatedAge = calculateAge(formData.tanggalLahir);

    try {
      await addDoc(collection(db, 'absensi'), {
        ...formData,
        umur: calculatedAge, // Otomatis tersimpan angka umur asli
        timestamp: new Date().toISOString()
      });
      setIsSuccess(true);
    } catch (error) {
      alert("Terjadi kesalahan saat mengirim data. Silakan coba lagi.");
      console.error(error);
    }
    setIsSubmitting(false);
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-100 animate-in zoom-in duration-500">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl shadow-inner">
            ✓
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Absensi Berhasil!</h2>
          <p className="text-slate-500 font-medium mb-8 leading-relaxed">Terima kasih, data kehadiran Anda pada {formData.tahap} telah tercatat ke dalam sistem kami.</p>
          <button 
            onClick={() => { setIsSuccess(false); setFormData({ tahap: '', namaLengkap: '', tempatLahir: '', tanggalLahir: '', alamat: '', instansi: '', jabatan: '' }); }}
            className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md active:scale-95"
          >
            Isi Absen Baru
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
        <div className="p-6 sm:p-8 bg-[#1A73E8] text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-black opacity-10 rounded-full -ml-8 -mb-8 blur-xl"></div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight relative z-10">Form Kehadiran</h1>
          <p className="text-blue-100 mt-2 font-medium text-sm relative z-10">Sistem Inspeksi & Pemeriksaan</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Pilih Tahap Kegiatan <span className="text-red-500">*</span></label>
            <select name="tahap" value={formData.tahap} onChange={handleChange} required className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer">
              <option value="" disabled>-- Silakan Pilih Tahap --</option>
              {tahaps.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Nama Lengkap <span className="text-red-500">*</span></label>
            <input type="text" name="namaLengkap" value={formData.namaLengkap} onChange={handleChange} placeholder="Contoh: Budi Santoso" required className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 transition-all placeholder-slate-400" />
          </div>

          {/* TEMPAT & TANGGAL LAHIR */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Tempat Lahir <span className="text-red-500">*</span></label>
              <input type="text" name="tempatLahir" value={formData.tempatLahir} onChange={handleChange} placeholder="Contoh: Bandung" required className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 transition-all placeholder-slate-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Tanggal Lahir <span className="text-red-500">*</span></label>
              <input type="date" name="tanggalLahir" value={formData.tanggalLahir} onChange={handleChange} required className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 transition-all text-slate-700 cursor-pointer" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Jabatan <span className="text-red-500">*</span></label>
            <input type="text" name="jabatan" value={formData.jabatan} onChange={handleChange} placeholder="Contoh: Staff IT / Teknisi" required className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 transition-all placeholder-slate-400" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Asal Instansi <span className="text-red-500">*</span></label>
            <input type="text" name="instansi" value={formData.instansi} onChange={handleChange} placeholder="Contoh: PT. Teknologi Nusantara" required className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 transition-all placeholder-slate-400" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Alamat Domisili <span className="text-red-500">*</span></label>
            <textarea name="alamat" value={formData.alamat} onChange={handleChange} placeholder="Masukkan alamat lengkap..." required rows="2" className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-[#4285F4] focus:ring-2 focus:ring-blue-100 transition-all placeholder-slate-400 resize-none"></textarea>
          </div>

          <div className="pt-2">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className={`w-full py-4 rounded-xl text-white font-bold text-sm shadow-lg transition-all flex justify-center items-center gap-2 ${isSubmitting ? 'bg-blue-400 cursor-not-allowed' : 'bg-[#1A73E8] hover:bg-blue-700 hover:-translate-y-0.5 shadow-blue-500/30'}`}
            >
              {isSubmitting ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Mengirim...</>
              ) : (
                'Kirim Data Kehadiran'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}