import { useState, useRef } from 'react';
import { RefreshCw, LogOut, X } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { supabase } from '../lib/supabase';

const STREAM_TYPES: { tipo: string; label: string }[] = [
  { tipo: 'generico',    label: 'Genérica' },
  { tipo: 'correo',      label: 'Correo' },
  { tipo: 'whatsapp',    label: 'WhatsApp' },
  { tipo: 'busquedas',   label: 'Búsquedas' },
  { tipo: 'publicacion', label: 'Publicación' },
  { tipo: 'cotizacion',  label: 'Cotización' },
];

interface TopBarProps {
  streams: { id: string; nombre: string }[];
  activeStreamId: string | null;
  onSelectStream: (id: string) => void;
  onCreateStream: (tipo: string) => void;
  onDeleteStream: (id: string) => void;
  onRenameStream: (id: string, nombre: string) => void;
  onReorderStreams: (from: number, to: number) => void;
}

export default function TopBar({ streams, activeStreamId, onSelectStream, onCreateStream, onDeleteStream, onRenameStream, onReorderStreams }: TopBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragIndex = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(s: { id: string; nombre: string }, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(s.id);
    setEditValue(s.nombre);
    setTimeout(() => { inputRef.current?.select(); }, 0);
  }

  function commitEdit(id: string) {
    const trimmed = editValue.trim();
    if (trimmed) onRenameStream(id, trimmed);
    setEditingId(null);
  }

  return (
    <header className="h-topbar bg-brain-dark flex items-center gap-2 px-4 border-b border-brain-border-dark flex-shrink-0">
      <span className="text-white text-[13px] font-semibold tracking-wide mr-3 opacity-90 flex items-center gap-1.5">
        <span className="text-brain-accent flex items-center" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 10c0-3.9 3.1-6.6 7-6.6s7 2.7 7 6.6" />
            <path d="M5 10c2.3 1.2 4.6 1.8 7 1.8s4.7-.6 7-1.8" />
            <circle cx="12" cy="6.1" r="1.4" />
            <path d="M6.5 10.4v2.3a5.5 5.5 0 0 0 11 0v-2.3" />
            <path d="M10 13.6h.01M14 13.6h.01" />
            <path d="M10.4 16c.5.5 1 .7 1.6.7s1.1-.2 1.6-.7" />
          </svg>
        </span>
        My Genie
      </span>

      {streams.map((s, i) => (
        <div
          key={s.id}
          draggable={editingId !== s.id}
          onDragStart={() => { dragIndex.current = i; }}
          onDragOver={(e) => { e.preventDefault(); if (dragOver !== i) setDragOver(i); }}
          onDragLeave={() => setDragOver((d) => (d === i ? null : d))}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex.current !== null && dragIndex.current !== i) onReorderStreams(dragIndex.current, i);
            dragIndex.current = null;
            setDragOver(null);
          }}
          onDragEnd={() => { dragIndex.current = null; setDragOver(null); }}
          className={`group relative flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-md border whitespace-nowrap transition-all ${
            editingId === s.id ? 'cursor-text' : 'cursor-grab active:cursor-grabbing'
          } ${
            dragOver === i ? 'ring-1 ring-brain-accent' : ''
          } ${
            s.id === activeStreamId
              ? 'bg-brain-border-dark text-white border-[#555]'
              : 'bg-brain-card text-[#aaa] border-brain-border-dark hover:text-white'
          }`}
          onClick={() => editingId !== s.id && onSelectStream(s.id)}
          onDoubleClick={(e) => startEdit(s, e)}
        >
          {editingId === s.id ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => commitEdit(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit(s.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent outline-none border-none text-white w-24 text-[11px]"
              autoFocus
            />
          ) : (
            <span>{s.nombre}</span>
          )}
          {streams.length > 1 && editingId !== s.id && (
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteStream(s.id); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 rounded hover:text-red-400 text-[#888]"
              title="Cerrar stream"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}

      <div className="relative">
        <button
          onClick={() => setShowTypeMenu((v) => !v)}
          className="px-3 py-1.5 text-[11px] rounded-md border border-dashed border-[#444] text-[#666] hover:text-[#999] hover:border-[#666] transition-colors whitespace-nowrap"
        >
          + New Stream
        </button>
        {showTypeMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowTypeMenu(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 bg-brain-card border border-brain-border-dark rounded-md py-1 min-w-[150px]">
              <div className="px-3 py-1 text-[10px] text-[#666] uppercase tracking-wider">Nuevo stream</div>
              {STREAM_TYPES.map((t) => (
                <button
                  key={t.tipo}
                  onClick={() => { onCreateStream(t.tipo); setShowTypeMenu(false); }}
                  className="block w-full text-left px-3 py-1.5 text-[11px] text-[#aaa] hover:text-white hover:bg-brain-border-dark transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md bg-brain-card text-brain-accent border border-brain-accent/30 hover:border-brain-accent/60 transition-colors whitespace-nowrap">
          <RefreshCw className="w-3 h-3" />
          Connect streams
        </button>
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md bg-brain-card text-[#666] border border-brain-border-dark hover:text-[#aaa] transition-colors"
          title="Cerrar sesión"
        >
          <LogOut className="w-3 h-3" />
        </button>
      </div>
    </header>
  );
}
