import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState([]);
  const [recentRecords, setRecentRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterTahap, setFilterTahap] = useState('');

  const COLOR_SELESAI = '#34A853'; 
  const COLOR_SISA_LIGHT = '#F1F3F4';    

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const unitsSnap = await getDocs(collection(db, 'master_units'));
      const unitsData = unitsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const targetsSnap = await getDocs(collection(db, 'master_targets'));
      const targetsData = targetsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const recordsSnap = await getDocs(query(collection(db, 'pemeriksaan_records'), orderBy('timestamp', 'desc')));
      const allRecordsData = recordsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      setRecentRecords(allRecordsData); 

      const compiledData = unitsData.map(unit => {
        const unitRecords = allRecordsData.filter(r => r.unit === unit.name);
        const totalSelesai = unitRecords.length;
        const grandTotal = unit.grandTotal || 0;
        const sisa = Math.max(0, grandTotal - totalSelesai);

        const unitTargets = targetsData.filter(t => t.unit === unit.name);
        
        const listTahap = unitTargets.map(tahapTarget => {
          const selesaiTahap = unitRecords.filter(r => r.tahap === tahapTarget.tahap).length;
          const targetTahap = tahapTarget.jumlah || 0;
          let persentase = 0;
          if (targetTahap > 0) {
            persentase = Math.min(100, Math.round((selesaiTahap / targetTahap) * 100));
          }
          return { namaTahap: tahapTarget.tahap, target: targetTahap, selesai: selesaiTahap, persentase: persentase };
        });

        listTahap.sort((a, b) => a.namaTahap.localeCompare(b.namaTahap));

        return {
          unitName: unit.name,
          grandTotal: grandTotal,
          totalSelesai: totalSelesai,
          sisa: sisa,
          pieData: [
            { name: 'Selesai Dikerjakan', value: totalSelesai },
            { name: 'Sisa Pekerjaan', value: sisa }
          ],
          listTahap: listTahap
        };
      });

      const activeUnits = compiledData.filter(u => u.grandTotal > 0 || u.totalSelesai > 0);
      setDashboardData(activeUnits);

    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatWaktu = (isoString) => {
    if (!isoString) return '-';
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(isoString));
  };

  const filteredRecords = recentRecords.filter(record => {
    const matchSearch = (record.serialNumber && record.serialNumber.toLowerCase().includes(searchTerm.toLowerCase())) || 
                        (record.petugas && record.petugas.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchFilter = filterTahap === '' || record.tahap === filterTahap;
    return matchSearch && matchFilter;
  });

  const uniqueTahaps = [...new Set(recentRecords.map(r => r.tahap))].filter(Boolean);

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard Kinerja</h1>
          <p className="text-slate-500 mt-1">Pantau progres per-kategori secara spesifik.</p>
        </div>
        <button onClick={fetchDashboardData} className="px-4 py-2 bg-white border border-slate-200 text-[#4285F4] rounded-full text-sm font-bold shadow-sm hover:shadow-md transition-all">
          🔄 Segarkan
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-[#4285F4] font-medium animate-pulse">Menghitung analitik data...</div>
      ) : dashboardData.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl shadow-sm border border-slate-100">
          <p className="text-slate-500">Belum ada Unit yang memiliki Grand Total atau sedang dikerjakan.</p>
        </div>
      ) : (
        <>
          {/* AREA KARTU KATEGORI */}
          {dashboardData.map((unitData, index) => (
            <div key={index} className="bg-white p-6 md:p-8 rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-50 mb-10">
              
              {/* HEADER YANG SUDAH DIBERSIHKAN (Tinggal tulisan "BRACKET", "INTERACTIVE FLAT PANEL", dll) */}
              <div className="mb-6 pb-4 border-b border-slate-100">
                <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">
                  {unitData.unitName}
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Total Keseluruhan</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1">{unitData.grandTotal.toLocaleString('id-ID')}</h3>
                </div>
                <div className="bg-[#E6F4EA]/40 p-5 rounded-2xl border border-[#CEEAD6]">
                  <p className="text-[10px] font-extrabold text-[#137333] uppercase tracking-widest">Telah Dikerjakan</p>
                  <h3 className="text-3xl font-black text-[#188038] mt-1">{unitData.totalSelesai.toLocaleString('id-ID')}</h3>
                </div>
                <div className="bg-[#FCE8E6]/40 p-5 rounded-2xl border border-[#FAD2CF]">
                  <p className="text-[10px] font-extrabold text-[#A50E0E] uppercase tracking-widest">Sisa Pekerjaan</p>
                  <h3 className="text-3xl font-black text-[#C5221F] mt-1">{unitData.sisa.toLocaleString('id-ID')}</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="flex flex-col items-center justify-center bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                  <h3 className="font-bold text-slate-700 mb-2 text-xs">Rasio Penyelesaian ({unitData.unitName})</h3>
                  <div className="w-full h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={unitData.pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value" stroke="none">
                          <Cell fill={COLOR_SELESAI} />
                          <Cell fill={COLOR_SISA_LIGHT} />
                        </Pie>
                        <RechartsTooltip contentStyle={{borderRadius: '12px', border: 'none', backgroundColor: '#FFFFFF', color: '#000000'}} />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="flex flex-col">
                  <h3 className="font-bold text-slate-700 mb-4 text-xs">Progres Target Per Tahap</h3>
                  <div className="space-y-3">
                    {unitData.listTahap.map((tahap, idx) => (
                      <div key={idx} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm transition-all">
                        <div className="flex justify-between items-end mb-2">
                          <span className="font-extrabold text-slate-800 text-sm">{tahap.namaTahap}</span>
                          <span className="font-mono font-black text-[#1A73E8]">
                            {tahap.selesai.toLocaleString('id-ID')} <span className="text-slate-400 font-bold text-xs">/ {tahap.target.toLocaleString('id-ID')}</span>
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-[#F1F3F4] rounded-full overflow-hidden">
                          <div className="h-full bg-[#4285F4] rounded-full" style={{ width: `${tahap.persentase}%` }}></div>
                        </div>
                        <div className="text-right mt-1">
                          <span className="text-[10px] font-bold text-slate-500">{tahap.persentase}% Selesai</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* TABEL DATA RIWAYAT */}
          <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-50 overflow-hidden mb-8">
            <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <h2 className="text-lg font-bold text-slate-800 shrink-0">Riwayat Pemeriksaan Keseluruhan</h2>
              <div className="flex flex-col sm:flex-row w-full md:w-auto gap-3">
                <input type="text" placeholder="🔍 Cari SN atau Petugas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="px-4 py-2 bg-[#F8F9FA] border border-slate-200 rounded-full text-sm outline-none focus:border-[#4285F4] text-slate-800 w-full sm:w-64 transition-all" />
                <select value={filterTahap} onChange={(e) => setFilterTahap(e.target.value)} className="px-4 py-2 bg-[#F8F9FA] border border-slate-200 text-slate-700 rounded-full text-sm outline-none cursor-pointer"><option value="">Semua Tahap</option>{uniqueTahaps.map((thp, idx) => (<option key={idx} value={thp}>{thp}</option>))}</select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-[#F8F9FA]"><tr className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100"><th className="py-5 px-8">Waktu</th><th className="py-5 px-8">Serial Number</th><th className="py-5 px-8">Kategori</th><th className="py-4 px-8">Petugas</th></tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredRecords.length === 0 ? (
                    <tr><td colSpan="4" className="py-12 text-center text-slate-400">Tidak ada data yang cocok.</td></tr>
                  ) : (
                    filteredRecords.slice(0, 100).map((record) => (
                      <tr key={record.id} className="hover:bg-[#F8F9FA]/50 transition-colors">
                        <td className="py-4 px-8 text-slate-500">{formatWaktu(record.timestamp)}</td>
                        <td className="py-4 px-8 font-mono font-bold text-[#1A73E8] text-base">{record.formatTampil ? record.formatTampil : record.serialNumber}</td>
                        <td className="py-4 px-8 font-bold text-slate-700">{record.unit} - {record.tahap}</td>
                        <td className="py-4 px-8 uppercase text-xs font-bold text-slate-400">{record.petugas || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}