import { useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

export function useRealtimeMessages(conversationId, onMessage) {
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        payload => onMessage(payload.new)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [conversationId]);
}
