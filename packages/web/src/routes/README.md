# Routes

[lets.church](https://lets.church) uses TanStack Router with file-based routing. Here is the basic structure:

```
src/routes
├── __root.tsx
├── _main
│   ├── index.tsx
│   └── media
│       └── index.tsx
├── _main.tsx
├── dashboard_
│   └── index.tsx
└── dashboard_.tsx
```

- `__root.tsx`: Wraps all routes
- `_main.tsx` is a [Pathless Layout Route](https://tanstack.com/router/latest/docs/framework/react/routing/routing-concepts#pathless-layout-routes) which wraps everything in `_main/`.
  - `_main/index.tsx` renders at `/`
  - `_main/media/index.tsx` renders at `/media`
  - etc
- `dashboard_` is a [Non-Nested Route](https://tanstack.com/router/latest/docs/framework/react/routing/routing-concepts#non-nested-routes), which essentially means that it is not nested in the `_main.tsx` layout
  - `dashboard_.tsx` wraps everything in `dashboard_/`
  - `dashboard_/index.tsx` renders at `/dashboard`
