import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-brain-dark flex items-center justify-center">
      <div className="bg-brain-card border border-brain-border rounded-2xl p-10 w-full max-w-sm flex flex-col items-center gap-6 shadow-2xl">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-brain-accent/10 flex items-center justify-center mb-1">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="#059669" fillOpacity="0.15"/>
              <path d="M14 7L20 10.5V17.5L14 21L8 17.5V10.5L14 7Z" stroke="#059669" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="14" cy="14" r="2.5" fill="#059669"/>
            </svg>
          </div>
          <h1 className="text-[18px] font-semibold text-white">Brain MRO</h1>
          <p className="text-[12px] text-[#666] text-center">Acceso restringido al equipo autorizado</p>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-gray-800 text-[13px] font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {loading ? 'Redirigiendo...' : 'Continuar con Google'}
        </button>

        {error && (
          <p className="text-[11px] text-red-400 text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
