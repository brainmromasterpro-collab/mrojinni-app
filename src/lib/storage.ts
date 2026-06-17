import { supabase } from './supabase';
import type { Message } from './types';

const CACHE_PREFIX = 'brain_msgs_';

export async function loadMessages(streamId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('stream_id', streamId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[storage] Error loading messages:', error);
    return loadMessagesFromCache(streamId);
  }

  if (data && data.length > 0) {
    saveMessagesToCache(streamId, data);
  }

  return data || loadMessagesFromCache(streamId);
}

export function loadMessagesFromCache(streamId: string): Message[] {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + streamId);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveMessagesToCache(streamId: string, msgs: Message[]): void {
  try {
    sessionStorage.setItem(CACHE_PREFIX + streamId, JSON.stringify(msgs));
  } catch { /* storage full - ignore */ }
}

export async function persistMessages(msgs: Message[]): Promise<void> {
  if (msgs.length === 0) return;

  const payload = msgs.map((msg) => ({
    id: msg.id,
    stream_id: msg.stream_id,
    rol: msg.rol,
    tipo: msg.tipo,
    contenido: msg.contenido,
    created_at: msg.created_at,
  }));

  const { error } = await supabase
    .from('messages')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    console.error('[storage] Error persisting messages:', error);
    await new Promise((r) => setTimeout(r, 1000));
    const { error: retryErr } = await supabase
      .from('messages')
      .upsert(payload, { onConflict: 'id' });
    if (retryErr) {
      console.error('[storage] Retry also failed:', retryErr);
    }
  }
}
