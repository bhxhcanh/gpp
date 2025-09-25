// --- GLOBAL APP OBJECT ---
// Centralized place for shared state and functions
window.app = {};

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENTS ---
    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app-container');
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    const mainContent = document.getElementById('main-content');
    const pageTitle = document.getElementById('page-title');
    const modalContainer = document.getElementById('modal-container');
    const modalBody = document.getElementById('modal-body');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const connectionStatusEl = document.getElementById('connection-status');
    const statusTextEl = document.getElementById('status-text');
    const toastContainer = document.getElementById('toast-container');
    const userMenu = document.getElementById('user-menu');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    const configErrorBanner = document.getElementById('config-error-banner');

    // --- STATE MANAGEMENT ---
    let appState = {
        currentUser: null,
        authToken: null, // Token làm việc với GAS_DATA của nhà thuốc
        gasDataUrl: null, // URL riêng của từng nhà thuốc
        cache: {},
    };
    window.app.state = appState;

    // --- CONSTANTS ---
    const VIETNAM_BANKS = [
        { name: 'Ngân hàng TMCP An Bình (ABBANK)', bin: '970425' },
        { name: 'Ngân hàng TMCP Á Châu (ACB)', bin: '970416' },
        { name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam (Agribank)', bin: '970405' },
        { name: 'Ngân hàng TMCP Bảo Việt (BaoViet Bank)', bin: '970438' },
        { name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)', bin: '970418' },
        { name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam (Eximbank)', bin: '970431' },
        { name: 'Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu (GPBank)', bin: '970408' },
        { name: 'Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh (HDBank)', bin: '970437' },
        { name: 'Ngân hàng TMCP Kiên Long (Kienlongbank)', bin: '970452' },
        { name: 'Ngân hàng TMCP Lộc Phát Việt Nam (LPBank)', bin: '970449' },
        { name: 'Ngân hàng TMCP Quân đội (MBBank)', bin: '970422' },
        { name: 'Ngân hàng TMCP Hàng Hải (MSB)', bin: '970426' },
        { name: 'Ngân hàng TMCP Nam Á (NamA Bank)', bin: '970428' },
        { name: 'Ngân hàng TMCP Phương Đông (OCB)', bin: '970448' },
        { name: 'Ngân hàng TMCP Đại Chúng Việt Nam (PVComBank)', bin: '970412' },
        { name: 'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)', bin: '970403' },
        { name: 'Ngân hàng TMCP Sài Gòn Công Thương (Saigonbank)', bin: '970400' },
        { name: 'Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)', bin: '970443' },
        { name: 'Ngân hàng TMCP Đông Nam Á (SeABank)', bin: '970440' },
        { name: 'Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)', bin: '970407' },
        { name: 'Ngân hàng TMCP Tiên Phong (TPBank)', bin: '970423' },
        { name: 'Ngân hàng TMCP Quốc tế Việt Nam (VIB Bank)', bin: '970441' },
        { name: 'Ngân hàng TMCP Việt Á (VietABank)', bin: '970427' },
        { name: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)', bin: '970436' },
        { name: 'Ngân hàng TMCP Công thương Việt Nam (VietinBank)', bin: '970415' },
        { name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)', bin: '970432' },
        { name: 'VNPT Money', bin: '971011' },
        { name: 'Viettel Money', bin: '971005' }
    ].sort((a, b) => a.name.localeCompare(b.name));

    // --- API & CACHING ---
    const callAppsScript = async (functionName, args = {}, stateOverride = null) => {
        const activeState = stateOverride || appState;

        if (!activeState.gasDataUrl) {
            throw new Error("Không thể gọi API nghiệp vụ: URL dữ liệu không tồn tại.");
        }

        const finalArgs = { ...args, authToken: activeState.authToken };
        
        try {
            const response = await fetch(activeState.gasDataUrl, {
                method: 'POST',
                body: JSON.stringify({ functionName, args: finalArgs }),
                redirect: 'follow'
            });

            const contentType = response.headers.get("content-type");
            if (!response.ok || (contentType && contentType.indexOf("application/json") === -1)) {
                const errorText = await response.text();
                console.error("Lỗi Backend GAS:", errorText);
                if (errorText.includes('accounts.google.com')) {
                    throw new Error("Lỗi Phân Quyền. Vui lòng kiểm tra cài đặt triển khai Google Apps Script. Đảm bảo 'Ai có quyền truy cập' được đặt là 'Bất kỳ ai'.");
                }
                throw new Error(`Lỗi từ backend. Phản hồi không phải là JSON (Status: ${response.status}). Vui lòng kiểm tra log trong Google Apps Script.`);
            }

            const result = await response.json();
            if (result.status === 'error') {
                 if (result.message.toLowerCase().includes("unauthorized")) {
                    handleSessionExpired();
                }
                throw new Error(result.message);
            }
            return result.data;
        } catch (error) {
            console.error(`Lỗi khi gọi hàm '${functionName}':`, error);
            if (error.message.includes("Failed to fetch")) {
                 throw new Error("Không thể kết nối tới backend. Vui lòng kiểm tra lại URL và kết nối mạng.");
            }
            throw error;
        }
    };
    window.app.callAppsScript = callAppsScript;

    // Helper function to call the central authentication script
    const callAuthScript = async (functionName, args = {}) => {
        // This function doesn't use the session token (authToken)
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
    window.app.callAuthScript = callAuthScript;
    
    const getCachedDanhMuc = async (tenDanhMuc, forceRefresh = false) => {
        if (!forceRefresh && appState.cache[tenDanhMuc]) return appState.cache[tenDanhMuc];
        const data = await callAppsScript('getDanhMuc', { tenDanhMuc });
        appState.cache[tenDanhMuc] = data;
        return data;
    };
    window.app.getCachedDanhMuc = getCachedDanhMuc;

    const invalidateCache = (tenDanhMuc) => {
        if (appState.cache[tenDanhMuc]) delete appState.cache[tenDanhMuc];
    };
    window.app.invalidateCache = invalidateCache;

    // --- TOAST & MODAL (SHARED UI) ---
    const showToast = (message, type = 'info', duration = 5000) => {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    };
    window.app.showToast = showToast;

    const showModal = (title, content, options = {}) => {
        const { isClosable = true, size = '600px' } = options;
        const modalContentEl = modalContainer.querySelector('.modal-content');
        if (modalContentEl) modalContentEl.style.maxWidth = size;

        modalBody.innerHTML = `<h2>${title}</h2>` + content;
        modalContainer.classList.remove('hidden');
        modalCloseBtn.style.display = isClosable ? 'block' : 'none';
        
        const closeModalHandler = (e) => {
            if (e.target === modalContainer || e.target === modalCloseBtn || e.key === 'Escape') {
                 if (isClosable) {
                    hideModal();
                 }
            }
        };

        modalContainer.addEventListener('click', closeModalHandler);
        modalCloseBtn.addEventListener('click', closeModalHandler);
        window.addEventListener('keydown', closeModalHandler, { once: true });
    };
    window.app.showModal = showModal;

    const hideModal = () => modalContainer.classList.add('hidden');
    window.app.hideModal = hideModal;
    
    window.app.generateOptions = (data, valueField, textField, selectedValue, addNewText) => {
        let optionsHtml = data.map(item =>
            `<option value="${item[valueField]}" ${selectedValue === item[valueField] ? 'selected' : ''}>${item[textField]}</option>`
        ).join('');
        if (addNewText) {
            optionsHtml += `<option value="--add-new--">${addNewText}</option>`;
        }
        return optionsHtml;
    };

    // --- CONNECTION STATUS ---
    const checkConnectionStatus = async () => {
        if (!connectionStatusEl || !statusTextEl || !appState.gasDataUrl) return;

        connectionStatusEl.className = 'connection-status checking';
        statusTextEl.textContent = 'Đang kiểm tra...';
        try {
            // Kiểm tra kết nối đến service dữ liệu của nhà thuốc
            await callAppsScript('checkConnection');
            connectionStatusEl.className = 'connection-status online';
            statusTextEl.textContent = 'Online';
        } catch (error) {
            connectionStatusEl.className = 'connection-status offline';
            statusTextEl.textContent = 'Offline';
            console.error("Lỗi kiểm tra kết nối:", error);
        }
    };

    // --- AUTHENTICATION & RBAC ---
    const logout = () => {
        showToast('Đang đăng xuất...', 'info');

        if (appState.authToken && appState.gasDataUrl) {
            // Fire and forget, but log errors.
            callAppsScript('logoutUser', {}).catch(e => console.error("Error on server logout:", e));
        }

        // Clear all local session and state data
        appState.currentUser = null;
        appState.authToken = null;
        appState.gasDataUrl = null;
        appState.cache = {}; // Clear cached data
        sessionStorage.clear(); // Clear all session storage
        
        // Use a short delay before reloading to allow any final async operations
        // and to show the toast message.
        setTimeout(() => {
            window.location.hash = '';
            window.location.reload();
        }, 500);
    };

    const handleSessionExpired = () => {
        showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
        logout();
    };

    const preloadData = async () => {
        showToast('Đang tải dữ liệu nền...', 'info');
        try {
            const promises = [
                getCachedDanhMuc('DanhMucThuoc'),
                getCachedDanhMuc('DonViQuyDoi'),
                getCachedDanhMuc('DanhMucKhachHang'),
                getCachedDanhMuc('DanhMucNhaCungCap'),
                getCachedDanhMuc('DanhMucNhaSanXuat'),
                getCachedDanhMuc('DMDonViTinh'),
                getCachedDanhMuc('DMNhomHangHoa'),
                callAppsScript('getInventorySummary').then(summary => {
                    appState.cache['inventorySummary'] = summary;
                }),
                callAuthScript('getUsersForAdmin', { username_chinh: appState.currentUser.username_chinh }).then(users => {
                    appState.cache['allUsers'] = users; // Cache all users for the pharmacy
                })
            ];
            if (!appState.cache['appSettings']) {
                promises.push(
                    callAppsScript('getAppSettings').then(settings => {
                        appState.cache['appSettings'] = settings;
                    })
                );
            }
            await Promise.all(promises);
            showToast('Dữ liệu đã sẵn sàng!', 'success');
        } catch (error) {
            showToast(`Lỗi tải dữ liệu nền: ${error.message}`, 'error');
        }
    };

    // --- IDLE TIMER FOR AUTO REFRESH ---
    let idleTimer = null;
    const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    const refreshDataSilently = async () => {
        console.log('App idle. Refreshing data silently...');
        showToast('Tự động làm mới dữ liệu do không hoạt động...', 'info');
        try {
            await Promise.all([
                getCachedDanhMuc('DanhMucThuoc', true),
                getCachedDanhMuc('DonViQuyDoi', true),
                getCachedDanhMuc('DanhMucKhachHang', true),
                callAppsScript('getInventorySummary').then(summary => {
                    appState.cache['inventorySummary'] = summary;
                })
            ]);
            if (window.location.hash === '#banhang') {
                 const salesRenderers = initializeSalesModule(window.app);
                 if (salesRenderers.banhang) salesRenderers.banhang();
            }
            console.log('Silent refresh successful.');
        } catch (error) {
            console.error('Silent data refresh failed:', error);
            showToast(`Tự động làm mới thất bại: ${error.message}`, 'error');
        } finally {
            resetIdleTimer();
        }
    };

    const resetIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(refreshDataSilently, IDLE_TIMEOUT);
    };
    
    const initializeIdleTimer = () => {
        window.addEventListener('mousemove', resetIdleTimer, false);
        window.addEventListener('mousedown', resetIdleTimer, false);
        window.addEventListener('keypress', resetIdleTimer, false);
        window.addEventListener('touchmove', resetIdleTimer, false);
        resetIdleTimer(); // Start the timer
    };

    const showApp = async () => {
        loginPage.classList.add('hidden');
        appContainer.classList.remove('hidden');
        const loadingIndicator = document.getElementById('loading-indicator');
        loadingIndicator.classList.add('hidden');

        try {
            appState.cache['appSettings'] = await callAppsScript('getAppSettings');
        } catch (e) {
            console.error("Không thể tải cài đặt ứng dụng:", e);
            showToast("Không thể tải cài đặt ứng dụng.", "error");
        }
        
        const settings = appState.cache['appSettings'] || {};
        const pharmacyNameEl = document.getElementById('sidebar-pharmacy-name');
        if (pharmacyNameEl && settings.TenNhaThuoc) {
            pharmacyNameEl.textContent = settings.TenNhaThuoc;
        }

        const userGreeting = document.getElementById('user-greeting');
        if (userGreeting && appState.currentUser) {
            userGreeting.textContent = `Chào, ${appState.currentUser.HoTen || 'Dược sĩ'}`;
        }

        applyRBAC();
        await checkConnectionStatus();
        handleHashChange();
        await preloadData();
        initializeIdleTimer();
    };

    const applyRBAC = () => {
        const userRole = appState.currentUser?.Quyen || '';
        const navVisibility = {
            'Admin': ['tongquan', 'banhang', 'hoadon', 'kho', 'danhsachphieunhap', 'xuatrancc', 'xuathuy', 'soquy', 'baocao', 'danhmuc', 'quantri'],
            'Quản trị': ['tongquan', 'banhang', 'hoadon', 'kho', 'danhsachphieunhap', 'xuatrancc', 'xuathuy', 'soquy', 'baocao', 'danhmuc', 'quantri'],
            'Bán hàng': ['tongquan', 'banhang', 'hoadon', 'soquy', 'baocao', 'danhmuc'],
            'Kho': ['tongquan', 'hoadon', 'kho', 'danhsachphieunhap', 'xuatrancc', 'xuathuy', 'soquy', 'baocao', 'danhmuc'],
        };
        const allowedPages = navVisibility[userRole] || [];
        document.querySelectorAll('.sidebar-nav [data-page]').forEach(link => {
            const page = link.dataset.page;
            const parentLi = link.closest('li');
            parentLi.style.display = allowedPages.includes(page) ? '' : 'none';
        });
        document.querySelectorAll('.nav-item-group').forEach(group => {
            const subLinks = group.querySelectorAll('.sub-menu a[data-page]');
            const isAnyVisible = Array.from(subLinks).some(sl => allowedPages.includes(sl.dataset.page));
            group.style.display = isAnyVisible ? '' : 'none';
        });
    };

    const hasPermission = (pageId) => {
        const userRole = appState.currentUser?.Quyen || '';
        const navVisibility = {
            'Admin': ['tongquan', 'banhang', 'hoadon', 'kho', 'danhsachphieunhap', 'xuatrancc', 'xuathuy', 'soquy', 'baocao', 'danhmuc', 'quantri', 'nhapkho', 'nhapkho-edit'],
            'Quản trị': ['tongquan', 'banhang', 'hoadon', 'kho', 'danhsachphieunhap', 'xuatrancc', 'xuathuy', 'soquy', 'baocao', 'danhmuc', 'quantri', 'nhapkho', 'nhapkho-edit'],
            'Bán hàng': ['tongquan', 'banhang', 'hoadon', 'soquy', 'baocao', 'danhmuc'],
            'Kho': ['tongquan', 'hoadon', 'kho', 'danhsachphieunhap', 'xuatrancc', 'xuathuy', 'soquy', 'baocao', 'danhmuc', 'nhapkho', 'nhapkho-edit'],
        };
        const allowedPages = navVisibility[userRole] || [];
        return allowedPages.includes(pageId);
    };

    const showUserInfoModal = () => {
        const user = appState.currentUser;
        if (!user) return;
    
        const ngaySinhValue = user.NgaySinh ? new Date(user.NgaySinh).toISOString().split('T')[0] : '';
    
        const content = `
            <form id="user-info-form">
                <div class="input-group"><label>Mã nhân viên</label><input type="text" value="${user.MaNhanVien || 'N/A'}" disabled></div>
                <div class="input-group"><label>Tên đăng nhập</label><input type="text" value="${user.TenDangNhap || 'N/A'}" disabled></div>
                <div class="input-group"><label for="user-info-hoten">Họ và tên (*)</label><input type="text" id="user-info-hoten" value="${user.HoTen || ''}" required></div>
                <div class="input-group"><label for="user-info-ngaysinh">Ngày sinh</label><input type="date" id="user-info-ngaysinh" value="${ngaySinhValue}"></div>
                <div class="input-group"><label>Chức vụ</label><input type="text" value="${user.ChucVu || 'N/A'}" disabled></div>
                <div class="input-group"><label>Quyền</label><input type="text" value="${user.Quyen || 'N/A'}" disabled></div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" id="modal-cancel-user-info">Hủy</button>
                    <button type="submit" class="btn btn-primary">Lưu thay đổi</button>
                </div>
            </form>
        `;
        showModal('Thông tin cá nhân', content, { size: '500px' });
        
        document.getElementById('modal-cancel-user-info').addEventListener('click', hideModal);

        document.getElementById('user-info-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang lưu...';
    
            try {
                const updatedUserData = {
                    TenDangNhap: user.TenDangNhap, // Key for finding user
                    HoTen: document.getElementById('user-info-hoten').value,
                    NgaySinh: document.getElementById('user-info-ngaysinh').value || null,
                };
                
                await callAuthScript('updateUser', { userData: updatedUserData });
                
                // Update local state
                appState.currentUser.HoTen = updatedUserData.HoTen;
                appState.currentUser.NgaySinh = updatedUserData.NgaySinh;
                sessionStorage.setItem('currentUser', JSON.stringify(appState.currentUser));
                
                // Update UI
                const userGreeting = document.getElementById('user-greeting');
                if (userGreeting) userGreeting.textContent = `Chào, ${appState.currentUser.HoTen || 'Dược sĩ'}`;
                
                showToast('Cập nhật thông tin thành công!', 'success');
                hideModal();
            } catch (error) {
                showToast(`Lỗi: ${error.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Lưu thay đổi';
            }
        });
    };

    const showChangePasswordModal = () => {
        const content = `
            <form id="change-password-form">
                <div class="input-group"><label for="old-password">Mật khẩu cũ</label><input type="password" id="old-password" required></div>
                <div class="input-group"><label for="new-password">Mật khẩu mới</label><input type="password" id="new-password" required minlength="4"></div>
                <div class="input-group"><label for="confirm-new-password">Xác nhận mật khẩu mới</label><input type="password" id="confirm-new-password" required minlength="4"></div>
                <p id="password-change-error" class="hidden" style="color: var(--danger-color);"></p>
                <div style="text-align: right; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" id="modal-cancel-change-password">Hủy</button>
                    <button type="submit" class="btn btn-primary">Lưu thay đổi</button>
                </div>
            </form>
        `;
        showModal('Đổi Mật Khẩu', content, { size: '500px' });

        document.getElementById('modal-cancel-change-password').addEventListener('click', hideModal);

        document.getElementById('change-password-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const oldPassword = document.getElementById('old-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmNewPassword = document.getElementById('confirm-new-password').value;
            const errorEl = document.getElementById('password-change-error');
            const submitBtn = e.target.querySelector('button[type="submit"]');
    
            errorEl.classList.add('hidden');
            if (newPassword !== confirmNewPassword) {
                errorEl.textContent = 'Mật khẩu mới không khớp.';
                errorEl.classList.remove('hidden');
                return;
            }
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang lưu...';
    
            try {
                // This now calls the central auth service
                await callAuthScript('changePassword', {
                    TenDangNhap: appState.currentUser.TenDangNhap,
                    oldPassword: oldPassword,
                    newPassword: newPassword,
                });
                showToast('Đổi mật khẩu thành công!', 'success');
                hideModal();
            } catch (error) {
                errorEl.textContent = `Lỗi: ${error.message}`;
                errorEl.classList.remove('hidden');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Lưu thay đổi';
            }
        });
    };

    // --- PAGE RENDERERS (CORE) ---
    const updatePageTitle = (title) => pageTitle.textContent = title;

    const renderQuantriUsers = (container) => {
        container.innerHTML = `<p>Đang tải danh sách người dùng...</p>`;
        // Fetch users from the central auth script
        callAuthScript('getUsersForAdmin', { username_chinh: appState.currentUser.username_chinh })
            .then(users => {
                appState.cache['allUsers'] = users; // Update cache
                container.innerHTML = `
                    <div class="card-header">
                        <h3>Quản lý người dùng</h3>
                        <button class="btn btn-primary" id="btn-add-user">Thêm người dùng</button>
                    </div>
                    <div class="card-body table-wrapper">
                        <table>
                            <thead><tr><th>Mã NV</th><th>Họ Tên</th><th>Tên đăng nhập</th><th>Chức vụ</th><th>Quyền</th><th class="action-cell">Hành động</th></tr></thead>
                            <tbody id="users-tbody">
                                ${users.map(u => `
                                    <tr data-id="${u.MaNhanVien}" data-username="${u.TenDangNhap}">
                                        <td>${u.MaNhanVien}</td><td>${u.HoTen}</td><td>${u.TenDangNhap}</td>
                                        <td>${u.ChucVu}</td><td>${u.Quyen}</td>
                                        <td class="action-cell">
                                            <div class="action-menu">
                                                <button class="btn-actions"><span class="material-symbols-outlined">more_vert</span></button>
                                                <div class="action-menu-dropdown">
                                                    <a href="#" class="action-item" data-action="edit">Sửa</a>
                                                    <a href="#" class="action-item" data-action="delete">Xóa</a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                document.getElementById('btn-add-user').addEventListener('click', showAddUserModal);

                document.getElementById('users-tbody').addEventListener('click', e => {
                    const actionItem = e.target.closest('.action-item');
                    if(actionItem) {
                        e.preventDefault();
                        const action = actionItem.dataset.action;
                        const row = actionItem.closest('tr');
                        const userId = row.dataset.id;
                        const username = row.dataset.username;
                        handleUserAction(action, { userId, username });
                    }
                });
            })
            .catch(error => {
                container.innerHTML = `<div style="color: var(--danger-color);"><p><strong>Lỗi tải dữ liệu:</strong> ${error.message}</p></div>`;
            });
    };

    const handleUserAction = (action, { userId, username }) => {
        switch(action) {
            case 'edit':
                showEditUserModal({ userId, username });
                break;
            case 'delete':
                if (confirm(`Bạn có chắc muốn xóa người dùng "${username}"? Thao tác này không thể hoàn tác.`)) {
                    showToast(`Đang xóa người dùng ${username}...`, 'info');
                    callAuthScript('deleteUser', { TenDangNhap: username })
                    .then(() => {
                        showToast('Xóa người dùng thành công!', 'success');
                        renderQuantri();
                    })
                    .catch(err => showToast(`Lỗi: ${err.message}`, 'error'));
                }
                break;
        }
    };
    
    const showEditUserModal = async ({ userId, username }) => {
        const allUsers = appState.cache['allUsers'] || [];
        const user = allUsers.find(u => u.MaNhanVien === userId);
        if (!user) {
            showToast('Không tìm thấy thông tin người dùng.', 'error');
            return;
        }

        const content = `
            <form id="edit-user-form">
                <div class="input-group"><label>Mã nhân viên</label><input type="text" value="${user.MaNhanVien}" disabled></div>
                <div class="input-group"><label>Tên đăng nhập</label><input type="text" value="${user.TenDangNhap}" disabled></div>
                <div class="input-group"><label for="edit-user-hoten">Họ Tên</label><input type="text" id="edit-user-hoten" value="${user.HoTen}" required></div>
                <div class="input-group"><label for="edit-user-chucvu">Chức vụ</label><input type="text" id="edit-user-chucvu" value="${user.ChucVu}"></div>
                <div class="input-group"><label for="edit-user-quyen">Quyền</label>
                    <select id="edit-user-quyen" required>
                        <option value="Quản trị" ${user.Quyen === 'Quản trị' ? 'selected' : ''}>Quản trị</option>
                        <option value="Bán hàng" ${user.Quyen === 'Bán hàng' ? 'selected' : ''}>Bán hàng</option>
                        <option value="Kho" ${user.Quyen === 'Kho' ? 'selected' : ''}>Kho</option>
                    </select>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="window.app.hideModal()">Hủy</button>
                    <button type="submit" class="btn btn-primary">Lưu thay đổi</button>
                </div>
            </form>
        `;
        showModal(`Sửa thông tin: ${user.HoTen}`, content);

        document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            try {
                const userData = {
                    MaNhanVien: userId,
                    TenDangNhap: username,
                    HoTen: document.getElementById('edit-user-hoten').value,
                    ChucVu: document.getElementById('edit-user-chucvu').value,
                    Quyen: document.getElementById('edit-user-quyen').value
                };
                await callAuthScript('updateUser', { userData });
                showToast('Cập nhật thông tin thành công!', 'success');
                hideModal();
                renderQuantri();
            } catch (error) {
                showToast(`Lỗi: ${error.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
            }
        });
    };

    const renderQuantriSettings = (container) => {
        container.innerHTML = `<p>Đang tải cài đặt...</p>`;
        callAppsScript('getAppSettings')
            .then(settings => {
                const bankOptions = VIETNAM_BANKS.map(bank => 
                    `<option value="${bank.name}" data-bin="${bank.bin}" ${settings.TenNganHang === bank.name ? 'selected' : ''}>${bank.name}</option>`
                ).join('');

                container.innerHTML = `
                    <div class="card-header"><h3>Cài đặt chung</h3></div>
                    <div class="card-body">
                        <form id="app-settings-form">
                            <h4>Thông tin nhà thuốc (hiển thị trên hóa đơn)</h4>
                            <div class="input-group"><label for="setting-TenNhaThuoc">Tên nhà thuốc</label><input type="text" id="setting-TenNhaThuoc" value="${settings.TenNhaThuoc || ''}"></div>
                            <div class="input-group"><label for="setting-DiaChi">Địa chỉ</label><input type="text" id="setting-DiaChi" value="${settings.DiaChi || ''}"></div>
                            <div class="input-group"><label for="setting-SoDienThoai">Số điện thoại</label><input type="text" id="setting-SoDienThoai" value="${settings.SoDienThoai || ''}"></div>
                            <hr style="margin: 20px 0;">
                            <h4>Thông tin thanh toán (dùng cho mã VietQR)</h4>
                            <div class="input-group"><label for="setting-TenNganHang">Ngân hàng</label><select id="setting-TenNganHang"><option value="">-- Chọn ngân hàng --</option>${bankOptions}</select></div>
                            <div class="input-group"><label for="setting-MaNganHangBIN">Mã BIN ngân hàng</label><input type="text" id="setting-MaNganHangBIN" placeholder="Mã BIN sẽ tự động điền" value="${settings.MaNganHangBIN || ''}" readonly style="background-color: #e9ecef;"></div>
                            <div class="input-group"><label for="setting-SoTaiKhoan">Số tài khoản</label><input type="text" id="setting-SoTaiKhoan" value="${settings.SoTaiKhoan || ''}"></div>
                            <div class="input-group"><label for="setting-TenChuTaiKhoan">Tên chủ tài khoản</label><input type="text" id="setting-TenChuTaiKhoan" placeholder="VD: NGUYEN VAN A" value="${settings.TenChuTaiKhoan || ''}"><small>Tên viết IN HOA, không dấu.</small></div>
                            <div style="text-align: right; margin-top: 20px;"><button type="submit" class="btn btn-primary">Lưu thay đổi</button></div>
                        </form>
                    </div>
                `;

                const bankSelect = document.getElementById('setting-TenNganHang');
                const binInput = document.getElementById('setting-MaNganHangBIN');
                
                bankSelect.addEventListener('change', (e) => {
                    const selectedOption = e.target.options[e.target.selectedIndex];
                    binInput.value = selectedOption.dataset.bin || '';
                });

                document.getElementById('app-settings-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const submitBtn = e.target.querySelector('button[type="submit"]');
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Đang lưu...';
                    const newSettings = {
                        TenNhaThuoc: document.getElementById('setting-TenNhaThuoc').value,
                        DiaChi: document.getElementById('setting-DiaChi').value,
                        SoDienThoai: document.getElementById('setting-SoDienThoai').value,
                        TenNganHang: document.getElementById('setting-TenNganHang').value,
                        MaNganHangBIN: document.getElementById('setting-MaNganHangBIN').value,
                        SoTaiKhoan: document.getElementById('setting-SoTaiKhoan').value,
                        TenChuTaiKhoan: document.getElementById('setting-TenChuTaiKhoan').value,
                    };

                    try {
                        await callAppsScript('updateAppSettings', { settings: newSettings });
                        appState.cache['appSettings'] = newSettings;
                        showToast('Cập nhật cài đặt thành công!', 'success');
                        const pharmacyNameEl = document.getElementById('sidebar-pharmacy-name');
                        if (pharmacyNameEl && newSettings.TenNhaThuoc) {
                            pharmacyNameEl.textContent = newSettings.TenNhaThuoc;
                        }
                    } catch (error) {
                        showToast(`Lỗi: ${error.message}`, 'error');
                    } finally {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Lưu thay đổi';
                    }
                });
            })
            .catch(error => {
                container.innerHTML = `<div style="color: var(--danger-color);"><p><strong>Lỗi tải cài đặt:</strong> ${error.message}</p></div>`;
            });
    };

    function renderQuantri() {
        updatePageTitle('Quản trị');
        mainContent.innerHTML = `
            <div class="card">
                <div class="tabs" id="quantri-tabs"><button class="tab-link active" data-tab="users">Quản lý người dùng</button><button class="tab-link" data-tab="settings">Cài đặt chung</button></div>
                <div id="quantri-content"></div>
            </div>`;
        const tabContainer = document.getElementById('quantri-content');
        const tabs = document.querySelectorAll('#quantri-tabs .tab-link');
        const renderTabContent = (tabId) => {
            if (tabId === 'users') renderQuantriUsers(tabContainer);
            else if (tabId === 'settings') renderQuantriSettings(tabContainer);
        };
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                renderTabContent(e.currentTarget.dataset.tab);
            });
        });
        renderTabContent('users');
    }

    const showAddUserModal = () => {
        const content = `
            <form id="add-user-form">
                <div class="input-group"><label for="new-user-hoten">Họ Tên</label><input type="text" id="new-user-hoten" required></div>
                <div class="input-group"><label for="new-user-tendangnhap">Tên đăng nhập</label><input type="text" id="new-user-tendangnhap" required></div>
                <div class="input-group"><label for="new-user-chucvu">Chức vụ</label><input type="text" id="new-user-chucvu"></div>
                <div class="input-group"><label for="new-user-quyen">Quyền</label><select id="new-user-quyen" required><option value="">-- Chọn quyền --</option><option value="Quản trị">Quản trị</option><option value="Bán hàng">Bán hàng</option><option value="Kho">Kho</option></select></div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;"><button type="button" class="btn btn-secondary" onclick="window.app.hideModal()">Hủy</button><button type="submit" class="btn btn-primary">Lưu</button></div>
            </form>`;
        showModal('Thêm Người Dùng Mới', content);
        document.getElementById('add-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            try {
                const userData = {
                    HoTen: document.getElementById('new-user-hoten').value,
                    TenDangNhap: document.getElementById('new-user-tendangnhap').value,
                    ChucVu: document.getElementById('new-user-chucvu').value,
                    Quyen: document.getElementById('new-user-quyen').value,
                };
                await callAuthScript('createUser', { 
                    username_chinh: appState.currentUser.username_chinh,
                    userData: userData 
                });
                showToast('Tạo người dùng thành công! Mật khẩu mặc định là 1111.', 'success');
                hideModal();
                renderQuantri();
            } catch (error) {
                showToast(`Lỗi: ${error.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
            }
        });
    };

    // --- ROUTING ---
    const pageRenderers = {
        quantri: renderQuantri,
    };

    const navigateTo = (pageId, params) => {
        if (!hasPermission(pageId)) {
            showToast('Bạn không có quyền truy cập trang này.', 'error');
            window.location.hash = 'tongquan';
            return;
        }
        const pageToHighlight = pageId.startsWith('nhapkho') ? 'danhsachphieunhap' : pageId;
        navLinks.forEach(link => {
            link.classList.remove('active');
            const parentGroup = link.closest('.nav-item-group');
            if (parentGroup) parentGroup.classList.remove('open');
        });
        const activeLink = document.querySelector(`.nav-link[data-page="${pageToHighlight}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
            const parentGroup = activeLink.closest('.nav-item-group');
            if (parentGroup) {
                parentGroup.classList.add('open');
                parentGroup.querySelector('.has-submenu').classList.add('active');
                parentGroup.querySelector('.sub-menu').style.display = 'block';
            }
        }
        const pageRenderer = pageRenderers[pageId] || (() => {
            const title = pageId.charAt(0).toUpperCase() + pageId.slice(1);
            updatePageTitle(title);
            mainContent.innerHTML = `<div class="card"><h2>Trang không tồn tại hoặc đang phát triển</h2><p>Chức năng cho '${pageId}' chưa được định nghĩa.</p></div>`;
        });
        pageRenderer(params);
    };

    const handleHashChange = () => {
        const hash = window.location.hash.substring(1) || 'tongquan';
        const [pageId, queryString] = hash.split('?');
        const params = new URLSearchParams(queryString);
        navigateTo(pageId, params);
    };
    
    // --- INITIALIZATION ---
    const initializeApp = async (initialState) => {
        appState = { ...initialState };
        window.app.state = appState;

        // Helper to dynamically load a script
        const loadScript = (src) => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => resolve(script);
                script.onerror = () => reject(new Error(`Lỗi tải script: ${src}`));
                document.body.appendChild(script);
            });
        };

        // List of business logic modules to load
        const moduleScripts = [
            './scriptKho.js',
            './scriptDanhmuc.js',
            './scriptBanhang.js',
            './scriptBaocao.js'
        ];

        try {
            showToast('Đang tải các module nghiệp vụ...', 'info');
            await Promise.all(moduleScripts.map(loadScript));
            console.log('Tất cả các module nghiệp vụ đã được tải.');
        } catch (error) {
            console.error('Không thể tải các module nghiệp vụ:', error);
            showToast('Lỗi nghiêm trọng: Không thể tải các thành phần của ứng dụng.', 'error');
            return; // Stop initialization
        }
        
        // Now that scripts are loaded, the initializer functions exist globally
        if (typeof initializePharmacyModule === 'function') Object.assign(pageRenderers, initializePharmacyModule(window.app));
        if (typeof initializeDanhmucModule === 'function') Object.assign(pageRenderers, initializeDanhmucModule(window.app));
        if (typeof initializeSalesModule === 'function') Object.assign(pageRenderers, initializeSalesModule(window.app));
        if (typeof initializeBaoCaoModule === 'function') Object.assign(pageRenderers, initializeBaoCaoModule(window.app));

        window.addEventListener('hashchange', handleHashChange);
        connectionStatusEl.addEventListener('click', checkConnectionStatus);

        document.querySelectorAll('.has-submenu').forEach(menu => {
            menu.addEventListener('click', e => {
                e.preventDefault();
                const parent = menu.closest('.nav-item-group');
                const submenu = menu.nextElementSibling;
                if (parent.classList.contains('open')) {
                    submenu.style.display = 'none';
                    parent.classList.remove('open');
                } else {
                    submenu.style.display = 'block';
                    parent.classList.add('open');
                }
            });
        });
        
        document.addEventListener('click', e => {
            const clickedActionMenuButton = e.target.closest('.btn-actions');
            const openMenus = document.querySelectorAll('.action-menu-dropdown.show');
            let clickedMenuWasOpen = false;
            openMenus.forEach(menu => {
                if (clickedActionMenuButton && menu === clickedActionMenuButton.nextElementSibling) clickedMenuWasOpen = true;
                menu.classList.remove('show');
                const tableWrapper = menu.closest('.table-wrapper');
                if (tableWrapper) tableWrapper.style.overflow = '';
            });
            if (clickedActionMenuButton && !clickedMenuWasOpen) {
                const dropdown = clickedActionMenuButton.nextElementSibling;
                const tableWrapper = clickedActionMenuButton.closest('.table-wrapper');
                dropdown.classList.add('show');
                if (tableWrapper) tableWrapper.style.overflow = 'visible';
            }
        });

        userMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenuDropdown.classList.toggle('show');
        });
        
        // [FIX START] Attach user menu event listeners here, after state is initialized
        document.getElementById('logout-btn').addEventListener('click', (e) => {
            e.preventDefault();
            userMenuDropdown.classList.remove('show');
            logout();
        });
        document.getElementById('user-info-btn').addEventListener('click', (e) => {
            e.preventDefault();
            userMenuDropdown.classList.remove('show');
            showUserInfoModal();
        });
        document.getElementById('change-password-btn').addEventListener('click', (e) => {
            e.preventDefault();
            userMenuDropdown.classList.remove('show');
            showChangePasswordModal();
        });
        // [FIX END]

        // Hide dropdown if clicked outside
        userMenuDropdown.addEventListener('click', (e) => e.stopPropagation());
        window.addEventListener('click', () => {
            if (userMenuDropdown.classList.contains('show')) userMenuDropdown.classList.remove('show');
        });

        await showApp();
    };
    window.app.initializeApp = initializeApp;

    // A smaller init for login flow modals, exposing only necessary parts
    window.app.partialInitialize = (initialState) => {
         appState = { ...initialState };
         window.app.state = appState;
    }

    // [REMOVED] The delegated listener is replaced by specific listeners in initializeApp
});