import { useState, useRef } from 'react';
import { X, Upload, FileText, Image as ImageIcon, Music, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface RFQChatModuleProps {
  streamId: string;
  onSubmitted: (rfqId: string, uuid: string, summary: { marca: string; modelo: string; qty: number; attachmentCount: number }) => void;
  onClose: () => void;
}

interface AttachedFile {
  file: File;
  preview: string;
}

const FILE_ACCEPT = '.doc,.docx,.xls,.xlsx,.pdf,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.ogg';

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return ImageIcon;
  if (type.startsWith('audio/')) return Music;
  return FileText;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RFQChatModule({ streamId, onSubmitted, onClose }: RFQChatModuleProps) {
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [qty, setQty] = useState('1');
  const [urgente, setUrgente] = useState(false);
  const [showContacto, setShowContacto] = useState(false);
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoEmail, setContactoEmail] = useState('');
  const [contactoEmpresa, setContactoEmpresa] = useState('');
  const [contactoPhone, setContactoPhone] = useState('');
  const [contactoDireccion, setContactoDireccion] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList) return;
    const newFiles: AttachedFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      newFiles.push({
        file: f,
        preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : '',
      });
    }
    setFiles((prev) => [...prev, ...newFiles]);
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const removed = prev[index];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit() {
    const trimMarca = marca.trim();
    const trimModelo = modelo.trim();
    const hasFields = trimMarca && trimModelo;
    const hasFiles = files.length > 0;

    if (!hasFields && !hasFiles) return;

    setSubmitting(true);

    try {
      const uploadedAttachments: { name: string; type: string; size: number; storage_path: string; url: string }[] = [];

      for (const af of files) {
        const path = `${streamId}/${Date.now()}-${af.file.name}`;
        const { data, error } = await supabase.storage
          .from('rfq-files')
          .upload(path, af.file);

        let url = '';
        if (!error && data) {
          const { data: urlData } = supabase.storage
            .from('rfq-files')
            .getPublicUrl(data.path);
          url = urlData.publicUrl;
        }

        uploadedAttachments.push({
          name: af.file.name,
          type: af.file.type,
          size: af.file.size,
          storage_path: data?.path || path,
          url,
        });
      }

      const now = new Date();
      const rfqId = `RFQ-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;

      const { data: streamExists } = await supabase
        .from('streams')
        .select('id')
        .eq('id', streamId)
        .maybeSingle();

      const { data: rfqData, error: insertError } = await supabase.from('rfqs').insert({
        stream_id: streamExists ? streamId : null,
        rfq_id: rfqId,
        marca: trimMarca || '(archivo adjunto)',
        modelo: trimModelo || '(archivo adjunto)',
        qty: parseInt(qty) || 1,
        urgente,
        contacto_nombre: contactoNombre || null,
        contacto_email: contactoEmail || null,
        contacto_empresa: contactoEmpresa || null,
        contacto_phone: contactoPhone || null,
        contacto_direccion: contactoDireccion || null,
        attachments: uploadedAttachments,
      }).select('id').single();

      console.log('[RFQ] Insert rfqs result:', { rfqId, id: rfqData?.id, error: insertError });
      if (insertError) throw insertError;
      if (!rfqData?.id) throw new Error('No se pudo obtener UUID del RFQ');

      const { error: jobError } = await supabase.from('jobs').insert({
        rfq_id: rfqData.id,
        agente: 'buscador',
        estado: 'pendiente',
      });
      console.log('[RFQ] Job insert:', { rfqUuid: rfqData.id, error: jobError });
      if (jobError) console.error('[RFQ] Job insert failed:', jobError);

      files.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });

      onSubmitted(rfqId, rfqData?.id || '', {
        marca: trimMarca || '(archivo adjunto)',
        modelo: trimModelo || '(archivo adjunto)',
        qty: parseInt(qty) || 1,
        attachmentCount: uploadedAttachments.length,
      });
    } catch (err) {
      console.error('RFQ submit error:', err);
      setSubmitting(false);
    }
  }

  const canSubmit = (marca.trim() && modelo.trim()) || files.length > 0;

  return (
    <div className="flex-shrink-0 pb-5 pt-2 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border border-brain-border rounded-2xl shadow-sm overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-brain-border">
            <h3 className="text-[13px] font-semibold text-gray-800">Nuevo RFQ</h3>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-md text-[#888] hover:text-gray-600 hover:bg-brain-surface transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Fields */}
          <div className="px-4 py-3 space-y-3">
            {/* Main fields row */}
            <div className="flex gap-2">
              <input
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                placeholder="Marca"
                className="flex-1 bg-brain-surface border border-brain-border rounded-lg px-3 py-2 text-[12px] text-gray-800 placeholder-[#999] focus:outline-none focus:border-brain-accent/50 transition-colors"
              />
              <input
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder="Modelo / Part Number"
                className="flex-[2] bg-brain-surface border border-brain-border rounded-lg px-3 py-2 text-[12px] text-gray-800 placeholder-[#999] focus:outline-none focus:border-brain-accent/50 transition-colors"
              />
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                type="number"
                min="1"
                placeholder="Qty"
                className="w-16 bg-brain-surface border border-brain-border rounded-lg px-3 py-2 text-[12px] text-gray-800 placeholder-[#999] focus:outline-none focus:border-brain-accent/50 transition-colors"
              />
            </div>

            {/* Urgente toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUrgente(!urgente)}
                className={`relative w-8 h-[18px] rounded-full transition-colors ${urgente ? 'bg-brain-warning' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform shadow-sm ${urgente ? 'translate-x-[14px]' : ''}`} />
              </button>
              <span className={`text-[11px] ${urgente ? 'text-brain-warning font-medium' : 'text-[#888]'}`}>Urgente</span>
            </div>

            {/* Contacto toggle */}
            <button
              onClick={() => setShowContacto(!showContacto)}
              className="flex items-center gap-1 text-[11px] text-brain-accent hover:text-brain-accent-hover transition-colors"
            >
              {showContacto ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showContacto ? 'Ocultar contacto' : 'Agregar contacto'}
            </button>

            {/* Contacto fields */}
            {showContacto && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={contactoNombre}
                  onChange={(e) => setContactoNombre(e.target.value)}
                  placeholder="Nombre"
                  className="bg-brain-surface border border-brain-border rounded-lg px-3 py-2 text-[12px] text-gray-800 placeholder-[#999] focus:outline-none focus:border-brain-accent/50 transition-colors"
                />
                <input
                  value={contactoEmail}
                  onChange={(e) => setContactoEmail(e.target.value)}
                  placeholder="Email"
                  className="bg-brain-surface border border-brain-border rounded-lg px-3 py-2 text-[12px] text-gray-800 placeholder-[#999] focus:outline-none focus:border-brain-accent/50 transition-colors"
                />
                <input
                  value={contactoEmpresa}
                  onChange={(e) => setContactoEmpresa(e.target.value)}
                  placeholder="Empresa"
                  className="bg-brain-surface border border-brain-border rounded-lg px-3 py-2 text-[12px] text-gray-800 placeholder-[#999] focus:outline-none focus:border-brain-accent/50 transition-colors"
                />
                <input
                  value={contactoPhone}
                  onChange={(e) => setContactoPhone(e.target.value)}
                  placeholder="Telefono"
                  className="bg-brain-surface border border-brain-border rounded-lg px-3 py-2 text-[12px] text-gray-800 placeholder-[#999] focus:outline-none focus:border-brain-accent/50 transition-colors"
                />
                <input
                  value={contactoDireccion}
                  onChange={(e) => setContactoDireccion(e.target.value)}
                  placeholder="Direccion"
                  className="col-span-2 bg-brain-surface border border-brain-border rounded-lg px-3 py-2 text-[12px] text-gray-800 placeholder-[#999] focus:outline-none focus:border-brain-accent/50 transition-colors"
                />
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-brain-border" />
              <span className="text-[10px] text-[#999]">o sube archivos</span>
              <div className="flex-1 h-px bg-brain-border" />
            </div>

            {/* Upload zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  handleFilesSelected(e.dataTransfer.files);
                }
              }}
              className={`border-2 border-dashed rounded-lg px-4 py-3 flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                isDragging
                  ? 'border-[#3B82F6] bg-[#3B82F6]/5'
                  : 'border-brain-border hover:border-brain-accent/40 hover:bg-brain-accent-soft/30'
              }`}
            >
              <Upload className={`w-4 h-4 ${isDragging ? 'text-[#3B82F6]' : 'text-[#999]'}`} />
              <span className={`text-[11px] ${isDragging ? 'text-[#3B82F6] font-medium' : 'text-[#888]'}`}>
                {isDragging ? 'Suelta aqui' : 'Word, Excel, PDF, imagen, audio -- click o arrastra'}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={FILE_ACCEPT}
              className="hidden"
              onChange={(e) => { handleFilesSelected(e.target.files); e.target.value = ''; }}
            />

            {/* File chips */}
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((af, i) => {
                  const Icon = getFileIcon(af.file.type);
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 bg-brain-surface border border-brain-border rounded-lg px-2.5 py-1.5"
                    >
                      {af.preview ? (
                        <img src={af.preview} alt="" className="w-5 h-5 rounded object-cover" />
                      ) : (
                        <Icon className="w-3.5 h-3.5 text-[#888]" />
                      )}
                      <span className="text-[11px] text-gray-700 max-w-[120px] truncate">{af.file.name}</span>
                      <span className="text-[9px] text-[#999]">{formatSize(af.file.size)}</span>
                      <button
                        onClick={() => removeFile(i)}
                        className="w-4 h-4 flex items-center justify-center rounded text-[#999] hover:text-brain-error transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer with submit button */}
          <div className="px-4 py-2.5 border-t border-brain-border flex items-center justify-end">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium bg-brain-accent text-white rounded-lg hover:bg-brain-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creando...' : 'Crear RFQ'}
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
