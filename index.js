const express = require('express');
const axios = require('axios');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

const app = express();
const PORT = process.env.PORT || 3000;

// Hàm lấy token xác thực từ mail.tm
async function getAuthToken(email, password) {
    try {
        const response = await axios.post('https://api.mail.tm/token', { address: email, password }, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data.token;
    } catch (error) {
        console.error('Lỗi khi lấy token:', error.response?.data || error.message);
        return null;
    }
}

// Hàm lấy danh sách email từ hộp thư
async function getEmails(token) {
    try {
        const response = await axios.get('https://api.mail.tm/messages', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.data['hydra:member'];
    } catch (error) {
        console.error('Lỗi khi lấy danh sách email:', error.response?.data || error.message);
        return [];
    }
}

// 🟢 Hàm lấy nội dung email chi tiết
async function getEmailContent(token, emailId) {
    try {
        const response = await axios.get(`https://api.mail.tm/messages/${emailId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.data.text || response.data.html || '';
    } catch (error) {
        console.error('Lỗi khi lấy nội dung email:', error.response?.data || error.message);
        return '';
    }
}

// 🟢 Hàm trích xuất mã xác thực từ nội dung email
function extractVerificationCode(emailContent) {
    const pattern = /\b\d{6}\b/g; // Tìm tất cả mã số 6 chữ số trong email
    const matches = emailContent.match(pattern);
    return matches ? matches[0] : null;
}

// 🟢 API lấy mã xác thực từ mail.tm
app.get('/get-code', async (req, res) => {
    const email = req.query.email;
    const password = req.query.password;

    if (!email || !password) {
        return res.status(400).json({ error: "Thiếu email hoặc mật khẩu" });
    }

    console.log(`Nhận yêu cầu từ: ${email}`);

    try {
        // 1️Lấy token
        const token = await getAuthToken(email, password);
        if (!token) return res.json({ code: "111111" });

        // 2️Kiểm tra hộp thư để lấy mã (Thử lại tối đa 3 lần)
        const allowedSenders = ["verify@x.com", "info@x.com"]; // Danh sách người gửi hợp lệ
        for (let i = 0; i < 3; i++) {
            const emails = await getEmails(token);
            const filteredEmails = emails.filter(email => allowedSenders.includes(email.from.address));

            if (filteredEmails.length > 0) {
                const latestEmail = filteredEmails[0]; // Email mới nhất từ người gửi hợp lệ
                const emailContent = await getEmailContent(token, latestEmail.id);
                const code = extractVerificationCode(emailContent);

                if (code) {
                    return res.json({ code });
                }
            }

            // Chờ 5 giây trước khi thử lại
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        return res.json({ code: "111111" });
    } catch (error) {
        console.error('Lỗi:', error);
        return res.json({ code: "111111" });
    }
});


// ✅ Hàm tạo chuỗi ngẫu nhiên mạnh
function randomString(length) {
    const chars = 'abcde32fghijklmno34pq5rfahot0wtq489perqtyqpqhj4vlam8xnbnzbvbhdyqrstuvwxyz0123456789';
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
            const email = `${randomString(10)}@${domains[Math.floor(Math.random() * domains.length)].domain}`;
            const password = randomString(8);

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

// 🔹 Hàm lấy mã từ mail.privateemail.com (IMAP)
async function getCodeFromIMAP(emailUser, emailPass, targetEmail) {
    return new Promise((resolve, reject) => {
        if (!emailUser || !emailPass || !targetEmail || !targetEmail.includes('@')) {
            return resolve({ code: 111111 }); // Trả về mã mặc định nếu thông tin không hợp lệ
        }

        const imap = new Imap({
            user: emailUser,
            password: emailPass,
            host: 'mail.privateemail.com',
            port: 993,
            tls: true
        });

        imap.once('ready', () => {
            imap.openBox('INBOX', false, (err, box) => {
                if (err) {
                    imap.end();
                    return reject(err);
                }

                // ✅ Sửa cú pháp `search`
                imap.search([['TO', targetEmail]], (err, results) => {
                    if (err || !results || results.length === 0) {
                        imap.end();
                        return resolve({ code: 111111 });
                    }

                    const latestEmailId = results[results.length - 1];

                    const fetchStream = imap.fetch(latestEmailId, { bodies: '' });

                    fetchStream.on('message', (msg) => {
                        let emailData = '';

                        msg.on('body', (stream) => {
                            stream.on('data', (chunk) => emailData += chunk.toString());

                            stream.once('end', async () => {
                                try {
                                    const parsed = await simpleParser(emailData);
                                    const body = parsed.text || '';
                                    const code = extractVerificationCode(body);
                                    resolve({ code: code || 111111 });
                                } catch (error) {
                                    resolve({ code: 111111 });
                                }
                            });
                        });
                    });

                    fetchStream.on('end', () => imap.end());
                });
            });
        });

        imap.once('error', (err) => {
            console.error('Lỗi IMAP:', err);
            resolve({ code: 111111 });
        });

        imap.connect();
    });
}

// 🔹 Hàm trích xuất mã xác thực từ nội dung email
function extractVerificationCode(emailContent) {
    const pattern = /\b\d{6}\b/;
    const match = emailContent.match(pattern);
    return match ? match[0] : null;
}

// 🔹 API lấy mã từ mail.privateemail.com (IMAP)
app.get('/get-private-code', async (req, res) => {
    const emailUser = req.query.emailUser;
    const emailPass = req.query.emailPass;
    const targetEmail = req.query.targetEmail;

    console.log(`Nhận request: user=${emailUser}, pass=${emailPass}, target=${targetEmail}`);

    if (!emailUser || !emailPass || !targetEmail) {
        return res.status(400).json({ error: "Thiếu thông tin đăng nhập" });
    }

    try {
        let code = null;
        for (let i = 0; i < 3; i++) {
            const result = await getCodeFromIMAP(emailUser, emailPass, targetEmail);
            if (result.code !== 111111) {
                code = result.code;
                break;
            }
            console.log(`Lần thử ${i + 1}: Không tìm thấy mã, chờ 5 giây...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        res.json({ code: code || 111111 });
    } catch (error) {
        console.error('Lỗi:', error);
        res.json({ code: 111111 });
    }
});


// Khởi động server
app.listen(PORT, () => {
    console.log(`Server chạy tại http://localhost:${PORT}`);
});
