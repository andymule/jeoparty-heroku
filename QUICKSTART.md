# Jeoparty Quick Start Guide

This guide will help you set up and run the Jeoparty application locally.

## Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- Git

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/jeoparty.git
cd jeoparty
```

2. Install dependencies:

```bash
npm install
cd client && npm install
cd ../server && npm install
cd ..
```

## Environment Setup

1. Create `.env.development` files:

Server:
```bash
# server/.env.development
PORT=5005
NODE_ENV=development
CORS_ORIGIN=http://localhost:3001
```

Client:
```bash
# client/.env.development
REACT_APP_SERVER_URL=http://localhost:5005
PORT=3001
```

## Running the Application

1. Start the application in development mode:

```bash
npm run dev
```

This will start both the server and client concurrently.

- Server will run on: http://localhost:5005
- Client will run on: http://localhost:3001

## Playing the Game

1. Open http://localhost:3001 in your desktop browser to create a new game.
2. After creating a game, you'll receive a game code.
3. Open http://localhost:3001 in a mobile browser or another tab, and enter the game code to join as a player.
4. Once all players have joined, start the game from the host view.

## Testing

To run tests:

```bash
cd server && npm test
```

## Troubleshooting

- If you encounter port conflicts, you can modify the port values in the `.env.development` files.
- If the client cannot connect to the server, ensure the `REACT_APP_SERVER_URL` in client's `.env.development` matches the server's address.

## Viewing the Jeoparty Dataset

The Jeoparty dataset is loaded into memory from `data/combined_season1-40.tsv` at server startup.

## Additional Scripts

- `npm run build`: Build the client for production
- `npm run dev:clean`: Clean up running Node.js processes and restart the development servers
- `npm start`: Start the production server (after building) 