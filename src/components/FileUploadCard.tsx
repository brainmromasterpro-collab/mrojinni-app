import { FileText, Image, Music, FileSpreadsheet, File } from 'lucide-react';

interface FileUploadCardProps {
  contenido: {
    name?: string;
    type?: string;
    size?: number;
    url?: string;
  };
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return <Image className="w-5 h-5 text-[#3B82F6]" />;
  if (type.startsWith('audio/')) return <Music className="w-5 h-5 text-[#8B5CF6]" />;
  if (type.includes('pdf')) return <FileText className="w-5 h-5 text-[#EF4444]" />;
  if (type.includes('spreadsheet') || type.includes('excel') || type.includes('xlsx'))
    return <FileSpreadsheet className="w-5 h-5 text-[#10B981]" />;
  if (type.includes('word') || type.includes('document') || type.includes('docx'))
    return <FileText className="w-5 h-5 text-[#2563EB]" />;
  return <File className="w-5 h-5 text-[#6B7280]" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileLabel(type: string): string {
  if (type.startsWith('image/')) return 'Imagen';
  if (type.startsWith('audio/')) return 'Audio';
  if (type.includes('pdf')) return 'PDF';
  if (type.includes('spreadsheet') || type.includes('excel') || type.includes('xlsx')) return 'Excel';
  if (type.includes('word') || type.includes('document') || type.includes('docx')) return 'Word';
  return 'Archivo';
}

export default function FileUploadCard({ contenido }: FileUploadCardProps) {
  const { name = 'archivo', type = 'application/octet-stream', size = 0, url } = contenido;
  const isImage = type.startsWith('image/');

  return (
    <div className="bg-white border border-brain-border rounded-xl overflow-hidden max-w-sm">
      {isImage && url && (
        <div className="w-full h-32 bg-[#F5F5F5] flex items-center justify-center overflow-hidden">
          <img src={url} alt={name} className="max-w-full max-h-full object-contain" />
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#F3F4F6] flex items-center justify-center">
          {getFileIcon(type)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-gray-800 truncate">{name}</p>
          <p className="text-[10px] text-[#888] mt-0.5">
            {getFileLabel(type)} &middot; {formatSize(size)}
          </p>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-brain-accent hover:text-brain-accent-hover transition-colors"
          >
            Ver
          </a>
        )}
      </div>
    </div>
  );
}
