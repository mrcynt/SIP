import Dexie from 'dexie';

export const dbLocal = new Dexie('SigmaOfflineDB');

// Kita menyiapkan 2 tabel/kardus penyimpanan di memori HP
dbLocal.version(1).stores({
  antrean_foto: '++id, pemeriksaan_id, kategori', 
  antrean_pemeriksaan: 'id, unit, tahap, serialNumber, petugas, timestamp' // Kardus baru untuk data teks
});