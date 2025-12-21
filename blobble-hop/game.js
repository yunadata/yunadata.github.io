/**
 * BLOBBLE HOP - GAME ENGINE
 * Genre: Endless Platformer
 * Tech: HTML5 Canvas + Firebase Firestore
 */

// --- FIREBASE IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    query, 
    orderBy, 
    limit 
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// --- FIREBASE CONFIGURATION (BLOBBLE HOP) ---
const firebaseConfig = {
    apiKey: "AIzaSyCAHKiRI6XHR4ApJtI69gpXmMihQr75oYw",
    authDomain: "blobble-hop.firebaseapp.com",
    projectId: "blobble-hop",
    storageBucket: "blobble-hop.firebasestorage.app",
    messagingSenderId: "87616394766",
    appId: "1:87616394766:web:0ed30f35de45af5158ce5f",
    measurementId: "G-MZJ447NTXL"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- GAME CONSTANTS (ADJUSTED FOR BETTER JUMPS) ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;

// PHYSICS TWEAKS:
const GRAVITY = 0.5;        // Lowered from 0.6 for floatier jumps
const FRICTION = 0.92;      // Increased from 0.8 (Higher number = less drag)
const ACCELERATION = 1.0;   // How fast you speed up
const MAX_SPEED = 8;        // Maximum horizontal speed cap
const JUMP_FORCE = -13;     // Increased from -12 for higher jumps

const WALL_JUMP_FORCE_X = 9;
const WALL_JUMP_FORCE_Y = -11;

// Colors
const PALETTE = {
    player: '#FFB7B2',      // Pink
    playerFace: '#4A4A4A',
    bg: '#E0F7FA',
    platform: '#ffffff',
    platformBorder: '#C7CEEA',
    jelly: '#B5EAD7',       // Mint (Bouncy)
    hazard: '#FF6B6B',      // Red (Spikes)
    collectible: '#FF9F1C', // Orange
    particles: ['#FFB7B2', '#B5EAD7', '#E2F0CB']
};

// --- GAME STATE ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameLoopId;
let frameCount = 0;
let cameraX = 0;

let gameState = {
    active: false,
    score: 0,
    distance: 0,
    gameOver: false,
    platforms: [],
    particles: [],
    collectibles: [],
    hazards: []
};

// Player Object
let player = {
    x: 100, y: 200,
    w: 30, h: 30,
    vx: 0, vy: 0,
    grounded: false,
    wallSliding: false,
    wallDir: 0, // -1 left, 1 right
    // Animation properties
    scaleX: 1,
    scaleY: 1,
    faceOffset: 0
};

// Controls
const keys = {
    ArrowRight: false,
    ArrowLeft: false,
    Space: false
};

// --- CLASSES ---

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = (Math.random() - 0.5) * 6;
        this.size = Math.random() * 5 + 2;
        this.color = color;
        this.life = 1.0;
        this.decay = 0.03;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }
    draw(ctx, camX) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y, this.size, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class Platform {
    constructor(x, y, w, type = 'normal') {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = 20;
        this.type = type; // normal, jelly
    }

    draw(ctx, camX) {
        let drawX = this.x - camX;
        
        // Skip drawing if off screen
        if(drawX + this.w < 0 || drawX > CANVAS_WIDTH) return;

        ctx.fillStyle = this.type === 'jelly' ? PALETTE.jelly : PALETTE.platform;
        ctx.strokeStyle = PALETTE.platformBorder;
        ctx.lineWidth = 2;

        // Rounded box
        ctx.beginPath();
        ctx.roundRect(drawX, this.y, this.w, this.h, 5);
        ctx.fill();
        ctx.stroke();

        // Decoration
        if(this.type === 'jelly') {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.ellipse(drawX + this.w/2, this.y + 5, this.w/3, 3, 0, 0, Math.PI*2);
            ctx.fill();
        }
    }
}

// --- CORE FUNCTIONS ---

function initGame() {
    gameState.active = true;
    gameState.gameOver = false;
    gameState.score = 0;
    gameState.distance = 0;
    cameraX = 0;
    frameCount = 0;

    // Reset Player
    player.x = 100;
    player.y = 250;
    player.vx = 0;
    player.vy = 0;
    player.scaleX = 1;
    player.scaleY = 1;

    gameState.platforms = [];
    gameState.collectibles = [];
    gameState.hazards = [];
    gameState.particles = [];

    // Starting platforms
    gameState.platforms.push(new Platform(50, 350, 400)); // Ground
    generateChunk(450);

    // Reset UI
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('overlay').classList.remove('mode-game-over');
    document.getElementById('submit-score-container').classList.add('hidden');
    document.getElementById('game-message').innerText = "Go!";

    if(gameLoopId) cancelAnimationFrame(gameLoopId);
    loop();
}

// Procedural Generation
function generateChunk(startX) {
    let currentX = startX;
    // Generate 5 platforms ahead
    for(let i=0; i<5; i++) {
        let gap = 100 + Math.random() * 80;
        let y = 150 + Math.random() * 200; // Random height between 150 and 350
        let w = 80 + Math.random() * 100;
        let type = Math.random() > 0.8 ? 'jelly' : 'normal';

        let p = new Platform(currentX + gap, y, w, type);
        gameState.platforms.push(p);

        // Chance for Collectible
        if(Math.random() > 0.6) {
            gameState.collectibles.push({
                x: p.x + p.w/2,
                y: p.y - 30,
                r: 8,
                collected: false
            });
        }

        // Chance for Hazard (Spike)
        if(Math.random() > 0.8 && p.w > 100 && type !== 'jelly') {
            gameState.hazards.push({
                x: p.x + Math.random() * (p.w - 30) + 15,
                y: p.y - 10,
                w: 20,
                h: 10
            });
        }

        currentX += gap + w;
    }
}

function updatePhysics() {
    // 1. Controls (Updated with ACCELERATION constant)
    if (keys.ArrowRight) player.vx += ACCELERATION;
    if (keys.ArrowLeft) player.vx -= ACCELERATION;

    // Friction & Gravity
    player.vx *= FRICTION;
    player.vy += GRAVITY;

    // CAP MAX SPEED (Prevents uncontrollable speed)
    if(player.vx > MAX_SPEED) player.vx = MAX_SPEED;
    if(player.vx < -MAX_SPEED) player.vx = -MAX_SPEED;

    // Terminal velocity
    if(player.vy > 15) player.vy = 15;

    // 2. Position Update
    player.x += player.vx;
    player.y += player.vy;

    // 3. Collision Detection
    player.grounded = false;
    player.wallSliding = false;

    // Floor/Platform Collision
    for(let p of gameState.platforms) {
        // Check if player is falling onto platform
        if(player.vy > 0 && 
           player.y + player.h/2 > p.y && 
           player.y + player.h/2 < p.y + p.h + 10 &&
           player.x + player.w/2 > p.x && 
           player.x - player.w/2 < p.x + p.w) {
            
            player.y = p.y - player.h/2;
            player.vy = 0;
            player.grounded = true;
            
            // Squash on land
            if(player.scaleY === 1) {
                player.scaleY = 0.7;
                player.scaleX = 1.3;
                createBurst(player.x, player.y + 15, '#fff', 3);
            }

            if(p.type === 'jelly') {
                player.vy = -18; // Super Jump
                player.scaleY = 1.4;
                player.scaleX = 0.7;
                createBurst(player.x, player.y, PALETTE.jelly, 8);
            }
        }
        
        // Simple Wall Collision (Left/Right of platform)
        // Only if not grounded
        if(!player.grounded) {
             if (player.x + player.w/2 > p.x && player.x - player.w/2 < p.x + p.w &&
                 player.y > p.y && player.y < p.y + p.h) {
                 
                 // Hitting left side or right side?
                 if(player.vx > 0) { // Hitting left
                     player.x = p.x - player.w/2;
                     player.wallDir = 1;
                 } else if (player.vx < 0) { // Hitting right
                     player.x = p.x + p.w + player.w/2;
                     player.wallDir = -1;
                 }
                 player.vx = 0;
                 player.wallSliding = true;
                 // Wall slide friction
                 if(player.vy > 2) player.vy = 2; 
             }
        }
    }

    // 4. Collectibles
    gameState.collectibles.forEach(c => {
        if(!c.collected) {
            let dx = player.x - c.x;
            let dy = player.y - c.y;
            if(Math.hypot(dx, dy) < player.w + c.r) {
                c.collected = true;
                gameState.score += 50;
                document.getElementById('game-message').innerText = "Sweet!";
                createBurst(c.x, c.y, PALETTE.collectible, 5);
            }
        }
    });

    // 5. Hazards
    gameState.hazards.forEach(h => {
        if(player.x > h.x - 10 && player.x < h.x + h.w + 10 &&
           player.y + player.h/2 > h.y) {
            gameOver("Spiked!");
        }
    });

    // 6. Death by falling
    if(player.y > CANVAS_HEIGHT + 100) {
        gameOver("Fell into the abyss...");
    }

    // 7. Cleanup & Generation
    // Remove platforms far behind
    if(gameState.platforms[0].x + gameState.platforms[0].w < cameraX - 100) {
        gameState.platforms.shift();
    }
    // Generate new if needed
    let lastPlat = gameState.platforms[gameState.platforms.length - 1];
    if(lastPlat.x < cameraX + CANVAS_WIDTH + 200) {
        generateChunk(lastPlat.x + lastPlat.w);
    }

    // 8. Animation Scaling restoration
    player.scaleX += (1 - player.scaleX) * 0.1;
    player.scaleY += (1 - player.scaleY) * 0.1;

    // 9. Camera Follow
    let targetCamX = player.x - CANVAS_WIDTH * 0.3;
    if(targetCamX < 0) targetCamX = 0;
    // Smooth camera
    cameraX += (targetCamX - cameraX) * 0.1;

    // Update Distance Score
    let dist = Math.floor(player.x / 10);
    if(dist > gameState.distance) gameState.distance = dist;
}

function jump() {
    if(player.grounded) {
        player.vy = JUMP_FORCE;
        player.scaleY = 1.3;
        player.scaleX = 0.7;
        player.grounded = false;
    } else if (player.wallSliding) {
        player.vy = WALL_JUMP_FORCE_Y;
        player.vx = -player.wallDir * WALL_JUMP_FORCE_X;
        player.wallSliding = false;
        createBurst(player.x + (player.wallDir * 15), player.y, '#fff', 5);
    }
}

function createBurst(x, y, color, count) {
    for(let i=0; i<count; i++) {
        gameState.particles.push(new Particle(x, y, color));
    }
}

function draw() {
    // Clear
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Platforms
    gameState.platforms.forEach(p => p.draw(ctx, cameraX));

    // Draw Hazards (Spikes)
    gameState.hazards.forEach(h => {
        let dx = h.x - cameraX;
        if(dx > -50 && dx < CANVAS_WIDTH) {
            ctx.fillStyle = PALETTE.hazard;
            ctx.beginPath();
            ctx.moveTo(dx, h.y + h.h);
            ctx.lineTo(dx + h.w/2, h.y);
            ctx.lineTo(dx + h.w, h.y + h.h);
            ctx.fill();
        }
    });

    // Draw Collectibles
    gameState.collectibles.forEach(c => {
        if(!c.collected) {
            let cx = c.x - cameraX;
            if(cx > -50 && cx < CANVAS_WIDTH) {
                let float = Math.sin(frameCount * 0.1) * 3;
                ctx.fillStyle = PALETTE.collectible;
                ctx.shadowBlur = 10;
                ctx.shadowColor = PALETTE.collectible;
                ctx.beginPath();
                ctx.arc(cx, c.y + float, c.r, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                
                // Shine
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(cx - 2, c.y + float - 2, 2, 0, Math.PI*2);
                ctx.fill();
            }
        }
    });

    // Draw Particles
    gameState.particles.forEach(p => p.draw(ctx, cameraX));

    // Draw Player
    drawPlayer();

    // UI Update
    document.getElementById('score-display').innerText = gameState.score;
    document.getElementById('distance-display').innerText = gameState.distance + "m";
}

function drawPlayer() {
    let px = player.x - cameraX;
    let py = player.y;

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(player.scaleX, player.scaleY);

    // Body
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    // A simplified blob shape (rounded rect but softer)
    ctx.ellipse(0, 0, player.w/2, player.h/2, 0, 0, Math.PI*2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(-5, -5, 4, 3, Math.PI/4, 0, Math.PI*2);
    ctx.fill();

    // Face (Eyes)
    ctx.fillStyle = PALETTE.playerFace;
    let lookDir = player.vx > 0.1 ? 4 : (player.vx < -0.1 ? -4 : 0);
    
    // Blink logic
    if (frameCount % 120 > 115) {
        // Blink (closed eyes)
        ctx.beginPath();
        ctx.moveTo(-5 + lookDir, -2); ctx.lineTo(-1 + lookDir, -2);
        ctx.moveTo(1 + lookDir, -2); ctx.lineTo(5 + lookDir, -2);
        ctx.stroke();
    } else {
        // Open eyes
        ctx.beginPath();
        ctx.arc(-3 + lookDir, -2, 2, 0, Math.PI*2);
        ctx.arc(3 + lookDir, -2, 2, 0, Math.PI*2);
        ctx.fill();
    }

    ctx.restore();
}

function loop() {
    if(gameState.gameOver) return;

    updatePhysics();
    
    // Update Particles
    for(let i = gameState.particles.length - 1; i >= 0; i--) {
        let p = gameState.particles[i];
        p.update();
        if(p.life <= 0) gameState.particles.splice(i, 1);
    }

    draw();

    frameCount++;
    gameLoopId = requestAnimationFrame(loop);
}

function gameOver(reason) {
    gameState.gameOver = true;
    gameState.active = false;
    
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('overlay').classList.add('mode-game-over');
    
    document.getElementById('overlay-title').innerText = "GAME OVER";
    document.getElementById('overlay-desc').innerText = reason;
    
    let totalScore = gameState.score + gameState.distance;
    document.getElementById('final-score').innerText = totalScore;
    document.getElementById('submit-score-container').classList.remove('hidden');
    document.getElementById('start-btn').innerText = "TRY AGAIN";
    document.getElementById('start-btn').classList.remove('hidden');

    fetchLeaderboard();
}

// --- CONTROLS EVENT LISTENERS ---

window.addEventListener('keydown', (e) => {
    if(e.code === 'Space') {
        if(!gameState.active && document.getElementById('overlay').classList.contains('hidden') === false) {
             // Block space if in menu
        } else {
             keys.Space = true;
             jump();
        }
        e.preventDefault(); // Stop scrolling
    }
    if(e.code === 'ArrowRight') keys.ArrowRight = true;
    if(e.code === 'ArrowLeft') keys.ArrowLeft = true;
});

window.addEventListener('keyup', (e) => {
    if(e.code === 'Space') keys.Space = false;
    if(e.code === 'ArrowRight') keys.ArrowRight = false;
    if(e.code === 'ArrowLeft') keys.ArrowLeft = false;
});

// Touch Controls
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnJump = document.getElementById('btn-jump');

const addTouch = (elem, code) => {
    elem.addEventListener('touchstart', (e) => { e.preventDefault(); keys[code] = true; if(code==='Space') jump(); });
    elem.addEventListener('touchend', (e) => { e.preventDefault(); keys[code] = false; });
    elem.addEventListener('mousedown', (e) => { keys[code] = true; if(code==='Space') jump(); });
    elem.addEventListener('mouseup', (e) => { keys[code] = false; });
};

addTouch(btnLeft, 'ArrowLeft');
addTouch(btnRight, 'ArrowRight');
addTouch(btnJump, 'Space');


// --- LEADERBOARD & GLOBAL EXPORTS ---

async function submitScore() {
    const nameInput = document.getElementById('player-name');
    let name = nameInput.value.trim();
    if (!name) return alert("Please enter a name!");
    
    // UI Feedback
    const btn = document.querySelector('#submit-score-container .btn-game');
    btn.disabled = true;
    btn.innerText = "Checking...";

    let totalScore = gameState.score + gameState.distance;

    try {
        // 1. Create a predictable ID based on the name (e.g., "David" -> "david")
        // REMOVED the random number part so it always points to the same user doc
        const safeID = name.toLowerCase().replace(/\s+/g, '');
        
        const userScoreRef = doc(db, "leaderboard", safeID);
        const docSnap = await getDoc(userScoreRef);
        
        // 2. Check if this user already exists
        if (docSnap.exists()) {
            const existingData = docSnap.data();
            
            // 3. Only update if the NEW score is HIGHER
            if (totalScore > existingData.score) {
                await setDoc(userScoreRef, {
                    name: name, // Keep original casing (e.g. "David")
                    score: totalScore,
                    timestamp: Date.now()
                });
                alert("New High Score Uploaded!");
            } else {
                alert(`Nice try! But your best score is still ${existingData.score}.`);
            }
        } else {
            // 4. User doesn't exist yet, create their first entry
            await setDoc(userScoreRef, {
                name: name,
                score: totalScore,
                timestamp: Date.now()
            });
            alert("Score Uploaded!");
        }

        document.getElementById('submit-score-container').classList.add('hidden');
        fetchLeaderboard();

    } catch (e) {
        console.error("Error adding score: ", e);
        alert("Upload failed. Check console.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Submit Score";
    }
}

async function fetchLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    const container = document.getElementById('leaderboard-display');
    
    container.classList.remove('hidden');
    list.innerHTML = "Fetching global scores...";

    try {
        const q = query(
            collection(db, "leaderboard"), 
            orderBy("score", "desc"), 
            limit(10)
        );

        const querySnapshot = await getDocs(q);
        let html = "";
        
        if (querySnapshot.empty) {
            html = "<div style='text-align:center'>No scores yet!</div>";
        } else {
            let rank = 1;
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                html += `
                <div class="score-entry">
                    <span>#${rank}. ${data.name}</span>
                    <span style="color:var(--gold); font-weight:bold;">${data.score}</span>
                </div>`;
                rank++;
            });
        }
        list.innerHTML = html;
        
    } catch (error) {
        console.error("Error fetching leaderboard: ", error);
        list.innerHTML = "Error loading scores.";
    }
}

// Global functions for HTML buttons
window.startGame = initGame;
window.submitScore = submitScore;

// Initial render for the menu background
function menuLoop() {
    if(!gameState.active) {
        // Just draw the blob gently bouncing in center
        ctx.clearRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
        
        // Draw some decorative platforms
        let float = Math.sin(Date.now() * 0.002) * 20;
        
        ctx.fillStyle = PALETTE.player;
        ctx.beginPath();
        ctx.ellipse(CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + float, 20, 20, 0, 0, Math.PI*2);
        ctx.fill();
        
        // Eyes
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(CANVAS_WIDTH/2 - 5, CANVAS_HEIGHT/2 + float - 2, 2, 0, Math.PI*2);
        ctx.arc(CANVAS_WIDTH/2 + 5, CANVAS_HEIGHT/2 + float - 2, 2, 0, Math.PI*2);
        ctx.fill();
        
        requestAnimationFrame(menuLoop);
    }
}
menuLoop();
