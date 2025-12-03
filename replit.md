# DocuFlow - Internal Documentation Tool

## Overview

DocuFlow is a Notion-like documentation application designed for organizing tech projects with a rich block-based editor, nested page hierarchies, and collaborative features. The application enables teams to create, organize, and maintain structured documentation across multiple projects with an intuitive, content-first interface.

**Key Features:**
- Block-based TipTap editor with rich formatting, code blocks, task lists
- Nested page hierarchies with drag-and-drop reordering
- Image and video embeds (YouTube, Loom, Fathom)
- Full-text search across projects and pages
- AI-powered chatbot assistant (GPT-4.1-nano) with documentation as knowledge base
- Dark mode support
- Page templates (Client Project, Technical Solution)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- **React 18** with TypeScript for type-safe component development
- **Vite** as the build tool and development server with hot module replacement
- **Wouter** for lightweight client-side routing
- **TanStack Query** (React Query) for server state management, caching, and data synchronization

**UI Component System**
- **shadcn/ui** component library built on Radix UI primitives
- **Tailwind CSS** for utility-first styling with custom design tokens
- Design system follows Notion-inspired principles: content-first, spatial clarity, and productive efficiency
- Three-column layout: Sidebar (240px) → Page Tree (280px resizable) → Editor Canvas (fluid, max 860px)

**Rich Text Editor**
- **TiptapJS** for block-based editing with extensions:
  - StarterKit for basic formatting (bold, italic, headings, lists)
  - CodeBlockLowlight with syntax highlighting via lowlight
  - TaskList/TaskItem for checklist support
  - Image, Highlight, Color, TextAlign, Underline extensions
  - Custom slash command system for block insertion
- Auto-save functionality with debounced updates

**State Management Strategy**
- Server state: TanStack Query with disabled refetching (staleTime: Infinity)
- Local UI state: React hooks (useState, useContext)
- Authentication state: Query-based with 401 handling
- Form state: React Hook Form with Zod validation

### Backend Architecture

**Server Framework**
- **Express.js** with TypeScript running on Node.js
- HTTP server created via Node's `http` module for WebSocket support readiness
- Middleware stack: JSON parsing, URL encoding, request logging with timestamps

**Authentication & Session Management**
- **Replit Auth** via OpenID Connect (OIDC) integration
- **Passport.js** with openid-client strategy for OAuth flows
- Session storage using **connect-pg-simple** with PostgreSQL backend
- JWT tokens managed through OIDC token endpoint
- Session TTL: 7 days with httpOnly, secure cookies

**API Design Pattern**
- RESTful API endpoints under `/api` prefix
- Authentication middleware (`isAuthenticated`) protecting all routes
- Error handling with appropriate HTTP status codes (401, 403, 404, 500)
- Request/response logging with duration tracking

**Database Layer**
- **Drizzle ORM** for type-safe database operations
- Schema-first design with automatic TypeScript type inference
- Relations defined between users, projects, and documents
- Zod schemas generated from Drizzle schemas for validation

### Data Storage Solutions

**Primary Database**
- **Neon Serverless PostgreSQL** via `@neondatabase/serverless` driver
- WebSocket-based connection pooling for serverless compatibility
- Connection string configured via `DATABASE_URL` environment variable

**Database Schema Structure**

**Users Table**
- Stores Replit Auth user profile data
- Fields: id (UUID), email, firstName, lastName, profileImageUrl, timestamps
- Automatic user upsert on login (onConflictDoUpdate)

**Projects Table**
- Top-level organizational containers
- Fields: id (UUID), name, description, icon, ownerId (FK to users), timestamps
- Cascade deletion when owner is deleted
- Icon system with emoji representation

**Documents Table**
- Nested page hierarchy with self-referential parentId
- Fields: id (UUID), projectId (FK), parentId (nullable FK to self), title, content (JSONB), order (integer), timestamps
- Content stored as Tiptap JSON format in JSONB column
- Cascade deletion when project is deleted
- Order field for manual sorting within same parent

**Sessions Table**
- PostgreSQL session store for connect-pg-simple
- Fields: sid (primary key), sess (JSONB), expire (timestamp with index)
- Automatic session cleanup via TTL

**Object Storage**
- **Google Cloud Storage** integration via `@google-cloud/storage`
- Authentication using Replit Sidecar OAuth2 flow
- Access control system with ObjectAclPolicy interface
- Public/private visibility controls
- Support for user/group-based permissions (READ/WRITE)

### External Dependencies

**Third-Party Services**

**Replit Platform Services**
- Replit Auth (OIDC) for authentication
- Replit Sidecar for GCS credential provisioning
- Replit Vite plugins: runtime error overlay, cartographer, dev banner

**Google Cloud Platform**
- Google Cloud Storage for file/image storage
- External account credentials via token exchange

**Development Tools**
- TypeScript compiler with strict mode enabled
- ESBuild for server-side bundling in production
- Vite for client-side development and builds
- Drizzle Kit for database migrations

**Key NPM Packages**

**UI & Interaction**
- `@radix-ui/*` - 20+ accessible component primitives
- `@hello-pangea/dnd` - Drag and drop for page reordering
- `@tiptap/*` - Rich text editor extensions
- `lowlight` - Syntax highlighting with common language support
- `react-day-picker` - Calendar component
- `vaul` - Drawer component

**Data & Validation**
- `zod` - Runtime type validation
- `drizzle-zod` - Zod schema generation from Drizzle
- `date-fns` - Date formatting utilities

**Styling**
- `tailwindcss` with custom configuration
- `class-variance-authority` (cva) - Variant management
- `tailwind-merge` - Class name merging
- Google Fonts: Inter (UI), JetBrains Mono (code)

**Build & Development**
- `tsx` - TypeScript execution for Node.js
- `vite` with React plugin
- `esbuild` - Production server bundling
- `ws` - WebSocket support for Neon

**Design System Tokens**
- CSS variables for theme colors (light/dark mode support)
- Neutral-based palette inspired by Notion/Linear
- Consistent spacing scale: 2, 3, 4, 6, 8, 12, 16 (Tailwind units)
- Typography hierarchy with Inter for UI and system fonts for content
- Shadow system: 2xs, xs, sm, md, lg, xl, 2xl