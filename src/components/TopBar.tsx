import { useState, useRef } from 'react';
import { RefreshCw, LogOut, X } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { supabase } from '../lib/supabase';

interface TopBarProps {
  streams: { id: string; nombre: string }[];
  activeStreamId: string | null;
  onSelectStream: (id: string) => void;
  onCreateStream: () => void;
  onDeleteStream: (id: string) => void;
  onRenameStream: (id: string, nombre: string) => void;
}

export default function TopBar({ streams, activeStreamId, onSelectStream, onCreateStream, onDeleteStream, onRenameStream }: TopBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
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
        <span className="text-brain-accent">&#x2B21;</span> BRAIN
      </span>

      {streams.map((s) => (
        <div
          key={s.id}
          className={`group relative flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-md border whitespace-nowrap transition-all ${
            editingId === s.id ? 'cursor-text' : 'cursor-pointer'
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

      <button
        onClick={onCreateStream}
        className="px-3 py-1.5 text-[11px] rounded-md border border-dashed border-[#444] text-[#666] hover:text-[#999] hover:border-[#666] transition-colors whitespace-nowrap"
      >
        + New Stream
      </button>

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
