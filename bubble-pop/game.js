/**
 * BUBBLE POP - GAME ENGINE
 * Aesthetic: Cute Pixel Art / Retro Sky
 * Backend: Firebase Firestore (v12.7.0)
 * Update: Replaced smooth rendering with Pixel-Art simulation
 */

// --- FIREBASE IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js";
import { 
    getFirestore, collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDOXhY9sMlslr0r-25pimjdlBZTzg-Ocqo",
    authDomain: "bubble-pop-2d702.firebaseapp.com",
    projectId: "bubble-pop-2d702",
    storageBucket: "bubble-pop-2d702.firebasestorage.app",
    messagingSenderId: "566905913684",
    appId: "1:566905913684:web:b89e5f742bf83fc20888c1",
    measurementId: "G-CH120T2QKY"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// --- GAME CONFIGURATION ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const previewCanvas = document.getElementById('previewCanvas');
const pCtx = previewCanvas.getContext('2d');

// Hexagonal Grid Settings
const RADIUS = 20; 
const DIAMETER = RADIUS * 2;
const ROWS = 14;
const COLS = 11;
const ROW_OFFSET = RADIUS * Math.sqrt(3); 
const OFFSET_X = RADIUS; 
const OFFSET_Y = RADIUS; 

// --- UPDATED PIXEL PALETTE (Matches the cover image) ---
const BUBBLE_COLORS = [
    { name: 'Pink',  main: '#FF9CCB', highlight: '#FFC8E3' }, // Pastel Pink
    { name: 'Blue',  main: '#89DCEB', highlight: '#C6F1F8' }, // Sky Cyan
    { name: 'Purple',main: '#CBA6F7', highlight: '#E5D4FB' }, // Soft Purple
    { name: 'Mint',  main: '#A6E3A1', highlight: '#D1F2CE' }, // Soft Green
    { name: 'Yellow',main: '#F9E2AF', highlight: '#FDF6D6' }  // Cream Yellow
];

// Game State
let gameState = {
    grid: [], 
    activeBubble: null,
    nextBubbleColor: null,
    projectiles: [],
    particles: [],
    clouds: [],
    score: 0,
    level: 1,
    gameOver: true,
    angle: -Math.PI / 2, 
    isProcessing: false,
    framesSinceLastRow: 0,
    rowInterval: 600,       
    minRowInterval: 180,    
    difficultyStep: 10,
    gridShift: 0 
};

let animationId;
let mouseX = 0, mouseY = 0;

// --- CLASSES ---

class Cloud {
    constructor() {
        this.reset(true);
    }

    reset(randomX = false) {
        this.x = randomX ? Math.random() * canvas.width : canvas.width + 50;
        this.y = Math.random() * (canvas.height * 0.7); 
        this.speed = 0.1 + Math.random() * 0.2; 
        this.size = 30 + Math.random() * 20; 
    }

    update() {
        this.x -= this.speed;
        if (this.x < -100) this.reset(false);
    }

    draw(ctx) {
        // PIXEL CLOUD DRAWING (Using rects instead of circles)
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        // Main block
        ctx.fillRect(this.x, this.y, this.size * 2, this.size);
        // Top bump
        ctx.fillRect(this.x + this.size * 0.5, this.y - this.size * 0.5, this.size, this.size * 0.5);
        // Side bumps
        ctx.fillRect(this.x - this.size * 0.2, this.y + this.size * 0.2, this.size * 0.2, this.size * 0.6);
        ctx.fillRect(this.x + this.size * 2, this.y + this.size * 0.2, this.size * 0.2, this.size * 0.6);
        
        // Shadow (Pixel effect)
        ctx.fillStyle = "rgba(0,0,0,0.05)";
        ctx.fillRect(this.x + 5, this.y + this.size - 5, this.size * 2 - 10, 5);
    }
}

class Bubble {
    constructor(r, c, colorIndex) {
        this.r = r;
        this.c = c;
        this.colorIndex = colorIndex;
        if (this.r >= 0) this.updatePos();
        this.scale = 1;
    }

    updatePos() {
        if (this.r < 0) return;
        const pos = getHexPos(this.r, this.c);
        this.x = pos.x;
        this.y = pos.y;
    }

    draw(context) {
        if(this.scale <= 0) return;
        if (this.r >= 0) this.updatePos();

        context.save();
        context.translate(this.x, this.y);
        context.scale(this.scale, this.scale);

        const color = BUBBLE_COLORS[this.colorIndex];

        // --- PIXEL ART BUBBLE RENDERING ---
        
        // 1. Outline (Darker version of main color)
        context.fillStyle = 'rgba(0,0,0,0.15)'; 
        context.beginPath();
        context.arc(2, 2, RADIUS, 0, Math.PI*2); // Subtle shadow offset
        context.fill();
        
        // 2. Main Body (Solid Circle)
        context.fillStyle = color.main;
        context.beginPath();
        context.arc(0, 0, RADIUS - 1, 0, Math.PI * 2);
        context.fill();

        // 3. Thick Outline (Simulating Pixel Art Stroke)
        context.strokeStyle = "#fff";
        context.lineWidth = 2;
        context.stroke();

        // 4. Pixel Highlight (Square Reflection)
        context.fillStyle = '#ffffff';
        context.fillRect(-RADIUS * 0.4, -RADIUS * 0.4, RADIUS * 0.3, RADIUS * 0.3); // Top-left shine
        context.fillStyle = color.highlight;
        context.fillRect(-RADIUS * 0.4 + 2, -RADIUS * 0.4 + 2, RADIUS * 0.1, RADIUS * 0.1); // Inner shine detail

        context.restore();
    }
}

class Projectile {
    constructor(x, y, angle, colorIndex) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * 12;
        this.vy = Math.sin(angle) * 12;
        this.colorIndex = colorIndex;
        this.active = true;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < RADIUS || this.x > canvas.width - RADIUS) {
            this.vx *= -1;
            this.x = Math.max(RADIUS, Math.min(this.x, canvas.width - RADIUS));
        }

        if (this.y < RADIUS) {
            snapBubble(this);
        }
    }

    draw() {
        let tempBubble = new Bubble(-1, -1, this.colorIndex);
        tempBubble.x = this.x;
        tempBubble.y = this.y;
        tempBubble.draw(ctx);
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = (Math.random() - 0.5) * 5;
        this.vy = (Math.random() - 0.5) * 5;
        this.life = 1.0;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.05;
    }
    draw() {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        // Draw square particles for pixel effect
        ctx.fillRect(this.x, this.y, 6, 6); 
        ctx.globalAlpha = 1.0;
    }
}

// --- CORE FUNCTIONS ---

function isRowEffectiveOdd(r) {
    return (r + gameState.gridShift) % 2 !== 0;
}

function getHexPos(r, c) {
    let x = c * DIAMETER + OFFSET_X;
    if (isRowEffectiveOdd(r)) x += RADIUS; 
    let y = r * ROW_OFFSET + OFFSET_Y;
    return { x, y };
}

function initGrid() {
    gameState.grid = [];
    for (let r = 0; r < ROWS; r++) {
        gameState.grid[r] = [];
        for (let c = 0; c < COLS; c++) {
            if (r < 5) {
                if (isRowEffectiveOdd(r) && c === COLS - 1) continue; 
                gameState.grid[r][c] = new Bubble(r, c, Math.floor(Math.random() * BUBBLE_COLORS.length));
            } else {
                gameState.grid[r][c] = null;
            }
        }
    }
}

function startGame() {
    gameState.score = 0;
    gameState.level = 1;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'event': 'game_start', 'game_name': 'Bubble Pop' });
    
    gameState.gameOver = false;
    gameState.isProcessing = false;
    gameState.projectiles = [];
    gameState.particles = [];
	
	gameState.clouds = [];
    for(let i = 0; i < 6; i++) { 
        gameState.clouds.push(new Cloud());
    }
    
    gameState.framesSinceLastRow = 0;
    gameState.rowInterval = 600; 
    gameState.gridShift = 0;
    
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('submit-score-container').classList.add('hidden');
    document.getElementById('leaderboard-display').classList.add('hidden');
    document.getElementById('start-btn').classList.add('hidden');
    updateUI();

    initGrid();
    generateNextBubble();
    
    if (animationId) cancelAnimationFrame(animationId);
    gameLoop();
}

function addNewRow() {
    for (let c = 0; c < COLS; c++) {
        if (gameState.grid[ROWS - 2][c]) { 
            triggerGameOver();
            return;
        }
    }
    for (let r = ROWS - 2; r >= 0; r--) {
        for (let c = 0; c < COLS; c++) {
            let b = gameState.grid[r][c];
            gameState.grid[r+1][c] = b; 
            if (b) b.r = r + 1; 
        }
    }
    gameState.gridShift = (gameState.gridShift + 1) % 2;
    gameState.grid[0] = []; 
    for (let c = 0; c < COLS; c++) {
        if (isRowEffectiveOdd(0) && c === COLS - 1) continue;
        gameState.grid[0][c] = new Bubble(0, c, Math.floor(Math.random() * BUBBLE_COLORS.length));
    }
    if (gameState.rowInterval > gameState.minRowInterval) gameState.rowInterval -= gameState.difficultyStep;
    gameState.framesSinceLastRow = 0;
    gameState.level++; 
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'event': 'level_up', 'level_number': gameState.level, 'game_name': 'Bubble Pop' });
    updateUI();
}

function generateNextBubble() {
    gameState.nextBubbleColor = Math.floor(Math.random() * BUBBLE_COLORS.length);
    drawPreview();
}

function drawPreview() {
    pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    let tempBubble = new Bubble(-1, -1, gameState.nextBubbleColor);
    tempBubble.x = previewCanvas.width / 2;
    tempBubble.y = previewCanvas.height / 2;
    tempBubble.scale = 1.5; 
    tempBubble.draw(pCtx);
}

function gameLoop() {
    if (gameState.gameOver) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
	
	// Draw Clouds
    gameState.clouds.forEach(cloud => {
        cloud.update();
        cloud.draw(ctx);
    });

    gameState.framesSinceLastRow++;
    let timerPct = gameState.framesSinceLastRow / gameState.rowInterval;
    ctx.fillStyle = '#ff9ccb'; // Pink timer bar
    ctx.fillRect(0, 0, canvas.width * timerPct, 6); 
    
    if (gameState.framesSinceLastRow > gameState.rowInterval) addNewRow();

    // Draw Grid
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let b = gameState.grid[r][c];
            if (b) b.draw(ctx);
        }
    }

    // Draw Aim Line
    if (!gameState.isProcessing) {
        let startX = canvas.width / 2;
        let startY = canvas.height - 30;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + Math.cos(gameState.angle) * 60, startY + Math.sin(gameState.angle) * 60);
        ctx.strokeStyle = '#89DCEB';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 8]); // Pixelated dash
        ctx.stroke();
        ctx.setLineDash([]);
        
        let launcherBubble = new Bubble(-1, -1, gameState.nextBubbleColor);
        launcherBubble.x = startX;
        launcherBubble.y = startY;
        launcherBubble.draw(ctx);
    }

    if (gameState.projectiles.length > 0) {
        let p = gameState.projectiles[0];
        p.update();
        p.draw();
        if (p.active) checkCollision(p);
    }

    for(let i = gameState.particles.length - 1; i >= 0; i--) {
        let p = gameState.particles[i];
        p.update();
        p.draw();
        if(p.life <= 0) gameState.particles.splice(i, 1);
    }

    // Warning Line
    let limitY = (ROWS - 1) * ROW_OFFSET;
	ctx.beginPath();
	ctx.moveTo(0, limitY + RADIUS);
	ctx.lineTo(canvas.width, limitY + RADIUS);
	ctx.strokeStyle = '#e74c3c'; 
	ctx.lineWidth = 3; 
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
	
    // Watermark
    ctx.save();
    ctx.font = '12px VT323, monospace'; 
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.textAlign = 'left';
    ctx.fillText('yunadata.github.io', 15, canvas.height - 15);
    ctx.restore();

    animationId = requestAnimationFrame(gameLoop);
}

// --- PHYSICS & LOGIC ---
function checkCollision(p) {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let b = gameState.grid[r][c];
            if (b) {
                b.updatePos(); 
                let dx = p.x - b.x;
                let dy = p.y - b.y;
                let dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < DIAMETER - 5) { 
                    snapBubble(p);
                    return;
                }
            }
        }
    }
}

function snapBubble(p) {
    p.active = false;
    gameState.projectiles = []; 
    let bestDist = Infinity;
    let bestR = -1, bestC = -1;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (!gameState.grid[r][c]) {
                if (isRowEffectiveOdd(r) && c === COLS - 1) continue;
                let pos = getHexPos(r, c);
                let dist = Math.sqrt(Math.pow(p.x - pos.x, 2) + Math.pow(p.y - pos.y, 2));
                if (dist < bestDist) {
                    bestDist = dist;
                    bestR = r;
                    bestC = c;
                }
            }
        }
    }

    if (bestR !== -1) {
        if (bestR >= ROWS - 1) {
            triggerGameOver();
            return;
        }
        let newBubble = new Bubble(bestR, bestC, p.colorIndex);
        gameState.grid[bestR][bestC] = newBubble;
        resolveMatches(bestR, bestC, p.colorIndex);
    }
    
    gameState.isProcessing = false;
    generateNextBubble();
}

function resolveMatches(startR, startC, colorIndex) {
    let toVisit = [{r: startR, c: startC}];
    let visited = new Set();
    let matches = [];
    let key = (r, c) => `${r},${c}`;
    visited.add(key(startR, startC));

    while(toVisit.length > 0) {
        let curr = toVisit.pop();
        matches.push(curr);
        let neighbors = getNeighbors(curr.r, curr.c);
        neighbors.forEach(n => {
            if (gameState.grid[n.r] && gameState.grid[n.r][n.c]) {
                let neighborBubble = gameState.grid[n.r][n.c];
                if (!visited.has(key(n.r, n.c)) && neighborBubble.colorIndex === colorIndex) {
                    visited.add(key(n.r, n.c));
                    toVisit.push(n);
                }
            }
        });
    }

    if (matches.length >= 3) {
        matches.forEach(m => {
            let b = gameState.grid[m.r][m.c];
            b.updatePos(); 
            createExplosion(b.x, b.y, BUBBLE_COLORS[b.colorIndex].main);
            gameState.grid[m.r][m.c] = null;
            gameState.score += 10;
        });
        if (matches.length > 3) gameState.score += (matches.length - 3) * 20;
        dropFloatingBubbles();
    }
    updateUI();
}

function dropFloatingBubbles() {
    let attached = new Set();
    let toVisit = [];
    let key = (r, c) => `${r},${c}`;

    for(let c=0; c<COLS; c++) {
        if(gameState.grid[0][c]) {
            toVisit.push({r:0, c:c});
            attached.add(key(0, c));
        }
    }

    while(toVisit.length > 0) {
        let curr = toVisit.pop();
        let neighbors = getNeighbors(curr.r, curr.c);
        neighbors.forEach(n => {
            if (gameState.grid[n.r] && gameState.grid[n.r][n.c]) {
                let k = key(n.r, n.c);
                if (!attached.has(k)) {
                    attached.add(k);
                    toVisit.push(n);
                }
            }
        });
    }

    let totalBubbles = 0; 
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (gameState.grid[r][c]) {
                if (!attached.has(key(r, c))) {
                    let b = gameState.grid[r][c];
                    b.updatePos();
                    createExplosion(b.x, b.y, BUBBLE_COLORS[b.colorIndex].main);
                    gameState.grid[r][c] = null;
                    gameState.score += 20; 
                } else {
                    totalBubbles++;
                }
            }
        }
    }

    if (totalBubbles === 0) {
        gameState.score += 1000;
        createExplosion(canvas.width/2, canvas.height/2, '#F9E2AF'); 
        setTimeout(() => {
            if(!gameState.gameOver) addNewRow();
        }, 500);
    }
}

function getNeighbors(r, c) {
    let offsets;
    if (!isRowEffectiveOdd(r)) {
        offsets = [{r: -1, c: -1}, {r: -1, c: 0}, {r: 0, c: -1}, {r: 0, c: 1}, {r: 1, c: -1}, {r: 1, c: 0}];
    } else {
        offsets = [{r: -1, c: 0}, {r: -1, c: 1}, {r: 0, c: -1}, {r: 0, c: 1}, {r: 1, c: 0}, {r: 1, c: 1}];
    }
    let results = [];
    offsets.forEach(o => {
        let nr = r + o.r;
        let nc = c + o.c;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
            results.push({r: nr, c: nc});
        }
    });
    return results;
}

function createExplosion(x, y, color) {
    for(let i=0; i<8; i++) {
        gameState.particles.push(new Particle(x, y, color));
    }
}

function triggerGameOver() {
    gameState.gameOver = true;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
        'event': 'game_complete',
        'game_score': gameState.score, 
        'game_name': 'Bubble Pop'
    });
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('overlay-title').innerText = "GAME OVER";
    document.getElementById('overlay-desc').innerText = "The bubbles filled the sky!";
    document.getElementById('start-btn').innerText = "PLAY AGAIN";
    document.getElementById('start-btn').classList.remove('hidden');
    
    document.getElementById('submit-score-container').classList.remove('hidden');
    document.getElementById('final-score').innerText = gameState.score;
    
    fetchLeaderboard();
}

function updateUI() {
    document.getElementById('score-display').innerText = gameState.score;
    document.getElementById('level-display').innerText = gameState.level;
}

// --- INPUT HANDLERS ---
canvas.addEventListener('mousemove', (e) => {
    let rect = canvas.getBoundingClientRect();
    let scaleX = canvas.width / rect.width;
    let scaleY = canvas.height / rect.height;
    mouseX = (e.clientX - rect.left) * scaleX;
    mouseY = (e.clientY - rect.top) * scaleY;

    let startX = canvas.width / 2;
    let startY = canvas.height - 30;
    gameState.angle = Math.atan2(mouseY - startY, mouseX - startX);
    if (gameState.angle > 0) gameState.angle = -Math.PI/2; 
});

canvas.addEventListener('mousedown', (e) => {
    if (gameState.gameOver || gameState.isProcessing || gameState.projectiles.length > 0) return;
    let startX = canvas.width / 2;
    let startY = canvas.height - 30;
    gameState.projectiles.push(new Projectile(startX, startY, gameState.angle, gameState.nextBubbleColor));
    gameState.isProcessing = true;
});

// --- FIREBASE LEADERBOARD ---
async function submitScore() {
    const nameInput = document.getElementById('player-name');
    let name = nameInput.value.trim();
    if (!name) return alert("Please enter a name!");
    
    const btn = document.querySelector('#submit-score-container .btn-game');
    btn.disabled = true;
    btn.innerText = "Saving...";

    try {
        const safeID = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const userRef = doc(db, "leaderboard", safeID);
        const docSnap = await getDoc(userRef);
        
        let shouldUpdate = true;
        if (docSnap.exists()) {
            if (gameState.score <= docSnap.data().score) shouldUpdate = false;
        }

        if (shouldUpdate) {
            await setDoc(userRef, {
                name: name,
                score: gameState.score,
                timestamp: Date.now()
            });
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                'event': 'score_submission', 
                'game_score': gameState.score,
                'game_name': 'Bubble Pop'
            });
            alert("Score Uploaded!");
        } else {
            alert("Score uploaded, but you didn't beat your high score!");
        }

        document.getElementById('submit-score-container').classList.add('hidden');
        fetchLeaderboard();
    } catch (e) {
        console.error(e);
        alert("Error saving score.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Submit Score";
    }
}

async function fetchLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    const container = document.getElementById('leaderboard-display');
    container.classList.remove('hidden');
    list.innerHTML = "Fetching scores...";

    try {
        const q = query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(10));
        const querySnapshot = await getDocs(q);
        
        let html = "";
        let rank = 1;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            html += `
            <div class="score-entry">
                <span>#${rank} ${data.name}</span>
                <span style="color:#FF9CCB; font-weight:bold;">${data.score}</span>
            </div>`;
            rank++;
        });
        
        if (!html) html = "<div>No scores yet!</div>";
        list.innerHTML = html;
        
    } catch (error) {
        list.innerHTML = "Error loading scores.";
    }
}

window.startGame = startGame;
window.submitScore = submitScore;
window.restartGame = startGame;
