import { useState } from 'react';
import { Cloud, X, Check, AlertCircle, Plus, ExternalLink, Server, Cpu, Globe } from 'lucide-react';

type ServiceCategory = 'hosting' | 'compute' | 'models';
type ServiceStatus = 'connected' | 'disconnected' | 'error';

interface InfraService {
  id: string;
  name: string;
  description: string;
  category: ServiceCategory;
  status: ServiceStatus;
  icon: 'server' | 'cpu' | 'globe';
  fields: { key: string; label: string; placeholder: string; type: 'text' | 'password' | 'url' }[];
  values: Record<string, string>;
  docsUrl?: string;
}

const categoryLabels: Record<ServiceCategory, string> = {
  hosting: 'Hosting & Deploy',
  compute: 'Compute & Runtime',
  models: 'Modelos de IA',
};

const defaultServices: InfraService[] = [
  {
    id: 'railway',
    name: 'Railway',
    description: 'Deploy de agentes Python. Gestiona los servicios del pipeline de forma automatizada.',
    category: 'compute',
    status: 'connected',
    icon: 'server',
    fields: [
      { key: 'api_token', label: 'API Token', placeholder: 'railway_token_...', type: 'password' },
      { key: 'project_id', label: 'Project ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', type: 'text' },
      { key: 'environment', label: 'Entorno', placeholder: 'production', type: 'text' },
    ],
    values: { environment: 'production' },
    docsUrl: 'https://docs.railway.app/reference/public-api',
  },
  {
    id: 'hostinger',
    name: 'Hostinger',
    description: 'Hosting para el frontend web y dominios personalizados.',
    category: 'hosting',
    status: 'disconnected',
    icon: 'globe',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'hst_...', type: 'password' },
      { key: 'domain', label: 'Dominio', placeholder: 'mi-empresa.com', type: 'text' },
    ],
    values: {},
    docsUrl: 'https://developers.hostinger.com',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Base de datos, autenticacion y storage para la plataforma.',
    category: 'compute',
    status: 'connected',
    icon: 'server',
    fields: [
      { key: 'url', label: 'Project URL', placeholder: 'https://xxx.supabase.co', type: 'url' },
      { key: 'anon_key', label: 'Anon Key', placeholder: 'eyJ...', type: 'password' },
      { key: 'service_role', label: 'Service Role Key', placeholder: 'eyJ...', type: 'password' },
    ],
    values: {},
    docsUrl: 'https://supabase.com/docs',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'Modelos Claude para los agentes del pipeline. Sonnet, Haiku, Opus.',
    category: 'models',
    status: 'connected',
    icon: 'cpu',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'sk-ant-...', type: 'password' },
      { key: 'default_model', label: 'Modelo default', placeholder: 'claude-sonnet-4-20250514', type: 'text' },
      { key: 'max_retries', label: 'Max reintentos', placeholder: '3', type: 'text' },
    ],
    values: { default_model: 'claude-sonnet-4-20250514', max_retries: '3' },
    docsUrl: 'https://docs.anthropic.com',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Modelos GPT como alternativa o complemento para tareas especificas.',
    category: 'models',
    status: 'disconnected',
    icon: 'cpu',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'sk-...', type: 'password' },
      { key: 'org_id', label: 'Organization ID', placeholder: 'org-...', type: 'text' },
      { key: 'default_model', label: 'Modelo default', placeholder: 'gpt-4o', type: 'text' },
    ],
    values: {},
    docsUrl: 'https://platform.openai.com/docs',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Modelos locales para desarrollo, pruebas o tareas sin costo de API.',
    category: 'models',
    status: 'disconnected',
    icon: 'cpu',
    fields: [
      { key: 'base_url', label: 'URL del servidor', placeholder: 'http://localhost:11434', type: 'url' },
      { key: 'model', label: 'Modelo', placeholder: 'llama3.1:8b', type: 'text' },
    ],
    values: { base_url: 'http://localhost:11434' },
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/api.md',
  },
];

const iconMap = {
  server: Server,
  cpu: Cpu,
  globe: Globe,
};

export default function InfraPanel() {
  const [services, setServices] = useState<InfraService[]>(defaultServices);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const editingService = services.find((s) => s.id === editingId);

  function handleSave(id: string, values: Record<string, string>) {
    setServices((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, values, status: 'connected' as ServiceStatus } : s
      )
    );
    setEditingId(null);
  }

  function handleDisconnect(id: string) {
    setServices((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, values: {}, status: 'disconnected' as ServiceStatus } : s
      )
    );
    setEditingId(null);
  }

  function handleCreate(service: InfraService) {
    setServices((prev) => [...prev, service]);
    setCreatingNew(false);
  }

  const grouped = {
    hosting: services.filter((s) => s.category === 'hosting'),
    compute: services.filter((s) => s.category === 'compute'),
    models: services.filter((s) => s.category === 'models'),
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-brain-surface">
      {/* Header */}
      <div className="px-6 py-5 border-b border-brain-border bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0284c7]/10 flex items-center justify-center">
              <Cloud className="w-4 h-4 text-[#0284c7]" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900">Infraestructura</h2>
              <p className="text-[11px] text-[#888]">Conecta servicios de nube, hosting y modelos de IA</p>
            </div>
          </div>
          <button
            onClick={() => setCreatingNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white bg-[#0284c7] rounded-lg hover:bg-[#0369a1] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo servicio
          </button>
        </div>
      </div>

      {/* Status summary */}
      <div className="px-6 pt-5 pb-2">
        <div className="flex items-center gap-4">
          <StatusBadge count={services.filter((s) => s.status === 'connected').length} label="Conectados" color="emerald" />
          <StatusBadge count={services.filter((s) => s.status === 'disconnected').length} label="Desconectados" color="gray" />
          <StatusBadge count={services.filter((s) => s.status === 'error').length} label="Con error" color="red" />
        </div>
      </div>

      {/* Service list by category */}
      <div className="flex-1 overflow-y-auto p-6 pt-3 scrollbar-light">
        <div className="max-w-2xl space-y-5">
          {(Object.keys(grouped) as ServiceCategory[]).map((cat) => (
            grouped[cat].length > 0 && (
              <div key={cat}>
                <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wider mb-2">
                  {categoryLabels[cat]}
                </p>
                <div className="grid gap-2.5">
                  {grouped[cat].map((service) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      onEdit={() => setEditingId(service.id)}
                    />
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      </div>

      {/* Edit Modal */}
      {editingService && (
        <ServiceModal
          service={editingService}
          onClose={() => setEditingId(null)}
          onSave={handleSave}
          onDisconnect={handleDisconnect}
        />
      )}

      {/* New Service Modal */}
      {creatingNew && (
        <NewServiceModal
          onClose={() => setCreatingNew(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

function StatusBadge({ count, label, color }: { count: number; label: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    gray: 'bg-gray-100 text-gray-500',
    red: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colorMap[color]}`}>
      {count} {label}
    </span>
  );
}

function ServiceCard({ service, onEdit }: { service: InfraService; onEdit: () => void }) {
  const Icon = iconMap[service.icon];
  const statusColors = {
    connected: 'bg-emerald-500',
    disconnected: 'bg-gray-300',
    error: 'bg-red-400',
  };
  const statusLabels = {
    connected: 'Conectado',
    disconnected: 'Desconectado',
    error: 'Error',
  };

  return (
    <div
      onClick={onEdit}
      className="bg-white border border-brain-border rounded-xl px-4 py-3.5 flex items-center gap-4 cursor-pointer hover:border-[#0284c7]/40 hover:shadow-sm transition-all duration-150 group"
    >
      <div className="w-9 h-9 rounded-lg bg-brain-surface flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-[#555]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-gray-900">{service.name}</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${statusColors[service.status]}`} />
            <span className={`text-[10px] ${
              service.status === 'connected' ? 'text-emerald-600'
              : service.status === 'error' ? 'text-red-500'
              : 'text-[#888]'
            }`}>
              {statusLabels[service.status]}
            </span>
          </div>
        </div>
        <p className="text-[11px] text-[#888] mt-0.5 truncate">{service.description}</p>
      </div>
      <span className="text-[11px] text-[#aaa] group-hover:text-[#0284c7] transition-colors font-medium">
        {service.status === 'connected' ? 'Editar' : 'Conectar'}
      </span>
    </div>
  );
}

function ServiceModal({
  service,
  onClose,
  onSave,
  onDisconnect,
}: {
  service: InfraService;
  onClose: () => void;
  onSave: (id: string, values: Record<string, string>) => void;
  onDisconnect: (id: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(service.values);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const Icon = iconMap[service.icon];

  function handleTest() {
    setTesting(true);
    setTestResult(null);
    globalThis.setTimeout(() => {
      const hasValues = service.fields.every((f) => values[f.key]?.trim());
      setTestResult(hasValues ? 'success' : 'error');
      setTesting(false);
    }, 1200);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(service.id, values);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-fade-in overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-brain-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0284c7]/10 flex items-center justify-center">
              <Icon className="w-4 h-4 text-[#0284c7]" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-gray-900">{service.name}</h3>
              <p className="text-[10px] text-[#888]">{service.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-brain-surface transition-colors">
            <X className="w-4 h-4 text-[#888]" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4 scrollbar-light">
          {service.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-[11px] font-medium text-gray-700 mb-1.5">{field.label}</label>
              <div className="relative">
                <input
                  type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                  value={values[field.key] || ''}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#0284c7] focus:ring-1 focus:ring-[#0284c7]/20 transition-all pr-9"
                />
                {field.type === 'password' && (
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, [field.key]: !showPasswords[field.key] })}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#aaa] hover:text-[#555] transition-colors"
                  >
                    {showPasswords[field.key] ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}

          {service.docsUrl && (
            <a
              href={service.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-[#0284c7] hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Ver documentacion
            </a>
          )}

          {testResult && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] ${
              testResult === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {testResult === 'success' ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {testResult === 'success' ? 'Conexion exitosa' : 'No se pudo conectar — verifica las credenciales'}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-brain-border flex items-center justify-between bg-brain-surface/50 flex-shrink-0">
          <div>
            {service.status === 'connected' && (
              <button
                type="button"
                onClick={() => onDisconnect(service.id)}
                className="px-3 py-1.5 text-[11px] font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
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
              className="px-3.5 py-1.5 text-[11px] font-semibold text-white bg-[#0284c7] rounded-lg hover:bg-[#0369a1] transition-colors"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewServiceModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (service: InfraService) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('compute');
  const [fieldsRaw, setFieldsRaw] = useState('');
  const [docsUrl, setDocsUrl] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const fields = fieldsRaw
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => {
        const parts = line.split('|').map((p) => p.trim());
        return {
          key: (parts[0] || 'field').toLowerCase().replace(/\s+/g, '_'),
          label: parts[0] || 'Campo',
          placeholder: parts[1] || '',
          type: (parts[2] === 'password' ? 'password' : parts[2] === 'url' ? 'url' : 'text') as 'text' | 'password' | 'url',
        };
      });

    onCreate({
      id: name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
      name: name.trim(),
      description: description.trim(),
      category,
      status: 'disconnected',
      icon: category === 'hosting' ? 'globe' : category === 'models' ? 'cpu' : 'server',
      fields: fields.length > 0 ? fields : [
        { key: 'api_key', label: 'API Key', placeholder: 'Tu API key', type: 'password' },
      ],
      values: {},
      docsUrl: docsUrl.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-fade-in overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-brain-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0284c7]/10 flex items-center justify-center">
              <Plus className="w-4 h-4 text-[#0284c7]" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-gray-900">Nuevo servicio</h3>
              <p className="text-[10px] text-[#888]">Agrega un servicio de infraestructura o modelo de IA</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-brain-surface transition-colors">
            <X className="w-4 h-4 text-[#888]" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4 scrollbar-light">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Nombre</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: AWS S3"
                autoFocus
                className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#0284c7] focus:ring-1 focus:ring-[#0284c7]/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Categoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#0284c7] focus:ring-1 focus:ring-[#0284c7]/20 transition-all bg-white"
              >
                <option value="hosting">Hosting & Deploy</option>
                <option value="compute">Compute & Runtime</option>
                <option value="models">Modelos de IA</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Descripcion</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Para que se usa este servicio"
              className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#0284c7] focus:ring-1 focus:ring-[#0284c7]/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
              Campos de configuracion
            </label>
            <textarea
              value={fieldsRaw}
              onChange={(e) => setFieldsRaw(e.target.value)}
              rows={4}
              placeholder={"API Key|sk-...|password\nBase URL|https://...|url\nModelo|gpt-4o|text"}
              className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#0284c7] focus:ring-1 focus:ring-[#0284c7]/20 transition-all resize-none font-mono leading-relaxed"
            />
            <p className="text-[9px] text-[#aaa] mt-1">Un campo por linea: Label|Placeholder|Tipo (text, password, url)</p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">URL de documentacion (opcional)</label>
            <input
              value={docsUrl}
              onChange={(e) => setDocsUrl(e.target.value)}
              placeholder="https://docs.ejemplo.com"
              className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#0284c7] focus:ring-1 focus:ring-[#0284c7]/20 transition-all"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-brain-border flex items-center justify-end gap-2 bg-brain-surface/50 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-[11px] font-medium border border-brain-border rounded-lg hover:bg-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="px-3.5 py-1.5 text-[11px] font-semibold text-white bg-[#0284c7] rounded-lg hover:bg-[#0369a1] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Crear servicio
          </button>
        </div>
      </div>
    </div>
  );
}
