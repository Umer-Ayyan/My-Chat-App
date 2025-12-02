import React, { useEffect, useState } from 'react';
import { supabase } from './services/supabaseClient';
import { Auth } from './components/Auth';
import { ConversationList } from './components/ConversationList';
import { ChatWindow } from './components/ChatWindow';
import { NewChatModal } from './components/NewChatModal';
import { Loader2 } from 'lucide-react';
import { ViewState } from './types';

export default function App() {
  const [viewState, setViewState] = useState<ViewState>(ViewState.LOADING);
  const [session, setSession] = useState<any>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setViewState(session ? ViewState.CHAT : ViewState.AUTH);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setViewState(session ? ViewState.CHAT : ViewState.AUTH);
      if (!session) setActiveConversationId(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (viewState === ViewState.LOADING) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (viewState === ViewState.AUTH) {
    return <Auth />;
  }

  // CHAT VIEW
  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar - hidden on mobile if chat is active */}
      <div className={`${activeConversationId ? 'hidden md:flex' : 'flex'} w-full md:w-auto`}>
        <ConversationList
          currentUserId={session?.user.id}
          activeConversationId={activeConversationId}
          onSelectConversation={setActiveConversationId}
          onNewChat={() => setShowNewChatModal(true)}
        />
      </div>

      {/* Chat Area - hidden on mobile if no chat active */}
      <div className={`flex-1 ${!activeConversationId ? 'hidden md:flex' : 'flex'} flex-col h-full bg-white`}>
        {activeConversationId ? (
          <ChatWindow
            conversationId={activeConversationId}
            currentUserId={session?.user.id}
            onBack={() => setActiveConversationId(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-4">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
            </div>
            <h3 className="text-lg font-medium text-gray-600">No Chat Selected</h3>
            <p className="text-sm">Select a conversation or start a new one to begin.</p>
          </div>
        )}
      </div>

      {showNewChatModal && (
        <NewChatModal
          currentUserId={session?.user.id}
          onClose={() => setShowNewChatModal(false)}
          onCreated={(id) => {
             setActiveConversationId(id);
             setShowNewChatModal(false);
          }}
        />
      )}
    </div>
  );
}