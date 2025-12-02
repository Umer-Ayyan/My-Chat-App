import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface NewChatModalProps {
  currentUserId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ currentUserId, onClose, onCreated }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const createChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Find user by email (Note: In a real secure app, don't expose user emails indiscriminately.
      // We assume a 'profiles' table exists that is searchable.)
      const { data: users, error: userError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (userError || !users) {
        throw new Error('User not found. Ensure they have signed up and have a profile.');
      }

      if (users.id === currentUserId) {
        throw new Error("You can't chat with yourself.");
      }

      // 2. Create Conversation
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({ is_group: false })
        .select()
        .single();

      if (convError) throw convError;

      // 3. Add Participants
      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert([
          { conversation_id: conv.id, user_id: currentUserId },
          { conversation_id: conv.id, user_id: users.id }
        ]);

      if (partError) throw partError;

      onCreated(conv.id);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-sm p-6 relative shadow-xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
        <h2 className="text-xl font-bold mb-4 text-gray-800">New Message</h2>
        
        {error && <div className="mb-4 text-xs text-red-600 bg-red-50 p-2 rounded">{error}</div>}

        <form onSubmit={createChat}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">User Email</label>
            <input 
              type="email" 
              required
              className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="friend@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">Enter the exact email address of the registered user.</p>
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Start Chat
          </button>
        </form>
      </div>
    </div>
  );
};