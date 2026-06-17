import { useState } from 'react';
import { Plug, X, Check, AlertCircle, ExternalLink, Eye, EyeOff } from 'lucide-react';

interface ConnectorConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'connected' | 'disconnected' | 'error';
  fields: { key: string; label: string; placeholder: string; type: 'text' | 'password' | 'url' }[];
  values: Record<string, string>;
  docsUrl?: string;
}

const defaultConnectors: ConnectorConfig[] = [
  {
    id: '1crm',
    name: '1CRM',
    description: 'Sincroniza productos, contactos y cotizaciones con tu instancia de 1CRM.',
    icon: '🏢',
    status: 'disconnected',
    fields: [
      { key: 'base_url', label: 'URL de instancia', placeholder: 'https://tu-empresa.1crmcloud.com', type: 'url' },
      { key: 'api_key', label: 'API Key', placeholder: 'crm_key_...', type: 'password' },
      { key: 'username', label: 'Usuario', placeholder: 'admin@empresa.com', type: 'text' },
    ],
    values: {},
    docsUrl: 'https://1crm.com/documentation/api',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Envio automatico de cotizaciones y seguimiento de correos.',
    icon: '✉️',
    status: 'disconnected',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: '123456789.apps.googleusercontent.com', type: 'text' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', type: 'password' },
      { key: 'refresh_token', label: 'Refresh Token', placeholder: '1//0...', type: 'password' },
    ],
    values: {},
    docsUrl: 'https://developers.google.com/gmail/api',
  },
  {
    id: 'drive',
    name: 'Google Drive',
    description: 'Almacenamiento de fichas tecnicas, cotizaciones y archivos adjuntos.',
    icon: '📁',
    status: 'disconnected',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: '123456789.apps.googleusercontent.com', type: 'text' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', type: 'password' },
      { key: 'folder_id', label: 'Folder ID', placeholder: '1AbC_dEfGhIjKlMnOpQrStUvWxYz', type: 'text' },
    ],
    values: {},
    docsUrl: 'https://developers.google.com/drive/api',
  },
  {
    id: 'removebg',
    name: 'Remove.bg',
    description: 'Remocion automatica de fondo para imagenes de productos.',
    icon: '🖼️',
    status: 'disconnected',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'rbg_...', type: 'password' },
    ],
    values: {},
    docsUrl: 'https://www.remove.bg/api',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Base de datos, autenticacion y storage para la plataforma.',
    icon: '⚡',
    status: 'connected',
    fields: [
      { key: 'url', label: 'Project URL', placeholder: 'https://xxx.supabase.co', type: 'url' },
      { key: 'anon_key', label: 'Anon Key', placeholder: 'eyJ...', type: 'password' },
      { key: 'service_role_key', label: 'Service Role Key', placeholder: 'eyJ...', type: 'password' },
    ],
    values: { url: 'https://configured.supabase.co', anon_key: '••••••••', service_role_key: '••••••••' },
    docsUrl: 'https://supabase.com/docs',
  },
];

export default function ConnectorsPanel() {
  const [connectors, setConnectors] = useState<ConnectorConfig[]>(defaultConnectors);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingConnector = connectors.find((c) => c.id === editingId);

  function handleSave(id: string, values: Record<string, string>) {
    setConnectors((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, values, status: Object.values(values).every((v) => v.trim()) ? 'connected' : 'disconnected' }
          : c
      )
    );
    setEditingId(null);
  }

  function handleDisconnect(id: string) {
    setConnectors((prev) =>
      prev.map((c) => (c.id === id ? { ...c, values: {}, status: 'disconnected' } : c))
    );
    setEditingId(null);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-brain-surface">
      {/* Header */}
      <div className="px-6 py-5 border-b border-brain-border bg-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#3B82F6]/10 flex items-center justify-center">
            <Plug className="w-4 h-4 text-[#3B82F6]" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">Conectores</h2>
            <p className="text-[11px] text-[#888]">Configura las APIs de tus servicios externos</p>
          </div>
        </div>
      </div>

      {/* Connector list */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-light">
        <div className="grid gap-3 max-w-2xl">
          {connectors.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              onEdit={() => setEditingId(connector.id)}
            />
          ))}
        </div>
      </div>

      {/* Config Modal */}
      {editingConnector && (
        <ConnectorModal
          connector={editingConnector}
          onClose={() => setEditingId(null)}
          onSave={handleSave}
          onDisconnect={handleDisconnect}
        />
      )}
    </div>
  );
}

function ConnectorCard({ connector, onEdit }: { connector: ConnectorConfig; onEdit: () => void }) {
  const statusColors = {
    connected: 'bg-emerald-500',
    disconnected: 'bg-gray-300',
    error: 'bg-red-400',
  };
  const statusLabels = {
    connected: 'Conectado',
    disconnected: 'No configurado',
    error: 'Error',
  };

  return (
    <div
      onClick={onEdit}
      className="bg-white border border-brain-border rounded-xl px-4 py-3.5 flex items-center gap-4 cursor-pointer hover:border-[#3B82F6]/40 hover:shadow-sm transition-all duration-150 group"
    >
      <span className="text-[20px] flex-shrink-0">{connector.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-gray-900">{connector.name}</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${statusColors[connector.status]}`} />
            <span className={`text-[10px] ${connector.status === 'connected' ? 'text-emerald-600' : connector.status === 'error' ? 'text-red-500' : 'text-[#888]'}`}>
              {statusLabels[connector.status]}
            </span>
          </div>
        </div>
        <p className="text-[11px] text-[#888] mt-0.5 truncate">{connector.description}</p>
      </div>
      <span className="text-[11px] text-[#aaa] group-hover:text-[#3B82F6] transition-colors font-medium">
        Configurar
      </span>
    </div>
  );
}

function ConnectorModal({
  connector,
  onClose,
  onSave,
  onDisconnect,
}: {
  connector: ConnectorConfig;
  onClose: () => void;
  onSave: (id: string, values: Record<string, string>) => void;
  onDisconnect: (id: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(connector.values);
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  function handleFieldChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setTestResult(null);
  }

  function toggleVisibility(key: string) {
    setVisibleFields((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleTest() {
    setTesting(true);
    setTestResult(null);
    setTimeout(() => {
      const allFilled = connector.fields.every((f) => values[f.key]?.trim());
      setTestResult(allFilled ? 'success' : 'error');
      setTesting(false);
    }, 1200);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(connector.id, values);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-fade-in overflow-hidden">
        {/* Modal header */}
        <div className="px-6 py-4 border-b border-brain-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[20px]">{connector.icon}</span>
            <div>
              <h3 className="text-[14px] font-semibold text-gray-900">{connector.name}</h3>
              <p className="text-[10px] text-[#888]">Configuracion de API</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-brain-surface transition-colors">
            <X className="w-4 h-4 text-[#888]" />
          </button>
        </div>

        {/* Modal body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-[11px] text-[#666] leading-relaxed">{connector.description}</p>

          {connector.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-[11px] font-medium text-gray-700 mb-1.5">{field.label}</label>
              <div className="relative">
                <input
                  type={field.type === 'password' && !visibleFields[field.key] ? 'password' : 'text'}
                  value={values[field.key] || ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]/20 transition-all placeholder:text-[#bbb]"
                />
                {field.type === 'password' && (
                  <button
                    type="button"
                    onClick={() => toggleVisibility(field.key)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#aaa] hover:text-[#666] transition-colors"
                  >
                    {visibleFields[field.key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] ${
              testResult === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {testResult === 'success' ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {testResult === 'success' ? 'Conexion exitosa' : 'Error de conexion — verifica tus credenciales'}
            </div>
          )}

          {/* Docs link */}
          {connector.docsUrl && (
            <a
              href={connector.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[10px] text-[#3B82F6] hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Ver documentacion de la API
            </a>
          )}
        </form>

        {/* Modal footer */}
        <div className="px-6 py-4 border-t border-brain-border flex items-center justify-between bg-brain-surface/50">
          <div>
            {connector.status === 'connected' && (
              <button
                type="button"
                onClick={() => onDisconnect(connector.id)}
                className="text-[11px] text-red-500 hover:text-red-700 font-medium transition-colors"
              >
                Desconectar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-3.5 py-1.5 text-[11px] font-medium border border-brain-border rounded-lg hover:bg-white transition-colors disabled:opacity-50"
            >
              {testing ? 'Probando...' : 'Probar conexion'}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-3.5 py-1.5 text-[11px] font-semibold text-white bg-[#3B82F6] rounded-lg hover:bg-[#2563EB] transition-colors"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
