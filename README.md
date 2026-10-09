# Neerdrishti — Flood Digital Twin

Bharat Builds Event 2 — Heat and Water track.

Real-time waterlogging detection + prediction + response coordination for Indian cities, starting with Delhi/Ghaziabad.

## Status

**MVP v0 — skeleton only.** The inference Lambda currently returns a RANDOM
classification (see `backend/lambdas/inference/handler.py`) to prove the
pipeline works end-to-end before the real ML model is plugged in. Keep this
section updated as that changes — an out-of-date README cost us points last
hackathon.

- [ ] Real CV model (perception/) — not yet connected
- [ ] Prediction graph (prediction/) — not yet connected
- [ ] Strands agents + Bedrock (agents/) — not yet built
- [ ] Real dashboard (frontend/) — placeholder table only

## Project structure

```
infra/        SAM template, deploy config
backend/      Lambda handlers + shared code
perception/   CV model training (Person A)
prediction/   Graph/risk model (Person B)
agents/       Strands agents + Bedrock (Person D)
frontend/     React dashboard (Person C)
docs/         API contract, architecture notes
```

## Setup

### Prerequisites
- AWS CLI configured (`aws configure`)
- AWS SAM CLI
- Docker (SAM uses it to build Lambda containers)
- Node.js 18+
- Python 3.12

### Deploy the backend

```bash
cd infra
sam build
sam deploy --guided
```

Note the `ApiUrl` output — you'll need it for the frontend.

### Run the frontend

```bash
cd frontend
npm install
cp .env.example .env
# edit .env, set VITE_API_BASE to the ApiUrl from sam deploy
npm run dev
```

### Test the pipeline manually

```bash
# 1. Get an upload URL
curl -X POST https://YOUR_API_URL/frames/upload-url \
  -d '{"street_id":"ghz-014","lat":28.6692,"lng":77.4538,"source":"citizen"}'

# 2. Upload a photo using the returned url + fields (see docs/api-contract.md)

# 3. Check it landed
curl https://YOUR_API_URL/streets
```

## Team

- Person A — Perception (CV model, data)
- Person B — Prediction & backend
- Person C — Frontend / design
- Person D — Agents, AWS deployment, alerts
