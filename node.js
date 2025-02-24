const axios = require('axios');

// Hàm lấy token xác thực từ mail.tm
async function getAuthToken(email, password) {
    const url = 'https://api.mail.tm/token';
    const payload = {
        address: email,
        password: password
    };
    try {
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Đã lấy được token:', response.data.token);
        return response.data.token;
    } catch (error) {
        console.error('Lỗi khi lấy token:', error.response?.data || error.message);
        return null;
    }
}

// Hàm lấy danh sách email từ hộp thư
async function getEmails(token) {
    const url = 'https://api.mail.tm/messages';
    try {
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.data['hydra:member']; // Trả về danh sách email
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
        return response.data.text || response.data.html || ''; // Lấy nội dung text hoặc html
    } catch (error) {
        console.error('Lỗi khi lấy nội dung email:', error.response?.data || error.message);
        return '';
    }
}

// Hàm trích xuất mã xác thực từ nội dung email
function extractVerificationCode(emailContent) {
    const pattern = /\b\d{6}\b/; // Tìm mã 6 chữ số
    const match = emailContent.match(pattern);
    if (match) {
        return match[0];
    }
    return null;
}

// Hàm chính để lấy mã xác thực
async function getVerificationCode(email, password) {
    console.log(`Sử dụng email: ${email}, password: ${password}`);

    // Bước 1: Lấy token xác thực
    const token = await getAuthToken(email, password);
    if (!token) {
        console.log('Không thể tiếp tục do lỗi lấy token.');
        return null;
    }

    // Bước 2: Kiểm tra hộp thư để lấy mã
    console.log('Đang kiểm tra hộp thư để tìm mã xác thực...');
    for (let i = 0; i < 10; i++) { // Thử tối đa 10 lần, mỗi lần cách 5 giây
        const emails = await getEmails(token);
        if (emails.length > 0) {
            const latestEmail = emails[0]; // Lấy email mới nhất
            console.log(`Tìm thấy email từ: ${latestEmail.from.address}, chủ đề: ${latestEmail.subject}`);
            
            // Bước 3: Lấy nội dung email
            const emailContent = await getEmailContent(token, latestEmail.id);
            console.log('Nội dung email:', emailContent);

            // Bước 4: Trích xuất mã xác thực
            const code = extractVerificationCode(emailContent);
            if (code) {
                console.log(`Mã xác thực: ${code}`);
                return code;
            } else {
                console.log('Không tìm thấy mã trong email này.');
            }
        } else {
            console.log('Hộp thư trống, chưa có email nào.');
        }
        console.log('Chưa tìm thấy mã, thử lại sau 5 giây...');
        await new Promise(resolve => setTimeout(resolve, 5000)); // Chờ 5 giây
    }
    console.log('Không tìm thấy mã xác thực sau 10 lần thử.');
    return null;
}

// Thông tin email và password của bạn
const myEmail = '2bs828i2@tohru.org';
const myPassword = 'mv5a63mn';

// Chạy chương trình
getVerificationCode(myEmail, myPassword)
    .then(code => {
        if (!code) {
            console.log('Không thể lấy được mã xác thực.');
        }
    })
    .catch(err => console.error('Lỗi toàn chương trình:', err));