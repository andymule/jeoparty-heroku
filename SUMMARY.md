# Jeoparty - Technical Summary

## Architecture Overview

Jeoparty is a real-time multiplayer Jeopardy-style game with a client-server architecture.

### Backend Components

- **Node.js**: Core runtime for the server
- **Express**: Web framework for API endpoints
- **Socket.io**: Real-time bidirectional communication
- **In-memory Dataset**: Loads Jeopardy questions from TSV file at startup
- **Natural, String-Similarity**: Libraries used for answer validation

### Frontend Components

- **React**: UI framework
- **React Router**: Navigation between game views
- **Socket.io Client**: Realtime client-server communication
- **Styled Components**: CSS-in-JS for styling

### Hosting Infrastructure

- **Heroku**: Cloud platform for hosting the application
- **Node.js Buildpack**: Heroku deployment environment

## File Structure

- `server/`: Backend Node.js application
  - `index.js`: Main server entry point
  - `db.js`: In-memory data handling
  - `utils/`: Helper functions
  - `tests/`: Server-side tests
- `client/`: Frontend React application
  - `src/`: Source code
    - `components/`: Reusable UI components
    - `pages/`: Main application views
    - `context/`: React context providers
    - `utils/`: Helper functions
  - `public/`: Static assets
- `data/`: Contains the Jeopardy question dataset

## Key Features

### Game Creation and Management
- Randomly generates Jeopardy boards from historical question data
- Handles room creation with unique room codes

### Real-time Gameplay
- Synchronizes game state across all connected players
- Implements buzzer system with timing controls
- Tracks scores and game progression

### Answer Validation
- Fuzzy matching for player answers
- Handles variations in spelling and phrasing

### Responsive Design
- Desktop view for game hosts showing the board
- Mobile view for players with buzzer functionality

## Data Flow

1. Host creates a new game, generating a room code
2. Players join using the room code
3. Host starts the game, triggering board generation
4. Players select questions and buzz in to answer
5. Server validates answers and updates scores
6. Game progresses through rounds until completion

## Security Considerations

- Input validation for all user inputs
- Rate limiting for API endpoints
- No persistent user data stored