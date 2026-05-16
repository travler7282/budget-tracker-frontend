# budget-tracker-frontend

Angular frontend for the Budget Tracker backend API.

## Stack

- Angular 21 (standalone components + router)
- Angular build/dev server (Vite-powered workflow)
- SCSS styling

## Features

- Login page using OAuth2 password flow against `/api/v1/auth/token`
- Token persistence in `localStorage`
- Auth interceptor for `Authorization: Bearer <token>`
- Route guard for protected dashboard route
- Dashboard call to `/api/v1/auth/me`

## Backend Integration

- Dev uses proxy: `/api/v1/*` -> `https://api.travler7282.com/budget-tracker/api/v1/*`
- Prod uses direct API base URL: `https://api.travler7282.com/budget-tracker/api/v1`

## Scripts

- `npm start` starts local dev server with proxy config
- `npm run build` builds production bundle
- `npm test` runs tests
- `npm run lint` runs formatting checks

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start app:

```bash
npm start
```

3. Open `http://localhost:4200`.

## License

MIT (see `LICENSE`).
