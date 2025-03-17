const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Hàm lấy token xác thực từ mail.tm
async function getAuthToken(email, password) {
    const url = 'https://api.mail.tm/token';
    const payload = { address: email, password };
    try {
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data.token;
    } catch (error) {
        console.error('Lỗi khi lấy token:', error.response?.data || error.message);
        return null; // Trả về null nếu lỗi
    }
}

// Hàm lấy danh sách email từ hộp thư
async function getEmails(token) {
    const url = 'https://api.mail.tm/messages';
    try {
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.data['hydra:member'];
    } catch (error) {
        console.error('Lỗi khi lấy danh sách email:', error.response?.data || error.message);
        return [];
    }
}

// Hàm lấy nội dung email chi tiết
async function getEmailContent(token, emailId) {
    const url = `https://api.mail.tm/messages/${emailId}`;
    try {
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.data.text || response.data.html || '';
    } catch (error) {
        console.error('Lỗi khi lấy nội dung email:', error.response?.data || error.message);
        return '';
    }
}

// Hàm trích xuất mã xác thực từ nội dung email
function extractVerificationCode(emailContent) {
    const pattern = /\b\d{6}\b/;
    const match = emailContent.match(pattern);
    return match ? match[0] : null;
}

// API endpoint: /get-code?email=your@email.com&password=yourpassword
app.get('/get-code', async (req, res) => {
    const email = req.query.email;
    const password = req.query.password;

    if (!email || !password) {
        return res.status(400).json({ error: "Thiếu email hoặc mật khẩu" });
    }

    console.log(`Yêu cầu từ: ${email}, password: ${password}`);

    try {
        // Bước 1: Lấy token
        const token = await getAuthToken(email, password);
        if (!token) {
            return res.json({ code: "111111" }); // Trả về 111111 nếu không lấy được token
        }

        // Bước 2: Kiểm tra hộp thư để lấy mã
        for (let i = 0; i < 5; i++) {
            const emails = await getEmails(token);
            if (emails.length > 0) {
                const latestEmail = emails[0];
                const emailContent = await getEmailContent(token, latestEmail.id);
                const code = extractVerificationCode(emailContent);
                if (code) {
                    return res.json({ code: code });
                }
            }
            console.log('Chưa tìm thấy mã, chờ 5 giây...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        return res.json({ code: "111111" }); // Trả về 111111 nếu không tìm thấy mã sau 5 lần thử
    } catch (error) {
        console.error('Lỗi:', error);
        return res.json({ code: "111111" }); // Trả về 111111 nếu có lỗi bất ngờ
    }
});

// ✅ Hàm tạo chuỗi ngẫu nhiên mạnh
function randomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

// ✅ Hàm tạo email với Mail.tm (retry tối đa 5 lần, delay 3s mỗi lần)
async function createMailTM(retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            // Bước 1: Lấy danh sách domain từ Mail.tm
            const domainResponse = await axios.get('https://api.mail.tm/domains', { timeout: 3000 });
            const domains = domainResponse.data['hydra:member'];
            if (!domains.length) throw new Error("Không có domain nào khả dụng");

            // Bước 2: Tạo email ngẫu nhiên
            const email = `${randomString(12)}@${domains[Math.floor(Math.random() * domains.length)].domain}`;
            const password = randomString(10);

            // Bước 3: Tạo tài khoản trên Mail.tm
            const response = await axios.post('https://api.mail.tm/accounts', {
                address: email,
                password: password
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
            });

            return { email, password, accountInfo: response.data };
        } catch (error) {
            console.error(`Lỗi khi tạo email (thử lần ${i + 1}):`, error.message);
            if (i < retries - 1) await new Promise(res => setTimeout(res, 3000)); // Đợi 3 giây rồi thử lại
        }
    }
    throw new Error("Tạo email thất bại sau nhiều lần thử");
}

// ✅ API tạo email
app.get('/create-email', async (req, res) => {
    try {
        const emailData = await createMailTM();
        res.json(emailData);
    } catch (error) {
        console.error("Lỗi tạo email:", error.message);
        res.status(500).json({
            email: "error",
            password: "error",
            accountInfo: "error"
        });
    }
});

// ✅ API tạo email
app.get('/create-email', async (req, res) => {
    try {
        const emailData = await createEmailWithRetry();
        res.json(emailData);
    } catch (error) {
        console.error("Lỗi tạo email:", error.message);
        res.status(500).json({
            email: "error",
            password: "error",
            accountInfo: "error"
        });
    }
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server chạy tại http://localhost:${PORT}`);
});
