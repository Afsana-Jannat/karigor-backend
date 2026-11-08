POST /api/v1/auth/request-otp
POST /api/v1/auth/verify-otp
POST /api/v1/auth/register
POST /api/v1/auth/login/request-otp
POST /api/v1/auth/login/verify-otp
POST /api/v1/auth/logout
GET /api/v1/auth/check-auth

Rabbi
(Jobs/bid/contract)
POST /api/v1/jobs
GET /api/v1/jobs
GET /api/v1/jobs/open
POST /api/v1/bids/:id/bid
POST api/v1/jobs/:id/bids/:bidId/select

Technician recommendations (RAG chat)
--------------------------------------
Configure `OPENROUTER_API_KEY`, `OPENROUTER_CHAT_MODEL`, and
`OPENROUTER_EMBEDDING_MODEL` in `.env`. The `technician_embeddings` table is
created by Prisma migrations.

An admin can build or refresh embeddings for all active, verified technicians:
`POST /api/v1/chat/reindex`

The server also refreshes technician embeddings automatically every night at
12:00 AM Bangladesh time. Keep one backend instance running for the scheduled
job to execute once per day.

An authenticated customer can ask for technician recommendations:
`POST /api/v1/chat` with `{"message":"Need a plumber in Mirpur"}`. Include the
returned `sessionId` in later requests to continue the same conversation.

Demo database seed
------------------
Run `npx prisma db seed` to create or update one demo customer and ten verified
technicians, then index all active, verified technicians for RAG chat. The seed
uses fixed demo phone numbers and is safe to rerun; it does not delete existing
users or other database records. OpenRouter embedding configuration is required
for the indexing step.
