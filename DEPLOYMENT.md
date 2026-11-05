# Heritage Atlas deployment setup

The public Vercel site serves the React app and serverless API routes. Without database credentials, public sample records are available, but new contributions cannot be stored and the review queue stays unavailable.

## Enable persistent contributions and review

1. Create a MongoDB Atlas database and allow network access from Vercel (Atlas network access must permit Vercel’s serverless connections).
2. In Vercel, open **heritage-atlas-mvp → Settings → Environment Variables**.
3. Add `MONGODB_URI` for Production using the Atlas connection string. Keep the password in Vercel; do not commit it to this project.
4. Generate a separate reviewer secret locally with `openssl rand -hex 32`. Add it as `REVIEWER_API_KEY` in Vercel Production. Do not put it in frontend code.
5. Redeploy the latest Production deployment so the functions receive both variables.

The reviewer page at `/` → **Review** asks for the key and keeps it in page memory only. API requests require `x-reviewer-key`; the API only lists restricted pending submissions. Approval requires recorded consent and changes a record to public. Rejection keeps it restricted.

## Local MongoDB and model library

The local Studio stores original `.glb` and `.skp` files in MongoDB GridFS and keeps a metadata record for each file. Saved models can be linked to a heritage record and reloaded from the Studio. The project uses a separate, ignored `./.local-mongodb` data folder so it does not touch another MongoDB database on the Mac.

Start the local database and app in separate terminals:

```bash
mkdir -p .local-mongodb
mongod --dbpath .local-mongodb --bind_ip 127.0.0.1 --port 27017
```

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/heritage_atlas_local npm run server
```

```bash
npm run dev
```

Open `http://127.0.0.1:5173/studio`. The first API request seeds the nine source-linked heritage records idempotently. The user-provided duplicate Ugratara rows are merged, unsupported claims are omitted, and placeholder `example.com` image/model URLs are stored as empty fields. The public Vercel deployment cannot connect to this Mac’s local database; persistent model storage is available from the local app only.

The server binds to `127.0.0.1`, accepts local Studio requests, and caps model uploads at 150 MB. MongoDB stores original files in GridFS; the browser creates a separate optimized preview for rendering. Without `MONGODB_URI`, contributions are demo-only and model storage is unavailable.

## 3D models and guide

The 3D studio creates an illustrative procedural pagoda in the browser. It can preview native `.skp` files and binary `.glb` files locally; imported files are processed in the browser and are not uploaded or retained. A background worker deduplicates materials and combines compatible static mesh parts before rendering complex models; animated or skinned GLBs keep their original structure. Import size is capped at 150 MB to avoid exhausting browser memory. The guide is a rule-based, source-cited demo over the sample records, not an LLM. Verify illustrative records with local communities before presenting them as authoritative heritage documentation.
