const express = require('express');
const cors = require('cors'); // 1. Đảm bảo đã require thư viện CORS
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// 2. CẤU HÌNH CORS CHUẨN (Cho phép tất cả các nguồn gọi vào API)
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Khởi tạo Supabase Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Cấu hình Multer lưu file tạm trong bộ nhớ
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Thay thế hàm checkAuth cũ bằng đoạn này:
async function checkAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Thiếu token xác thực' });

        const token = authHeader.split(' ')[1];
        
        // Gọi API Supabase lấy thông tin user từ token gửi lên
        const { data: { user }, error } = await supabase.auth.getUser(token);

        // Nếu lỗi auth từ Supabase, in ra log để kiểm tra và chặn lại
        if (error || !user) {
            console.error("Lỗi xác thực Supabase Auth:", error);
            return res.status(401).json({ error: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại' });
        }

        req.user = user; // Gắn thông tin user vào request
        next();
    } catch (err) {
        console.error("Lỗi hệ thống tại checkAuth:", err);
        res.status(500).json({ error: "Lỗi xác thực hệ thống" });
    }
}

// LỖI 404 NẰM Ở ĐÂY: Đảm bảo đường dẫn là '/api/images' viết thường, có chữ 's'
app.get('/api/images', checkAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('images')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Đường dẫn upload ảnh
app.post('/api/upload', checkAuth, upload.single('image'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'Vui lòng chọn file ảnh để tải lên' });

        const fileName = `${req.user.id}/${Date.now()}-${file.originalname}`;

        // Upload trực tiếp lên Supabase Storage Bucket
        const { data: storageData, error: storageErr } = await supabase.storage
            .from('photos') // Tên bucket trên Supabase phải trùng khớp hoàn toàn
            .upload(fileName, file.buffer, { contentType: file.mimetype });

        if (storageErr) throw storageErr;

        // Lấy URL công khai của ảnh vừa upload
        const { data: { publicUrl } } = supabase.storage
            .from('photos')
            .getPublicUrl(fileName);

        // Lưu thông tin ảnh vào bảng 'images' trong Database
        const { data, error: dbErr } = await supabase
            .from('images')
            .insert([{ user_id: req.user.id, image_url: publicUrl }])
            .select();

        if (dbErr) throw dbErr;
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Kiểm tra cổng chạy server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT}`);
});