import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- FUNGSI HELPER GLOBAL ---
const getErrorDetails = (record) => {
  if (!record.ifpData) return { isError: false, notes: [] };
  try {
    const data = JSON.parse(record.ifpData);
    const notes = [];
    Object.keys(data).forEach(key => {
      if (data[key].status === 'tidak') notes.push(data[key].ket || 'Tanpa keterangan');
    });
    return { isError: notes.length > 0, notes };
  } catch (e) { return { isError: false, notes: [] }; }
};

const formatWaktu = (isoString) => {
  if (!isoString) return '-';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(isoString));
};

const extractDriveId = (url) => {
  if (!url) return null;
  const match = url.match(/folders\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
};

// Fungsi Warna Dinamis per Unit
const getUnitColor = (unitName) => {
  const name = unitName.toUpperCase();
  if (name.includes('IFP')) return '#4285F4'; // Biru Google
  if (name.includes('BRACKET')) return '#34A853'; // Hijau Google
  if (name.includes('PC') || name.includes('KOMPUTER') || name.includes('MINI')) return '#FBBC05'; // Kuning Google
  if (name.includes('LAPTOP') || name.includes('CHROMEBOOK')) return '#8E24AA'; // Ungu
  if (name.includes('ROUTER') || name.includes('JARINGAN')) return '#12B5CB'; // Cyan
  if (name.includes('HDD') || name.includes('HARDISK')) return '#F65314'; // Orange

  const colors = ['#4285F4', '#34A853', '#FBBC05', '#8E24AA', '#12B5CB', '#F65314', '#3F51B5', '#009688'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
  const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));
  
  if (percent < 0.04) return null; 
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="black">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

// --- KOMPONEN UTAMA DASHBOARD ---
export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState([]);
  const [recentRecords, setRecentRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [activeDashTab, setActiveDashTab] = useState('grafik');
  const [previewRecord, setPreviewRecord] = useState(null);

  const [unitSearch, setUnitSearch] = useState('');
  const [unitTahap, setUnitTahap] = useState('');
  const [unitDate, setUnitDate] = useState('');
  const [unitStatus, setUnitStatus] = useState('semua');
  const [unitSort, setUnitSort] = useState('terbaru');

  const COLOR_SELESAI = '#34A853';   
  const COLOR_PENGGANTI = '#9333EA'; 
  const COLOR_ERROR = '#EA4335';     
  const COLOR_SISA_LIGHT = '#F1F3F4';

  useEffect(() => { fetchDashboardData(); }, []);

  const isRecordError = (record) => {
    if (!record.ifpData) return false;
    try {
      const data = JSON.parse(record.ifpData);
      return Object.values(data).some(item => item.status === 'tidak');
    } catch (e) { return false; }
  };

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
        const dynamicColor = getUnitColor(unit.name);
        
        let baseGrandTotal = Number(unit.grandTotal) || 0;
        let totalErrorUnit = 0; 
        let normalCount = 0; 

        unitRecords.forEach(r => {
           if (isRecordError(r)) {
               totalErrorUnit++;
           } else if (!r.isPengganti) {
               normalCount++; 
           }
        });

        const jumlahPenggantiWajib = totalErrorUnit * 10;
        const sisa = Math.max(0, baseGrandTotal - normalCount);
        const overTarget = Math.max(0, normalCount - baseGrandTotal);
        const progressPercent = baseGrandTotal > 0 ? Math.round((normalCount / baseGrandTotal) * 100) : 0;
        const sisaPercent = Math.max(0, 100 - progressPercent);

        const unitTargets = targetsData.filter(t => t.unit === unit.name);
        const listTahap = unitTargets.map(tahapTarget => {
          const baseTarget = Number(tahapTarget.jumlah) || 0;
          
          let selesaiTahap = 0;
          unitRecords.filter(r => r.tahap === tahapTarget.tahap).forEach(r => {
             if(!isRecordError(r) && !r.isPengganti) selesaiTahap++;
          });
          
          return { 
            namaTahap: tahapTarget.tahap, 
            baseTarget: baseTarget,
            selesai: selesaiTahap
          };
        });

        // BUG FIX: Mengurutkan secara Numerik Natural (Tahap 10 akan di atas Tahap 2)
        listTahap.sort((a, b) => a.namaTahap.localeCompare(b.namaTahap, undefined, { numeric: true, sensitivity: 'base' }));

        return { 
          unitName: unit.name,
          color: dynamicColor,
          baseGrandTotal, 
          normalCount,
          totalError: totalErrorUnit, 
          totalPengganti: jumlahPenggantiWajib,
          sisa, 
          overTarget,
          progressPercent,
          sisaPercent,
          pieData: [ 
            { name: 'Telah Dikerjakan', value: normalCount, color: dynamicColor }, 
            { name: 'Sisa Target', value: sisa, color: COLOR_SISA_LIGHT } 
          ], 
          listTahap 
        };
      });

      setDashboardData(compiledData.filter(u => u.baseGrandTotal > 0 || u.normalCount > 0 || u.totalError > 0));
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
  };

  const activeUnitData = dashboardData.find(u => u.unitName === activeDashTab);
  
  const resetFilters = () => {
    setUnitSearch(''); setUnitTahap(''); setUnitDate(''); setUnitStatus('semua'); setUnitSort('terbaru');
  };

  const filteredUnitRecords = activeUnitData ? recentRecords.filter(r => r.unit === activeUnitData.unitName).filter(record => {
    const keyword = unitSearch.toLowerCase();
    const matchSearch = (record.serialNumber && record.serialNumber.toLowerCase().includes(keyword)) ||
                        (record.petugas && record.petugas.toLowerCase().includes(keyword));
    const matchTahap = unitTahap === '' || record.tahap === unitTahap;
    const matchDate = unitDate === '' || (new Date(record.timestamp).toISOString().split('T')[0] === unitDate);
    
    const { isError } = getErrorDetails(record);

    if (unitStatus === 'error') return matchSearch && matchTahap && matchDate && isError;
    if (unitStatus === 'pengganti') return matchSearch && matchTahap && matchDate && record.isPengganti;
    return matchSearch && matchTahap && matchDate;
  }).sort((a, b) => {
    if (unitSort === 'asc') return (a.nomorUrut || 0) - (b.nomorUrut || 0);
    if (unitSort === 'desc') return (b.nomorUrut || 0) - (a.nomorUrut || 0);
    return new Date(b.timestamp) - new Date(a.timestamp); 
  }) : [];

  const exportUnitCSV = () => {
    if (filteredUnitRecords.length === 0) return alert("Tidak ada data untuk diekspor!");
    let csvContent = `Waktu Input,No Antrean,Serial Number,Tahap,Tipe,Petugas,Status,Keterangan Error,Tindak Lanjut,Info Pengganti\n`;
    filteredUnitRecords.forEach(record => {
      const waktu = record.timestamp ? new Date(record.timestamp).toLocaleString('id-ID') : '-';
      const no = record.nomorUrut || '-';
      const sn = record.serialNumber;
      const tahap = record.tahap || '-';
      const tipe = record.isPengganti ? 'Pengganti' : 'Reguler';
      const petugas = record.petugas || '-';
      const { isError, notes } = getErrorDetails(record);
      const status = isError ? 'Error' : 'Normal';
      const keterangan = isError ? notes.join(" | ") : "-";
      const tindakLanjut = record.tindakLanjut || "-";
      const infoPengganti = record.isPengganti ? (record.linkedErrorSN ? `Terkait Error: ${record.linkedErrorSN}` : 'Belum Ditautkan') : '-';
      csvContent += `"${waktu}","${no}","${sn}","${tahap}","${tipe}","${petugas}","${status}","${keterangan}","${tindakLanjut}","${infoPengganti}"\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
    link.download = `Laporan_${activeUnitData.unitName}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const exportUnitPDF = () => {
    if (filteredUnitRecords.length === 0) return alert("Tidak ada data untuk diekspor!");
    const docPdf = new jsPDF('landscape'); 
    docPdf.text(`Laporan Pemeriksaan: ${activeUnitData.unitName}`, 14, 15);
    const head = [["Waktu", "SN", "Tahap", "Status", "Ket Error", "Tindak Lanjut"]];
    const body = filteredUnitRecords.map(record => {
      const { isError, notes } = getErrorDetails(record);
      return [ formatWaktu(record.timestamp), record.formatTampil || record.serialNumber, record.tahap, isError ? 'Error' : (record.isPengganti ? 'Pengganti' : 'OK'), isError ? notes.join(" | ") : "-", record.tindakLanjut || "-" ];
    });
    autoTable(docPdf, { head, body, startY: 25, headStyles: { fillColor: [66, 133, 244] }, styles: { fontSize: 8 } });
    docPdf.save(`Laporan_${activeUnitData.unitName}.pdf`);
  };

  const exportGlobalCSV = () => {
    if (recentRecords.length === 0) return alert("Tidak ada data keseluruhan untuk diekspor!");
    let csvContent = "Waktu Input,Serial Number,Tipe Data,Kategori Unit,Tahap,Petugas,Status\n";
    recentRecords.forEach(record => {
      const waktu = record.timestamp ? new Date(record.timestamp).toLocaleString('id-ID') : '-';
      const sn = record.formatTampil ? record.formatTampil : record.serialNumber;
      const status = isRecordError(record) ? 'Error' : 'Normal';
      const tipe = record.isPengganti ? 'Pengganti' : 'Reguler';
      csvContent += `"${waktu}","${sn}","${tipe}","${record.unit || '-'}","${record.tahap || '-'}","${record.petugas || '-'}","${status}"\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
    link.download = `Laporan_Global_SIP_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const exportGlobalPDF = () => {
    if (recentRecords.length === 0) return alert("Tidak ada data keseluruhan untuk diekspor!");
    const docPdf = new jsPDF(); 
    docPdf.text(`Rekapitulasi Global Pemeriksaan SIP`, 14, 15);
    const tableRows = recentRecords.map(record => [
      record.timestamp ? new Date(record.timestamp).toLocaleString('id-ID', {day:'2-digit', month:'short'}) : '-', record.serialNumber, record.isPengganti ? 'Pengganti' : 'Reguler', `${record.unit} - ${record.tahap}`, record.petugas || '-', isRecordError(record) ? 'Error' : 'Normal'
    ]);
    autoTable(docPdf, { head: [["Tanggal", "Serial Number", "Tipe", "Kategori", "Petugas", "Status"]], body: tableRows, startY: 25, headStyles: { fillColor: [26, 115, 232] } });
    docPdf.save(`Laporan_Global_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans">
      
      <div className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard Kinerja</h1>
          <p className="text-slate-500 mt-1">Pantau progres analitik visual dan rincian tabel per kategori.</p>
        </div>
        
        {activeDashTab === 'grafik' && (
          <div className="flex gap-2 shrink-0 bg-white p-1 rounded-xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
             <button onClick={exportGlobalCSV} className="px-5 py-2.5 bg-[#107C41] hover:bg-[#0B5C30] text-white rounded-lg text-sm font-bold transition-all flex items-center gap-2">📥 Excel Global</button>
             <button onClick={exportGlobalPDF} className="px-5 py-2.5 bg-[#C5221F] hover:bg-[#A50E0E] text-white rounded-lg text-sm font-bold transition-all flex items-center gap-2">📄 PDF Global</button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-[#4285F4] font-medium animate-pulse">Menghitung analitik data...</div>
      ) : dashboardData.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl shadow-sm border border-slate-100 text-slate-500">Belum ada Unit yang memiliki data.</div>
      ) : (
        <>
          {/* NAVIGASI TAB DASHBOARD */}
          <div className="flex flex-wrap gap-2 mb-8 bg-[#F1F3F4] p-1.5 rounded-2xl w-fit border border-slate-200">
            <button 
              onClick={() => { setActiveDashTab('grafik'); resetFilters(); }} 
              className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center gap-2 ${activeDashTab === 'grafik' ? 'bg-white text-[#1A73E8] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              📊 Analitik & Grafik
            </button>
            {dashboardData.map((u, idx) => (
              <button 
                key={idx}
                onClick={() => { setActiveDashTab(u.unitName); resetFilters(); }} 
                className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center gap-2 ${activeDashTab === u.unitName ? 'bg-white text-[#1A73E8] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                📦 Data {u.unitName}
              </button>
            ))}
          </div>

          {/* TAB 1: GRAFIK & ANALITIK KESELURUHAN */}
          {activeDashTab === 'grafik' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {dashboardData.map((unitData, index) => (
                <div key={index} className="bg-white p-6 md:p-8 rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-50">
                  
                  <div className="mb-6 pb-4 border-b border-slate-100 flex justify-between items-center">
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase" style={{ color: unitData.color }}>
                      {unitData.unitName}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                    
                    <div className="lg:col-span-2 flex flex-col gap-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                        
                        {/* KARTU TARGET (Warna Biru Google) */}
                        <div className="bg-[#4285F4] text-white p-6 rounded-3xl border border-blue-500 flex flex-col justify-center shadow-md relative overflow-hidden">
                          <div className="absolute -right-4 -top-4 text-7xl opacity-10">🎯</div>
                          <p className="text-xs font-extrabold text-blue-100 uppercase tracking-widest">Total Target</p>
                          <div className="flex items-baseline gap-2 mt-2">
                            <h3 className="text-5xl font-black text-white">{unitData.baseGrandTotal.toLocaleString('id-ID')}</h3>
                          </div>
                          {unitData.overTarget > 0 && (
                            <span className="text-xs font-black text-blue-600 bg-white px-2 py-1 rounded-lg mt-3 w-fit shadow-sm" title="Jumlah unit yang melebihi target awal">
                              +{unitData.overTarget} Over Target
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col gap-4 col-span-2">
                           <div className="grid grid-cols-2 gap-4 flex-1">
                             {/* KARTU TELAH DIKERJAKAN (Warna Hijau Google) */}
                             <div className="bg-[#34A853] text-white p-4 rounded-2xl border border-green-600 flex flex-col justify-center shadow-md">
                               <p className="text-[10px] font-extrabold text-green-100 uppercase tracking-widest">Telah Dikerjakan</p>
                               <h3 className="text-3xl font-black text-white mt-1">{unitData.normalCount.toLocaleString('id-ID')}</h3>
                               <p className="text-[10px] font-bold text-green-50 mt-1">{unitData.progressPercent}% dari Target</p>
                             </div>
                             
                             <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-center shadow-sm">
                               <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Sisa Pekerjaan</p>
                               <h3 className="text-3xl font-black text-slate-700 mt-1">{unitData.sisa.toLocaleString('id-ID')}</h3>
                               <p className="text-[10px] font-bold text-slate-400 mt-1">{unitData.sisaPercent}% Sisa Target</p>
                             </div>
                           </div>
                           <div className="grid grid-cols-2 gap-4 flex-1">
                             <div className="bg-[#FCE8E6]/50 p-4 rounded-2xl border border-[#FAD2CF] flex flex-col justify-center shadow-sm">
                               <p className="text-[10px] font-extrabold text-[#C5221F] uppercase tracking-widest">Jumlah Error</p>
                               <h3 className="text-2xl font-black text-[#C5221F] mt-1">{unitData.totalError.toLocaleString('id-ID')}</h3>
                             </div>
                             <div className="bg-[#F3E8FD]/50 p-4 rounded-2xl border border-[#E9D5FF] flex flex-col justify-center shadow-sm">
                               <p className="text-[10px] font-extrabold text-[#7E22CE] uppercase tracking-widest">Wajib Pengganti</p>
                               <h3 className="text-2xl font-black text-[#7E22CE] mt-1">{unitData.totalPengganti.toLocaleString('id-ID')}</h3>
                             </div>
                           </div>
                        </div>

                      </div>
                    </div>

                    <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col justify-center items-center relative">
                      <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-4">Progres Target Reguler</p>
                      <div className="h-44 w-full relative flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={unitData.pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value" stroke="none" labelLine={false} label={renderCustomizedLabel}>
                              {unitData.pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                            </Pie>
                            <RechartsTooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                           <span className="text-2xl font-black" style={{ color: unitData.color }}>{unitData.progressPercent}%</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-6">
                        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: unitData.color }}></span><span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Selesai</span></div>
                        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#F1F3F4] border border-slate-300"></span><span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Sisa</span></div>
                      </div>
                    </div>
                  </div>

                  {/* BARIS 2: GRAFIK BATANG PER TAHAP */}
                  <div className="flex flex-col bg-white border border-slate-100 rounded-3xl p-6 shadow-sm mt-4">
                    <h3 className="font-bold text-slate-700 mb-6 text-sm text-center">📈 Target Alokasi per Tahap</h3>
                    {unitData.listTahap.length === 0 ? (
                      <div className="flex-1 min-h-[200px] flex items-center justify-center text-slate-400 text-sm font-medium">Target tahap belum diatur di Master Data.</div>
                    ) : (
                      <div className="w-full h-[320px] mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={unitData.listTahap} margin={{ top: 30, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F4" />
                            <XAxis dataKey="namaTahap" tick={{fontSize: 10, fill: '#64748B', fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                            <YAxis tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} />
                            <RechartsTooltip cursor={{fill: '#F8F9FA'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px'}} />
                            
                            <Bar dataKey="baseTarget" name="Total Target" fill={unitData.color} radius={[6, 6, 0, 0]} maxBarSize={90}>
                              <LabelList dataKey="baseTarget" position="top" style={{ fontSize: '11px', fill: unitData.color, fontWeight: '900' }} />
                            </Bar>
                            
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                </div>
              ))}
            </div>
          )}

          {/* TAB 2, 3... : TABEL DATA OPERASIONAL PER UNIT */}
          {activeUnitData && activeDashTab !== 'grafik' && (
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              <div className="mb-6 pb-4 border-b border-slate-100 flex flex-col xl:flex-row justify-between xl:items-end gap-4">
                <div>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">📑 Tabel Data: {activeUnitData.unitName}</h2>
                  <p className="text-slate-500 text-sm mt-1">Daftar keseluruhan riwayat data yang dapat disaring dan diurutkan.</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button onClick={exportUnitCSV} className="flex-1 sm:flex-none px-5 py-2.5 bg-[#107C41] hover:bg-[#0B5C30] text-white rounded-lg text-sm font-bold shadow-sm transition-all whitespace-nowrap">📥 Export Excel</button>
                  <button onClick={exportUnitPDF} className="flex-1 sm:flex-none px-5 py-2.5 bg-[#C5221F] hover:bg-[#A50E0E] text-white rounded-lg text-sm font-bold shadow-sm transition-all whitespace-nowrap">📄 Export PDF</button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-6 bg-slate-50/50 p-2 md:p-3 rounded-2xl border border-slate-100">
                 
                 <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm shrink-0 overflow-x-auto">
                    <button onClick={() => setUnitStatus('semua')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${unitStatus === 'semua' ? 'bg-[#1A73E8] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>📦 Semua</button>
                    <button onClick={() => setUnitStatus('error')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${unitStatus === 'error' ? 'bg-[#C5221F] text-white shadow-sm' : 'text-slate-500 hover:bg-red-50 hover:text-[#C5221F]'}`}>⚠️ Error</button>
                    <button onClick={() => setUnitStatus('pengganti')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${unitStatus === 'pengganti' ? 'bg-[#9333EA] text-white shadow-sm' : 'text-slate-500 hover:bg-purple-50 hover:text-[#9333EA]'}`}>🔄 Pengganti</button>
                 </div>

                 <button onClick={resetFilters} className="px-3 py-2 bg-white text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition-all border border-slate-200 hover:border-red-200 shadow-sm whitespace-nowrap flex items-center justify-center shrink-0">
                   🗑️ Reset
                 </button>

                 <div className="w-[1px] h-6 bg-slate-300 hidden xl:block mx-1"></div>

                 <div className="flex-grow min-w-[200px]">
                    <input type="text" placeholder="🔍 Cari SN / Petugas..." value={unitSearch} onChange={(e) => setUnitSearch(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-[#4285F4] text-slate-800 w-full shadow-sm" />
                 </div>
                 
                 <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto">
                   <input type="date" value={unitDate} onChange={(e) => setUnitDate(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-[#4285F4] text-slate-800 w-full sm:w-36 cursor-pointer shadow-sm shrink-0" title="Filter Tanggal" />
                   
                   <select value={unitTahap} onChange={(e) => setUnitTahap(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-[#4285F4] text-slate-800 w-full sm:w-36 cursor-pointer shadow-sm shrink-0">
                     <option value="">Semua Tahap</option>
                     {activeUnitData.listTahap.map(t => <option key={t.id} value={t.namaTahap}>{t.namaTahap}</option>)}
                   </select>

                   <select value={unitSort} onChange={(e) => setUnitSort(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#4285F4] text-slate-700 w-full sm:w-40 cursor-pointer shadow-sm shrink-0">
                     <option value="terbaru">⏰ Urut: Terbaru</option>
                     <option value="asc">🔢 No Antrean (A - Z)</option>
                     <option value="desc">🔢 No Antrean (Z - A)</option>
                   </select>
                 </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm max-h-[600px] overflow-y-auto relative">
                <table className="w-full text-left text-xs text-slate-600 min-w-max">
                  <thead className="bg-[#F8F9FA] border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                     <tr className="font-bold text-slate-500 uppercase tracking-wider">
                       <th className="py-4 px-4 whitespace-nowrap">Waktu</th>
                       <th className="py-4 px-4 whitespace-nowrap">Serial Number</th>
                       <th className="py-4 px-4 whitespace-nowrap">Tahap</th>
                       <th className="py-4 px-4 whitespace-nowrap">Petugas</th>
                       <th className="py-4 px-4 text-center whitespace-nowrap">Status</th>
                       <th className="py-4 px-4">Keterangan Error</th>
                       <th className="py-4 px-4">Tindak Lanjut / Info Pengganti</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUnitRecords.length === 0 ? (
                       <tr><td colSpan="7" className="py-16 text-center text-slate-400 font-medium text-sm">Tidak ada data ditemukan sesuai filter.</td></tr>
                    ) : (
                       filteredUnitRecords.map((record) => {
                         const { isError, notes } = getErrorDetails(record);
                         return (
                           <tr key={record.id} className={`transition-colors ${isError ? 'bg-red-50/20 hover:bg-red-50/60' : record.isPengganti ? 'bg-purple-50/20 hover:bg-purple-50/50' : 'hover:bg-slate-50'}`}>
                             <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{formatWaktu(record.timestamp)}</td>
                             <td className="py-3 px-4">
                                <div className="flex flex-col items-start gap-1">
                                  <button onClick={() => setPreviewRecord(record)} title="Klik untuk lihat PDF & Foto" className="font-mono font-bold text-[#1A73E8] hover:underline hover:text-blue-800 transition-all cursor-pointer text-base whitespace-nowrap">
                                    📄 {record.formatTampil ? record.formatTampil : record.serialNumber}
                                  </button>
                                  {record.isPengganti && <span className="bg-[#F3E8FD] text-[#7E22CE] px-1.5 py-0.5 rounded text-[8px] font-black border border-[#E9D5FF] tracking-widest">PENGGANTI</span>}
                                </div>
                             </td>
                             <td className="py-3 px-4 font-bold text-slate-700 whitespace-nowrap">{record.tahap}</td>
                             <td className="py-3 px-4 uppercase font-bold text-slate-500 whitespace-nowrap">{record.petugas || '-'}</td>
                             <td className="py-3 px-4 text-center">
                                {isError ? <span className="bg-[#FCE8E6] text-[#C5221F] px-2 py-1 rounded text-[10px] font-bold border border-[#FAD2CF]">ERROR</span> : <span className="bg-[#E6F4EA] text-[#137333] px-2 py-1 rounded text-[10px] font-bold border border-[#CEEAD6]">OK</span>}
                             </td>
                             
                             <td className="py-3 px-4 max-w-[200px]">
                                {isError ? (
                                  <div className="flex flex-col gap-1">
                                    {notes.map((note, i) => <span key={i} className="text-[#C5221F] text-[10px] bg-red-50 px-2 py-1 rounded border border-red-100 block break-words leading-tight">• {note}</span>)}
                                  </div>
                                ) : <span className="text-slate-300 font-bold ml-4">-</span>}
                             </td>

                             <td className="py-3 px-4 max-w-[250px]">
                                {isError && (
                                   record.tindakLanjut ? (
                                     <span className="text-[#137333] font-medium text-[10px] bg-green-50 px-2 py-1.5 rounded-lg border border-green-200 block whitespace-pre-line leading-relaxed">✓ {record.tindakLanjut}</span>
                                   ) : (
                                     <span className="text-amber-600 text-[10px] italic bg-amber-50 px-2 py-1 rounded border border-amber-100 block w-fit">⏳ Menunggu tindakan...</span>
                                   )
                                )}
                                {record.isPengganti && (
                                   record.linkedErrorSN ? (
                                     <span className="text-[#7E22CE] text-[10px] font-bold bg-[#F3E8FD] px-2 py-1.5 rounded border border-[#E9D5FF] block w-fit">Terkait Error: {record.linkedErrorSN}</span>
                                   ) : (
                                     <span className="text-amber-600 text-[10px] font-bold bg-amber-50 px-2 py-1.5 rounded border border-amber-200 block w-fit">⏳ Belum Ditautkan</span>
                                   )
                                )}
                                {!isError && !record.isPengganti && <span className="text-slate-300 font-bold ml-4">-</span>}
                             </td>

                           </tr>
                         )
                       })
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}
        </>
      )}

      {/* MODAL OPSI B: REAL DRIVE EMBED */}
      {previewRecord && (
        <div className="fixed inset-0 bg-slate-900/80 z-[120] flex justify-center items-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-5xl h-[85vh] shadow-2xl flex flex-col animate-in zoom-in-95 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-800 text-white shrink-0">
              <div className="flex items-center gap-3">
                <span className="bg-[#1A73E8] p-2 rounded-lg text-xl leading-none">📂</span>
                <div>
                  <h3 className="font-bold text-sm tracking-wide uppercase">Bukti Fisik & PDF</h3>
                  <p className="text-[10px] font-mono text-slate-300 mt-0.5">
                    SN: {previewRecord.serialNumber} {previewRecord.isPengganti && "(UNIT PENGGANTI)"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {previewRecord.driveUrl && (
                  <a href={previewRecord.driveUrl} target="_blank" rel="noreferrer" className="px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold transition-all flex items-center gap-2">
                    Buka Tab Baru ↗
                  </a>
                )}
                <button onClick={() => setPreviewRecord(null)} className="w-8 h-8 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white font-bold transition-colors">✕</button>
              </div>
            </div>
            
            <div className="flex-1 bg-[#F1F3F4] w-full h-full relative">
              {previewRecord.driveUrl ? (
                <iframe src={`https://drive.google.com/embeddedfolderview?id=${extractDriveId(previewRecord.driveUrl)}#grid`} className="w-full h-full border-0" title="Drive Preview" allow="autoplay"></iframe>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                  <div className="text-6xl mb-4">📭</div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">Tautan Drive Tidak Tersimpan</h2>
                  <p className="text-sm text-slate-500 max-w-md">Data ini diunggah sebelum integrasi otomatis.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}