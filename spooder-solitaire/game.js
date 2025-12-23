/* Spooder Solitaire
    Created by Yuna An Vu
    Game Logic
*/

// --- State Variables ---
const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUES = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
const SUIT_ICONS = { 'spades': '♠', 'hearts': '♥', 'clubs': '♣', 'diamonds': '♦' };
const SUIT_COLORS = { 'spades': 'suit-black', 'hearts': 'suit-red', 'clubs': 'suit-black', 'diamonds': 'suit-red' };

let gameState = {
    difficulty: 1, // 1, 2, or 4
    score: 500,
    moves: 0,
    startTime: 0,
    timerInterval: null,
    deck: [],
    columns: Array(10).fill().map(() => []), // Data model for columns
    history: [], // For Undo
    draggedCards: [], // Cards currently being dragged
    dragSourceCol: -1,
    isDragging: false
};

// --- DOM Elements ---
const elTableau = document.getElementById('tableau');
const elStock = document.getElementById('stock-container');
const elFoundations = document.getElementById('foundations');
const elScore = document.getElementById('score');
const elMoves = document.getElementById('moves');
const elTime = document.getElementById('timer');

// --- Initialization ---

function init() {
    // Initial UI setup if needed
}

function showStartScreen() {
    document.getElementById('start-overlay').classList.remove('hidden');
    document.getElementById('win-overlay').classList.add('hidden');
    clearInterval(gameState.timerInterval);
}

function startGame(difficulty) {
    gameState.difficulty = difficulty;
    gameState.score = 500;
    gameState.moves = 0;
    gameState.history = [];
    gameState.columns = Array(10).fill().map(() => []);
    
    document.getElementById('start-overlay').classList.add('hidden');
    document.getElementById('win-overlay').classList.add('hidden');
    
    // Clear Board
    elTableau.innerHTML = '';
    elFoundations.innerHTML = '';
    elStock.innerHTML = '';
    for(let i=0; i<10; i++) {
        const col = document.createElement('div');
        col.className = 'column';
        col.dataset.colIndex = i;
        elTableau.appendChild(col);
    }
    for(let i=0; i<8; i++) {
        const f = document.createElement('div');
        f.className = 'foundation-slot';
        elFoundations.appendChild(f);
    }

    createDeck(difficulty);
    dealInitialCards();
    updateStats();
    startTimer();
    renderStock();
}

// --- Game Logic: Setup ---

function createDeck(suitsCount) {
    gameState.deck = [];
    // Spider Solitaire always has 104 cards (2 standard decks)
    // 1 Suit: 8 sets of Spades
    // 2 Suits: 4 sets of Spades, 4 sets of Hearts
    // 4 Suits: 2 sets of each suit
    
    let suitsToUse = [];
    if(suitsCount === 1) suitsToUse = ['spades'];
    if(suitsCount === 2) suitsToUse = ['spades', 'hearts'];
    if(suitsCount === 4) suitsToUse = ['spades', 'hearts', 'clubs', 'diamonds'];
    
    const setsPerSuit = 8 / suitsToUse.length;
    
    for(let s of suitsToUse) {
        for(let i=0; i<setsPerSuit; i++) {
            for(let r of RANKS) {
                gameState.deck.push({
                    suit: s,
                    rank: r,
                    value: RANK_VALUES[r],
                    faceUp: false,
                    id: Math.random().toString(36).substr(2, 9)
                });
            }
        }
    }
    
    // Shuffle
    gameState.deck.sort(() => Math.random() - 0.5);
}

function dealInitialCards() {
    // 54 cards dealt initially
    // First 4 cols get 6 cards, next 6 cols get 5 cards
    const dealCounts = [6,6,6,6,5,5,5,5,5,5];
    
    dealCounts.forEach((count, colIndex) => {
        for(let i=0; i<count; i++) {
            const card = gameState.deck.pop();
            if (i === count - 1) card.faceUp = true; // Top card face up
            gameState.columns[colIndex].push(card);
        }
    });
    
    renderBoard();
}

// --- Rendering ---

function renderBoard() {
    gameState.columns.forEach((colData, index) => {
        const colEl = elTableau.children[index];
        colEl.innerHTML = ''; // Clear existing
        
        // Track the current vertical position for this column
        let currentTop = 0; 
        
        colData.forEach((card, cardIndex) => {
            const cardEl = createCardElement(card, index, cardIndex);
            
            // Set the position using our tracking variable
            cardEl.style.top = `${currentTop}px`;
            
            colEl.appendChild(cardEl);
            
            // Determine how much space to add for the NEXT card.
            // If this card is face up, we need space to see it (e.g., 30px).
            // If it's face down, we need a tight overlap (e.g., 8px).
            const spacing = card.faceUp ? 30 : 8; 
            currentTop += spacing;
        });
    });
}

function renderStock() {
    elStock.innerHTML = '';
    if(gameState.deck.length > 0) {
        const count = gameState.deck.length / 10;
        for(let i=0; i<Math.min(count, 5); i++) {
             const cardBack = document.createElement('div');
             cardBack.className = 'card face-down';
             cardBack.style.position = 'absolute';
             cardBack.style.top = `${i*2}px`;
             cardBack.style.left = `${i*2}px`;
             elStock.appendChild(cardBack);
        }
        elStock.onclick = dealRow;
    } else {
        elStock.onclick = null;
        elStock.style.opacity = 0.5;
    }
}

function createCardElement(cardObj, colIndex, cardIndex) {
    const el = document.createElement('div');
    el.className = `card ${cardObj.faceUp ? '' : 'face-down'}`;
    el.dataset.col = colIndex;
    el.dataset.index = cardIndex;
    el.dataset.id = cardObj.id;

    if (cardObj.faceUp) {
        el.innerHTML = `
            <div class="card-content">
                <div class="card-top ${SUIT_COLORS[cardObj.suit]}">
                    <span>${cardObj.rank}</span><br>
                    <span>${SUIT_ICONS[cardObj.suit]}</span>
                </div>
                <div class="card-center ${SUIT_COLORS[cardObj.suit]}">
                    ${SUIT_ICONS[cardObj.suit]}
                </div>
            </div>
        `;
        // Add drag listeners
        el.addEventListener('mousedown', handleDragStart);
        el.addEventListener('touchstart', handleDragStart, {passive: false});
    }

    return el;
}

// --- Game Logic: Actions ---

function dealRow() {
    // Rules: Cannot deal if any column is empty (Strict Rule)
    // We will be lenient for this web version unless desired? 
    // Let's implement strict rule but warn user or just block.
    // const hasEmpty = gameState.columns.some(c => c.length === 0);
    // if(hasEmpty) { alert("Cannot deal with empty columns!"); return; }

    if(gameState.deck.length === 0) return;

    saveHistory(); // For undo

    for(let i=0; i<10; i++) {
        if(gameState.deck.length > 0) {
            const card = gameState.deck.pop();
            card.faceUp = true;
            gameState.columns[i].push(card);
        }
    }
    
    renderBoard();
    renderStock();
    checkRuns(); // Dealing might complete a run accidentally? (Unlikely but possible in logic)
}

// --- Drag and Drop Logic ---

let dragEl = null; // The visual clone being dragged
let dragData = null; // { cards: [], sourceCol, sourceIndex }
let startX, startY;

function handleDragStart(e) {
    if(gameState.isDragging) return;
    
    // Prevent default touch scrolling
    if(e.type === 'touchstart') e.stopPropagation();

    const target = e.currentTarget;
    const colIndex = parseInt(target.dataset.col);
    const cardIndex = parseInt(target.dataset.index);
    const colCards = gameState.columns[colIndex];
    
    // Validate: Can we pick this up?
    // Must be face up. Must be part of a valid sequence from this card to the top.
    const stackToMove = colCards.slice(cardIndex);
    
    if(!isValidSequence(stackToMove)) return;

    // Start Drag
    gameState.isDragging = true;
    dragData = {
        cards: stackToMove,
        sourceCol: colIndex,
        sourceIndex: cardIndex,
        originalEls: [] // To hide them while dragging
    };

    // Create visual drag element (a container holding clones of the cards)
    dragEl = document.createElement('div');
    dragEl.style.position = 'fixed';
    dragEl.style.zIndex = '9999';
    dragEl.style.pointerEvents = 'none'; // Essential for document.elementFromPoint
    dragEl.style.width = target.offsetWidth + 'px';
    
    // Clone cards into dragEl
    stackToMove.forEach((c, i) => {
        const original = document.querySelector(`.card[data-id="${c.id}"]`);
        if(original) {
            original.style.opacity = '0'; // Hide original
            dragData.originalEls.push(original);
            
            const clone = original.cloneNode(true);
            clone.style.opacity = '1';
            clone.style.position = 'absolute';
            clone.style.top = `${i * 25}px`; // Compact spacing for drag
            clone.style.left = '0';
            clone.style.boxShadow = '0 10px 20px rgba(0,0,0,0.3)';
            dragEl.appendChild(clone);
        }
    });

    document.body.appendChild(dragEl);

    // Initial position
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    
    // Offset so we grab where we clicked
    const rect = target.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    
    dragEl.style.left = (rect.left) + 'px';
    dragEl.style.top = (rect.top) + 'px';

    // Move handlers
    const moveHandler = (ev) => {
        ev.preventDefault();
        const cx = ev.type.includes('mouse') ? ev.clientX : ev.touches[0].clientX;
        const cy = ev.type.includes('mouse') ? ev.clientY : ev.touches[0].clientY;
        
        dragEl.style.left = (cx - offsetX) + 'px';
        dragEl.style.top = (cy - offsetY) + 'px';
    };

    // Drop handler
    const upHandler = (ev) => {
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', upHandler);
        document.removeEventListener('touchmove', moveHandler);
        document.removeEventListener('touchend', upHandler);
        
        const cx = ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX;
        const cy = ev.changedTouches ? ev.changedTouches[0].clientY : ev.clientY;
        
        handleDrop(cx, cy);
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
    document.addEventListener('touchmove', moveHandler, {passive: false});
    document.addEventListener('touchend', upHandler);
}

function isValidSequence(cards) {
    // Check if cards are descending by 1 and same suit
    for(let i=0; i < cards.length - 1; i++) {
        if (cards[i].suit !== cards[i+1].suit) return false;
        if (cards[i].value !== cards[i+1].value + 1) return false;
    }
    return true;
}

function handleDrop(x, y) {
    // Hide dragEl briefly to find what's underneath
    dragEl.style.display = 'none';
    let elemBelow = document.elementFromPoint(x, y);
    dragEl.style.display = 'block';

    // Find closest column
    let targetColDiv = elemBelow ? elemBelow.closest('.column') : null;
    
    // If dropped on a card, get its column
    if (!targetColDiv && elemBelow && elemBelow.closest('.card')) {
        targetColDiv = elemBelow.closest('.column');
    }

    let validMove = false;
    let targetColIndex = -1;

    if (targetColDiv) {
        targetColIndex = parseInt(targetColDiv.dataset.colIndex);
        const targetCol = gameState.columns[targetColIndex];
        
        // Logic:
        // 1. Empty column? Yes, any card(s) can go there.
        // 2. Not empty? Top card must be rank + 1 of the bottom card of drag stack.
        
        if (targetCol.length === 0) {
            validMove = true;
        } else {
            const topCard = targetCol[targetCol.length - 1]; // Visual top, actual last in array
            const draggingBase = dragData.cards[0];
            
            if (topCard.value === draggingBase.value + 1) {
                validMove = true;
            }
        }
    }

    if (validMove && targetColIndex !== dragData.sourceCol) {
        executeMove(dragData.sourceCol, targetColIndex, dragData.cards.length);
    } else {
        // Cancel move: Show originals
        dragData.originalEls.forEach(el => el.style.opacity = '1');
    }

    // Cleanup
    if(dragEl && dragEl.parentNode) dragEl.parentNode.removeChild(dragEl);
    gameState.isDragging = false;
    dragData = null;
    dragEl = null;
}

function executeMove(fromColIdx, toColIdx, count) {
    saveHistory();

    const fromCol = gameState.columns[fromColIdx];
    const toCol = gameState.columns[toColIdx];
    
    // Move logic
    const movingCards = fromCol.splice(fromCol.length - count, count);
    gameState.columns[toColIdx] = toCol.concat(movingCards);
    
    // Flip new top card of source col if needed
    if(fromCol.length > 0) {
        fromCol[fromCol.length - 1].faceUp = true;
    }

    // Update stats
    gameState.moves++;
    gameState.score = Math.max(0, gameState.score - 1); // Move cost
    updateStats();

    renderBoard();
    checkRuns();
}

// --- Rules & Win Condition ---

function checkRuns() {
    // Check every column for K->A of same suit
    let runFound = false;

    gameState.columns.forEach((col, colIdx) => {
        if(col.length < 13) return;
        
        // Check only face up cards
        let sequence = [];
        for(let i = col.length - 1; i >= 0; i--) {
            const card = col[i];
            if(!card.faceUp) break;
            
            if(sequence.length === 0) {
                sequence.push(card);
            } else {
                const prev = sequence[sequence.length - 1];
                if(card.suit === prev.suit && card.value === prev.value + 1) {
                    sequence.push(card);
                } else {
                    break;
                }
            }
            
            if(sequence.length === 13) {
                // Completed Run found! (A to K)
                removeRun(colIdx);
                runFound = true;
                break;
            }
        }
    });

    if(runFound && isGameWon()) {
        endGame();
    }
}

function removeRun(colIdx) {
    const col = gameState.columns[colIdx];
    // Remove last 13 cards
    const run = col.splice(col.length - 13, 13);
    
    // Visual: Add to foundation
    // Standard Spider doesn't really have foundations, it just removes them.
    // But we'll visualize it in the top slots.
    const slot = document.querySelectorAll('.foundation-slot');
    // Find first empty or just fill randomly? 
    // We can just append an image of the King to the slots.
    
    let filled = 0;
    // Count filled slots logic... simplified:
    const completedCount = 8 - (104 - getCardCountOnBoard())/13;
    // Actually simpler: just append a completed stack visual
    
    const fSlot = document.querySelector('.foundation-slot:empty');
    if(fSlot) {
        fSlot.innerHTML = `<div class="card" style="position:relative; top:0; left:0; color:${SUIT_COLORS[run[0].suit]}">
            <div class="card-content"><div class="card-center">K${SUIT_ICONS[run[0].suit]}</div></div>
        </div>`;
    }

    // Flip new top of column
    if(col.length > 0 && !col[col.length-1].faceUp) {
        col[col.length-1].faceUp = true;
    }

    gameState.score += 100;
    updateStats();
    renderBoard();
}

function getCardCountOnBoard() {
    return gameState.columns.reduce((acc, col) => acc + col.length, 0);
}

function isGameWon() {
    // If deck empty and tableau empty (all runs moved to foundation)
    // Or simpler: if score calculation based on foundations?
    // In Spider, you win when all 8 sets are built. Tableau should be empty.
    return getCardCountOnBoard() === 0;
}

function endGame() {
    clearInterval(gameState.timerInterval);
    document.getElementById('final-score').innerText = gameState.score;
    document.getElementById('final-time').innerText = elTime.innerText;
    document.getElementById('win-overlay').classList.remove('hidden');
    
    // Trigger confetti or something cute?
}

// --- Undo System ---

function saveHistory() {
    // Deep copy current state (expensive but simple for this scale)
    const stateSnapshot = JSON.stringify({
        c: gameState.columns,
        d: gameState.deck,
        s: gameState.score,
        m: gameState.moves
    });
    gameState.history.push(stateSnapshot);
    if(gameState.history.length > 20) gameState.history.shift(); // Max 20 undos
}

document.getElementById('btn-undo').addEventListener('click', () => {
    if(gameState.history.length === 0) return;
    
    const lastState = JSON.parse(gameState.history.pop());
    gameState.columns = lastState.c;
    gameState.deck = lastState.d;
    gameState.moves = lastState.m;
    gameState.score = Math.max(0, lastState.s - 10); // Penalty
    
    renderBoard();
    renderStock();
    updateStats();
});

// --- Stats & Timer ---

function updateStats() {
    elScore.innerText = gameState.score;
    elMoves.innerText = gameState.moves;
}

function startTimer() {
    gameState.startTime = Date.now();
    if(gameState.timerInterval) clearInterval(gameState.timerInterval);
    
    gameState.timerInterval = setInterval(() => {
        const delta = Math.floor((Date.now() - gameState.startTime) / 1000);
        const m = Math.floor(delta / 60).toString().padStart(2, '0');
        const s = (delta % 60).toString().padStart(2, '0');
        elTime.innerText = `${m}:${s}`;
    }, 1000);
}

// --- Leaderboard Integration ---

window.submitScore = async function() {
    const name = document.getElementById('player-name').value || "Spooder";
    const btn = document.querySelector('.action');
    btn.disabled = true;
    btn.innerText = "Saving...";
    
    const success = await window.saveGameScore(
        name, 
        gameState.score, 
        gameState.difficulty, 
        gameState.moves, 
        elTime.innerText
    );
    
    if(success) {
        btn.innerText = "Saved!";
        setTimeout(() => {
            toggleLeaderboardModal();
        }, 1000);
    } else {
        btn.innerText = "Error :(";
        btn.disabled = false;
    }
};

window.toggleLeaderboardModal = function() {
    const el = document.getElementById('leaderboard-overlay');
    el.classList.toggle('hidden');
    
    if(!el.classList.contains('hidden')) {
        // 1. Get current difficulty (default to 1 if undefined)
        const diff = gameState.difficulty || 1;
        
        // 2. Find the specific button using the IDs we added in HTML
        const targetBtn = document.getElementById(`tab-${diff}`);
        
        // 3. Load leaderboard AND pass the button so the UI updates
        loadLeaderboard(diff, targetBtn);
    }
}

window.loadLeaderboard = async function(diff, btnEl) {
    if(btnEl) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
    }
    
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<div class="loader">Fetching scores...</div>';
    
    const scores = await window.fetchLeaderboard(diff);
    
    if(scores.length === 0) {
        list.innerHTML = '<p>No scores yet! Be the first.</p>';
        return;
    }
    
    let html = '';
    scores.forEach((s, i) => {
        html += `
        <div class="score-row">
            <span>#${i+1} ${s.name}</span>
            <span>${s.score} pts</span>
        </div>`;
    });
    list.innerHTML = html;
}

// Start with start screen
showStartScreen();
