import { RefreshCw } from 'lucide-react';
import NotificationBell from './NotificationBell';

interface TopBarProps {
  streams: { id: string; nombre: string }[];
  activeStreamId: string | null;
  onSelectStream: (id: string) => void;
  onCreateStream: () => void;
}

export default function TopBar({ streams, activeStreamId, onSelectStream, onCreateStream }: TopBarProps) {
  return (
    <header className="h-topbar bg-brain-dark flex items-center gap-2 px-4 border-b border-brain-border-dark flex-shrink-0">
      <span className="text-white text-[13px] font-semibold tracking-wide mr-3 opacity-90 flex items-center gap-1.5">
        <span className="text-brain-accent">&#x2B21;</span> BRAIN
      </span>

      {streams.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelectStream(s.id)}
          className={`px-3 py-1.5 text-[11px] rounded-md border whitespace-nowrap transition-all ${
            s.id === activeStreamId
              ? 'bg-brain-border-dark text-white border-[#555]'
              : 'bg-brain-card text-[#aaa] border-brain-border-dark hover:text-white'
          }`}
        >
          {s.nombre}
        </button>
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
      </div>
    </header>
  );
}
