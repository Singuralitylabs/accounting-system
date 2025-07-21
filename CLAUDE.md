# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
yarn dev              # Start development server (Next.js)
yarn build            # Production build 
yarn start            # Production server
yarn lint             # ESLint checking
```

### Database
```bash
yarn db:types         # Generate TypeScript types from Supabase production schema
yarn db:types-local   # Generate TypeScript types from local Supabase
yarn db:seed          # Seed local development database
```

### Local Supabase (when running locally)
```bash
supabase start        # Start local Supabase services
supabase stop         # Stop local Supabase services
supabase reset        # Reset local database
```

## Architecture Overview

### Technology Stack
- **Framework**: Next.js 14 with App Router and TypeScript
- **Database**: PostgreSQL via Supabase with Row Level Security
- **UI**: Tailwind CSS + Mantine components
- **State**: Jotai atoms for global state, React hooks for local state
- **Auth**: Supabase Auth with Google OAuth (restricted to future-tech-association.org domain)

### Key Directories
- `app/components/` - Reusable React components organized by feature
- `app/actions/` - Next.js Server Actions for database operations
- `app/atoms/` - Jotai state atoms for global state management
- `app/utils/supabase/` - Database client utilities and helper functions
- `app/lib/database.types.ts` - Auto-generated TypeScript types from Supabase schema
- `supabase/` - Database migrations and local development configuration
- `docs/` - Comprehensive documentation (setup, specification, database design)

### Authentication & Authorization
- Three permission levels: `public` (regular users), `accounting` (finance team), `admin` (full access)
- Route protection via `middleware.ts` based on user roles
- Domain restriction: Only `@future-tech-association.org` accounts can log in
- User roles stored in `profiles.permission` column

### Database Architecture
- **Core entities**: `matters` (projects), `business` (revenue), `costs` (expenses), `profiles` (users)
- **Master data**: `select_options` table with hierarchical dropdown options
- **RLS policies**: Strict data access control based on user permissions and matter ownership
- **Automated features**: Timestamp triggers, change detection after submissions
- **Real-time**: Supabase subscriptions available for live updates

### State Management Patterns
- **Global master data**: `optionsAtom` (Jotai) for dropdown options loaded once
- **Authentication state**: `AuthProvider` context wrapping the app
- **Database client**: `SupabaseProvider` for server/client Supabase instances
- **Form state**: Mantine forms with local React state

### Server vs Client Components
- Database operations use Server Actions (`app/actions/`)
- Interactive UI components are Client Components (`'use client'`)
- Data fetching typically happens in Server Components
- Client components handle user interactions and real-time updates

### Business Logic
This is a Japanese case management system for Future Tech Promotion Association with:
- **Matter lifecycle**: Draft → Submitted to Accounting → Accounting Approved → Complete
- **Financial tracking**: Revenue (`business` table) and expenses (`costs` table) per matter
- **Team collaboration**: Team leaders can view all team matters
- **Change tracking**: Updates after submission are flagged for accounting review
- **Slack integration**: Notifications to matter owners

### Development Notes
- Run `yarn db:types-local` after schema changes to update TypeScript types
- All database operations should use RLS-aware patterns
- Japanese locale considerations (JST timezone, currency formatting)
- No formal testing framework - relies on TypeScript + ESLint + manual testing

### Important Files
- `middleware.ts` - Route protection and user role checking
- `app/components/providers/` - Context providers for auth, database, and UI
- `app/utils/supabase/editMatterInfo.tsx` - Core matter CRUD operations
- `docs/` directory contains comprehensive setup and specification documentation