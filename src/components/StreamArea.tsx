import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Mic, Image as ImageIcon, Search, PackageCheck, Radio, UserCheck, Keyboard, X, RotateCcw, Square, Upload, FileText, Check } from 'lucide-react';
import type { Message, Stream } from '../lib/types';
import FileUploadCard from './FileUploadCard';
import BulkWidget from './BulkWidget';
import { supabase } from '../lib/supabase';

// Extrae el JSON que sigue a un marcador (ej. "[OPORTUNIDADES]{...}"), respetando llaves anidadas.
function extractMarkerJson(text: string, marker: string): { json: any; raw: string } | null {
  const i = text.indexOf(marker);
  if (i === -1) return null;
  const start = text.indexOf('{', i);
  if (start === -1) return null;
  let depth = 0;
  for (let j = start; j < text.length; j++) {
    if (text[j] === '{') depth++;
    else if (text[j] === '}') {
      depth--;
      if (depth === 0) {
        const raw = text.slice(i, j + 1);
        try { return { json: JSON.parse(text.slice(start, j + 1)), raw }; } catch { return null; }
      }
    }
  }
  return null;
}

interface OportunidadItem {
  remitente?: string; correo?: string; empresa?: string; es_cliente?: boolean;
  productos?: string[]; faltan?: string[]; completa?: boolean;
}
interface OportunidadesData {
  total?: number; resumen?: string; omitidas?: number;
  oportunidades?: OportunidadItem[]; correos_no_rfq?: string[];
}

function OportunidadesWidget({ data }: { data: OportunidadesData }) {
  const opps = data.oportunidades || [];
  const total = data.total ?? opps.length;
  return (
    <div className="bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#2c2c2e] flex items-center gap-2">
        <span className="text-[13px]">{total > 0 ? '🔔' : '📭'}</span>
        <span className="text-[12px] font-semibold text-white">
          {total > 0 ? `${total} oportunidad${total !== 1 ? 'es' : ''} detectada${total !== 1 ? 's' : ''}` : 'Sin oportunidades nuevas'}
        </span>
      </div>
      {data.resumen && <div className="px-4 pt-2.5"><p className="text-[11px] text-gray-400">{data.resumen}</p></div>}
      <div className="p-3 space-y-2">
        {opps.map((o, i) => (
          <div key={i} className="bg-[#252527] border border-[#333] rounded-lg p-3">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-white truncate">{o.empresa || o.remitente || o.correo}</p>
                <p className="text-[11px] text-gray-500 truncate">{o.remitente}{o.correo ? ` · ${o.correo}` : ''}</p>
              </div>
              <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${o.completa ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                {o.completa ? '✓ Completa' : 'Incompleta'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mb-1">
              {o.es_cliente ? <span className="text-emerald-400">✓ Cliente en CRM</span> : <span className="text-gray-400">✗ No es cliente aún</span>}
            </p>
            {o.productos && o.productos.length > 0 && (
              <div className="mb-1">
                {o.productos.map((p, k) => <p key={k} className="text-[11px] text-gray-300 leading-snug">• {p}</p>)}
              </div>
            )}
            {o.faltan && o.faltan.length > 0 && (
              <p className="text-[11px] text-amber-400/90">Faltan: {o.faltan.join(', ')}</p>
            )}
          </div>
        ))}
        {total === 0 && data.correos_no_rfq && data.correos_no_rfq.length > 0 && (
          <div className="px-1">
            <p className="text-[11px] text-gray-500 mb-1">Revisé estos correos (ninguno es RFQ):</p>
            {data.correos_no_rfq.map((c, i) => <p key={i} className="text-[11px] text-gray-400 leading-snug">• {c}</p>)}
          </div>
        )}
        {!!data.omitidas && data.omitidas > 0 && (
          <p className="text-[11px] text-gray-500 px-1">Omití {data.omitidas} que ya están en proceso, esperando respuesta del cliente.</p>
        )}
      </div>
    </div>
  );
}

interface OportunidadCreadaData {
  empresa?: string; oportunidad?: string; oportunidad_url?: string;
  cuenta_url?: string; contacto?: string; contacto_url?: string;
}
function OportunidadCreadaWidget({ data }: { data: OportunidadCreadaData }) {
  const Row = ({ label, value, url }: { label: string; value?: string; url?: string }) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-[12px] text-gray-200 truncate">{value || '—'}</p>
      </div>
      {url && (
        <a href={url} target="_blank" rel="noreferrer"
           className="shrink-0 text-[11px] font-medium text-[#7C74E0] hover:text-[#9a93ee] whitespace-nowrap">
          Ver en CRM ↗
        </a>
      )}
    </div>
  );
  return (
    <div className="bg-[#1c1c1e] border border-emerald-500/25 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#2c2c2e] flex items-center gap-2">
        <span className="text-[13px]">✅</span>
        <span className="text-[12px] font-semibold text-white">Oportunidad creada{data.empresa ? ` — ${data.empresa}` : ''}</span>
      </div>
      <div className="px-4 py-2 divide-y divide-[#2a2a2c]">
        <Row label="Oportunidad" value={data.oportunidad} url={data.oportunidad_url} />
        {data.cuenta_url && <Row label="Cuenta" value={data.empresa} url={data.cuenta_url} />}
        {data.contacto_url && <Row label="Contacto" value={data.contacto} url={data.contacto_url} />}
      </div>
    </div>
  );
}

interface StreamAreaProps {
  stream: Stream | null;
  messages: Message[];
  bulkRfqIds: Set<string>;
  onActiveBulkIdChange: (id: string | null) => void;
  onSendMessage: (text: string) => void;
  onFileUploaded: (file: { name: string; type: string; size: number; url: string }, userText?: string, intent?: 'publish' | 'quote') => void;
  onDecision: (messageId: string, approved: boolean) => void;
  onImagenDecision: (rfqId: string, approved: boolean) => Promise<void>;
  onImagenRetry: (rfqId: string) => Promise<void>;
  onManualImageUpload: (rfqId: string, file: File) => Promise<void>;
  onParseConfirm: (messageId: string, confirmed: boolean, data: { marca: string; modelo: string; qty: number; urgente: boolean; imageUrl?: string }) => void;
  onDocsConfirm: (messageId: string, products: { marca: string; modelo: string; qty: number }[]) => void;
  onPublicar: (rfqId: string, proveedorRank: number) => void;
  onClearStream: () => void;
}

const FILE_ACCEPT = '.txt,.doc,.docx,.xls,.xlsx,.pdf,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.ogg';
const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp';

export default function StreamArea({ stream, messages, bulkRfqIds, onActiveBulkIdChange, onSendMessage, onFileUploaded, onDecision, onImagenDecision, onImagenRetry, onManualImageUpload, onParseConfirm, onDocsConfirm, onPublicar, onClearStream }: StreamAreaProps) {
  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [pendingDropFile, setPendingDropFile] = useState<File | null>(null);
  const [pendingFile, setPendingFile] = useState<{ name: string; type: string; size: number; url: string } | null>(null);
  const [pendingFileUploading, setPendingFileUploading] = useState(false);
  const dragCounter = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const channel = supabase
      .channel('bulk-notif-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones' },
        (payload) => {
          const n = payload.new as { tipo?: string; mensaje?: string };
          if (n.tipo === 'bulk' && n.mensaje) {
            try {
              const parsed = JSON.parse(n.mensaje);
              if (parsed.bulk_id) onActiveBulkIdChange(parsed.bulk_id);
            } catch { /* ignore parse errors */ }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [onActiveBulkIdChange]);

  async function handleSend() {
    const text = input.trim();
    if (!text && !pendingFile) return;
    setInput('');

    if (pendingFile) {
      onFileUploaded(pendingFile, text || undefined);
      setPendingFile(null);
    } else {
      onSendMessage(text);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleAudioUpload(blob: Blob) {
    if (!stream) return;
    const filename = `audio-${Date.now()}.webm`;
    const file = new File([blob], filename, { type: blob.type || 'audio/webm' });
    const path = `${stream.id}/${Date.now()}-${filename}`;
    const { data, error } = await supabase.storage
      .from('rfq-files')
      .upload(path, file);

    let url = '';
    if (!error && data) {
      const { data: urlData } = supabase.storage
        .from('rfq-files')
        .getPublicUrl(data.path);
      url = urlData.publicUrl;
    }

    onFileUploaded({
      name: filename,
      type: file.type,
      size: file.size,
      url: url || URL.createObjectURL(blob),
    });
  }

  function sanitizeFilename(name: string): string {
    const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : '';
    const base = name.replace(/\.[^.]+$/, '');
    const normalized = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const clean = normalized
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_\-]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 60);
    return (clean || `file_${Date.now()}`) + ext;
  }

  // Enruta lo seleccionado (drop/paste/picker): una imagen abre el modal de elección
  // (publicar al catálogo vs buscar RFQ); los documentos van directo a handleFilesSelected.
  function routeSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const imgs = arr.filter((f) => f.type.startsWith('image/'));
    const nonImgs = arr.filter((f) => !f.type.startsWith('image/'));
    if (nonImgs.length) {
      const dt = new DataTransfer();
      nonImgs.forEach((f) => dt.items.add(f));
      handleFilesSelected(dt.files);
    }
    if (imgs.length) setPendingDropFile(imgs[0]); // una imagen a la vez → modal de intención
  }

  async function handleFilesSelected(files: FileList | null, imageIntent?: 'publish' | 'quote') {
    if (!files || !stream) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const safeName = sanitizeFilename(file.name);
      const isImage = file.type.startsWith('image/');
      const isDocument = /\.(docx?|xlsx?)$/i.test(file.name) || /word|spreadsheet|excel/i.test(file.type);
      const bucket = isImage ? 'product-images' : 'rfq-files';
      const path = `${stream.id}/${Date.now()}-${safeName}`;

      if (isDocument) setPendingFileUploading(true);

      let url = '';

      // Try primary bucket
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, file);

      if (!error && data) {
        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(data.path);
        url = urlData.publicUrl;
      } else {
        console.error(`[upload] Primary upload failed (${bucket}):`, error?.message);
        // Retry with rfq-files bucket as fallback
        const fallbackPath = `${stream.id}/${Date.now()}-${safeName}`;
        const { data: fbData, error: fbError } = await supabase.storage
          .from('rfq-files')
          .upload(fallbackPath, file);
        if (!fbError && fbData) {
          const { data: fbUrl } = supabase.storage
            .from('rfq-files')
            .getPublicUrl(fbData.path);
          url = fbUrl.publicUrl;
        } else {
          console.error('[upload] Fallback also failed:', fbError?.message);
        }
      }

      const fileObj = { name: file.name, type: file.type, size: file.size, url: url || URL.createObjectURL(file) };

      if (isDocument) {
        // Queue as pending — user types intent before sending
        setPendingFile(fileObj);
        setPendingFileUploading(false);
      } else {
        onFileUploaded(fileObj, undefined, imageIntent);
      }
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      routeSelected(e.dataTransfer.files);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      imageFiles.forEach((f) => dt.items.add(f));
      routeSelected(dt.files);
    }
  }

  if (!stream) {
    return (
      <div className="flex-1 bg-brain-surface flex items-center justify-center">
        <p className="text-sm text-[#999]">Selecciona o crea un stream para comenzar</p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 bg-brain-surface flex flex-col min-w-0 min-h-0 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm border-2 border-dashed border-[#3B82F6] rounded-xl flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-[#3B82F6]" />
            <span className="text-sm font-medium text-[#3B82F6]">Suelta archivos aqui</span>
          </div>
        </div>
      )}
      {/* Drop image confirmation */}
      {pendingDropFile && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg p-5 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center">
                <PackageCheck className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">¿Qué hago con esta imagen?</p>
                <p className="text-xs text-[#999]">{pendingDropFile.name}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const dt = new DataTransfer();
                  dt.items.add(pendingDropFile);
                  handleFilesSelected(dt.files, 'publish');
                  setPendingDropFile(null);
                }}
                className="w-full px-3 py-2 bg-brain-accent text-white text-sm font-medium rounded-lg hover:bg-brain-accent-hover transition-colors text-left"
              >
                📦 Publicar al catálogo <span className="opacity-70 font-normal">— leo los links y publico</span>
              </button>
              <button
                onClick={() => {
                  const dt = new DataTransfer();
                  dt.items.add(pendingDropFile);
                  handleFilesSelected(dt.files, 'quote');
                  setPendingDropFile(null);
                }}
                className="w-full px-3 py-2 border border-brain-border text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-left"
              >
                🔍 Buscar RFQ <span className="opacity-60 font-normal">— busca inventario / proveedores</span>
              </button>
              <button
                onClick={() => setPendingDropFile(null)}
                className="w-full px-3 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="border-b border-brain-border bg-white flex-shrink-0 py-3">
        <div className="max-w-2xl mx-auto px-6 flex items-center gap-3">
          <h2 className="text-[14px] font-semibold text-gray-900">RFQ Flow &middot; MRO Master Pro</h2>
          <span className="text-[10px] font-medium text-brain-accent border border-brain-accent/30 bg-brain-accent-soft px-2.5 py-0.5 rounded-full">
            Agente Buscador activo
          </span>
          <button
            onClick={() => {
              if (window.confirm('¿Limpiar este stream? Los mensajes se quitarán de la vista. Los RFQs y la actividad quedan registrados en los logs.')) {
                onClearStream();
              }
            }}
            className="ml-auto flex items-center gap-1.5 text-[11px] text-[#999] hover:text-red-500 border border-brain-border hover:border-red-300 rounded-lg px-2.5 py-1 transition-colors"
            title="Limpiar stream (la actividad queda en los logs)"
          >
            <RotateCcw className="w-3 h-3" />
            Limpiar
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-light py-6">
        <div className="max-w-2xl mx-auto px-6 space-y-4">
          {messages.map((msg) => {
            if (msg.tipo === 'rfq-form') {
              return null;
            }

            const msgRfqId = (msg.contenido as any)?.rfq_id;
            const isBulkSuppressed = msgRfqId && bulkRfqIds.has(msgRfqId);
            if (isBulkSuppressed && ['widget', 'decision', 'rfq-status', 'imagen_lista', 'imagen_fallida', 'rfq-log'].includes(msg.tipo)) {
              return null;
            }

            if (msg.tipo === 'file-upload') {
              return <FileUploadCard key={msg.id} contenido={msg.contenido as { name?: string; type?: string; size?: number; url?: string }} />;
            }
            if (msg.tipo === 'bulk-widget') {
              const bId = (msg.contenido as { bulk_id?: string })?.bulk_id;
              if (bId) return <BulkWidget key={msg.id} bulkId={bId} />;
              return null;
            }
            if (msg.tipo === 'widget') {
              return <RFQWidget key={msg.id} message={msg} onPublicar={onPublicar} />;
            }
            if (msg.tipo === 'decision') {
              return <DecisionWidget key={msg.id} message={msg} onDecision={onDecision} />;
            }
            if (msg.tipo === 'imagen_lista') {
              return <ImagenListaWidget key={msg.id} message={msg} onDecision={onImagenDecision} />;
            }
            if (msg.tipo === 'imagen_fallida') {
              return <ImagenFallidaWidget key={msg.id} message={msg} onRetry={onImagenRetry} onManualUpload={onManualImageUpload} />;
            }
            if (msg.tipo === 'parse_confirm') {
              return <ParseConfirmWidget key={msg.id} message={msg} onConfirm={onParseConfirm} />;
            }
            if (msg.tipo === 'docs_parsed') {
              return <DocsProductsWidget key={msg.id} message={msg} onConfirm={onDocsConfirm} />;
            }
            if (msg.tipo === 'rfq-status') {
              return <RFQStatusWidget key={msg.id} message={msg} />;
            }
            if (msg.tipo === 'rfq-log') {
              return <RFQLogBubble key={msg.id} message={msg} />;
            }
            return <MessageBubble key={msg.id} message={msg} onSendMessage={onSendMessage} />;
          })}

        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={(e) => { routeSelected(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => { routeSelected(e.target.files); e.target.value = ''; }}
      />

      {/* Pending document chip */}
      {(pendingFile || pendingFileUploading) && (
        <div className="border-t border-brain-border bg-white px-4 pt-3 pb-1">
          <div className="max-w-2xl mx-auto">
            {pendingFileUploading ? (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span className="text-sm text-blue-700">Subiendo archivo...</span>
              </div>
            ) : pendingFile && (
              <>
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span className="text-sm text-blue-800 truncate flex-1">{pendingFile.name}</span>
                  <button onClick={() => setPendingFile(null)} className="text-blue-400 hover:text-blue-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1 px-1">Escribe tu instrucción y presiona enviar — ej: "crea rfqs" o "verifica en el CRM"</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Chatbox */}
      <MobileVoiceInput
        input={input}
        setInput={setInput}
        onSend={handleSend}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFileClick={() => fileInputRef.current?.click()}
        onImageClick={() => imageInputRef.current?.click()}
        onAudioReady={(blob) => handleAudioUpload(blob)}
      />

    </div>
  );
}

interface MobileVoiceInputProps {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onFileClick: () => void;
  onImageClick: () => void;
  onAudioReady: (blob: Blob) => void;
}

function MobileVoiceInput({ input, setInput, onSend, onKeyDown, onPaste, onFileClick, onImageClick, onAudioReady }: MobileVoiceInputProps) {
  const [expanded, setExpanded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingDone, setRecordingDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const scheduleCollapse = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => {
      if (!input.trim()) setExpanded(false);
    }, 6000);
  }, [input]);

  useEffect(() => {
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  async function startRecording() {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = mediaStream;
      chunksRef.current = [];
      audioBlobRef.current = null;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(mediaStream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        audioBlobRef.current = new Blob(chunksRef.current, { type: mimeType });
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };

      recorder.start();
      setRecording(true);
      setRecordingDone(false);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
    } catch {
      // Permission denied or no mic available - silently ignore
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    setRecordingDone(true);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function cancelRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    audioBlobRef.current = null;
    setRecording(false);
    setRecordingDone(false);
    setElapsed(0);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function reRecord() {
    cancelRecording();
    startRecording();
  }

  function postRecording() {
    if (audioBlobRef.current) {
      onAudioReady(audioBlobRef.current);
    }
    audioBlobRef.current = null;
    chunksRef.current = [];
    mediaRecorderRef.current = null;
    setRecording(false);
    setRecordingDone(false);
    setElapsed(0);
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function handleExpand() {
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handleSendAndCollapse() {
    onSend();
    setExpanded(false);
  }

  return (
    <div className="flex-shrink-0 pb-5 pt-2 px-4 md:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Desktop: always show full chatbox */}
        <div className="hidden md:flex items-center gap-3 bg-white border border-brain-border rounded-2xl px-4 py-3 shadow-sm">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder="Escribe un mensaje o sube un archivo..."
            className="flex-1 bg-transparent text-[13px] text-gray-800 placeholder-[#999] focus:outline-none"
          />
          <div className="flex items-center gap-1.5">
            <button
              onClick={onFileClick}
              title="Adjuntar archivo"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-gray-600 hover:bg-brain-surface transition-colors"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              onClick={startRecording}
              title="Grabar audio"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-gray-600 hover:bg-brain-surface transition-colors"
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              onClick={onImageClick}
              title="Subir imagen"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-gray-600 hover:bg-brain-surface transition-colors"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
            <button
              onClick={onSend}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-brain-accent text-white hover:bg-brain-accent-hover transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile: voice-first with expandable chatbox */}
        <div className="md:hidden">
          {recording ? (
            /* Recording state - seamless transformation from mic button */
            <div className="flex flex-col items-center gap-3">
              {/* Mic button transforms: same position, now blue with pulse rings */}
              <div className="relative flex items-center justify-center">
                <div className="absolute w-20 h-20 rounded-full border border-[#3B82F6]/20 animate-recording-ring" />
                <div className="absolute w-20 h-20 rounded-full border border-[#3B82F6]/10 animate-recording-ring-delayed" />
                <button
                  onClick={stopRecording}
                  className="relative w-16 h-16 flex items-center justify-center rounded-full bg-white border border-[#3B82F6]/30 text-[#3B82F6] shadow-sm active:scale-95 transition-transform"
                >
                  <Square className="w-5 h-5 fill-[#3B82F6]" />
                </button>
              </div>

              {/* Sound wave bars */}
              <div className="flex items-end justify-center gap-[3px] h-7">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-[2.5px] rounded-full bg-[#3B82F6] animate-sound-wave"
                    style={{ animationDelay: `${i * 0.07}s`, height: '100%' }}
                  />
                ))}
              </div>

              {/* Timer */}
              <span className="text-[12px] font-mono font-medium text-[#3B82F6]">{formatTime(elapsed)}</span>

              {/* Cancel */}
              <button
                onClick={cancelRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] text-[#999] hover:text-[#666] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
            </div>
          ) : recordingDone ? (
            /* Done state - waveform preview + actions */
            <div className="flex flex-col items-center gap-3">
              {/* Static waveform */}
              <div className="flex items-end justify-center gap-[3px] h-7">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-[2.5px] rounded-full bg-[#3B82F6]/50"
                    style={{ height: `${20 + Math.sin(i * 0.8) * 45 + 30}%` }}
                  />
                ))}
              </div>

              {/* Duration */}
              <span className="text-[12px] font-mono font-medium text-[#555]">{formatTime(elapsed)}</span>

              {/* Actions row */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={cancelRecording}
                  className="w-9 h-9 flex items-center justify-center rounded-full border border-[#E5E3DC] text-[#999] hover:text-[#666] hover:border-[#ccc] transition-colors"
                  title="Cancelar"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={reRecord}
                  className="w-9 h-9 flex items-center justify-center rounded-full border border-[#E5E3DC] text-[#999] hover:text-[#666] hover:border-[#ccc] transition-colors"
                  title="Regrabar"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={postRecording}
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-[#3B82F6] text-white shadow-sm hover:bg-[#2563EB] active:scale-95 transition-all"
                  title="Enviar"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          ) : !expanded ? (
            /* Idle state - mic button */
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={startRecording}
                title="Toca para hablar"
                className="w-16 h-16 flex items-center justify-center rounded-full bg-white border border-[#D4D7DC] text-[#3B82F6] shadow-sm active:scale-95 transition-transform"
              >
                <Mic className="w-7 h-7" />
              </button>
              <span className="text-[11px] text-[#999] font-medium">Toca para hablar</span>
              <button
                onClick={handleExpand}
                className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-brain-border bg-white text-[11px] text-[#777] hover:text-gray-600 hover:border-gray-300 transition-colors"
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>Escribir</span>
              </button>
            </div>
          ) : (
            /* Expanded text input */
            <div className="flex items-center gap-2 bg-white border border-brain-border rounded-2xl px-3 py-2.5 shadow-sm animate-fade-in">
              <button
                onClick={() => { setExpanded(false); startRecording(); }}
                title="Volver a voz"
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-white border border-[#D4D7DC] text-[#3B82F6] active:scale-95 transition-transform"
              >
                <Mic className="w-4 h-4" />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); scheduleCollapse(); }}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onBlur={scheduleCollapse}
                placeholder="Escribe aqui..."
                className="flex-1 bg-transparent text-[13px] text-gray-800 placeholder-[#999] focus:outline-none min-w-0"
              />
              <button
                onClick={onFileClick}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-gray-600 transition-colors"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                onClick={onImageClick}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-gray-600 transition-colors"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
              <button
                onClick={handleSendAndCollapse}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="px-1 py-0.5 rounded bg-brain-surface text-[11px] font-mono text-brain-accent">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table: header line followed by separator line (---|---)
    if (line.includes('|') && i + 1 < lines.length && /^\|?[\s\-|]+\|?$/.test(lines[i + 1])) {
      const headers = line.split('|').map(c => c.trim()).filter(c => c);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(lines[i].split('|').map(c => c.trim()).filter(c => c));
        i++;
      }
      elements.push(
        <div key={`table-${i}`} className="my-2 rounded-lg border border-brain-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-brain-surface">
              <tr>
                {headers.map((h, j) => (
                  <th key={j} className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-[#888] border-b border-brain-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-brain-border">
              {rows.map((row, j) => (
                <tr key={j} className="hover:bg-brain-surface/50 transition-colors">
                  {row.map((cell, k) => (
                    <td key={k} className="px-3 py-2 text-[11px] text-gray-700">{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-1 ml-4 space-y-0.5 list-disc">
          {items.map((item, j) => <li key={j} className="text-[12px]">{renderInline(item)}</li>)}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-1 ml-4 space-y-0.5 list-decimal">
          {items.map((item, j) => <li key={j} className="text-[12px]">{renderInline(item)}</li>)}
        </ol>
      );
      continue;
    }

    // Empty line — skip
    if (!line.trim()) { i++; continue; }

    // Regular paragraph
    elements.push(<p key={`p-${i}`} className="my-1">{renderInline(line)}</p>);
    i++;
  }

  return <>{elements}</>;
}

interface ProdPreviewItem {
  nombre?: string; marca?: string; part_number?: string;
  precio_costo?: string | number; moneda?: string; imagen_url?: string;
  descripcion?: string; caracteristicas?: string[]; url_origen?: string;
}

// Widget bulk de productos extraídos de varios links: cada fila tiene su propio botón Publicar
// (secuencial). Al publicar, se manda un mensaje al chat para que el backend publique ESE producto.
function ProductosPreviewWidget({ productos, onSendMessage }: { productos: ProdPreviewItem[]; onSendMessage?: (text: string) => void }) {
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const keyOf = (p: ProdPreviewItem, idx: number) => p.part_number || p.nombre || String(idx);
  const allSent = productos.every((p, idx) => sent.has(keyOf(p, idx)));
  const publicarUno = (p: ProdPreviewItem, key: string) => {
    setSent((s) => new Set(s).add(key));
    onSendMessage?.(`Publica en 1CRM SOLO el producto "${p.part_number || p.nombre}" (${p.nombre || ''}). Usa los datos que ya extrajiste en el preview; NO vuelvas a extraer ni pidas confirmación.`);
  };
  const publicarTodos = () => {
    setSent(new Set(productos.map(keyOf)));
    onSendMessage?.('Publica en 1CRM TODOS los productos del preview de una sola vez (usa publicar_productos_desde_links con el arreglo completo; NO vuelvas a extraer ni pidas confirmación).');
  };
  return (
    <div className="rounded-xl overflow-hidden border border-[#2c2c2e] bg-[#1c1c1e]">
      <div className="px-4 py-2.5 bg-[#161618] border-b border-[#2c2c2e] flex items-center gap-2">
        <span className="text-[13px]">📦</span>
        <span className="text-[12px] font-semibold text-white">{productos.length} productos extraídos</span>
        {!allSent && (
          <button
            onClick={publicarTodos}
            className="flex items-center gap-1 text-[11px] text-[#4ade80] hover:text-[#86efac] transition-colors ml-auto"
          >
            <Send className="w-3 h-3" /> Publicar todos ({productos.length})
          </button>
        )}
      </div>
      {productos.map((p, idx) => {
        const key = keyOf(p, idx);
        const isSent = sent.has(key);
        const isExp = expanded === key;
        return (
          <div key={key} className="border-b border-[#2c2c2e] last:border-0">
            <div className="flex gap-3 px-4 py-3 items-center">
              <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-white/5 border border-[#3a3a3a] flex items-center justify-center overflow-hidden">
                {p.imagen_url
                  ? <img src={p.imagen_url} alt={p.nombre || ''} className="w-full h-full object-contain p-1" />
                  : <PackageCheck className="w-6 h-6 text-[#3a3a3a]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate">{p.nombre || p.part_number}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  Parte <span className="font-mono text-gray-300">{p.part_number || '—'}</span>
                  {p.marca ? <> · <span className="text-gray-300">{p.marca}</span></> : null}
                </p>
                {p.precio_costo
                  ? <p className="text-[11px] text-gray-500">Costo <span className="text-gray-300">{p.precio_costo} {p.moneda || ''}</span></p>
                  : <p className="text-[11px] text-gray-600">Sin precio — lo defines en el CRM</p>}
              </div>
              {isSent
                ? <span className="text-[11px] text-[#555] whitespace-nowrap flex items-center gap-1"><Check className="w-3 h-3" /> Enviado</span>
                : (
                  <button
                    onClick={() => publicarUno(p, key)}
                    className="flex items-center gap-1 text-[11px] text-[#4ade80] hover:text-[#86efac] transition-colors whitespace-nowrap"
                  >
                    <Send className="w-3 h-3" /> Publicar
                  </button>
                )}
            </div>
            {(p.descripcion || (p.caracteristicas && p.caracteristicas.length > 0)) && (
              <div className="px-4 pb-2 -mt-1">
                <button onClick={() => setExpanded(isExp ? null : key)} className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
                  {isExp ? '▾ ocultar detalle' : '▸ ver detalle'}
                </button>
                {isExp && (
                  <div className="mt-2 space-y-2">
                    {p.descripcion && <p className="text-[11px] text-gray-400 leading-relaxed">{p.descripcion}</p>}
                    {p.caracteristicas && p.caracteristicas.length > 0 && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {p.caracteristicas.map((c, i) => {
                          const ci = c.indexOf(':');
                          const label = ci > -1 ? c.slice(0, ci) : c;
                          const val = ci > -1 ? c.slice(ci + 1).trim() : '';
                          return (
                            <div key={i} className="text-[10px] leading-snug">
                              <span className="text-gray-500">{label}</span>{val && <span className="text-gray-300"> {val}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MessageBubble({ message, onSendMessage }: { message: Message; onSendMessage?: (text: string) => void }) {
  const contenido = message.contenido as { text?: string };
  const isUser = message.rol === 'user';
  const [decided, setDecided] = useState<string | null>(null);

  if (isUser) {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="max-w-[60%] px-4 py-2.5 rounded-xl bg-[#4A3F8F] text-white text-[12px] leading-relaxed rounded-br-sm">
          {contenido.text || ''}
        </div>
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brain-border flex items-center justify-center">
          <span className="text-[12px] font-medium text-[#555]">A</span>
        </div>
      </div>
    );
  }

  const rawText = contenido.text || '';
  const decisionMatch = rawText.match(/\[DECISION:\s*(.+?)\]/s);
  const productoMatch = rawText.match(/\[PRODUCTO_PREVIEW\]\s*(\{[\s\S]*?\})/);
  let productoPreview: {
    nombre?: string; marca?: string; part_number?: string;
    precio_costo?: string | number; moneda?: string; imagen_url?: string;
    descripcion?: string; caracteristicas?: string[];
  } | null = null;
  if (productoMatch) { try { productoPreview = JSON.parse(productoMatch[1]); } catch { productoPreview = null; } }
  const productosRes = extractMarkerJson(rawText, '[PRODUCTOS_PREVIEW]');
  const productosPreview: ProdPreviewItem[] | null =
    (productosRes?.json && Array.isArray((productosRes.json as { productos?: ProdPreviewItem[] }).productos))
      ? (productosRes.json as { productos: ProdPreviewItem[] }).productos
      : null;
  const oportRes = extractMarkerJson(rawText, '[OPORTUNIDADES]');
  const oportunidadesData: OportunidadesData | null = oportRes?.json || null;
  const oportCreadaRes = extractMarkerJson(rawText, '[OPORTUNIDAD_CREADA]');
  const oportCreadaData: OportunidadCreadaData | null = oportCreadaRes?.json || null;
  let displayText = rawText
    .replace(/\[DECISION:\s*.+?\]/s, '')
    .replace(/\[PRODUCTO_PREVIEW\]\s*\{[\s\S]*?\}/, '')
    .trimEnd();
  if (oportRes) displayText = displayText.replace(oportRes.raw, '').trimEnd();
  if (oportCreadaRes) displayText = displayText.replace(oportCreadaRes.raw, '').trimEnd();
  if (productosRes) displayText = displayText.replace(productosRes.raw, '').trimEnd();

  function handleDecisionClick(answer: string) {
    setDecided(answer);
    onSendMessage?.(answer);
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brain-accent flex items-center justify-center">
        <span className="text-white text-[11px] font-bold">&#x2B21;</span>
      </div>
      <div className="max-w-[80%] space-y-2">
        {oportunidadesData && <OportunidadesWidget data={oportunidadesData} />}
        {oportCreadaData && <OportunidadCreadaWidget data={oportCreadaData} />}
        {productoPreview && (
          <div className="bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#2c2c2e] flex items-center gap-2">
              <span className="text-[13px]">📦</span>
              <span className="text-[12px] font-semibold text-white">Producto extraído del link</span>
            </div>
            <div className="p-4 flex gap-4 items-center">
              {productoPreview.imagen_url && (
                <div className="flex-shrink-0 w-24 h-24 rounded-lg bg-white p-1.5 flex items-center justify-center">
                  <img src={productoPreview.imagen_url} alt={productoPreview.nombre || ''} className="max-w-full max-h-full object-contain" />
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <p className="text-[14px] font-semibold text-white leading-snug">{productoPreview.nombre}</p>
                {productoPreview.part_number && (
                  <p className="text-[12px] text-gray-500">Parte <span className="text-gray-200 font-mono">{productoPreview.part_number}</span></p>
                )}
                {productoPreview.marca && (
                  <p className="text-[12px] text-gray-500">Marca <span className="text-gray-200">{productoPreview.marca}</span></p>
                )}
                {productoPreview.precio_costo ? (
                  <p className="text-[12px] text-gray-500">Costo proveedor <span className="text-gray-200">{productoPreview.precio_costo} {productoPreview.moneda || ''}</span> <span className="text-gray-600">(interno)</span></p>
                ) : null}
              </div>
            </div>
            {productoPreview.descripcion && (
              <div className="px-4 pb-3 -mt-1">
                <p className="text-[12px] text-gray-400 leading-relaxed">{productoPreview.descripcion}</p>
              </div>
            )}
            {productoPreview.caracteristicas && productoPreview.caracteristicas.length > 0 && (
              <div className="px-4 pb-4 border-t border-[#2c2c2e] pt-3">
                <p className="text-[11px] font-semibold text-gray-300 mb-2">Ficha técnica</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {productoPreview.caracteristicas.map((c, i) => {
                    const idx = c.indexOf(':');
                    const label = idx > -1 ? c.slice(0, idx) : c;
                    const val = idx > -1 ? c.slice(idx + 1).trim() : '';
                    return (
                      <div key={i} className="text-[11px] leading-snug">
                        <span className="text-gray-500">{label}</span>{val && <span className="text-gray-300"> {val}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        {productosPreview && productosPreview.length > 0 && (
          <ProductosPreviewWidget productos={productosPreview} onSendMessage={onSendMessage} />
        )}
        {displayText && (
          <div className="px-4 py-2.5 rounded-xl bg-white border border-brain-border text-gray-700 text-[12px] leading-relaxed rounded-bl-sm">
            <SimpleMarkdown text={displayText} />
          </div>
        )}
        {decisionMatch && (
          <div className="bg-[#FFFBEA] border border-[#F0D88A] rounded-xl px-4 py-3">
            <p className="text-[11px] font-semibold text-[#7A5000] mb-2.5">⚡ {decisionMatch[1].trim()}</p>
            {decided ? (
              <span className={`text-[11px] font-semibold ${decided === 'Sí' ? 'text-emerald-600' : 'text-red-500'}`}>
                {decided === 'Sí' ? '✓ Aprobado' : '✗ Rechazado'}
              </span>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => handleDecisionClick('Sí')}
                  className="px-4 py-1.5 text-[11px] font-semibold text-emerald-700 border border-emerald-300 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  ✓ Sí
                </button>
                <button
                  onClick={() => handleDecisionClick('No')}
                  className="px-4 py-1.5 text-[11px] font-semibold text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  ✗ No
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RFQWidget({ message, onPublicar }: { message: Message; onPublicar: (rfqId: string, proveedorRank: number) => void }) {
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const contenido = message.contenido as {
    rfq_id?: string;
    producto?: string;
    cantidad?: number;
    en_crm?: string;
    fx?: string;
    estado?: string;
    proveedores?: { rank: number; nombre: string; precio: string; disponibilidad: string; score: string }[];
  };

  const proveedores = contenido.proveedores || [];
  const selected = proveedores.find((p) => p.rank === selectedRank);

  if (confirmed && selected) {
    return (
      <div className="bg-white border border-emerald-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2 bg-emerald-50 border-b border-emerald-200">
          <span className="text-[14px]">&#x2713;</span>
          <span className="text-[13px] font-semibold text-emerald-700">
            Producto publicado en CRM &mdash; {contenido.rfq_id || ''}
          </span>
        </div>
        <div className="px-4 py-4 space-y-2">
          <InfoRow label="Producto" value={contenido.producto || ''} />
          <InfoRow label="Proveedor" value={selected.nombre} />
          <InfoRow label="Precio" value={selected.precio} />
          <InfoRow label="Disponibilidad" value={selected.disponibilidad} valueColor="text-brain-success" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-brain-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-brain-border">
        <div className="flex items-center gap-2">
          <span className="text-[14px]">&#x1F4CA;</span>
          <span className="text-[13px] font-semibold text-[#1E3A5F]">
            Resultado b&uacute;squeda &mdash; {contenido.rfq_id || ''}
          </span>
        </div>
        {proveedores.length > 0 && (
          <span className="text-[10px] font-semibold text-brain-success border border-brain-success/30 px-2.5 py-1 rounded-full">
            {selectedRank ? 'Seleccionado' : 'Selecciona proveedor'}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        {/* Info rows */}
        <div className="space-y-2 mb-5">
          <InfoRow label="Producto" value={contenido.producto || ''} />
          {contenido.cantidad != null && (
            <InfoRow label="Cantidad" value={String(contenido.cantidad)} />
          )}
          <InfoRow label="En 1CRM" value={contenido.en_crm || 'No existe — requiere publicación'} valueColor={contenido.en_crm?.startsWith('Encontrado') ? 'text-brain-success' : 'text-brain-error'} />
          {contenido.fx && (
            <InfoRow label="FX USD/MXN" value={contenido.fx} />
          )}
          {contenido.estado && (
            <InfoRow label="Estado" value={contenido.estado} />
          )}
        </div>

        {/* Suppliers table or empty state */}
        {proveedores.length > 0 ? (
          <div>
            {/* Table header */}
            <div className="flex items-center py-2 border-b border-brain-border text-[10px] text-[#888] font-medium uppercase">
              <span className="w-6">#</span>
              <span className="flex-1">Proveedor</span>
              <span className="w-16 text-right">Precio</span>
              <span className="w-20 text-right">Disp.</span>
              <span className="w-14 text-right">Score</span>
            </div>
            {/* Clickable rows */}
            {proveedores.map((p) => {
              const isSelected = selectedRank === p.rank;
              return (
                <div
                  key={p.rank}
                  onClick={() => setSelectedRank(isSelected ? null : p.rank)}
                  className={`flex items-center py-2.5 px-1 -mx-1 rounded-lg cursor-pointer transition-all duration-150 border ${
                    isSelected
                      ? 'bg-[#3B82F6]/8 border-[#3B82F6]/30 shadow-sm'
                      : 'border-transparent hover:bg-brain-surface hover:border-brain-border'
                  }`}
                >
                  <span className={`w-6 text-[12px] font-bold ${isSelected ? 'text-[#3B82F6]' : 'text-brain-accent'}`}>{p.rank}</span>
                  <span className={`flex-1 text-[12px] ${isSelected ? 'text-[#3B82F6] font-semibold' : 'text-gray-800'}`}>{p.nombre}</span>
                  <span className="w-16 text-right text-[12px] font-semibold text-gray-900">{p.precio}</span>
                  <span className="w-20 text-right text-[11px] text-brain-success">{p.disponibilidad}</span>
                  <span className="w-14 text-right text-[11px] text-[#888]">{p.score}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-5 flex items-center justify-center border border-dashed border-brain-border rounded-lg">
            <span className="text-[12px] text-[#999]">Sin opciones de proveedores disponibles</span>
          </div>
        )}

        {/* Selection confirmation */}
        {selected && (
          <div className="mt-4 px-3 py-2.5 bg-[#3B82F6]/5 border border-[#3B82F6]/20 rounded-lg flex items-center justify-between animate-fade-in">
            <span className="text-[11px] text-gray-700">
              Publicar <span className="font-semibold text-[#3B82F6]">{contenido.producto || ''}</span> v&iacute;a {selected.nombre} a {selected.precio}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedRank(null)}
                className="text-[10px] text-[#888] hover:text-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (contenido.rfq_id && selectedRank != null) {
                    onPublicar(contenido.rfq_id, selectedRank);
                  }
                  setConfirmed(true);
                }}
                className="px-3 py-1 text-[10px] font-semibold text-white bg-[#3B82F6] rounded-md hover:bg-[#2563EB] transition-colors"
              >
                Publicar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-[#888]">{label}</span>
      <span className={`text-[12px] font-medium ${valueColor || 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

function DecisionWidget({ message, onDecision }: { message: Message; onDecision: (messageId: string, approved: boolean) => void }) {
  const contenido = message.contenido as { text?: string; resolved?: boolean; approved?: boolean };

  if (contenido.resolved) {
    return (
      <div className={`rounded-xl overflow-hidden border ${contenido.approved ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
        <div className={`px-4 py-3 flex items-center gap-2`}>
          <span className="text-[14px]">{contenido.approved ? '\u2713' : '\u2717'}</span>
          <span className={`text-[13px] font-semibold ${contenido.approved ? 'text-emerald-700' : 'text-red-700'}`}>
            {contenido.approved ? 'Aprobado' : 'Rechazado'}
          </span>
          <span className="text-[11px] text-gray-500 ml-2">{contenido.text}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-brain-border rounded-xl overflow-hidden">
      <div className="bg-brain-warning-bg px-4 py-2.5 border-b border-[#F0D88A]">
        <div className="flex items-center gap-2">
          <span className="text-[14px]">&#x26A1;</span>
          <span className="text-[13px] font-semibold text-[#7A5000]">Decisi&oacute;n requerida &mdash; Agente esperando</span>
        </div>
      </div>
      <div className="px-4 py-4 flex items-center gap-4">
        <span className="text-[12px] text-gray-700 flex-1">
          {contenido.text || ''}
        </span>
        <button
          onClick={() => onDecision(message.id, true)}
          className="px-4 py-1.5 text-[11px] font-semibold text-brain-success border border-brain-success/40 bg-brain-success-bg rounded-lg hover:opacity-80 transition-opacity whitespace-nowrap"
        >
          &#x2713; S&iacute;
        </button>
        <button
          onClick={() => onDecision(message.id, false)}
          className="px-4 py-1.5 text-[11px] font-semibold text-brain-error border border-brain-error/40 bg-brain-error-bg rounded-lg hover:opacity-80 transition-opacity whitespace-nowrap"
        >
          &#x2717; No
        </button>
      </div>
    </div>
  );
}

function ParseConfirmWidget({ message, onConfirm }: { message: Message; onConfirm: (messageId: string, confirmed: boolean, data: { marca: string; modelo: string; qty: number; urgente: boolean; imageUrl?: string }) => void }) {
  const contenido = message.contenido as {
    marca?: string;
    modelo?: string;
    qty?: number;
    urgente?: boolean;
    source?: string;
    imageUrl?: string;
    resolved?: boolean;
    confirmed?: boolean;
  };

  const [editMarca, setEditMarca] = useState(contenido.marca || '');
  const [editModelo, setEditModelo] = useState(contenido.modelo || '');
  const [editQty, setEditQty] = useState(String(contenido.qty || 1));

  if (contenido.resolved) {
    return (
      <div className="rounded-xl border border-brain-border bg-brain-surface p-3 max-w-sm">
        <p className="text-xs text-gray-500 text-center">
          {contenido.confirmed ? 'Busqueda iniciada' : 'Busqueda cancelada'} &#x2713;
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-brain-border bg-brain-surface p-4 space-y-3 max-w-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-brain-text">
        <Search className="w-4 h-4" />
        <span>{contenido.source === 'image' ? 'Datos extraidos de imagen' : 'Busqueda detectada'}</span>
      </div>

      {contenido.imageUrl && (
        <div className="rounded-lg overflow-hidden border border-brain-border bg-white">
          <img src={contenido.imageUrl} alt="Referencia" className="w-full h-32 object-contain p-1" />
        </div>
      )}

      <div className="space-y-2">
        <div>
          <label className="text-[10px] font-medium text-gray-500 uppercase">Marca</label>
          <input
            type="text"
            value={editMarca}
            onChange={(e) => setEditMarca(e.target.value)}
            className="w-full mt-0.5 px-2.5 py-1.5 text-sm border border-brain-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-brain-accent"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-500 uppercase">Modelo / No. Parte</label>
          <input
            type="text"
            value={editModelo}
            onChange={(e) => setEditModelo(e.target.value)}
            className="w-full mt-0.5 px-2.5 py-1.5 text-sm border border-brain-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-brain-accent"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-500 uppercase">Cantidad</label>
          <input
            type="number"
            min="1"
            value={editQty}
            onChange={(e) => setEditQty(e.target.value)}
            className="w-20 mt-0.5 px-2.5 py-1.5 text-sm border border-brain-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-brain-accent"
          />
        </div>
      </div>

      {contenido.urgente && (
        <span className="inline-block text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          URGENTE
        </span>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(message.id, true, { marca: editMarca.trim() || '(detectar)', modelo: editModelo.trim(), qty: parseInt(editQty) || 1, urgente: contenido.urgente || false, imageUrl: contenido.imageUrl })}
          disabled={!editModelo.trim()}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-sm font-medium hover:bg-sky-100 disabled:opacity-50 transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          Buscar
        </button>
        <button
          onClick={() => onConfirm(message.id, false, { marca: '', modelo: '', qty: 1, urgente: false })}
          className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-100 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function ImagenListaWidget({ message, onDecision }: { message: Message; onDecision: (rfqId: string, approved: boolean) => Promise<void> }) {
  const contenido = message.contenido as {
    rfq_id?: string;
    producto?: string;
    foto_url?: string;
    proveedor_top?: string;
    precio_top?: string;
    disponibilidad_top?: string;
  };

  const [resolved, setResolved] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = async (aprobado: boolean) => {
    if (!contenido.rfq_id) return;
    setLoading(true);
    await onDecision(contenido.rfq_id, aprobado);
    setResolved(true);
    setLoading(false);
  };

  return (
    <div className="rounded-xl border border-brain-border bg-white overflow-hidden max-w-md">
      {/* Header */}
      <div className="px-4 py-3 border-b border-brain-border bg-brain-surface flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-brain-accent" />
        <span className="text-[13px] font-semibold text-gray-800">Imagen procesada &mdash; Aprobacion requerida</span>
      </div>

      {/* Image */}
      {contenido.foto_url && (
        <div className="px-4 pt-4">
          <div className="rounded-lg overflow-hidden border border-brain-border bg-[#FAFAFA] flex items-center justify-center p-3">
            <img
              src={contenido.foto_url}
              alt={contenido.producto}
              className="max-w-full max-h-64 object-contain rounded"
            />
          </div>
        </div>
      )}

      {/* Product info */}
      <div className="px-4 py-4 space-y-2">
        {contenido.producto && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#888]">Producto</span>
            <span className="text-[12px] font-semibold text-gray-900">{contenido.producto}</span>
          </div>
        )}
        {contenido.proveedor_top && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#888]">Mejor proveedor</span>
            <span className="text-[12px] font-medium text-gray-900">{contenido.proveedor_top}</span>
          </div>
        )}
        {contenido.precio_top && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#888]">Precio</span>
            <span className="text-[12px] font-semibold text-gray-900">{contenido.precio_top}</span>
          </div>
        )}
        {contenido.disponibilidad_top && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#888]">Disponibilidad</span>
            <span className="text-[12px] font-medium text-brain-success">{contenido.disponibilidad_top}</span>
          </div>
        )}
        <p className="text-[11px] text-[#888] pt-1">Imagen optimizada por IA (500x500, fondo blanco)</p>
      </div>

      {/* Actions */}
      {!resolved ? (
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={() => handleClick(true)}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] font-semibold hover:bg-emerald-100 disabled:opacity-50 transition-colors"
          >
            <PackageCheck className="w-3.5 h-3.5" />
            Publicar en 1CRM
          </button>
          <button
            onClick={() => handleClick(false)}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Rechazar foto
          </button>
        </div>
      ) : (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-500 text-center py-2 bg-brain-surface rounded-lg">Decision registrada &#x2713;</p>
        </div>
      )}
    </div>
  );
}

function ImagenFallidaWidget({ message, onRetry, onManualUpload }: { message: Message; onRetry: (rfqId: string) => Promise<void>; onManualUpload: (rfqId: string, file: File) => Promise<void> }) {
  const contenido = message.contenido as { rfq_id?: string; resolved?: boolean };
  const [resolved, setResolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (resolved || contenido.resolved) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500 text-center">Accion tomada &#x2713;</p>
      </div>
    );
  }

  const handleRetry = async () => {
    if (!contenido.rfq_id) return;
    setLoading(true);
    await onRetry(contenido.rfq_id);
    setResolved(true);
    setLoading(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !contenido.rfq_id) return;
    setLoading(true);
    await onManualUpload(contenido.rfq_id, file);
    setResolved(true);
    setLoading(false);
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3 max-w-sm">
      <div className="flex items-center gap-2">
        <span className="text-base">&#x26A0;</span>
        <span className="text-sm font-semibold text-amber-800">No se encontro imagen automaticamente</span>
      </div>
      <p className="text-xs text-amber-700">
        El agente no pudo obtener una foto valida. Puedes subir una foto manualmente o reintentar.
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleRetry}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-sm font-medium hover:bg-sky-100 disabled:opacity-50 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reintentar imagen
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          Subir foto manual
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

function RFQStatusWidget({ message }: { message: Message }) {
  const contenido = message.contenido as {
    rfq_id?: string;
    estado?: string;
    producto?: string;
    crm_producto_id?: string | null;
  };

  if (contenido.estado === 'procesando_imagen') {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 max-w-sm">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="text-sm font-medium text-sky-800">Procesando imagen con IA...</p>
            <p className="text-xs text-sky-600 mt-0.5">Claude esta buscando y optimizando la foto del producto.</p>
          </div>
        </div>
      </div>
    );
  }

  if (contenido.estado === 'publicando') {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 max-w-sm">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="text-sm font-medium text-sky-800">Publicando en 1CRM...</p>
            <p className="text-xs text-sky-600 mt-0.5">Creando producto en el catalogo del sitio propio.</p>
          </div>
        </div>
      </div>
    );
  }

  if (contenido.estado === 'publicado') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 max-w-sm">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-800">Publicado en 1CRM</p>
            {contenido.producto && (
              <p className="text-xs text-emerald-600 mt-0.5">{contenido.producto}</p>
            )}
            {contenido.crm_producto_id && (
              <p className="text-xs text-emerald-600 mt-0.5">ID: {contenido.crm_producto_id}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function RFQLogBubble({ message }: { message: Message }) {
  const contenido = message.contenido as { text?: string; rfqId?: string; status?: string };
  const isUser = message.rol === 'user';

  const statusConfig: Record<string, { icon: typeof Search; color: string; bg: string; border: string; pulse: boolean }> = {
    created: { icon: PackageCheck, color: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-200', pulse: false },
    searching: { icon: Search, color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200', pulse: true },
    querying: { icon: Radio, color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200', pulse: true },
    crm: { icon: UserCheck, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', pulse: false },
  };

  const config = statusConfig[contenido.status || 'created'] || statusConfig.created;
  const Icon = config.icon;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex items-start gap-2.5 max-w-[80%] px-3.5 py-2.5 rounded-xl ${config.bg} border ${config.border} ${config.pulse ? 'animate-pulse-subtle' : ''}`}>
        <div className={`flex-shrink-0 w-6 h-6 rounded-md ${config.bg} flex items-center justify-center mt-0.5`}>
          <Icon className={`w-3.5 h-3.5 ${config.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          {contenido.rfqId && (
            <span className={`text-[10px] font-semibold ${config.color} uppercase tracking-wide`}>
              {contenido.rfqId}
            </span>
          )}
          <p className={`text-[12px] ${config.color} leading-relaxed mt-0.5`}>
            {contenido.text || ''}
          </p>
        </div>
      </div>
    </div>
  );
}

function DocsProductsWidget({ message, onConfirm }: { message: Message; onConfirm: (messageId: string, products: { marca: string; modelo: string; qty: number }[]) => void }) {
  const contenido = message.contenido as {
    products?: { marca: string; modelo: string; qty: number }[];
    source?: string;
    imageUrl?: string;
    resolved?: boolean;
    count?: number;
  };

  const [selected, setSelected] = useState<Set<number>>(() => new Set<number>());
  const [products, setProducts] = useState(contenido.products || []);

  if (contenido.resolved) {
    return (
      <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2.5 max-w-md">
        <p className="text-[11px] text-[#555]">
          {contenido.count ? `${contenido.count} producto(s) enviados a búsqueda ✓` : 'Sin productos seleccionados'}
        </p>
      </div>
    );
  }

  function toggleSelect(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((_, i) => i)));
    }
  }

  function updateProduct(i: number, field: 'marca' | 'modelo' | 'qty', value: string) {
    setProducts((prev) => prev.map((p, idx) => idx === i ? { ...p, [field]: field === 'qty' ? (parseInt(value) || 1) : value } : p));
  }

  function handleConfirm() {
    const selectedProducts = products.filter((_, i) => selected.has(i));
    onConfirm(message.id, selectedProducts);
  }

  return (
    <div className="rounded-xl border border-[#333] bg-[#1e1e1e] overflow-hidden font-sans text-[12px] max-w-lg">
      {contenido.imageUrl && (
        <div className="overflow-hidden border-b border-[#2a2a2a]">
          <img src={contenido.imageUrl} alt="Fuente" className="w-full max-h-32 object-cover object-top opacity-80" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#252525] border-b border-[#2e2e2e]">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-[#555]" />
          <span className="text-[#ccc] font-sans font-semibold text-[12px]">Productos extraídos</span>
        </div>
        <span className="text-[10px] text-[#555]">{contenido.source}</span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[16px_1fr_120px_40px] gap-2 px-3 py-1.5 border-b border-[#2a2a2a] bg-[#222]">
        <button onClick={toggleAll} className="w-3.5 h-3.5 rounded border border-[#444] flex items-center justify-center hover:border-[#666] transition-colors mt-0.5">
          {selected.size === products.length && selected.size > 0 && <Check className="w-2.5 h-2.5 text-[#60a5fa]" />}
        </button>
        <span className="text-[10px] text-[#555] uppercase tracking-wider">Marca</span>
        <span className="text-[10px] text-[#555] uppercase tracking-wider">Modelo / Parte</span>
        <span className="text-[10px] text-[#555] uppercase tracking-wider text-right">Qty</span>
      </div>

      {/* Rows */}
      <div className="max-h-48 overflow-y-auto divide-y divide-[#252525]">
        {products.map((p, i) => (
          <div
            key={i}
            className={`grid grid-cols-[16px_1fr_120px_40px] gap-2 px-3 py-1.5 transition-colors ${
              selected.has(i) ? 'bg-[#1e1e1e]' : 'bg-[#1a1a1a] opacity-50'
            }`}
          >
            <button
              onClick={() => toggleSelect(i)}
              className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                selected.has(i) ? 'border-[#60a5fa] bg-[#60a5fa]' : 'border-[#444]'
              }`}
            >
              {selected.has(i) && <Check className="w-2.5 h-2.5 text-[#0a0a0a]" />}
            </button>
            <input
              value={p.marca}
              onChange={(e) => updateProduct(i, 'marca', e.target.value)}
              className="text-[11px] text-[#d4d4d4] bg-transparent border-b border-transparent hover:border-[#333] focus:border-[#60a5fa] focus:outline-none px-0.5 py-0 font-sans min-w-0"
            />
            <input
              value={p.modelo}
              onChange={(e) => updateProduct(i, 'modelo', e.target.value)}
              className="text-[11px] text-[#d4d4d4] bg-transparent border-b border-transparent hover:border-[#333] focus:border-[#60a5fa] focus:outline-none px-0.5 py-0 font-mono"
            />
            <input
              value={String(p.qty)}
              onChange={(e) => updateProduct(i, 'qty', e.target.value)}
              type="number"
              min="1"
              className="text-[11px] text-[#d4d4d4] text-right bg-transparent border-b border-transparent hover:border-[#333] focus:border-[#60a5fa] focus:outline-none px-0.5 py-0"
            />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#2a2a2a] bg-[#1a1a1a]">
        <span className="text-[11px] text-[#555] font-sans">{selected.size} de {products.length} seleccionados</span>
        <div className="flex items-center gap-4">
          <button
            onClick={() => onConfirm(message.id, [])}
            className="text-[11px] text-[#555] hover:text-[#888] font-sans transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="flex items-center gap-1 text-[11px] text-[#60a5fa] hover:text-[#93c5fd] disabled:opacity-30 font-sans transition-colors"
          >
            <Search className="w-3 h-3" />
            Buscar{selected.size > 1 ? ` (${selected.size})` : ''} →
          </button>
        </div>
      </div>
    </div>
  );
}

