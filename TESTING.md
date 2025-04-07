# Jeoparty Testing Documentation

This document outlines the testing approach for the Jeoparty game application, including setup instructions, test coverage, and details about the testing strategy.

## Testing Setup

### Server Tests

The server-side tests use the following technologies:
- **Jest**: The testing framework
- **Supertest**: For testing HTTP endpoints
- **Socket.io-client**: For testing WebSocket functionality

The tests are configured in the `server/package.json` file with the script:
```json
"test": "jest --detectOpenHandles"
```

### Client Tests

The client-side tests use:
- **Jest**: The testing framework
- **React Testing Library**: For testing React components
- **jest-dom**: For additional DOM testing assertions

The tests are configured in the `client/package.json` file with the script:
```json
"test": "react-scripts test"
```

## Running Tests

### Server Tests

To run the server tests:
```
cd server
npm test
```

### Client Tests

To run the client tests:
```
cd client
npm test
```

For a single run without watch mode:
```
cd client
npm test -- --watchAll=false
```

## Test Coverage

### Server Tests

The server tests cover:

1. **Database Module** (`db.test.js`):
   - Creating database tables
   - Handling existing data

2. **Helper Functions** (`helpers.test.js`):
   - Room code generation
   - Fetching random categories
   - Generating the game board

3. **Socket.io Communication** (`socket.test.js`):
   - Creating a game
   - Joining a game
   - Buzzing in
   - Starting a game

4. **API Endpoints** (`api.test.js`):
   - Testing basic endpoint responses
   - Testing category retrieval

### Client Tests

The client tests cover:

1. **PlayerList Component** (`PlayerList.test.js`):
   - Rendering player list with proper names and scores
   - Sorting players by score
   - Highlighting buzzed players
   - Handling empty state

2. **GameControls Component** (`GameControls.test.js`):
   - Showing appropriate buttons based on game state
   - Disabling buttons when appropriate
   - Handling button clicks
   - Displaying game status information

## Mocking Strategy

### Server Mocks

- **Database**: The PostgreSQL database is mocked to avoid requiring a real database for tests
- **Socket.io**: Socket connections are created in-memory for testing
- **File System**: File operations are mocked to avoid reading real files

### Client Mocks

- **Socket.io-client**: The WebSocket client is mocked to avoid real connections
- **localStorage**: Browser storage is mocked for tests
- **SpeechRecognition**: The Web Speech API is mocked for tests

## Future Test Improvements

1. **Increase Coverage**:
   - Add tests for additional components
   - Add integration tests that test complete workflows

2. **End-to-End Testing**:
   - Add Cypress or Playwright tests for full end-to-end testing
   - Test complete game flows from host creation to game completion

3. **Performance Testing**:
   - Add tests to verify the application performs well with many concurrent players
   - Test performance with large question datasets

## Running Tests in CI/CD

For continuous integration, add the following commands to your CI/CD pipeline:

```bash
# Install dependencies
npm ci

# Run server tests
cd server
npm test

# Run client tests
cd client
npm test -- --watchAll=false
```

This will ensure that tests are run automatically on each code push or pull request. 