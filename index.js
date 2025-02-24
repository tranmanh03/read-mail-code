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

// Hàm trích xuất mã xác thực
function extractVerificationCode(emailContent) {
    const pattern = /\b\d{6}\b/;
    const match = emailContent.match(pattern);
    return match ? match[0] : null;
}

// API endpoint: /email/password
app.get('/:email/:password', async (req, res) => {
    const { email, password } = req.params;
    console.log(`Yêu cầu từ: ${email}, password: ${password}`);

    try {
        // Bước 1: Lấy token
        const token = await getAuthToken(email, password);
        if (!token) {
            return res.json({ code: "111111" }); // Trả về 111111 nếu không lấy được token
        }

        // Bước 2: Kiểm tra hộp thư
        for (let i = 0; i < 5; i++) {
            const emails = await getEmails(token);
            if (emails.length > 0) {
                const latestEmail = emails[0];
                const emailContent = await getEmailContent(token, latestEmail.id);
                const code = extractVerificationCode(emailContent);
                if (code) {
                    return res.json({ code: code }); // Trả về mã thực nếu tìm thấy
                }
            }
            console.log('Chưa tìm thấy mã, chờ 5 giây...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        return res.json({ code: "111111" }); // Trả về 111111 nếu không tìm thấy mã sau 10 lần
    } catch (error) {
        console.error('Lỗi:', error);
        return res.json({ code: "111111" }); // Trả về 111111 nếu có lỗi bất ngờ
    }
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server chạy tại http://localhost:${PORT}`);
});