# Supabase Realtime Chat (React SPA)

A simple, production-lean real-time messaging web app using React, Tailwind CSS, and Supabase.

## Features

*   **Auth**: Email/Password login & signup via Supabase Auth.
*   **Realtime**: Instant messaging and Typing indicators.
*   **Storage**: Image/File attachments.
*   **Security**: RLS policies ensure privacy.
*   **Responsive**: Mobile-first design.

## Prerequisites

1.  Node.js (v18+)
2.  A free [Supabase](https://supabase.com) account.

## Setup Instructions

### 1. Supabase Setup

1.  Create a new project in Supabase.
2.  Go to **SQL Editor** and copy/paste the content of `supabase_schema.sql` (included in this repo) to set up tables and security policies. Run the query.
3.  Go to **Storage**, create a new public bucket named `attachments`.
    *   Add a policy to the bucket to allow authenticated users to INSERT (upload) and SELECT (read).
4.  Go to **Settings > API** and copy:
    *   Project URL
    *   `anon` public key

### 2. Environment Variables

Create a `.env` file in the root (or use your deployment platform's env vars):

```bash
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
```

### 3. Install & Run

```bash
npm install @supabase/supabase-js lucide-react react react-dom
npm install -D tailwindcss postcss autoprefixer vite @vitejs/plugin-react typescript @types/react @types/react-dom

# Start Development Server
npm run dev
```

(Note: If you are using this code in a fresh folder, you will need to initialize a `package.json` and `vite.config.ts`. See below for standard configuration).

### 4. Manual Testing

1.  Open the app in Browser Window A. Sign up as `user1@test.com`.
2.  Open Incognito Window B. Sign up as `user2@test.com`.
3.  In Window A, click "+", enter `user2@test.com` to start a chat.
4.  Type a message. Window B should see it instantly.
5.  Type in Window B. Window A should see "Someone is typing...".
6.  Upload an image.

## Deployment (Vercel)

1.  Push code to GitHub.
2.  Import project into Vercel.
3.  Set the Framework Preset to **Vite**.
4.  Add the Environment Variables defined above.
5.  Deploy.

## Future Improvements

*   Push Notifications (Supabase Edge Functions).
*   Read Receipts (Update message row with `read_at`).
*   Group Chat Management (UI to add participants).
