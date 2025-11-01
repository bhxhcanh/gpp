// QUAN TRỌNG: URL này bây giờ trỏ đến Google Apps Script QUẢN LÝ TRUNG TÂM (GAS_AUTH)
// Script này chỉ xử lý đăng ký, đăng nhập và trả về URL dữ liệu của nhà thuốc.
const GAS_AUTH_URL = 'https://script.google.com/macros/s/AKfycbzSC-jf-DmYy5subppERP1s_Zqn_TLlZswKTj7s1cqWz6ejXUiA2uZqKYBZ-FWoAjjQwQ/exec';


document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTS ---
    const loadingIndicator = document.getElementById('loading-indicator');
    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app-container');
    const configErrorBanner = document.getElementById('config-error-banner');

    const handleConfigurationCheck = () => {
        if (!GAS_AUTH_URL || GAS_AUTH_URL.includes('YOUR_') || GAS_AUTH_URL.length < 60) {
            if (configErrorBanner) configErrorBanner.classList.remove('hidden');
            return true;
        }
        if (configErrorBanner) configErrorBanner.classList.add('hidden');
        return false;
    };

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
    
    const handleLoginSubmit = async (form) => {
        const usernameInput = form.elements.username;
        const passwordInput = form.elements.password;
        const submitButton = form.querySelector('button[type="submit"]');
        const errorEl = document.getElementById('login-error');

        errorEl.classList.add('hidden');
        submitButton.disabled = true;
        submitButton.textContent = 'Đang đăng nhập...';

        try {
            // Bước 1: Gọi GAS_AUTH để xác thực và lấy oneTimeCode
            const authResult = await callAuthScript('loginUser', { 
                username: usernameInput.value, 
                password: passwordInput.value 
            });

            if (authResult.success && authResult.gasDataUrl && authResult.user && authResult.oneTimeCode) {
                const { gasDataUrl, user, oneTimeCode } = authResult;

                // Bước 2: Gọi GAS_DATA với oneTimeCode để tạo phiên
                const pharmacyLoginResponse = await fetch(gasDataUrl, {
                    method: 'POST',
                    body: JSON.stringify({ 
                        functionName: 'loginToPharmacy', 
                        args: { oneTimeCode: oneTimeCode } // Gửi mã dùng một lần
                    }),
                    redirect: 'follow'
                });

                const pharmacyLoginJson = await pharmacyLoginResponse.json();
                if (pharmacyLoginJson.status === 'error') throw new Error(pharmacyLoginJson.message);
                const result = pharmacyLoginJson.data;
                
                // Bước 3: Lưu trữ session và khởi tạo ứng dụng
                const appState = {
                    currentUser: result.user,
                    authToken: result.authToken,
                    gasDataUrl: gasDataUrl,
                    cache: {},
                };
                
                sessionStorage.setItem('currentUser', JSON.stringify(result.user));
                sessionStorage.setItem('authToken', result.authToken);
                sessionStorage.setItem('gasDataUrl', gasDataUrl);

                window.app.partialInitialize(appState);

                if (result.user.PhaiDoiMatKhau) {
                    if (loginPage) loginPage.classList.add('hidden');
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
    };

    const handleRegisterSubmit = async (form) => {
        const msgEl = document.getElementById('register-message');
        const submitBtn = form.querySelector('button[type="submit"]');
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
            msgEl.textContent = 'Đăng ký thành công! Vui lòng xác nhận trong email của bạn. Bạn có thể đóng cửa sổ này.';
            msgEl.style.color = 'var(--success-color)';
            msgEl.classList.remove('hidden');
            form.reset();
        } catch (error) {
            msgEl.textContent = `Lỗi: ${error.message}`;
            msgEl.style.color = 'var(--danger-color)';
            msgEl.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Đăng ký';
        }
    };
    
    const showRegisterModal = () => {
        const content = `
             <div class="auth-form-container">
                <h1>Đăng ký nhà thuốc</h1>
                <p>Bắt đầu quản lý hiệu quả ngay hôm nay.</p>
                <form id="register-form-modal">
                    <div class="input-group">
                        <label for="reg-tennhathuoc">Tên nhà thuốc</label>
                        <input type="text" id="reg-tennhathuoc" required>
                    </div>
                    <div class="input-group">
                        <label for="reg-username">Tên đăng nhập chính (quản trị)</label>
                        <input type="text" id="reg-username" required>
                    </div>
                    <div class="input-group">
                        <label for="reg-password">Mật khẩu</label>
                        <input type="password" id="reg-password" required minlength="4">
                    </div>
                    <div class="input-group">
                        <label for="reg-confirm-password">Xác nhận mật khẩu</label>
                        <input type="password" id="reg-confirm-password" required minlength="4">
                    </div>
                    <div class="input-group">
                        <label for="reg-hoten">Họ tên chủ nhà thuốc</label>
                        <input type="text" id="reg-hoten" required>
                    </div>
                    <div class="input-group">
                        <label for="reg-email">Email liên hệ</label>
                        <input type="email" id="reg-email" required>
                    </div>
                    <div class="input-group">
                        <label for="reg-sdt">Số điện thoại</label>
                        <input type="tel" id="reg-sdt" required>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width: 100%;">Đăng ký</button>
                </form>
                <p id="register-message" class="hidden" style="margin-top: 15px;"></p>
            </div>
        `;
        window.app.showModal('', content, { size: '500px' });
        const form = document.getElementById('register-form-modal');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleRegisterSubmit(form);
        });
        document.getElementById('reg-tennhathuoc').focus();
    };

    const showForgotPasswordModal = () => {
        const content = `
            <div class="auth-form-container">
                <h1>Khôi phục mật khẩu</h1>
                <p>Vui lòng nhập email bạn đã dùng để đăng ký tài khoản quản trị. Mật khẩu mới sẽ được gửi đến email này.</p>
                <form id="forgot-password-form">
                    <div class="input-group">
                        <label for="reset-email">Email đăng ký</label>
                        <input type="email" id="reset-email" required>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width: 100%;">Gửi yêu cầu</button>
                </form>
                <p id="reset-message" class="hidden" style="margin-top: 15px;"></p>
            </div>
        `;
        window.app.showModal('', content, { size: '500px' });
        const form = document.getElementById('forgot-password-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleForgotPasswordSubmit(form);
        });
    };

    const handleForgotPasswordSubmit = async (form) => {
        const email = document.getElementById('reset-email').value;
        const msgEl = document.getElementById('reset-message');
        const submitBtn = form.querySelector('button[type="submit"]');

        msgEl.classList.add('hidden');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang xử lý...';

        try {
            const result = await callAuthScript('resetPasswordByEmail', { email: email });
            msgEl.textContent = result.message;
            msgEl.style.color = 'var(--success-color)';
            msgEl.classList.remove('hidden');
            form.reset();
        } catch (error) {
            msgEl.textContent = `Lỗi: ${error.message}`;
            msgEl.style.color = 'var(--danger-color)';
            msgEl.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Gửi yêu cầu';
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
                await window.app.initializeApp(appState);
            } else {
                sessionStorage.clear();
                if (loginPage) loginPage.classList.remove('hidden');
                if (appContainer) appContainer.classList.add('hidden');
                
                const loginForm = document.getElementById('login-form');
                const registerLink = document.getElementById('show-register-link');
                const forgotPasswordLink = document.getElementById('show-forgot-password-link');

                if (loginForm) {
                    loginForm.addEventListener('submit', (e) => {
                        e.preventDefault();
                        handleLoginSubmit(loginForm);
                    });
                }
                if (registerLink) {
                    registerLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        showRegisterModal();
                    });
                }
                if (forgotPasswordLink) {
                    forgotPasswordLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        showForgotPasswordModal();
                    });
                }
                const usernameEl = document.getElementById('username');
                if (usernameEl) usernameEl.focus();
            }
        } catch (error) {
            console.error("Lỗi khi khởi tạo session:", error);
            sessionStorage.clear();
            if (loginPage) loginPage.classList.remove('hidden');
            if (appContainer) appContainer.classList.add('hidden');
        } finally {
            if (loadingIndicator) loadingIndicator.classList.add('hidden');
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
