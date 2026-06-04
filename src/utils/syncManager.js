import { db } from '../config/firebase';
import { collection, addDoc, runTransaction, doc, query, where, getDocs } from 'firebase/firestore';
import { dbLocal } from '../db/offlineDB';
import { fetchWithRetry } from './network';

const DRIVE_API_URL = "https://script.google.com/macros/s/AKfycbyJwmBp6pfgIgO9jSOl-RbQ6RMBTQPUX0zJFd_3TYqQ-egca9WNOImoKrLYW6PkQUDBYQ/exec";

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

export const processSyncQueue = async () => {
  const pendingRecords = await dbLocal.antrean_pemeriksaan.toArray();
  if (pendingRecords.length === 0) return 0;

  let successCount = 0;

  for (const record of pendingRecords) {
    try {
      // 1. SISTEM PENCEGAT DUPLIKAT LINTAS TAHAP (CONFLICT RESOLUTION)
      const qCek = query(
        collection(db, 'pemeriksaan_records'),
        where('unit', '==', record.unit),
        where('serialNumber', '==', record.serialNumber)
      );
      
      const snapCek = await getDocs(qCek);
      let finalSerialNumber = record.serialNumber;

      if (!snapCek.empty) {
        const existingData = snapCek.docs[0].data();
        const promptMsg = `⚠️ VALIDASI GAGAL: SERIAL NUMBER DUPLIKAT!\n\nSerial Number [${record.serialNumber}] sudah digunakan pada "${existingData.tahap}" dengan nomor urut ${existingData.nomorUrut} oleh petugas ${existingData.petugas}.\n\nSistem tidak mengizinkan SN yang sama pada unit yang sama.\n- Ketik Serial Number baru untuk memperbaiki.\n- Atau KOSONGKAN/CANCEL untuk menunda data ini dalam antrean.`;
        
        const newSN = window.prompt(promptMsg, record.serialNumber);
        
        if (newSN && newSN.trim() !== '' && newSN !== record.serialNumber) {
          finalSerialNumber = newSN.toUpperCase();
          await dbLocal.antrean_pemeriksaan.update(record.id, { serialNumber: finalSerialNumber });
        } else {
          console.warn(`Sinkronisasi ditunda manual oleh user untuk SN: ${record.serialNumber}`);
          continue; 
        }
      }

      // 2. Ambil foto terkait dari IndexedDB
      const fotoLokal = await dbLocal.antrean_foto.where('pemeriksaan_id').equals(record.id).toArray();
      if (fotoLokal.length === 0) continue; 

      // 3. Ambil Nomor Urut Resmi Anti-Bentrok via Firestore Transaction
      const counterDocRef = doc(db, 'counters', `${record.unit}_${record.tahap}`);
      let nomorUrutResmi = 1;

      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterDocRef);
        if (!counterDoc.exists()) {
          transaction.set(counterDocRef, { currentNumber: 1 });
          nomorUrutResmi = 1;
        } else {
          const newNumber = counterDoc.data().currentNumber + 1;
          transaction.update(counterDocRef, { currentNumber: newNumber });
          nomorUrutResmi = newNumber;
        }
      });

      // 4. Kompresi Foto Antrean
      const processedPhotos = await Promise.all(fotoLokal.map(async (foto, index) => {
        const base64 = await compressImage(foto.file_blob);
        return { kategori: foto.kategori, filename: `${foto.kategori}_${index + 1}.jpg`, base64: base64 };
      }));

      // 5. Kirim ke Google Drive menggunakan Penstabil Jaringan (Auto-Retry & Timeout)
      const result = await fetchWithRetry(DRIVE_API_URL, {
        redirect: "follow", 
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ 
          unit: record.unit, 
          tahap: record.tahap, 
          serialNumber: finalSerialNumber,
          nomorUrut: nomorUrutResmi, 
          photos: processedPhotos 
        })
      }, 3, 15000);

      if (result.status === 'success') {
        // 6. Cetak riwayat ke Firebase Firestore
        await addDoc(collection(db, 'pemeriksaan_records'), {
          unit: record.unit,
          tahap: record.tahap,
          nomorUrut: nomorUrutResmi,
          serialNumber: finalSerialNumber,
          formatTampil: `${nomorUrutResmi}. ${finalSerialNumber}`,
          petugas: record.petugas,
          timestamp: new Date().toISOString()
        });

        // 7. Bersihkan data terkirim dari memori HP
        await dbLocal.antrean_pemeriksaan.delete(record.id);
        await dbLocal.antrean_foto.where('pemeriksaan_id').equals(record.id).delete();
        
        successCount++;
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      console.error("Gagal menyinkronkan ID Antrean:", record.id, err);
      break; // Menghentikan loop jika jaringan terputus kembali di tengah jalan
    }
  }

  return successCount;
};