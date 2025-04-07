# Jeoparty Quickstart Guide

This guide will help you get Jeoparty up and running on your local machine quickly.

## Quick Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd jeoparty
```

### 2. Install dependencies

Install all dependencies at once:

```bash
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..
```

### 3. Set up the database

Create a PostgreSQL database:

```bash
# Using psql
psql -U postgres
CREATE DATABASE jeoparty;
\q
```

Or using another PostgreSQL admin tool of your choice.

Update the `.env` file with your database credentials:

```
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://username:password@localhost:5432/jeoparty
```

Replace `username` and `password` with your PostgreSQL credentials.

### 4. Start development servers

This will start both the backend server and the React development server:

```bash
npm run dev
```

### 5. Access the application

- Host view (game board): http://localhost:3000
- Player view (buzzer): Open http://localhost:3000 on your mobile device

## Playing the Game

1. **Create a Game**: On a desktop/laptop, create a new game by entering your name and clicking "Create Game"
2. **Join the Game**: On mobile devices, enter the room code displayed on the host screen
3. **Start the Game**: The host can start the game once players have joined
4. **Select Questions**: The host selects questions from the board
5. **Buzz In**: Players use their mobile devices to buzz in when they know the answer
6. **Answer**: The first player to buzz in can submit their answer by typing or speaking
7. **Judge**: The host judges the answer as correct or incorrect

## Troubleshooting

### Database Issues

If you encounter database issues:

```bash
# Check if the database is running
psql -U postgres -d jeoparty -c "SELECT 1"

# Manually initialize the database
cd server
node -e "require('./db').initializeDB()"
```

### Connection Issues

If mobile devices can't connect:

1. Make sure your computer and mobile device are on the same network
2. Try using your computer's local IP address instead of localhost
3. Check if any firewall is blocking connections on port 3000 or 5000

### Loading Questions

If you want to load the full Jeopardy dataset:

1. Download from https://github.com/jwolle1/jeopardy_clue_dataset
2. Place the TSV file in the `data` directory
3. Run: `cd server && npm run import-data` 