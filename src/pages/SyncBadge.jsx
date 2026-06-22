// 6. Tembak ke Google Drive
        const result = await fetchWithRetry(driveApiUrl, {
          redirect: "follow",
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            unit: record.unit,
            tahap: record.tahap,
            serialNumber: record.serialNumber,
            nomorUrut: nomorUrutResmi,
            petugas: record.petugas, // <--- INI BARIS SAKTINYA YANG KETINGGALAN
            photos: processedPhotos
          })
        }, 1, 60000);