/**
 * CRYSTAL GUARD - GAME ENGINE
 * Portfolio Version: Visual Overhaul
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- LEADERBOARD CONFIG ---
const DREAMLO_PRIVATE = "-QMdaM9NQUuOpn6cCl9WjAH6v9CVOy9ka-pRpFcjM8TA";
const DREAMLO_PUBLIC  = "69457d098f40bbcf805ee9ba";

// --- THEME COLORS (Matches Portfolio) ---
const COLORS = {
    primary: '#FFC4D6',   // Pink
    secondary: '#CCD5FF', // Periwinkle
    accent: '#FFE5B4',    // Peach
    dark: '#4A4A4A',      // Dark Text
    grass: '#7bed9f',     // Soft Green
    path: '#ffffff',      // White Road
    pathBorder: '#dfe6e9',
    enemy: '#2d3436',     // Dark Charcoal
    enemyBoss: '#6c5ce7'  // Purple
};

// --- GAME CONSTANTS ---
const TILE_SIZE = 40;
const COLS = 20;
const ROWS = 15;

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
    {x: 8, y: 10}, {x: 8, y: 13}, {x: 19, y: 13} // Fixed coord
];

// Tower Definitions (Using Portfolio Colors)
const TOWER_TYPES = {
    archer: { name: 'Archer', cost: 50, range: 3.5, damage: 15, cooldown: 30, color: COLORS.primary, type: 'single' },
    mage:   { name: 'Mage', cost: 100, range: 4, damage: 5, cooldown: 45, color: COLORS.secondary, type: 'slow' },
    cannon: { name: 'Cannon', cost: 150, range: 4.5, damage: 30, cooldown: 90, color: '#636e72', type: 'aoe' },
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
        // Wobble Animation
        let wobble = Math.sin((frameCount + this.wobbleOffset) * 0.2) * 3;
        
        ctx.save();
        ctx.translate(this.x, this.y + wobble);

        // Body (Cute Blob Shape)
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, Math.PI, 0); // Top half circle
        // Wavy bottom
        ctx.bezierCurveTo(this.radius, this.radius, -this.radius, this.radius, -this.radius, 0);
        ctx.fill();

        // Eyes (White)
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(-4, -2, 4, 0, Math.PI*2);
        ctx.arc(4, -2, 4, 0, Math.PI*2);
        ctx.fill();

        // Pupils (Black) look at crystal
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(-4 + (this.speed/2), -2, 1.5, 0, Math.PI*2);
        ctx.arc(4 + (this.speed/2), -2, 1.5, 0, Math.PI*2);
        ctx.fill();

        // Crown for Boss
        if(this.isBoss) {
            ctx.fillStyle = '#f1c40f'; // Gold
            ctx.beginPath();
            ctx.moveTo(-8, -this.radius);
            ctx.lineTo(-4, -this.radius - 8);
            ctx.lineTo(0, -this.radius - 4);
            ctx.lineTo(4, -this.radius - 8);
            ctx.lineTo(8, -this.radius);
            ctx.fill();
        }

        // Slowed Ice Effect
        if(this.slowed > 0) {
            ctx.fillStyle = 'rgba(116, 185, 255, 0.5)';
            ctx.beginPath();
            ctx.arc(0, 5, this.radius, 0, Math.PI*2);
            ctx.fill();
        }

        ctx.restore();

        // Health bar
        if(this.hp < this.maxHp) {
            let hpW = 24;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(this.x - hpW/2, this.y - 25, hpW, 4);
            ctx.fillStyle = '#00b894';
            ctx.fillRect(this.x - hpW/2, this.y - 25, hpW * (this.hp / this.maxHp), 4);
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
        this.angle = 0; // For rotation
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
            this.angle += 0.05; // Radar rotation
            gameState.towers.forEach(t => {
                if(t !== this && Math.hypot(t.x - this.x, t.y - this.y) <= this.range) {
                    t.buffed = true;
                }
            });
            return;
        }

        if (this.cooldown > 0) this.cooldown--;

        let target = null;
        let minDist = Infinity;
        
        // Find Target
        for (let e of gameState.enemies) {
            let d = Math.hypot(e.x - this.x, e.y - this.y);
            let effectiveRange = this.buffed ? this.range * 1.2 : this.range;
            if (d <= effectiveRange) {
                target = e; 
                break; 
            }
        }

        if (target) {
            // Rotate towards target
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

        // 1. Draw Base (Same for all)
        ctx.fillStyle = '#b2bec3'; // Light stone grey
        ctx.fillRect(-16, -16, 32, 32);
        
        // Border for base
        ctx.strokeStyle = '#636e72';
        ctx.lineWidth = 1;
        ctx.strokeRect(-16, -16, 32, 32);

        // Buff Indicator
        if(this.buffed) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = COLORS.accent;
            ctx.strokeStyle = COLORS.accent;
            ctx.lineWidth = 2;
            ctx.strokeRect(-18, -18, 36, 36);
            ctx.shadowBlur = 0;
        }

        // 2. Draw Specific Tower Art
        if (this.typeKey === 'archer') {
            // Turret Base
            ctx.rotate(this.angle);
            ctx.fillStyle = this.color; // Pink
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI*2);
            ctx.fill();
            // Crossbow / Arrow
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, -2, 16, 4); // Barrel
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(5, -10);
            ctx.lineTo(5, 10); // Bow string
            ctx.stroke();

        } else if (this.typeKey === 'mage') {
            // Pedestal
            ctx.fillStyle = '#555';
            ctx.fillRect(-6, -6, 12, 12);
            // Floating Crystal
            let float = Math.sin(frameCount * 0.1) * 3;
            ctx.fillStyle = this.color; // Periwinkle
            ctx.beginPath();
            ctx.moveTo(0, -10 + float);
            ctx.lineTo(8, 0 + float);
            ctx.lineTo(0, 10 + float);
            ctx.lineTo(-8, 0 + float);
            ctx.fill();
            // Glow
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
            ctx.fill();
            ctx.shadowBlur = 0;

        } else if (this.typeKey === 'cannon') {
            // Rotating heavy barrel
            ctx.rotate(this.angle);
            ctx.fillStyle = '#2d3436';
            ctx.fillRect(-8, -8, 24, 16); // Barrel
            ctx.fillStyle = this.color; // Dark Grey stripe
            ctx.fillRect(-5, -6, 6, 12); 

        } else if (this.typeKey === 'support') {
            // Radar Dish
            ctx.rotate(this.angle);
            ctx.fillStyle = this.color; // Peach
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI*2); // Center
            ctx.fill();
            
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 12, -0.5, 0.5); // Dish curve
            ctx.stroke();
            
            // Pulse wave
            let pulse = (frameCount % 40) / 2;
            ctx.strokeStyle = 'rgba(255, 229, 180, 0.5)';
            ctx.beginPath();
            ctx.arc(5, 0, 12 + pulse, -0.5, 0.5);
            ctx.stroke();
        }

        // 3. Level Dots
        ctx.restore();
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        for(let i=0; i<this.level; i++) {
            let dx = this.x - 8 + (i*5);
            let dy = this.y - 12;
            if (this.typeKey === 'mage') dy -= 8; // Move up for mage
            
            ctx.beginPath();
            ctx.arc(dx, dy, 2, 0, Math.PI*2);
            ctx.fill();
            ctx.stroke();
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
        this.angle = Math.atan2(target.y - y, target.x - x);
    }

    update() {
        if(!this.target || this.target.hp <= 0) {
            this.active = false;
            return;
        }

        let dx = this.target.x - this.x;
        let dy = this.target.y - this.y;
        let dist = Math.hypot(dx, dy);

        if(dist < this.speed) {
            this.hit();
        } else {
            this.x += (dx/dist) * this.speed;
            this.y += (dy/dist) * this.speed;
            this.angle = Math.atan2(dy, dx);
        }
    }

    hit() {
        this.active = false;
        
        if(this.type === 'aoe') {
            createParticles(this.x, this.y, 'orange', 8);
            gameState.enemies.forEach(e => {
                if(Math.hypot(e.x - this.x, e.y - this.y) < 60) {
                    e.takeDamage(this.damage);
                }
            });
        } else {
            this.target.takeDamage(this.damage);
            if(this.type === 'slow') {
                this.target.slowed = 60;
            }
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        
        if(this.type === 'single') {
            // Arrow
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            ctx.fillRect(-5, -1, 10, 2);
            ctx.restore();
        } else if (this.type === 'aoe') {
            // Cannonball
            ctx.beginPath();
            ctx.arc(this.x, this.y, 4, 0, Math.PI*2);
            ctx.fill();
        } else {
            // Magic Bolt
            ctx.beginPath();
            ctx.arc(this.x, this.y, 3, 0, Math.PI*2);
            ctx.shadowBlur = 5;
            ctx.shadowColor = this.color;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4;
        this.life = 20;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life / 20;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

function createParticles(x, y, color, count) {
    for(let i=0; i<count; i++) gameState.particles.push(new Particle(x, y, color));
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
    
    // GTM Event
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
        'event': 'game_start'
    });
    
    if(gameLoopId) cancelAnimationFrame(gameLoopId);
    gameLoop();
}

function gameLoop() {
    if(gameState.gameOver) return;

    // Clear Canvas
    ctx.fillStyle = COLORS.grass; // Use soft green background
    ctx.fillRect(0,0, canvas.width, canvas.height);

    drawMap();

    // Spawn Logic
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

    // Updates & Drawing
    gameState.towers.forEach(t => { t.update(); t.draw(); });

    // Draw enemies sorted by Y so lower ones appear in front of higher ones (pseudo-3D)
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

// --- VISUALS ---

function drawCrystal(x, y) {
    let hover = 5 * Math.sin(frameCount * 0.05);
    let cy = y + hover;
    
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.beginPath();
    ctx.ellipse(x, y + 20, 15 - hover*0.5, 5, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, cy);
    
    ctx.shadowBlur = 20 + 5 * Math.sin(frameCount * 0.1);
    ctx.shadowColor = "#00d2d3";
    
    // Crystal Body
    ctx.fillStyle = "#2980b9"; 
    ctx.beginPath();
    ctx.moveTo(0, -25); 
    ctx.lineTo(15, 0);  
    ctx.lineTo(0, 25);  
    ctx.lineTo(-15, 0); 
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = "#3498db";
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(0, 25);
    ctx.lineTo(-15, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(5, -5);
    ctx.lineTo(0, 0);
    ctx.lineTo(-5, -5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Health Bar
    let hpPct = gameState.lives / gameState.maxLives;
    if (hpPct < 0) hpPct = 0;
    
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x - 20, y - 45, 40, 6);
    
    ctx.fillStyle = hpPct > 0.3 ? "#00d2d3" : "#e74c3c";
    ctx.fillRect(x - 20, y - 45, 40 * hpPct, 6);
    
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 20, y - 45, 40, 6);
}

function drawMap() {
    // Fill Path
    ctx.fillStyle = COLORS.path;
    
    let currentX = path[0].x;
    let currentY = path[0].y;
    ctx.fillRect(currentX*TILE_SIZE, currentY*TILE_SIZE, TILE_SIZE, TILE_SIZE);

    for(let i=0; i<path.length-1; i++) {
        let p1 = path[i];
        let p2 = path[i+1];
        let dx = Math.sign(p2.x - p1.x);
        let dy = Math.sign(p2.y - p1.y);
        let cx = p1.x;
        let cy = p1.y;

        while(cx !== p2.x || cy !== p2.y) {
            ctx.fillRect(cx*TILE_SIZE, cy*TILE_SIZE, TILE_SIZE, TILE_SIZE);
            cx += dx;
            cy += dy;
        }
        ctx.fillRect(p2.x*TILE_SIZE, p2.y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    
    // Draw Path Border (Visual Polish)
    // This is a simple trick: redraw the path slightly larger underneath? 
    // Actually, let's keep it simple for performance. 
    // Just drawing the Crystal at the end.
    
    let end = path[path.length-1];
    drawCrystal(end.x*TILE_SIZE + TILE_SIZE/2, end.y*TILE_SIZE + TILE_SIZE/2);
}

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
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(t.c * TILE_SIZE, t.r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        let range = t.buffed ? t.range * 1.2 : t.range;
        ctx.arc(t.x, t.y, range, 0, Math.PI*2);
        ctx.fill();
        return;
    }

    if(c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    
    let onPath = isPath(c, r);
    let hasTower = gameState.towers.some(t => t.c === c && t.r === r);

    // Using Theme Colors for Preview
    if(!onPath && !hasTower) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(c*TILE_SIZE, r*TILE_SIZE, TILE_SIZE, TILE_SIZE);
        
        let range = TOWER_TYPES[gameState.buildType].range * TILE_SIZE;
        ctx.beginPath();
        let tColor = TOWER_TYPES[gameState.buildType].color;
        ctx.strokeStyle = tColor;
        ctx.lineWidth = 2;
        ctx.arc(c*TILE_SIZE + TILE_SIZE/2, r*TILE_SIZE + TILE_SIZE/2, range, 0, Math.PI*2);
        ctx.stroke();
    } else {
        ctx.fillStyle = 'rgba(231, 76, 60, 0.3)';
        ctx.fillRect(c*TILE_SIZE, r*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
}

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

// --- UI & DATA LOGIC ---

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
    document.getElementById('overlay-title').innerText = "DEFEAT";
    document.getElementById('overlay-desc').innerText = "The Crystal has shattered.";
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

function submitScore() {
    const name = document.getElementById('player-name').value;
    if(!name) return alert("Please enter a name!");
    
    const dreamloURL = `http://dreamlo.com/lb/${DREAMLO_PRIVATE}/add-pipe/${encodeURIComponent(name)}/${gameState.score}`;
    const proxyURL = `https://api.allorigins.win/get?url=${encodeURIComponent(dreamloURL)}`;

    fetch(proxyURL)
    .then(response => {
        if (response.ok) return response.json();
        throw new Error('Network response was not ok.');
    })
    .then(data => {
        console.log("Submit Response:", data);
        alert("Score Uploaded!");
        document.getElementById('submit-score-container').classList.add('hidden');
        fetchLeaderboard();
    })
    .catch(err => {
        console.error("Submit Error:", err);
        alert("Connection failed. Check console.");
    });
}

function fetchLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    const container = document.getElementById('leaderboard-display');
    
    container.classList.remove('hidden');
    list.innerHTML = "Fetching global scores...";

    const dreamloURL = `http://dreamlo.com/lb/${DREAMLO_PUBLIC}/json?t=${Date.now()}`;
    const proxyURL = `https://api.allorigins.win/get?url=${encodeURIComponent(dreamloURL)}`;

    fetch(proxyURL)
    .then(res => res.json())
    .then(data => {
        console.log("Leaderboard Raw Data:", data);
        if (!data.contents) throw new Error("No content from proxy");
        const dreamloData = JSON.parse(data.contents);

        let html = "";
        let scores = [];

        if (!dreamloData.dreamlo || !dreamloData.dreamlo.leaderboard) {
            html = "<div style='text-align:center'>No scores yet!</div>";
        } else {
            let entries = dreamloData.dreamlo.leaderboard.entry;
            scores = Array.isArray(entries) ? entries : [entries];
            scores.sort((a,b) => parseInt(b.score) - parseInt(a.score));

            scores.slice(0, 10).forEach(entry => {
                html += `
                <div class="score-entry">
                    <span>${entry.name}</span>
                    <span style="color:var(--accent); font-weight:bold;">${entry.score}</span>
                </div>`;
            });
        }
        list.innerHTML = html;
    })
    .catch(err => {
        list.innerHTML = "Error loading leaderboard.";
        console.error("Leaderboard Error:", err);
    });
}

// Initial Map Draw
ctx.fillStyle = COLORS.grass;
ctx.fillRect(0,0, canvas.width, canvas.height);
drawMap();
