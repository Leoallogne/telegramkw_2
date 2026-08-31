# Telegram v2 - Real-time Chat Application

**Status**: 🟢 Production Ready (Phase 1-6 Complete)

A modern real-time chat application built with Next.js, React 19, and Supabase. Features include guest/admin authentication, group chats, peer-to-peer calling, web notifications, and more.

## ✨ Features

### Core Chat Features
- 👥 **Guest & Admin Authentication** - Flexible user roles
- 💬 **Real-time Messaging** - Powered by Supabase Realtime
- 👨‍👩‍👧 **Group Chats** - Create and manage groups
- 🤝 **Friendships** - Add and manage contacts
- 🔔 **Web Notifications** - Browser push notifications with throttling
- ✍️ **Typing Status** - See when others are typing
- 📱 **Online Status** - Presence tracking

### Advanced Features
- 📞 **Voice & Video Calls** - WebRTC peer-to-peer calling
- 😊 **Emoji Reactions** - React to messages
- 📝 **Message Editing** - Edit sent messages
- 🗑️ **Message Deletion** - Delete messages
- 👁️ **Read Receipts** - See when messages are read
- 🔐 **Password Reset** - Admin password management
- 🎮 **Admin Dashboard** - User management and testing tools

### Quality of Life
- 🎨 **Responsive Design** - Works on desktop and mobile
- 🌙 **Dark Mode Support** - CSS-based theming
- 📴 **Offline Detection** - Graceful offline handling
- ⚡ **Optimized Performance** - Code splitting and lazy loading
- 🛡️ **Security** - RLS policies and auth guards

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account
- npm or yarn

### Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd telegram-v2

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials:
# NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon_key]

# 4. Initialize database schema
# - Open Supabase SQL Editor
# - Run schema.sql from root directory

# 5. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## 📚 Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment guide
- **[AGENTS.md](./AGENTS.md)** - AI agent configuration
- **[schema.sql](./schema.sql)** - Database schema
- **[next.config.mjs](./next.config.mjs)** - Next.js configuration

## 🏗️ Architecture

### Project Structure
```
telegram-v2/
├── app/              # Next.js App Router
│   ├── layout.js     # Root layout with providers
│   ├── page.js       # Home page & auth gate
│   └── globals.css   # Global styles
├── components/       # React components
│   ├── ChatWindow.jsx     # Main chat component
│   ├── MessageBubble.jsx  # Message display
│   ├── MessageInput.jsx   # Message composer
│   └── GuestLoginForm.jsx # Auth component
├── hooks/            # Custom React hooks (Phase 5)
│   ├── useCallState.js    # Call state management
│   ├── useNotification.js # Notification handling
│   └── useWebRTC.js       # WebRTC operations
├── lib/              # Utilities
│   └── supabaseClient.js  # Supabase client setup
├── public/           # Static assets
│   └── sw.js         # Service worker
├── scripts/          # Utility scripts
├── schema.sql        # Database schema
└── package.json      # Dependencies
```

### Technology Stack
- **Frontend**: Next.js 16, React 19, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Realtime)
- **Communication**: WebRTC (calls), Supabase Realtime (messages)
- **Notifications**: Web Notification API, Service Worker
- **Icons**: lucide-react

## 🔄 Development Phases

| Phase | Focus | Status |
|-------|-------|--------|
| 1-2   | Notification Stabilization | ✅ Complete |
| 3-4   | Call & WebRTC Reliability  | ✅ Complete |
| 5     | Code Organization & Hooks  | ✅ Complete |
| 6     | Deployment Readiness       | ✅ Complete |

## 📋 Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Run ESLint
```

## 🧪 Testing

### Manual Testing
1. Open app in 2 browser tabs
2. Login as different users
3. Send messages and verify real-time sync
4. Test calls with both tabs
5. Test notifications

### Smoke Tests
Use the built-in Testing Tools in settings:
- Notification Preview
- Sound Test
- Realtime Smoke Test

## 🔒 Security Features

- **Row Level Security (RLS)** - PostgreSQL security policies
- **Authentication** - Supabase Auth with JWT
- **HTTPS Only** - Required for production
- **Environment Secrets** - Never committed to repo
- **CORS Protection** - Handled by Supabase

## 🐛 Troubleshooting

### WebRTC Calls Not Working
1. Check browser DevTools console
2. Verify both users are connected
3. Try audio-only instead of video
4. Check firewall/NAT settings

### Notifications Not Showing
1. Check notification permission
2. Verify service worker is registered
3. Try notification preview test
4. Check browser settings

### Messages Not Syncing
1. Check internet connection
2. Verify Supabase realtime enabled
3. Check RLS policies
4. Try refreshing page

See [DEPLOYMENT.md](./DEPLOYMENT.md#-troubleshooting) for more solutions.

## 📈 Performance

- **Page Load**: ~2-3 seconds (optimized)
- **Message Send**: ~100-200ms (realtime)
- **Call Connect**: ~3-5 seconds (ICE gathering)
- **Bundle Size**: ~300KB gzipped

## 🎯 Future Improvements

- [ ] Message pagination (infinite scroll)
- [ ] File sharing with cloud storage
- [ ] Message search
- [ ] Voice messages
- [ ] Screen sharing
- [ ] End-to-end encryption
- [ ] Mobile native app (React Native)

## 📜 License

This project is open source and available under the MIT License.

## 👥 Contributing

Contributions are welcome! Please follow the existing code style and submit pull requests to the main branch.

## 📞 Support

For issues and questions:
1. Check [DEPLOYMENT.md](./DEPLOYMENT.md#-troubleshooting)
2. Review browser console for errors
3. Check Supabase dashboard for service status
4. Create an issue on GitHub

---

**Made with ❤️ using Next.js, React, and Supabase**

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
