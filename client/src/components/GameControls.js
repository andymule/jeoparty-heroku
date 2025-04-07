import React from 'react';
import styled from 'styled-components';

const ControlsContainer = styled.div`
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

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Button = styled.button`
  padding: 12px;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: bold;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.disabled ? 0.6 : 1};
  transition: all 0.2s ease;
  
  background-color: ${props => {
    if (props.$primary) return 'var(--jeopardy-yellow)';
    if (props.$danger) return 'var(--jeopardy-incorrect)';
    return 'white';
  }};
  
  color: ${props => {
    if (props.$primary) return 'var(--jeopardy-blue)';
    if (props.$danger) return 'white';
    return '#333';
  }};
  
  &:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-2px);
  }
`;

const GameInfo = styled.div`
  margin-top: 20px;
  color: white;
  font-size: 1rem;
`;

const InfoItem = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const Label = styled.span`
  color: var(--jeopardy-category);
`;

const Value = styled.span`
  font-weight: bold;
`;

const GameControls = ({ gameState, onStartGame, onEndGame, playersCount }) => {
  return (
    <ControlsContainer>
      <Title>Game Controls</Title>
      
      <ButtonGroup>
        {gameState === 'waiting' && (
          <Button 
            $primary 
            onClick={onStartGame}
            disabled={playersCount === 0}
          >
            Start Game
          </Button>
        )}
        
        {(gameState === 'inProgress' || gameState === 'questionActive') && (
          <Button 
            $danger 
            onClick={onEndGame}
          >
            End Game
          </Button>
        )}
      </ButtonGroup>
      
      <GameInfo>
        <InfoItem>
          <Label>Status:</Label>
          <Value>
            {gameState === 'waiting' ? 'Waiting for players' : 
             gameState === 'inProgress' ? 'Game in progress' : 
             gameState === 'questionActive' ? 'Question active' :
             'Game completed'}
          </Value>
        </InfoItem>
        
        <InfoItem>
          <Label>Players:</Label>
          <Value>{playersCount}</Value>
        </InfoItem>
      </GameInfo>
    </ControlsContainer>
  );
};

export default GameControls; 