import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
  background-color: #f5f5f5;
`;

const Title = styled.h1`
  font-size: 2.5rem;
  color: #333;
  margin-bottom: 20px;
`;

const Subtitle = styled.h2`
  font-size: 1.5rem;
  color: #666;
  margin-bottom: 30px;
`;

const Button = styled.button`
  padding: 10px 20px;
  background-color: #4285f4;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  margin: 5px;
  cursor: pointer;
  &:hover {
    background-color: #3367d6;
  }
`;

const Input = styled.input`
  padding: 10px;
  margin: 5px;
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 200px;
`;

const Card = styled.div`
  background-color: white;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  max-width: 800px;
  width: 100%;
`;

const GameList = styled.div`
  width: 100%;
  margin-top: 20px;
`;

const GameItem = styled.div`
  background-color: #f9f9f9;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const NotFound = () => {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState('TestPlayer');
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Load active games
  const fetchGames = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/games');
      const data = await response.json();
      if (data.success) {
        setGames(data.games || []);
      }
    } catch (error) {
      console.error('Error fetching games:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchGames();
  }, []);
  
  // Create a new game
  const handleCreateGame = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/games/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName })
      });
      
      const data = await response.json();
      if (data.success && data.roomCode) {
        console.log('Game created:', data);
        localStorage.setItem('playerName', playerName);
        navigate(`/game/host/${data.roomCode}`);
      } else {
        console.error('Failed to create game:', data);
        alert('Failed to create game: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error creating game:', error);
      alert('Error creating game: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Join an existing game
  const handleJoinGame = (roomCode) => {
    localStorage.setItem('playerName', playerName);
    navigate(`/game/player/${roomCode}`);
  };
  
  return (
    <Container>
      <Title>Debug & Test Page</Title>
      <Subtitle>Create or join a game directly</Subtitle>
      
      <Card>
        <h3>Create New Game</h3>
        <div>
          <Input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Your Name"
          />
          <Button onClick={handleCreateGame} disabled={loading}>
            {loading ? 'Creating...' : 'Create Game'}
          </Button>
        </div>
      </Card>
      
      <Card>
        <h3>Active Games</h3>
        <Button onClick={fetchGames} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh Games'}
        </Button>
        
        <GameList>
          {games.length === 0 ? (
            <p>No active games found</p>
          ) : (
            games.map((game) => (
              <GameItem key={game.roomCode}>
                <div>
                  <strong>Room: {game.roomCode}</strong> | 
                  Host: {game.hostName} | 
                  Players: {game.playerCount} | 
                  State: {game.state}
                </div>
                <div>
                  <Button onClick={() => navigate(`/game/host/${game.roomCode}`)}>
                    Host
                  </Button>
                  <Button onClick={() => handleJoinGame(game.roomCode)}>
                    Join
                  </Button>
                </div>
              </GameItem>
            ))
          )}
        </GameList>
      </Card>
      
      <Button onClick={() => navigate('/')}>
        Back to Home
      </Button>
    </Container>
  );
};

export default NotFound; 