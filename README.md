# 🎬 Music Licensing Workflow Challenge

## 🛠️ Tech Decisions & Trade-offs

This project was built as part of a technical challenge for a position that requested a stack based on **NestJS** and **Next.js**.  

My background is mainly with **Vue** on the frontend and **Django/Express** on the backend, but for this challenge I wanted to stick to the tools they use. It was a good opportunity to get hands-on with Nest and Next, and to show that I can adapt quickly to new stacks.

Because this stack came with a learning curve for me, some parts of the implementation were approached with pragmatism—balancing learning, speed, and quality. My main goal was to meet the requirements while keeping the code as clear and maintainable as possible, knowing there’s always room to improve with more time and experience on this stack.

## 📐 Implementation Overview

### 🎨 Frontend
- **Movies list** – shows all movies in the system.  
- **Movie detail view** with:
  - Scene creation  
  - Track creation  
  - Track status update  
  - Track–Song association  
- **Real-time updates** – the UI reacts instantly to **scene creation**, **track creation**, **track–song association**, and **status changes** via GraphQL subscriptions.

### 🔌 Real-time events
The frontend subscribes to domain events so all users see changes immediately:
- **SCENE_CREATED** – a new scene is added to a movie.
- **TRACK_CREATED** – a new track is added to a scene.
- **TRACK_SONG_SET** – a song gets linked to a track.
- **TRACK_STATUS_UPDATED** – licensing workflow updates.

These are delivered through GraphQL Subscriptions.

### 📊 Why GraphQL (kept simple)

I used **GraphQL only** to keep the project small and consistent:

- **One schema, one client**: queries, mutations, and subscriptions share the same types definitions.
- **Real-time built-in**: subscriptions handle scene/track creation, song association, and status changes without extra plumbing.
- **No over/under-fetching**: nested data (movie → scenes → tracks → songs) comes in exactly the shape the UI needs.

### ⚙️ Backend
- **PostgreSQL database**
- **GraphQL API** – chosen instead of REST to simplify the schema, leverage type safety, and support real-time GraphQL Subscriptions.  

### 📦 Containerization
- **Docker & Docker Compose** – one command to run the full stack (frontend, backend, and database).

### ✅ Unit Tests

All backend unit tests live under `backend/test/`.

#### Naming convention

Tests follow a naming convention of `<resolver>.<method>.spec.ts` for unit tests that focus on a single resolver method.

Example:  
- `track.resolver.setTrackSong.spec.ts` → tests only `setTrackSong` in `TrackResolver`.

#### Running tests

Run **all tests**:
```bash
cd backend
npm test
```

### 🧪 UI Tests

The UI tests validate that the main user flows exist and are actionable **without mutating the database**.  
They currently cover:

- **Movies list**: renders seeded movies with stable IDs and titles (`Inception`, `The Dark Knight`).  
- **Movie detail**:  
- **Associate Song**: opens the editor, lists seeded songs, enables **Save** when a song is selected, then **cancels**.  
- **Change Status**: opens the editor, allows changing the status and enables **Save**, then **cancels**.  
- Ensures seeded state (e.g., `Inception` title, scenes, and `Time — Hans Zimmer` track with its initial status) remains unchanged after the run.

#### Rationale

To keep E2E tests stable and repeatable, they currently simulate user actions but do not persist changes in the database.
In the future, a mutating variant with automatic cleanup could be added to exercise the full workflow end-to-end.

#### Running tests

Run **all tests**:
```bash
cd frontend
npm run test:ui
```

#### ⚠️ Important

UI tests depend on the seeded movies **Inception** and **The Dark Knight**.  
- Do not modify or delete these seeds if you want the tests to pass.  
- If you change them, reset the database (drop & reseed) before running the tests again.

### 🔮 Future Improvements

- **Optimize nested queries with DataLoader** – current resolvers may suffer from the **N+1 query problem** (e.g. fetching scenes for each movie separately). Using [DataLoader](https://github.com/graphql/dataloader) would batch and cache requests, turning multiple small queries into a single query, improving performance on deeply nested queries (movies → scenes → tracks → songs).
- **Optimize updates on the frontend** – currently, after a real-time event (like a track status change), the app does a full refetch of the list. A better approach would be to update only the affected item (e.g., insert a new track, update a status field) so the UI feels instant and uses less network.
- **CRUD completeness** – extend functionality to cover creation and modification of movies, modification of scenes, modification of tracks, and creation/modification of songs.
- **Testing improvements** – add more unit and integration tests, expand UI tests, and integrate both into an **automated CI pipeline with GitHub Actions** to ensure stability
- Improve error handling and input validation.    
- Add pagination, search, and filtering for large datasets.
- **Scale real‑time with Redis (Pub/Sub)** – use Redis as the subscriptions backplane so events fan out across multiple backend instances; optionally cache hot queries (e.g., movies list).
- **Domain event streaming with Kafka** - (durable log, multiple consumers, replay & audit trail).
- **Indexes**: No extra indexes were added because the dataset is small and the focus was on functionality. 
- **Entities and GraphQL Types** - For simplicity, this project reuses the same classes for both. If the domain evolves (e.g., entity shape diverges from API shape), adding dedicated DTOs and mappers would improve maintainability and safety.

### 🔮 GenAI Extension – Track AI Insights

As an extension to the challenge, I added AI-powered insights for **tracks** using the OpenAI API.

⚠️ To test the GenAI extension you need an OpenAI API key.
The setup steps (see **Environment Variables** under **🚀 Setup**) explain how to configure it. 
If you don’t have one, contact me and I can provide a temporary key for reviewing purposes.

#### What It Does
- **New REST endpoints**:
  - `POST /tracks/insights/generate/all` → generate insights for all eligible tracks (those without insights yet).
  - `POST /tracks/insights/generate/for-movie/:movieId` → same, filtered by movie.
  - `POST /tracks/insights/generate/for-track/:trackId` → generate insights for a specific track.
- **Persistence**: each insight stores `summary`, an optional `licenseSuggestion`, along with `provider` and `model`.
- **Events**: emits a `TRACK_INSIGHTS_CREATED` event per movie so the frontend can update in real-time.
- **Validation** of the LLM output using **Zod**:
  - `trackId` (string, required, must match the requested track)
  - `summary` (string, required, max 255 chars)
  - `licenseSuggestion` (string, optional, max 255 chars, normalized to `null` if missing)

#### Tech Decisions
- Chose gpt-4o-mini for cost-efficiency and low latency. The task requires only short structured outputs (summaries + optional suggestions).
- Used `json_schema` response format so the model is constrained to output only valid JSON according to the schema (no extra text or malformed fields).
- Applied Zod validation as a final guardrail before persisting, ensuring consistency and giving meaningful error reporting.
    - ⚠️ This means the schema is defined **twice** (once for OpenAI, once in Zod), but I prefer this duplication: it enforces correctness at two layers and keeps both the prompt contract and the runtime validation explicit.
- No concurrency or retry logic implemented to keep the extension simple.

#### Future Improvements

1. More validations:
    - Validate `trackId` as UUID.
    - Add stricter normalization (trim strings, enforce formats).
    - Enforce DB uniqueness with upsert to guarantee idempotency.
2. Concurrency:
    - Process tracks in parallel with a bounded pool (e.g. 3 at a time).
3. Workers / Async jobs:
    - Offload generation to a job queue (e.g., BullMQ + Redis).
    - Endpoints return immediately, jobs run in the background.
    - Useful for retries, backoff, and not blocking HTTP.
    - Run after track / song association.
4. Scheduled jobs (CRON):
    - Run daily or periodic jobs to auto-generate insights (e.g., every night at 03:00).
    - Removes the need for manual frontend buttons.
5. Rate limiting strategies
    - Introduce bounded concurrency to balance throughput vs. API limits.
    - Consider batching multiple tracks per request (trade-off: higher token usage, harder validation).
    - Use workers with retries/backoff to handle 429 Too Many Requests gracefully.
5. Observability:
    - Per-request timeouts (e.g., 5s).
    - Structured logging and metrics (processed/created/errors).


## 📋 Requirements
- Docker & Docker Compose

---

## 🚀 Setup

### Environment Variables

The project requires an **OpenAI API key** to generate AI insights.  
An `.env.example` file is provided — copy it and set your own key:

```bash
cp .env.example .env
```

Then edit .env and add your OpenAI API key:

```bash
OPENAI_API_KEY=sk-...
```

⚠️ Do not commit .env with real secrets. Only .env.example should be versioned.

1. **Build & start services**
    
    `docker compose up --build`

    Services available:
    - **Frontend** → http://localhost:3000  
    - **Backend** → http://localhost:3001
    - **Postgres** → localhost:5432

2. **Seed the database**
    
    `docker compose exec backend npm run seed:data`

3. **Stop the services**
    
    `docker compose down`

4. **Reset the database (if needed)**
    
    `docker compose down -v`

---

## 🗒️ Notes
- An `.env.example` file is included. Copy it to `.env` and set your OpenAI API key.
- Database data is persisted in the `db_data` volume.
