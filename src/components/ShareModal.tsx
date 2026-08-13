import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Miembro { id: string; email: string; rol: string }

// Modal para compartir UN stream: pre-autoriza correos e da el link. Solo lo abre el equipo.
export default function ShareModal({ streamId, streamNombre, invitadoPor, onClose }: {
  streamId: string; streamNombre: string; invitadoPor?: string; onClose: () => void;
}) {
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [email, setEmail] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState('');

  const link = `${window.location.origin}?share=${streamId}`;

  async function cargar() {
    const { data } = await supabase.from('stream_members').select('id,email,rol').eq('stream_id', streamId);
    setMiembros((data as Miembro[]) || []);
  }
  useEffect(() => { cargar(); }, [streamId]);

  async function agregar() {
    const e = email.trim().toLowerCase();
    if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setError('Correo inválido'); return; }
    setError(''); setGuardando(true);
    const { error: err } = await supabase.from('stream_members').insert({
      stream_id: streamId, email: e, rol: 'miembro', invited_by: invitadoPor || null,
    });
    setGuardando(false);
    if (err && !/duplicate|unique/i.test(err.message)) { setError(err.message); return; }
    setEmail('');
    cargar();
  }

  async function quitar(id: string) {
    await supabase.from('stream_members').delete().eq('id', id);
    cargar();
  }

  function copiar() {
    navigator.clipboard.writeText(link).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-brain-border w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-brain-border flex items-center gap-2">
          <span className="text-[13px]">🔗</span>
          <span className="text-[13px] font-semibold text-gray-900">Compartir «{streamNombre}»</span>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700 text-[16px] leading-none">×</button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Link del stream</p>
            <div className="flex items-center gap-2">
              <input readOnly value={link} className="flex-1 min-w-0 bg-brain-surface border border-brain-border rounded-md px-2 py-1.5 text-[11px] text-gray-700 font-mono" />
              <button onClick={copiar} className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-brain-accent text-white hover:brightness-110 transition whitespace-nowrap">
                {copiado ? 'Copiado ✓' : 'Copiar'}
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">Solo los correos pre-autorizados abajo podrán entrar (tras iniciar sesión con Google).</p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Invitar por correo</p>
            <div className="flex items-center gap-2">
              <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()}
                placeholder="persona@empresa.com" type="email"
                className="flex-1 min-w-0 bg-white border border-brain-border rounded-md px-2 py-1.5 text-[12px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-brain-accent" />
              <button onClick={agregar} disabled={guardando}
                className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-brain-accent text-white disabled:opacity-40 hover:brightness-110 transition whitespace-nowrap">
                {guardando ? '…' : 'Invitar'}
              </button>
            </div>
            {error && <p className="text-[11px] text-brain-error mt-1">{error}</p>}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Con acceso ({miembros.length})</p>
            {miembros.length === 0 ? (
              <p className="text-[11px] text-gray-400 py-1">Nadie invitado aún.</p>
            ) : (
              <div className="space-y-1">
                {miembros.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-[12px] px-2 py-1.5 bg-brain-surface rounded-md">
                    <span className="flex-1 min-w-0 truncate text-gray-800">{m.email}</span>
                    <button onClick={() => quitar(m.id)} className="text-[11px] text-brain-error hover:opacity-70">Quitar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
