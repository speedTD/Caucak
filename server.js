import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');
const DATA_DIR = path.join(__dirname, 'data');
const MARKET_FILE = path.join(DATA_DIR, 'world_market.json');
const PORT = process.env.PORT || 8080;

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadMarketListings() {
    try {
        if (fs.existsSync(MARKET_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(MARKET_FILE, 'utf8'));
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {}
    return [];
}

function saveMarketListings(list) {
    try {
        fs.writeFileSync(MARKET_FILE, JSON.stringify(list.slice(0, 60), null, 2), 'utf8');
    } catch (e) {}
}

let worldMarketListings = loadMarketListings();

function broadcastGlobal(packet) {
    const msg = JSON.stringify(packet);
    clients.forEach((_, clientWs) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(msg);
        }
    });
}

function readJsonBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 65536) req.destroy();
        });
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
        });
        req.on('error', () => resolve({}));
    });
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2'
};

// Map: roomId (mã hồ) -> Set<WebSocket>
const rooms = new Map();
// Map: ws -> { id, name, roomId, fishCount, totalWeight, biggestFish, pos, state }
const clients = new Map();

function getRoomRoster(roomId) {
    const room = rooms.get(roomId);
    if (!room) return [];
    const list = [];
    room.forEach((cWs) => {
        const info = clients.get(cWs);
        if (info) {
            list.push({
                id: info.id,
                name: info.name,
                fishCount: info.fishCount,
                totalWeight: info.totalWeight,
                biggestFish: info.biggestFish,
                money: typeof info.money === 'number' ? info.money : 1000000,
                momCount: info.momCount || 0,
                pos: info.pos || { x: 0, y: 1.7, z: 22 },
                state: info.state || 'SEATED'
            });
        }
    });
    return list;
}

function broadcastToRoom(roomId, packet, excludeWs = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    const msg = JSON.stringify(packet);
    room.forEach((client) => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

function leaveCurrentRoom(ws) {
    const info = clients.get(ws);
    if (!info || !info.roomId) return;
    const oldRoomId = info.roomId;
    const room = rooms.get(oldRoomId);
    if (room) {
        room.delete(ws);
        if (room.size === 0) {
            rooms.delete(oldRoomId);
        } else {
            broadcastToRoom(oldRoomId, {
                type: 'PLAYER_LEFT',
                senderId: info.id,
                senderName: info.name,
                payload: { onlineCount: room.size }
            });
            broadcastToRoom(oldRoomId, {
                type: 'SYSTEM',
                text: `🚶 Cần thủ [${info.name}] đã rời hồ.`
            });
        }
    }
    info.roomId = null;
}

// HTTP Server: vừa phục vụ Health Check, REST API Chợ Thế Giới Online, vừa phục vụ trực tiếp game build từ dist/ (1-Click Publish!)
const server = http.createServer(async (req, res) => {
    const urlPath = (req.url || '/').split('?')[0];
    const corsHeaders = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
    }

    if (urlPath === '/api/health') {
        const roomSummary = {};
        rooms.forEach((set, rId) => { roomSummary[rId] = set.size; });
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({
            status: 'ONLINE',
            game: 'Vietnam Carp Fishing 3D',
            totalOnlinePlayers: clients.size,
            marketListingsCount: worldMarketListings.length,
            rooms: roomSummary,
            timestamp: new Date().toISOString()
        }));
        return;
    }

    // API CHỢ THẾ GIỚI ONLINE THẬT (Lưu JSON phía Server + Đồng bộ Realtime toàn server)
    if (urlPath === '/api/market' && req.method === 'GET') {
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ ok: true, listings: worldMarketListings }));
        return;
    }

    if (urlPath === '/api/market/list' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (!body || !body.name || !body.price) {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: 'Thiếu thông tin sản phẩm' }));
            return;
        }
        const item = {
            id: body.id || ('srv_' + Date.now() + '_' + Math.floor(Math.random() * 999)),
            tab: body.tab === 'bait' ? 'bait' : 'gear',
            type: body.type || 'ROD',
            name: String(body.name).slice(0, 80),
            seller: String(body.seller || 'Cần Thủ Online').slice(0, 32),
            price: Math.max(1000, Math.round(Number(body.price) || 100000)),
            icon: body.icon || '🎣',
            desc: String(body.desc || '').slice(0, 180),
            upgradeSlot: body.upgradeSlot || undefined,
            upgradeLevel: body.upgradeLevel || undefined,
            mainLineSize: body.mainLineSize || undefined,
            mainLineQty: body.mainLineQty || undefined,
            leaderSize: body.leaderSize || undefined,
            leaderQty: body.leaderQty || undefined,
            createdAt: Date.now()
        };
        worldMarketListings.unshift(item);
        if (worldMarketListings.length > 60) worldMarketListings.length = 60;
        saveMarketListings(worldMarketListings);
        broadcastGlobal({ type: 'MARKET_SYNC', listings: worldMarketListings });
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ ok: true, item, listings: worldMarketListings }));
        return;
    }

    if (urlPath === '/api/market/buy' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const idx = worldMarketListings.findIndex(x => x.id === body.id);
        if (idx < 0) {
            res.writeHead(404, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: 'Món hàng đã có người khác mua mất!' }));
            return;
        }
        const [sold] = worldMarketListings.splice(idx, 1);
        saveMarketListings(worldMarketListings);
        broadcastGlobal({ type: 'MARKET_SYNC', listings: worldMarketListings });
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ ok: true, sold, listings: worldMarketListings }));
        return;
    }

    // Phục vụ Static Frontend từ thư mục dist/
    let filePath = path.join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath);
    if (!filePath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            // SPA fallback về index.html
            filePath = path.join(DIST_DIR, 'index.html');
        }
        fs.readFile(filePath, (readErr, data) => {
            if (readErr) {
                res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Chưa build frontend (hãy chạy: npm run build)');
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
                'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
            });
            res.end(data);
        });
    });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        try {
            const packet = JSON.parse(data.toString());
            const type = packet.type;
            const payload = packet.payload || {};

            if (type === 'ROOM_STATE') {
                // Nếu đang ở phòng hồ khác thì rời phòng cũ trước
                leaveCurrentRoom(ws);

                const roomId = payload.roomId || 'lake_dai_yen';
                if (!rooms.has(roomId)) {
                    rooms.set(roomId, new Set());
                }
                rooms.get(roomId).add(ws);

                const p = payload.player || {};
                const info = {
                    id: packet.senderId || p.id || ('user_' + Math.floor(1000 + Math.random() * 9000)),
                    name: packet.senderName || p.name || 'Cần Thủ Online',
                    roomId,
                    fishCount: p.fishCount || 0,
                    totalWeight: p.totalWeight || 0,
                    biggestFish: p.biggestFish || 0,
                    pos: { x: 0, y: 1.7, z: 22 },
                    state: 'ROAM'
                };
                clients.set(ws, info);

                // Gửi danh sách cần thủ đang có trong hồ cho tất cả mọi người trong phòng
                const roster = getRoomRoster(roomId);
                broadcastToRoom(roomId, {
                    type: 'ROOM_ROSTER',
                    payload: { roomId, players: roster, onlineCount: roster.length }
                });

                broadcastToRoom(roomId, {
                    type: 'SYSTEM',
                    text: `🟢 Cần thủ [${info.name}] vừa vác thùng vào hồ! (${roster.length} người online)`
                }, ws);

            } else if (type === 'PLAYER_STATE_SYNC') {
                const info = clients.get(ws);
                if (info && info.roomId) {
                    if (payload.pos) info.pos = payload.pos;
                    if (payload.state) info.state = payload.state;
                    broadcastToRoom(info.roomId, packet, ws);
                }

            } else if (type === 'FISH_HOOKED') {
                const info = clients.get(ws);
                if (info && info.roomId) {
                    broadcastToRoom(info.roomId, packet, ws);
                }

            } else if (type === 'FISH_LANDED') {
                const info = clients.get(ws);
                if (info && info.roomId) {
                    if (payload.fish) {
                        info.fishCount += 1;
                        info.totalWeight = parseFloat((info.totalWeight + (payload.fish.weight || 0)).toFixed(2));
                        info.biggestFish = Math.max(info.biggestFish, payload.fish.weight || 0);
                    }
                    broadcastToRoom(info.roomId, packet, ws);
                }

            } else if (type === 'LEADERBOARD_UPDATE') {
                const info = clients.get(ws);
                if (info) {
                    if (typeof payload.money === 'number') info.money = payload.money;
                    if (typeof payload.momCount === 'number') info.momCount = payload.momCount;
                    if (typeof payload.biggestFish === 'number') info.biggestFish = Math.max(info.biggestFish || 0, payload.biggestFish);
                    if (typeof payload.totalWeight === 'number') info.totalWeight = payload.totalWeight;
                    if (typeof payload.fishCount === 'number') info.fishCount = payload.fishCount;
                    if (info.roomId) broadcastToRoom(info.roomId, packet, ws);
                }
            } else if (type === 'CHAT_MESSAGE') {
                // Kênh Chat Thế Giới: phát trực tiếp tới toàn bộ người chơi đang online trên server!
                const msg = JSON.stringify(packet);
                clients.forEach((_, clientWs) => {
                    if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(msg);
                    }
                });
            } else if (type === 'SYSTEM') {
                const info = clients.get(ws);
                if (info && info.roomId) {
                    broadcastToRoom(info.roomId, packet, ws);
                }
            }
        } catch (err) {
            console.error('Error parsing packet:', err.message);
        }
    });

    ws.on('close', () => {
        leaveCurrentRoom(ws);
        clients.delete(ws);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎣 Vietnam Carp Fishing 3D Server (Web + Online Multiplayer) đang chạy tại port: ${PORT}`);
    console.log(`👉 Mở game: http://localhost:${PORT}`);
    console.log(`👉 Health check: http://localhost:${PORT}/api/health`);
});
