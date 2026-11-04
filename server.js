// Cổng nộp minh chứng Nghiên cứu khoa học
// Lưu dữ liệu ở DATA_DIR (db.json + thư mục uploads/). Trên Render: gắn Persistent Disk vào DATA_DIR.
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'doimatkhau';
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('nckh:' + ADMIN_PASSWORD).digest('hex');
const MAX_MB = Number(process.env.MAX_FILE_MB || 20);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- Lưu trữ JSON đơn giản, ghi nguyên tử ----------
const DEFAULT_CATEGORIES = [
  { id: 'bai-bao-tap-chi', name: 'Bài báo tạp chí khoa học', hint: 'Bản PDF bài báo + trang bìa/mục lục tạp chí có ISSN' },
  { id: 'bai-bao-hoi-thao', name: 'Bài báo / tham luận hội thảo', hint: 'Kỷ yếu có ISBN, trang mục lục và bài viết' },
  { id: 'de-tai', name: 'Đề tài NCKH (chủ nhiệm / thành viên)', hint: 'Quyết định giao đề tài, biên bản nghiệm thu' },
  { id: 'tham-du-hoi-thao', name: 'Chứng nhận tham dự hội thảo / seminar', hint: 'Giấy chứng nhận, chương trình hội thảo' },
  { id: 'sach', name: 'Sách / chương sách', hint: 'Bìa sách, trang ISBN, mục lục' },
  { id: 'giai-thuong', name: 'Giải thưởng NCKH', hint: 'Giấy khen / quyết định khen thưởng' },
  { id: 'khac', name: 'Minh chứng khác', hint: 'Mô tả rõ nội dung minh chứng' }
];
const STATUSES = ['moi', 'dang-xem', 'dat', 'can-bo-sung', 'khong-dat'];

function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { settings: { title: 'Minh chứng Nghiên cứu khoa học', intro: '', deadline: '', open: true }, categories: DEFAULT_CATEGORIES, submissions: [] }; }
}
let db = loadDB();
function saveDB() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
if (!fs.existsSync(DB_FILE)) saveDB();

// ---------- Upload ----------
const ALLOWED = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.zip', '.rar'];
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex') + path.extname(file.originalname).toLowerCase())
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    // multer đọc tên file theo latin1 -> chuyển về utf8 để giữ tiếng Việt
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ok = ALLOWED.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Định dạng file không được hỗ trợ: ' + file.originalname), ok);
  }
});

// ---------- Phiên đăng nhập admin (cookie ký HMAC) ----------
function sign(v) { return v + '.' + crypto.createHmac('sha256', SECRET).update(v).digest('hex'); }
function verify(t) {
  if (!t) return false;
  const i = t.lastIndexOf('.');
  const v = t.slice(0, i);
  const a = Buffer.from(sign(v)), b = Buffer.from(t);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(v.split(':')[1]) > Date.now();
}
function getCookie(req, name) {
  const m = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function requireAdmin(req, res, next) {
  if (verify(getCookie(req, 'nckh_admin'))) return next();
  res.status(401).json({ error: 'Chưa đăng nhập' });
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
// Tìm thư mục giao diện: ưu tiên public/, nếu repo bị làm phẳng thì dùng thư mục gốc
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public', 'index.html')) ? path.join(__dirname, 'public') : __dirname;
const PAGES = ['index.html', 'tra-cuu.html', 'admin.html', 'style.css'];
const missing = PAGES.filter(f => !fs.existsSync(path.join(PUBLIC_DIR, f)));
console.log('Thư mục giao diện:', PUBLIC_DIR, missing.length ? '— THIẾU: ' + missing.join(', ') : '— đủ file');
const page = name => (req, res) => {
  const f = path.join(PUBLIC_DIR, name);
  if (fs.existsSync(f)) return res.sendFile(f);
  res.status(500).type('html').send(`<h2>Thiếu file giao diện: ${name}</h2><p>Hãy kiểm tra repo GitHub có thư mục <b>public/</b> chứa index.html, tra-cuu.html, admin.html, style.css.</p>`);
};
app.get('/', page('index.html'));
app.get('/style.css', page('style.css'));

const clean = (s, max = 500) => String(s ?? '').trim().slice(0, max);
const norm = s => clean(s).toLowerCase();
const newCode = () => 'NC' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();

// ---------- API công khai ----------
app.get('/api/config', (req, res) => {
  res.json({ settings: db.settings, categories: db.categories, maxMB: MAX_MB, allowed: ALLOWED });
});

app.post('/api/submit', (req, res) => {
  if (!db.settings.open) return res.status(403).json({ error: 'Cổng nộp minh chứng hiện đang đóng.' });
  upload.array('files', 10)(req, res, err => {
    const cleanup = () => (req.files || []).forEach(f => fs.unlink(f.path, () => {}));
    if (err) { cleanup(); return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `File vượt quá ${MAX_MB} MB` : err.message }); }
    const b = req.body;
    const required = { fullName: 'Họ và tên', studentId: 'Mã học viên', email: 'Email', categoryId: 'Loại minh chứng', title: 'Tên minh chứng' };
    for (const [k, label] of Object.entries(required)) {
      if (!clean(b[k])) { cleanup(); return res.status(400).json({ error: `Thiếu thông tin: ${label}` }); }
    }
    if (!/^\S+@\S+\.\S+$/.test(clean(b.email))) { cleanup(); return res.status(400).json({ error: 'Email không hợp lệ' }); }
    if (!(req.files || []).length && !clean(b.link)) { cleanup(); return res.status(400).json({ error: 'Cần đính kèm ít nhất 1 file hoặc 1 đường link minh chứng' }); }
    if (!db.categories.find(c => c.id === b.categoryId)) { cleanup(); return res.status(400).json({ error: 'Loại minh chứng không hợp lệ' }); }

    const now = new Date().toISOString();
    const sub = {
      id: crypto.randomUUID(),
      code: newCode(),
      fullName: clean(b.fullName, 120),
      studentId: clean(b.studentId, 40).toUpperCase(),
      email: clean(b.email, 120).toLowerCase(),
      cohort: clean(b.cohort, 80),
      phone: clean(b.phone, 30),
      categoryId: b.categoryId,
      title: clean(b.title, 300),
      authors: clean(b.authors, 300),
      venue: clean(b.venue, 300),
      year: clean(b.year, 10),
      link: clean(b.link, 500),
      note: clean(b.note, 2000),
      files: (req.files || []).map(f => ({ stored: f.filename, name: f.originalname, size: f.size })),
      status: 'moi',
      tags: [],
      score: '',
      feedback: '',
      privateNote: '',
      history: [{ at: now, by: 'hoc-vien', action: 'Nộp minh chứng' }],
      createdAt: now,
      updatedAt: now,
      resubmitOf: clean(b.resubmitOf, 40) || null
    };
    db.submissions.unshift(sub);
    saveDB();
    res.json({ ok: true, code: sub.code });
  });
});

// Học viên tra cứu: MSHV + email
app.post('/api/lookup', (req, res) => {
  const sid = clean(req.body.studentId).toUpperCase(), email = norm(req.body.email);
  if (!sid || !email) return res.status(400).json({ error: 'Nhập mã học viên và email' });
  const list = db.submissions.filter(s => s.studentId === sid && s.email === email).map(s => ({
    code: s.code, title: s.title, categoryId: s.categoryId, status: s.status, feedback: s.feedback,
    score: s.score, createdAt: s.createdAt, updatedAt: s.updatedAt, files: s.files.map(f => f.name), link: s.link
  }));
  res.json({ submissions: list });
});

// ---------- API admin ----------
app.post('/api/admin/login', (req, res) => {
  const p = String(req.body.password || '');
  const a = crypto.createHash('sha256').update(p).digest(), b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Sai mật khẩu' });
  const token = sign('admin:' + (Date.now() + 7 * 24 * 3600 * 1000));
  res.setHeader('Set-Cookie', `nckh_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${req.secure ? '; Secure' : ''}`);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'nckh_admin=; Path=/; HttpOnly; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/data', requireAdmin, (req, res) => {
  res.json({ settings: db.settings, categories: db.categories, submissions: db.submissions, statuses: STATUSES });
});

app.patch('/api/admin/submissions/:id', requireAdmin, (req, res) => {
  const s = db.submissions.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Không tìm thấy' });
  const b = req.body, changes = [];
  if (b.status && STATUSES.includes(b.status) && b.status !== s.status) { changes.push(`Trạng thái: ${s.status} → ${b.status}`); s.status = b.status; }
  if (b.categoryId && db.categories.find(c => c.id === b.categoryId) && b.categoryId !== s.categoryId) { changes.push('Đổi loại minh chứng'); s.categoryId = b.categoryId; }
  if (Array.isArray(b.tags)) s.tags = b.tags.map(t => clean(t, 40)).filter(Boolean).slice(0, 12);
  if (b.score !== undefined) s.score = clean(b.score, 20);
  if (b.feedback !== undefined && clean(b.feedback, 4000) !== s.feedback) { s.feedback = clean(b.feedback, 4000); changes.push('Cập nhật phản hồi'); }
  if (b.privateNote !== undefined) s.privateNote = clean(b.privateNote, 4000);
  s.updatedAt = new Date().toISOString();
  if (changes.length) s.history.push({ at: s.updatedAt, by: 'giang-vien', action: changes.join('; ') });
  saveDB();
  res.json({ ok: true, submission: s });
});

app.delete('/api/admin/submissions/:id', requireAdmin, (req, res) => {
  const i = db.submissions.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Không tìm thấy' });
  db.submissions[i].files.forEach(f => fs.unlink(path.join(UPLOAD_DIR, f.stored), () => {}));
  db.submissions.splice(i, 1);
  saveDB();
  res.json({ ok: true });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const b = req.body;
  db.settings = { title: clean(b.title, 150) || db.settings.title, intro: clean(b.intro, 3000), deadline: clean(b.deadline, 30), open: !!b.open };
  if (Array.isArray(b.categories)) {
    const cats = b.categories.map(c => ({
      id: clean(c.id, 60) || ('loai-' + crypto.randomBytes(3).toString('hex')),
      name: clean(c.name, 150), hint: clean(c.hint, 300)
    })).filter(c => c.name);
    if (cats.length) db.categories = cats;
  }
  saveDB();
  res.json({ ok: true, settings: db.settings, categories: db.categories });
});

app.get('/api/admin/files/:stored', requireAdmin, (req, res) => {
  const stored = path.basename(req.params.stored);
  const sub = db.submissions.find(s => s.files.some(f => f.stored === stored));
  if (!sub) return res.status(404).send('Không tìm thấy file');
  const f = sub.files.find(f => f.stored === stored);
  const p = path.join(UPLOAD_DIR, stored);
  if (!fs.existsSync(p)) return res.status(404).send('File không còn trên máy chủ');
  const inline = req.query.view === '1';
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.sendFile(p);
});

app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  const catName = id => (db.categories.find(c => c.id === id) || {}).name || id;
  const cols = ['Mã nộp', 'Ngày nộp', 'Họ tên', 'MSHV', 'Lớp/Khóa', 'Email', 'SĐT', 'Loại minh chứng', 'Tên minh chứng', 'Tác giả', 'Nơi công bố', 'Năm', 'Link', 'Số file', 'Trạng thái', 'Điểm', 'Nhãn', 'Phản hồi', 'Ghi chú riêng'];
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = db.submissions.map(s => [s.code, s.createdAt, s.fullName, s.studentId, s.cohort, s.email, s.phone, catName(s.categoryId), s.title, s.authors, s.venue, s.year, s.link, s.files.length, s.status, s.score, s.tags.join(', '), s.feedback, s.privateNote].map(esc).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="minh-chung-nckh-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + cols.map(esc).join(',') + '\n' + rows.join('\n'));
});

app.get('/admin', page('admin.html'));
app.get('/tra-cuu', page('tra-cuu.html'));
app.get('/healthz', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Cổng minh chứng NCKH chạy tại http://localhost:${PORT}  (dữ liệu: ${DATA_DIR})`);
  if (!process.env.ADMIN_PASSWORD) console.warn('⚠ Chưa đặt ADMIN_PASSWORD — đang dùng mật khẩu mặc định "doimatkhau"');
});
