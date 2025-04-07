import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GameControls from '../GameControls';

describe('GameControls Component', () => {
  const mockStartGame = jest.fn();
  const mockEndGame = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('renders the controls with title', () => {
    render(
      <GameControls 
        gameState="waiting" 
        onStartGame={mockStartGame} 
        onEndGame={mockEndGame} 
        playersCount={2} 
      />
    );
    
    // Check if title is rendered
    expect(screen.getByText('Game Controls')).toBeInTheDocument();
  });
  
  test('shows Start Game button in waiting state', () => {
    render(
      <GameControls 
        gameState="waiting" 
        onStartGame={mockStartGame} 
        onEndGame={mockEndGame} 
        playersCount={2} 
      />
    );
    
    // Check if start game button is displayed
    const startButton = screen.getByText('Start Game');
    expect(startButton).toBeInTheDocument();
    
    // Check if end game button is not displayed
    expect(screen.queryByText('End Game')).not.toBeInTheDocument();
  });
  
  test('disables Start Game button when no players are present', () => {
    render(
      <GameControls 
        gameState="waiting" 
        onStartGame={mockStartGame} 
        onEndGame={mockEndGame} 
        playersCount={0} 
      />
    );
    
    // Check if start button is disabled
    const startButton = screen.getByText('Start Game');
    expect(startButton).toBeDisabled();
  });
  
  test('enables Start Game button when players are present', () => {
    render(
      <GameControls 
        gameState="waiting" 
        onStartGame={mockStartGame} 
        onEndGame={mockEndGame} 
        playersCount={2} 
      />
    );
    
    // Check if start button is enabled
    const startButton = screen.getByText('Start Game');
    expect(startButton).not.toBeDisabled();
  });
  
  test('shows End Game button in inProgress state', () => {
    render(
      <GameControls 
        gameState="inProgress" 
        onStartGame={mockStartGame} 
        onEndGame={mockEndGame} 
        playersCount={2} 
      />
    );
    
    // Check if end game button is displayed
    const endButton = screen.getByText('End Game');
    expect(endButton).toBeInTheDocument();
    
    // Check if start game button is not displayed
    expect(screen.queryByText('Start Game')).not.toBeInTheDocument();
  });
  
  test('shows End Game button in questionActive state', () => {
    render(
      <GameControls 
        gameState="questionActive" 
        onStartGame={mockStartGame} 
        onEndGame={mockEndGame} 
        playersCount={2} 
      />
    );
    
    // Check if end game button is displayed
    const endButton = screen.getByText('End Game');
    expect(endButton).toBeInTheDocument();
  });
  
  test('calls onStartGame when Start Game button is clicked', () => {
    render(
      <GameControls 
        gameState="waiting" 
        onStartGame={mockStartGame} 
        onEndGame={mockEndGame} 
        playersCount={2} 
      />
    );
    
    // Click the start game button
    const startButton = screen.getByText('Start Game');
    fireEvent.click(startButton);
    
    // Check if the onStartGame callback is called
    expect(mockStartGame).toHaveBeenCalledTimes(1);
  });
  
  test('calls onEndGame when End Game button is clicked', () => {
    render(
      <GameControls 
        gameState="inProgress" 
        onStartGame={mockStartGame} 
        onEndGame={mockEndGame} 
        playersCount={2} 
      />
    );
    
    // Click the end game button
    const endButton = screen.getByText('End Game');
    fireEvent.click(endButton);
    
    // Check if the onEndGame callback is called
    expect(mockEndGame).toHaveBeenCalledTimes(1);
  });
  
  test('displays correct status in waiting state', () => {
    render(
      <GameControls 
        gameState="waiting" 
        onStartGame={mockStartGame} 
        onEndGame={mockEndGame} 
        playersCount={2} 
      />
    );
    
    // Check if the status text is correct
    expect(screen.getByText('Waiting for players')).toBeInTheDocument();
  });
  
  test('displays correct status in inProgress state', () => {
    render(
      <GameControls 
        gameState="inProgress" 
        onStartGame={mockStartGame} 
        onEndGame={mockEndGame} 
        playersCount={2} 
      />
    );
    
    // Check if the status text is correct
    expect(screen.getByText('Game in progress')).toBeInTheDocument();
  });
  
  test('displays player count correctly', () => {
    render(
      <GameControls 
        gameState="waiting" 
        onStartGame={mockStartGame} 
        onEndGame={mockEndGame} 
        playersCount={5} 
      />
    );
    
    // Check if the player count is displayed correctly
    expect(screen.getByText('5')).toBeInTheDocument();
  });
}); 