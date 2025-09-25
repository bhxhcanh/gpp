// QUAN TRỌNG: URL này bây giờ trỏ đến Google Apps Script QUẢN LÝ TRUNG TÂM (GAS_AUTH)
// Script này chỉ xử lý đăng ký, đăng nhập và trả về URL dữ liệu của nhà thuốc.
const GAS_AUTH_URL = 'https://script.google.com/macros/s/AKfycbzSC-jf-DmYy5subppERP1s_Zqn_TLlZswKTj7s1cqWz6ejXUiA2uZqKYBZ-FWoAjjQwQ/exec';


document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTS ---
    const loadingIndicator = document.getElementById('loading-indicator');
    const loginContainer = document.getElementById('login-container');
    const registerContainer = document.getElementById('register-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const configErrorBanner = document.getElementById('config-error-banner');

    const handleConfigurationCheck = () => {
        if (!GAS_AUTH_URL || GAS_AUTH_URL.includes('YOUR_') || GAS_AUTH_URL.length < 60) {
            if (configErrorBanner) configErrorBanner.classList.remove('hidden');
            return true;
        }
        if (configErrorBanner) configErrorBanner.classList.add('hidden');
        return false;
    };

    const showLogin = () => {
        loginContainer.classList.remove('hidden');
        registerContainer.classList.add('hidden');
        appContainer.classList.add('hidden');
        if (loginForm) loginForm.reset();
        const errorEl = document.getElementById('login-error');
        if (errorEl) errorEl.classList.add('hidden');
    };
    
    const showRegister = () => {
        loginContainer.classList.add('hidden');
        registerContainer.classList.remove('hidden');
        if(registerForm) registerForm.reset();
        const msgEl = document.getElementById('register-message');
        if (msgEl) msgEl.classList.add('hidden');
    };
    
    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        showRegister();
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        showLogin();
    });

    // Helper function to call the central authentication script
    const callAuthScript = async (functionName, args = {}) => {
        try {
            const response = await fetch(GAS_AUTH_URL, {
                method: 'POST',
                body: JSON.stringify({ functionName, args }),
                redirect: 'follow'
            });
            const result = await response.json();
            if (result.status === 'error') {
                throw new Error(result.message);
            }
            return result.data;
        } catch (error) {
            console.error(`Error calling auth function '${functionName}':`, error);
            throw error;
        }
    };

    const showForcePasswordChangeModal = (appState) => {
        const content = `
            <p>Đây là lần đăng nhập đầu tiên của bạn. Vui lòng đổi mật khẩu để tiếp tục.</p>
            <form id="force-change-password-form">
                <div class="input-group">
                    <label for="new-password">Mật khẩu mới</label>
                    <input type="password" id="new-password" required minlength="4">
                </div>
                <div class="input-group">
                    <label for="confirm-password">Xác nhận mật khẩu mới</label>
                    <input type="password" id="confirm-password" required minlength="4">
                </div>
                <p id="password-error" class="hidden" style="color: var(--danger-color);"></p>
                <div style="text-align: right; margin-top: 20px;">
                    <button type="submit" class="btn btn-primary">Lưu mật khẩu</button>
                </div>
            </form>
        `;
        window.app.showModal('Đổi Mật Khẩu Bắt Buộc', content, { isClosable: false });

        document.getElementById('force-change-password-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            const errorEl = document.getElementById('password-error');
            const submitBtn = e.target.querySelector('button');

            if (newPassword !== confirmPassword) {
                errorEl.textContent = 'Mật khẩu xác nhận không khớp.';
                errorEl.classList.remove('hidden');
                return;
            }
            errorEl.classList.add('hidden');
            submitBtn.disabled = true;

            try {
                await callAuthScript('changePassword', {
                    TenDangNhap: appState.currentUser.TenDangNhap,
                    newPassword: newPassword
                });
                
                window.app.showToast('Đổi mật khẩu thành công!', 'success');
                appState.currentUser.PhaiDoiMatKhau = false;
                sessionStorage.setItem('currentUser', JSON.stringify(appState.currentUser));
                window.app.hideModal();
                await window.app.initializeApp(appState);
            } catch (error) {
                errorEl.textContent = `Lỗi: ${error.message}`;
                errorEl.classList.remove('hidden');
            } finally {
                submitBtn.disabled = false;
            }
        });
    };
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameInput = e.target.elements.username;
        const passwordInput = e.target.elements.password;
        const submitButton = loginForm.querySelector('button[type="submit"]');
        const errorEl = document.getElementById('login-error');

        errorEl.classList.add('hidden');
        submitButton.disabled = true;
        submitButton.textContent = 'Đang đăng nhập...';

        try {
            // BƯỚC 1: Gọi đến GAS_AUTH_URL để lấy thông tin người dùng và URL dữ liệu của nhà thuốc
            const authResult = await callAuthScript('loginUser', { 
                username: usernameInput.value, 
                password: passwordInput.value 
            });

            if (authResult.success && authResult.gasDataUrl && authResult.user) {
                const { gasDataUrl, user } = authResult;

                // BƯỚC 2: Dùng URL dữ liệu để lấy token phiên làm việc.
                // Hàm loginToPharmacy giờ chỉ có nhiệm vụ tạo session, không xác thực lại.
                const pharmacyLoginResponse = await fetch(gasDataUrl, {
                    method: 'POST',
                    body: JSON.stringify({ functionName: 'loginToPharmacy', args: { user: user } }), // Pass the whole user object
                    redirect: 'follow'
                });
                const pharmacyLoginJson = await pharmacyLoginResponse.json();
                if (pharmacyLoginJson.status === 'error') throw new Error(pharmacyLoginJson.message);
                const result = pharmacyLoginJson.data;
                
                // Đăng nhập thành công, chuẩn bị state
                const appState = {
                    currentUser: result.user,
                    authToken: result.authToken,
                    gasDataUrl: gasDataUrl,
                    cache: {},
                };
                
                sessionStorage.setItem('currentUser', JSON.stringify(result.user));
                sessionStorage.setItem('authToken', result.authToken);
                sessionStorage.setItem('gasDataUrl', gasDataUrl);

                // Khởi tạo một phần app để có thể dùng modal và các hàm tiện ích
                window.app.partialInitialize(appState);

                if (result.user.PhaiDoiMatKhau) {
                    showForcePasswordChangeModal(appState);
                } else {
                    await window.app.initializeApp(appState);
                }
            } else {
                throw new Error("Xác thực thất bại, không nhận được thông tin đầy đủ từ máy chủ.");
            }
        } catch (error) {
            errorEl.textContent = error.message;
            errorEl.classList.remove('hidden');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Đăng nhập';
        }
    });
    
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgEl = document.getElementById('register-message');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        const password = document.getElementById('reg-password').value;
        const confirmPassword = document.getElementById('reg-confirm-password').value;

        msgEl.classList.add('hidden');
        if (password !== confirmPassword) {
            msgEl.textContent = 'Mật khẩu xác nhận không khớp.';
            msgEl.style.color = 'var(--danger-color)';
            msgEl.classList.remove('hidden');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang xử lý...';

        const args = {
            TenNhaThuoc: document.getElementById('reg-tennhathuoc').value,
            username_chinh: document.getElementById('reg-username').value,
            MatKhau: password,
            HoTen: document.getElementById('reg-hoten').value,
            EmailLienHe: document.getElementById('reg-email').value,
            SoDienThoai: document.getElementById('reg-sdt').value
        };

        try {
            await callAuthScript('registerPharmacy', args);
            
            msgEl.textContent = 'Đăng ký thành công! Vui lòng xác nhận trong email của bạn. Đang chuyển về trang đăng nhập...';
            msgEl.style.color = 'var(--success-color)';
            msgEl.classList.remove('hidden');

            setTimeout(() => {
                showLogin();
            }, 3000);

        } catch (error) {
            msgEl.textContent = `Lỗi: ${error.message}`;
            msgEl.style.color = 'var(--danger-color)';
            msgEl.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Đăng ký';
        }
    });

    async function checkSessionAndStart() {
        if (handleConfigurationCheck()) {
            loadingIndicator.classList.add('hidden');
            return;
        }
    
        try {
            const storedUser = sessionStorage.getItem('currentUser');
            const storedToken = sessionStorage.getItem('authToken');
            const storedUrl = sessionStorage.getItem('gasDataUrl');

            if (storedUser && storedToken && storedUrl) {
                const appState = {
                    currentUser: JSON.parse(storedUser),
                    authToken: storedToken,
                    gasDataUrl: storedUrl,
                    cache: {},
                };
                // Khởi động ứng dụng chính
                await window.app.initializeApp(appState);
            } else {
                sessionStorage.clear();
                showLogin();
            }
        } catch (error) {
            console.error("Lỗi khi khởi tạo session:", error);
            sessionStorage.clear();
            showLogin();
        } finally {
            loadingIndicator.classList.add('hidden');
        }
    }

    // Chờ cho script.js load và định nghĩa window.app và các hàm cần thiết
    const waitForApp = setInterval(() => {
        if (window.app && window.app.initializeApp) {
            clearInterval(waitForApp);
            checkSessionAndStart();
        }
    }, 50);

});