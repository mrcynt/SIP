// util/network.js

/**
 * Fungsi Fetch Kebal Sinyal Putus-Nyambung
 * Akan mencoba mengulang pengiriman jika koneksi terputus di tengah jalan,
 * dan memiliki batas waktu (timeout) agar aplikasi tidak hang saat sinyal hilang.
 */
export const fetchWithRetry = async (url, options = {}, retries = 3, timeout = 15000) => {
  for (let i = 0; i < retries; i++) {
    try {
      // Pasang Timer (Mencegah loading abadi jika sinyal hilang total)
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, { 
        ...options, 
        signal: controller.signal 
      });
      
      clearTimeout(id); // Bersihkan timer jika sukses sebelum batas waktu

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      return await response.json();

    } catch (err) {
      const isLastAttempt = i === retries - 1;
      
      // Jika ini percobaan terakhir, lempar error agar ditangkap oleh aplikasi
      if (isLastAttempt) {
        throw new Error("Koneksi sangat tidak stabil. Sistem otomatis mengalihkan data ke antrean Offline.");
      }

      console.warn(`[Sinyal Lemah] Gagal mengirim data. Mencoba ulang (${i + 1}/${retries})...`);
      
      // Beri jeda 2 detik sebelum mencoba lagi agar jaringan HP bernapas
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
};