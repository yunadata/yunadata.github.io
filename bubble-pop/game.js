/**
 * BUBBLE POP - GAME ENGINE
 * Aesthetic: Pastel Iridescent / Glassmorphism
 * Backend: Firebase Firestore (v12.7.0)
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

// Initialize Firebase
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
const ROW_OFFSET = RADIUS * Math.sqrt(3); // Height of a hex row
const OFFSET_X = RADIUS; 
const OFFSET_Y = RADIUS; 

// Aesthetic Palettes
const BUBBLE_COLORS = [
    { name: 'Pink',  main: '#FFC4D6', dark: '#ff9bb9' },
    { name: 'Blue',  main: '#CCD5FF', dark: '#99aeff' },
    { name: 'Mint',  main: '#A0E7E5', dark: '#7cdbd8' },
    { name: 'Lemon', main: '#FFF5BA', dark: '#ffe680' },
    { name: 'Lilac', main: '#E2C2FF', dark: '#cda1ff' }
];

// Game State
let gameState = {
    grid: [], 
    activeBubble: null,
    nextBubbleColor: null,
    projectiles: [],
    particles: [],
    score: 0,
    level: 1,
    gameOver: true,
    angle: -Math.PI / 2, 
    isProcessing: false,
    
    // --- NEW VARIABLES FOR SURVIVAL MODE ---
    framesSinceLastRow: 0,
    rowInterval: 600,       // Start: Add row every ~10 seconds (at 60fps)
    minRowInterval: 180,    // Cap: Fastest speed is ~3 seconds
    difficultyStep: 10      // How much faster it gets per row added
};

let animationId;
let mouseX = 0, mouseY = 0;

// --- CLASSES ---

class Bubble {
    constructor(r, c, colorIndex) {
        this.r = r;
        this.c = c;
        this.colorIndex = colorIndex;
        // Calculate XY based on Hex Grid
        const pos = getHexPos(r, c);
        this.x = pos.x;
        this.y = pos.y;
        this.popping = false;
        this.scale = 1;
    }

    draw(context) {
        if(this.scale <= 0) return;

        context.save();
        context.translate(this.x, this.y);
        context.scale(this.scale, this.scale);

        const color = BUBBLE_COLORS[this.colorIndex];

        // Iridescent Effect
        let grad = context.createRadialGradient(-5, -5, 2, 0, 0, RADIUS - 1);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)'); // Highlight
        grad.addColorStop(0.3, color.main);
        grad.addColorStop(0.9, color.dark);
        grad.addColorStop(1, 'rgba(0,0,0,0.1)'); // Edge Shadow

        context.beginPath();
        context.arc(0, 0, RADIUS - 1, 0, Math.PI * 2);
        context.fillStyle = grad;
        context.fill();

        // Shiny reflection dot
        context.fillStyle = 'rgba(255,255,255,0.8)';
        context.beginPath();
        context.arc(-7, -7, 3, 0, Math.PI * 2);
        context.fill();

        context.restore();
    }
}

class Projectile {
    constructor(x, y, angle, colorIndex) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * 12; // Speed
        this.vy = Math.sin(angle) * 12;
        this.colorIndex = colorIndex;
        this.active = true;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // Wall Bouncing
        if (this.x < RADIUS || this.x > canvas.width - RADIUS) {
            this.vx *= -1;
            this.x = Math.max(RADIUS, Math.min(this.x, canvas.width - RADIUS));
        }

        // Ceiling Collision (Game Over check effectively handled by snap)
        if (this.y < RADIUS) {
            snapBubble(this);
        }
    }

    draw() {
        // Draw just like a bubble but at free coordinates
        let tempBubble = new Bubble(0, 0, this.colorIndex);
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
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// --- CORE FUNCTIONS ---

// Convert Grid (Row, Col) to Pixels (X, Y)
function getHexPos(r, c) {
    let x = c * DIAMETER + OFFSET_X;
    // Offset every odd row
    if (r % 2 !== 0) {
        x += RADIUS; 
    }
    let y = r * ROW_OFFSET + OFFSET_Y;
    return { x, y };
}

// Initialize Grid with some rows
function initGrid() {
    gameState.grid = [];
    for (let r = 0; r < ROWS; r++) {
        gameState.grid[r] = [];
        for (let c = 0; c < COLS; c++) {
            // Fill top 5 rows
            if (r < 5) {
                // Determine if this col exists (odd rows have 1 less col usually in straight grids, but simple offset works here)
                if (r % 2 !== 0 && c === COLS - 1) continue; 
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
    gameState.gameOver = false;
    gameState.isProcessing = false;
    gameState.projectiles = [];
    gameState.particles = [];
    
    // UI Reset
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

function generateNextBubble() {
    gameState.nextBubbleColor = Math.floor(Math.random() * BUBBLE_COLORS.length);
    drawPreview();
}

function drawPreview() {
    pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    
    // Draw in center of small canvas
    let tempBubble = new Bubble(0, 0, gameState.nextBubbleColor);
    tempBubble.x = previewCanvas.width / 2;
    tempBubble.y = previewCanvas.height / 2;
    tempBubble.scale = 1.5; // Make it look big in preview
    tempBubble.draw(pCtx);
}

// --- GAME LOOP ---

function gameLoop() {
    if (gameState.gameOver) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Grid
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let b = gameState.grid[r][c];
            if (b) b.draw(ctx);
        }
    }

    // 2. Draw Aim Line
    if (!gameState.isProcessing) {
        let startX = canvas.width / 2;
        let startY = canvas.height - 30;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + Math.cos(gameState.angle) * 60, startY + Math.sin(gameState.angle) * 60);
        ctx.strokeStyle = 'rgba(255, 196, 214, 0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw "Current" Bubble at launcher
        let launcherBubble = new Bubble(0, 0, gameState.nextBubbleColor);
        launcherBubble.x = startX;
        launcherBubble.y = startY;
        launcherBubble.draw(ctx);
    }

    // 3. Update & Draw Projectile
    if (gameState.projectiles.length > 0) {
        let p = gameState.projectiles[0];
        p.update();
        p.draw();
        
        // Collision Detection against Grid
        if (p.active) checkCollision(p);
    }

    // 4. Update Particles
    for(let i = gameState.particles.length - 1; i >= 0; i--) {
        let p = gameState.particles[i];
        p.update();
        p.draw();
        if(p.life <= 0) gameState.particles.splice(i, 1);
    }

    // 5. Check Line of Death
    let limitY = (ROWS - 1) * ROW_OFFSET;
    ctx.beginPath();
    ctx.moveTo(0, limitY + RADIUS);
    ctx.lineTo(canvas.width, limitY + RADIUS);
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;

    animationId = requestAnimationFrame(gameLoop);
}

// --- PHYSICS & LOGIC ---

function checkCollision(p) {
    // Check every existing bubble
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let b = gameState.grid[r][c];
            if (b) {
                let dx = p.x - b.x;
                let dy = p.y - b.y;
                let dist = Math.sqrt(dx*dx + dy*dy);
                
                // Collision happened
                if (dist < DIAMETER - 5) { // -5 makes it a bit forgiving
                    snapBubble(p);
                    return;
                }
            }
        }
    }
}

function snapBubble(p) {
    p.active = false;
    gameState.projectiles = []; // Remove projectile

    // Find closest grid coordinate
    let bestDist = Infinity;
    let bestR = -1, bestC = -1;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (!gameState.grid[r][c]) {
                // Ensure correct staggering
                if (r % 2 !== 0 && c === COLS - 1) continue;

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

    // Place the bubble
    if (bestR !== -1) {
        // Game Over Check: Did we hit the bottom?
        if (bestR >= ROWS - 2) {
            triggerGameOver();
            return;
        }

        let newBubble = new Bubble(bestR, bestC, p.colorIndex);
        gameState.grid[bestR][bestC] = newBubble;

        // Process Matches
        resolveMatches(bestR, bestC, p.colorIndex);
    }
    
    // Prepare for next shot
    gameState.isProcessing = false;
    generateNextBubble();
}

function resolveMatches(startR, startC, colorIndex) {
    let toVisit = [{r: startR, c: startC}];
    let visited = new Set();
    let matches = [];
    let key = (r, c) => `${r},${c}`;

    visited.add(key(startR, startC));

    // Flood Fill (BFS) to find matches
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
        // POP!
        matches.forEach(m => {
            let b = gameState.grid[m.r][m.c];
            createExplosion(b.x, b.y, BUBBLE_COLORS[b.colorIndex].main);
            gameState.grid[m.r][m.c] = null;
            gameState.score += 10;
        });
        
        // Bonus for large clusters
        if (matches.length > 3) gameState.score += (matches.length - 3) * 20;

        // Check for floating bubbles
        dropFloatingBubbles();
    }
    
    updateUI();
}

function dropFloatingBubbles() {
    // 1. Mark all bubbles attached to ceiling (Row 0)
    let attached = new Set();
    let toVisit = [];
    let key = (r, c) => `${r},${c}`;

    // Start with top row
    for(let c=0; c<COLS; c++) {
        if(gameState.grid[0][c]) {
            toVisit.push({r:0, c:c});
            attached.add(key(0, c));
        }
    }

    // BFS to find all connected bubbles
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

    // 2. Remove anything NOT in 'attached' set
    let dropped = false;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (gameState.grid[r][c] && !attached.has(key(r, c))) {
                let b = gameState.grid[r][c];
                createExplosion(b.x, b.y, BUBBLE_COLORS[b.colorIndex].main);
                gameState.grid[r][c] = null;
                gameState.score += 20; // Extra points for drops
                dropped = true;
            }
        }
    }
}

function getNeighbors(r, c) {
    // Hex Grid Neighbor Offsets depend on whether row is Even or Odd
    let offsets;
    if (r % 2 === 0) {
        // Even Row
        offsets = [
            {r: -1, c: -1}, {r: -1, c: 0}, // Top Left, Top Right
            {r: 0, c: -1},  {r: 0, c: 1},  // Left, Right
            {r: 1, c: -1},  {r: 1, c: 0}   // Bot Left, Bot Right
        ];
    } else {
        // Odd Row
        offsets = [
            {r: -1, c: 0}, {r: -1, c: 1},
            {r: 0, c: -1}, {r: 0, c: 1},
            {r: 1, c: 0},  {r: 1, c: 1}
        ];
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
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('overlay-title').innerText = "GAME OVER";
    document.getElementById('overlay-desc').innerText = "The bubbles reached the bottom!";
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

    // Calculate Angle
    let startX = canvas.width / 2;
    let startY = canvas.height - 30;
    gameState.angle = Math.atan2(mouseY - startY, mouseX - startX);
    
    // Clamp Angle (don't let them shoot down)
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
                <span style="color:#FFC4D6; font-weight:bold;">${data.score}</span>
            </div>`;
            rank++;
        });
        
        if (!html) html = "<div>No scores yet!</div>";
        list.innerHTML = html;
        
    } catch (error) {
        list.innerHTML = "Error loading scores.";
    }
}

// Expose functions globally for HTML onclick
window.startGame = startGame;
window.submitScore = submitScore;
window.restartGame = startGame;
