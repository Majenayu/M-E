// server.js
const express = require('express');
const http = require('http');
const { MongoClient } = require('mongodb');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from current folder (index.html, owner.html, user.html)
app.use(express.static(__dirname));

// ---------- MongoDB connection (user-provided) ----------
const MONGO_URI = "mongodb+srv://Maj:Maj@ayu.daaxx.mongodb.net/?appName=ayu";
// connect
let dbClient;
let db;
async function connectDb() {
  dbClient = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
  await dbClient.connect();
  db = dbClient.db('live_delivery_db'); // logical DB name
  console.log("Connected to MongoDB");
}
connectDb().catch(err => {
  console.error("MongoDB connection failed:", err);
  process.exit(1);
});

// ---------- Storage for uploads (in-memory) ----------
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ---------- Helpers ----------
function make4DigitCode() {
  // simple random 4-digit code (0000-9999) but avoid collisions by checking owners collection
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function haversineDistKm(lat1, lon1, lat2, lon2) {
  function toRad(x){ return x * Math.PI / 180; }
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ---------- REST endpoints ----------

// Generate a 4-digit code and create owner record
// owner sends: name (optional), photo (file), initial status (optional)
app.post('/generate', upload.single('photo'), async (req, res) => {
  try {
    const name = req.body.name || 'owner';
    let code;
    // ensure unique code
    const ownersCol = db.collection('owners');
    for (let i=0;i<10;i++){
      code = make4DigitCode();
      const existing = await ownersCol.findOne({ code });
      if (!existing) break;
    }
    // prepare owner doc
    const ownerDoc = {
      code,
      name,
      createdAt: new Date(),
      status: req.body.status || 'created',
      photo: null // store base64 string
    };
    if (req.file) {
      ownerDoc.photo = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }
    await ownersCol.insertOne(ownerDoc);

    // create the collection for live locations implicitly by using it later.
    res.json({ ok: true, code });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// update status (owner)
app.post('/status', async (req, res) => {
  try {
    const { code, status } = req.body;
    if (!code || !status) return res.status(400).json({ ok:false, error: "code & status required" });
    const ownersCol = db.collection('owners');
    await ownersCol.updateOne({ code }, { $set: { status, statusUpdatedAt: new Date() }});
    // broadcast status
    io.to(code).emit('status', { status });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error: e.message });
  }
});

// owner pushes live location (owner page does this every 5s)
app.post('/location', async (req, res) => {
  try {
    const { code, lat, lng } = req.body;
    if (!code || !lat || !lng) return res.status(400).json({ ok:false, error: "code, lat, lng required" });
    const coll = db.collection(code); // dynamic collection name = code
    const doc = {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      ts: new Date()
    };
    await coll.insertOne(doc);
    // broadcast to room
    io.to(code).emit('location', doc);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error: e.message });
  }
});

// get latest owner location and status (user initial fetch)
app.get('/latest/:code', async (req, res) => {
  try {
    const code = req.params.code;
    const coll = db.collection(code);
    const latest = await coll.find().sort({ ts: -1 }).limit(1).toArray();
    const ownersCol = db.collection('owners');
    const owner = await ownersCol.findOne({ code });
    res.json({ ok: true, latest: latest[0] || null, owner });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error: e.message });
  }
});

// optionally return a small image of owner
app.get('/owner-photo/:code', async (req, res) => {
  try {
    const code = req.params.code;
    const ownersCol = db.collection('owners');
    const owner = await ownersCol.findOne({ code });
    if (owner && owner.photo) {
      const data = owner.photo;
      // data is data:[mimetype];base64,xxxxx
      const comma = data.indexOf(',');
      const meta = data.substring(0, comma);
      const base = data.substring(comma+1);
      const mime = meta.split(':')[1].split(';')[0];
      const buffer = Buffer.from(base, 'base64');
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': buffer.length
      });
      res.end(buffer);
    } else {
      res.status(404).send('no photo');
    }
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message);
  }
});

// ---------- socket.io handling ----------
io.on('connection', socket => {
  console.log('socket connected', socket.id);

  socket.on('join_code', ({ code, role }) => {
    if (!code) return;
    socket.join(code);
    console.log(`${socket.id} joined ${code} as ${role || 'user'}`);
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

// ---------- start ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
