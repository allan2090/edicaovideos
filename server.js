const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const uploadDir = path.join(os.tmpdir(), 'video-editor-uploads');
const usersFile = path.join(__dirname, 'users.json');
const upload = multer({ dest: uploadDir });
const app = express();
const port = process.env.PORT || 3000;

function hashPassword(password) {
  return crypto.createHash('sha256').update(password, 'utf8').digest('hex');
}

function verifyPassword(password, hash) {
  const passwordHash = hashPassword(password);
  return crypto.timingSafeEqual(Buffer.from(passwordHash, 'utf8'), Buffer.from(hash, 'utf8'));
}

async function loadUsers() {
  try {
    const content = await fs.readFile(usersFile, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function saveUsers(users) {
  await fs.writeFile(usersFile, JSON.stringify(users, null, 2), 'utf8');
}

async function ensureDefaultAdmin() {
  const users = await loadUsers();
  if (!users.some(user => user.role === 'admin')) {
    users.push({
      id: 1,
      name: 'Administrador',
      email: 'admin@localhost',
      passwordHash: hashPassword('admin123'),
      role: 'admin'
    });
    await saveUsers(users);
    console.log('Usuário admin criado: admin@localhost / admin123');
  }
}

async function ensureUploadDir() {
  await fs.mkdir(uploadDir, { recursive: true });
}

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `ffmpeg exited with code ${code}`));
      }
    });
  });
}

async function cleanupFiles(paths) {
  await Promise.all(paths.map(async filePath => {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // ignore missing files
    }
  }));
}

function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.redirect('/login.html');
}

function ensureAdmin(req, res, next) {
  if (req.session && req.session.userRole === 'admin') {
    return next();
  }
  return res.status(403).send('Acesso negado.');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'video-editor-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(async (req, res, next) => {
  const publicPaths = ['/login.html', '/login.js', '/style.css', '/favicon.ico'];

  if (req.path === '/api/login' || req.path === '/api/logout') {
    return next();
  }

  if (req.path === '/admin.html') {
    if (!req.session?.userId) {
      return res.redirect('/login.html');
    }
    if (req.session.userRole !== 'admin') {
      return res.status(403).send('Acesso negado.');
    }
    return next();
  }

  if (publicPaths.includes(req.path)) {
    return next();
  }

  if (req.path.startsWith('/api/')) {
    if (req.session?.userId) {
      return next();
    }
    return res.status(401).send('Autenticação necessária.');
  }

  if (req.session?.userId) {
    return next();
  }

  return res.redirect('/login.html');
});

app.use(express.static(path.join(__dirname)));

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send('Informe email e senha.');
  }

  const users = await loadUsers();
  const user = users.find(item => item.email.toLowerCase() === email.toLowerCase());

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).send('Credenciais inválidas.');
  }

  req.session.userId = user.id;
  req.session.userName = user.name;
  req.session.userEmail = user.email;
  req.session.userRole = user.role;

  return res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

app.post('/api/logout', ensureAuthenticated, (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('Erro ao encerrar sessão.');
    }
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

app.get('/api/profile', ensureAuthenticated, (req, res) => {
  return res.json({
    id: req.session.userId,
    name: req.session.userName,
    email: req.session.userEmail,
    role: req.session.userRole
  });
});

app.get('/api/users', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const users = await loadUsers();
  return res.json(users.map(({ id, name, email, role }) => ({ id, name, email, role })));
});

app.post('/api/users', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).send('Preencha todos os campos.');
  }

  const users = await loadUsers();
  if (users.some(user => user.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).send('Email já cadastrado.');
  }

  const newUser = {
    id: users.length ? Math.max(...users.map(user => user.id)) + 1 : 1,
    name,
    email,
    role: role === 'admin' ? 'admin' : 'user',
    passwordHash: hashPassword(password)
  };

  users.push(newUser);
  await saveUsers(users);

  return res.status(201).json({ id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role });
});

app.put('/api/users/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, email, password, role } = req.body;

  const users = await loadUsers();
  const user = users.find(item => item.id === id);
  if (!user) {
    return res.status(404).send('Usuário não encontrado.');
  }

  if (email && users.some(item => item.email.toLowerCase() === email.toLowerCase() && item.id !== id)) {
    return res.status(400).send('Email já cadastrado por outro usuário.');
  }

  if (name) user.name = name;
  if (email) user.email = email;
  if (role) user.role = role === 'admin' ? 'admin' : 'user';
  if (password) user.passwordHash = hashPassword(password);

  await saveUsers(users);
  return res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

app.delete('/api/users/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const users = await loadUsers();
  const userIndex = users.findIndex(item => item.id === id);

  if (userIndex === -1) {
    return res.status(404).send('Usuário não encontrado.');
  }

  if (users[userIndex].id === req.session.userId) {
    return res.status(400).send('Não é possível remover o usuário logado.');
  }

  users.splice(userIndex, 1);
  await saveUsers(users);

  return res.json({ ok: true });
});

app.post('/api/trim', upload.single('file'), async (req, res) => {
  await ensureUploadDir();

  const file = req.file;
  const { start, end } = req.body;
  const outputName = `trimmed-${Date.now()}.mp4`;
  const outputPath = path.join(uploadDir, outputName);
  const startValue = Number(start) || 0;
  const endValue = Number(end);

  if (!file || Number.isNaN(endValue) || endValue <= startValue) {
    await cleanupFiles([file?.path]);
    return res.status(400).send('Dados de recorte inválidos.');
  }

  const durationValue = (endValue - startValue).toString();

  try {
    await runFFmpeg(['-y', '-ss', startValue.toString(), '-i', file.path, '-t', durationValue, '-c', 'copy', outputPath]);
  } catch (copyError) {
    try {
      await runFFmpeg(['-y', '-ss', startValue.toString(), '-i', file.path, '-t', durationValue, '-c:v', 'libx264', '-c:a', 'aac', '-movflags', 'faststart', outputPath]);
    } catch (encodeError) {
      await cleanupFiles([file.path]);
      return res.status(500).send(`Erro ao processar o vídeo: ${encodeError.message}`);
    }
  }

  res.download(outputPath, outputName, async err => {
    await cleanupFiles([file.path, outputPath]);
    if (err) {
      console.error('Erro no download:', err);
    }
  });
});

app.post('/api/merge', upload.array('files', 20), async (req, res) => {
  await ensureUploadDir();

  const files = req.files || [];
  if (files.length < 2) {
    await cleanupFiles(files.map(file => file.path));
    return res.status(400).send('Envie ao menos dois vídeos para juntar.');
  }

  const outputName = `merged-${Date.now()}.mp4`;
  const outputPath = path.join(uploadDir, outputName);
  const concatPath = path.join(uploadDir, `concat-${Date.now()}.txt`);

  try {
    const listContent = files
      .map(file => `file '${file.path.replace(/'/g, "'\\''")}'`)
      .join('\n') + '\n';

    await fs.writeFile(concatPath, listContent, 'utf8');

    try {
      await runFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', outputPath]);
    } catch (copyError) {
      await runFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c:v', 'libx264', '-c:a', 'aac', '-movflags', 'faststart', outputPath]);
    }

    res.download(outputPath, outputName, async err => {
      await cleanupFiles([concatPath, outputPath, ...files.map(file => file.path)]);
      if (err) {
        console.error('Erro no download:', err);
      }
    });
  } catch (error) {
    await cleanupFiles([concatPath, outputPath, ...files.map(file => file.path)]);
    console.error(error);
    res.status(500).send(`Erro ao juntar os vídeos: ${error.message}`);
  }
});

ensureDefaultAdmin().then(() => {
  app.listen(port, () => {
    console.log(`Servidor de edição de vídeo rodando em http://localhost:${port}`);
  });
}).catch(error => {
  console.error('Não foi possível iniciar o servidor:', error);
  process.exit(1);
});
