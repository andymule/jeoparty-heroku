import React from 'react';
import styled from 'styled-components';

const PlayerListContainer = styled.div`
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 20px;
`;

const Title = styled.h3`
  color: white;
  font-size: 1.5rem;
  margin: 0 0 15px 0;
  text-align: center;
`;

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const PlayerItem = styled.li`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  margin-bottom: 8px;
  background-color: ${props => props.$isBuzzed ? 'var(--jeopardy-selected)' : 'rgba(255, 255, 255, 0.1)'};
  border-radius: 4px;
  transition: all 0.2s ease;
`;

const PlayerName = styled.span`
  color: ${props => props.$isBuzzed ? 'white' : 'var(--jeopardy-text)'};
  font-weight: ${props => props.$isBuzzed ? 'bold' : 'normal'};
`;

const PlayerScore = styled.span`
  color: ${props => props.$positive ? 'var(--jeopardy-correct)' : 'var(--jeopardy-incorrect)'};
  font-weight: bold;
`;

const EmptyMessage = styled.p`
  color: white;
  text-align: center;
  font-style: italic;
`;

const PlayerList = ({ players = [], buzzedPlayerId }) => {
  // Sort players by score, highest first
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  
  return (
    <PlayerListContainer>
      <Title>Players</Title>
      
      {sortedPlayers.length > 0 ? (
        <List>
          {sortedPlayers.map(player => (
            <PlayerItem 
              key={player.id} 
              $isBuzzed={player.id === buzzedPlayerId}
            >
              <PlayerName $isBuzzed={player.id === buzzedPlayerId}>
                {player.name}
              </PlayerName>
              <PlayerScore $positive={player.score >= 0}>
                ${Math.abs(player.score)}
              </PlayerScore>
            </PlayerItem>
          ))}
        </List>
      ) : (
        <EmptyMessage>No players have joined yet.</EmptyMessage>
      )}
    </PlayerListContainer>
  );
};

export default PlayerList; 