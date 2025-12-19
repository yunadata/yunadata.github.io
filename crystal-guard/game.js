/**
 * CRYSTAL GUARD - GAME ENGINE
 * Portfolio Version for Yuna An Vu
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- LEADERBOARD CONFIG ---
const DREAMLO_PRIVATE = "-QMdaM9NQUuOpn6cCl9WjAH6v9CVOy9ka-pRpFcjM8TA";
const DREAMLO_PUBLIC  = "69457d098f40bbcf805ee9ba";

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

// Map Path (Waypoints in Grid Coordinates)
const path = [
    {x: 0, y: 2}, {x: 5, y: 2}, {x: 5, y: 8}, 
    {x: 12, y: 8}, {x: 12, y: 4}, {x: 18, y: 4}, {x: 18, y: 10}, 
    {x: 8, y: 10}, {x: 8, y: 13}, {x: 20, y: 13}
];

// Tower Definitions
const TOWER_TYPES = {
    archer: { name: 'Archer', cost: 50, range: 3.5, damage: 15, cooldown: 30, color: '#f39c12', type: 'single' },
    mage:   { name: 'Mage', cost: 100, range: 4, damage: 5, cooldown: 45, color: '#3498db', type: 'slow' },
    cannon: { name: 'Cannon', cost: 150, range: 4.5, damage: 30, cooldown: 90, color: '#2c3e50', type: 'aoe' },
    support:{ name: 'Support', cost: 200, range: 3, damage: 0, cooldown: 0, color: '#ecf0f1', type: 'buff' }
};

// --- CLASSES ---

class Enemy {
    constructor(wave) {
        this.pathIndex = 0;
        this.x = path[0].x * TILE_SIZE; 
        this.y = path[0].y * TILE_SIZE + (TILE_SIZE/2);
        
        // Difficulty Scaling
        let difficultyMult = Math.pow(1.15, wave - 1);
        
        this.maxHp = 20 * difficultyMult;
        this.hp = this.maxHp;
        this.speed = 1.5 + (wave * 0.05);
        this.radius = 12;
        this.color = '#c0392b';
        this.slowed = 0; 
        this.value = 5 + Math.floor(wave * 0.5);

        // Boss Logic
        if(wave % 5 === 0) { 
            this.maxHp *= 3;
            this.hp = this.maxHp;
            this.radius = 18;
            this.speed *= 0.7;
            this.color = '#8e44ad'; 
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
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Health bar
        if(this.hp < this.maxHp) {
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x - 10, this.y - 20, 20, 4);
            ctx.fillStyle = '#2ecc71';
            ctx.fillRect(this.x - 10, this.y - 20, 20 * (this.hp / this.maxHp), 4);
        }
        
        if(this.slowed > 0) {
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 2;
            ctx.stroke();
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
    }

    upgrade() {
        this.level++;
        this.damage *= 1.3;
        this.range *= 1.1;
        this.cooldownMax *= 0.9;
        
        // Track Upgrade Event in GA4
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            'event': 'tower_upgrade',
            'tower_type': this.typeKey,
            'tower_level': this.level
        });
    }

    getSellValue() {
        let totalCost = TOWER_TYPES[this.typeKey].cost;
        return Math.floor(totalCost * 0.75);
    }

    getUpgradeCost() {
        return Math.floor(TOWER_TYPES[this.typeKey].cost * 0.8 * this.level);
    }

    update() {
        if (this.typeKey === 'support') {
            gameState.towers.forEach(t => {
                if(t !== this && Math.hypot(t.x - this.x, t.y - this.y) <= this.range) {
                    t.buffed = true;
                }
            });
            return;
        }

        if (this.cooldown > 0) this.cooldown--;

        if (this.cooldown <= 0) {
            let target = null;
            // Target enemy furthest along path
            for (let e of gameState.enemies) {
                let d = Math.hypot(e.x - this.x, e.y - this.y);
                let effectiveRange = this.buffed ? this.range * 1.2 : this.range;
                
                if (d <= effectiveRange) {
                    target = e; 
                    break; 
                }
            }

            if (target) {
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
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(this.c * TILE_SIZE + 2, this.r * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        
        ctx.fillStyle = this.color;
        if(this.buffed) ctx.strokeStyle = 'white';
        
        ctx.beginPath();
        if (this.typeKey === 'archer') {
            ctx.arc(this.x, this.y, 10, 0, Math.PI*2);
        } else if (this.typeKey === 'cannon') {
            ctx.fillRect(this.x - 12, this.y - 12, 24, 24);
        } else if (this.typeKey === 'mage') {
            ctx.moveTo(this.x, this.y - 15);
            ctx.lineTo(this.x + 12, this.y + 10);
            ctx.lineTo(this.x - 12, this.y + 10);
        } else {
            ctx.arc(this.x, this.y, 8, 0, Math.PI*2);
            ctx.strokeRect(this.x - 5, this.y - 15, 10, 30);
            ctx.strokeRect(this.x - 15, this.y - 5, 30, 10);
        }
        ctx.fill();
        if(this.buffed) ctx.stroke();

        ctx.fillStyle = 'white';
        for(let i=0; i<this.level; i++) {
            ctx.fillRect(this.x - 8 + (i*4), this.y - 12, 2, 2);
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
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI*2);
        ctx.fill();
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
        ctx.fillRect(this.x, this.y, 3, 3);
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

    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
        
        // GTM Wave Complete
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            'event': 'wave_complete',
            'wave_number': gameState.wave - 1
        });
    }

    // Updates
    gameState.towers.forEach(t => { t.update(); t.draw(); });

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

// --- RENDER HELPERS ---

function drawMap() {
    // Path
    ctx.fillStyle = '#95a5a6';
    
    // Simple block path drawing
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

    // Crystal
    let end = path[path.length-1];
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(end.x*TILE_SIZE + TILE_SIZE/2, end.y*TILE_SIZE + TILE_SIZE/2, 15, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 20;
    ctx.shadowColor = "cyan";
    ctx.stroke();
    ctx.shadowBlur = 0;
}

let mouseX = 0, mouseY = 0;
canvas.addEventListener('mousemove', (e) => {
    let rect = canvas.getBoundingClientRect();
    // Adjust for canvas scaling in CSS
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

    if(!onPath && !hasTower) {
        ctx.fillStyle = 'rgba(241, 196, 15, 0.3)';
        ctx.fillRect(c*TILE_SIZE, r*TILE_SIZE, TILE_SIZE, TILE_SIZE);
        
        let range = TOWER_TYPES[gameState.buildType].range * TILE_SIZE;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.5)';
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
    
    // GTM Game End
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
        'event': 'game_complete',
        'game_score': gameState.score,
        'game_wave': gameState.wave
    });

    // Fetch scores immediately so user sees what to beat
    fetchLeaderboard();
}

/**
 * FIXED FETCH LOGIC:
 * Uses a Proxy (allorigins.win) to solve:
 * 1. Mixed Content (HTTPS page fetching HTTP Dreamlo)
 * 2. CORS (Dreamlo server rejecting browser fetch)
 */

function submitScore() {
    const name = document.getElementById('player-name').value;
    if(!name) return alert("Please enter a name!");
    
    // Construct Dreamlo URL
    const dreamloURL = `http://dreamlo.com/lb/${DREAMLO_PRIVATE}/add-pipe/${encodeURIComponent(name)}/${gameState.score}`;
    
    // Wrap in Proxy
    const proxyURL = `https://api.allorigins.win/get?url=${encodeURIComponent(dreamloURL)}`;

    fetch(proxyURL)
    .then(response => {
        if (response.ok) return response.json();
        throw new Error('Network response was not ok.');
    })
    .then(data => {
        alert("Score Uploaded!");
        document.getElementById('submit-score-container').classList.add('hidden');
        fetchLeaderboard();
    })
    .catch(err => {
        console.error("Error submitting score:", err);
        // Fallback: If proxy fails, try direct fetch (might work on some browsers)
        // But likely we just alert the user.
        alert("Could not connect to leaderboard. Check internet?");
    });
}

function fetchLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    const container = document.getElementById('leaderboard-display');
    
    container.classList.remove('hidden');
    list.innerHTML = "Fetching global scores...";

    // Construct Dreamlo URL (JSON endpoint)
    const dreamloURL = `http://dreamlo.com/lb/${DREAMLO_PUBLIC}/json`;
    
    // Wrap in Proxy
    const proxyURL = `https://api.allorigins.win/get?url=${encodeURIComponent(dreamloURL)}`;

    fetch(proxyURL)
    .then(res => res.json()) // Parse Proxy JSON
    .then(data => {
        // The actual Dreamlo data is inside data.contents (as a string)
        if(!data.contents) throw new Error("No content from proxy");
        
        const dreamloData = JSON.parse(data.contents);
        
        let html = "";
        let scores = [];

        if (dreamloData.dreamlo.leaderboard === null) {
            html = "<div style='text-align:center'>No scores yet!</div>";
        } else {
            let entries = dreamloData.dreamlo.leaderboard.entry;
            scores = Array.isArray(entries) ? entries : [entries];
            
            // Sort just in case Dreamlo didn't
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
drawMap();
