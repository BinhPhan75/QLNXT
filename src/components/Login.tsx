import React, { useState } from 'react';
import { useInventory } from '../InventoryContext';
import { Lock, User as UserIcon, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { APP_LOGO_URL } from '../constants';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useInventory();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Simulate network delay
    setTimeout(() => {
      if (login(username, password)) {
        // Success
      } else {
        setError('Tên đăng nhập hoặc mật khẩu không đúng');
      }
      setLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-luxury-black p-4 relative overflow-hidden">
      {/* Decorative Orbs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-gold-500/5 blur-[120px] rounded-full -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gold-500/5 blur-[120px] rounded-full translate-x-1/2 translate-y-1/2" />
      
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="w-full max-w-md bg-luxury-dark rounded-[2.5rem] shadow-2xl p-10 border border-gold-500/10 relative z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gold-500 text-luxury-black mb-6 shadow-xl shadow-gold-500/20 p-4 transform -rotate-3 transition-transform hover:rotate-0 duration-500">
            <img 
               src={APP_LOGO_URL} 
               alt="NGHIATINGOLD Logo" 
               className="w-full h-full object-contain"
               referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-[0.2em] uppercase font-serif">
            NGHIA<span className="text-gold-500 font-sans">TINGOLD</span>
          </h1>
          <p className="text-zinc-500 mt-2 text-xs font-bold uppercase tracking-widest">Luxury Inventory Management</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 mb-2 uppercase tracking-[0.15em]">Tên đăng nhập</label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-gold-500 transition-colors">
                <UserIcon size={18} />
              </span>
              <input
                type="text"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-luxury-black border border-white/5 rounded-2xl text-white placeholder-zinc-700 focus:ring-1 focus:ring-gold-500 focus:border-transparent transition-all outline-none"
                placeholder="Nhập tên đăng nhập"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-500 mb-2 uppercase tracking-[0.15em]">Mật khẩu</label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-gold-500 transition-colors">
                <Lock size={18} />
              </span>
              <input
                type="password"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-luxury-black border border-white/5 rounded-2xl text-white placeholder-zinc-700 focus:ring-1 focus:ring-gold-500 focus:border-transparent transition-all outline-none"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-rose-500 text-xs font-medium text-center bg-rose-500/10 py-2 rounded-lg border border-rose-500/20"
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold-500 hover:bg-gold-400 text-luxury-black font-bold py-4 rounded-2xl transition-all shadow-lg shadow-gold-500/10 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] uppercase text-xs tracking-widest mt-8"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Vào hệ thống'}
          </button>
        </form>

        <div className="mt-10 pt-8 border-t border-white/5 text-center">
          <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.2em] leading-relaxed">
            Hãng Chế Tác và Kinh Doanh Trang Sức<br/>
            <span className="text-zinc-500">NGHIA TINGOLD Luxury Group</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
