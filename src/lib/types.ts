export interface Stream {
  id: string;
  nombre: string;
  tipo: 'compras' | 'ventas' | 'logistica' | 'general';
  created_at: string;
  user_id: string;
}

export interface Message {
  id: string;
  stream_id: string;
  rol: 'user' | 'assistant' | 'system';
  tipo: string;
  contenido: Record<string, unknown>;
  created_at: string;
}
