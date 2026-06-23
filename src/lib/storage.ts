import { supabase } from './supabase';
import type { Message } from './types';

const CACHE_PREFIX = 'brain_msgs_';

// Cuántos mensajes recientes traer por stream. Supabase limita a 1000 por defecto;
// pedir ascendente sin límite devolvía los 1000 MÁS VIEJOS y nunca los recientes.
const HISTORY_LIMIT = 500;

export async function loadMessages(streamId: string): Promise<Message[]> {
  // Traer los más RECIENTES (descendente + limit) y luego invertir a orden cronológico.
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('stream_id', streamId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) {
    console.error('[storage] Error loading messages:', error);
    return loadMessagesFromCache(streamId);
  }

  const ordered = (data || []).slice().reverse(); // volver a ascendente

  if (ordered.length > 0) {
    saveMessagesToCache(streamId, ordered);
    return ordered;
  }

  // Sin datos en DB: no sobrescribir cache; devolver lo que haya en cache
  return loadMessagesFromCache(streamId);
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

export function clearMessagesCache(streamId: string): void {
  try {
    sessionStorage.removeItem(CACHE_PREFIX + streamId);
  } catch { /* ignore */ }
}

// Borra los mensajes de un stream de la DB. RFQs, jobs y notificaciones
// viven en sus propias tablas y NO se tocan.
export async function deleteStreamMessages(streamId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('stream_id', streamId);
  if (error) console.error('[storage] Error deleting stream messages:', error);
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
