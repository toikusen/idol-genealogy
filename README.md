# IdolGenealogy

A community-driven database for Japanese idol groups — tracking members, groups, companies, and their genealogical connections over time.

## What It Does

- Browse idol members with career timelines, group affiliations, and SNS links
- Explore group-to-group genealogy through interactive graph visualizations
- View company rosters and their group histories
- Submit and review member/group data proposals (community editing with admin approval)
- Birthdays, "wanted" data gaps, and contributor tracking

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Angular 19 (SSR + prerender) |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Hosting | Netlify |
| Styling | Tailwind CSS |
| Charts | Custom D3-based graph components |

## Pages

| Route | Description |
|---|---|
| `/` | Home — recent updates, birthdays |
| `/members` | Full member list |
| `/member/:id` or `/@handle` | Member detail page |
| `/group/:id` | Group detail + genealogy graph |
| `/company/:id` | Company page |
| `/wanted` | Data gaps the community wants filled |
| `/contributors` | Community contributors |
| `/guide` | Contribution guide |
| `/my-contributions` | Logged-in user's proposal history |
| `/admin` | Admin panel (role-gated) |

## Development

```bash
npm install
ng serve
```

Open http://localhost:4200

See [SETUP.md](./SETUP.md) for Supabase configuration and deployment instructions.

## Contributing

Data corrections and additions go through the proposal system — login with Google and submit edits from any member or group page. Admin users review and approve proposals.
