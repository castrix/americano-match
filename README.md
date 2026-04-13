# Americano Matchmaker

A mobile-first React web app for running padel Americano sessions.

## Features

- Add players and set the number of courts
- Generate fair doubles matches dynamically
- Rotate resting players so everyone gets a turn
- Enter and keep scores for every round
- Live leaderboard with points, wins, and point differential
- Local browser storage so your session stays saved on the device

## Run locally

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
npm install
npm run dev
```

## Build for production

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
npm run build
```

## GitHub Pages

A workflow is included at `.github/workflows/deploy.yml`.

1. Push the repo to GitHub.
2. In GitHub, enable **Pages** for the repository.
3. The workflow will build and deploy the static app automatically from the `main` branch.
