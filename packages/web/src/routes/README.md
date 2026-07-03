# Routes

[lets.church](https://lets.church) uses TanStack Router with file-based routing. Here is the basic structure:

```
src/routes
├── __root.tsx
├── _main
│   ├── index.tsx
│   ├── dashboard
│   │   └── index.tsx
│   ├── dashboard.tsx
│   └── media
│       └── index.tsx
└── _main.tsx
```

- `__root.tsx`: Wraps all routes
- `_main.tsx` is a [Pathless Layout Route](https://tanstack.com/router/latest/docs/framework/react/routing/routing-concepts#pathless-layout-routes) which wraps everything in `_main/`.
  - `_main/index.tsx` renders at `/`
  - `_main/media/index.tsx` renders at `/media`
  - etc
- `_main/dashboard.tsx` is the dashboard layout; it nests inside `_main` (so it
  shares the main app's chrome/design language) and wraps everything in
  `_main/dashboard/`.
  - `_main/dashboard/index.tsx` renders at `/dashboard`
  - `_main/dashboard/admin_.organizations.tsx` renders at
    `/dashboard/admin/organizations` (trailing `_` segments opt individual
    sub-trees out of intermediate layout nesting, not out of `_main`)
