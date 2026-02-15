function initializePharmacyModule(app) {
    const { callAppsScript, getCachedDanhMuc, showToast, showModal, hideModal, invalidateCache, generateOptions, state: appState } = app;
    const mainContent = document.getElementById('main-content');
    const pageTitle = document.getElementById('page-title');

    const removeDiacritics = (str) => {
        if (!str) return '';
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
    };

    // --- PAGE RENDERERS ---
    const updatePageTitle = (title) => pageTitle.textContent = title;

    function generatePrintPage(printConfig, pageLayout) {
        const { tenNhaThuoc, startPosition, items } = printConfig;
        const { 
            pageWidth, pageHeight, 
            marginTop, marginBottom, marginLeft, marginRight, 
            gap, 
            labelWidth, labelHeight 
        } = pageLayout;
    
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            showToast('Popup bị chặn. Vui lòng cho phép popup để in tem.', 'error');
            return;
        }
    
        const labelsToPrint = [];
        items.forEach(item => {
            for (let i = 0; i < item.quantity; i++) {
                labelsToPrint.push(item);
            }
        });

        // Calculate number of columns dynamically
        const printablePageWidth = pageWidth - marginLeft - marginRight;
        const labelWidthWithGap = labelWidth + gap;
        const numColumns = Math.floor(printablePageWidth / labelWidthWithGap);
    
        const printStyles = `
            @media print {
                @page {
                    size: ${pageWidth}mm ${pageHeight.toLowerCase() === 'auto' ? 'auto' : pageHeight + 'mm'};
                    margin: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;
                }
                body {
                    margin: 0;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
            }
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
            }
            .label-grid {
                display: grid;
                grid-template-columns: repeat(${numColumns}, ${labelWidth}mm);
                gap: ${gap}mm;
                justify-content: start;
                align-content: start;
                width: 100%;
                box-sizing: border-box;
            }
            .label-item, .empty-label {
                width: ${labelWidth}mm;
                height: ${labelHeight}mm;
                box-sizing: border-box;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
                page-break-inside: avoid;
                border: 1px dotted #ccc; /* For preview, hidden in print */
            }
            @media print {
                 .label-item, .empty-label {
                    border: none;
                 }
            }
            .label-item .pharmacy-name { font-size: 6pt; margin: 0; }
            .label-item .product-name { font-size: 6pt; font-weight: bold; margin: 1px 0; line-height: 1.1; }
            .label-item .price { font-size: 8pt; font-weight: bold; margin: 1px 0; }
            .label-item .barcode-container { height: 10mm; display: flex; align-items: center; justify-content: center; margin-top: auto; }
            .label-item .note { font-size: 6pt; margin: 0; font-style: italic; }
        `;
        
        let gridItemsHtml = '';
        for (let i = 1; i < startPosition; i++) {
            gridItemsHtml += '<div class="empty-label"></div>';
        }
    
        labelsToPrint.forEach(label => {
            gridItemsHtml += `
                <div class="label-item">
                    <p class="pharmacy-name">${tenNhaThuoc}</p>
                    <p class="product-name">${label.tenThuoc}</p>
                    <p class="price">${label.giaBan.toLocaleString('vi-VN')}đ</p>
                    <div class="barcode-container">
                        <svg class="barcode" data-value="${label.barcodeData}"></svg>
                    </div>
                    <p class="note">${label.ghiChu}</p>
                </div>
            `;
        });
    
        printWindow.document.write(`
            <html>
                <head>
                    <title>In Tem Nhãn</title>
                    <style>${printStyles}</style>
                    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
                </head>
                <body>
                    <div class="label-grid">${gridItemsHtml}</div>
                    <script>
                        document.addEventListener('DOMContentLoaded', () => {
                            try {
                                document.querySelectorAll('.barcode').forEach(element => {
                                    const value = element.dataset.value;
                                    if (value) {
                                        JsBarcode(element, value, {
                                            format: "CODE128",
                                            height: 20,
                                            width: 1.0,
                                            displayValue: false,
                                            margin: 0.5
                                        });
                                    }
                                });
                                setTimeout(() => {
                                    window.print();
                                    window.close();
                                }, 300);
                            } catch(e) {
                                document.body.innerHTML = '<h1>Lỗi tạo mã vạch</h1><p>' + e.message + '</p><p>Vui lòng đảm bảo kết nối mạng và thử lại.</p>';
                            }
                        });
                    <\/script>
                </body>
            </html>
        `);
        printWindow.document.close();
    }
    
    async function showPrintLabelConfigModal(maPhieuNhap) {
        showModal('Cấu hình In tem', '<p>Đang tải thông tin phiếu nhập...</p>', { size: '900px' });
    
        try {
            const [{ chiTiet }, danhMucThuoc, donViQuyDoi, settings] = await Promise.all([
                callAppsScript('getPhieuNhapDetail', { maPhieuNhap }),
                getCachedDanhMuc('DanhMucThuoc'),
                getCachedDanhMuc('DonViQuyDoi'),
                appState.cache['appSettings'] ? Promise.resolve(appState.cache['appSettings']) : callAppsScript('getAppSettings')
            ]);
    
            if (!chiTiet || chiTiet.length === 0) {
                hideModal();
                showToast('Phiếu nhập này không có sản phẩm nào.', 'warning');
                return;
            }
    
            const itemsForConfig = chiTiet.map(item => {
                const thuoc = danhMucThuoc.find(t => t.MaThuoc === item.MaThuoc);
                if (!thuoc) return null;
    
                const allUnitsForThuoc = donViQuyDoi.filter(dv => dv.MaThuoc === item.MaThuoc);
                const unitUsedInPurchase = allUnitsForThuoc.find(dv => dv.DonViTinh === item.DonViNhap);
                
                let baseUnit = allUnitsForThuoc.find(dv => dv.TyLeQuyDoi === 1);
                if (!baseUnit) {
                     baseUnit = allUnitsForThuoc.find(dv => dv.DonViTinh === thuoc.DonViCoSo) || { GiaBan: 0, MaVach: '' };
                }
    
                const defaultLabelCount = (item.SoLuongNhap || 0) * (unitUsedInPurchase?.TyLeQuyDoi || 1);
                const sellingPrice = baseUnit.GiaBan || 0;
                const barcodeData = baseUnit.MaVach || thuoc.MaThuoc;
    
                const otherUnits = allUnitsForThuoc.filter(dv => dv.TyLeQuyDoi > 1);
                const ghiChu = otherUnits.map(u => `1 ${u.DonViTinh}: ${u.GiaBan.toLocaleString('vi-VN')}đ`).join(', ');
    
                return {
                    maThuoc: item.MaThuoc,
                    tenThuoc: thuoc.TenThuoc,
                    donViNhap: item.DonViNhap,
                    defaultQty: defaultLabelCount,
                    giaBan: sellingPrice,
                    ghiChu: ghiChu,
                    barcodeData: barcodeData,
                    donViCoSo: thuoc.DonViCoSo
                };
            }).filter(Boolean);
    
            const tableRowsHtml = itemsForConfig.map((item, index) => `
                <tr data-index="${index}">
                    <td>${item.tenThuoc} (${item.donViNhap})</td>
                    <td>${item.giaBan.toLocaleString('vi-VN')}đ / ${item.donViCoSo}</td>
                    <td><input type="number" class="label-qty" value="${item.defaultQty}" min="0" style="width: 80px; padding: 3px;"></td>
                    <td><input type="text" class="label-note" value="${item.ghiChu}" style="width: 100%; padding: 3px;"></td>
                </tr>
            `).join('');
    
            const modalContent = `
                <div class="input-group" style="max-width: 250px;">
                    <label for="start-position">Vị trí bắt đầu in trên trang</label>
                    <input type="number" id="start-position" value="1" min="1" style="padding: 8px;">
                </div>
                <p>Chỉnh sửa số lượng tem cần in cho mỗi sản phẩm:</p>
                <div class="table-wrapper" style="max-height: 400px; overflow-y: auto;">
                    <table id="label-config-table">
                        <thead>
                            <tr>
                                <th>Tên sản phẩm</th>
                                <th>Giá bán (đơn vị lẻ)</th>
                                <th>Số lượng tem</th>
                                <th>Ghi chú (hiển thị trên tem)</th>
                            </tr>
                        </thead>
                        <tbody>${tableRowsHtml}</tbody>
                    </table>
                </div>

                <hr style="margin: 20px 0;">
                <h4 style="margin-bottom: 15px;">Tùy chỉnh bố cục trang in (đang dùng cấu hình đã lưu)</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div class="input-group"><label for="print-page-width">Rộng trang (mm)</label><input type="number" id="print-page-width" value="${settings.print_pageWidth || '110'}"></div>
                    <div class="input-group"><label for="print-page-height">Cao trang (mm hoặc 'auto')</label><input type="text" id="print-page-height" value="${settings.print_pageHeight || 'auto'}"></div>
                    <div class="input-group"><label for="print-margin-top">Lề trên (mm)</label><input type="number" id="print-margin-top" value="${settings.print_marginTop || '2'}"></div>
                    <div class="input-group"><label for="print-margin-bottom">Lề dưới (mm)</label><input type="number" id="print-margin-bottom" value="${settings.print_marginBottom || '1'}"></div>
                    <div class="input-group"><label for="print-margin-left">Lề trái (mm)</label><input type="number" id="print-margin-left" value="${settings.print_marginLeft || '3'}"></div>
                    <div class="input-group"><label for="print-margin-right">Lề phải (mm)</label><input type="number" id="print-margin-right" value="${settings.print_marginRight || '2'}"></div>
                    <div class="input-group"><label for="print-gap">Khoảng cách tem (mm)</label><input type="number" id="print-gap" value="${settings.print_gap || '3'}"></div>
                </div>
                
                <hr style="margin: 20px 0;">
                <h4 style="margin-bottom: 15px;">Tùy chỉnh kích thước tem</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div class="input-group"><label for="print-label-width">Rộng tem (mm)</label><input type="number" id="print-label-width" value="${settings.print_labelWidth || '32'}"></div>
                    <div class="input-group"><label for="print-label-height">Cao tem (mm)</label><input type="number" id="print-label-height" value="${settings.print_labelHeight || '16'}"></div>
                </div>

                <div style="text-align: right; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="window.app.hideModal()">Hủy</button>
                    <button type="button" class="btn btn-primary" id="generate-print-page-btn">Tạo trang in</button>
                </div>
            `;
            
            document.getElementById('modal-body').innerHTML = `<h2>Cấu hình In tem</h2>` + modalContent;
    
            document.getElementById('generate-print-page-btn').addEventListener('click', () => {
                const startPosition = parseInt(document.getElementById('start-position').value, 10) || 1;
                const tableRows = document.querySelectorAll('#label-config-table tbody tr');
    
                const itemsToPrint = Array.from(tableRows).map(row => {
                    const index = parseInt(row.dataset.index, 10);
                    const originalItem = itemsForConfig[index];
                    const quantity = parseInt(row.querySelector('.label-qty').value, 10) || 0;
                    const ghiChu = row.querySelector('.label-note').value.trim();
    
                    if (quantity <= 0) return null;
    
                    return {
                        ...originalItem,
                        quantity: quantity,
                        ghiChu: ghiChu
                    };
                }).filter(Boolean);
    
                if (itemsToPrint.length === 0) {
                    showToast('Không có tem nào được chọn để in.', 'warning');
                    return;
                }
    
                const printConfig = {
                    tenNhaThuoc: settings.TenNhaThuoc || 'Nhà Thuốc',
                    startPosition: startPosition,
                    items: itemsToPrint
                };

                const pageLayout = {
                    pageWidth: parseFloat(document.getElementById('print-page-width').value) || 110,
                    pageHeight: document.getElementById('print-page-height').value || 'auto',
                    marginTop: parseFloat(document.getElementById('print-margin-top').value) || 0,
                    marginBottom: parseFloat(document.getElementById('print-margin-bottom').value) || 0,
                    marginLeft: parseFloat(document.getElementById('print-margin-left').value) || 0,
                    marginRight: parseFloat(document.getElementById('print-margin-right').value) || 0,
                    gap: parseFloat(document.getElementById('print-gap').value) || 2,
                    labelWidth: parseFloat(document.getElementById('print-label-width').value) || 30,
                    labelHeight: parseFloat(document.getElementById('print-label-height').value) || 18,
                };
                
                generatePrintPage(printConfig, pageLayout);
                hideModal();
            });
    
        } catch (error) {
            hideModal();
            showToast(`Lỗi khi chuẩn bị in tem: ${error.message}`, 'error');
            console.error(error);
        }
    }

    const renderPlaceholder = (title, description) => {
        updatePageTitle(title);
        mainContent.innerHTML = `<div class="card"><div class="card-header"><h3>${title}</h3></div><div class="card-body"><p>${description}</p><p>Chức năng này đang được phát triển.</p></div></div>`;
    };

    async function renderDashboard(forceRefresh = false) {
        // FIX: Ensure forceRefresh is a strict boolean, not a truthy object from the router.
        const isForced = forceRefresh === true;
    
        updatePageTitle('Tổng quan');
    
        const render = (data) => {
             mainContent.innerHTML = `
                <div style="display: flex; justify-content: flex-end; margin-bottom: -10px;">
                     <button id="refresh-dashboard-btn" class="btn btn-secondary" title="Làm mới" style="background: none; border: none; color: var(--secondary-color); font-size: 1.5rem; padding: 5px;">
                        <span class="material-symbols-outlined">refresh</span>
                     </button>
                </div>
                <div class="grid-container">
                    <div class="stat-card sales">
                        <div class="icon"><span class="material-symbols-outlined">receipt</span></div>
                        <div class="info"><h4>${data.totalSales}</h4><p>Hóa đơn hôm nay</p></div>
                    </div>
                    <div class="stat-card revenue">
                        <div class="icon"><span class="material-symbols-outlined">payments</span></div>
                        <div class="info"><h4>${data.totalRevenue}</h4><p>Doanh thu hôm nay</p></div>
                    </div>
                    <div class="stat-card expired">
                        <div class="icon"><span class="material-symbols-outlined">medication</span></div>
                        <div class="info"><h4>${data.expiredDrugs}</h4><p>Thuốc sắp hết hạn</p></div>
                    </div>
                    <div class="stat-card low-stock">
                        <div class="icon"><span class="material-symbols-outlined">production_quantity_limits</span></div>
                        <div class="info"><h4>${data.lowStockDrugs}</h4><p>Thuốc sắp hết hàng</p></div>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header"><h3>Hóa đơn gần đây</h3></div>
                    <div class="card-body table-wrapper">
                        <table>
                            <thead><tr><th>Mã HĐ</th><th>Khách hàng</th><th>Tổng tiền</th><th>Ngày bán</th></tr></thead>
                            <tbody>
                                ${data.recentInvoices.map(inv => `
                                    <tr>
                                        <td>${inv.MaHoaDon}</td>
                                        <td>${inv.MaKhachHang}</td>
                                        <td>${inv.ThanhTien.toLocaleString('vi-VN')}đ</td>
                                        <td>${new Date(inv.NgayBan).toLocaleDateString('vi-VN')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            document.getElementById('refresh-dashboard-btn').addEventListener('click', () => renderDashboard(true));
        };
    
        if (!isForced && appState.cache.dashboardData) {
            render(appState.cache.dashboardData);
            return;
        }
    
        mainContent.innerHTML = `<p>Đang tải dữ liệu...</p>`;
        
        try {
            const data = await callAppsScript('getDashboardData');
            appState.cache.dashboardData = data;
            render(data);
        } catch (error) {
            mainContent.innerHTML = `<div class="card" style="color: var(--danger-color);"><p><strong>Lỗi khi tải dữ liệu trang tổng quan:</strong> ${error.message}</p></div>`;
        }
    }
    
    async function renderDanhSachThuocKho() {
        updatePageTitle('Danh sách thuốc trong kho');
        mainContent.innerHTML = `<div class="card"><p>Đang tải dữ liệu kho...</p></div>`;
        try {
            const inventorySummary = await callAppsScript('getInventorySummary');

            mainContent.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <h3>Danh sách thuốc trong kho</h3>
                    </div>
                    <div class="card-body table-wrapper">
                        <table>
                            <thead><tr><th>Mã thuốc</th><th>Tên thuốc</th><th>Tổng tồn kho</th><th>Đơn vị cơ sở</th><th>Hành động</th></tr></thead>
                            <tbody>
                                ${inventorySummary.map(item => `
                                    <tr>
                                        <td>${item.MaThuoc}</td>
                                        <td>${item.TenThuoc}</td>
                                        <td>${item.tongTon}</td>
                                        <td>${item.DonViCoSo}</td>
                                        <td><button class="btn btn-secondary btn-view-detail" data-ma-thuoc="${item.MaThuoc}">Xem chi tiết</button></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            document.querySelectorAll('.btn-view-detail').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const maThuoc = e.currentTarget.dataset.maThuoc;
                    const thuoc = (await getCachedDanhMuc('DanhMucThuoc')).find(t => t.MaThuoc === maThuoc);
                    const chiTietTonKho = await callAppsScript('getInventoryDetail', { maThuoc });
                    const content = `
                        <div class="table-wrapper">
                            <table>
                                <thead><tr><th>Số lô</th><th>Số lượng</th><th>Hạn sử dụng</th></tr></thead>
                                <tbody>
                                ${chiTietTonKho.map(k => `
                                    <tr><td>${k.SoLo}</td><td>${k.SoLuong} ${thuoc.DonViCoSo}</td><td>${new Date(k.HanSuDung).toLocaleDateString('vi-VN')}</td></tr>
                                `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;
                    showModal(`Chi tiết tồn kho: ${thuoc.TenThuoc}`, content);
                });
            });
        } catch (error) {
            mainContent.innerHTML = `<div class="card" style="color: var(--danger-color);"><p><strong>Lỗi tải dữ liệu kho:</strong> ${error.message}</p></div>`;
        }
    }
    
    async function renderDanhSachPhieuNhap() {
        updatePageTitle('Danh sách phiếu nhập kho');
        mainContent.innerHTML = `<div class="card"><p>Đang tải dữ liệu...</p></div>`;
        try {
            // Sử dụng cache. Sẽ chỉ gọi API ở lần đầu tiên, các lần sau sẽ lấy từ cache.
            const [phieuNhapList, nccList] = await Promise.all([
                getCachedDanhMuc('PhieuNhap'), 
                getCachedDanhMuc('DanhMucNhaCungCap')
            ]);
            
            const nccMap = new Map(nccList.map(ncc => [ncc.MaNhaCungCap, ncc.TenNhaCungCap]));

            mainContent.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <h3>Danh sách phiếu nhập kho</h3>
                        <button class="btn btn-primary" id="btn-nhap-kho">Tạo Phiếu Nhập Kho</button>
                    </div>
                    <div class="card-body table-wrapper">
                        <table>
                            <thead><tr><th>Mã PN</th><th>Ngày nhập</th><th>Nhà cung cấp</th><th>Tổng tiền</th><th>Trạng thái</th><th class="action-cell">Hành động</th></tr></thead>
                            <tbody id="phieu-nhap-table-body">
                                ${phieuNhapList.sort((a, b) => new Date(b.NgayNhap) - new Date(a.NgayNhap)).map(pn => `
                                    <tr data-ma-pn="${pn.MaPhieuNhap}">
                                        <td>${pn.MaPhieuNhap}</td>
                                        <td>${new Date(pn.NgayNhap).toLocaleString('vi-VN')}</td>
                                        <td>${nccMap.get(pn.MaNhaCungCap) || pn.MaNhaCungCap}</td>
                                        <td>${(pn.TongTien || 0).toLocaleString('vi-VN')}đ</td>
                                        <td>${pn.TrangThaiThanhToan || 'N/A'}</td>
                                        <td class="action-cell">
                                            <div class="action-menu">
                                                <button class="btn-actions"><span class="material-symbols-outlined">more_vert</span></button>
                                                <div class="action-menu-dropdown">
                                                    <a href="#" class="action-item" data-action="view"><span class="material-symbols-outlined">visibility</span>Xem chi tiết</a>
                                                    <a href="#" class="action-item" data-action="print"><span class="material-symbols-outlined">print</span>In phiếu</a>
                                                    <a href="#" class="action-item" data-action="print-labels"><span class="material-symbols-outlined">label</span>In tem nhãn</a>
                                                    <a href="#" class="action-item" data-action="edit"><span class="material-symbols-outlined">edit</span>Sửa phiếu</a>
                                                    <a href="#" class="action-item" data-action="delete"><span class="material-symbols-outlined">delete</span>Xóa phiếu</a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            document.getElementById('btn-nhap-kho').addEventListener('click', () => {
                window.location.hash = 'nhapkho';
            });

            document.getElementById('phieu-nhap-table-body').addEventListener('click', e => {
                if (e.target.closest('.action-item')) {
                    e.preventDefault();
                    const actionItem = e.target.closest('.action-item');
                    const action = actionItem.dataset.action;
                    const maPN = actionItem.closest('tr').dataset.maPn;
                    handlePhieuNhapAction(action, maPN);
                }
            });

        } catch (error) {
             mainContent.innerHTML = `<div class="card" style="color: var(--danger-color);"><p><strong>Lỗi tải dữ liệu phiếu nhập:</strong> ${error.message}</p></div>`;
        }
    }
    
    const handlePhieuNhapAction = async (action, maPhieuNhap) => {
        switch (action) {
            case 'view':
                const modalContent = await renderPhieuNhapDetailForModal(maPhieuNhap);
                showModal(`Chi tiết phiếu nhập ${maPhieuNhap}`, modalContent, { size: '800px' });
                break;
            case 'print-labels':
                showPrintLabelConfigModal(maPhieuNhap);
                break;
            case 'print':
                printPhieuNhap(maPhieuNhap);
                break;
            case 'edit':
                window.location.hash = `nhapkho-edit?id=${maPhieuNhap}`;
                break;
            case 'delete':
                showToast('Chức năng "Xóa phiếu" đang được phát triển.', 'info');
                break;
        }
    };

    async function renderNhapKhoForm(editData = null) {
        const isEditMode = editData !== null;
        updatePageTitle(isEditMode ? `Sửa Phiếu Nhập Kho: ${editData.phieuNhap.MaPhieuNhap}` : 'Tạo Phiếu Nhập Kho');
        mainContent.innerHTML = `<div class="card"><p>Đang tải dữ liệu...</p></div>`;
    
        let receiptItems = [];
        let isTyLeManuallyEdited = false;
        let blockNextSoLoEnter = false;
    
        let danhMucNCC, danhMucThuoc, donViQuyDoi, danhMucDVT, danhMucNHH;
        try {
            [danhMucNCC, danhMucThuoc, donViQuyDoi, danhMucDVT, danhMucNHH] = await Promise.all([
                getCachedDanhMuc('DanhMucNhaCungCap'),
                getCachedDanhMuc('DanhMucThuoc'),
                getCachedDanhMuc('DonViQuyDoi'),
                getCachedDanhMuc('DMDonViTinh'),
                getCachedDanhMuc('DMNhomHangHoa')
            ]);
        } catch (error) {
            mainContent.innerHTML = `<div class="card" style="color:var(--danger-color)">Lỗi tải dữ liệu cần thiết: ${error.message}</div>`;
            return;
        }
    
        const getThuocName = (maThuoc) => danhMucThuoc.find(t => t.MaThuoc === maThuoc)?.TenThuoc || 'Không rõ';
    
        const pageContent = `
            <form id="nhap-kho-form">
                <div class="card">
                    <div class="card-header"><h3>Thông tin chung</h3></div>
                    <div class="card-body" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                        <div class="input-group">
                            <label for="ncc-select">Nhà cung cấp <span style="color:red;">*</span></label>
                            <select id="ncc-select" required></select>
                        </div>
                        <div class="input-group">
                            <label for="so-hoa-don-ncc">Số hóa đơn NCC</label>
                            <input type="text" id="so-hoa-don-ncc">
                        </div>
                        <div class="input-group">
                            <label for="ngay-hoa-don">Ngày hóa đơn</label>
                            <input type="date" id="ngay-hoa-don">
                        </div>
                         <div class="input-group">
                            <label for="trang-thai-thanh-toan-nhap">Trạng thái thanh toán</label>
                            <select id="trang-thai-thanh-toan-nhap">
                                <option value="Đã thanh toán">Đã thanh toán</option>
                                <option value="Chưa thanh toán">Chưa thanh toán</option>
                            </select>
                        </div>
                    </div>
                </div>
    
                <div class="pos-layout" style="align-items: flex-start;">
                    <div class="pos-main">
                        <div class="card">
                            <div class="card-body">
                                <div id="product-details-form" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; align-items: end;">
                                    <div class="input-group" style="grid-column: 1 / -1; position: relative;">
                                        <label for="item-thuoc-search">Hàng hóa <span style="color:red;">*</span></label>
                                        <div style="display: flex;">
                                            <input type="text" id="item-thuoc-search" placeholder="Nhập từ khóa hoặc quét mã vạch..." autocomplete="off" style="flex-grow: 1; border-radius: 6px 0 0 6px;">
                                            <button type="button" id="clear-thuoc-selection" class="btn btn-danger" style="border-radius: 0 6px 6px 0; padding: 10px 12px; display: flex; align-items: center;">&times;</button>
                                        </div>
                                        <input type="hidden" id="item-thuoc-select">
                                        <div id="thuoc-suggestions" class="suggestions-dropdown" style="display:none;"></div>
                                    </div>
                                    <div class="input-group">
                                        <label>Nhóm hàng hóa</label>
                                        <select id="nhom-hang-hoa" disabled></select>
                                    </div>
                                    <div class="input-group"><label>Hoạt chất chính</label><input type="text" id="hoat-chat" disabled></div>
                                    <div class="input-group"><label>Hàm lượng</label><input type="text" id="ham-luong" disabled></div>
                                    <div class="input-group"><label>Số đăng ký</label><input type="text" id="so-dang-ky" disabled></div>
                                    <div class="input-group"><label>Hãng sản xuất</label><input type="text" id="hang-san-xuat" disabled></div>
                                    <div class="input-group"><label>Nước sản xuất</label><input type="text" id="nuoc-san-xuat" disabled></div>
                                    <div class="input-group"><label>Quy cách đóng gói</label><input type="text" id="quy-cach" disabled></div>
                                    <div class="input-group"><label for="don-vi-co-ban">Đơn vị cơ bản <span style="color:red;">*</span></label><select id="don-vi-co-ban" disabled></select></div>
                                    <div class="input-group"><label for="don-vi-nhap">Đơn vị nhập <span style="color:red;">*</span></label><select id="don-vi-nhap"><option>Chọn đơn vị tính</option></select></div>
                                    <div class="input-group"><label>Tỷ lệ quy đổi <span style="color:red;">*</span></label><input type="number" id="ty-le-quy-doi" value="1"></div>
                                    <div class="input-group"><label for="so-lo">Số lô <span style="color:red;">*</span></label><input type="text" id="so-lo"></div>
                                    <div class="input-group"><label for="han-su-dung">Hạn sử dụng <span style="color:red;">*</span></label><input type="date" id="han-su-dung"></div>
                                    <div class="input-group"><label for="so-luong-nhap">Số lượng nhập <span style="color:red;">*</span></label><input type="number" id="so-luong-nhap" min="1" value="1"></div>
                                    <div class="input-group"><label for="don-gia-nhap">Đơn giá nhập</label><input type="number" id="don-gia-nhap" min="0" value="0"></div>
                                    <div class="input-group"><label for="tong-chiet-khau">Tổng chiết khấu</label><input type="number" id="tong-chiet-khau" min="0" value="0"></div>
                                    <div class="input-group"><label for="vat-nhap">VAT (nhập)</label><input type="number" id="vat-nhap" min="0" value="0"></div>
                                    <div class="input-group"><label>Thành tiền</label><input type="text" id="thanh-tien" value="0" style="background-color: #e9ecef; text-align: right;" readonly></div>
                                </div>
                                <div id="unit-definition-section" style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 20px;">
                                    <h5 style="margin-bottom: 10px; font-size: 1rem;">Danh sách đơn vị tính</h5>
                                    <div class="table-wrapper">
                                        <table style="font-size: 0.9rem;">
                                            <thead style="background-color: #f8f9fa;">
                                                <tr><th>Tên đơn vị <span style="color:red;">*</span></th><th>Quy đổi <span style="color:red;">*</span></th><th>Giá bán</th><th>Mã vạch</th><th></th></tr>
                                            </thead>
                                            <tbody id="unit-definition-tbody">
                                                <!-- Rows will be generated by JS -->
                                            </tbody>
                                        </table>
                                    </div>
                                    <button type="button" id="add-unit-row-btn" class="btn" style="margin-top: 10px; padding: 5px 10px;">+ Thêm đơn vị tính</button>
                                </div>
                                <div style="text-align: right; margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 20px;">
                                    <button type="button" class="btn btn-primary" id="add-item-btn">Thêm vào phiếu</button>
                                </div>
                            </div>
                        </div>
                    </div>
                     <div class="pos-sidebar">
                        <div class="card">
                            <div class="card-header"><h4>Danh sách hàng hóa</h4></div>
                            <div class="card-body">
                                <div id="receipt-items-list" class="table-wrapper" style="min-height: 200px;"><p>Chưa có hàng hóa.</p></div>
                                <div class="receipt-totals" style="padding-top: 15px; border-top: 1px solid var(--border-color);">
                                    <div style="display:flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.95rem;"><span>Tổng tiền hàng:</span><span id="receipt-subtotal">0đ</span></div>
                                    <div style="display:flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.95rem;"><span>Tổng VAT:</span><span id="receipt-vat">0đ</span></div>
                                    <div class="invoice-total" style="display:flex; justify-content: space-between; margin-top: 12px;">
                                        <strong>Tổng thanh toán:</strong>
                                        <strong id="receipt-grand-total">0đ</strong>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
    
                <div class="card">
                    <div class="card-body" style="text-align: right;">
                        <button type="button" class="btn btn-secondary" id="cancel-receipt-btn" style="margin-right: 10px;">Hủy</button>
                        <button type="submit" class="btn btn-primary" id="save-receipt-btn">
                            ${isEditMode ? 'Cập nhật phiếu nhập' : 'Lưu Phiếu Nhập'}
                        </button>
                    </div>
                </div>
            </form>
        `;
        mainContent.innerHTML = pageContent;

        const nccSelect = document.getElementById('ncc-select');
        nccSelect.innerHTML = `<option value="">-- Chọn nhà cung cấp --</option>
            ${generateOptions(danhMucNCC, 'MaNhaCungCap', 'TenNhaCungCap', isEditMode ? editData.phieuNhap.MaNhaCungCap : null, 'Thêm mới nhà cung cấp...')}
        `;
        
        const nhomHangHoaSelect = document.getElementById('nhom-hang-hoa');
        nhomHangHoaSelect.innerHTML = `<option value="">-- Chọn nhóm hàng hóa --</option>
            ${generateOptions(danhMucNHH, 'TenNhomHangHoa', 'TenNhomHangHoa', null)}`;

        const soHoaDonNCCInput = document.getElementById('so-hoa-don-ncc');
        const ngayHoaDonInput = document.getElementById('ngay-hoa-don');
        const trangThaiTTInput = document.getElementById('trang-thai-thanh-toan-nhap');

        if (isEditMode) {
            soHoaDonNCCInput.value = editData.phieuNhap.SoHoaDonNCC || '';
            ngayHoaDonInput.value = editData.phieuNhap.NgayHoaDon ? new Date(editData.phieuNhap.NgayHoaDon).toISOString().split('T')[0] : '';
            trangThaiTTInput.value = editData.phieuNhap.TrangThaiThanhToan || 'Đã thanh toán';

            // Map chiTiet to receiptItems
            receiptItems = editData.chiTiet.map(item => {
                const donVi = donViQuyDoi.find(dv => dv.MaThuoc === item.MaThuoc && dv.DonViTinh === item.DonViNhap);
                const tyLe = donVi ? donVi.TyLeQuyDoi : 1;
                return {
                    MaThuoc: item.MaThuoc,
                    DonViNhap: item.DonViNhap,
                    SoLuongNhap: item.SoLuongNhap,
                    DonGiaNhap: item.DonGiaNhap,
                    SoLo: item.SoLo,
                    HanSuDung: new Date(item.HanSuDung).toISOString().split('T')[0],
                    chietKhau: 0, // Chiết khấu không được lưu, giả định là 0 khi sửa
                    vat: item.VAT || item.vat || 0,
                    ThanhTien: item.ThanhTien,
                    soLuongQuyDoi: item.SoLuongNhap * tyLe,
                    donViQuyDoiUpdates: [] // Không cần update DVQĐ khi sửa
                };
            });

        } else {
            const today = new Date().toISOString().split('T')[0];
            ngayHoaDonInput.value = today;
        }
    
        const receiptItemsListEl = document.getElementById('receipt-items-list');
        const receiptSubtotalEl = document.getElementById('receipt-subtotal');
        const receiptVatEl = document.getElementById('receipt-vat');
        const receiptGrandTotalEl = document.getElementById('receipt-grand-total');
        const thuocSearchInput = document.getElementById('item-thuoc-search');
        const thuocHiddenInput = document.getElementById('item-thuoc-select');
        const thuocSuggestionsDiv = document.getElementById('thuoc-suggestions');
        const unitTbody = document.getElementById('unit-definition-tbody');

        const updateItemSubtotal = () => {
            const soLuong = parseFloat(document.getElementById('so-luong-nhap').value) || 0;
            const donGia = parseFloat(document.getElementById('don-gia-nhap').value) || 0;
            const chietKhau = parseFloat(document.getElementById('tong-chiet-khau').value) || 0;
            const vat = parseFloat(document.getElementById('vat-nhap').value) || 0;
            const tienHang = soLuong * donGia;
            const tienTruocThue = tienHang - chietKhau;
            const tienVat = tienTruocThue * (vat / 100);
            const thanhTien = tienTruocThue + tienVat;
            document.getElementById('thanh-tien').value = isNaN(thanhTien) ? '0đ' : thanhTien.toLocaleString('vi-VN') + 'đ';
        };
        
        const addUnitRow = (unit = { DonViTinh: '', TyLeQuyDoi: 1, GiaBan: 0, MaVach: '' }) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="text" class="unit-name" value="${unit.DonViTinh}" placeholder="Vd: Vỉ" style="padding: 8px; width: 100px;"></td>
                <td><input type="number" class="unit-rate" value="${unit.TyLeQuyDoi}" min="1" style="width: 70px; padding: 8px;"></td>
                <td><input type="number" class="unit-price" value="${unit.GiaBan}" min="0" style="width: 100px; padding: 8px;"></td>
                <td><input type="text" class="unit-barcode" value="${unit.MaVach}" placeholder="Để trống để tự tạo" style="padding: 8px;"></td>
                <td><button type="button" class="btn-remove-unit" style="background:none; border:none; color:var(--danger-color); cursor:pointer; font-size: 1.5rem; line-height: 1;">&times;</button></td>
            `;
            unitTbody.appendChild(tr);
            tr.querySelector('.btn-remove-unit').addEventListener('click', () => tr.remove());
        };

        const showAddNewUnitModal = () => {
            const baseUnit = document.getElementById('don-vi-co-ban').value;
            if (!baseUnit) {
                showToast('Vui lòng chọn một sản phẩm trước khi thêm đơn vị mới.', 'error');
                const donViNhapSelect = document.getElementById('don-vi-nhap');
                donViNhapSelect.value = donViNhapSelect.options[0]?.value || '';
                return;
            }

            const modalContent = `
                <form id="add-new-unit-form">
                    <p>Đơn vị cơ sở của sản phẩm này là: <strong>${baseUnit}</strong>. Tỷ lệ quy đổi sẽ được tính dựa trên đơn vị này.</p>
                    <div class="input-group">
                        <label for="new-unit-name">Tên đơn vị mới (*)</label>
                        <input type="text" id="new-unit-name" required placeholder="Vd: Thùng">
                    </div>
                    <div class="input-group">
                        <label for="new-unit-rate">Tỷ lệ quy đổi (*)</label>
                        <input type="number" id="new-unit-rate" required min="1" placeholder="Vd: 1 Thùng = ? ${baseUnit}">
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                        <button type="button" class="btn btn-secondary" id="cancel-add-unit-btn">Hủy</button>
                        <button type="submit" class="btn btn-primary">Thêm</button>
                    </div>
                </form>
            `;
            showModal('Tạo Đơn Vị Tính Mới', modalContent);

            document.getElementById('cancel-add-unit-btn').addEventListener('click', () => {
                const donViNhapSelect = document.getElementById('don-vi-nhap');
                donViNhapSelect.value = donViNhapSelect.options[0]?.value || '';
                hideModal();
            });

            document.getElementById('add-new-unit-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const newUnitName = document.getElementById('new-unit-name').value.trim();
                const newUnitRate = parseFloat(document.getElementById('new-unit-rate').value);

                if (!newUnitName || !newUnitRate || newUnitRate <= 0) {
                    showToast('Vui lòng điền đầy đủ thông tin hợp lệ.', 'error');
                    return;
                }

                addUnitRow({ DonViTinh: newUnitName, TyLeQuyDoi: newUnitRate, GiaBan: 0, MaVach: '' });

                const donViNhapSelect = document.getElementById('don-vi-nhap');
                const newOption = document.createElement('option');
                newOption.value = newUnitName;
                newOption.textContent = newUnitName;
                newOption.selected = true;
                const addNewOption = donViNhapSelect.querySelector('option[value="--add-new--"]');
                if (addNewOption) {
                    donViNhapSelect.insertBefore(newOption, addNewOption);
                } else {
                    donViNhapSelect.appendChild(newOption);
                }
                
                donViNhapSelect.dispatchEvent(new Event('change'));

                hideModal();
                showToast(`Đã thêm đơn vị "${newUnitName}".`, 'success');
            });
        };

        const updateTyLeQuyDoi = () => {
            if (isTyLeManuallyEdited) return;

            const selectedUnit = document.getElementById('don-vi-nhap').value;
            const maThuoc = thuocHiddenInput.value;
            const tyLeInput = document.getElementById('ty-le-quy-doi');

            if (!maThuoc || !selectedUnit || selectedUnit === '--add-new--' || selectedUnit === 'Chọn đơn vị tính') {
                tyLeInput.value = 1;
                return;
            }
            
            const unitRows = unitTbody.querySelectorAll('tr');
            let foundInTable = false;
            for (const row of unitRows) {
                const unitNameInput = row.querySelector('.unit-name');
                if (unitNameInput && unitNameInput.value.trim().toLowerCase() === selectedUnit.toLowerCase()) {
                    const unitRateInput = row.querySelector('.unit-rate');
                    if (unitRateInput) {
                        tyLeInput.value = unitRateInput.value;
                        foundInTable = true;
                        break;
                    }
                }
            }
        
            if (foundInTable) return;
        
            const unitInfo = donViQuyDoi.find(dv => dv.MaThuoc === maThuoc && dv.DonViTinh === selectedUnit);
            if(unitInfo) {
                tyLeInput.value = unitInfo.TyLeQuyDoi;
            } else {
                 const baseUnit = danhMucThuoc.find(t => t.MaThuoc === maThuoc)?.DonViCoSo;
                 tyLeInput.value = (selectedUnit === baseUnit) ? 1 : 1;
            }
        };

        const renderUnitDefinitionTable = (maThuoc) => {
            unitTbody.innerHTML = ''; // Clear existing rows
            const product = danhMucThuoc.find(t => t.MaThuoc === maThuoc);
            if (!product) return;

            const units = donViQuyDoi.filter(dv => dv.MaThuoc === maThuoc);
            if (units.length > 0) {
                units.forEach(unit => addUnitRow(unit));
            } else {
                addUnitRow({ DonViTinh: product.DonViCoSo, TyLeQuyDoi: 1, GiaBan: 0, MaVach: '' });
            }
        };

        document.getElementById('add-unit-row-btn').addEventListener('click', () => addUnitRow());
        document.getElementById('don-vi-nhap').addEventListener('change', (e) => {
            if (e.target.value === '--add-new--') {
                showAddNewUnitModal();
            } else {
                isTyLeManuallyEdited = false; // Reset flag when unit is changed
                updateTyLeQuyDoi();
            }
        });

        const productDetailFields = ['nhom-hang-hoa', 'hoat-chat', 'ham-luong', 'so-dang-ky', 'hang-san-xuat', 'nuoc-san-xuat', 'quy-cach', 'don-vi-co-ban'];
        const toggleProductFields = (disabled) => {
            productDetailFields.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = disabled;
            });
        };

        const resetProductForm = () => {
             isTyLeManuallyEdited = false;
             thuocSearchInput.value = '';
             thuocHiddenInput.value = '';
             document.getElementById('so-lo').value = '';
             document.getElementById('han-su-dung').value = new Date().toISOString().split('T')[0];
             document.getElementById('so-luong-nhap').value = '1';
             document.getElementById('don-gia-nhap').value = '0';
             document.getElementById('tong-chiet-khau').value = '0';
             document.getElementById('vat-nhap').value = '0';
             document.getElementById('don-vi-nhap').innerHTML = '<option>Chọn đơn vị tính</option>';
             document.getElementById('don-vi-co-ban').innerHTML = '';
             unitTbody.innerHTML = '';
             updateItemSubtotal();
             toggleProductFields(true);
        };

        const renderReceipt = () => {
            if (receiptItems.length === 0) {
                receiptItemsListEl.innerHTML = '<p>Chưa có hàng hóa.</p>';
            } else {
                receiptItemsListEl.innerHTML = `
                    <table style="font-size: 0.9rem;">
                        <thead><tr><th>Tên thuốc</th><th>SL</th><th>Đ.Giá</th><th>T.Tiền</th><th></th></tr></thead>
                        <tbody>
                            ${receiptItems.map((item, index) => `
                                <tr>
                                    <td>${getThuocName(item.MaThuoc)} (${item.DonViNhap})</td>
                                    <td>${item.SoLuongNhap}</td>
                                    <td>${item.DonGiaNhap.toLocaleString('vi-VN')}</td>
                                    <td>${item.ThanhTien.toLocaleString('vi-VN')}</td>
                                    <td><button type="button" class="btn-remove-from-receipt" data-index="${index}" style="background:none; border:none; color:var(--danger-color); cursor:pointer;">&times;</button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            }
            updateReceiptTotals();
        };

        const updateReceiptTotals = () => {
            const subtotal = receiptItems.reduce((acc, item) => {
                const itemSub = item.SoLuongNhap * item.DonGiaNhap;
                return acc + (itemSub - (item.chietKhau || 0));
            }, 0);

            const totalVat = receiptItems.reduce((acc, item) => {
                 const itemSub = item.SoLuongNhap * item.DonGiaNhap;
                 const itemBeforeTax = itemSub - (item.chietKhau || 0);
                 const itemVat = itemBeforeTax * (item.vat / 100);
                 return acc + itemVat;
            }, 0);
            
            const grandTotal = subtotal + totalVat;

            receiptSubtotalEl.textContent = subtotal.toLocaleString('vi-VN') + 'đ';
            receiptVatEl.textContent = totalVat.toLocaleString('vi-VN') + 'đ';
            receiptGrandTotalEl.textContent = grandTotal.toLocaleString('vi-VN') + 'đ';
        };
        
        // --- Setup Event Listeners ---
        const setupEventListeners = () => {
            document.getElementById('product-details-form').addEventListener('input', updateItemSubtotal);
            
            const tyLeQuyDoiInput = document.getElementById('ty-le-quy-doi');
            tyLeQuyDoiInput.addEventListener('input', () => {
                isTyLeManuallyEdited = true;
            });

            document.getElementById('clear-thuoc-selection').addEventListener('click', resetProductForm);
            
            document.getElementById('cancel-receipt-btn').addEventListener('click', () => {
                if(confirm('Bạn có chắc muốn hủy phiếu nhập này? Mọi thông tin chưa lưu sẽ bị mất.')) {
                    window.location.hash = 'danhsachphieunhap';
                }
            });
            
            receiptItemsListEl.addEventListener('click', e => {
                if (e.target.classList.contains('btn-remove-from-receipt')) {
                    const index = parseInt(e.target.dataset.index, 10);
                    receiptItems.splice(index, 1);
                    renderReceipt();
                }
            });

            nccSelect.addEventListener('change', e => {
                if (e.target.value === '--add-new--') {
                    app.showAddSupplierModal(e.target);
                }
            });
            
            const handleThuocSearch = async () => {
                const term = thuocSearchInput.value.trim();
                thuocSuggestionsDiv.innerHTML = '';
            
                const barcodeMatch = donViQuyDoi.find(dv => dv.MaVach && dv.MaVach === term);
                if (barcodeMatch) {
                    blockNextSoLoEnter = true;
                    await selectThuoc(barcodeMatch.MaThuoc);
                    return;
                }
            
                if (term.length < 1) { 
                    thuocSuggestionsDiv.style.display = 'none';
                    return;
                }
            
                const normalizedTerm = removeDiacritics(term.toLowerCase());
                
                const results = danhMucThuoc.filter(thuoc => {
                    const tenThuoc = thuoc.TenThuoc ? String(thuoc.TenThuoc) : '';
                    const hoatChat = thuoc.HoatChat ? String(thuoc.HoatChat) : '';
                    const soDangKy = thuoc.SoDangKy ? String(thuoc.SoDangKy) : '';

                    const tenThuocNorm = removeDiacritics(tenThuoc.toLowerCase());
                    const hoatChatNorm = removeDiacritics(hoatChat.toLowerCase());
                    const soDangKyNorm = removeDiacritics(soDangKy.toLowerCase());

                    return tenThuocNorm.includes(normalizedTerm) ||
                           hoatChatNorm.includes(normalizedTerm) ||
                           soDangKyNorm.includes(normalizedTerm);
                });
            
                if (results.length > 0) {
                    thuocSuggestionsDiv.innerHTML = results.slice(0, 10).map((r, index) => 
                       `<div class="suggestion-item ${index === 0 ? 'selected' : ''}" data-ma-thuoc="${r.MaThuoc}">
                           <strong>${r.TenThuoc}</strong><br>
                           <small>SDK: ${r.SoDangKy || 'N/A'}</small>
                       </div>`
                    ).join('');
                } else {
                    thuocSuggestionsDiv.innerHTML = `<div class="suggestion-item add-new" data-action="add-new-thuoc">Không tìm thấy? Thêm thuốc mới...</div>`;
                }
                thuocSuggestionsDiv.style.display = 'block';
            };
            
            const selectThuoc = async (maThuoc) => {
                isTyLeManuallyEdited = false;
                thuocSuggestionsDiv.style.display = 'none';
                const selectedThuoc = danhMucThuoc.find(t => t.MaThuoc === maThuoc);
                if (!selectedThuoc) return;
                
                const nsx = (await getCachedDanhMuc('DanhMucNhaSanXuat')).find(n => n.MaNhaSanXuat === selectedThuoc.MaNhaSanXuat);
                
                thuocSearchInput.value = selectedThuoc.TenThuoc;
                thuocHiddenInput.value = selectedThuoc.MaThuoc;
                
                // Populate fields
                document.getElementById('nhom-hang-hoa').value = selectedThuoc.NhomThuoc || '';
                document.getElementById('hoat-chat').value = selectedThuoc.HoatChat || '';
                document.getElementById('ham-luong').value = selectedThuoc.HamLuong || '';
                document.getElementById('so-dang-ky').value = selectedThuoc.SoDangKy || '';
                document.getElementById('hang-san-xuat').value = nsx ? nsx.TenNhaSanXuat : '';
                document.getElementById('nuoc-san-xuat').value = nsx ? nsx.QuocGia : '';
                document.getElementById('quy-cach').value = selectedThuoc.QuyCachDongGoi || '';
                
                const donViCoBanSelect = document.getElementById('don-vi-co-ban');
                donViCoBanSelect.innerHTML = generateOptions(danhMucDVT, 'TenDonViTinh', 'TenDonViTinh', selectedThuoc.DonViCoSo);

                
                toggleProductFields(false);

                // Populate unit select
                const donViNhapSelect = document.getElementById('don-vi-nhap');
                const defaultUnit = selectedThuoc.DonViCoSo || '';
                donViNhapSelect.innerHTML = `
                    ${generateOptions(danhMucDVT, 'TenDonViTinh', 'TenDonViTinh', defaultUnit)}
                    <option value="--add-new--" style="font-style: italic;">+ Tạo đơn vị mới...</option>
                `;
                donViNhapSelect.dispatchEvent(new Event('change'));

                renderUnitDefinitionTable(maThuoc);

                document.getElementById('don-vi-nhap').focus();
            };

            thuocSearchInput.addEventListener('input', handleThuocSearch);
            
            thuocSearchInput.addEventListener('keydown', (e) => {
                const suggestions = thuocSuggestionsDiv.querySelectorAll('.suggestion-item');
                if (suggestions.length === 0 || thuocSuggestionsDiv.style.display === 'none') return;
                let selected = thuocSuggestionsDiv.querySelector('.selected');
                
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (selected && selected.nextElementSibling) {
                        selected.classList.remove('selected');
                        selected.nextElementSibling.classList.add('selected');
                    } else if (!selected && suggestions.length > 0) {
                        suggestions[0].classList.add('selected');
                    }
                } else if (e.key === 'ArrowUp') {
                     e.preventDefault();
                    if (selected && selected.previousElementSibling) {
                        selected.classList.remove('selected');
                        selected.previousElementSibling.classList.add('selected');
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if(selected) {
                        const maThuoc = selected.dataset.maThuoc;
                        if (maThuoc) {
                            selectThuoc(maThuoc);
                        } else if (selected.dataset.action === 'add-new-thuoc') {
                            app.showAddThuocModal(null, (newThuoc) => {
                                selectThuoc(newThuoc.MaThuoc);
                            });
                        }
                    }
                }
            });

            thuocSearchInput.addEventListener('blur', () => setTimeout(() => thuocSuggestionsDiv.style.display = 'none', 200));
            
            thuocSuggestionsDiv.addEventListener('click', e => {
                const item = e.target.closest('.suggestion-item');
                if (!item) return;
                
                if (item.dataset.action === 'add-new-thuoc') {
                    app.showAddThuocModal(null, (newThuoc) => {
                        selectThuoc(newThuoc.MaThuoc);
                    });
                } else if (item.dataset.maThuoc) {
                    selectThuoc(item.dataset.maThuoc);
                }
            });

            // Input chaining with Enter key
            const soLoInput = document.getElementById('so-lo');
            const hsdInput = document.getElementById('han-su-dung');
            const soLuongInput = document.getElementById('so-luong-nhap');
            const donGiaInput = document.getElementById('don-gia-nhap');
            const chietKhauInput = document.getElementById('tong-chiet-khau');
            const vatInput = document.getElementById('vat-nhap');
            const addItemBtn = document.getElementById('add-item-btn');
            
            soLoInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (blockNextSoLoEnter) {
                        blockNextSoLoEnter = false;
                        return;
                    }
                    hsdInput.focus();
                }
            });

            hsdInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    soLuongInput.focus();
                    soLuongInput.select();
                }
            });

            soLuongInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    donGiaInput.focus();
                    donGiaInput.select();
                }
            });

            donGiaInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    chietKhauInput.focus();
                    chietKhauInput.select();
                }
            });
             chietKhauInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    vatInput.focus();
                    vatInput.select();
                }
            });
             vatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addItemBtn.focus();
                }
            });
            
             document.getElementById('add-item-btn').addEventListener('click', async () => {
                const maThuoc = thuocHiddenInput.value;
                const soLuong = parseFloat(document.getElementById('so-luong-nhap').value);
                const soLo = document.getElementById('so-lo').value.trim();
                const hsd = document.getElementById('han-su-dung').value;

                if (!maThuoc) {
                    showToast('Tên thuốc chưa có trong danh mục. Vui lòng Thêm mới thuốc hoặc chọn lại từ danh sách.', 'error');
                    return;
                }
                
                if (!soLuong || soLuong <= 0 || !soLo || !hsd) {
                    showToast('Vui lòng điền đầy đủ các trường bắt buộc (*)', 'error');
                    return;
                }
                
                const unitRows = Array.from(unitTbody.querySelectorAll('tr'));
                const newUnitsData = unitRows.map(row => {
                    const name = row.querySelector('.unit-name').value.trim();
                    const rate = parseFloat(row.querySelector('.unit-rate').value);
                    const price = parseFloat(row.querySelector('.unit-price').value);
                    const barcode = row.querySelector('.unit-barcode').value.trim();
                    if (!name || isNaN(rate) || rate < 1) return null;
                    return { DonViTinh: name, TyLeQuyDoi: rate, GiaBan: price || 0, MaVach: barcode };
                }).filter(Boolean);
                
                if(newUnitsData.length === 0) {
                     showToast('Phải có ít nhất một đơn vị tính hợp lệ.', 'error');
                    return;
                }

                receiptItems.push({
                    MaThuoc: maThuoc,
                    DonViNhap: document.getElementById('don-vi-nhap').value,
                    SoLuongNhap: soLuong,
                    DonGiaNhap: parseFloat(document.getElementById('don-gia-nhap').value) || 0,
                    SoLo: soLo,
                    HanSuDung: hsd,
                    chietKhau: parseFloat(document.getElementById('tong-chiet-khau').value) || 0,
                    vat: parseFloat(document.getElementById('vat-nhap').value) || 0,
                    ThanhTien: parseFloat(document.getElementById('thanh-tien').value.replace(/[.đ]/g, '').replace(/,/g, '.')) || 0,
                    soLuongQuyDoi: soLuong * (parseFloat(document.getElementById('ty-le-quy-doi').value) || 1),
                    donViQuyDoiUpdates: newUnitsData
                });

                // --- Gửi dữ liệu về backend để đồng bộ ---
                const selectedThuoc = (await getCachedDanhMuc('DanhMucThuoc')).find(t => t.MaThuoc === maThuoc);
                if (selectedThuoc) {
                    const drugSyncData = {
                        MaThuoc: maThuoc,
                        TenThuoc: document.getElementById('item-thuoc-search').value.trim(),
                        NhomThuoc: document.getElementById('nhom-hang-hoa').value,
                        HoatChat: document.getElementById('hoat-chat').value,
                        HamLuong: document.getElementById('ham-luong').value,
                        SoDangKy: document.getElementById('so-dang-ky').value,
                        QuyCachDongGoi: document.getElementById('quy-cach').value,
                        DonViCoSo: document.getElementById('don-vi-co-ban').value,
                        MaNhaSanXuat: selectedThuoc.MaNhaSanXuat
                    };
                    
                    // Gọi ngầm, không cần chờ kết quả
                    callAppsScript('syncDrugInfo', { thuocData: drugSyncData })
                        .then(response => console.log('Đồng bộ thông tin thuốc thành công:', response))
                        .catch(error => console.error('Lỗi đồng bộ thông tin thuốc:', error));
                }
                // --- Kết thúc phần gửi dữ liệu ---

                renderReceipt();
                resetProductForm();
                thuocSearchInput.focus();
            });

            document.getElementById('nhap-kho-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('save-receipt-btn');
                
                if (receiptItems.length === 0) {
                    showToast('Phiếu nhập trống. Vui lòng thêm hàng hóa.', 'error');
                    return;
                }
                const maNCC = nccSelect.value;
                if (!maNCC) {
                    showToast('Vui lòng chọn nhà cung cấp.', 'error');
                    return;
                }
                
                submitBtn.disabled = true;
                submitBtn.textContent = 'Đang lưu...';
                
                const tongTien = receiptItems.reduce((sum, item) => sum + item.ThanhTien, 0);
                const trangThai = trangThaiTTInput.value;
                const soTienDaTra = trangThai === 'Đã thanh toán' ? tongTien : 0;

                const phieuNhapData = {
                    MaNhaCungCap: maNCC,
                    SoHoaDonNCC: document.getElementById('so-hoa-don-ncc').value,
                    NgayHoaDon: document.getElementById('ngay-hoa-don').value,
                    TongTien: tongTien,
                    NguoiNhap: appState.currentUser.MaNhanVien,
                    TrangThaiThanhToan: trangThai,
                    SoTienDaTra: soTienDaTra,
                    GhiChu: '',
                    items: receiptItems
                };
                
                try {
                    const functionToCall = isEditMode ? 'updatePhieuNhap' : 'addPhieuNhap';
                    const args = isEditMode ? { maPhieuNhap: editData.phieuNhap.MaPhieuNhap, phieuNhapData } : phieuNhapData;
                    
                    const result = await callAppsScript(functionToCall, args);
                    
                    showToast(`Đã ${isEditMode ? 'cập nhật' : 'lưu'} phiếu nhập ${result.MaPhieuNhap} thành công!`, 'success');
                    
                    // Force refresh cache for related data
                    invalidateCache('PhieuNhap');
                    invalidateCache('DonViQuyDoi');
                    // Invalidate TonKho cache is tricky, best to let it expire or not cache it.
                    
                    window.location.hash = 'danhsachphieunhap';
                } catch (err) {
                    showToast(`Lỗi: ${err.message}`, 'error');
                    submitBtn.disabled = false;
                    submitBtn.textContent = isEditMode ? 'Cập nhật phiếu nhập' : 'Lưu Phiếu Nhập';
                }
            });
        };
        
        setupEventListeners();
        if (isEditMode) {
            renderReceipt(); // Render items loaded from editData
        }
    }
    
    async function renderNhapKhoEdit(params) {
        const maPhieuNhap = params.get('id');
        if (!maPhieuNhap) {
            mainContent.innerHTML = `<div class="card" style="color:var(--danger-color)">Không có mã phiếu nhập được cung cấp.</div>`;
            return;
        }

        try {
            const data = await callAppsScript('getPhieuNhapDetail', { maPhieuNhap });
            await renderNhapKhoForm(data);
        } catch (error) {
            mainContent.innerHTML = `<div class="card" style="color:var(--danger-color)">Lỗi tải chi tiết phiếu nhập: ${error.message}</div>`;
        }
    }
    
    async function renderPhieuNhapDetailForModal(maPhieuNhap) {
        try {
            const { phieuNhap, chiTiet } = await callAppsScript('getPhieuNhapDetail', { maPhieuNhap });
            return `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 15px;">
                    <p><strong>Mã phiếu:</strong> ${phieuNhap.MaPhieuNhap}</p>
                    <p><strong>Nhà cung cấp:</strong> ${phieuNhap.TenNhaCungCap}</p>
                    <p><strong>Ngày nhập:</strong> ${new Date(phieuNhap.NgayNhap).toLocaleString('vi-VN')}</p>
                    <p><strong>Tổng tiền:</strong> ${phieuNhap.TongTien.toLocaleString('vi-VN')}đ</p>
                    <p><strong>Trạng thái:</strong> ${phieuNhap.TrangThaiThanhToan || 'N/A'}</p>
                    <p><strong>Đã trả:</strong> ${(phieuNhap.SoTienDaTra || 0).toLocaleString('vi-VN')}đ</p>
                </div>
                <h4>Chi tiết hàng hóa:</h4>
                <div class="table-wrapper">
                    <table>
                        <thead><tr><th>Tên thuốc</th><th>Số lô</th><th>HSD</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
                        <tbody>
                        ${chiTiet.map(item => `
                            <tr>
                                <td>${item.TenThuoc}</td>
                                <td>${item.SoLo}</td>
                                <td>${new Date(item.HanSuDung).toLocaleDateString('vi-VN')}</td>
                                <td>${item.SoLuongNhap} ${item.DonViNhap}</td>
                                <td>${item.DonGiaNhap.toLocaleString('vi-VN')}đ</td>
                                <td>${item.ThanhTien.toLocaleString('vi-VN')}đ</td>
                            </tr>
                        `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch(e) {
            return `<p style="color:red">Lỗi tải dữ liệu chi tiết: ${e.message}</p>`;
        }
    }
    
    async function printPhieuNhap(maPhieuNhap) {
        try {
            showToast(`Đang chuẩn bị in phiếu ${maPhieuNhap}...`, 'info');
            const { phieuNhap, chiTiet } = await callAppsScript('getPhieuNhapDetail', { maPhieuNhap });
            const settings = appState.cache['appSettings'] || {};

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Phiếu Nhập Kho ${maPhieuNhap}</title>
                        <style>
                            body { font-family: Arial, sans-serif; font-size: 12px; }
                            .container { width: 80%; margin: 0 auto; }
                            h1, h2 { text-align: center; margin: 5px 0; }
                            .info { margin-bottom: 20px; }
                            .info p { margin: 4px 0; }
                            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
                            th { background-color: #f2f2f2; }
                            .total-row { font-weight: bold; }
                            .signatures { display: flex; justify-content: space-around; margin-top: 50px; }
                            .signature-box { text-align: center; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <p>${settings.TenNhaThuoc || 'Nhà Thuốc'}<br>${settings.DiaChi || ''}</p>
                            <h2>PHIẾU NHẬP KHO</h2>
                            <div class="info">
                                <p><strong>Số phiếu:</strong> ${phieuNhap.MaPhieuNhap}</p>
                                <p><strong>Ngày nhập:</strong> ${new Date(phieuNhap.NgayNhap).toLocaleString('vi-VN')}</p>
                                <p><strong>Nhà cung cấp:</strong> ${phieuNhap.TenNhaCungCap}</p>
                            </div>
                            <table>
                                <thead><tr><th>STT</th><th>Tên hàng</th><th>ĐVT</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th><th>Số lô</th><th>Hạn dùng</th></tr></thead>
                                <tbody>
                                ${chiTiet.map((item, index) => `
                                    <tr>
                                        <td>${index + 1}</td>
                                        <td>${item.TenThuoc}</td>
                                        <td>${item.DonViNhap}</td>
                                        <td>${item.SoLuongNhap}</td>
                                        <td>${item.DonGiaNhap.toLocaleString('vi-VN')}</td>
                                        <td>${item.ThanhTien.toLocaleString('vi-VN')}</td>
                                        <td>${item.SoLo}</td>
                                        <td>${new Date(item.HanSuDung).toLocaleDateString('vi-VN')}</td>
                                    </tr>
                                `).join('')}
                                 <tr class="total-row">
                                    <td colspan="5" style="text-align: right;"><strong>Tổng cộng:</strong></td>
                                    <td colspan="3">${phieuNhap.TongTien.toLocaleString('vi-VN')}đ</td>
                                 </tr>
                                </tbody>
                            </table>
                             <div class="signatures">
                                <div class="signature-box"><strong>Người lập phiếu</strong><br>(Ký, họ tên)</div>
                                <div class="signature-box"><strong>Thủ kho</strong><br>(Ký, họ tên)</div>
                                <div class="signature-box"><strong>Kế toán</strong><br>(Ký, họ tên)</div>
                            </div>
                        </div>
                    </body>
                </html>
            `);
            printWindow.document.close();
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
                printWindow.close();
            }, 250);
        } catch(e) {
            showToast(`Lỗi khi in: ${e.message}`, 'error');
        }
    }
    
    // --- PHIẾU XUẤT KHO ---
    async function renderDanhSachPhieuXuat() {
        updatePageTitle('Danh sách phiếu xuất kho');
        mainContent.innerHTML = `<div class="card"><p>Đang tải dữ liệu...</p></div>`;
        try {
            const [phieuXuatList, allUsers] = await Promise.all([
                getCachedDanhMuc('PhieuXuat'),
                appState.cache['allUsers'] ? Promise.resolve(appState.cache['allUsers']) : callAuthScript('getUsersForAdmin', { username_chinh: appState.currentUser.username_chinh })
            ]);
            
            const userMap = new Map(allUsers.map(user => [user.MaNhanVien, user.HoTen]));

            mainContent.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <h3>Danh sách phiếu xuất kho</h3>
                        <button class="btn btn-primary" id="btn-xuat-kho">Tạo Phiếu Xuất Kho</button>
                    </div>
                    <div class="card-body table-wrapper">
                        <table>
                            <thead><tr><th>Mã PX</th><th>Ngày xuất</th><th>Loại xuất</th><th>Người xuất</th><th>Lý do</th><th class="action-cell">Hành động</th></tr></thead>
                            <tbody id="phieu-xuat-table-body">
                                ${phieuXuatList.sort((a, b) => new Date(b.NgayXuat) - new Date(a.NgayXuat)).map(px => `
                                    <tr data-ma-px="${px.MaPhieuXuat}">
                                        <td>${px.MaPhieuXuat}</td>
                                        <td>${new Date(px.NgayXuat).toLocaleString('vi-VN')}</td>
                                        <td>${px.LoaiXuat}</td>
                                        <td>${userMap.get(px.NguoiXuat) || px.NguoiXuat}</td>
                                        <td>${px.LyDo}</td>
                                        <td class="action-cell">
                                            <div class="action-menu">
                                                <button class="btn-actions"><span class="material-symbols-outlined">more_vert</span></button>
                                                <div class="action-menu-dropdown">
                                                    <a href="#" class="action-item" data-action="view">Xem chi tiết</a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            document.getElementById('btn-xuat-kho').addEventListener('click', () => {
                window.location.hash = 'phieuxuatkho-new';
            });
            // TODO: Add action handlers for view/delete
        } catch (error) {
             mainContent.innerHTML = `<div class="card" style="color: var(--danger-color);"><p><strong>Lỗi tải dữ liệu phiếu xuất:</strong> ${error.message}</p></div>`;
        }
    }

    async function renderPhieuXuatKhoForm() {
        updatePageTitle('Tạo Phiếu Xuất Kho');
        mainContent.innerHTML = `<div class="card"><p>Đang tải dữ liệu...</p></div>`;
    
        let issueItems = [];
        let availableLotsForSelectedDrug = [];
    
        try {
            const [danhMucThuoc, danhMucNCC] = await Promise.all([
                getCachedDanhMuc('DanhMucThuoc'),
                getCachedDanhMuc('DanhMucNhaCungCap')
            ]);
    
            mainContent.innerHTML = `
                <form id="xuat-kho-form">
                    <div class="card">
                        <div class="card-header"><h3>Thông tin chung</h3></div>
                        <div class="card-body" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                            <div class="input-group">
                                <label for="loai-xuat">Loại xuất kho (*)</label>
                                <select id="loai-xuat" required>
                                    <option value="Xuất hủy">Xuất hủy</option>
                                    <option value="Xuất trả NCC">Xuất trả Nhà Cung Cấp</option>
                                </select>
                            </div>
                            <div class="input-group hidden" id="ncc-group">
                                <label for="ncc-select-xuat">Nhà cung cấp (*)</label>
                                <select id="ncc-select-xuat">${generateOptions(danhMucNCC, 'MaNhaCungCap', 'TenNhaCungCap', null)}</select>
                            </div>
                            <div class="input-group" style="grid-column: 1 / -1;">
                                <label for="ly-do">Lý do xuất kho (*)</label>
                                <textarea id="ly-do" rows="2" required></textarea>
                            </div>
                        </div>
                    </div>
    
                    <div class="pos-layout" style="align-items: flex-start;">
                        <div class="pos-main">
                            <div class="card">
                                <div class="card-header"><h3>Thêm hàng hóa</h3></div>
                                <div class="card-body" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                    <div class="input-group" style="grid-column: 1 / -1; position: relative;">
                                        <label>Tìm thuốc (*)</label>
                                        <input type="text" id="thuoc-search-xuat" placeholder="Tìm theo tên hoặc mã thuốc..." autocomplete="off">
                                        <div id="thuoc-suggestions-xuat" class="suggestions-dropdown" style="display:none;"></div>
                                    </div>
                                    <div class="input-group">
                                        <label for="lot-select">Chọn lô (*)</label>
                                        <select id="lot-select" disabled><option>Vui lòng chọn thuốc</option></select>
                                    </div>
                                    <div class="input-group">
                                        <label for="so-luong-xuat">Số lượng xuất (đơn vị cơ sở)</label>
                                        <input type="number" id="so-luong-xuat" min="1" disabled>
                                    </div>
                                    <div style="grid-column: 1 / -1; text-align: right;">
                                        <button type="button" class="btn btn-primary" id="add-item-xuat-btn" disabled>Thêm vào phiếu</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="pos-sidebar">
                            <div class="card">
                                <div class="card-header"><h4>Danh sách hàng hóa xuất</h4></div>
                                <div id="issue-items-list" class="card-body table-wrapper" style="min-height: 200px;"><p>Chưa có hàng hóa.</p></div>
                            </div>
                        </div>
                    </div>
    
                    <div class="card">
                        <div class="card-body" style="text-align: right;">
                            <button type="button" class="btn btn-secondary" id="cancel-xuat-btn" style="margin-right: 10px;">Hủy</button>
                            <button type="submit" class="btn btn-primary" id="save-xuat-btn">Lưu Phiếu Xuất</button>
                        </div>
                    </div>
                </form>
            `;
    
            const loaiXuatSelect = document.getElementById('loai-xuat');
            const nccGroup = document.getElementById('ncc-group');
            const thuocSearchInput = document.getElementById('thuoc-search-xuat');
            const thuocSuggestionsDiv = document.getElementById('thuoc-suggestions-xuat');
            const lotSelect = document.getElementById('lot-select');
            const soLuongInput = document.getElementById('so-luong-xuat');
            const addItemBtn = document.getElementById('add-item-xuat-btn');
            const issueItemsListEl = document.getElementById('issue-items-list');
    
            let selectedThuoc = null;
    
            loaiXuatSelect.addEventListener('change', () => {
                nccGroup.classList.toggle('hidden', loaiXuatSelect.value !== 'Xuất trả NCC');
            });
    
            thuocSearchInput.addEventListener('input', () => {
                const term = thuocSearchInput.value.trim().toLowerCase();
                if (term.length < 2) {
                    thuocSuggestionsDiv.style.display = 'none';
                    return;
                }
                const results = danhMucThuoc.filter(t => t.TenThuoc.toLowerCase().includes(term));
                thuocSuggestionsDiv.innerHTML = results.map(r => `<div class="suggestion-item" data-ma-thuoc="${r.MaThuoc}">${r.TenThuoc}</div>`).join('');
                thuocSuggestionsDiv.style.display = 'block';
            });
    
            thuocSuggestionsDiv.addEventListener('click', async (e) => {
                const item = e.target.closest('.suggestion-item');
                if (!item) return;
                
                selectedThuoc = danhMucThuoc.find(t => t.MaThuoc === item.dataset.maThuoc);
                thuocSearchInput.value = selectedThuoc.TenThuoc;
                thuocSuggestionsDiv.style.display = 'none';
                lotSelect.innerHTML = '<option>Đang tải lô...</option>';
                
                try {
                    availableLotsForSelectedDrug = await callAppsScript('getInventoryDetail', { maThuoc: selectedThuoc.MaThuoc });
                    if (availableLotsForSelectedDrug.length > 0) {
                        lotSelect.innerHTML = availableLotsForSelectedDrug.map(lot => 
                            `<option value="${lot.SoLo}" data-hsd="${lot.HanSuDung}" data-max="${lot.SoLuong}">Lô: ${lot.SoLo} | Tồn: ${lot.SoLuong} | HSD: ${new Date(lot.HanSuDung).toLocaleDateString('vi-VN')}</option>`
                        ).join('');
                        lotSelect.disabled = false;
                        soLuongInput.disabled = false;
                        addItemBtn.disabled = false;
                        lotSelect.dispatchEvent(new Event('change'));
                    } else {
                        lotSelect.innerHTML = '<option>Hết hàng</option>';
                    }
                } catch (err) {
                    showToast(`Lỗi tải chi tiết tồn kho: ${err.message}`, 'error');
                    lotSelect.innerHTML = '<option>Lỗi tải lô</option>';
                }
            });
    
            lotSelect.addEventListener('change', () => {
                const selectedOption = lotSelect.options[lotSelect.selectedIndex];
                soLuongInput.max = selectedOption.dataset.max || 1;
                soLuongInput.value = 1;
            });
    
            const renderIssueList = () => {
                if (issueItems.length === 0) {
                    issueItemsListEl.innerHTML = '<p>Chưa có hàng hóa.</p>';
                } else {
                    issueItemsListEl.innerHTML = `
                        <table style="font-size: 0.9rem;">
                            <thead><tr><th>Tên thuốc</th><th>Lô</th><th>SL</th><th></th></tr></thead>
                            <tbody>
                                ${issueItems.map((item, index) => `
                                    <tr>
                                        <td>${danhMucThuoc.find(t => t.MaThuoc === item.MaThuoc).TenThuoc}</td>
                                        <td>${item.SoLo}</td>
                                        <td>${item.SoLuong}</td>
                                        <td><button type="button" class="btn-remove-issue-item" data-index="${index}" style="background:none;border:none;color:var(--danger-color);cursor:pointer;">&times;</button></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>`;
                }
            };
            
            issueItemsListEl.addEventListener('click', e => {
                if (e.target.classList.contains('btn-remove-issue-item')) {
                    issueItems.splice(parseInt(e.target.dataset.index, 10), 1);
                    renderIssueList();
                }
            });

            addItemBtn.addEventListener('click', () => {
                const soLuong = parseInt(soLuongInput.value, 10);
                const maxSoLuong = parseInt(soLuongInput.max, 10);
                const selectedLotOption = lotSelect.options[lotSelect.selectedIndex];

                if (!selectedThuoc || !selectedLotOption || isNaN(soLuong) || soLuong <= 0) {
                    showToast('Vui lòng điền đủ thông tin.', 'error'); return;
                }
                if (soLuong > maxSoLuong) {
                    showToast(`Số lượng xuất vượt quá tồn kho của lô (Tồn: ${maxSoLuong}).`, 'error'); return;
                }

                issueItems.push({
                    MaThuoc: selectedThuoc.MaThuoc,
                    SoLo: selectedLotOption.value,
                    HanSuDung: selectedLotOption.dataset.hsd,
                    SoLuong: soLuong,
                });
                renderIssueList();

                // Reset form
                thuocSearchInput.value = '';
                lotSelect.innerHTML = '<option>Vui lòng chọn thuốc</option>';
                lotSelect.disabled = true;
                soLuongInput.value = '';
                soLuongInput.disabled = true;
                addItemBtn.disabled = true;
                selectedThuoc = null;
            });

            document.getElementById('cancel-xuat-btn').addEventListener('click', () => window.location.hash = 'phieuxuatkho');

            document.getElementById('xuat-kho-form').addEventListener('submit', async e => {
                e.preventDefault();
                const btn = document.getElementById('save-xuat-btn');
                if (issueItems.length === 0) {
                    showToast('Phiếu xuất trống, vui lòng thêm hàng hóa.', 'error');
                    return;
                }
                btn.disabled = true;
                btn.textContent = 'Đang lưu...';
                
                try {
                    const phieuXuatData = {
                        LoaiXuat: loaiXuatSelect.value,
                        MaNhaCungCap: loaiXuatSelect.value === 'Xuất trả NCC' ? document.getElementById('ncc-select-xuat').value : null,
                        LyDo: document.getElementById('ly-do').value,
                        items: issueItems
                    };
                    const result = await callAppsScript('addPhieuXuat', phieuXuatData);
                    showToast(`Đã tạo phiếu xuất ${result.MaPhieuXuat} thành công!`, 'success');
                    invalidateCache('PhieuXuat');
                    window.location.hash = 'phieuxuatkho';
                } catch (err) {
                    showToast(`Lỗi lưu phiếu xuất: ${err.message}`, 'error');
                    btn.disabled = false;
                    btn.textContent = 'Lưu Phiếu Xuất';
                }
            });

        } catch (error) {
            mainContent.innerHTML = `<div class="card" style="color:var(--danger-color)">Lỗi tải dữ liệu cần thiết: ${error.message}</div>`;
        }
    }
    
    // The object returned here is merged into the main router
    return {
        tongquan: renderDashboard,
        kho: renderDanhSachThuocKho,
        danhsachphieunhap: renderDanhSachPhieuNhap,
        phieuxuatkho: renderDanhSachPhieuXuat,
        nhapkho: () => renderNhapKhoForm(null),
        'nhapkho-edit': renderNhapKhoEdit,
        'phieuxuatkho-new': renderPhieuXuatKhoForm,
    };
}
