# Jeoparty! 🎮

A multiplayer Jeopardy-style game where a host displays the game board on a desktop computer while players join and buzz in using their mobile devices.

## Features

- **Device-specific experience**: Desktop hosts the game board, mobile devices act as buzzers
- **Real-time gameplay**: WebSockets for instant player interactions
- **Speech recognition**: Answer questions by speaking
- **Multiplayer**: Multiple players can join a game room
- **Score tracking**: Keep track of player scores
- **Authentic gameplay**: Based on the classic Jeopardy format
- **In-memory dataset**: Uses the entire Jeopardy clue dataset without requiring a database

## Tech Stack

- **Frontend**: React with styled-components
- **Backend**: Node.js with Express
- **Real-time Communication**: Socket.io
- **Dataset**: In-memory using the combined_season1-40.tsv file (over 88,000 questions)

## Getting Started

### Prerequisites

- Node.js (v14+)
- Jeopardy questions dataset (required)

### Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd jeoparty
   ```

2. Install dependencies:
   ```
   # Install server dependencies
   cd server
   npm install
   
   # Install client dependencies
   cd ../client
   npm install
   ```

### Running the Application

1. Start the server and client:
   ```
      npm run dev
   ```

2. Access the application:
   - Main game board (host): http://localhost:3000
   - Connect players by sharing the room code displayed on the host screen

## How It Works

The Jeoparty application loads the entire Jeopardy clue dataset (combined_season1-40.tsv) into memory at startup. This provides:

- Fast access to all 88,000+ questions without database queries
- No database setup or maintenance required

## Deployment to Heroku

1. Create a new Heroku app:
   ```
   heroku create jeoparty-app
   ```

2. Configure build settings:
   ```
   heroku config:set NPM_CONFIG_PRODUCTION=false
   heroku config:set NODE_ENV=production
   ```

3. Deploy the application:
   ```
   git push heroku main
   ```

4. Ensure the dataset is included in your deployment:
   ```
   # Make sure the data/combined_season1-40.tsv file is tracked in git
   git add data/combined_season1-40.tsv
   git commit -m "Add Jeopardy dataset"
   git push heroku main
   ```

## Acknowledgements

- [jwolle1/jeopardy_clue_dataset](https://github.com/jwolle1/jeopardy_clue_dataset) for the comprehensive Jeopardy questions database
