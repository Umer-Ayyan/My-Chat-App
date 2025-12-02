import React, { useEffect, useState } from 'react';
import { Plus, User, Users, MessageCircle } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { Conversation, Profile } from '../types';

interface ConversationListProps {
  currentUserId: string;
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  currentUserId,
  activeConversationId,
  onSelectConversation,
  onNewChat,
}) => {
  const [conversations, setConversations] = useState<(Conversation & { other_user?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = async () => {
    try {
      // 1. Get IDs of conversations the user is part of
      const { data: participations, error: partError } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', currentUserId);

      if (partError) throw partError;

      if (!participations || participations.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const conversationIds = participations.map(p => p.conversation_id);

      // 2. Get conversation details
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .in('id', conversationIds)
        .order('created_at', { ascending: false });

      if (convError) throw convError;

      // 3. Enrich 1:1 conversations with the other user's profile
      const enrichedConversations = await Promise.all(
        (convData || []).map(async (conv) => {
          if (!conv.is_