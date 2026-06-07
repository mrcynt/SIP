import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { collection, query, where, getDocs, updateDoc, doc, setDoc, getDoc } from 'firebase/firestore';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // State untuk Paksaan Ganti Password
  const [isForceChangePw, setIsForceChangePw] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [userIdToUpdate, setUserIdToUpdate] = useState('');
  const [userDataTemp, setUserDataTemp] = useState(null);

  const navigate = useNavigate();
  const { login } = useAuth();

  // FUNGSI UTAMA LOGIN
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const unameStr = username.trim().toLowerCase();
      
      // 1. Inisialisasi Akun Admin Default (Sesuai Spesifikasi: admin / 12345)
      if (unameStr === 'admin') {
        const adminRef = doc(db, 'users', 'admin_default');
        const adminSnap = await getDoc(adminRef);
        
        // Jika admin belum pernah ada di database, kita buatkan otomatis
        if (!adminSnap.exists()) {
          await setDoc(adminRef, {
            username: 'admin',
            password: '12345',
            role: 'admin',
            isFirstLogin: true
          });
        }
      }

      // 2. Cek Akun di Firestore
      const q = query(collection(db, 'users'), where('username', '==', unameStr));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError('Username tidak ditemukan.');
        setIsLoading(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();

      // 3. Verifikasi Password
      if (userData.password !== password) {
        setError('Password salah.');
        setIsLoading(false);
        return;
      }

      // 4. Cek Apakah Wajib Ganti Password (Login Pertama)
      if (userData.isFirstLogin || userData.password === '12345') {
        setUserIdToUpdate(userDoc.id);
        setUserDataTemp(userData);
        setIsForceChangePw(true); // Munculkan Modal Ganti Password
        setIsLoading(false);
        return;
      }

      // 5. Jika aman, langsung masuk
      jalankanSesiLogin(userData);

    } catch (err) {
      console.error(err);
      setError('Terjadi kesalahan pada server. Coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  // FUNGSI GANTI PASSWORD PAKSA
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    
    if (newPassword.length < 5) {
      setError('Password baru minimal 5 karakter!');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Konfirmasi password tidak cocok!');
      return;
    }

    setIsLoading(true);
    try {
      // Update password di database dan hilangkan status first login
      await updateDoc(doc(db, 'users', userIdToUpdate), {
        password: newPassword,
        isFirstLogin: false
      });

      // Update data sementara lalu loginkan
      const updatedUser = { ...userDataTemp, password: newPassword, isFirstLogin: false };
      alert('Password berhasil diubah! Mengalihkan ke aplikasi...');
      jalankanSesiLogin(updatedUser);
      
    } catch (err) {
      setError('Gagal mengubah password.');
    } finally {
      setIsLoading(false);
    }
  };

  const jalankanSesiLogin = (dataPengguna) => {
    login(dataPengguna);
    if (dataPengguna.role === 'pemeriksa') {
      navigate('/pemeriksaan');
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans relative overflow-hidden">
      
      {/* Ornamen Background */}
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative z-10">
        <div className="text-center mb-8">
          
          {/* LOGO ASLI KAMU SUDAH TERPASANG DI SINI & ANTI ERROR */}
          <img 
            src="/logo-512.png" 
            alt="Logo SIP" 
            className="w-28 h-auto object-contain drop-shadow-md mx-auto mb-4" 
          />
          
      
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-[#C5221F] border border-red-100 rounded-xl text-sm font-bold text-center">
            {error}
          </div>
        )}

        {!isForceChangePw ? (
          /* ================= FORM LOGIN NORMAL ================= */
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Username</label>
              <input 
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-[#F8F9FA] border border-slate-200 rounded-xl text-sm outline-none focus:border-[#1A73E8] focus:ring-2 focus:ring-[#1A73E8]/20 transition-all font-medium text-slate-800"
                placeholder="Masukkan username"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#F8F9FA] border border-slate-200 rounded-xl text-sm outline-none focus:border-[#1A73E8] focus:ring-2 focus:ring-[#1A73E8]/20 transition-all font-medium text-slate-800"
                placeholder="••••••••"
                required
              />
            </div>
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-70 mt-2"
            >
              {isLoading ? 'Memverifikasi...' : 'Masuk ke Sistem'}
            </button>
          </form>
        ) : (
          /* ================= FORM GANTI PASSWORD PAKSA ================= */
          <form onSubmit={handleChangePassword} className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
              <p className="text-xs text-amber-800 font-bold text-center">
                ⚠️ Demi keamanan, Anda diwajibkan untuk mengganti password default (12345) sebelum melanjutkan.
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password Baru</label>
              <input 
                type="password" 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#F8F9FA] border border-slate-200 rounded-xl text-sm outline-none focus:border-[#34A853] focus:ring-2 focus:ring-[#34A853]/20 transition-all font-medium text-slate-800"
                placeholder="Buat password baru"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Konfirmasi Password</label>
              <input 
                type="password" 
                value={confirmNewPassword} 
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#F8F9FA] border border-slate-200 rounded-xl text-sm outline-none focus:border-[#34A853] focus:ring-2 focus:ring-[#34A853]/20 transition-all font-medium text-slate-800"
                placeholder="Ketik ulang password"
                required
              />
            </div>
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-[#34A853] hover:bg-[#2B8A44] text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-green-500/20 disabled:opacity-70 mt-2"
            >
              {isLoading ? 'Menyimpan...' : 'Simpan & Masuk'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}