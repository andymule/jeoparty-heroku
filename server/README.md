# Jeoparty Server

This is the backend server for the Jeoparty game. It handles game creation, player connections, and game logic.

## Architecture

The server uses a modular architecture with the following components:

- `index-new.js`: Main entry point for the server, sets up Express, Socket.io, and routes
- `db.js`: Handles loading and querying the Jeopardy question dataset
- `utils/`: Utility modules
  - `answerChecker.js`: Handles answer validation with permissive matching
  - `gameLogic.js`: Core game logic functions
  - `socketHandlers.js`: Socket.io event handlers
- `routes/`: API routes
  - `api.js`: API endpoints for game creation, categories, etc.
- `tests/`: Test files

## Getting Started

1. Make sure you have the Jeopardy dataset file (`combined_season1-40.tsv`) in the `../data/` directory
2. Install dependencies:
   ```
   npm install
   ```
3. Run the server in development mode:
   ```
   npm run dev:new
   ```

## Available Scripts

- `npm start`: Run the old monolithic server
- `npm run dev`: Run the old monolithic server with live reloading
- `npm run start:new`: Run the new modular server
- `npm run dev:new`: Run the new modular server with live reloading
- `npm run runner:new`: Run the new server via the runner script
- `npm test`: Run tests
- `npm run test:db`: Run database module tests
- `npm run test:with-server`: Run tests with a running server

## Architecture Notes

### Game Flow

1. A host creates a game via the API or socket connection
2. Players join the game using a room code
3. The host starts the game
4. The host selects questions from the board
5. Players buzz in to answer questions
6. The host judges answers (automatic checking is also supported)
7. After all questions in a round are answered, the next round begins
8. At the end of Double Jeopardy, Final Jeopardy begins
9. Players submit wagers and answers for Final Jeopardy
10. The game ends and final scores are displayed

### Socket Events

Players and hosts communicate with the server via Socket.io events:

- `createGame`: Create a new game
- `joinGame`: Join an existing game
- `startGame`: Start the game
- `selectQuestion`: Select a question from the board
- `buzz`: Player buzzes in to answer
- `submitAnswer`: Submit an answer
- `judgeAnswer`: Host judges an answer
- And more...

## Testing

Tests use Jest and can be run with `npm test`. The tests are organized as follows:

- `db.test.js`: Tests for the database module
- `api.test.js`: Tests for the API endpoints
- `game-flow.test.js`: Integration tests for the game flow
- `socket.test.js`: Tests for socket communication
- `helpers.test.js`: Tests for helper functions 