# Americano Matchmaker

A mobile-first React web app for running padel Americano sessions.

## Live app

[Americano Matchmaker Live App](https://castrix.github.io/americano-match/)

## Features

- Player roster management with quick add/remove
- Court count controls with step buttons
- Fair match generation that minimizes repeated partners/opponents
- Auto-round generation to help equalize turns across players
- Rest rotation balancing so everyone gets court time
- Score entry with +/- controls and auto-saved per match
- In-match turn tracker (1-21), serve block, and serve side reminder
- Live leaderboard with points, wins, losses, and point differential
- Skill level selector (1-5) to tune pace assumptions
- Estimated total duration based on skill level, courts, and rounds
- Read-only share links via compressed URL state
- Share modal with copy link action and PNG snapshot export
- Local browser persistence so sessions survive page refreshes
- Read-only session mode when opening shared URLs

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
