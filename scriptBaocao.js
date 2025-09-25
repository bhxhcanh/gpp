function initializeBaoCaoModule(app) {
    const { callAppsScript, getCachedDanhMuc, showToast, showModal, hideModal, invalidateCache, state: appState } = app;
    const mainContent = document.getElementById('main-content');
    const pageTitle = document.getElementById('page-title');

    const updatePageTitle = (title) => pageTitle.textContent = title;
    
    // --- BÁO CÁO ---
    async function renderBaoCao() {
        updatePageTitle('Báo cáo');
        mainContent.innerHTML = `
            <div class="card">
                <div class="tabs" id="baocao-tabs">
                    <button class="tab-link active" data-tab="kinhdoanh">Kinh doanh</button>
                    <button class="tab-link" data-tab="tonkho">Tồn kho</button>
                    <button class="tab-link" data-tab="handung">Hạn dùng</button>
                    <button class="tab-link" data-tab="congno">Công nợ</button>
                </div>
                <div id="baocao-content" style="padding-top: 20px;"></div>
            </div>
        `;

        const tabContainer = document.getElementById('baocao-content');
        const tabs = document.querySelectorAll('#baocao-tabs .tab-link');

        const renderTabContent = (tabId) => {
            tabContainer.innerHTML = '<p>Đang tải dữ liệu...</p>';
            switch (tabId) {
                case 'kinhdoanh': renderBaoCaoKinhDoanh(tabContainer); break;
                case 'tonkho': renderBaoCaoTonKho(tabContainer); break;
                case 'handung': renderBaoCaoHanDung(tabContainer); break;
                case 'congno': renderBaoCaoCongNo(tabContainer); break;
            }
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                renderTabContent(e.currentTarget.dataset.tab);
            });
        });
        
        // Event delegation for payment buttons
        tabContainer.addEventListener('click', e => {
            const payBtn = e.target.closest('.btn-pay-debt');
            if (payBtn) {
                const { type, id, name, amount } = payBtn.dataset;
                showDebtPaymentModal(type, id, name, parseFloat(amount));
            }
        });


        renderTabContent('kinhdoanh');
    }

    async function renderBaoCaoKinhDoanh(container) {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];

        container.innerHTML = `
            <div class="card-header" style="padding: 0 0 15px 0;">
                <h3>Báo cáo Kinh doanh</h3>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <input type="date" id="report-start-date" value="${firstDayOfMonth}" class="input-group" style="padding: 8px;">
                    <span>đến</span>
                    <input type="date" id="report-end-date" value="${todayStr}" class="input-group" style="padding: 8px;">
                    <button id="view-report-btn" class="btn btn-primary">Xem báo cáo</button>
                </div>
            </div>
            <div id="report-results">
                <p>Chọn khoảng thời gian và nhấn "Xem báo cáo" để xem dữ liệu.</p>
            </div>
        `;

        const viewReportBtn = document.getElementById('view-report-btn');
        viewReportBtn.addEventListener('click', async () => {
            const startDate = document.getElementById('report-start-date').value;
            const endDate = document.getElementById('report-end-date').value;
            const resultsContainer = document.getElementById('report-results');
            
            if (!startDate || !endDate) {
                showToast('Vui lòng chọn ngày bắt đầu và kết thúc.', 'error');
                return;
            }

            viewReportBtn.disabled = true;
            viewReportBtn.textContent = 'Đang tải...';
            resultsContainer.innerHTML = '<p>Đang xử lý dữ liệu, vui lòng chờ...</p>';

            try {
                const data = await callAppsScript('getBaoCaoKinhDoanh', { startDate, endDate });
                resultsContainer.innerHTML = `
                    <div class="grid-container" style="grid-template-columns: repeat(2, 1fr);">
                        <div class="stat-card revenue"><div class="icon"><span class="material-symbols-outlined">payments</span></div><div class="info"><h4>${data.totalRevenue.toLocaleString('vi-VN')}đ</h4><p>Tổng doanh thu</p></div></div>
                        <div class="stat-card sales"><div class="icon"><span class="material-symbols-outlined">receipt</span></div><div class="info"><h4>${data.invoiceCount}</h4><p>Tổng số hóa đơn</p></div></div>
                    </div>
                    <h4>Top 10 sản phẩm bán chạy</h4>
                    <div class="table-wrapper">
                        <table>
                            <thead><tr><th>STT</th><th>Tên thuốc</th><th>Số lượng bán (ĐV cơ sở)</th></tr></thead>
                            <tbody>
                                ${data.topProducts.map((p, index) => `
                                    <tr>
                                        <td>${index + 1}</td>
                                        <td>${p.TenThuoc}</td>
                                        <td>${p.totalQuantitySold}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            } catch (e) {
                resultsContainer.innerHTML = `<p style="color:red">Lỗi tải báo cáo: ${e.message}</p>`;
            } finally {
                viewReportBtn.disabled = false;
                viewReportBtn.textContent = 'Xem báo cáo';
            }
        });
    }

    async function renderBaoCaoTonKho(container) {
        container.innerHTML = '<p>Đang tải báo cáo tồn kho...</p>';
        try {
            const data = await callAppsScript('getBaoCaoTonKho');
            const totalValue = data.reduce((sum, item) => sum + item.estimatedValue, 0);

            container.innerHTML = `
                <div class="card-header" style="padding: 0 0 15px 0;">
                    <h3>Báo cáo Tồn kho</h3>
                </div>
                <div class="stat-card" style="max-width: 400px; margin-bottom: 20px;">
                    <div class="icon" style="background-color: var(--primary-color);"><span class="material-symbols-outlined">inventory</span></div>
                    <div class="info"><h4>${totalValue.toLocaleString('vi-VN')}đ</h4><p>Tổng giá trị tồn kho (ước tính)</p></div>
                </div>
                <div class="table-wrapper">
                    <table>
                        <thead><tr><th>Mã thuốc</th><th>Tên thuốc</th><th>Tổng tồn</th><th>Đơn vị</th><th>Giá trị ước tính (giá bán)</th></tr></thead>
                        <tbody>
                            ${data.map(item => `
                                <tr>
                                    <td>${item.MaThuoc}</td>
                                    <td>${item.TenThuoc}</td>
                                    <td>${item.totalStock}</td>
                                    <td>${item.DonViCoSo}</td>
                                    <td>${item.estimatedValue.toLocaleString('vi-VN')}đ</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<p style="color:red">Lỗi tải báo cáo: ${e.message}</p>`;
        }
    }

    async function renderBaoCaoHanDung(container) {
        container.innerHTML = `
            <div class="card-header" style="padding: 0 0 15px 0;">
                <h3>Báo cáo Hạn dùng</h3>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <label for="expiry-period-select">Xem thuốc hết hạn trong:</label>
                    <select id="expiry-period-select" class="input-group" style="padding: 8px;">
                        <option value="30">30 ngày tới</option>
                        <option value="60" selected>60 ngày tới</option>
                        <option value="90">90 ngày tới</option>
                        <option value="180">180 ngày tới</option>
                    </select>
                </div>
            </div>
            <div id="expiry-report-results"><p>Chọn khoảng thời gian để xem dữ liệu.</p></div>
        `;

        const periodSelect = document.getElementById('expiry-period-select');
        const resultsContainer = document.getElementById('expiry-report-results');

        const fetchAndRender = async () => {
            const days = parseInt(periodSelect.value, 10);
            resultsContainer.innerHTML = '<p>Đang tải dữ liệu...</p>';
            try {
                const data = await callAppsScript('getBaoCaoHanDung', { daysUntilExpiry: days });
                if (data.length === 0) {
                    resultsContainer.innerHTML = '<p>Không có sản phẩm nào sắp hết hạn trong khoảng thời gian đã chọn.</p>';
                    return;
                }
                resultsContainer.innerHTML = `
                    <div class="table-wrapper">
                        <table>
                            <thead><tr><th>Tên thuốc</th><th>Số lô</th><th>Hạn sử dụng</th><th>Số lượng tồn</th><th>Đơn vị</th></tr></thead>
                            <tbody>
                                ${data.map(item => `
                                    <tr>
                                        <td>${item.TenThuoc}</td>
                                        <td>${item.SoLo}</td>
                                        <td style="color: var(--danger-color);">${new Date(item.HanSuDung).toLocaleDateString('vi-VN')}</td>
                                        <td>${item.SoLuong}</td>
                                        <td>${item.DonViCoSo}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            } catch (e) {
                 resultsContainer.innerHTML = `<p style="color:red">Lỗi tải báo cáo: ${e.message}</p>`;
            }
        };

        periodSelect.addEventListener('change', fetchAndRender);
        fetchAndRender(); // Initial load
    }
    
    async function renderBaoCaoCongNo(container) {
        container.innerHTML = `
             <div class="card-header" style="padding: 0 0 15px 0;">
                <h3>Báo cáo Công nợ</h3>
             </div>
             <div class="tabs" id="congno-tabs">
                <button class="tab-link active" data-tab="phaithu">Công nợ phải thu</button>
                <button class="tab-link" data-tab="phaitra">Công nợ phải trả</button>
            </div>
            <div id="congno-content" style="padding-top: 20px;"></div>
        `;
        const tabContainer = document.getElementById('congno-content');
        const tabs = document.querySelectorAll('#congno-tabs .tab-link');

        const renderTabContent = (tabId) => {
            tabContainer.innerHTML = '<p>Đang tải dữ liệu...</p>';
            if (tabId === 'phaithu') {
                renderBaoCaoCongNoPhaiThu(tabContainer);
            } else if (tabId === 'phaitra') {
                renderBaoCaoCongNoPhaiTra(tabContainer);
            }
        };

         tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                renderTabContent(e.currentTarget.dataset.tab);
            });
        });

        renderTabContent('phaithu');
    }

    async function renderBaoCaoCongNoPhaiThu(container) {
        try {
            const data = await callAppsScript('getBaoCaoCongNoPhaiThu');
            const totalDebt = data.reduce((sum, item) => sum + item.conLai, 0);

            container.innerHTML = `
                <div class="stat-card" style="max-width: 400px; margin-bottom: 20px;">
                    <div class="icon" style="background-color: var(--danger-color);"><span class="material-symbols-outlined">request_quote</span></div>
                    <div class="info"><h4>${totalDebt.toLocaleString('vi-VN')}đ</h4><p>Tổng công nợ phải thu</p></div>
                </div>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr><th>Khách hàng</th><th>Tổng nợ</th><th>Đã trả</th><th>Còn lại</th><th>Hành động</th></tr>
                        </thead>
                        <tbody>
                            ${data.map(item => `
                                <tr>
                                    <td>${item.tenKhachHang} (${item.maKhachHang})</td>
                                    <td>${item.tongNo.toLocaleString('vi-VN')}đ</td>
                                    <td>${item.daTra.toLocaleString('vi-VN')}đ</td>
                                    <td style="font-weight: bold; color: var(--danger-color);">${item.conLai.toLocaleString('vi-VN')}đ</td>
                                    <td>
                                        <button class="btn btn-success btn-pay-debt" style="padding: 5px 10px; font-size: 0.8rem;"
                                            data-type="PhaiThu" 
                                            data-id="${item.maHoaDon}" 
                                            data-name="${item.tenKhachHang}" 
                                            data-amount="${item.conLai}">
                                            Thanh toán
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<p style="color:red">Lỗi tải báo cáo: ${e.message}</p>`;
        }
    }

    async function renderBaoCaoCongNoPhaiTra(container) {
         try {
            const data = await callAppsScript('getBaoCaoCongNoPhaiTra');
            const totalDebt = data.reduce((sum, item) => sum + item.conLai, 0);
            
            container.innerHTML = `
                <div class="stat-card" style="max-width: 400px; margin-bottom: 20px;">
                    <div class="icon" style="background-color: var(--warning-color);"><span class="material-symbols-outlined">payments</span></div>
                    <div class="info"><h4>${totalDebt.toLocaleString('vi-VN')}đ</h4><p>Tổng công nợ phải trả</p></div>
                </div>
                 <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr><th>Nhà cung cấp</th><th>Tổng nợ</th><th>Đã trả</th><th>Còn lại</th><th>Hành động</th></tr>
                        </thead>
                        <tbody>
                            ${data.map(item => `
                                <tr>
                                    <td>${item.tenNhaCungCap} (${item.maNhaCungCap})</td>
                                    <td>${item.tongNo.toLocaleString('vi-VN')}đ</td>
                                    <td>${item.daTra.toLocaleString('vi-VN')}đ</td>
                                    <td style="font-weight: bold; color: var(--danger-color);">${item.conLai.toLocaleString('vi-VN')}đ</td>
                                    <td>
                                        <button class="btn btn-success btn-pay-debt" style="padding: 5px 10px; font-size: 0.8rem;"
                                            data-type="PhaiTra" 
                                            data-id="${item.maPhieuNhap}" 
                                            data-name="${item.tenNhaCungCap}" 
                                            data-amount="${item.conLai}">
                                            Thanh toán
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<p style="color:red">Lỗi tải báo cáo: ${e.message}</p>`;
        }
    }

    function showDebtPaymentModal(type, id, name, amount) {
        const title = type === 'PhaiThu' ? `Thanh toán công nợ từ KH: ${name}` : `Thanh toán công nợ cho NCC: ${name}`;
        const modalContent = `
            <form id="debt-payment-form">
                <p>Số tiền cần thanh toán: <strong>${amount.toLocaleString('vi-VN')}đ</strong></p>
                <div class="input-group">
                    <label for="payment-amount">Số tiền thanh toán</label>
                    <input type="number" id="payment-amount" value="${amount}" min="1" max="${amount}" required>
                </div>
                <div class="input-group">
                    <label for="payment-method">Hình thức thanh toán</label>
                    <select id="payment-method" required>
                        <option value="Tiền mặt">Tiền mặt</option>
                        <option value="Tài khoản">Tài khoản</option>
                    </select>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="window.app.hideModal()">Hủy</button>
                    <button type="submit" class="btn btn-primary">Xác nhận thanh toán</button>
                </div>
            </form>
        `;
        showModal(title, modalContent);

        document.getElementById('debt-payment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            
            try {
                const paymentData = {
                    debtType: type,
                    debtId: id,
                    debtorName: name,
                    amount: parseFloat(document.getElementById('payment-amount').value),
                    paymentMethod: document.getElementById('payment-method').value
                };

                await callAppsScript('recordDebtPayment', paymentData);
                
                showToast('Ghi nhận thanh toán thành công!', 'success');
                hideModal();

                // Invalidate relevant caches
                invalidateCache('SoQuy');
                if (type === 'PhaiThu') {
                    invalidateCache('HoaDon');
                } else {
                    invalidateCache('PhieuNhap');
                }
                
                // Re-render the current tab
                const currentTab = document.querySelector('#congno-tabs .tab-link.active').dataset.tab;
                const container = document.getElementById('congno-content');
                if (currentTab === 'phaithu') {
                    renderBaoCaoCongNoPhaiThu(container);
                } else {
                    renderBaoCaoCongNoPhaiTra(container);
                }
            } catch (error) {
                showToast(`Lỗi: ${error.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }


    // --- SỔ QUỸ ---
    async function renderSoQuy() {
        updatePageTitle('Sổ quỹ');
        mainContent.innerHTML = `<div class="card"><p>Đang tải dữ liệu sổ quỹ...</p></div>`;

        let allData = [];
        const nhanSuMap = appState.cache.nhanSuMap || {};

        const renderTable = (filteredData) => {
            const soDu = filteredData.reduce((acc, item) => {
                return item.LoaiPhieu === 'Thu' ? acc + item.SoTien : acc - item.SoTien;
            }, 0);

            const soQuyContent = document.getElementById('so-quy-content');
            if (soQuyContent) {
                soQuyContent.innerHTML = `
                    <div class="stat-card" style="max-width: 400px; margin-bottom: 20px;">
                        <div class="icon" style="background-color: var(--primary-color);"><span class="material-symbols-outlined">account_balance_wallet</span></div>
                        <div class="info"><h4>${soDu.toLocaleString('vi-VN')}đ</h4><p>Số dư (theo bộ lọc)</p></div>
                    </div>
                    <div class="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Mã phiếu</th>
                                    <th>Ngày ghi sổ</th>
                                    <th>Loại</th>
                                    <th>Số tiền</th>
                                    <th>Hình thức</th>
                                    <th>Nội dung</th>
                                    <th>Người tạo</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filteredData.sort((a,b) => new Date(b.NgayGhiSo) - new Date(a.NgayGhiSo)).map(item => `
                                    <tr>
                                        <td>${item.MaPhieu}</td>
                                        <td>${new Date(item.NgayGhiSo).toLocaleString('vi-VN')}</td>
                                        <td><span style="color: ${item.LoaiPhieu === 'Thu' ? 'var(--success-color)' : 'var(--danger-color)'}; font-weight: 500;">${item.LoaiPhieu}</span></td>
                                        <td>${item.SoTien.toLocaleString('vi-VN')}đ</td>
                                        <td>${item.HinhThucThanhToan || 'N/A'}</td>
                                        <td>${item.NoiDung}</td>
                                        <td>${nhanSuMap[item.NguoiThucHien] || item.NguoiThucHien}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
        };

        const applyFilters = () => {
            const dateFilter = document.getElementById('date-filter-preset').value;
            const methodFilter = document.getElementById('method-filter').value;
            const startDate = new Date(document.getElementById('start-date-filter').value);
            const endDate = new Date(document.getElementById('end-date-filter').value);
            
            if (!isNaN(startDate)) startDate.setHours(0, 0, 0, 0);
            if (!isNaN(endDate)) endDate.setHours(23, 59, 59, 999);

            const filtered = allData.filter(item => {
                // Method filter
                if (methodFilter !== 'all' && item.HinhThucThanhToan !== methodFilter) {
                    return false;
                }
                
                // Date filter
                const itemDate = new Date(item.NgayGhiSo);
                if (dateFilter === 'custom') {
                    if (isNaN(startDate) || isNaN(endDate) || itemDate < startDate || itemDate > endDate) {
                        return false;
                    }
                }
                
                return true;
            });
            renderTable(filtered);
        };

        try {
            allData = await callAppsScript('getSoQuy');
            
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];

            mainContent.innerHTML = `
                 <div class="card">
                    <div class="card-header">
                        <h3>Sổ quỹ</h3>
                        <div style="display: flex; gap: 10px;">
                            <button class="btn btn-success" id="btn-tao-phieu-thu"><span class="material-symbols-outlined">add</span>Tạo phiếu thu</button>
                            <button class="btn btn-danger" id="btn-tao-phieu-chi"><span class="material-symbols-outlined">remove</span>Tạo phiếu chi</button>
                        </div>
                    </div>
                    <div class="card-body">
                        <div id="so-quy-filters" style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px; padding: 15px; background-color: var(--light-color); border-radius: var(--border-radius);">
                            <div>
                                <label>Thời gian:</label>
                                <select id="date-filter-preset" class="btn" style="border: 1px solid var(--border-color);">
                                    <option value="today">Hôm nay</option>
                                    <option value="this_week">Tuần này</option>
                                    <option value="this_month">Tháng này</option>
                                    <option value="custom">Tùy chọn</option>
                                </select>
                            </div>
                            <div id="custom-date-range" class="hidden" style="display: flex; gap: 10px; align-items: center;">
                                <input type="date" id="start-date-filter" value="${todayStr}">
                                <span>-</span>
                                <input type="date" id="end-date-filter" value="${todayStr}">
                            </div>
                            <div>
                                <label>Hình thức:</label>
                                <select id="method-filter" class="btn" style="border: 1px solid var(--border-color);">
                                    <option value="all">Tất cả</option>
                                    <option value="Tiền mặt">Tiền mặt</option>
                                    <option value="Tài khoản">Tài khoản</option>
                                </select>
                            </div>
                        </div>
                        <div id="so-quy-content"></div>
                    </div>
                </div>
            `;

            const datePreset = document.getElementById('date-filter-preset');
            const customDateRange = document.getElementById('custom-date-range');
            
            const updateDateInputs = () => {
                const val = datePreset.value;
                const today = new Date();
                let start = new Date();
                let end = new Date();

                if (val === 'today') {
                    // Start and end are today
                } else if (val === 'this_week') {
                    const day = today.getDay();
                    start.setDate(today.getDate() - day + (day === 0 ? -6 : 1)); // Monday
                } else if (val === 'this_month') {
                    start = new Date(today.getFullYear(), today.getMonth(), 1);
                }
                
                customDateRange.classList.toggle('hidden', val !== 'custom');
                document.getElementById('start-date-filter').valueAsDate = start;
                document.getElementById('end-date-filter').valueAsDate = end;
                applyFilters();
            };

            datePreset.addEventListener('change', updateDateInputs);
            document.getElementById('method-filter').addEventListener('change', applyFilters);
            document.getElementById('start-date-filter').addEventListener('change', applyFilters);
            document.getElementById('end-date-filter').addEventListener('change', applyFilters);
            
            document.getElementById('btn-tao-phieu-thu').addEventListener('click', () => showPhieuThuChiModal('Thu'));
            document.getElementById('btn-tao-phieu-chi').addEventListener('click', () => showPhieuThuChiModal('Chi'));
            
            updateDateInputs(); // Initial render

        } catch (e) {
            mainContent.innerHTML = `<div class="card" style="color: var(--danger-color);"><p><strong>Lỗi tải dữ liệu sổ quỹ:</strong> ${e.message}</p></div>`;
        }
    }

    function showPhieuThuChiModal(loaiPhieu) {
        const modalContent = `
            <form id="phieu-thu-chi-form">
                <div class="input-group">
                    <label for="hinh-thuc">Hình thức thanh toán</label>
                    <select id="hinh-thuc" required>
                        <option value="Tiền mặt">Tiền mặt</option>
                        <option value="Tài khoản">Tài khoản</option>
                    </select>
                </div>
                <div class="input-group">
                    <label for="so-tien">Số tiền</label>
                    <input type="number" id="so-tien" min="1" required>
                </div>
                <div class="input-group">
                    <label for="noi-dung">Nội dung</label>
                    <textarea id="noi-dung" rows="3" required></textarea>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="window.app.hideModal()">Hủy</button>
                    <button type="submit" class="btn btn-primary">Lưu</button>
                </div>
            </form>
        `;
        showModal(`Tạo Phiếu ${loaiPhieu}`, modalContent);

        document.getElementById('phieu-thu-chi-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            try {
                const phieuData = {
                    LoaiPhieu: loaiPhieu,
                    SoTien: parseFloat(document.getElementById('so-tien').value),
                    NoiDung: document.getElementById('noi-dung').value,
                    HinhThucThanhToan: document.getElementById('hinh-thuc').value,
                };
                await callAppsScript('addPhieuThuChi', phieuData);
                showToast(`Tạo phiếu ${loaiPhieu} thành công!`, 'success');
                hideModal();
                invalidateCache('SoQuy');
                renderSoQuy();
            } catch (error) {
                showToast(`Lỗi: ${error.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }

    return {
        baocao: renderBaoCao,
        soquy: renderSoQuy,
    };
}