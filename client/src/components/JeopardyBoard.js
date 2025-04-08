import React from 'react';
import styled from 'styled-components';

const BoardContainer = styled.div`
  display: flex;
  flex-direction: column;
  background-color: var(--jeopardy-board);
  border: 5px solid #000;
  width: 100%;
  height: 100%;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  ${props => props.$compact && `
    font-size: 90%;
    border: 3px solid #000;
  `}
`;

const CategoryRow = styled.div`
  display: flex;
  flex: 0 0 auto;
  height: ${props => props.$compact ? '60px' : '80px'};
`;

const ValuesGrid = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
`;

const Row = styled.div`
  display: flex;
  flex: 1;
`;

const CategoryCell = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background-color: var(--jeopardy-board);
  color: var(--jeopardy-category);
  font-size: ${props => props.$compact ? '0.9rem' : '1.2rem'};
  font-weight: bold;
  text-transform: uppercase;
  padding: ${props => props.$compact ? '5px' : '10px'};
  border: 2px solid #000;
  overflow: hidden;
`;

const ValueCell = styled.button`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${props => 
    props.$revealed ? 'rgba(0, 0, 0, 0.5)' :
    props.$disabled ? '#1a237e' : 'var(--jeopardy-board)'
  };
  color: ${props => props.$revealed ? 'transparent' : 'var(--jeopardy-value)'};
  font-size: ${props => props.$compact ? '1.6rem' : '2rem'};
  font-weight: bold;
  border: 2px solid #000;
  cursor: ${props => (props.$revealed || props.$disabled) ? 'default' : 'pointer'};
  transition: all 0.2s ease;
  position: relative;
  
  &:hover {
    background-color: ${props => 
      props.$revealed ? 'rgba(0, 0, 0, 0.5)' : 
      props.$disabled ? '#1a237e' : 'var(--jeopardy-selected)'
    };
  }
`;

const JeopardyBoard = ({ categories = [], board = {}, onSelectQuestion, disabled = false, compact = false }) => {
  // If no categories or board, show empty
  if (!categories.length || Object.keys(board).length === 0) {
    return <BoardContainer $compact={compact}></BoardContainer>;
  }
  
  const handleCellClick = (categoryIndex, valueIndex) => {
    if (!onSelectQuestion || disabled) return;
    
    const category = categories[categoryIndex];
    const item = board[category][valueIndex];
    const revealed = item && item.revealed;
    
    if (!revealed) {
      onSelectQuestion(categoryIndex, valueIndex);
    } else {
      console.log('Cell is already revealed, ignoring click');
    }
  };
  
  return (
    <BoardContainer $compact={compact}>
      <CategoryRow $compact={compact}>
        {categories.map((category, index) => (
          <CategoryCell key={index} $compact={compact}>
            {category}
          </CategoryCell>
        ))}
      </CategoryRow>
      
      <ValuesGrid>
        {[0, 1, 2, 3, 4].map(valueIndex => (
          <Row key={valueIndex}>
            {categories.map((category, categoryIndex) => {
              const item = board[category]?.[valueIndex];
              const revealed = item ? item.revealed : false;
              const value = item ? item.value : (valueIndex + 1) * 200;
              
              return (
                <ValueCell 
                  key={`${categoryIndex}-${valueIndex}`}
                  $revealed={revealed}
                  $disabled={disabled}
                  $compact={compact}
                  onClick={() => handleCellClick(categoryIndex, valueIndex)}
                  aria-disabled={revealed || disabled}
                  aria-label={revealed ? `Played ${category} for $${value}` : `${category} for $${value}`}
                >
                  {revealed ? '' : `$${value}`}
                </ValueCell>
              );
            })}
          </Row>
        ))}
      </ValuesGrid>
    </BoardContainer>
  );
};

export default JeopardyBoard; 