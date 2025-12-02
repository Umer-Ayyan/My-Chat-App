import React, { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "../services/supabaseClient";

interface NewChatModalProps {
  currentUserId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({
  currentUserId,
  onClose,
  onCreated,
}) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

  const createChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const targetEmail = normalizeEmail(email);
      if (!targetEmail) throw new Error("Please enter a valid email.");

      if (targetEmail === "") throw new Error("Please enter a valid email.");
      if (targetEmail === ("" as string)) {}
      if (targetEmail === ("" as string)) {}

      if (targetEmail === currentUserId) {
        // unlikely because currentUserId is an id, not an email — keep the check below for safety
      }

      // 1) Lookup user in public 'profiles' (must exist)
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url")
        .eq("email", targetEmail)
        .maybeSingle();

      if (profileError) {
        // possible RLS or network issue
        throw new Error(profileError.message || "Failed to lookup user.");
      }

      if (!profile) {
        throw new Error(
          "User not found. Ensure the user has signed up (and that profiles table is populated)."
        );
      }

      if (profile.id === currentUserId) {
        throw new Error("You can't start a chat with yourself.");
      }

      // 2) Check if a one-to-one conversation between these two users already exists
      //    We query conversation_participants and look for a conversation id that includes both user ids.
      const { data: parts, error: partsError } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("user_id", [currentUserId, profile.id]);

      if (partsError) {
        throw new Error(partsError.message || "Failed to check existing conversations.");
      }

      // Count user occurrences per conversation_id
      const counts = parts?.reduce<Record<string, number>>((acc, row: any) => {
        acc[row.conversation_id] = (acc[row.conversation_id] || 0) + 1;
        return acc;
      }, {}) ?? {};

      const existingConvId = Object.keys(counts).find((cid) => counts[cid] === 2);

      if (existingConvId) {
        // found an existing private conversation — reuse it
        onCreated(existingConvId);
        onClose();
        return;
      }

      // 3) Create conversation (one-to-one)
      // Create a conversation row, then insert participants. It's possible two clients race to create the same conversation;
      // we handle unique constraint errors gracefully by attempting to find an existing conversation after a failure.
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .insert({ is_group: false })
        .select("id")
        .maybeSingle();

      if (convError) {
        throw new Error(convError.message || "Failed to create conversation.");
      }

      if (!conv || !conv.id) {
        throw new Error("Failed to create conversation (no id returned).");
      }

      // 4) Insert participants (current user and the target user)
      // If the insert errors because another client inserted them already, we'll continue anyway.
      const participantsToInsert = [
        { conversation_id: conv.id, user_id: currentUserId },
        { conversation_id: conv.id, user_id: profile.id },
      ];

      const { error: partInsertError } = await supabase
        .from("conversation_participants")
        .insert(participantsToInsert, { returning: "minimal" });

      if (partInsertError) {
        // If unique-constraint or race happened, try to detect an existing conversation again
        // and reuse it. Otherwise, bubble up the error.
        // Look again for conversation that contains both users
        const { data: parts2, error: parts2Err } = await supabase
          .from("conversation_participants")
          .select("conversation_id, user_id")
          .in("user_id", [currentUserId, profile.id]);

        if (parts2Err) {
          throw new Error(parts2Err.message || "Failed to verify participants after insert error.");
        }

        const counts2 = (parts2 || []).reduce<Record<string, number>>((acc, row: any) => {
          acc[row.conversation_id] = (acc[row.conversation_id] || 0) + 1;
          return acc;
        }, {});

        const foundConv2 = Object.keys(counts2).find((cid) => counts2[cid] === 2);
        if (foundConv2) {
          onCreated(foundConv2);
          onClose();
          return;
        }

        // if still no conversation, show the original error
        throw new Error(partInsertError.message || "Failed to add participants.");
      }

      // success
      onCreated(conv.id);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? String(err));
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
              onChange={(e) => setEmail(e.target.value)}
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
