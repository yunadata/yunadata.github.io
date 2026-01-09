/**
 * CRYSTAL GUARD - GAME ENGINE
 * Visual Update: Neon / Pixel / Dark Mode
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCnG80OdgMqP6HC2oFymOx95BcBSjNnqAE",
    authDomain: "crystal-guard-db.firebaseapp.com",
    projectId: "crystal-guard-db",
    storageBucket: "crystal-guard-db.firebasestorage.app",
    messagingSenderId: "685143467444",
    appId: "1:685143467444:web:e61787161a461779b63ee1",
    measurementId: "G-4PZEYHZLYW"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- UPDATED NEON THEME COLORS ---
const COLORS = {
    primary: '#d946ef',   // Neon Pink
    secondary: '#06b6d4', // Neon Cyan
    accent: '#facc15',    // Gold
    text: '#e2e8f0',
    
    // Background Tones
    bgDark: '#0f0b1e',    
    bgLight: '#1a162e',   
    path: '#2a2440',
    pathBorder: '#45326e',
    
    // Entities
    enemy: '#000000',      // Shadow Blobs
    enemyGlow: '#a855f7',  // Purple Glow
    enemyBoss: '#ef4444',  // Red Glow for boss
    
    // UI
    uiSelected: 'rgba(217, 70, 239, 0.3)',
    uiRange: 'rgba(6, 182, 212, 0.2)'
};

const TILE_SIZE = 40;
const COLS = 20;
const ROWS = 15;

const bgCanvas = document.createElement('canvas');
bgCanvas.width = 800;
bgCanvas.height = 600;
const bgCtx = bgCanvas.getContext('2d');

let gameLoopId;
let frameCount = 0;
let gameState = {
    gold: 150, lives: 20, maxLives: 20, score: 0, wave: 1,
    enemies: [], towers: [], projectiles: [], particles: [],
    gameOver: true, spawnTimer: 0, enemiesToSpawn: 0,
    selectedTower: null, buildType: 'archer' 
};

// Map Path
const path = [
    {x: 0, y: 2}, {x: 5, y: 2}, {x: 5, y: 8}, 
    {x: 12, y: 8}, {x: 12, y: 4}, {x: 18, y: 4}, {x: 18, y: 10}, 
    {x: 8, y: 10}, {x: 8, y: 13}, {x: 19, y: 13} 
];

// Tower Definitions
const TOWER_TYPES = {
    archer: { name: 'Archer', cost: 50, range: 3.5, damage: 15, cooldown: 30, color: COLORS.primary, type: 'single' },
    mage:   { name: 'Mage', cost: 100, range: 4, damage: 5, cooldown: 45, color: COLORS.secondary, type: 'slow' },
    cannon: { name: 'Cannon', cost: 150, range: 4.5, damage: 30, cooldown: 90, color: '#f87171', type: 'aoe' },
    support:{ name: 'Support', cost: 200, range: 3, damage: 0, cooldown: 0, color: COLORS.accent, type: 'buff' }
};

// --- ENTITIES ---

class Enemy {
    constructor(wave) {
        this.pathIndex = 0;
        this.x = path[0].x * TILE_SIZE; 
        this.y = path[0].y * TILE_SIZE + (TILE_SIZE/2);
        
        let difficultyMult = Math.pow(1.15, wave - 1);
        this.maxHp = 20 * difficultyMult;
        this.hp = this.maxHp;
        this.speed = 1.5 + (wave * 0.05);
        this.radius = 12;
        this.isBoss = false;
        this.color = COLORS.enemyGlow;
        this.slowed = 0; 
        this.value = 5 + Math.floor(wave * 0.5);
        this.wobbleOffset = Math.random() * 10;

        if(wave % 5 === 0) { 
            this.maxHp *= 3;
            this.hp = this.maxHp;
            this.radius = 16;
            this.speed *= 0.7;
            this.isBoss = true;
            this.color = COLORS.enemyBoss; 
        }
    }

    update() {
        let currentSpeed = this.speed;
        if(this.slowed > 0) {
            currentSpeed *= 0.5;
            this.slowed--;
        }
        let target = path[this.pathIndex + 1];
        if(!target) return;
        let tx = target.x * TILE_SIZE + (TILE_SIZE/2);
        let ty = target.y * TILE_SIZE + (TILE_SIZE/2);
        let dx = tx - this.x;
        let dy = ty - this.y;
        let dist = Math.hypot(dx, dy);
        if (dist < currentSpeed) {
            this.x = tx; this.y = ty; this.pathIndex++;
            if (this.pathIndex >= path.length - 1) this.reachedEnd();
        } else {
            this.x += (dx / dist) * currentSpeed;
            this.y += (dy / dist) * currentSpeed;
        }
    }

    draw() {
        let wobble = Math.sin((frameCount + this.wobbleOffset) * 0.2) * 2;
        let stretch = Math.cos((frameCount + this.wobbleOffset) * 0.2) * 2;
        
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillStyle = "#000"; 
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius + stretch, this.radius - stretch, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
        
        ctx.shadowBlur = 0;

        let eyeColor = this.isBoss ? '#ffff00' : '#fff';
        if(this.isBoss) {
            ctx.fillStyle = eyeColor;
            ctx.beginPath(); ctx.arc(-6, -4, 3, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(6, -4, 3, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(0, 5, 4, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.fillStyle = eyeColor;
            ctx.beginPath(); ctx.arc(-4, -2, 2.5, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(4, -2, 2.5, 0, Math.PI*2); ctx.fill();
        }

        if(this.slowed > 0) {
            ctx.strokeStyle = COLORS.secondary;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, this.radius + 5, 0, Math.PI*2); ctx.stroke();
        }
        ctx.restore();

        if(this.hp < this.maxHp) {
            let hpW = 24;
            let hpPct = this.hp / this.maxHp;
            ctx.fillStyle = '#333';
            ctx.fillRect(this.x - hpW/2, this.y - 25, hpW, 4);
            ctx.fillStyle = hpPct > 0.5 ? '#22c55e' : '#ef4444';
            ctx.fillRect(this.x - hpW/2, this.y - 25, hpW * hpPct, 4);
        }
    }

    reachedEnd() {
        this.hp = 0;
        gameState.lives--;
        updateUI();
        createParticles(this.x, this.y, '#ef4444', 15);
        if(gameState.lives <= 0) endGame();
    }
    takeDamage(amount) {
        this.hp -= amount;
        if(this.hp <= 0) {
            gameState.gold += this.value;
            gameState.score += this.value * 10;
            updateUI();
            createParticles(this.x, this.y, this.color, 8);
        }
    }
}

class Tower {
    constructor(c, r, typeKey) {
        this.c = c; this.r = r;
        this.x = c * TILE_SIZE + TILE_SIZE/2;
        this.y = r * TILE_SIZE + TILE_SIZE/2;
        this.typeKey = typeKey;
        this.level = 1;
        const def = TOWER_TYPES[typeKey];
        this.range = def.range * TILE_SIZE;
        this.damage = def.damage;
        this.cooldownMax = def.cooldown;
        this.cooldown = 0;
        this.color = def.color;
        this.buffed = false;
        this.angle = 0;
    }

    upgrade() {
        this.level++;
        this.damage *= 1.3; this.range *= 1.1; this.cooldownMax *= 0.9;
        createParticles(this.x, this.y, this.color, 10);
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ 'event': 'tower_upgrade', 'tower_type': this.typeKey });
    }
    getSellValue() { return Math.floor(TOWER_TYPES[this.typeKey].cost * 0.75); }
    getUpgradeCost() { return Math.floor(TOWER_TYPES[this.typeKey].cost * 0.8 * this.level); }

    update() {
        if (this.typeKey === 'support') {
            this.angle += 0.05;
            gameState.towers.forEach(t => {
                if(t !== this && Math.hypot(t.x - this.x, t.y - this.y) <= this.range) t.buffed = true;
            });
            return;
        }
        if (this.cooldown > 0) this.cooldown--;
        let target = null;
        for (let e of gameState.enemies) {
            let d = Math.hypot(e.x - this.x, e.y - this.y);
            if (d <= (this.buffed ? this.range * 1.2 : this.range)) { target = e; break; }
        }
        if (target) {
            this.angle = Math.atan2(target.y - this.y, target.x - this.x);
            if (this.cooldown <= 0) {
                this.shoot(target);
                this.cooldown = this.buffed ? this.cooldownMax * 0.8 : this.cooldownMax;
            }
        }
        this.buffed = false; 
    }

    shoot(target) {
        let damage = this.buffed ? this.damage * 1.2 : this.damage;
        gameState.projectiles.push(new Projectile(this.x, this.y, target, damage, TOWER_TYPES[this.typeKey].type, this.color));
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = '#334155';
        ctx.fillRect(-14, -14, 28, 28);
        ctx.fillStyle = '#475569'; 
        ctx.fillRect(-14, -14, 28, 4);
        ctx.fillRect(-14, -14, 4, 28);
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        
        if (this.typeKey === 'archer') {
            ctx.rotate(this.angle);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.moveTo(10, 0); ctx.lineTo(-8, 6); ctx.lineTo(-8, -6);
            ctx.fill();
        } 
        else if (this.typeKey === 'mage') {
            let float = Math.sin(frameCount * 0.1) * 3;
            ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.arc(0, float, 8, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.ellipse(0, float, 12, 4, frameCount*0.1, 0, Math.PI*2); ctx.stroke();
        } 
        else if (this.typeKey === 'cannon') {
            ctx.rotate(this.angle);
            ctx.fillStyle = '#94a3b8'; 
            ctx.fillRect(-2, -6, 16, 12);
            ctx.fillStyle = this.color; 
            ctx.fillRect(0, -3, 8, 6);
        } 
        else if (this.typeKey === 'support') {
            ctx.rotate(this.angle);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(10, 10); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(-10, 10); ctx.stroke();
        }

        if(this.buffed) {
            ctx.shadowBlur = 0;
            ctx.strokeStyle = COLORS.accent;
            ctx.lineWidth = 2;
            ctx.strokeRect(-16, -16, 32, 32);
        }

        ctx.restore();
        
        let startX = this.x - ((this.level-1) * 6) / 2;
        for(let i=0; i<this.level; i++) {
            ctx.fillStyle = COLORS.accent;
            ctx.beginPath(); ctx.arc(startX + (i*8), this.y - 20, 2, 0, Math.PI*2); ctx.fill();
        }
    }
}

class Projectile {
    constructor(x, y, target, damage, type, color) {
        this.x = x; this.y = y; this.target = target;
        this.damage = damage; this.type = type; this.color = color;
        this.speed = 10; this.active = true; this.tail = [];
    }
    update() {
        if(!this.target || this.target.hp <= 0) { this.active = false; return; }
        this.tail.push({x: this.x, y: this.y});
        if(this.tail.length > 8) this.tail.shift(); 
        
        let dx = this.target.x - this.x;
        let dy = this.target.y - this.y;
        let dist = Math.hypot(dx, dy);
        if(dist < this.speed) this.hit();
        else { this.x += (dx/dist)*this.speed; this.y += (dy/dist)*this.speed; }
    }
    hit() {
        this.active = false;
        if(this.type === 'aoe') {
            createParticles(this.x, this.y, '#fff', 10);
            ctx.shadowBlur = 20; ctx.shadowColor = this.color;
            ctx.fillStyle = this.color; 
            ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.arc(this.x, this.y, 40, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1; ctx.shadowBlur = 0;
            gameState.enemies.forEach(e => { if(Math.hypot(e.x-this.x, e.y-this.y)<60) e.takeDamage(this.damage); });
        } else {
            this.target.takeDamage(this.damage);
            if(this.type === 'slow') { this.target.slowed = 60; createParticles(this.x, this.y, COLORS.secondary, 5); }
        }
    }
    draw() {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        for(let p of this.tail) ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = Math.random() * 3 + 1;
        this.life = 1.0;
        this.decay = 0.05;
    }
    update() { this.x+=Math.cos(this.angle)*this.speed; this.y+=Math.sin(this.angle)*this.speed; this.life-=this.decay; }
    draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.fillRect(this.x, this.y, 3, 3); 
        ctx.globalAlpha = 1;
    }
}
function createParticles(x, y, color, count) { for(let i=0; i<count; i++) gameState.particles.push(new Particle(x, y, color)); }

// --- GRAPHICS ---

function isPath(c, r) {
    for(let i=0; i<path.length-1; i++) {
        let p1 = path[i], p2 = path[i+1];
        if (c >= Math.min(p1.x, p2.x) && c <= Math.max(p1.x, p2.x) && r >= Math.min(p1.y, p2.y) && r <= Math.max(p1.y, p2.y)) return true;
    }
    return false;
}

function initBackground() {
    bgCtx.fillStyle = COLORS.bgDark;
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    
    bgCtx.strokeStyle = 'rgba(255,255,255,0.03)';
    bgCtx.lineWidth = 1;
    for(let y=0; y<ROWS; y++) {
        bgCtx.beginPath(); bgCtx.moveTo(0, y*TILE_SIZE); bgCtx.lineTo(800, y*TILE_SIZE); bgCtx.stroke();
    }
    for(let x=0; x<COLS; x++) {
        bgCtx.beginPath(); bgCtx.moveTo(x*TILE_SIZE, 0); bgCtx.lineTo(x*TILE_SIZE, 600); bgCtx.stroke();
    }

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (isPath(c, r)) {
                let x = c * TILE_SIZE, y = r * TILE_SIZE;
                bgCtx.fillStyle = COLORS.path;
                bgCtx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                bgCtx.fillStyle = COLORS.pathBorder;
                bgCtx.fillRect(x, y, TILE_SIZE, 2); 
                bgCtx.fillRect(x, y + TILE_SIZE - 2, TILE_SIZE, 2); 
            } else {
                if(Math.random() > 0.98) {
                    bgCtx.fillStyle = 'rgba(255,255,255,0.1)';
                    bgCtx.fillRect(c*TILE_SIZE + Math.random()*30, r*TILE_SIZE + Math.random()*30, 2, 2);
                }
            }
        }
    }
}

function drawCrystal(x, y) {
    let hover = 4 * Math.sin(frameCount * 0.05);
    let cy = y + hover;

    ctx.save();
    ctx.translate(x, cy);
    
    let pulse = 20 + 10 * Math.sin(frameCount * 0.1);
    ctx.shadowBlur = pulse;
    ctx.shadowColor = COLORS.secondary;
    
    ctx.fillStyle = '#cffafe'; 
    ctx.beginPath();
    ctx.moveTo(0, -35);
    ctx.lineTo(15, -25);
    ctx.lineTo(15, 25);
    ctx.lineTo(0, 35);
    ctx.lineTo(-15, 25);
    ctx.lineTo(-15, -25);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = COLORS.secondary;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -35); ctx.lineTo(0, 35); 
    ctx.stroke();
    ctx.globalAlpha = 1.0;
    
    ctx.restore();

    let hpPct = gameState.lives / gameState.maxLives;
    if (hpPct < 0) hpPct = 0;
    ctx.fillStyle = '#333';
    ctx.fillRect(x - 20, y + 40, 40, 6);
    ctx.fillStyle = COLORS.secondary;
    ctx.shadowBlur = 10;
    ctx.fillRect(x - 20, y + 40, 40 * hpPct, 6);
    ctx.shadowBlur = 0;
}

// --- GAME LOGIC ---

function startGame() {
    gameState = {
        gold: 150, lives: 20, maxLives: 20, score: 0, wave: 1,
        enemies: [], towers: [], projectiles: [], particles: [],
        gameOver: false, spawnTimer: 0, enemiesToSpawn: 5,
        selectedTower: null, buildType: 'archer'
    };
    
    // REMOVE Game Over Mode class so scrolling works again
    document.getElementById('overlay').classList.remove('mode-game-over');
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('leaderboard-display').classList.add('hidden');
    document.getElementById('submit-score-container').classList.add('hidden');
    updateUI();
    
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 
    'event': 'game_start',
    'game_name': 'Crystal Guard' 
});
    
    if(gameLoopId) cancelAnimationFrame(gameLoopId);
    initBackground();
    gameLoop();
}

function gameLoop() {
    if(gameState.gameOver) return;

    ctx.drawImage(bgCanvas, 0, 0);


    if(gameState.enemiesToSpawn > 0) {
        gameState.spawnTimer++;
        if(gameState.spawnTimer > 40) { 
            gameState.enemies.push(new Enemy(gameState.wave));
            gameState.enemiesToSpawn--;
            gameState.spawnTimer = 0;
        }
    } else if (gameState.enemies.length === 0) {
        gameState.wave++;
        gameState.enemiesToSpawn = 5 + Math.floor(gameState.wave * 1.5);
        gameState.spawnTimer = -120; 
        updateUI();
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ 'event': 'wave_complete', 'wave_number': gameState.wave - 1 });
    }

    gameState.towers.forEach(t => { t.update(); t.draw(); });
	
	let end = path[path.length-1];
    drawCrystal(end.x*TILE_SIZE + TILE_SIZE/2, end.y*TILE_SIZE + TILE_SIZE/2);

    gameState.enemies.sort((a,b) => a.y - b.y);
    for(let i = gameState.enemies.length - 1; i >= 0; i--) {
        let e = gameState.enemies[i];
        e.update(); e.draw();
        if(e.hp <= 0) gameState.enemies.splice(i, 1);
    }

    for(let i = gameState.projectiles.length - 1; i >= 0; i--) {
        let p = gameState.projectiles[i];
        p.update(); p.draw();
        if(!p.active) gameState.projectiles.splice(i, 1);
    }

    for(let i = gameState.particles.length - 1; i >= 0; i--) {
        let p = gameState.particles[i];
        p.update(); p.draw();
        if(p.life <= 0) gameState.particles.splice(i, 1);
    }

    drawPlacementPreview();
    frameCount++;
    gameLoopId = requestAnimationFrame(gameLoop);
}

// --- INPUT & UI ---
let mouseX = 0, mouseY = 0;
canvas.addEventListener('mousemove', (e) => {
    let rect = canvas.getBoundingClientRect();
    let scaleX = canvas.width / rect.width;
    let scaleY = canvas.height / rect.height;
    mouseX = (e.clientX - rect.left) * scaleX;
    mouseY = (e.clientY - rect.top) * scaleY;
});

function drawPlacementPreview() {
    let c = Math.floor(mouseX / TILE_SIZE);
    let r = Math.floor(mouseY / TILE_SIZE);

    if(gameState.selectedTower) {
        let t = gameState.selectedTower;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(t.c * TILE_SIZE, t.r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = COLORS.uiRange; ctx.beginPath();
        let range = t.buffed ? t.range * 1.2 : t.range;
        ctx.arc(t.x, t.y, range, 0, Math.PI*2); ctx.fill();
        return;
    }

    if(c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    
    let onPath = isPath(c, r);
    let hasTower = gameState.towers.some(t => t.c === c && t.r === r);

    if(!onPath && !hasTower) {
        ctx.fillStyle = COLORS.uiSelected;
        ctx.fillRect(c*TILE_SIZE, r*TILE_SIZE, TILE_SIZE, TILE_SIZE);
        let range = TOWER_TYPES[gameState.buildType].range * TILE_SIZE;
        ctx.beginPath(); ctx.strokeStyle = TOWER_TYPES[gameState.buildType].color;
        ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
        ctx.arc(c*TILE_SIZE + TILE_SIZE/2, r*TILE_SIZE + TILE_SIZE/2, range, 0, Math.PI*2);
        ctx.stroke(); ctx.setLineDash([]);
    } else {
        ctx.fillStyle = 'rgba(255, 51, 102, 0.3)';
        ctx.fillRect(c*TILE_SIZE, r*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
}

canvas.addEventListener('mousedown', (e) => {
    if(gameState.gameOver) return;
    let c = Math.floor(mouseX / TILE_SIZE);
    let r = Math.floor(mouseY / TILE_SIZE);
    let clickedTower = gameState.towers.find(t => t.c === c && t.r === r);
    
    if(clickedTower) {
        gameState.selectedTower = clickedTower;
        updateUI();
        return;
    } else {
        gameState.selectedTower = null;
        updateUI();
    }

    if(!isPath(c, r)) {
        let cost = TOWER_TYPES[gameState.buildType].cost;
        if(gameState.gold >= cost) {
            gameState.gold -= cost;
            gameState.towers.push(new Tower(c, r, gameState.buildType));
            updateUI();
        }
    }
});

function selectTowerType(type) {
    gameState.buildType = type;
    gameState.selectedTower = null;
    updateUI();
}

function updateUI() {
    document.getElementById('wave-display').innerText = gameState.wave;
    document.getElementById('gold-display').innerText = gameState.gold;
    document.getElementById('lives-display').innerText = gameState.lives;
    document.getElementById('score-display').innerText = gameState.score;

    ['archer', 'mage', 'cannon', 'support'].forEach(t => {
        let el = document.getElementById('btn-' + t);
        if(t === gameState.buildType) el.classList.add('active');
        else el.classList.remove('active');
    });

    const upPanel = document.getElementById('upgrade-panel');
    if(gameState.selectedTower) {
        upPanel.style.visibility = 'visible';
        document.getElementById('upgrade-cost').innerText = gameState.selectedTower.getUpgradeCost();
    } else {
        upPanel.style.visibility = 'hidden';
    }
}

function upgradeSelectedTower() {
    if(gameState.selectedTower) {
        let cost = gameState.selectedTower.getUpgradeCost();
        if(gameState.gold >= cost) {
            gameState.gold -= cost;
            gameState.selectedTower.upgrade();
            updateUI();
        }
    }
}
function sellSelectedTower() {
    if(gameState.selectedTower) {
        gameState.gold += gameState.selectedTower.getSellValue();
        gameState.towers = gameState.towers.filter(t => t !== gameState.selectedTower);
        gameState.selectedTower = null;
        updateUI();
    }
}

function endGame() {
    gameState.gameOver = true;
    
    // ADD Game Over Mode class to force Fullscreen Modal
    document.getElementById('overlay').classList.add('mode-game-over');
    document.getElementById('overlay').classList.remove('hidden');
    
    document.getElementById('overlay-title').innerText = "SYSTEM FAILURE";
    document.getElementById('overlay-desc').innerText = "The Crystal has shattered.";
    document.getElementById('start-btn').innerText = "REBOOT SYSTEM";
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('submit-score-container').classList.remove('hidden');
    document.getElementById('final-score').innerText = gameState.score;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 
		'event': 'game_complete', 
		'game_name': 'Crystal Guard',
		'game_score': gameState.score 
	});
    fetchLeaderboard();
}

async function submitScore() {
    const nameInput = document.getElementById('player-name');
    let name = nameInput.value.trim().toUpperCase();
    if (!name) return alert("ENTER AGENT NAME");
    const btn = document.querySelector('#submit-score-container .btn-game');
    btn.disabled = true; btn.innerText = "UPLOADING...";

    try {
        const safeID = name.toLowerCase().replace(/\s+/g, '');
        const userScoreRef = doc(db, "leaderboard", safeID);
        const docSnap = await getDoc(userScoreRef);
        const newScore = parseInt(gameState.score);
        const newWave = parseInt(gameState.wave);

        if (docSnap.exists()) {
            if (newScore > docSnap.data().score) {
                await setDoc(userScoreRef, { name, score: newScore, wave: newWave, timestamp: Date.now() });
                alert("NEW RECORD SYNCED");
            } else alert("PREVIOUS RECORD RETAINED");
        } else {
            await setDoc(userScoreRef, { name, score: newScore, wave: newWave, timestamp: Date.now() });
            alert("SCORE UPLOADED");
        }
        
        // --- GA4 FIX: Actually sending the event now ---
        window.dataLayer = window.dataLayer || [];
       window.dataLayer.push({ 
			'event': 'score_submission',
			'game_name': 'Crystal Guard',
			'score': newScore 
		});

        document.getElementById('submit-score-container').classList.add('hidden');
        fetchLeaderboard();
    } catch (e) { console.error("Error", e); alert("CONNECTION ERROR"); } 
    finally { btn.disabled = false; btn.innerText = "UPLOAD"; }
}

async function fetchLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    const container = document.getElementById('leaderboard-display');
    container.classList.remove('hidden');
    list.innerHTML = "ACCESSING DATABASE...";
    try {
        const q = query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(10));
        const querySnapshot = await getDocs(q);
        let html = "";
        if (querySnapshot.empty) html = "<div style='text-align:center'>NO DATA FOUND</div>";
        else {
            let rank = 1;
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                html += `<div class="score-entry"><span>${rank}. ${data.name}</span><span style="color:var(--accent);">${data.score}</span></div>`;
                rank++;
            });
        }
        list.innerHTML = html;
    } catch (error) { list.innerHTML = "CONNECTION FAILED"; }
}

window.startGame = startGame;
window.selectTowerType = selectTowerType;
window.upgradeSelectedTower = upgradeSelectedTower;
window.sellSelectedTower = sellSelectedTower;
window.submitScore = submitScore;

initBackground();
ctx.drawImage(bgCanvas, 0, 0);
let endPos = path[path.length-1];
drawCrystal(endPos.x*TILE_SIZE + TILE_SIZE/2, endPos.y*TILE_SIZE + TILE_SIZE/2);



// --- DYNAMIC FOOTER DATE ---
const yearSpan = document.getElementById('copyright-year');
if (yearSpan) {
    const startYear = 2025;
    const currentYear = new Date().getFullYear();
    if (currentYear > startYear) {
        yearSpan.textContent = `${startYear}–${currentYear}`;
    }
}
