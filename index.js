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

function randomString(length) {
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
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

app.get('/create-email', async (req, res) => {
    try {
        // Lấy danh sách domain từ Mail.tm
        const domainResponse = await axios.get('https://api.mail.tm/domains');
        const domains = domainResponse.data['hydra:member']; 
        const randomDomain = domains[Math.floor(Math.random() * domains.length)].domain;

        // Tạo email ngẫu nhiên
        const emailPrefix = randomString(10);
        const email = `${emailPrefix}@${randomDomain}`;

        // Tạo mật khẩu ngẫu nhiên
        const password = randomString(10);

        // Gửi request để tạo tài khoản
        const response = await axios.post('https://api.mail.tm/accounts', {
            address: email,
            password: password
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // ✅ Dùng res.json() để trả về JSON cho client
        res.json({
            email: email,
            password: password,
            accountInfo: response.data
        });

    } catch (error) {
        console.error("Lỗi tạo email:", error.response?.data || error.message);
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
