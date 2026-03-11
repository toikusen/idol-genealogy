# Setup Instructions

## 1. Supabase Project
1. Create a project at https://supabase.com
2. Go to SQL Editor and run the contents of `supabase/migrations/001_initial_schema.sql`
3. Go to Authentication > Providers > Google and enable Google OAuth
4. Add your deployment URL to Authentication > URL Configuration > Redirect URLs

## 2. Environment Configuration
Edit `src/environments/environment.ts` and `src/environments/environment.prod.ts`:
- Replace `https://placeholder.supabase.co` with your Supabase project URL
- Replace `YOUR_ANON_KEY` with your Supabase anon key (safe to expose — protected by RLS)

## 3. Development
```bash
npm install
ng serve
```
Open http://localhost:4200

## 4. Deploy to GitHub Pages
```bash
npm install -g angular-cli-ghpages
ng build --configuration production --base-href "/<repo-name>/"
npx angular-cli-ghpages --dir=dist/idol-genealogy/browser
```
