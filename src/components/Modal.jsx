import React from 'react';

export default function Modal({ 
  isOpen, title, message, type = 'confirm', 
  inputType = 'text', inputValue, onInputChange, inputPlaceholder = '',
  onConfirm, onCancel, confirmText = 'Ya', cancelText = 'Batal', 
  isDestructive = false, showCancel = true, children 
}) {
  if (!isOpen) return null;

  // Logika Pemilihan Ikon dan Warna Otomatis
  let Icon = '❓';
  let iconColor = 'bg-blue-50 text-blue-500';
  
  if (isDestructive) { Icon = '⚠️'; iconColor = 'bg-red-50 text-red-500'; }
  else if (type === 'prompt' || type === 'custom') { Icon = '✏️'; }
  else if (type === 'success') { Icon = '✅'; iconColor = 'bg-emerald-50 text-emerald-500'; }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-all duration-300 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all duration-300 animate-in zoom-in-95 slide-in-from-bottom-4">
        
        <div className="p-6 md:p-8">
          <div className={`w-12 h-12 rounded-full mb-5 flex items-center justify-center text-2xl shadow-inner ${iconColor}`}>
            {Icon}
          </div>
          <h3 className="text-xl font-black text-slate-800 mb-2">{title}</h3>
          {message && <p className="text-slate-500 text-sm leading-relaxed mb-6">{message}</p>}
          
          {type === 'prompt' && (
            <input 
              type={inputType} value={inputValue} onChange={(e) => onInputChange(e.target.value)} placeholder={inputPlaceholder}
              className="w-full px-5 py-3.5 bg-[#F8F9FA] border border-slate-200 rounded-2xl outline-none focus:border-[#4285F4] focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all font-bold text-slate-800 text-lg text-center" autoFocus
            />
          )}
          {type === 'custom' && <div className="mt-4">{children}</div>}
        </div>
        
        <div className="px-6 py-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          {/* Tombol Batal hanya muncul jika showCancel true */}
          {showCancel && (
            <button onClick={onCancel} className="px-5 py-2.5 rounded-full text-sm font-bold text-slate-500 hover:bg-slate-200 transition-colors">
              {cancelText}
            </button>
          )}
          <button onClick={onConfirm} className={`px-6 py-2.5 rounded-full text-sm font-bold text-white transition-all shadow-md ${isDestructive ? 'bg-[#EA4335] hover:bg-[#C5221F] shadow-red-500/30' : type === 'success' ? 'bg-[#34A853] hover:bg-[#2B8A44] shadow-emerald-500/30' : 'bg-[#1A73E8] hover:bg-[#1557B0] shadow-blue-500/30'}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}