import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Send, Paperclip, MoreVertical, ArrowLeft, Download, File, Loader2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { Message, Attachment, UserPresence } from '../types';

interface ChatWindowProps {
  conversationId: string;
  currentUserId: string;
  onBack: () => void; // For mobile view
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversationId,
  currentUserId,
  onBack,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [presenceState, setPresenceState] = useState<Record<string, UserPresence>>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  // Keep a ref to the active channel so we can reuse it for broadcasts / presence tracking
  const channelRef = useRef<any>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, typingUsers]);

  // Helper: dedupe messages by id
  const addMessageIfNew = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      const merged = [...prev, msg].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return merged;
    });
  }, []);

  // Fetch initial messages and setup Realtime
  useEffect(() => {
    if (!conversationId) return;

    setLoading(true);
    setMessages([]);
    setPresenceState({});
    setTypingUsers([]);

    // 1. Fetch Messages
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from<Message>('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
      } else {
        setMessages(data || []);
      }
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    };

    fetchMessages();

    // 2. Setup Realtime Channel and store in ref
    const channel = supabase.channel(`conversation:${conversationId}`);

    channel
      // Listen for new messages (Postgres changes)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          addMessageIfNew(newMsg);
        }
      )
      // Presence sync handler
      .on('presence', { event: 'sync' }, () => {
        try {
          const newState = channel.presenceState();
          const users: Record<string, UserPresence> = {};
          for (const key in newState) {
            const presences = newState[key] as any[];
            if (presences.length > 0) {
              users[key] = presences[0];
            }
          }
          setPresenceState(users);
        } catch (err) {
          // If presenceState isn't supported in your SDK version, ignore
          console.warn('presence sync error', err);
        }
      })
      // Typing broadcasts
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { user_id, isTyping } = payload.payload ?? payload;
        if (!user_id || user_id === currentUserId) return;

        setTypingUsers((prev) => {
          const others = prev.filter((id) => id !== user_id);
          return isTyping ? [...others, user_id] : others;
        });
      })
      // Subscribe and then track presence if subscribed
      .subscribe(async (status) => {
        // store reference to the subscribed channel so other handlers can use it
        channelRef.current = channel;

        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({
              user_id: currentUserId,
              online_at: new Date().toISOString(),
            });
          } catch (err) {
            console.warn('presence track failed', err);
          }
        }
      });

    // cleanup
    return () => {
      try {
        // untrack presence if available
        channelRef.current?.untrack?.({ user_id: currentUserId }).catch?.(() => {});
      } catch (e) {}
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId, currentUserId, addMessageIfNew]);

  // Handle Typing Indicator broadcast - use the subscribed channel from ref
  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setNewMessage(text);

    const channel = channelRef.current;
    if (!channel) {
      // channel not ready yet — not fatal
      return;
    }

    // Broadcast typing true
    try {
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: currentUserId, isTyping: true },
      });
    } catch (err) {
      console.warn('typing broadcast failed', err);
    }

    // Debounce typing false
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      try {
        channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { user_id: currentUserId, isTyping: false },
        });
      } catch (err) {
        console.warn('typing broadcast failed', err);
      }
    }, 2000);
  };

  // Handle File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${conversationId}/${fileName}`;

      // NOTE: confirm your bucket name here. I use 'chat-attachments' as recommended earlier.
      const BUCKET = 'chat-attachments';

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath);

      // data.publicUrl or data.publicURL depending on SDK; guard both
      const publicUrl = (data as any)?.publicUrl ?? (data as any)?.publicURL ?? '';

      const attachment: Attachment = {
        name: file.name,
        url: publicUrl,
        type: file.type,
        size: file.size,
      };

      await sendMessage(undefined, [attachment]);
    } catch (err: any) {
      alert(`Upload failed: ${err.message ?? String(err)}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sendMessage = async (text?: string, attachments: Attachment[] = []) => {
    const content = text !== undefined ? text : newMessage;
    if ((!(content && content.trim()) && attachments.length === 0) || sending || !conversationId) return;

    setSending(true);

    try {
      // Insert to DB (this will trigger Postgres changefeed and deliver to subscribers)
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: content && content.trim() ? content.trim() : null,
          attachments: attachments.length > 0 ? attachments : null,
        })
        .select()
        .single();

      if (error) throw error;

      // The realtime listener will pick this up and add the message (dedupe prevents duplicates)
      setNewMessage('');
    } catch (err) {
      console.error('Failed to send', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="md:hidden p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="font-semibold text-gray-800">Chat</h3>
            {/* Simple online count based on presence */}
            <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${Object.keys(presenceState).length > 1 ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                <p className="text-xs text-gray-500">
                {Object.keys(presenceState).length > 1 ? `${Object.keys(presenceState).length} online` : 'Offline'}
                </p>
            </div>
          </div>
        </div>
        <button className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
          <MoreVertical size={20} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === currentUserId;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                  }`}
                >
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-2 space-y-2">
                      {msg.attachments.map((att, idx) => (
                        <div key={idx}>
                          {att.type?.startsWith('image/') ? (
                             <img src={att.url} alt="attachment" className="rounded-lg max-h-48 object-cover border border-white/20" />
                          ) : (
                             <a href={att.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 p-2 rounded ${isMe ? 'bg-blue-700' : 'bg-gray-100'} hover:opacity-90 transition`}>
                                <File size={16} />
                                <span className="text-sm truncate max-w-[150px]">{att.name}</span>
                                <Download size={14} />
                             </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.content && <p className="text-sm break-words whitespace-pre-wrap">{msg.content}</p>}
                  <p className={`text-[10px] mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'} text-right`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        {typingUsers.length > 0 && (
             <div className="flex justify-start">
                 <div className="bg-gray-200 text-gray-500 text-xs px-3 py-1 rounded-full animate-pulse">
                     Someone is typing...
                 </div>
             </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="bg-white border-t border-gray-200 p-3 md:p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-end gap-2"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept="image/*,application/pdf,.doc,.docx"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
          </button>

          <div className="flex-1 bg-gray-100 rounded-2xl flex items-center px-4 py-2 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:bg-white transition-all border border-transparent focus-within:border-blue-500">
            <input
              type="text"
              value={newMessage}
              onChange={handleTyping}
              placeholder="Type a message..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-gray-800 placeholder-gray-400 max-h-32"
              disabled={sending}
            />
          </div>

          <button
            type="submit"
            disabled={(!newMessage.trim() && !uploading) || sending}
            className="p-3 bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 shadow-md hover:shadow-lg disabled:opacity-50 disabled:shadow-none transition-all"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};
