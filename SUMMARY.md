# Jeoparty: Project Architecture and Overview

## Introduction

Jeoparty is a multiplayer Jeopardy-style trivia game with a unique twist: it's designed for shared spaces where one device (desktop/laptop) serves as the game host displaying the main board, while multiple players join and play using their mobile devices as buzzers and answer interfaces.

## Technology Stack

### Backend
- **Node.js** with **Express**: Provides the server framework
- **Socket.io**: Enables real-time bidirectional communication
- **PostgreSQL**: Stores the Jeopardy questions and categories
- **pg-promise**: Efficiently handles database operations

### Frontend
- **React**: Build dynamic user interfaces
- **styled-components**: CSS-in-JS styling solution
- **react-router-dom**: Navigation and routing
- **Socket.io Client**: Real-time communication with server
- **Web Speech API**: Speech recognition for voice answering

### Infrastructure
- **Heroku**: Cloud hosting platform
- **Heroku PostgreSQL**: Database hosting

## Architecture

### Server Architecture
The server is designed around a standard Express application with Socket.io for real-time communication. The key components include:

1. **HTTP Server**: Handles API requests and serves static assets
2. **WebSocket Server**: Manages real-time game events and player interactions
3. **Game State Management**: Maintains in-memory game rooms with players and questions
4. **Database Access Layer**: Provides access to the Jeopardy questions dataset

### Client Architecture
The client is a React single-page application (SPA) with responsive design that adapts to different device types:

1. **Desktop View**: Shows the game board, categories, questions, and player scores
2. **Mobile View**: Provides the buzzer interface and answer submission functionality
3. **Device Detection**: Automatically detects device type and adjusts the interface
4. **Real-time Updates**: Keeps all clients synchronized using WebSockets

## Key Features

### Intelligent Device Detection
- Automatically detects whether a device is desktop or mobile
- Routes users to appropriate interfaces based on device type
- Prevents mobile devices from hosting games

### Real-time Gameplay
- Synchronizes game state across all connected devices
- Implements buzzer system with first-to-buzz priority
- Updates scores and board state in real-time

### Speech Recognition
- Allows players to answer questions by speaking into their device
- Transcribes speech to text using the Web Speech API
- Provides fallback to text input when speech recognition is unavailable

### Multiplayer Support
- Creates unique game rooms with shareable codes
- Supports multiple simultaneous games
- Handles player joining/leaving gracefully

### Host Controls
- Allows the host to start/end games
- Provides question selection interface
- Implements judging system for answers

## Game Flow

1. **Game Creation**: Host creates a new game and gets a unique room code
2. **Player Joining**: Players join the game by entering the room code on mobile devices
3. **Game Start**: Host starts the game, which generates the board with categories and questions
4. **Question Selection**: Host selects a question, which is displayed to all players
5. **Buzzing In**: Players race to buzz in first to answer the question
6. **Answer Submission**: The first player to buzz submits their answer by text or speech
7. **Answer Judging**: Host judges the answer as correct or incorrect
8. **Score Update**: Player scores are updated based on the judgment
9. **Game Continuation**: Process repeats until all questions are answered or game is ended
10. **Game End**: Final scores are displayed, and winner is determined

## Database Schema

The database has a simple structure centered around the questions table:

```
Table: questions
- id: SERIAL PRIMARY KEY
- round: INTEGER
- clue_value: INTEGER
- daily_double_value: INTEGER
- category: TEXT
- comments: TEXT
- answer: TEXT (The clue shown to contestants)
- question: TEXT (The expected response from contestants)
- air_date: DATE
- notes: TEXT
```

## Deployment Strategy

The application is designed for easy deployment to Heroku with the following features:

- **Procfile**: Configures the web process
- **package.json scripts**: Handles build process for production
- **Environment variables**: Configures different environments (dev/prod)
- **Database initialization**: Automatically sets up database tables
- **Responsive design**: Works on various screen sizes and devices

## Future Enhancements

1. **Daily Double Support**: Implement wagering for daily double questions
2. **Final Jeopardy**: Add a final Jeopardy round with wagering
3. **Custom Categories**: Allow hosts to create custom categories and questions
4. **Tournament Mode**: Support multiple rounds and tournament play
5. **Team Play**: Allow players to form teams
6. **Enhanced Analytics**: Track player statistics across multiple games
7. **Media Support**: Add image and video clues