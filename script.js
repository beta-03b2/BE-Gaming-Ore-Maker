const RAW_BASE = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/";
const GITHUB_API = "https://api.github.com/repos/Mojang/bedrock-samples/git/trees/main?recursive=1";

let allFiles = [], filteredFiles = [], buildQueue = [], packIconBlob = null;
let currentDisplayCount = 30;

// アニメーションの管理用
const activeAnimations = new Set();

const assets = { body: new Image(), frame: new Image() };
assets.body.src = 'assets/body.png';
assets.frame.src = 'assets/frame.png';

async function init() {
    try {
        const res = await fetch(GITHUB_API);
        const data = await res.json();
        allFiles = data.tree.filter(f => f.path.startsWith("resource_pack/textures/blocks/") && f.path.endsWith(".png") && !f.path.endsWith("_mer.png"));
        filteredFiles = [...allFiles];
        renderDropdown();
        drawQuickPreviews();
        document.getElementById('blockList').addEventListener('scroll', handleScroll);
    } catch (e) { document.getElementById('blockList').textContent = "Failed to load blocks."; }
}

function renderDropdown(append = false) {
    const list = document.getElementById('blockList');
    if (!append) {
        list.innerHTML = '';
        currentDisplayCount = 30;
    }
    const nextBatch = filteredFiles.slice(currentDisplayCount - 30, currentDisplayCount);
    const html = nextBatch.map(f => {
        const name = f.path.split('/').pop().replace('.png','');
        return `<div class="block-item" onclick="addBlock('${f.path}')">
            <img src="${RAW_BASE+f.path}" alt="">
            <div class="block-name-container">
                <span>${name}</span>
            </div>
        </div>`;
    }).join('');
    list.insertAdjacentHTML('beforeend', html);
}

function handleScroll(e) {
    const el = e.target;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 5) {
        if (currentDisplayCount < filteredFiles.length) {
            currentDisplayCount += 30;
            renderDropdown(true);
        }
    }
}

document.getElementById('searchInput').oninput = e => {
    const term = e.target.value.toLowerCase();
    filteredFiles = allFiles.filter(f => f.path.toLowerCase().includes(term));
    renderDropdown();
};

async function drawQuickPreviews() {
    const targets = ['diamond_ore', 'deepslate_diamond_ore', 'ancient_debris_side', 'ancient_debris_top', 'deepslate_emerald_ore', 'deepslate_coal_ore', 'obsidian'];
    for (const name of targets) {
        const canvas = document.getElementById(`pre-${name}`);
        if (!canvas) continue;
        const file = allFiles.find(f => f.path.endsWith(`/${name}.png`));
        if (file) {
            const img = await loadImage(RAW_BASE + file.path);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, 16, 16);
        }
    }
}

function quickSelect(names) {
    names.forEach(name => {
        const target = allFiles.find(f => f.path.endsWith(`/${name}.png`));
        if (target) addBlock(target.path, true);
    });
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1500);
}

function addBlock(path, silent = false) {
    const name = path.split('/').pop().replace('.png','');
    if (buildQueue.some(item => item.path === path)) {
        if (!silent) alert(`${name} is already added.`);
        return;
    }
    buildQueue.push({ id: crypto.randomUUID(), path, name, opacity: 0.40, useFrame: true, tick: 1, previewFrame: 0 });
    renderConfigs();
    showToast(`Added ${name}!`);
}

function renderConfigs() {
    // 既存のアニメーションを一旦リセット
    activeAnimations.clear();
    
    const container = document.getElementById('configContainer');
    if (buildQueue.length === 0) {
        container.innerHTML = '<p class="empty-msg">No blocks added yet.</p>';
        return;
    }
    container.innerHTML = '';
    buildQueue.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'config-card';
        card.innerHTML = `
            <div class="card-header">
                <span class="card-title">#${index + 1} ${item.name}</span>
                <button class="danger-text" onclick="removeBlock('${item.id}')">Delete</button>
            </div>
            <div class="card-body">
                <canvas id="canvas-${item.id}" class="preview-box" width="16" height="16"></canvas>
                <div class="controls">
                    <div class="input-group">
                        <label>Transparency: <span id="label-op-${item.id}">${Math.round(item.opacity * 100)}</span>%</label>
                        <input type="range" min="0" max="1" step="0.01" value="${item.opacity}" oninput="updateItem('${item.id}', 'opacity', this.value)">
                    </div>
                    <div class="input-group">
                        <label>Speed: <span id="label-tk-${item.id}">${item.tick}</span> tick</label>
                        <input type="range" min="1" max="20" value="${item.tick}" oninput="updateItem('${item.id}', 'tick', this.value)">
                    </div>
                    <label style="color:#888; font-size:0.8rem; cursor:pointer;"><input type="checkbox" ${item.useFrame ? 'checked' : ''} onchange="updateItem('${item.id}', 'useFrame', this.checked)"> Enable Frame</label>
                </div>
            </div>
        `;
        container.appendChild(card);
        // DOMに配置された直後にアニメーションを開始
        setTimeout(() => startCardPreview(item), 0);
    });
}

function updateItem(id, key, value) {
    const item = buildQueue.find(i => i.id === id);
    if (item) {
        item[key] = (key === 'useFrame') ? value : parseFloat(value);
        if (key === 'opacity') document.getElementById(`label-op-${id}`).textContent = Math.round(value * 100);
        if (key === 'tick') document.getElementById(`label-tk-${id}`).textContent = value;
    }
}

function removeBlock(id) {
    buildQueue = buildQueue.filter(i => i.id !== id);
    renderConfigs();
}

async function startCardPreview(item) {
    const canvas = document.getElementById(`canvas-${item.id}`);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const baseImg = await loadImage(RAW_BASE + item.path);
    let lastTime = performance.now();
    
    // この特定のIDのアニメーションを有効化
    activeAnimations.add(item.id);

    function animate(timestamp) {
        // 全体リストから削除されている、または再描画で無効化されていたら停止
        if (!activeAnimations.has(item.id)) return;
        
        const current = buildQueue.find(i => i.id === item.id);
        const currentCanvas = document.getElementById(`canvas-${item.id}`);
        
        if (!current || !currentCanvas) {
            activeAnimations.delete(item.id);
            return;
        }

        const interval = current.tick * 50; 
        if (timestamp - lastTime >= interval) {
            ctx.clearRect(0,0,16,16);
            ctx.imageSmoothingEnabled = false;
            
            // 下地を描画
            ctx.globalAlpha = 1.0;
            ctx.drawImage(baseImg, 0, 0, 16, 16);
            
            // ゲーミングボディを描画
            ctx.globalAlpha = current.opacity;
            ctx.drawImage(assets.body, 0, current.previewFrame * 16, 16, 16, 0, 0, 16, 16);
            
            // フレームを描画
            if (current.useFrame) {
                ctx.globalAlpha = 1.0;
                ctx.drawImage(assets.frame, 0, current.previewFrame * 16, 16, 16, 0, 0, 16, 16);
            }
            
            current.previewFrame = (current.previewFrame + 1) % 7;
            lastTime = timestamp;
        }
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}

document.getElementById('iconInput').onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        packIconBlob = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('iconPreview').src = ev.target.result;
            document.getElementById('iconPreview').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
};

document.getElementById('downloadBtn').onclick = async () => {
    if (buildQueue.length === 0) return alert("Add blocks first.");
    const zip = new JSZip();
    const packName = document.getElementById('packName').value || "Gaming Ore Pack";
    let desc = `Gaming Ore Maker\n@beta03b2\n`;
    if (document.getElementById('packDesc').value) desc += document.getElementById('packDesc').value + "\n";
    desc += `Gaming-themed blocks`;
    buildQueue.forEach(i => desc += `\n§a§l${i.name}§r\n  §bTransparency:${Math.round(i.opacity*100)}%\n  Frame:${i.useFrame?'ON':'OFF'}\n  tick_per_frame:${i.tick}`);
    zip.file("manifest.json", JSON.stringify({
        format_version: 2,
        header: { name: packName, description: desc, uuid: crypto.randomUUID(), version: [1,0,0], min_engine_version: [1,16,0] },
        modules: [{ type: "resources", uuid: crypto.randomUUID(), version: [1,0,0] }]
    }, null, 4));
    if (packIconBlob) zip.file("pack_icon.png", packIconBlob);
    const flipbooks = [];
    for (const item of buildQueue) {
        const blob = await compositeImage(item);
        zip.file(`textures/blocks/${item.name}.png`, blob);
        flipbooks.push({ flipbook_texture: `textures/blocks/${item.name}`, atlas_tile: item.name, ticks_per_frame: parseInt(item.tick), frames: [0,1,2,3,4,5,6] });
    }
    zip.file("textures/flipbook_textures.json", JSON.stringify(flipbooks, null, 4));
    saveAs(await zip.generateAsync({type:"blob"}), `${packName}.mcpack`);
};

async function compositeImage(item) {
    const canvas = document.getElementById('compCanvas');
    const ctx = canvas.getContext('2d');
    const baseImg = await loadImage(RAW_BASE + item.path);
    ctx.clearRect(0,0,16,112);
    for (let i=0; i<7; i++) {
        const y = i * 16;
        ctx.globalAlpha = 1.0; ctx.drawImage(baseImg, 0, 0, 16, 16, 0, y, 16, 16);
        ctx.globalAlpha = item.opacity; ctx.drawImage(assets.body, 0, y, 16, 16, 0, y, 16, 16);
        if (item.useFrame) { ctx.globalAlpha = 1.0; ctx.drawImage(assets.frame, 0, y, 16, 16, 0, y, 16, 16); }
    }
    return new Promise(r => canvas.toBlob(r));
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load: ${src}`));
        img.src = src;
        // キャッシュ対策として、すでに完了している場合のチェック
        if (img.complete) resolve(img);
    });
}

init();
