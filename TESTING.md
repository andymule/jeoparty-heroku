# Testing Guide

## Overview

This document outlines the testing strategy for the Jeoparty application. The application uses an in-memory dataset loaded from the TSV file, which simplifies testing by eliminating the need for a database.

## Test Structure

### 1. Dataset Loading Tests (`dataset.test.js`):
- Loading the TSV file into memory
- Parsing questions and categories
- Validating data structure

### 2. Game Logic Tests (`game-flow.test.js`):
- Game state management
- Player interactions
- Score tracking
- Round progression

### 3. Socket.io Tests (`socket.test.js`):
- Real-time communication
- Event handling
- Room management

### 4. Frontend Tests (`client/`):
- Component rendering
- User interactions
- Responsive design

## Running Tests

### Server Tests

```bash
cd server
npm test
```

### Client Tests

```bash
cd client
npm test
```

## Test Environment

The test environment is configured to:
- Use a mock dataset for testing
- Simulate WebSocket connections
- Test game logic without real-time constraints

## Writing New Tests

When adding new features, follow these guidelines:
1. Create a new test file in the appropriate directory
2. Use the existing test patterns
3. Include both success and failure cases
4. Test edge cases and error conditions

## Continuous Integration

Tests are automatically run on:
- Pull requests
- Main branch merges
- Scheduled runs

## Troubleshooting Tests

If tests fail:
1. Check the test output for specific error messages
2. Verify the dataset file is accessible
3. Ensure all dependencies are installed
4. Check for port conflicts in socket tests 