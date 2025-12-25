/**
 * BUBBLE POP - GAME ENGINE
 * Aesthetic: Pastel Iridescent / Glassmorphism
 * Backend: Firebase Firestore (v12.7.0)
 * Update: Fixed Visibility of Launcher, Preview, and Projectiles
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
    
    // --- SURVIVAL & GRID VARIABLES ---
    framesSinceLastRow: 0,
    rowInterval: 600,       
    minRowInterval: 180,    
    difficultyStep: 10,
    
    // Global Grid Shift (0 or 1)
    gridShift: 0 
};

let animationId;
let mouseX = 0, mouseY = 0;

// --- CLASSES ---
class Cloud {
    constructor() {
        this.reset(true); // true = randomize initial X position across screen
    }

    reset(randomX = false) {
        this.x = randomX ? Math.random() * canvas.width : canvas.width + 50;
        this.y = Math.random() * (canvas.height * 0.6); // Only in top 60% of screen
        this.speed = 0.2 + Math.random() * 0.3; // Slow drift
        this.scale = 0.5 + Math.random() * 0.8; // Random sizes
        this.opacity = 0.3 + Math.random() * 0.3;
    }

    update() {
        this.x -= this.speed;
        // If cloud goes off the left side, reset to the right
        if (this.x < -100) {
            this.reset(false);
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        
        // Draw a fluffy cloud shape using 3 overlapping circles
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.arc(25, -10, 35, 0, Math.PI * 2);
        ctx.arc(50, 0, 30, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

class Bubble {
    constructor(r, c, colorIndex) {
        this.r = r;
        this.c = c;
        this.colorIndex = colorIndex;
        
        // Only calculate grid position if it's actually ON the grid (row >= 0)
        // Bubbles with r = -1 are "floating" (launcher, projectile, preview)
        if (this.r >= 0) {
            this.updatePos();
        }
        
        this.popping = false;
        this.scale = 1;
    }

    // Helper to refresh X/Y if grid shifts
    updatePos() {
        // SAFETY CHECK: Never force position for floating bubbles
        if (this.r < 0) return;

        const pos = getHexPos(this.r, this.c);
        this.x = pos.x;
        this.y = pos.y;
    }

    // In game.js, replace the entire Bubble.prototype.draw method:

    draw(context) {
        if(this.scale <= 0) return;

        // Ensure visual position is up to date for GRID bubbles
        if (this.r >= 0) this.updatePos();

        context.save();
        context.translate(this.x, this.y);
        context.scale(this.scale, this.scale);

        const color = BUBBLE_COLORS[this.colorIndex];

        // --- HELPER: Convert Hex to RGBA for transparency control ---
        const hexToRgba = (hex, alpha) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        // --- IMPROVED COLOR GRADIENT ---
        // 1. We start the gradient at the absolute center (0) so the whole bubble has color
        let grad = context.createRadialGradient(0, 0, 0, 0, 0, RADIUS);

        // 0% (Center): Light tint of the MAIN color (was white previously)
        // This ensures the center is not clear, but "tinted"
        grad.addColorStop(0, hexToRgba(color.main, 0.2)); 

        // 60% (Body): Stronger Main Color. This makes the bubble clearly Pink/Blue/etc.
        grad.addColorStop(0.6, hexToRgba(color.main, 0.6));

        // 85% (Edge Depth): Darker version of the color for volume
        grad.addColorStop(0.85, hexToRgba(color.dark, 0.7));

        // 100% (Rim): Sharp White edge for the "soap film" look
        grad.addColorStop(1, 'rgba(255, 255, 255, 0.9)');
        
        // ---------------------------

        context.beginPath();
        context.arc(0, 0, RADIUS, 0, Math.PI * 2);
        context.fillStyle = grad;
        context.fill();

        // --- REFLECTIONS (SHINE) ---
        // Keep these pure white and sharp for the "wet" look
        context.globalAlpha = 0.9;
        
        // Main Reflection (Top Left)
        context.fillStyle = '#ffffff'; 
        context.beginPath();
        context.arc(-RADIUS * 0.4, -RADIUS * 0.4, RADIUS * 0.15, 0, Math.PI * 2);
        context.fill();

        // Secondary Reflection (Bottom Right - smaller)
        context.fillStyle = 'rgba(255, 255, 255, 0.5)';
        context.beginPath();
        context.arc(RADIUS * 0.4, RADIUS * 0.4, RADIUS * 0.08, 0, Math.PI * 2);
        context.fill();

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
        // FIX: Use r=-1, c=-1 to tell Bubble class this is free-floating
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
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// --- CORE FUNCTIONS ---

// Helper to determine if a row is effectively indented
function isRowEffectiveOdd(r) {
    return (r + gameState.gridShift) % 2 !== 0;
}

// Convert Grid (Row, Col) to Pixels (X, Y)
function getHexPos(r, c) {
    let x = c * DIAMETER + OFFSET_X;
    
    // Check effective indentation
    if (isRowEffectiveOdd(r)) {
        x += RADIUS; 
    }
    
    let y = r * ROW_OFFSET + OFFSET_Y;
    return { x, y };
}

function initGrid() {
    gameState.grid = [];
    for (let r = 0; r < ROWS; r++) {
        gameState.grid[r] = [];
        for (let c = 0; c < COLS; c++) {
            if (r < 5) {
                // Check effective oddness for column limits
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
    gameState.gameOver = false;
    gameState.isProcessing = false;
    gameState.projectiles = [];
    gameState.particles = [];
	
	gameState.clouds = [];
    for(let i = 0; i < 8; i++) { // Generate 8 clouds
        gameState.clouds.push(new Cloud());
    }
    
    gameState.framesSinceLastRow = 0;
    gameState.rowInterval = 600; 
    gameState.gridShift = 0; // Reset Shift
    
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

    // 1. Shift all bubbles down
    for (let r = ROWS - 2; r >= 0; r--) {
        for (let c = 0; c < COLS; c++) {
            let b = gameState.grid[r][c];
            gameState.grid[r+1][c] = b; 
            
            if (b) {
                b.r = r + 1; 
                // Position auto-updates in draw()
            }
        }
    }

    // 2. TOGGLE GRID SHIFT
    gameState.gridShift = (gameState.gridShift + 1) % 2;

    // 3. Create new top row
    gameState.grid[0] = []; 
    for (let c = 0; c < COLS; c++) {
        if (isRowEffectiveOdd(0) && c === COLS - 1) continue;
        gameState.grid[0][c] = new Bubble(0, c, Math.floor(Math.random() * BUBBLE_COLORS.length));
    }

    if (gameState.rowInterval > gameState.minRowInterval) {
        gameState.rowInterval -= gameState.difficultyStep;
    }
    
    gameState.framesSinceLastRow = 0;
    gameState.level++; 
    updateUI();
}

function generateNextBubble() {
    gameState.nextBubbleColor = Math.floor(Math.random() * BUBBLE_COLORS.length);
    drawPreview();
}

function drawPreview() {
    pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    // FIX: Use r=-1 to prevent grid snapping
    let tempBubble = new Bubble(-1, -1, gameState.nextBubbleColor);
    tempBubble.x = previewCanvas.width / 2;
    tempBubble.y = previewCanvas.height / 2;
    tempBubble.scale = 1.5; 
    tempBubble.draw(pCtx);
}

function gameLoop() {
    if (gameState.gameOver) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
	
	// --- Draw Background Clouds ---
    gameState.clouds.forEach(cloud => {
        cloud.update();
        cloud.draw(ctx);
    });

    gameState.framesSinceLastRow++;
    
    let timerPct = gameState.framesSinceLastRow / gameState.rowInterval;
    ctx.fillStyle = '#A0E7E5'; 
    ctx.fillRect(0, 0, canvas.width * timerPct, 6); 
    
    if (gameState.framesSinceLastRow > gameState.rowInterval) {
        addNewRow();
    }

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
        ctx.strokeStyle = 'rgba(255, 196, 214, 0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // FIX: Use r=-1 to keep it at launcher position
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

    let limitY = (ROWS - 1) * ROW_OFFSET;
	ctx.beginPath();
	ctx.moveTo(0, limitY + RADIUS);
	ctx.lineTo(canvas.width, limitY + RADIUS);
	// NEW: Soft Dark Pink (Matches your "Pink" bubbles but darker)
	ctx.strokeStyle = '#ff9bb9'; 
	ctx.lineWidth = 3; // Made slightly thicker for better visibility
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;

    animationId = requestAnimationFrame(gameLoop);
}

// --- PHYSICS & LOGIC ---

function checkCollision(p) {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let b = gameState.grid[r][c];
            if (b) {
                // Ensure we check against current visual position
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
        if (bestR >= ROWS - 2) {
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
        createExplosion(canvas.width/2, canvas.height/2, '#f1c40f'); 
        setTimeout(() => {
            if(!gameState.gameOver) addNewRow();
        }, 500);
    }
}

function getNeighbors(r, c) {
    let offsets;
    
    if (!isRowEffectiveOdd(r)) {
        // Effective EVEN (Left Aligned)
        offsets = [
            {r: -1, c: -1}, {r: -1, c: 0}, 
            {r: 0, c: -1},  {r: 0, c: 1},  
            {r: 1, c: -1},  {r: 1, c: 0}   
        ];
    } else {
        // Effective ODD (Right Aligned)
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

window.startGame = startGame;
window.submitScore = submitScore;
window.restartGame = startGame;
