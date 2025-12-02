export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  name?: string;
  is_group: boolean;
  created_at: string;
  last_message_at?: string;
}

export interface Participant {
  user_id: string;
  conversation_id: string;
  joined_at: string;
}

export interface Attachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  attachments?: Attachment[];
  created_at: string;
}

export interface UserPresence {
  user_id: string;
  online_at: string;
  isTyping?: boolean;
}

export enum ViewState {
  LOADING,
  AUTH,
  CHAT,
}