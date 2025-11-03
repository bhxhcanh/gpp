function initializeDanhmucModule(app) {
    const { callAppsScript, getCachedDanhMuc, showToast, showModal, hideModal, invalidateCache, generateOptions, state: appState } = app;
    const mainContent = document.getElementById('main-content');
    const pageTitle = document.getElementById('page-title');

    const removeDiacritics = (str) => {
        if (!str) return '';
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
    };

    // --- DYNAMIC "QUICK ADD" HELPERS ---
    const showAddSupplierModal = (selectElementToUpdate, onComplete) => {
        const modalContent = `
            <form id="add-supplier-form">
                <div class="input-group">
                    <label for="new-ncc-ten">Tên nhà cung cấp</label>
                    <input type="text" id="new-ncc-ten" required>
                </div>
                <div class="input-group">
                    <label for="new-ncc-diachi">Địa chỉ</label>
                    <input type="text" id="new-ncc-diachi">
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                     <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Hủy</button>
                     <button type="submit" class="btn btn-primary">Lưu</button>
                </div>
            </form>
        `;
        showModal('Thêm Nhà Cung Cấp Mới', modalContent);

        document.getElementById('add-supplier-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const tenNcc = document.getElementById('new-ncc-ten').value.trim();
            const diaChi = document.getElementById('new-ncc-diachi').value.trim();
            if (!tenNcc) return;

            const form = e.target;
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            hideModal();
            showToast('Đang thêm nhà cung cấp...', 'info');

            callAppsScript('addDanhMucItem', {
                tenDanhMuc: 'DanhMucNhaCungCap',
                itemData: { TenNhaCungCap: tenNcc, DiaChi: diaChi }
            })
            .then(async (newItem) => {
                const updatedData = await getCachedDanhMuc('DanhMucNhaCungCap', true); // Force refresh
                showToast(`Đã thêm nhà cung cấp "${tenNcc}"!`, 'success');
                if (selectElementToUpdate) {
                    selectElementToUpdate.innerHTML = `
                        <option value="">-- Chọn nhà cung cấp --</option>
                        ${generateOptions(updatedData, 'MaNhaCungCap', 'TenNhaCungCap', newItem.MaNhaCungCap, 'Thêm mới nhà cung cấp...')}
                    `;
                }
                if (onComplete) onComplete();
            })
            .catch(err => {
                showToast(`Lỗi: ${err.message}`, 'error');
                if (selectElementToUpdate) {
                    const addNewOpt = Array.from(selectElementToUpdate.options).find(o => o.value === '--add-new--');
                    if(addNewOpt) selectElementToUpdate.value = '';
                }
            });
        });
    };
    app.showAddSupplierModal = showAddSupplierModal;
    
    const showAddKhachHangModal = (onComplete) => {
        const modalContent = `
            <form id="add-customer-form">
                <div class="input-group"><label for="new-customer-ten">Họ Tên</label><input type="text" id="new-customer-ten" required></div>
                <div class="input-group"><label for="new-customer-sdt">Số điện thoại</label><input type="text" id="new-customer-sdt"></div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                     <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Hủy</button>
                     <button type="submit" class="btn btn-primary">Lưu</button>
                </div>
            </form>
        `;
        showModal('Thêm Khách Hàng Mới', modalContent);

        document.getElementById('add-customer-form').addEventListener('submit', e => {
            e.preventDefault();
            const hoTen = document.getElementById('new-customer-ten').value.trim();
            const sdt = document.getElementById('new-customer-sdt').value.trim();
            if (!hoTen) return;

            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            hideModal();
            showToast('Đang thêm khách hàng...', 'info');
            
            callAppsScript('addDanhMucItem', {
                tenDanhMuc: 'DanhMucKhachHang',
                itemData: { HoTen: hoTen, SoDienThoai: sdt }
            })
            .then(newItem => {
                invalidateCache('DanhMucKhachHang');
                showToast(`Đã thêm khách hàng "${hoTen}"!`, 'success');
                if (onComplete) onComplete();
            })
            .catch(err => {
                 showToast(`Lỗi: ${err.message}`, 'error');
            });
        });
    };

    const showAddThuocModal = async (selectedNsxId = null, onSuccessCallback = null, defaultValues = {}) => {
        const [danhMucNSX, danhMucDVT, danhMucNHH] = await Promise.all([
            getCachedDanhMuc('DanhMucNhaSanXuat'),
            getCachedDanhMuc('DMDonViTinh'),
            getCachedDanhMuc('DMNhomHangHoa')
        ]);
    
        const modalContent = `
            <form id="add-thuoc-form">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div class="input-group" style="grid-column: 1 / -1;">
                        <label for="new-thuoc-ten">Tên thuốc (*)</label>
                        <input type="text" id="new-thuoc-ten" required value="${defaultValues.TenThuoc || ''}">
                    </div>
                    <div class="input-group">
                        <label for="new-thuoc-hoatchat">Hoạt chất</label>
                        <input type="text" id="new-thuoc-hoatchat" value="${defaultValues.HoatChat || ''}">
                    </div>
                    <div class="input-group">
                        <label for="new-thuoc-hamluong">Hàm lượng</label>
                        <input type="text" id="new-thuoc-hamluong" value="${defaultValues.HamLuong || ''}">
                    </div>
                    <div class="input-group">
                        <label for="new-thuoc-sodangky">Số đăng ký</label>
                        <input type="text" id="new-thuoc-sodangky" value="${defaultValues.SoDangKy || ''}">
                    </div>
                    <div class="input-group">
                        <label for="new-thuoc-quycach">Quy cách đóng gói</label>
                        <input type="text" id="new-thuoc-quycach" value="${defaultValues.QuyCachDongGoi || ''}">
                    </div>
                    <div class="input-group">
                        <label for="new-thuoc-donvicoso">Đơn vị cơ sở (*)</label>
                        <select id="new-thuoc-donvicoso" required>
                             ${generateOptions(danhMucDVT, 'TenDonViTinh', 'TenDonViTinh', defaultValues.DonViCoSo, 'Thêm mới...')}
                        </select>
                    </div>
                    <div class="input-group">
                        <label for="new-thuoc-nhomthuoc">Nhóm thuốc</label>
                        <select id="new-thuoc-nhomthuoc">
                            <option value="">-- Chọn nhóm hàng hóa --</option>
                            ${generateOptions(danhMucNHH, 'TenNhomHangHoa', 'TenNhomHangHoa', defaultValues.NhomThuoc, 'Thêm mới...')}
                        </select>
                    </div>
                    <div class="input-group">
                        <label for="nsx-select">Nhà sản xuất (*)</label>
                        <select id="nsx-select" required>
                            <option value="">-- Chọn nhà sản xuất --</option>
                            ${generateOptions(danhMucNSX, 'MaNhaSanXuat', 'TenNhaSanXuat', selectedNsxId || defaultValues.MaNhaSanXuat, 'Thêm mới nhà sản xuất...')}
                        </select>
                    </div>
                    <div class="input-group">
                        <label for="new-thuoc-tonkhotoithieu">Tồn kho tối thiểu</label>
                        <input type="number" id="new-thuoc-tonkhotoithieu" min="0" value="${defaultValues.TonKhoToiThieu || '0'}">
                    </div>
                    <div class="input-group" style="grid-column: 1 / -1;">
                        <label for="new-thuoc-ghichu">Ghi chú</label>
                        <textarea id="new-thuoc-ghichu" rows="2">${defaultValues.GhiChu || ''}</textarea>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Hủy</button>
                    <button type="submit" class="btn btn-primary">Lưu</button>
                </div>
            </form>
        `;
        showModal((defaultValues.TenThuoc ? 'Sao chép' : 'Thêm') + ' Thuốc Mới', modalContent, { size: '800px' });
        
        // --- Event Listeners for "Add New" in selects ---
        const handleSelectAddNew = (selectId, modalFunction) => {
            document.getElementById(selectId).addEventListener('change', e => {
                if (e.target.value === '--add-new--') {
                    // Preserve form data before opening new modal
                    const preservedData = {
                        TenThuoc: document.getElementById('new-thuoc-ten').value,
                        HoatChat: document.getElementById('new-thuoc-hoatchat').value,
                        HamLuong: document.getElementById('new-thuoc-hamluong').value,
                        SoDangKy: document.getElementById('new-thuoc-sodangky').value,
                        QuyCachDongGoi: document.getElementById('new-thuoc-quycach').value,
                        DonViCoSo: document.getElementById('new-thuoc-donvicoso').value,
                        NhomThuoc: document.getElementById('new-thuoc-nhomthuoc').value,
                        MaNhaSanXuat: document.getElementById('nsx-select').value,
                        TonKhoToiThieu: document.getElementById('new-thuoc-tonkhotoithieu').value,
                        GhiChu: document.getElementById('new-thuoc-ghichu').value,
                    };
                    modalFunction(preservedData, onSuccessCallback);
                }
            });
        };

        handleSelectAddNew('nsx-select', (p, cb) => showAddNsxModal(p, cb));
        handleSelectAddNew('new-thuoc-donvicoso', (p, cb) => showAddDonViTinhModal(p, cb));
        handleSelectAddNew('new-thuoc-nhomthuoc', (p, cb) => showAddNhomHangHoaModal(p, cb));

        
        document.getElementById('add-thuoc-form').addEventListener('submit', async e => {
            e.preventDefault();
            const tenThuoc = document.getElementById('new-thuoc-ten').value.trim();
            const donViCoSo = document.getElementById('new-thuoc-donvicoso').value.trim();
            const maNSX = document.getElementById('nsx-select').value;
            if(!tenThuoc || !donViCoSo || !maNSX) {
                alert('Vui lòng điền đầy đủ các trường bắt buộc (*).');
                return;
            }

            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            try {
                // Check for duplicate drug name only if it's not a copy operation
                if (!defaultValues.TenThuoc) {
                    const allThuoc = await getCachedDanhMuc('DanhMucThuoc');
                    const existingDrug = allThuoc.find(t => t.TenThuoc.trim().toLowerCase() === tenThuoc.toLowerCase());
                    if (existingDrug) {
                        if (!confirm(`Thuốc "${tenThuoc}" đã tồn tại. Bạn có chắc chắn muốn thêm một thuốc mới với tên này không?`)) {
                            submitBtn.disabled = false;
                            return; // Stop if user cancels
                        }
                    }
                }

                const thuocData = {
                    TenThuoc: tenThuoc,
                    HoatChat: document.getElementById('new-thuoc-hoatchat').value.trim(),
                    HamLuong: document.getElementById('new-thuoc-hamluong').value.trim(),
                    SoDangKy: document.getElementById('new-thuoc-sodangky').value.trim(),
                    QuyCachDongGoi: document.getElementById('new-thuoc-quycach').value.trim(),
                    DonViCoSo: donViCoSo,
                    NhomThuoc: document.getElementById('new-thuoc-nhomthuoc').value.trim(),
                    MaNhaSanXuat: maNSX,
                    TonKhoToiThieu: document.getElementById('new-thuoc-tonkhotoithieu').value || 0,
                    GhiChu: document.getElementById('new-thuoc-ghichu').value.trim()
                };

                hideModal();
                showToast('Đang thêm thuốc mới...', 'info');

                const newThuoc = await callAppsScript('addThuoc', thuocData);
                // invalidateCache('DanhMucThuoc'); // No need to invalidate, just add to existing cache
                appState.cache.DanhMucThuoc.push(newThuoc);

                showToast(`Đã thêm thuốc "${newThuoc.TenThuoc}" thành công!`, 'success');
                if (onSuccessCallback) {
                    onSuccessCallback(newThuoc);
                } else {
                    const currentTabContainer = document.getElementById('danhmuc-content');
                    renderDanhMucThuoc(currentTabContainer);
                }
            } catch (err) {
                showToast(`Lỗi: ${err.message}`, 'error');
            } finally {
                if (!document.getElementById('modal-container').classList.contains('hidden')) {
                   hideModal(); // Ensure modal is closed on error too
                }
                 submitBtn.disabled = false;
            }
        });
    };
    app.showAddThuocModal = showAddThuocModal;
    
    const showAddNsxModal = (preservedThuocData = {}, onSuccessCallback = null) => {
        const modalContent = `
            <form id="add-nsx-form">
                <div class="input-group"><label for="new-nsx-ten">Tên nhà sản xuất</label><input type="text" id="new-nsx-ten" required></div>
                <div class="input-group"><label for="new-nsx-quocgia">Quốc gia</label><input type="text" id="new-nsx-quocgia"></div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                     <button type="button" class="btn btn-secondary" id="cancel-add-nsx">Hủy</button>
                     <button type="submit" class="btn btn-primary">Lưu</button>
                </div>
            </form>
        `;
        showModal('Thêm Nhà Sản Xuất Mới', modalContent);
        document.getElementById('cancel-add-nsx').addEventListener('click', () => {
            showAddThuocModal(null, onSuccessCallback, preservedThuocData);
        });
        
        document.getElementById('add-nsx-form').addEventListener('submit', e => {
            e.preventDefault();
            const tenNsx = document.getElementById('new-nsx-ten').value.trim();
            const quocGia = document.getElementById('new-nsx-quocgia').value.trim();
            if (!tenNsx) return;

            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            hideModal();
            showToast(`Đang thêm nhà sản xuất...`, 'info');

            callAppsScript('addDanhMucItem', {
                tenDanhMuc: 'DanhMucNhaSanXuat',
                itemData: { TenNhaSanXuat: tenNsx, QuocGia: quocGia }
            })
            .then(newItem => {
                invalidateCache('DanhMucNhaSanXuat');
                showToast(`Đã thêm NSX "${tenNsx}"!`, 'success');
                showAddThuocModal(newItem.MaNhaSanXuat, onSuccessCallback, preservedThuocData);
            })
            .catch(err => {
                showToast(`Lỗi: ${err.message}`, 'error');
                showAddThuocModal(null, onSuccessCallback, preservedThuocData);
            });
        });
    };

    const showAddDonViTinhModal = (preservedThuocData = {}, onSuccessCallback = null) => {
        const modalContent = `
            <form id="add-dvt-form">
                <div class="input-group"><label for="new-dvt-ten">Tên đơn vị tính</label><input type="text" id="new-dvt-ten" required></div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                     <button type="button" class="btn btn-secondary" id="cancel-add-dvt">Hủy</button>
                     <button type="submit" class="btn btn-primary">Lưu</button>
                </div>
            </form>
        `;
        showModal('Thêm Đơn Vị Tính Mới', modalContent);
        document.getElementById('cancel-add-dvt').addEventListener('click', () => {
            showAddThuocModal(preservedThuocData.MaNhaSanXuat, onSuccessCallback, preservedThuocData);
        });
        
        document.getElementById('add-dvt-form').addEventListener('submit', e => {
            e.preventDefault();
            const tenDVT = document.getElementById('new-dvt-ten').value.trim();
            if (!tenDVT) return;
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            hideModal();
            showToast('Đang thêm ĐVT...', 'info');

            callAppsScript('addDanhMucItem', {
                tenDanhMuc: 'DMDonViTinh',
                itemData: { TenDonViTinh: tenDVT }
            })
            .then(newItem => {
                invalidateCache('DMDonViTinh');
                showToast(`Đã thêm ĐVT "${tenDVT}"!`, 'success');
                preservedThuocData.DonViCoSo = newItem.TenDonViTinh;
                showAddThuocModal(preservedThuocData.MaNhaSanXuat, onSuccessCallback, preservedThuocData);
            })
            .catch(err => {
                showToast(`Lỗi: ${err.message}`, 'error');
                showAddThuocModal(preservedThuocData.MaNhaSanXuat, onSuccessCallback, preservedThuocData);
            });
        });
    };

    const showAddNhomHangHoaModal = (preservedThuocData = {}, onSuccessCallback = null) => {
        const modalContent = `
            <form id="add-nhh-form">
                <div class="input-group"><label for="new-nhh-ten">Tên nhóm hàng hóa</label><input type="text" id="new-nhh-ten" required></div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                     <button type="button" class="btn btn-secondary" id="cancel-add-nhh">Hủy</button>
                     <button type="submit" class="btn btn-primary">Lưu</button>
                </div>
            </form>
        `;
        showModal('Thêm Nhóm Hàng Hóa Mới', modalContent);
        document.getElementById('cancel-add-nhh').addEventListener('click', () => {
            showAddThuocModal(preservedThuocData.MaNhaSanXuat, onSuccessCallback, preservedThuocData);
        });
        
        document.getElementById('add-nhh-form').addEventListener('submit', e => {
            e.preventDefault();
            const tenNHH = document.getElementById('new-nhh-ten').value.trim();
            if (!tenNHH) return;
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            hideModal();
            showToast('Đang thêm nhóm hàng hóa...', 'info');

            callAppsScript('addDanhMucItem', {
                tenDanhMuc: 'DMNhomHangHoa',
                itemData: { TenNhomHangHoa: tenNHH }
            })
            .then(newItem => {
                invalidateCache('DMNhomHangHoa');
                showToast(`Đã thêm nhóm "${tenNHH}"!`, 'success');
                preservedThuocData.NhomThuoc = newItem.TenNhomHangHoa;
                showAddThuocModal(preservedThuocData.MaNhaSanXuat, onSuccessCallback, preservedThuocData);
            })
            .catch(err => {
                showToast(`Lỗi: ${err.message}`, 'error');
                showAddThuocModal(preservedThuocData.MaNhaSanXuat, onSuccessCallback, preservedThuocData);
            });
        });
    };

    // --- PAGE RENDERERS ---
    const updatePageTitle = (title) => pageTitle.textContent = title;
    
    const showEditKhachHangModal = async (khId) => {
        const allKH = await getCachedDanhMuc('DanhMucKhachHang');
        const kh = allKH.find(k => k.MaKhachHang === khId);
        if (!kh) {
            showToast('Không tìm thấy khách hàng!', 'error');
            return;
        }
    
        const modalContent = `
            <form id="edit-customer-form" data-id="${khId}">
                <div class="input-group"><label>Mã Khách Hàng</label><input type="text" value="${kh.MaKhachHang}" disabled></div>
                <div class="input-group"><label for="edit-customer-ten">Họ Tên</label><input type="text" id="edit-customer-ten" value="${kh.HoTen || ''}" required></div>
                <div class="input-group"><label for="edit-customer-sdt">Số điện thoại</label><input type="text" id="edit-customer-sdt" value="${kh.SoDienThoai || ''}"></div>
                <div class="input-group"><label for="edit-customer-diachi">Địa chỉ</label><input type="text" id="edit-customer-diachi" value="${kh.DiaChi || ''}"></div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                     <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Hủy</button>
                     <button type="submit" class="btn btn-primary">Lưu thay đổi</button>
                </div>
            </form>
        `;
        showModal('Sửa thông tin Khách Hàng', modalContent);
    
        document.getElementById('edit-customer-form').addEventListener('submit', async e => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
    
            const itemData = {
                HoTen: document.getElementById('edit-customer-ten').value,
                SoDienThoai: document.getElementById('edit-customer-sdt').value,
                DiaChi: document.getElementById('edit-customer-diachi').value
            };
            
            try {
                await callAppsScript('updateDanhMucItem', {
                    tenDanhMuc: 'DanhMucKhachHang',
                    itemId: khId,
                    itemData: itemData
                });
                await getCachedDanhMuc('DanhMucKhachHang', true); // Force refresh
                showToast('Cập nhật khách hàng thành công!', 'success');
                hideModal();
                const currentTabContainer = document.getElementById('danhmuc-content');
                renderDanhMucKhachHang(currentTabContainer);
            } catch (err) {
                showToast(`Lỗi: ${err.message}`, 'error');
                submitBtn.disabled = false;
            }
        });
    };
    
    const showEditNccModal = async (nccId) => {
        const allNcc = await getCachedDanhMuc('DanhMucNhaCungCap');
        const ncc = allNcc.find(n => n.MaNhaCungCap === nccId);
        if (!ncc) {
            showToast('Không tìm thấy nhà cung cấp!', 'error');
            return;
        }
    
        const modalContent = `
            <form id="edit-ncc-form" data-id="${nccId}">
                 <div class="input-group"><label>Mã NCC</label><input type="text" value="${ncc.MaNhaCungCap}" disabled></div>
                 <div class="input-group"><label for="edit-ncc-ten">Tên Nhà Cung Cấp</label><input type="text" id="edit-ncc-ten" value="${ncc.TenNhaCungCap || ''}" required></div>
                 <div class="input-group"><label for="edit-ncc-sdt">Số điện thoại</label><input type="text" id="edit-ncc-sdt" value="${ncc.SoDienThoai || ''}"></div>
                 <div class="input-group"><label for="edit-ncc-diachi">Địa chỉ</label><input type="text" id="edit-ncc-diachi" value="${ncc.DiaChi || ''}"></div>
                 <div class="input-group"><label for="edit-ncc-email">Email</label><input type="email" id="edit-ncc-email" value="${ncc.Email || ''}"></div>
                 <div class="input-group"><label for="edit-ncc-mst">Mã số thuế</label><input type="text" id="edit-ncc-mst" value="${ncc.MaSoThue || ''}"></div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                     <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Hủy</button>
                     <button type="submit" class="btn btn-primary">Lưu thay đổi</button>
                </div>
            </form>
        `;
        showModal('Sửa thông tin Nhà Cung Cấp', modalContent, { size: '600px' });
    
        document.getElementById('edit-ncc-form').addEventListener('submit', async e => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
    
            const itemData = {
                TenNhaCungCap: document.getElementById('edit-ncc-ten').value,
                SoDienThoai: document.getElementById('edit-ncc-sdt').value,
                DiaChi: document.getElementById('edit-ncc-diachi').value,
                Email: document.getElementById('edit-ncc-email').value,
                MaSoThue: document.getElementById('edit-ncc-mst').value,
            };
            
            try {
                await callAppsScript('updateDanhMucItem', {
                    tenDanhMuc: 'DanhMucNhaCungCap',
                    itemId: nccId,
                    itemData: itemData
                });
                await getCachedDanhMuc('DanhMucNhaCungCap', true);
                showToast('Cập nhật nhà cung cấp thành công!', 'success');
                hideModal();
                const currentTabContainer = document.getElementById('danhmuc-content');
                renderDanhMucNhaCungCap(currentTabContainer);
            } catch (err) {
                showToast(`Lỗi: ${err.message}`, 'error');
                submitBtn.disabled = false;
            }
        });
    };
    
    const showEditNsxModal = async (nsxId) => {
        const allNsx = await getCachedDanhMuc('DanhMucNhaSanXuat');
        const nsx = allNsx.find(n => n.MaNhaSanXuat === nsxId);
        if (!nsx) {
            showToast('Không tìm thấy nhà sản xuất!', 'error');
            return;
        }
    
        const modalContent = `
            <form id="edit-nsx-form" data-id="${nsxId}">
                 <div class="input-group"><label>Mã NSX</label><input type="text" value="${nsx.MaNhaSanXuat}" disabled></div>
                 <div class="input-group"><label for="edit-nsx-ten">Tên Nhà Sản Xuất</label><input type="text" id="edit-nsx-ten" value="${nsx.TenNhaSanXuat || ''}" required></div>
                 <div class="input-group"><label for="edit-nsx-quocgia">Quốc gia</label><input type="text" id="edit-nsx-quocgia" value="${nsx.QuocGia || ''}"></div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                     <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Hủy</button>
                     <button type="submit" class="btn btn-primary">Lưu thay đổi</button>
                </div>
            </form>
        `;
        showModal('Sửa thông tin Nhà Sản Xuất', modalContent);
    
        document.getElementById('edit-nsx-form').addEventListener('submit', async e => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
    
            const itemData = {
                TenNhaSanXuat: document.getElementById('edit-nsx-ten').value,
                QuocGia: document.getElementById('edit-nsx-quocgia').value,
            };
            
            try {
                await callAppsScript('updateDanhMucItem', {
                    tenDanhMuc: 'DanhMucNhaSanXuat',
                    itemId: nsxId,
                    itemData: itemData
                });
                await getCachedDanhMuc('DanhMucNhaSanXuat', true);
                showToast('Cập nhật nhà sản xuất thành công!', 'success');
                hideModal();
                const currentTabContainer = document.getElementById('danhmuc-content');
                renderDanhMucNhaSanXuat(currentTabContainer);
            } catch (err) {
                showToast(`Lỗi: ${err.message}`, 'error');
                submitBtn.disabled = false;
            }
        });
    };
    
    const showEditThuocModal = async (thuocId) => {
        const [allThuoc, danhMucNSX, donViQuyDoi, danhMucDVT, danhMucNHH] = await Promise.all([
            getCachedDanhMuc('DanhMucThuoc'),
            getCachedDanhMuc('DanhMucNhaSanXuat'),
            getCachedDanhMuc('DonViQuyDoi'),
            getCachedDanhMuc('DMDonViTinh'),
            getCachedDanhMuc('DMNhomHangHoa'),
        ]);
    
        const thuoc = allThuoc.find(t => t.MaThuoc === thuocId);
        if (!thuoc) {
            showToast('Không tìm thấy thuốc!', 'error');
            return;
        }
    
        const thuocUnits = donViQuyDoi.filter(dv => dv.MaThuoc === thuocId);
    
        const modalContent = `
            <form id="edit-thuoc-form" data-id="${thuocId}">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div class="input-group"><label>Mã Thuốc</label><input type="text" value="${thuoc.MaThuoc}" disabled></div>
                    <div class="input-group"><label for="edit-thuoc-ten">Tên thuốc (*)</label><input type="text" id="edit-thuoc-ten" required value="${thuoc.TenThuoc || ''}"></div>
                    <div class="input-group"><label for="edit-thuoc-hoatchat">Hoạt chất</label><input type="text" id="edit-thuoc-hoatchat" value="${thuoc.HoatChat || ''}"></div>
                    <div class="input-group"><label for="edit-thuoc-hamluong">Hàm lượng</label><input type="text" id="edit-thuoc-hamluong" value="${thuoc.HamLuong || ''}"></div>
                    <div class="input-group"><label for="edit-thuoc-sodangky">Số đăng ký</label><input type="text" id="edit-thuoc-sodangky" value="${thuoc.SoDangKy || ''}"></div>
                    <div class="input-group"><label for="edit-thuoc-quycach">Quy cách đóng gói</label><input type="text" id="edit-thuoc-quycach" value="${thuoc.QuyCachDongGoi || ''}"></div>
                    <div class="input-group">
                        <label for="edit-thuoc-donvicoso">Đơn vị cơ sở (*)</label>
                        <select id="edit-thuoc-donvicoso" required>${generateOptions(danhMucDVT, 'TenDonViTinh', 'TenDonViTinh', thuoc.DonViCoSo)}</select>
                    </div>
                    <div class="input-group">
                        <label for="edit-thuoc-nhomthuoc">Nhóm thuốc</label>
                        <select id="edit-thuoc-nhomthuoc">
                            <option value="">-- Chọn nhóm hàng hóa --</option>
                            ${generateOptions(danhMucNHH, 'TenNhomHangHoa', 'TenNhomHangHoa', thuoc.NhomThuoc)}
                        </select>
                    </div>
                    <div class="input-group"><label for="edit-nsx-select">Nhà sản xuất (*)</label><select id="edit-nsx-select" required>${generateOptions(danhMucNSX, 'MaNhaSanXuat', 'TenNhaSanXuat', thuoc.MaNhaSanXuat)}</select></div>
                    <div class="input-group"><label for="edit-thuoc-tonkhotoithieu">Tồn kho tối thiểu</label><input type="number" id="edit-thuoc-tonkhotoithieu" min="0" value="${thuoc.TonKhoToiThieu || '0'}"></div>
                    <div class="input-group" style="grid-column: 1 / -1;"><label for="edit-thuoc-ghichu">Ghi chú</label><textarea id="edit-thuoc-ghichu" rows="2">${thuoc.GhiChu || ''}</textarea></div>
                </div>
                
                <hr style="margin: 25px 0;">
                <h4>Đơn vị tính & Giá bán</h4>
                <div class="table-wrapper" style="max-height: 250px; overflow-y: auto;">
                    <table style="font-size: 0.9rem;">
                        <thead>
                            <tr>
                                <th>Tên đơn vị (*)</th>
                                <th>Tỷ lệ quy đổi (*)</th>
                                <th>Giá bán</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="edit-thuoc-units-tbody">
                           <!-- JS will populate this -->
                        </tbody>
                    </table>
                </div>
                <button type="button" id="btn-add-edit-unit-row" class="btn" style="margin-top: 10px; padding: 5px 10px;">+ Thêm đơn vị tính</button>

                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Hủy</button>
                    <button type="submit" class="btn btn-primary">Lưu thay đổi</button>
                </div>
            </form>
        `;
        showModal('Sửa thông tin Thuốc', modalContent, { size: '800px' });
    
        const unitTbody = document.getElementById('edit-thuoc-units-tbody');
        const addUnitRow = (unit = { DonViTinh: '', TyLeQuyDoi: 1, GiaBan: 0 }) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="text" class="unit-name" value="${unit.DonViTinh}" required placeholder="Vd: Vỉ" style="padding: 8px; width: 100%;"></td>
                <td><input type="number" class="unit-rate" value="${unit.TyLeQuyDoi}" min="1" required style="width: 100%; padding: 8px;"></td>
                <td><input type="number" class="unit-price" value="${unit.GiaBan || 0}" min="0" style="width: 100%; padding: 8px;"></td>
                <td><button type="button" class="btn-remove-unit" style="background:none; border:none; color:var(--danger-color); cursor:pointer; font-size: 1.5rem; line-height: 1;">&times;</button></td>
            `;
            unitTbody.appendChild(tr);
            tr.querySelector('.btn-remove-unit').addEventListener('click', () => {
                if (unitTbody.rows.length > 1) {
                    tr.remove();
                } else {
                    showToast('Phải có ít nhất một đơn vị tính.', 'error');
                }
            });
        };
    
        if (thuocUnits.length > 0) {
            thuocUnits.forEach(addUnitRow);
        } else {
            addUnitRow({ DonViTinh: thuoc.DonViCoSo, TyLeQuyDoi: 1, GiaBan: 0 });
        }
        
        document.getElementById('btn-add-edit-unit-row').addEventListener('click', () => addUnitRow());
    
        document.getElementById('edit-thuoc-form').addEventListener('submit', async e => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
    
            const itemData = {
                TenThuoc: document.getElementById('edit-thuoc-ten').value,
                HoatChat: document.getElementById('edit-thuoc-hoatchat').value,
                HamLuong: document.getElementById('edit-thuoc-hamluong').value,
                SoDangKy: document.getElementById('edit-thuoc-sodangky').value,
                QuyCachDongGoi: document.getElementById('edit-thuoc-quycach').value,
                DonViCoSo: document.getElementById('edit-thuoc-donvicoso').value,
                NhomThuoc: document.getElementById('edit-thuoc-nhomthuoc').value,
                MaNhaSanXuat: document.getElementById('edit-nsx-select').value,
                TonKhoToiThieu: document.getElementById('edit-thuoc-tonkhotoithieu').value,
                GhiChu: document.getElementById('edit-thuoc-ghichu').value
            };
    
            const unitRows = Array.from(unitTbody.querySelectorAll('tr'));
            const unitsData = unitRows.map(row => {
                const name = row.querySelector('.unit-name').value.trim();
                const rate = parseFloat(row.querySelector('.unit-rate').value);
                const price = parseFloat(row.querySelector('.unit-price').value);
                if (!name || isNaN(rate) || rate < 1) return null;
                return { DonViTinh: name, TyLeQuyDoi: rate, GiaBan: price || 0 };
            }).filter(Boolean);
    
            if (unitsData.length === 0) {
                showToast('Vui lòng cung cấp ít nhất một đơn vị tính hợp lệ.', 'error');
                submitBtn.disabled = false;
                return;
            }
    
            itemData.unitsData = unitsData;
    
            try {
                await callAppsScript('updateDanhMucItem', {
                    tenDanhMuc: 'DanhMucThuoc',
                    itemId: thuocId,
                    itemData: itemData
                });
                await Promise.all([
                    getCachedDanhMuc('DanhMucThuoc', true),
                    getCachedDanhMuc('DonViQuyDoi', true)
                ]);
                showToast('Cập nhật thuốc và đơn vị tính thành công!', 'success');
                hideModal();
                const currentTabContainer = document.getElementById('danhmuc-content');
                renderDanhMucThuoc(currentTabContainer);
            } catch (err) {
                showToast(`Lỗi: ${err.message}`, 'error');
                submitBtn.disabled = false;
            }
        });
    };

    const handleCopyThuoc = async (thuocId) => {
        const allThuoc = await getCachedDanhMuc('DanhMucThuoc');
        const thuoc = allThuoc.find(t => t.MaThuoc === thuocId);
        if (thuoc) {
            // Clear unique fields and show the add modal with pre-filled data
            const copyData = { ...thuoc, TenThuoc: '', SoDangKy: '' };
            showAddThuocModal(null, null, copyData);
        } else {
            showToast('Không tìm thấy thuốc để sao chép.', 'error');
        }
    };

    const handleDanhMucAction = async (action, id, danhMucKey) => {
        const danhMucNameMap = {
            'thuoc': { name: 'thuốc', sheet: 'DanhMucThuoc' },
            'khachhang': { name: 'khách hàng', sheet: 'DanhMucKhachHang' },
            'ncc': { name: 'nhà cung cấp', sheet: 'DanhMucNhaCungCap' },
            'nsx': { name: 'nhà sản xuất', sheet: 'DanhMucNhaSanXuat' },
            'donvitinh': { name: 'đơn vị tính', sheet: 'DMDonViTinh' },
            'nhomhanghoa': { name: 'nhóm hàng hóa', sheet: 'DMNhomHangHoa' }
        };
        const config = danhMucNameMap[danhMucKey];
        if (!config) return;
    
        const renderMap = {
            'thuoc': renderDanhMucThuoc,
            'khachhang': renderDanhMucKhachHang,
            'ncc': renderDanhMucNhaCungCap,
            'nsx': renderDanhMucNhaSanXuat,
            'donvitinh': renderDanhMucDonViTinh,
            'nhomhanghoa': renderDanhMucNhomHangHoa
        }

        const reRender = () => {
            const currentTabContainer = document.getElementById('danhmuc-content');
            if(renderMap[danhMucKey]) {
                renderMap[danhMucKey](currentTabContainer);
            }
        };

        switch (action) {
            case 'copy':
                if (danhMucKey === 'thuoc') {
                    handleCopyThuoc(id);
                }
                break;
            case 'edit':
                 switch (danhMucKey) {
                    case 'thuoc': showEditThuocModal(id); break;
                    case 'khachhang': showEditKhachHangModal(id); break;
                    case 'ncc': showEditNccModal(id); break;
                    case 'nsx': showEditNsxModal(id); break;
                    // case 'donvitinh': showEditDonViTinhModal(id); break; // To be created
                    // case 'nhomhanghoa': showEditNhomHangHoaModal(id); break; // To be created
                }
                break;
            case 'delete':
                if (confirm(`Bạn có chắc chắn muốn xóa ${config.name} này? Thao tác này không thể hoàn tác.`)) {
                    showToast(`Đang xóa ${config.name}...`, 'info');
                    callAppsScript('deleteDanhMucItem', { tenDanhMuc: config.sheet, itemId: id })
                        .then(result => {
                            showToast(result.message, 'success');
                            invalidateCache(config.sheet);
                            reRender();
                        })
                        .catch(err => {
                            showToast(`Lỗi khi xóa: ${err.message}`, 'error');
                        });
                }
                break;
        }
    };

    // --- MAIN PAGE RENDERER ---
    async function renderDanhMuc() {
        updatePageTitle('Danh mục');
        mainContent.innerHTML = `
            <div class="card">
                <div class="tabs" id="danhmuc-tabs">
                    <button class="tab-link active" data-tab="thuoc">Thuốc</button>
                    <button class="tab-link" data-tab="khachhang">Khách hàng</button>
                    <button class="tab-link" data-tab="ncc">Nhà cung cấp</button>
                    <button class="tab-link" data-tab="nsx">Nhà sản xuất</button>
                    <button class="tab-link" data-tab="donvitinh">Đơn vị tính</button>
                    <button class="tab-link" data-tab="nhomhanghoa">Nhóm hàng hóa</button>
                </div>
                <div id="danhmuc-content" style="padding-top: 20px;"></div>
            </div>
        `;

        const tabContainer = document.getElementById('danhmuc-content');
        const tabs = document.querySelectorAll('#danhmuc-tabs .tab-link');

        const renderTabContent = (tabId) => {
            tabContainer.innerHTML = '<p>Đang tải dữ liệu...</p>';
            switch (tabId) {
                case 'thuoc': renderDanhMucThuoc(tabContainer); break;
                case 'khachhang': renderDanhMucKhachHang(tabContainer); break;
                case 'ncc': renderDanhMucNhaCungCap(tabContainer); break;
                case 'nsx': renderDanhMucNhaSanXuat(tabContainer); break;
                case 'donvitinh': renderDanhMucDonViTinh(tabContainer); break;
                case 'nhomhanghoa': renderDanhMucNhomHangHoa(tabContainer); break;
            }
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                renderTabContent(e.currentTarget.dataset.tab);
            });
        });

        // Initial render
        renderTabContent('thuoc');
    }

    // --- TAB-SPECIFIC RENDERERS ---
    async function renderDanhMucThuoc(container) {
         try {
            const [thuocList, nsxList] = await Promise.all([
                getCachedDanhMuc('DanhMucThuoc'),
                getCachedDanhMuc('DanhMucNhaSanXuat')
            ]);
            const nsxMap = new Map(nsxList.map(nsx => [nsx.MaNhaSanXuat, nsx.TenNhaSanXuat]));

            container.innerHTML = `
                <div class="card-header">
                    <h3>Danh mục Thuốc</h3>
                    <div style="display: flex; gap: 10px;">
                         <button class="btn btn-secondary" id="btn-import-thuoc">Import Excel</button>
                         <button class="btn btn-primary" id="btn-add-item">Thêm mới</button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="input-group" style="max-width: 400px; margin-bottom: 20px;">
                        <input type="text" id="thuoc-filter-input" placeholder="Tìm kiếm nhanh theo tên thuốc, hoạt chất, SĐK...">
                    </div>
                    <div class="table-wrapper">
                        <table>
                            <thead><tr><th>Mã thuốc</th><th>Tên thuốc</th><th>Hoạt chất</th><th>ĐV cơ sở</th><th>Nhà sản xuất</th><th class="action-cell">Hành động</th></tr></thead>
                            <tbody id="dm-tbody"></tbody>
                        </table>
                    </div>
                </div>
            `;
            
            const tableBody = document.getElementById('dm-tbody');
            const filterInput = document.getElementById('thuoc-filter-input');
    
            const renderTableRows = (data) => {
                tableBody.innerHTML = data.map(item => `
                    <tr data-id="${item.MaThuoc}">
                        <td>${item.MaThuoc}</td><td>${item.TenThuoc}</td><td>${item.HoatChat || ''}</td><td>${item.DonViCoSo}</td><td>${nsxMap.get(item.MaNhaSanXuat) || ''}</td>
                        <td class="action-cell">
                            <div class="action-menu"><button class="btn-actions"><span class="material-symbols-outlined">more_vert</span></button>
                                <div class="action-menu-dropdown">
                                    <a href="#" class="action-item" data-action="copy">Sao chép</a>
                                    <a href="#" class="action-item" data-action="edit">Sửa</a>
                                    <a href="#" class="action-item" data-action="delete">Xóa</a>
                                </div>
                            </div>
                        </td>
                    </tr>`).join('');
            };
    
            renderTableRows(thuocList); // Initial render
    
            filterInput.addEventListener('input', () => {
                const searchTerm = filterInput.value.trim().toLowerCase();
                const normalizedSearchTerm = removeDiacritics(searchTerm);
    
                if (!searchTerm) {
                    renderTableRows(thuocList);
                    return;
                }
    
                const filteredData = thuocList.filter(item => {
                    const tenThuoc = removeDiacritics(item.TenThuoc.toLowerCase());
                    const hoatChat = item.HoatChat ? removeDiacritics(item.HoatChat.toLowerCase()) : '';
                    const soDangKy = item.SoDangKy ? item.SoDangKy.toLowerCase() : '';
                    
                    return tenThuoc.includes(normalizedSearchTerm) ||
                           hoatChat.includes(normalizedSearchTerm) ||
                           soDangKy.includes(searchTerm);
                });
                renderTableRows(filteredData);
            });


            document.getElementById('btn-add-item').addEventListener('click', () => showAddThuocModal());
            document.getElementById('btn-import-thuoc').addEventListener('click', () => showImportThuocModal());

            document.getElementById('dm-tbody').addEventListener('click', e => {
                 const actionItem = e.target.closest('.action-item');
                if (actionItem) {
                    e.preventDefault();
                    const action = actionItem.dataset.action;
                    const id = actionItem.closest('tr').dataset.id;
                    handleDanhMucAction(action, id, 'thuoc');
                }
            });
        } catch (error) {
            container.innerHTML = `<p style="color:red">Lỗi tải dữ liệu: ${error.message}</p>`;
        }
    }

    async function renderDanhMucKhachHang(container) {
        try {
            const data = await getCachedDanhMuc('DanhMucKhachHang');
            container.innerHTML = `
                <div class="card-header"><h3>Danh mục Khách hàng</h3><button class="btn btn-primary" id="btn-add-item">Thêm mới</button></div>
                <div class="card-body table-wrapper">
                    <table>
                        <thead><tr><th>Mã KH</th><th>Họ Tên</th><th>Số điện thoại</th><th>Địa chỉ</th><th class="action-cell">Hành động</th></tr></thead>
                        <tbody id="dm-tbody">
                        ${data.map(item => `
                            <tr data-id="${item.MaKhachHang}">
                                <td>${item.MaKhachHang}</td><td>${item.HoTen}</td><td>${item.SoDienThoai || ''}</td><td>${item.DiaChi || ''}</td>
                                <td class="action-cell">
                                    <div class="action-menu"><button class="btn-actions"><span class="material-symbols-outlined">more_vert</span></button>
                                        <div class="action-menu-dropdown"><a href="#" class="action-item" data-action="edit">Sửa</a><a href="#" class="action-item" data-action="delete">Xóa</a></div>
                                    </div>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            document.getElementById('btn-add-item').addEventListener('click', () => showAddKhachHangModal(() => renderDanhMucKhachHang(container)));
            document.getElementById('dm-tbody').addEventListener('click', e => {
                const actionItem = e.target.closest('.action-item');
                if (actionItem) {
                    e.preventDefault();
                    const action = actionItem.dataset.action;
                    const id = actionItem.closest('tr').dataset.id;
                    handleDanhMucAction(action, id, 'khachhang');
                }
            });
        } catch (error) {
            container.innerHTML = `<p style="color:red">Lỗi tải dữ liệu: ${error.message}</p>`;
        }
    }

    async function renderDanhMucNhaCungCap(container) {
        try {
            const data = await getCachedDanhMuc('DanhMucNhaCungCap');
            container.innerHTML = `
                <div class="card-header"><h3>Danh mục Nhà cung cấp</h3><button class="btn btn-primary" id="btn-add-item">Thêm mới</button></div>
                <div class="card-body table-wrapper">
                    <table>
                        <thead><tr><th>Mã NCC</th><th>Tên Nhà Cung Cấp</th><th>Số điện thoại</th><th>Địa chỉ</th><th class="action-cell">Hành động</th></tr></thead>
                        <tbody id="dm-tbody">
                        ${data.map(item => `
                            <tr data-id="${item.MaNhaCungCap}">
                                <td>${item.MaNhaCungCap}</td><td>${item.TenNhaCungCap}</td><td>${item.SoDienThoai || ''}</td><td>${item.DiaChi || ''}</td>
                                <td class="action-cell">
                                     <div class="action-menu"><button class="btn-actions"><span class="material-symbols-outlined">more_vert</span></button>
                                        <div class="action-menu-dropdown"><a href="#" class="action-item" data-action="edit">Sửa</a><a href="#" class="action-item" data-action="delete">Xóa</a></div>
                                    </div>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            document.getElementById('btn-add-item').addEventListener('click', () => showAddSupplierModal(null, () => renderDanhMucNhaCungCap(container)));
             document.getElementById('dm-tbody').addEventListener('click', e => {
                const actionItem = e.target.closest('.action-item');
                if (actionItem) {
                    e.preventDefault();
                    const action = actionItem.dataset.action;
                    const id = actionItem.closest('tr').dataset.id;
                    handleDanhMucAction(action, id, 'ncc');
                }
            });
        } catch (error) {
            container.innerHTML = `<p style="color:red">Lỗi tải dữ liệu: ${error.message}</p>`;
        }
    }

    async function renderDanhMucNhaSanXuat(container) {
         try {
            const data = await getCachedDanhMuc('DanhMucNhaSanXuat');
            container.innerHTML = `
                <div class="card-header"><h3>Danh mục Nhà sản xuất</h3><button class="btn btn-primary" id="btn-add-item">Thêm mới</button></div>
                <div class="card-body table-wrapper">
                    <table>
                        <thead><tr><th>Mã NSX</th><th>Tên Nhà Sản Xuất</th><th>Quốc gia</th><th class="action-cell">Hành động</th></tr></thead>
                        <tbody id="dm-tbody">
                        ${data.map(item => `
                            <tr data-id="${item.MaNhaSanXuat}">
                                <td>${item.MaNhaSanXuat}</td><td>${item.TenNhaSanXuat}</td><td>${item.QuocGia || ''}</td>
                                <td class="action-cell">
                                     <div class="action-menu"><button class="btn-actions"><span class="material-symbols-outlined">more_vert</span></button>
                                        <div class="action-menu-dropdown"><a href="#" class="action-item" data-action="edit">Sửa</a><a href="#" class="action-item" data-action="delete">Xóa</a></div>
                                    </div>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            document.getElementById('btn-add-item').addEventListener('click', () => showAddNsxModal(null, () => renderDanhMucNhaSanXuat(container)));
             document.getElementById('dm-tbody').addEventListener('click', e => {
                const actionItem = e.target.closest('.action-item');
                if (actionItem) {
                    e.preventDefault();
                    const action = actionItem.dataset.action;
                    const id = actionItem.closest('tr').dataset.id;
                    handleDanhMucAction(action, id, 'nsx');
                }
            });
        } catch (error) {
            container.innerHTML = `<p style="color:red">Lỗi tải dữ liệu: ${error.message}</p>`;
        }
    }
    
    async function renderDanhMucDonViTinh(container) {
         try {
            const data = await getCachedDanhMuc('DMDonViTinh');
            container.innerHTML = `
                <div class="card-header"><h3>Danh mục Đơn vị tính</h3><button class="btn btn-primary" id="btn-add-item">Thêm mới</button></div>
                <div class="card-body table-wrapper">
                    <table>
                        <thead><tr><th>Mã ĐVT</th><th>Tên Đơn vị tính</th><th class="action-cell">Hành động</th></tr></thead>
                        <tbody id="dm-tbody">
                        ${data.map(item => `
                            <tr data-id="${item.MaDonViTinh}">
                                <td>${item.MaDonViTinh}</td><td>${item.TenDonViTinh}</td>
                                <td class="action-cell">
                                     <div class="action-menu"><button class="btn-actions"><span class="material-symbols-outlined">more_vert</span></button>
                                        <div class="action-menu-dropdown"><a href="#" class="action-item" data-action="edit">Sửa</a><a href="#" class="action-item" data-action="delete">Xóa</a></div>
                                    </div>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            document.getElementById('btn-add-item').addEventListener('click', () => showAddDonViTinhModal(null, () => renderDanhMucDonViTinh(container)));
             document.getElementById('dm-tbody').addEventListener('click', e => {
                const actionItem = e.target.closest('.action-item');
                if (actionItem) {
                    e.preventDefault();
                    const action = actionItem.dataset.action;
                    const id = actionItem.closest('tr').dataset.id;
                    handleDanhMucAction(action, id, 'donvitinh');
                }
            });
        } catch (error) {
            container.innerHTML = `<p style="color:red">Lỗi tải dữ liệu: ${error.message}</p>`;
        }
    }
    
    async function renderDanhMucNhomHangHoa(container) {
         try {
            const data = await getCachedDanhMuc('DMNhomHangHoa');
            container.innerHTML = `
                <div class="card-header"><h3>Danh mục Nhóm hàng hóa</h3><button class="btn btn-primary" id="btn-add-item">Thêm mới</button></div>
                <div class="card-body table-wrapper">
                    <table>
                        <thead><tr><th>Mã Nhóm</th><th>Tên Nhóm hàng hóa</th><th class="action-cell">Hành động</th></tr></thead>
                        <tbody id="dm-tbody">
                        ${data.map(item => `
                            <tr data-id="${item.MaNhomHangHoa}">
                                <td>${item.MaNhomHangHoa}</td><td>${item.TenNhomHangHoa}</td>
                                <td class="action-cell">
                                     <div class="action-menu"><button class="btn-actions"><span class="material-symbols-outlined">more_vert</span></button>
                                        <div class="action-menu-dropdown"><a href="#" class="action-item" data-action="edit">Sửa</a><a href="#" class="action-item" data-action="delete">Xóa</a></div>
                                    </div>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            document.getElementById('btn-add-item').addEventListener('click', () => showAddNhomHangHoaModal(null, () => renderDanhMucNhomHangHoa(container)));
             document.getElementById('dm-tbody').addEventListener('click', e => {
                const actionItem = e.target.closest('.action-item');
                if (actionItem) {
                    e.preventDefault();
                    const action = actionItem.dataset.action;
                    const id = actionItem.closest('tr').dataset.id;
                    handleDanhMucAction(action, id, 'nhomhanghoa');
                }
            });
        } catch (error) {
            container.innerHTML = `<p style="color:red">Lỗi tải dữ liệu: ${error.message}</p>`;
        }
    }

    function showImportThuocModal() {
        const modalContent = `
            <div>
                <p>Vui lòng chuẩn bị file Excel theo đúng mẫu. Cột đầu tiên là Tên Thuốc, cột thứ hai là Tên Nhà Sản Xuất.</p>
                <a href="#" id="download-template-link">Tải file mẫu</a>
                <div class="input-group" style="margin-top: 20px;">
                    <label for="import-file-input">Chọn file Excel (.xlsx)</label>
                    <input type="file" id="import-file-input" accept=".xlsx">
                </div>
                <div id="validation-results" style="margin-top: 15px;"></div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="window.app.hideModal()">Hủy</button>
                    <button type="button" class="btn btn-primary" id="process-import-btn" disabled>Bắt đầu Import</button>
                </div>
            </div>
        `;
        showModal("Import Danh Mục Thuốc từ Excel", modalContent, { size: '700px' });
    
        let validRowsData = [];
    
        document.getElementById('download-template-link').addEventListener('click', (e) => {
            e.preventDefault();
            const sampleData = [["TenThuoc", "TenNhaSanXuat", "HoatChat", "HamLuong", "SoDangKy", "QuyCachDongGoi", "DonViCoSo", "NhomThuoc", "TonKhoToiThieu"],
                                ["Paracetamol 500mg", "Traphaco", "Paracetamol", "500mg", "VD-12345-12", "Hộp 10 vỉ x 10 viên", "Viên", "Giảm đau, hạ sốt", 100]];
            const ws = XLSX.utils.aoa_to_sheet(sampleData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "MauImportThuoc");
            XLSX.writeFile(wb, "MauImportThuoc.xlsx");
        });
    
        document.getElementById('import-file-input').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
    
            const resultsContainer = document.getElementById('validation-results');
            resultsContainer.innerHTML = '<p>Đang đọc và kiểm tra file...</p>';
            document.getElementById('process-import-btn').disabled = true;
            validRowsData = [];
    
            try {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
                if (jsonData.length < 2) {
                    throw new Error("File không có dữ liệu (ít nhất phải có dòng tiêu đề và 1 dòng dữ liệu).");
                }
    
                const headers = jsonData.shift().map(h => h.trim());
                const requiredHeaders = ["TenThuoc", "TenNhaSanXuat"];
                if (!requiredHeaders.every(h => headers.includes(h))) {
                    throw new Error(`File Excel phải có các cột bắt buộc: ${requiredHeaders.join(', ')}.`);
                }
    
                const tenThuocIndex = headers.indexOf("TenThuoc");
                const tenNsxIndex = headers.indexOf("TenNhaSanXuat");
    
                let validCount = 0;
                let errors = [];
                
                const allThuoc = await getCachedDanhMuc('DanhMucThuoc');
                const existingNames = new Set(allThuoc.map(t => t.TenThuoc.trim().toLowerCase()));

                jsonData.forEach((row, index) => {
                    const tenThuoc = row[tenThuocIndex]?.trim();
                    const tenNsx = row[tenNsxIndex]?.trim();
    
                    if (!tenThuoc || !tenNsx) {
                        errors.push(`Dòng ${index + 2}: Thiếu Tên Thuốc hoặc Tên Nhà Sản Xuất.`);
                        return;
                    }
                    if (existingNames.has(tenThuoc.toLowerCase())) {
                        errors.push(`Dòng ${index + 2}: Tên thuốc "${tenThuoc}" đã tồn tại trong hệ thống.`);
                        return;
                    }
    
                    validCount++;
                    const rowData = {};
                    headers.forEach((header, i) => {
                        rowData[header] = row[i];
                    });
                    validRowsData.push(rowData);
                });
    
                let resultHtml = `<p style="color: green;"><strong>${validCount}</strong> dòng hợp lệ.`;
                if (errors.length > 0) {
                    resultHtml += ` <strong style="color: red;">${errors.length}</strong> dòng có lỗi.</p>`;
                    resultHtml += `<div style="max-height: 150px; overflow-y: auto; border: 1px solid #ccc; padding: 5px;">${errors.slice(0, 10).map(e => `<p style="font-size: 0.8rem; margin: 2px 0;">- ${e}</p>`).join('')}${errors.length > 10 ? '<p>...</p>' : ''}</div>`;
                } else {
                    resultHtml += '</p>';
                }
                resultsContainer.innerHTML = resultHtml;
    
                if (validCount > 0) {
                    document.getElementById('process-import-btn').disabled = false;
                }
    
            } catch (error) {
                resultsContainer.innerHTML = `<p style="color: red;"><strong>Lỗi xử lý file:</strong> ${error.message}</p>`;
            }
        });
    
        document.getElementById('process-import-btn').addEventListener('click', async () => {
            const btn = document.getElementById('process-import-btn');
            btn.disabled = true;
            btn.textContent = 'Đang import...';
            showToast(`Đang import ${validRowsData.length} thuốc...`, 'info');
            try {
                const result = await callAppsScript('importThuoc', { validRowsData });
                showToast(`Import thành công ${result.successCount} thuốc!`, 'success');
                hideModal();
                const currentTabContainer = document.getElementById('danhmuc-content');
                renderDanhMucThuoc(currentTabContainer);
            } catch(e) {
                showToast(`Lỗi import: ${e.message}`, 'error');
                btn.disabled = false;
                btn.textContent = 'Bắt đầu Import';
            }
        });
    }

    return {
        danhmuc: renderDanhMuc
    };
}
