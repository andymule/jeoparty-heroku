# Jeoparty! 🎮

A multiplayer Jeopardy-style game where a host displays the game board on a desktop computer while players join and buzz in using their mobile devices.

## Features

- **Device-specific experience**: Desktop hosts the game board, mobile devices act as buzzers
- **Real-time gameplay**: WebSockets for instant player interactions
- **Speech recognition**: Answer questions by speaking
- **Multiplayer**: Multiple players can join a game room
- **Score tracking**: Keep track of player scores
- **Authentic gameplay**: Based on the classic Jeopardy format

## Tech Stack

- **Frontend**: React with styled-components
- **Backend**: Node.js with Express
- **Real-time Communication**: Socket.io
- **Database**: PostgreSQL

## Getting Started

### Prerequisites

- Node.js (v14+)
- PostgreSQL
- Jeopardy questions dataset (optional - sample questions included)

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

3. Set up the database:
   - Create a PostgreSQL database named "jeoparty"
   - Update `.env` file with your database credentials

4. Import Jeopardy questions (optional):
   - Download the dataset from [jwolle1/jeopardy_clue_dataset](https://github.com/jwolle1/jeopardy_clue_dataset)
   - Place the combined_season1-40.tsv file in the data directory
   - Run the import script:
   ```
   cd server
   npm run import-data
   ```

### Running the Application

1. Start the server:
   ```
   cd server
   npm run dev
   ```

2. Start the client:
   ```
   cd client
   npm start
   ```

3. Access the application:
   - Main game board (host): http://localhost:3000
   - Connect players by sharing the room code displayed on the host screen

## Deployment to Heroku

1. Create a new Heroku app:
   ```
   heroku create jeoparty-app
   ```

2. Add PostgreSQL add-on:
   ```
   heroku addons:create heroku-postgresql:hobby-dev
   ```

3. Configure build settings:
   ```
   heroku config:set NPM_CONFIG_PRODUCTION=false
   heroku config:set NODE_ENV=production
   ```

4. Deploy the application:
   ```
   git push heroku main
   ```

5. Import the dataset:
   ```
   heroku run bash
   cd server
   npm run import-data
   ```

## Acknowledgements

- [jwolle1/jeopardy_clue_dataset](https://github.com/jwolle1/jeopardy_clue_dataset) for the comprehensive Jeopardy questions database
- Jeopardy! is a registered trademark of Jeopardy Productions, Inc.

## License

This project is intended for educational purposes. All Jeopardy data is owned by Jeopardy Productions, Inc. 