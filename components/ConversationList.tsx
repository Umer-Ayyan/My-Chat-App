import React, { useEffect, useState } from 'react';
import { Plus, User, LogOut, MessageCircle } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { Conversation, Profile } from '../types';

interface ConversationListProps {
  currentUserId: string;
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
}

// Helper type extending the base Conversation to include display details
type ConversationWithDetails = Conversation & {
  other_user?: { email: string; full_name?: string };
  display_name?: string;
};

export const ConversationList: React.FC<ConversationListProps> = ({
  currentUserId,
  activeConversationId,
  onSelectConversation,
  onNewChat,
}) => {
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');

  const fetchConversations = async () => {
    try {
      setLoading(true);

      // 0. Get current user details for the header
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setCurrentUserEmail(user.email);

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

      const conversationIds = participations.map((p) => p.conversation_id);

      // 2. Get conversation details
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .in('id', conversationIds)
        .order('created_at', { ascending: false });

      if (convError) throw convError;

      // 3. Get all participants for these conversations to resolve names
      // We join with profiles to get emails/names
      const { data: allParticipants, error: allPartError } = await supabase
        .from('conversation_participants')
        .select(`
          conversation_id, 
          user_id,
          profiles ( email, full_name )
        `)
        .in('conversation_id', conversationIds);

      if (allPartError) throw allPartError;

      // 4. Enrich conversations
      const enriched = (convData || []).map((conv) => {
        // If it's a group, use its name. If not, find the OTHER user.
        if (conv.is_group) {
          return { ...conv, display_name: conv.name || 'Group Chat' };
        }

        // Find the participant that is NOT the current user
        const otherParticipant = allParticipants?.find(
          (p) => p.conversation_id === conv.id && p.user_id !== currentUserId
        );
        
        // Handle "Chat with self" edge case
        const targetProfile = otherParticipant 
            ? (otherParticipant.profiles as any) 
            : (allParticipants?.find(p => p.conversation_id === conv.id && p.user_id === currentUserId)?.profiles as any);

        return {
          ...conv,
          other_user: targetProfile,
          display_name: targetProfile?.email || 'Unknown User',
        };
      });

      setConversations(enriched);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();

    // Subscribe to new conversations (participants table changes)
    const channel = supabase.channel('conversation_list_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="w-full md:w-80 bg-white border-r border-gray-200 h-full flex flex-col">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                <MessageCircle size={18} />
             </div>
             <span className="font-bold text-gray-700">Chat App</span>
          </div>
          <button 
            onClick={onNewChat}
            className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition shadow-sm"
            title="New Chat"
          >
            <Plus size={20} />
          </button>
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-500">
           <div className="flex items-center gap-1 overflow-hidden">
              <User size={12} />
              <span className="truncate max-w-[140px]" title={currentUserEmail}>{currentUserEmail}</span>
           </div>
           <button onClick={handleLogout} className="text-red-500 hover:text-red-700 flex items-center gap-1">
             <LogOut size={12} /> Sign out
           </button>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
             {[1, 2, 3].map(i => (
               <div key={i} className="animate-pulse flex items-center gap-3">
                 <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                 <div className="flex-1 space-y-2">
                   <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                   <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                 </div>
               </div>
             ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p className="mb-2">No conversations yet.</p>
            <button 
              onClick={onNewChat} 
              className="text-blue-500 hover:underline text-sm"
            >
              Start a new chat
            </button>
          </div>
        ) : (
          <ul>
            {conversations.map((conv) => (
              <li key={conv.id}>
                <button
                  onClick={() => onSelectConversation(conv.id)}
                  className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition border-l-4 ${
                    activeConversationId === conv.id
                      ? 'bg-blue-50 border-blue-600'
                      : 'border-transparent'
                  }`}
                >
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 font-semibold shrink-0">
                    {conv.display_name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <h4 className={`text-sm font-medium truncate ${activeConversationId === conv.id ? 'text-blue-900' : 'text-gray-900'}`}>
                      {conv.display_name}
                    </h4>
                    <p className="text-xs text-gray-500 truncate">
                      {new Date(conv.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
