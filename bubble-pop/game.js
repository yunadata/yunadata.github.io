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

class Bubble {
    constructor(r, c, colorIndex) {
        this.r = r;
        this.c = c;
        this.colorIndex = colorIndex;
        if (this.r >= 0) this.updatePos();
        this.popping = false;
        this.scale = 1;
        this.popAnimVal = 0; // For pop animation
    }

    updatePos() {
        if (this.r < 0) return;
        const pos = getHexPos(this.r, this.c);
        this.x = pos.x;
        this.y = pos.y;
    }

    draw(context) {
        if (this.scale <= 0) return;
        if (this.r >= 0) this.updatePos();

        context.save();
        context.translate(this.x, this.y);
        context.scale(this.scale, this.scale);

        const color = BUBBLE_COLORS[this.colorIndex];

        // 1. Drop Shadow (Subtle depth)
        context.beginPath();
        context.arc(2, 4, RADIUS - 2, 0, Math.PI * 2);
        context.fillStyle = 'rgba(0,0,0,0.1)';
        context.fill();

        // 2. Main Body (Solid color)
        context.beginPath();
        context.arc(0, 0, RADIUS - 1, 0, Math.PI * 2);
        context.fillStyle = color.main;
        context.fill();

        // 3. Inner Shadow (Bottom Right - creates volume)
        let innerGrad = context.createRadialGradient(-5, -5, 2, 0, 0, RADIUS);
        innerGrad.addColorStop(0, 'rgba(255,255,255,0.1)');
        innerGrad.addColorStop(0.8, color.dark);
        innerGrad.addColorStop(1, color.dark);
        context.fillStyle = innerGrad;
        context.fill();

        // 4. Top Glare (Glossy reflection)
        context.beginPath();
        context.ellipse(-6, -6, 6, 3, Math.PI / 4, 0, Math.PI * 2);
        context.fillStyle = 'rgba(255, 255, 255, 0.7)';
        context.fill();

        // 5. Small Specular Highlight
        context.beginPath();
        context.arc(-5, -5, 2, 0, Math.PI * 2);
        context.fillStyle = '#fff';
        context.fill();

        // 6. Bottom Rim Light (Bounce light)
        context.beginPath();
        context.arc(0, 0, RADIUS - 2, 0.2 * Math.PI, 0.8 * Math.PI);
        context.strokeStyle = 'rgba(255,255,255,0.3)';
        context.lineWidth = 2;
        context.stroke();

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
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.size = Math.random() * 4 + 2;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.2; // Gravity
        this.life -= 0.04;
        this.size *= 0.95; // Shrink
    }
    draw() {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
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

    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- NEW: Draw Subtle Hex Grid Background ---
    // This helps the user see where bubbles will snap
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if(r >= 0) { // Safety check
                let pos = getHexPos(r, c);
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, RADIUS - 2, 0, Math.PI*2);
                ctx.stroke();
            }
        }
    }
    ctx.restore();

    // Timer Bar
    gameState.framesSinceLastRow++;
    let timerPct = gameState.framesSinceLastRow / gameState.rowInterval;
    // Pretty gradient bar
    let barGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    barGrad.addColorStop(0, '#FF9AA2');
    barGrad.addColorStop(1, '#C7CEEA');
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, 0, canvas.width * timerPct, 8); 
    
    if (gameState.framesSinceLastRow > gameState.rowInterval) {
        addNewRow();
    }

    // Draw Grid Bubbles
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let b = gameState.grid[r][c];
            if (b) b.draw(ctx);
        }
    }

    // --- NEW: Dotted Aim Line ---
    if (!gameState.isProcessing) {
        let startX = canvas.width / 2;
        let startY = canvas.height - 30;
        let aimLen = 200;
        let endX = startX + Math.cos(gameState.angle) * aimLen;
        let endY = startY + Math.sin(gameState.angle) * aimLen;
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        
        // Create a dotted gradient look
        let grad = ctx.createLinearGradient(startX, startY, endX, endY);
        grad.addColorStop(0, 'rgba(255, 154, 162, 0.8)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.strokeStyle = grad;
        ctx.lineWidth = 4;
        ctx.setLineCap('round');
        ctx.setLineDash([5, 10]); // Dotted effect
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw Launcher Bubble
        let launcherBubble = new Bubble(-1, -1, gameState.nextBubbleColor);
        launcherBubble.x = startX;
        launcherBubble.y = startY;
        launcherBubble.draw(ctx);
    }

    // Projectiles & Particles
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

    // Danger Line
    let limitY = (ROWS - 1) * ROW_OFFSET;
    ctx.beginPath();
    ctx.moveTo(0, limitY + RADIUS);
    ctx.lineTo(canvas.width, limitY + RADIUS);
    ctx.strokeStyle = '#FFB7B2';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

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
