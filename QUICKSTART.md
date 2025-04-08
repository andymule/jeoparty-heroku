# Quick Start Guide

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd jeoparty
```

### 2. Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 3. Configure Environment

Create a `.env` file in the server directory with the following content:

```env
PORT=5000
NODE_ENV=development
```

### 4. Start the Application

From the root directory, run:

```bash
npm run dev
```

This will start both the server and client in development mode.

### 5. Access the Application

- Main game board (host): http://localhost:3000
- Connect players by sharing the room code displayed on the host screen

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   If you see an error about the port being in use:
   ```bash
   # Find the process using the port
   lsof -i :5000
   
   # Kill the process (replace PID with the actual process ID)
   kill -9 PID
   ```

2. **Missing Dependencies**
   If you encounter dependency issues:
   ```bash
   # In both server and client directories
   rm -rf node_modules
   rm package-lock.json
   npm install
   ```

3. **Dataset Issues**
   If you encounter issues with the dataset:
   - Ensure the `data/combined_season1-40.tsv` file exists
   - Check file permissions
   - Verify the file is not corrupted

## Next Steps

- [ ] Create a game room
- [ ] Invite players to join
- [ ] Start a new game
- [ ] Enjoy playing Jeoparty! 