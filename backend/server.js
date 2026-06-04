const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// Cấu hình Middleware
app.use(cors());
app.use(express.json());

// Khởi tạo kết nối Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Cấu hình Multer để lưu file tạm vào bộ nhớ (Memory Storage)
const upload = multer({ storage: multer.memoryStorage() });

// --- CÁC ĐƯỜNG DẪN API ---

// 1. API Upload ảnh lên hệ thống
app.post('/api/upload', upload.single('image'), async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const file = req.file;

  if (!token || !file) {
    return res.status(400).json({ error: 'Thiếu Token xác thực hoặc File ảnh.' });
  }

  // Xác thực user dựa trên token gửi từ Frontend gửi lên
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return res.status(401).json({ error: 'Tài khoản không hợp lệ hoặc hết phiên đăng nhập.' });
  }

  // Đặt tên file duy nhất trong storage: user_id/thời_gian_tên_file
  const fileName = `${user.id}/${Date.now()}_${file.originalname}`;

  // Upload file ảnh vật lý vào Supabase Storage bucket 'photos'
  const { data: storageData, error: storageErr } = await supabase.storage
    .from('photos')
    .upload(fileName, file.buffer, { contentType: file.mimetype });

  if (storageErr) {
    return res.status(500).json({ error: storageErr.message });
  }

  // Lấy đường link public URL của ảnh vừa upload
  const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName);

  // Lưu thông tin URL và ID người sở hữu vào bảng dữ liệu 'images'
  const { data: dbData, error: dbErr } = await supabase
    .from('images')
    .insert([{ user_id: user.id, image_url: publicUrl }])
    .select();

  if (dbErr) {
    return res.status(500).json({ error: dbErr.message });
  }

  res.json({ message: 'Upload thành công!', data: dbData[0] });
});

// 2. API Lấy danh sách ảnh của cơ sở dữ liệu dựa theo User đăng nhập
app.get('/api/images', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Không tìm thấy mã xác thực.' });

  // Xác thực xem token này thuộc về user nào
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Không có quyền truy cập.' });

  // Truy vấn danh sách các ảnh mà user đó đã tải lên
  const { data, error } = await supabase
    .from('images')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

// Chạy server API
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server đang chạy tại port ${PORT}`));