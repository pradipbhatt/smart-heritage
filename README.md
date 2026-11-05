# Smart Heritage

Smart Heritage is a community-centered digital archive for heritage places, stories, and traditions of Sudurpashchim, Nepal.

## Features

- Searchable heritage explorer with district and category filters
- Far West map with district boundaries, record markers, and four map styles
- Interactive 3D studio for procedural architecture and imported `.glb` / `.skp` models
- Source-aware heritage guide demonstration
- Community contribution and reviewer workflows
- Express API with MongoDB persistence

## Requirements

- Node.js 20 or newer
- MongoDB for persistent records, submissions, and the local 3D model library

## Local setup

```bash
npm install
cp server/.env.example server/.env
```

Set `MONGODB_URI` in `server/.env`, then run the API and Vite frontend in separate terminals:

```bash
npm run server
```

```bash
npm run dev
```

Open <http://localhost:5173>. The frontend can use sample records when the API or database is unavailable. See [DEPLOYMENT.md](DEPLOYMENT.md) for Vercel setup and [LOAD_TESTING.md](LOAD_TESTING.md) for the load-test tools.

## Map data and attribution

District shapes, points, and attribution details are documented in [public/data/README.md](public/data/README.md). OpenStreetMap tiles are provided by OpenStreetMap contributors.

## Important notes

- Never commit `.env` files or production credentials. Use the example files as templates.
- Heritage records and descriptions should be verified with local communities and cited sources before being treated as authoritative.
- The guide is a source-aware rule-based demonstration, not an LLM integration.
