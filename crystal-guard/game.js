/**
 * CRYSTAL GUARD - GAME ENGINE
 * Portfolio Version: Pastel & Glassmorphism Update
 * Backend: Firebase Firestore (v12.7.0)
 */

// --- FIREBASE IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js";
import { 
    getFirestore, 
    collection, 
    doc,        // Required for specific user IDs
    setDoc,     // Required to write/overwrite specific IDs
    getDoc,     // Required to check existing scores
    getDocs, 
    query, 
    orderBy, 
    limit 
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCnG80OdgMqP6HC2oFymOx95BcBSjNnqAE",
    authDomain: "crystal-guard-db.firebaseapp.com",
    projectId: "crystal-guard-db",
    storageBucket: "crystal-guard-db.firebasestorage.app",
    messagingSenderId: "685143467444",
    appId: "1:685143467444:web:e61787161a461779b63ee1",
    measurementId: "G-4PZEYHZLYW"
};

// --- INITIALIZE FIREBASE ---
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// --- GAME SETUP ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- THEME COLORS ---
const COLORS = {
    primary: '#FFC4D6',   // Soft Pink
    secondary: '#CCD5FF', // Soft Blue
    accent: '#FFE5B4',    // Soft Gold
    text: '#4A4A4A',
    grassLight: '#eefcf5',
    grassDark: '#d5f5e3',
    path: '#fff8e1',
    pathBorder: '#FFE5B4',
    enemy: '#636e72',      
    enemyBoss: '#f1c40f',
    uiSelected: 'rgba(255, 196, 214, 0.4)',
    uiRange: 'rgba(204, 213, 255, 0.3)'
};

// --- GAME CONSTANTS ---
const TILE_SIZE = 40;
const COLS = 20;
const ROWS = 15;

// --- PRE-RENDERED BACKGROUND ---
const bgCanvas = document.createElement('canvas');
bgCanvas.width = 800;
bgCanvas.height = 600;
const bgCtx = bgCanvas.getContext('2d');

// --- GAME STATE ---
let gameLoopId;
let frameCount = 0;
let gameState = {
    gold: 150,
    lives: 20,
    maxLives: 20,
    score: 0,
    wave: 1,
    enemies: [],
    towers: [],
    projectiles: [],
    particles: [],
    gameOver: true,
    spawnTimer: 0,
    enemiesToSpawn: 0,
    selectedTower: null,
    buildType: 'archer' 
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
    cannon: { name: 'Cannon', cost: 150, range: 4.5, damage: 30, cooldown: 90, color: '#95a5a6', type: 'aoe' },
    support:{ name: 'Support', cost: 200, range: 3, damage: 0, cooldown: 0, color: COLORS.accent, type: 'buff' }
};

// --- CLASSES ---

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
        this.color = COLORS.enemy;
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
            this.x = tx;
            this.y = ty;
            this.pathIndex++;
            if (this.pathIndex >= path.length - 1) {
                this.reachedEnd();
            }
        } else {
            this.x += (dx / dist) * currentSpeed;
            this.y += (dy / dist) * currentSpeed;
        }
    }

    draw() {
        let wobble = Math.sin((frameCount + this.wobbleOffset) * 0.15) * 4;
        
        ctx.save();
        ctx.translate(this.x, this.y + wobble);

        // Soft Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.ellipse(0, 16 - wobble, 12, 4, 0, 0, Math.PI*2);
        ctx.fill();

        if (this.isBoss) {
            let grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, this.radius);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            grad.addColorStop(0.3, 'rgba(204, 213, 255, 0.6)');
            grad.addColorStop(0.7, 'rgba(255, 196, 214, 0.6)');
            grad.addColorStop(1, 'rgba(100, 200, 255, 0.4)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI*2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath();
            ctx.ellipse(-6, -6, 4, 2, Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#f1c40f';
            ctx.strokeStyle = '#c27c0e';
            ctx.lineWidth = 1;
            ctx.lineJoin = 'round';

            let cy = -this.radius + 2; 
            let cw = 14; 
            let ch = 10; 

            ctx.beginPath();
            ctx.moveTo(-cw, cy);             
            ctx.lineTo(-cw, cy - ch);        
            ctx.lineTo(-cw/2, cy - ch/2);    
            ctx.lineTo(0, cy - ch - 3);      
            ctx.lineTo(cw/2, cy - ch/2);     
            ctx.lineTo(cw, cy - ch);         
            ctx.lineTo(cw, cy);              
            ctx.closePath();
            
            ctx.fill();
            ctx.stroke();

        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI*2);
            ctx.fill();

            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(-5, -2, 4, 0, Math.PI*2);
            ctx.arc(5, -2, 4, 0, Math.PI*2);
            ctx.fill();

            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(-5 + (this.speed/2), -2, 1.5, 0, Math.PI*2);
            ctx.arc(5 + (this.speed/2), -2, 1.5, 0, Math.PI*2);
            ctx.fill();
        }

        if(this.slowed > 0) {
            ctx.fillStyle = 'rgba(204, 213, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 2, 0, Math.PI*2);
            ctx.fill();
        }

        ctx.restore();

        if(this.hp < this.maxHp) {
            let hpW = 24;
            let hpPct = this.hp / this.maxHp;
            
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.roundRect(this.x - hpW/2, this.y - 32, hpW, 4, 2);
            ctx.fill();
            
            ctx.fillStyle = hpPct > 0.5 ? '#2ecc71' : '#e74c3c';
            ctx.beginPath();
            ctx.roundRect(this.x - hpW/2, this.y - 32, hpW * hpPct, 4, 2);
            ctx.fill();
        }
    }

    reachedEnd() {
        this.hp = 0;
        gameState.lives--;
        updateUI();
        createParticles(this.x, this.y, '#e74c3c', 10);
        if(gameState.lives <= 0) endGame();
    }

    takeDamage(amount) {
        this.hp -= amount;
        if(this.hp <= 0) {
            gameState.gold += this.value;
            gameState.score += this.value * 10;
            updateUI();
            createParticles(this.x, this.y, '#f1c40f', 5);
        }
    }
}

class Tower {
    constructor(c, r, typeKey) {
        this.c = c;
        this.r = r;
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
        this.damage *= 1.3;
        this.range *= 1.1;
        this.cooldownMax *= 0.9;
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({'event': 'tower_upgrade', 'tower_type': this.typeKey});
    }

    getSellValue() { return Math.floor(TOWER_TYPES[this.typeKey].cost * 0.75); }
    getUpgradeCost() { return Math.floor(TOWER_TYPES[this.typeKey].cost * 0.8 * this.level); }

    update() {
        if (this.typeKey === 'support') {
            this.angle += 0.02;
            gameState.towers.forEach(t => {
                if(t !== this && Math.hypot(t.x - this.x, t.y - this.y) <= this.range) {
                    t.buffed = true;
                }
            });
            return;
        }

        if (this.cooldown > 0) this.cooldown--;

        let target = null;
        for (let e of gameState.enemies) {
            let d = Math.hypot(e.x - this.x, e.y - this.y);
            let effectiveRange = this.buffed ? this.range * 1.2 : this.range;
            if (d <= effectiveRange) {
                target = e; 
                break; 
            }
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
        let pType = this.typeKey;
        let damage = this.buffed ? this.damage * 1.2 : this.damage;
        
        if(pType === 'cannon') {
            gameState.projectiles.push(new Projectile(this.x, this.y, target, damage, 'aoe', this.color));
        } else if (pType === 'mage') {
            gameState.projectiles.push(new Projectile(this.x, this.y, target, damage, 'slow', this.color));
        } else {
            gameState.projectiles.push(new Projectile(this.x, this.y, target, damage, 'single', this.color));
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.ellipse(0, 14, 16, 6, 0, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.roundRect(-14, -14, 28, 28, 5);
        ctx.fill();
        
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.roundRect(-12, -12, 24, 24, 4);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        if(this.buffed) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = COLORS.accent;
            ctx.strokeStyle = COLORS.accent;
            ctx.lineWidth = 2;
            ctx.strokeRect(-14, -14, 28, 28);
            ctx.shadowBlur = 0;
        }

        if (this.typeKey === 'archer') {
            ctx.rotate(this.angle);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI*2);
            ctx.fill();
            
            ctx.fillStyle = '#666';
            ctx.fillRect(0, -3, 16, 6);
            
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.arc(3, -3, 3, 0, Math.PI*2);
            ctx.fill();

        } else if (this.typeKey === 'mage') {
            let float = Math.sin(frameCount * 0.05) * 3;
            
            ctx.shadowBlur = 15;
            ctx.shadowColor = this.color;
            
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.moveTo(0, -12 + float);
            ctx.lineTo(8, 0 + float);
            ctx.lineTo(0, 12 + float);
            ctx.lineTo(-8, 0 + float);
            ctx.fill();
            
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(0, float, 3, 0, Math.PI*2);
            ctx.fill();

        } else if (this.typeKey === 'cannon') {
            ctx.rotate(this.angle);
            ctx.fillStyle = '#555';
            ctx.fillRect(-10, -10, 20, 20);
            
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI*2);
            ctx.fill();
            ctx.fillRect(0, -6, 18, 12);
            
            ctx.fillStyle = COLORS.accent;
            ctx.fillRect(8, -6, 4, 12);

        } else if (this.typeKey === 'support') {
            ctx.rotate(this.angle);
            
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 10, -0.5, 3.6); 
            ctx.stroke();
            
            let pulse = (frameCount % 60) / 2;
            ctx.strokeStyle = `rgba(255, 229, 180, ${1 - pulse/30})`;
            ctx.beginPath();
            ctx.arc(0, 0, pulse, 0, Math.PI*2);
            ctx.stroke();
        }

        ctx.restore();
        
        let startX = this.x - ((this.level-1) * 6) / 2;
        for(let i=0; i<this.level; i++) {
            ctx.fillStyle = COLORS.accent;
            ctx.beginPath();
            ctx.arc(startX + (i*8), this.y - 20, 2, 0, Math.PI*2);
            ctx.fill();
        }
    }
}

class Projectile {
    constructor(x, y, target, damage, type, color) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.damage = damage;
        this.type = type;
        this.color = color;
        this.speed = 8;
        this.active = true;
        this.tail = [];
    }

    update() {
        if(!this.target || this.target.hp <= 0) {
            this.active = false;
            return;
        }

        this.tail.push({x: this.x, y: this.y});
        if(this.tail.length > 5) this.tail.shift();

        let dx = this.target.x - this.x;
        let dy = this.target.y - this.y;
        let dist = Math.hypot(dx, dy);

        if(dist < this.speed) {
            this.hit();
        } else {
            this.x += (dx/dist) * this.speed;
            this.y += (dy/dist) * this.speed;
        }
    }

    hit() {
        this.active = false;
        if(this.type === 'aoe') {
            createParticles(this.x, this.y, '#555', 8);
            ctx.beginPath();
            ctx.arc(this.x, this.y, 40, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(255,200,200,0.5)';
            ctx.fill();

            gameState.enemies.forEach(e => {
                if(Math.hypot(e.x - this.x, e.y - this.y) < 60) {
                    e.takeDamage(this.damage);
                }
            });
        } else {
            this.target.takeDamage(this.damage);
            if(this.type === 'slow') {
                this.target.slowed = 60;
                createParticles(this.x, this.y, COLORS.secondary, 4);
            }
        }
    }

    draw() {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        for(let p of this.tail) ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = Math.random() * 2 + 1;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
    }
    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.life -= this.decay;
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2.5, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

function createParticles(x, y, color, count) {
    for(let i=0; i<count; i++) gameState.particles.push(new Particle(x, y, color));
}

// --- GRAPHICS ENGINE ---

function isPath(c, r) {
    for(let i=0; i<path.length-1; i++) {
        let p1 = path[i];
        let p2 = path[i+1];
        let minX = Math.min(p1.x, p2.x);
        let maxX = Math.max(p1.x, p2.x);
        let minY = Math.min(p1.y, p2.y);
        let maxY = Math.max(p1.y, p2.y);
        if (c >= minX && c <= maxX && r >= minY && r <= maxY) return true;
    }
    return false;
}

function initBackground() {
    bgCtx.fillStyle = COLORS.grassLight;
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    
    bgCtx.fillStyle = COLORS.grassDark;
    for(let y=0; y<ROWS; y++) {
        for(let x=0; x<COLS; x++) {
            if((x+y)%2 === 0) {
                bgCtx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (isPath(c, r)) {
                let x = c * TILE_SIZE;
                let y = r * TILE_SIZE;
                
                bgCtx.fillStyle = COLORS.path;
                bgCtx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                
                bgCtx.fillStyle = COLORS.pathBorder;
                bgCtx.beginPath();
                bgCtx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, 2, 0, Math.PI*2);
                bgCtx.fill();
            } else {
                if(Math.random() > 0.95) {
                    let fx = c * TILE_SIZE + Math.random() * 30;
                    let fy = r * TILE_SIZE + Math.random() * 30;
                    bgCtx.fillStyle = Math.random() > 0.5 ? COLORS.primary : COLORS.secondary;
                    bgCtx.beginPath();
                    bgCtx.arc(fx, fy, 3, 0, Math.PI*2);
                    bgCtx.fill();
                }
            }
        }
    }

    bgCtx.save();
    bgCtx.font = "bold 14px Quicksand, sans-serif";
    bgCtx.textAlign = "left"; 
    bgCtx.fillStyle = "rgba(0, 0, 0, 0.1)"; 
    bgCtx.fillText("yunadata.github.io", 15, bgCanvas.height - 15);
    bgCtx.restore();
}

function drawCrystal(x, y) {
    let hover = 6 * Math.sin(frameCount * 0.05);
    let cy = y + hover;

    ctx.save();
    ctx.translate(x, cy);
    
    let pulse = 25 + 5 * Math.sin(frameCount * 0.1);
    ctx.shadowBlur = pulse;
    ctx.shadowColor = COLORS.secondary;
    
    ctx.fillStyle = COLORS.secondary; 
    ctx.beginPath();
    ctx.moveTo(0, -25); 
    ctx.lineTo(15, 0);  
    ctx.lineTo(0, 25);  
    ctx.lineTo(-15, 0); 
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(6, -5);
    ctx.lineTo(0, 0);
    ctx.lineTo(-6, -5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    let hpPct = gameState.lives / gameState.maxLives;
    if (hpPct < 0) hpPct = 0;
    
    let barW = 40;
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.beginPath();
    ctx.roundRect(x - barW/2, y + 35, barW, 6, 3);
    ctx.fill();

    ctx.fillStyle = hpPct > 0.3 ? COLORS.secondary : COLORS.primary;
    ctx.shadowBlur = 5;
    ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath();
    ctx.roundRect(x - barW/2, y + 35, barW * hpPct, 6, 3);
    ctx.fill();
    ctx.shadowBlur = 0;
}

// --- MAIN LOOP ---

function startGame() {
    gameState = {
        gold: 150,
        lives: 20,
        maxLives: 20,
        score: 0,
        wave: 1,
        enemies: [],
        towers: [],
        projectiles: [],
        particles: [],
        gameOver: false,
        spawnTimer: 0,
        enemiesToSpawn: 5,
        selectedTower: null,
        buildType: 'archer'
    };
    
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('submit-score-container').classList.add('hidden');
    document.getElementById('leaderboard-display').classList.add('hidden');
    document.getElementById('start-btn').classList.add('hidden');
    updateUI();
    
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'event': 'game_start' });
    
    if(gameLoopId) cancelAnimationFrame(gameLoopId);
    
    initBackground();
    
    gameLoop();
}

function gameLoop() {
    if(gameState.gameOver) return;

    ctx.drawImage(bgCanvas, 0, 0);

    let end = path[path.length-1];
    drawCrystal(end.x*TILE_SIZE + TILE_SIZE/2, end.y*TILE_SIZE + TILE_SIZE/2);

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
        window.dataLayer.push({'event': 'wave_complete', 'wave_number': gameState.wave - 1});
    }

    gameState.towers.forEach(t => { t.update(); t.draw(); });

    gameState.enemies.sort((a,b) => a.y - b.y);
    for(let i = gameState.enemies.length - 1; i >= 0; i--) {
        let e = gameState.enemies[i];
        e.update();
        e.draw();
        if(e.hp <= 0) gameState.enemies.splice(i, 1);
    }

    for(let i = gameState.projectiles.length - 1; i >= 0; i--) {
        let p = gameState.projectiles[i];
        p.update();
        p.draw();
        if(!p.active) gameState.projectiles.splice(i, 1);
    }

    for(let i = gameState.particles.length - 1; i >= 0; i--) {
        let p = gameState.particles[i];
        p.update();
        p.draw();
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
        
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(t.c * TILE_SIZE, t.r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        
        ctx.fillStyle = COLORS.uiRange;
        ctx.beginPath();
        let range = t.buffed ? t.range * 1.2 : t.range;
        ctx.arc(t.x, t.y, range, 0, Math.PI*2);
        ctx.fill();
        return;
    }

    if(c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    
    let onPath = isPath(c, r);
    let hasTower = gameState.towers.some(t => t.c === c && t.r === r);

    if(!onPath && !hasTower) {
        ctx.fillStyle = COLORS.uiSelected;
        ctx.fillRect(c*TILE_SIZE + 2, r*TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        
        let range = TOWER_TYPES[gameState.buildType].range * TILE_SIZE;
        ctx.beginPath();
        ctx.strokeStyle = TOWER_TYPES[gameState.buildType].color;
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([10, 5]); 
        ctx.lineWidth = 1;
        ctx.arc(c*TILE_SIZE + TILE_SIZE/2, r*TILE_SIZE + TILE_SIZE/2, range, 0, Math.PI*2);
        ctx.stroke();
        ctx.setLineDash([]); 
        ctx.globalAlpha = 1.0;
    } else {
        ctx.fillStyle = 'rgba(231, 76, 60, 0.3)';
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
        upPanel.style.display = 'block';
        document.getElementById('upgrade-cost').innerText = gameState.selectedTower.getUpgradeCost();
    } else {
        upPanel.style.display = 'none';
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
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('overlay-title').innerText = "DEFENSE BREACHED";
    document.getElementById('overlay-desc').innerText = "The Crystal has faded.";
    document.getElementById('start-btn').innerText = "TRY AGAIN";
    document.getElementById('start-btn').classList.remove('hidden');
    
    document.getElementById('submit-score-container').classList.remove('hidden');
    document.getElementById('final-score').innerText = gameState.score;
    
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
        'event': 'game_complete',
        'game_score': gameState.score,
        'game_wave': gameState.wave
    });

    fetchLeaderboard();
}

// --- LEADERBOARD LOGIC: ONE ENTRY PER PLAYER ---

async function submitScore() {
    const nameInput = document.getElementById('player-name');
    let name = nameInput.value.trim();
    
    if (!name) return alert("Please enter a name!");
    
    // UI Feedback
    const btn = document.querySelector('#submit-score-container .btn-game');
    btn.disabled = true;
    btn.innerText = "Checking...";

    try {
        // 1. Create a "Safe ID" to use as the Document Key
        // Example: "Danny K" becomes "dannyk"
        const safeID = name.toLowerCase().replace(/\s+/g, '');
        
        // 2. Reference this specific user's document
        const userScoreRef = doc(db, "leaderboard", safeID);
        
        // 3. Check if they already exist
        const docSnap = await getDoc(userScoreRef);
        
        const newScore = parseInt(gameState.score);
        const newWave = parseInt(gameState.wave);

        if (docSnap.exists()) {
            const existingData = docSnap.data();
            // 4. Update ONLY if the new score is better
            if (newScore > existingData.score) {
                await setDoc(userScoreRef, {
                    name: name, // Keep the display name with original casing
                    score: newScore,
                    wave: newWave,
                    timestamp: Date.now()
                });
                alert("New High Score Uploaded!");
            } else {
                alert("Score uploaded, but you didn't beat your personal best!");
            }
        } else {
            // 5. First time user? Create the doc.
            await setDoc(userScoreRef, {
                name: name,
                score: newScore,
                wave: newWave,
                timestamp: Date.now()
            });
            alert("Score Uploaded!");
        }

        document.getElementById('submit-score-container').classList.add('hidden');
        fetchLeaderboard(); // Refresh list

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
        // Query: Get Top 20 scores
        const q = query(
            collection(db, "leaderboard"), 
            orderBy("score", "desc"), 
            limit(20)
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
                    <span style="color:var(--accent); font-weight:bold;">${data.score}</span>
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

// --- EXPOSE FUNCTIONS TO WINDOW ---
// Critical: Makes functions available to onclick="" events in HTML
window.startGame = startGame;
window.selectTowerType = selectTowerType;
window.upgradeSelectedTower = upgradeSelectedTower;
window.sellSelectedTower = sellSelectedTower;
window.submitScore = submitScore;

// Initial Render
initBackground();
ctx.drawImage(bgCanvas, 0, 0);
let endPos = path[path.length-1];
drawCrystal(endPos.x*TILE_SIZE + TILE_SIZE/2, endPos.y*TILE_SIZE + TILE_SIZE/2);
