function initializeSalesModule(app) {
    const { callAppsScript, getCachedDanhMuc, showToast, showModal, hideModal, invalidateCache, generateOptions, state: appState } = app;
    const mainContent = document.getElementById('main-content');
    const pageTitle = document.getElementById('page-title');

    const removeDiacritics = (str) => {
        if (!str) return '';
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
    };

    const formatNumber = (num) => {
        if (isNaN(num)) return '0';
        return new Intl.NumberFormat('vi-VN').format(num);
    };

    const parseFormattedNumber = (str) => {
        if (!str) return 0;
        // Handles formats like "1.000.000"
        return parseFloat(String(str).replace(/\./g, '').replace(/,/g, '.')) || 0;
    };
    
    const setupNumericInputFormatting = (inputElement) => {
        if (!inputElement) return;
        inputElement.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^0-9]/g, '');
            if (value) {
                e.target.value = formatNumber(parseInt(value, 10));
            } else {
                e.target.value = '';
            }
        });
        inputElement.addEventListener('blur', (e) => {
            if (e.target.value.trim() === '') {
                e.target.value = '0';
            }
        });
        inputElement.addEventListener('focus', e => e.target.select());
    };

    const showAddCustomerModal = (onSuccess) => {
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
                if (onSuccess) onSuccess(newItem.MaKhachHang);
            })
            .catch(err => {
                 showToast(`Lỗi: ${err.message}`, 'error');
            });
        });
    };

    const updatePageTitle = (title) => pageTitle.textContent = title;
    
    // --- QR CODE & PRINTING HELPERS (MOVED HERE) ---
    const crc16ccitt = (data) => {
        let crc = 0xFFFF;
        for (let i = 0; i < data.length; i++) {
            crc ^= data.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j++) {
                crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
            }
        }
        return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    };

    const buildQRField = (id, value) => {
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.length === 0) return '';
        const len = stringValue.length.toString().padStart(2, '0');
        return `${id}${len}${stringValue}`;
    };

    const generateQRCodePayload = (bankBin, accountNumber, amount, description) => {
        const merchantAccountInfo =
            buildQRField('00', 'A000000727') +
            buildQRField('01', buildQRField('00', bankBin) + buildQRField('01', accountNumber)) +
            buildQRField('02', 'QRIBFTTA');
        const transactionInfo = `Thanhtoan ${description}`;
        const additionalData = buildQRField('08', transactionInfo);
        const integerAmount = Math.round(amount || 0).toString();
        let payload =
            buildQRField('00', '01') +
            buildQRField('01', '11') +
            buildQRField('38', merchantAccountInfo) +
            buildQRField('53', '704') +
            buildQRField('54', integerAmount) + 
            buildQRField('58', 'VN') +
            buildQRField('62', additionalData);
        payload += '6304';
        const crc = crc16ccitt(payload);
        return payload + crc;
    };
    
    const generateQrCodeDataURL = (payload) => {
      return new Promise((resolve, reject) => {
        try {
          if (typeof QRCode === 'undefined') {
            return reject(new Error('Thư viện QRCode chưa được tải.'));
          }
    
          const tempDiv = document.createElement('div');
          tempDiv.style.position = 'absolute';
          tempDiv.style.left = '-9999px';
          document.body.appendChild(tempDiv);
    
          try {
            new QRCode(tempDiv, {
              text: payload,
              width: 220,
              height: 220,
              correctLevel: QRCode.CorrectLevel.H
            });
          } catch (errCreate) {
              document.body.removeChild(tempDiv);
              return reject(errCreate);
          }
    
          setTimeout(() => {
            try {
              let dataURL = '';
              const img = tempDiv.querySelector('img');
              if (img && img.src) {
                  dataURL = img.src;
              } else {
                const canvas = tempDiv.querySelector('canvas');
                if (canvas) dataURL = canvas.toDataURL('image/png');
              }
              document.body.removeChild(tempDiv);
              if (dataURL) return resolve(dataURL);
              return reject(new Error('Could not extract dataURL from the generated QR code.'));
            } catch (e) {
              try { document.body.removeChild(tempDiv); } catch(_) {}
              return reject(e);
            }
          }, 300);
        } catch (err) {
          return reject(err);
        }
      });
    };

    const printReceipt = (printData, settings) => {
        return new Promise(async (resolve, reject) => {
            const { hoaDon, chiTiet, tenKhachHang, tenNguoiBan } = printData;
            const {
                TenNhaThuoc = 'Nhà Thuốc',
                DiaChi = 'Chưa cấu hình địa chỉ',
                SoDienThoai = 'Chưa cấu hình SĐT',
                MaNganHangBIN = '',
                SoTaiKhoan = '',
                TenNganHang = '',
                TenChuTaiKhoan = ''
            } = settings;
    
            let qrCodeHtml = '';
            if (MaNganHangBIN && SoTaiKhoan && hoaDon.ThanhTien > 0) {
                try {
                    const payload = generateQRCodePayload(MaNganHangBIN, SoTaiKhoan, hoaDon.ThanhTien, hoaDon.MaHoaDon);
                    const qrDataURL = await generateQrCodeDataURL(payload);
                    qrCodeHtml = `
                        <div class="qr-container">
                            <p>Quét mã để thanh toán</p>
                            <img src="${qrDataURL}" alt="VietQR Code" style="width: 50mm; height: 50mm;"/>
                            <div class="bank-info">
                                <p><strong>Ngân hàng:</strong> ${TenNganHang || 'N/A'}</p>
                                <p><strong>Số tài khoản:</strong> ${SoTaiKhoan}</p>
                                <p><strong>Chủ tài khoản:</strong> ${TenChuTaiKhoan || 'N/A'}</p>
                            </div>
                        </div>
                    `;
                } catch (error) {
                    console.error('Không thể tạo mã QR VietQR:', error);
                    qrCodeHtml = `<div class="qr-container"><p style="color:red; font-size: 8pt;">Lỗi tạo mã QR</p></div>`;
                }
            }
    
            try {
                const printWindow = window.open('', '_blank');
                if (!printWindow) {
                    showToast('Popup bị chặn. Vui lòng cho phép popup cho trang này để in.', 'error', 7000);
                    return reject(new Error('Popup bị chặn.'));
                }
    
                printWindow.document.write(`
                    <html>
                        <head>
                            <title>Hóa đơn ${hoaDon.MaHoaDon}</title>
                            <style>
                                @media print { @page { size: 80mm auto; margin: 2mm; } body { margin: 0; color: #000; } }
                                body { font-family: 'Verdana', 'Arial', sans-serif; font-size: 10pt; width: 76mm; }
                                .receipt { text-align: center; }
                                .header, .footer { text-align: center; }
                                h1 { font-size: 12pt; margin: 5px 0; }
                                h2 { font-size: 11pt; margin: 5px 0; }
                                p { margin: 2px 0; }
                                .info { text-align: left; margin-top: 5px; border-top: 1px dashed black; border-bottom: 1px dashed black; padding: 5px 0; }
                                .info p { display: flex; justify-content: space-between; }
                                table { width: 100%; border-collapse: collapse; margin-top: 5px; }
                                th { text-align: left; border-bottom: 1px solid black; }
                                td { padding: 2px 0; }
                                .item-row td { vertical-align: top; font-size: 8pt; }
                                .item-row .price-col { text-align: right; }
                                .summary { margin-top: 5px; border-top: 1px dashed black; padding-top: 5px; }
                                .summary p { display: flex; justify-content: space-between; }
                                .total { font-weight: bold; font-size: 11pt; }
                                .qr-container { margin-top: 10px; display: flex; flex-direction: column; align-items: center; gap: 5px; page-break-inside: avoid; }
                                .qr-container p { font-size: 9pt; }
                                .bank-info { 
                                    text-align: left; 
                                    font-size: 9pt; 
                                    margin-top: 5px; 
                                    border-top: 1px dashed black; 
                                    padding-top: 5px; 
                                    width: 100%;
                                }
                                .bank-info p { margin: 1px 0; }
                            </style>
                        </head>
                        <body>
                            <div class="receipt">
                                <div class="header">
                                    <h1>${TenNhaThuoc}</h1>
                                    <p>${DiaChi}</p>
                                    <p>SĐT: ${SoDienThoai}</p>
                                </div>
                                <h2>HÓA ĐƠN BÁN LẺ</h2>
                                <div class="info">
                                    <p><span>Số HĐ:</span> <span>${hoaDon.MaHoaDon}</span></p>
                                    <p><span>Ngày:</span> <span>${new Date(hoaDon.NgayBan).toLocaleString('vi-VN')}</span></p>
                                    <p><span>Thu ngân:</span> <span>${tenNguoiBan}</span></p>
                                    <p><span>Khách hàng:</span> <span>${tenKhachHang}</span></p>
                                </div>
                                <table>
                                    <thead><tr><th>Tên hàng</th><th style="text-align:right">T.Tiền</th></tr></thead>
                                    <tbody>
                                        ${chiTiet.map((item, index) => `
                                            <tr class="item-row">
                                                <td>${index + 1}. ${item.tenThuoc}<br>${item.soLuong} ${item.donViTinh || ''} x ${formatNumber(item.donGia)}</td>
                                                <td class="price-col">${formatNumber(item.thanhTien)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                                <div class="summary">
                                    <p><span>Tổng tiền hàng:</span> <span>${formatNumber(hoaDon.TongTien)}đ</span></p>
                                    <p><span>Giảm giá:</span> <span>${formatNumber(hoaDon.GiamGia)}đ</span></p>
                                    <p class="total"><span>THÀNH TIỀN:</span> <span>${formatNumber(hoaDon.ThanhTien)}đ</span></p>
                                </div>
                                ${qrCodeHtml}
                                <div class="footer"><p style="margin-top: 10px;">Cảm ơn quý khách!</p></div>
                            </div>
                        </body>
                    </html>`);
                printWindow.document.close();
    
                setTimeout(() => {
                    printWindow.focus();
                    printWindow.print();
                    printWindow.close();
                    resolve();
                }, 250);
            } catch (e) {
                reject(e);
            }
        });
    };
    // --- END SHARED HELPERS ---

    async function renderPOS() {
        updatePageTitle('Bán hàng');
        mainContent.innerHTML = `<p>Đang chuẩn bị giao diện bán hàng...</p>`;

        let danhMucKhachHang, danhMucThuoc, donViQuyDoi;
        let currentCart = [];
        let currentDrugSelection = null;
        let currentAvailableLots = [];
        let totalStockForSelectedDrug = 0;
        let appSettings = appState.cache['appSettings'] || {}; // Use cached settings
        let blockNextQuantityEnter = false; // Flag to handle barcode scanner Enter key
        
        const handleSaveInvoice = async (shouldPrint, status) => {
            const submitBtn = document.getElementById('submit-invoice-btn');
            const printBtn = document.getElementById('submit-invoice-print-btn');
            const debtBtn = document.getElementById('submit-invoice-debt-btn');
            
            if (currentCart.length === 0) {
                showToast('Hóa đơn trống. Vui lòng thêm sản phẩm.', 'error');
                return;
            }

            const maKhachHang = document.getElementById('customer-select').value;
            if (status === 'Ghi nợ' && maKhachHang === 'KHACHLE') {
                showToast('Không thể ghi nợ cho khách lẻ. Vui lòng chọn một khách hàng cụ thể.', 'error');
                return;
            }
        
            submitBtn.disabled = true;
            printBtn.disabled = true;
            if(debtBtn) debtBtn.disabled = true;
            submitBtn.textContent = 'Đang xử lý...';
        
            const subtotal = currentCart.reduce((sum, item) => sum + item.thanhTien, 0);
            const discount = parseFormattedNumber(document.getElementById('summary-discount').value);
            const total = Math.max(0, subtotal - discount);
            const amountPaid = parseFormattedNumber(document.getElementById('summary-payment').value);
            
            const maHoaDon_FE = `HD${new Date().getTime()}`;
            const ngayBan_FE = new Date();
        
            const hoaDonData = {
                maHoaDon: maHoaDon_FE,
                ngayBan: ngayBan_FE.toISOString(),
                MaKhachHang: maKhachHang,
                TongTien: subtotal,
                GiamGia: discount,
                ThanhTien: total,
                NguoiBan: appState.currentUser.MaNhanVien,
                TrangThaiThanhToan: status,
                SoTienDaTra: status === 'Đã thanh toán' ? total : amountPaid,
                GhiChu: `P.thức TT: ${document.getElementById('payment-method').value}`,
                items: currentCart.map(item => ({
                    MaThuoc: item.maThuoc,
                    SoLuong: item.soLuong,
                    DonGia: item.donGia,
                    ThanhTien: item.thanhTien,
                    chiTietLo: item.chiTietLo // Gửi chi tiết lô lên backend
                }))
            };

            const afterSave = () => {
                callAppsScript('addHoaDon', hoaDonData)
                    .then(result => {
                        showToast(`Đã lưu hóa đơn ${result.hoaDon.MaHoaDon} thành công!`, 'success');
                        invalidateCache('HoaDon');
                    })
                    .catch(error => {
                        showToast(`LỖI LƯU HÓA ĐƠN (${hoaDonData.maHoaDon}): ${error.message}`, 'error', 15000);
                    });
            };

            // UI Reset happens first for better UX
            const cartForPrinting = [...currentCart];
            renderPOS();
            showToast('Đang lưu hóa đơn...', 'info');

            if (shouldPrint) {
                try {
                    const customerSelect = document.querySelector('#customer-select'); 
                    const tenKhachHang = maKhachHang === 'KHACHLE' ? 'Khách lẻ' : (danhMucKhachHang.find(kh => kh.MaKhachHang === maKhachHang)?.HoTen || maKhachHang);
                    
                    const printData = {
                        hoaDon: {
                            MaHoaDon: hoaDonData.maHoaDon,
                            NgayBan: ngayBan_FE,
                            TongTien: hoaDonData.TongTien,
                            GiamGia: hoaDonData.GiamGia,
                            ThanhTien: hoaDonData.ThanhTien
                        },
                        chiTiet: cartForPrinting.map(item => ({...item})),
                        tenKhachHang: tenKhachHang,
                        tenNguoiBan: appState.currentUser.HoTen
                    };

                    await printReceipt(printData, appSettings);
                } catch (printError) {
                    console.error("Print failed:", printError);
                    // Toast for popup blocker is handled inside printReceipt
                }
            }
            
            afterSave();
        };

        try {
            // Use pre-cached data. If cache is empty, fetch it once.
            const inventorySummary = appState.cache.inventorySummary || await callAppsScript('getInventorySummary');
            if (!appState.cache.inventorySummary) appState.cache.inventorySummary = inventorySummary;

            const inventoryMap = new Map(inventorySummary.map(item => [item.MaThuoc, item.tongTon]));
            
            [danhMucKhachHang, danhMucThuoc, donViQuyDoi, appSettings] = await Promise.all([
                 getCachedDanhMuc('DanhMucKhachHang'),
                 getCachedDanhMuc('DanhMucThuoc'),
                 getCachedDanhMuc('DonViQuyDoi'),
                 appState.cache['appSettings'] ? Promise.resolve(appState.cache['appSettings']) : callAppsScript('getAppSettings')
            ]);
            if (!appState.cache['appSettings']) appState.cache['appSettings'] = appSettings;
           
            mainContent.innerHTML = `
                <div class="pos-layout">
                    <div class="pos-main">
                        <div class="card">
                            <div class="card-header">
                                <h3>Thông tin sản phẩm</h3>
                                <button class="btn btn-secondary" id="refresh-data-btn" title="Làm mới danh mục"><span class="material-symbols-outlined">refresh</span></button>
                            </div>
                            <div class="card-body">
                                <div class="input-group" style="position: relative;">
                                    <label>Tìm kiếm thuốc (Tên, SĐK, Mã vạch, Hoạt chất)</label>
                                    <input type="search" id="drug-search" placeholder="Gõ từ 2 ký tự trở lên hoặc quét mã vạch..." autocomplete="off">
                                    <div id="drug-suggestions" class="suggestions-dropdown" style="display:none;"></div>
                                </div>
                                <div id="drug-details-grid" style="display: grid; grid-template-columns: 2fr 1fr 1fr 2fr; gap: 15px; align-items: end;">
                                    <div class="input-group">
                                        <label>Đơn vị tính</label>
                                        <select id="drug-unit" disabled></select>
                                    </div>
                                    <div class="input-group">
                                        <label>Số lượng</label>
                                        <input type="number" id="drug-quantity" value="1" min="1" disabled>
                                    </div>
                                    <div class="input-group">
                                        <label>Giá bán</label>
                                        <input type="text" id="drug-price" value="0" disabled style="text-align: right;">
                                    </div>
                                    <button class="btn btn-primary" id="add-to-cart-btn" disabled style="grid-column: 4; height: 46px;">Thêm (Enter)</button>

                                    <!-- LOT INFO DISPLAY -->
                                    <div id="lot-info-container" class="hidden" style="grid-column: 1 / -1; margin-top: 5px;">
                                        <div id="lot-info-display" class="lot-display">
                                            <!-- JS will populate this -->
                                        </div>
                                        <div id="lot-suggestions-dropdown" class="suggestions-dropdown lot-suggestions">
                                            <!-- JS will populate this -->
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="pos-sidebar">
                        <h3>Hóa đơn hiện tại</h3>
                         <div class="input-group">
                            <label for="customer-select">Khách hàng</label>
                            <select id="customer-select">
                                <option value="KHACHLE">Khách lẻ</option>
                                ${generateOptions(danhMucKhachHang, 'MaKhachHang', 'HoTen', null, 'Thêm khách hàng mới...')}
                            </select>
                        </div>
                        <div id="invoice-items-list" class="table-wrapper" style="max-height: 250px; overflow-y: auto;"><p>Chưa có sản phẩm.</p></div>
                        <div id="invoice-summary" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px;">
                            <div style="display: flex; justify-content: space-between;"><span>Tổng tiền hàng:</span><span id="summary-subtotal">0đ</span></div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <label for="summary-discount" style="margin: 0;">Giảm giá:</label>
                                <input type="text" id="summary-discount" value="0" style="width: 120px; text-align: right; padding: 5px;">
                            </div>
                            <div style="display: flex; justify-content: space-between;"><span>Khách cần trả:</span><strong id="summary-total">0đ</strong></div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <label for="summary-payment" style="margin: 0; font-weight: bold;">Khách thanh toán (F8):</label>
                                <input type="text" id="summary-payment" value="0" style="width: 120px; text-align: right; padding: 5px; font-weight: bold;">
                            </div>
                             <div style="display: flex; justify-content: space-between;"><span>Tiền thừa trả khách:</span><span id="summary-change">0đ</span></div>
                             <div style="display: flex; justify-content: space-between; align-items: center;">
                                <label for="payment-method" style="margin: 0;">P.thức T.toán:</label>
                                <select id="payment-method" style="padding: 5px;"><option value="Tiền mặt">Tiền mặt</option><option value="Chuyển khoản">Chuyển khoản</option></select>
                            </div>
                        </div>
                        <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 10px;">
                           <button id="submit-invoice-btn" class="btn btn-success" style="width: 100%;">Thanh toán (F9)</button>
                           <button id="submit-invoice-print-btn" class="btn btn-primary" style="width: 100%;">Thanh toán và in (Ctrl+F9)</button>
                           <button id="submit-invoice-debt-btn" class="btn btn-warning" style="width: 100%; background-color: var(--warning-color);">Ghi nợ (F10)</button>
                        </div>
                    </div>
                </div>
            `;
            
            const drugSearchInput = document.getElementById('drug-search');
            const drugSuggestionsDiv = document.getElementById('drug-suggestions');
            const drugUnitSelect = document.getElementById('drug-unit');
            const drugQuantityInput = document.getElementById('drug-quantity');
            const drugPriceInput = document.getElementById('drug-price');
            const addToCartBtn = document.getElementById('add-to-cart-btn');
            const lotInfoContainer = document.getElementById('lot-info-container');
            const lotInfoDisplay = document.getElementById('lot-info-display');
            const lotSuggestionsDropdown = document.getElementById('lot-suggestions-dropdown');

            const summaryDiscountInput = document.getElementById('summary-discount');
            const summaryPaymentInput = document.getElementById('summary-payment');
            const submitInvoiceBtn = document.getElementById('submit-invoice-btn');
            const submitInvoicePrintBtn = document.getElementById('submit-invoice-print-btn');
            const submitInvoiceDebtBtn = document.getElementById('submit-invoice-debt-btn');
            
            setupNumericInputFormatting(summaryDiscountInput);
            setupNumericInputFormatting(summaryPaymentInput);
            setupNumericInputFormatting(drugPriceInput);

            const updateSummary = () => {
                const subtotal = currentCart.reduce((sum, item) => sum + item.thanhTien, 0);
                const discount = parseFormattedNumber(summaryDiscountInput.value);
                const total = Math.max(0, subtotal - discount);
                const payment = parseFormattedNumber(summaryPaymentInput.value);
                const change = Math.max(0, payment - total);

                document.getElementById('summary-subtotal').textContent = `${formatNumber(subtotal)}đ`;
                document.getElementById('summary-total').textContent = `${formatNumber(total)}đ`;
                document.getElementById('summary-change').textContent = `${formatNumber(change)}đ`;
            };
            
            const renderCart = () => {
                const cartListEl = document.getElementById('invoice-items-list');
                if (currentCart.length === 0) {
                    cartListEl.innerHTML = '<p>Chưa có sản phẩm.</p>';
                } else {
                    cartListEl.innerHTML = `
                        <table style="font-size: 0.9rem;">
                            <thead><tr><th>Tên thuốc</th><th>SL</th><th>Đ.Giá</th><th>T.Tiền</th><th></th></tr></thead>
                            <tbody>
                            ${currentCart.map((item, index) => `
                                <tr>
                                    <td>${item.tenThuoc} (${item.donViTinh})</td>
                                    <td>${item.soLuong}</td>
                                    <td>${formatNumber(item.donGia)}</td>
                                    <td>${formatNumber(item.thanhTien)}</td>
                                    <td><button type="button" class="btn-remove-item" data-index="${index}" style="background:none;border:none;color:var(--danger-color);cursor:pointer;font-size:1.2rem;line-height:1;">&times;</button></td>
                                </tr>`).join('')}
                            </tbody>
                        </table>`;
                }
                updateSummary();
            };
            
            const selectDrug = async (maThuoc) => {
                currentDrugSelection = danhMucThuoc.find(t => t.MaThuoc === maThuoc);
                drugSearchInput.value = currentDrugSelection.TenThuoc;
                drugSuggestionsDiv.innerHTML = '';
                drugSuggestionsDiv.style.display = 'none';
                
                let units = donViQuyDoi.filter(dv => dv.MaThuoc === maThuoc);
                if (units.length === 0) {
                     units.push({ MaThuoc: maThuoc, DonViTinh: currentDrugSelection.DonViCoSo, TyLeQuyDoi: 1, GiaBan: 0 });
                }
                drugUnitSelect.innerHTML = generateOptions(units, 'DonViTinh', 'DonViTinh');
                drugUnitSelect.disabled = false;
                drugQuantityInput.disabled = false;
                drugPriceInput.disabled = false;
                addToCartBtn.disabled = false;
                drugUnitSelect.dispatchEvent(new Event('change'));
                drugUnitSelect.focus();

                // Fetch and display lot info
                lotInfoContainer.classList.remove('hidden');
                lotInfoDisplay.innerHTML = '<small>Đang tải thông tin lô...</small>';
                try {
                    currentAvailableLots = await callAppsScript('getInventoryDetail', { maThuoc });
                    totalStockForSelectedDrug = currentAvailableLots.reduce((sum, lot) => sum + (Number(lot.SoLuong) || 0), 0);

                    if (currentAvailableLots.length > 0) {
                        const recommendedLot = currentAvailableLots[0];
                        lotInfoDisplay.innerHTML = `
                            <small style="display: block; font-weight: 500;">Lô đề xuất (HSD gần nhất) <span class="material-symbols-outlined" style="font-size: 1rem; vertical-align: middle;">expand_more</span></small>
                            <span>Lô: <strong>${recommendedLot.SoLo}</strong> | Tồn: <strong>${recommendedLot.SoLuong}</strong> ${currentDrugSelection.DonViCoSo} | HSD: <strong>${new Date(recommendedLot.HanSuDung).toLocaleDateString('vi-VN')}</strong></span>
                        `;
                        lotSuggestionsDropdown.innerHTML = currentAvailableLots.map(lot => `
                            <div class="suggestion-item lot-item">
                                <span>Lô: <strong>${lot.SoLo}</strong> | Tồn: <strong>${lot.SoLuong}</strong> | HSD: <strong>${new Date(lot.HanSuDung).toLocaleDateString('vi-VN')}</strong></span>
                            </div>
                        `).join('');

                    } else {
                        lotInfoDisplay.innerHTML = `<span style="color: var(--danger-color);">Sản phẩm đã hết hàng.</span>`;
                    }
                } catch (e) {
                    lotInfoDisplay.innerHTML = `<span style="color: var(--danger-color);">Lỗi tải thông tin lô.</span>`;
                }

            };

            drugUnitSelect.addEventListener('change', () => {
                 const donViTinh = drugUnitSelect.value;
                 const unitInfo = donViQuyDoi.find(dv => dv.MaThuoc === currentDrugSelection?.MaThuoc && dv.DonViTinh === donViTinh);
                 const price = unitInfo ? (unitInfo.GiaBan || 0) : 0;
                 drugPriceInput.value = formatNumber(price);
            });
            
            drugSearchInput.addEventListener('input', () => {
                const term = drugSearchInput.value.trim();
                const normalizedTerm = removeDiacritics(term.toLowerCase());
                lotInfoContainer.classList.add('hidden'); // Hide lot info when searching

                const barcodeMatch = donViQuyDoi.find(dv => dv.MaVach && dv.MaVach === term);
                if(barcodeMatch) {
                    blockNextQuantityEnter = true; // Set flag for barcode scan
                    selectDrug(barcodeMatch.MaThuoc);
                    drugUnitSelect.value = barcodeMatch.DonViTinh;
                    drugUnitSelect.dispatchEvent(new Event('change'));
                    drugQuantityInput.focus();
                    drugQuantityInput.select();
                    return;
                }

                if (term.length < 2) {
                    drugSuggestionsDiv.style.display = 'none';
                    return;
                }
                
                let results = danhMucThuoc.filter(thuoc => {
                    return removeDiacritics(thuoc.TenThuoc.toLowerCase()).includes(normalizedTerm) ||
                           (thuoc.HoatChat && removeDiacritics(thuoc.HoatChat.toLowerCase()).includes(normalizedTerm)) ||
                           (thuoc.SoDangKy && removeDiacritics(thuoc.SoDangKy.toLowerCase()).includes(normalizedTerm));
                });
                
                // Prioritize items in stock
                results.sort((a, b) => (inventoryMap.get(b.MaThuoc) || 0) - (inventoryMap.get(a.MaThuoc) || 0));

                drugSuggestionsDiv.innerHTML = results.slice(0, 10).map((thuoc, index) => {
                    const stock = inventoryMap.get(thuoc.MaThuoc) || 0;
                    const stockDisplay = stock > 0 ? `(Tồn: ${stock})` : '(Hết hàng)';
                    return `<div class="suggestion-item ${index === 0 ? 'selected' : ''}" data-ma-thuoc="${thuoc.MaThuoc}">
                        <strong>${thuoc.TenThuoc} <span style="color: ${stock > 0 ? 'var(--success-color)' : 'var(--danger-color)'};">${stockDisplay}</span></strong><br>
                        <small>${thuoc.HoatChat || ''} ${thuoc.HamLuong || ''} - SĐK: ${thuoc.SoDangKy || 'N/A'}</small>
                    </div>`;
                }).join('');
                drugSuggestionsDiv.style.display = results.length > 0 ? 'block' : 'none';
            });
            
            drugSuggestionsDiv.addEventListener('click', e => {
                const item = e.target.closest('.suggestion-item');
                if (!item) return;
                selectDrug(item.dataset.maThuoc);
            });

            addToCartBtn.addEventListener('click', () => {
                 if (!currentDrugSelection) return;
                 const soLuong = parseInt(drugQuantityInput.value, 10);
                 const donViTinh = drugUnitSelect.value;
                 const donGia = parseFormattedNumber(drugPriceInput.value);

                 if (isNaN(soLuong) || soLuong <= 0) {
                     showToast('Số lượng không hợp lệ', 'error');
                     return;
                 }
                 const unitInfo = donViQuyDoi.find(dv => dv.MaThuoc === currentDrugSelection.MaThuoc && dv.DonViTinh === donViTinh) || { TyLeQuyDoi: 1 };
                 const soLuongBanQuyDoi = soLuong * (unitInfo.TyLeQuyDoi);

                 if (soLuongBanQuyDoi > totalStockForSelectedDrug) {
                    showToast(`Không đủ tồn kho. Chỉ còn ${totalStockForSelectedDrug} ${currentDrugSelection.DonViCoSo}.`, 'error');
                    return;
                 }

                 // NEW: Allocate quantity across available lots (FEFO)
                const chiTietLo = [];
                let soLuongConLaiCanLay = soLuongBanQuyDoi;

                for (const lot of currentAvailableLots) {
                    if (soLuongConLaiCanLay <= 0) break;

                    const soLuongTrongLo = Number(lot.SoLuong);
                    const soLuongLayTuLoNay = Math.min(soLuongTrongLo, soLuongConLaiCanLay);
                    
                    if (soLuongLayTuLoNay > 0) {
                        chiTietLo.push({
                            soLo: lot.SoLo,
                            soLuongQuyDoi: soLuongLayTuLoNay
                        });
                    }
                    
                    soLuongConLaiCanLay -= soLuongLayTuLoNay;
                }

                 currentCart.push({
                     maThuoc: currentDrugSelection.MaThuoc,
                     tenThuoc: currentDrugSelection.TenThuoc,
                     soLuong: soLuong,
                     donViTinh: donViTinh,
                     donGia: donGia,
                     thanhTien: soLuong * donGia,
                     chiTietLo: chiTietLo // Add lot details to the cart item
                 });

                 renderCart();
                 drugSearchInput.value = '';
                 drugUnitSelect.innerHTML = '';
                 drugUnitSelect.disabled = true;
                 drugQuantityInput.value = 1;
                 drugQuantityInput.disabled = true;
                 drugPriceInput.value = '0';
                 drugPriceInput.disabled = true;
                 addToCartBtn.disabled = true;
                 currentDrugSelection = null;
                 lotInfoContainer.classList.add('hidden');
                 lotSuggestionsDropdown.style.display = 'none';
                 drugSearchInput.focus();
            });
            
            lotInfoDisplay.addEventListener('click', () => {
                lotSuggestionsDropdown.style.display = lotSuggestionsDropdown.style.display === 'block' ? 'none' : 'block';
            });

            document.getElementById('invoice-items-list').addEventListener('click', e => {
                if(e.target.classList.contains('btn-remove-item')) {
                    currentCart.splice(parseInt(e.target.dataset.index, 10), 1);
                    renderCart();
                }
            });

            summaryDiscountInput.addEventListener('input', updateSummary);
            summaryPaymentInput.addEventListener('input', updateSummary);

            document.getElementById('customer-select').addEventListener('change', e => {
                if (e.target.value === '--add-new--') {
                    showAddCustomerModal(async (newCustomerId) => {
                        const customerSelect = document.getElementById('customer-select');
                        const updatedCustomers = await getCachedDanhMuc('DanhMucKhachHang', true);
                        customerSelect.innerHTML = `<option value="KHACHLE">Khách lẻ</option>${generateOptions(updatedCustomers, 'MaKhachHang', 'HoTen', newCustomerId, 'Thêm khách hàng mới...')}`;
                    });
                }
            });

            document.getElementById('refresh-data-btn').addEventListener('click', async () => {
                showToast('Đang làm mới dữ liệu...', 'info');
                try {
                    // Invalidate all caches relevant to this page
                    invalidateCache('DanhMucThuoc');
                    invalidateCache('DonViQuyDoi');
                    invalidateCache('DanhMucKhachHang');
                    invalidateCache('CaiDat');
                    delete appState.cache['inventorySummary'];
                    delete appState.cache['appSettings'];

                    await renderPOS(); // Re-running this will trigger the API calls for now-empty caches
                    showToast('Làm mới dữ liệu thành công!', 'success');
                } catch(e) {
                    showToast(`Lỗi khi làm mới: ${e.message}`, 'error');
                }
            });
            
            drugSearchInput.addEventListener('keydown', (e) => {
                const suggestions = drugSuggestionsDiv.querySelectorAll('.suggestion-item');
                if (suggestions.length === 0) return;
                let selected = drugSuggestionsDiv.querySelector('.selected');
                
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (selected && selected.nextElementSibling) {
                        selected.classList.remove('selected');
                        selected.nextElementSibling.classList.add('selected');
                    }
                } else if (e.key === 'ArrowUp') {
                     e.preventDefault();
                    if (selected && selected.previousElementSibling) {
                        selected.classList.remove('selected');
                        selected.previousElementSibling.classList.add('selected');
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if(selected) selectDrug(selected.dataset.maThuoc);
                }
            });

            drugUnitSelect.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    drugQuantityInput.focus();
                    drugQuantityInput.select();
                }
            });

            drugQuantityInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (blockNextQuantityEnter) {
                        blockNextQuantityEnter = false; // Consume the block and do nothing
                        return;
                    }
                    drugPriceInput.focus();
                    drugPriceInput.select();
                }
            });

            drugPriceInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addToCartBtn.click();
                }
            });
            
            document.addEventListener('keydown', (e) => {
                const target = e.target;
                if (window.location.hash !== '#banhang' || (target.tagName === 'INPUT' && target.type !== 'search') || target.tagName === 'SELECT') return;

                if (e.key === 'F8') {
                    e.preventDefault();
                    summaryPaymentInput.focus();
                    summaryPaymentInput.select();
                } else if (e.key === 'F9' && !e.ctrlKey) {
                    e.preventDefault();
                    submitInvoiceBtn.click();
                } else if (e.key === 'F9' && e.ctrlKey) {
                    e.preventDefault();
                    submitInvoicePrintBtn.click();
                } else if (e.key === 'F10') {
                    e.preventDefault();
                    submitInvoiceDebtBtn.click();
                }
            });
            
            submitInvoiceBtn.addEventListener('click', () => handleSaveInvoice(false, 'Đã thanh toán'));
            submitInvoicePrintBtn.addEventListener('click', () => handleSaveInvoice(true, 'Đã thanh toán'));
            submitInvoiceDebtBtn.addEventListener('click', () => handleSaveInvoice(false, 'Ghi nợ'));
            
            drugSearchInput.focus();

        } catch (error) {
            mainContent.innerHTML = `<div class="card" style="color: var(--danger-color);"><p><strong>Lỗi khi tải dữ liệu trang bán hàng:</strong> ${error.message}</p></div>`;
        }
    }

    async function renderInvoices() {
        updatePageTitle('Hóa đơn');
    
        if (!appState.cache.invoicesPageState) {
            appState.cache.invoicesPageState = {
                currentPage: 1,
                itemsPerPage: 12,
            };
        }
        const state = appState.cache.invoicesPageState;
    
        const render = () => {
            const allInvoices = (appState.cache.HoaDon || []).sort((a, b) => new Date(b.NgayBan) - new Date(a.NgayBan));
            const allUsers = appState.cache.allUsers || [];
            const nhanSuMap = new Map(allUsers.map(user => [user.MaNhanVien, user.HoTen]));
    
            state.totalRecords = allInvoices.length;
            state.totalPages = Math.ceil(state.totalRecords / state.itemsPerPage) || 1;
            if (state.currentPage > state.totalPages) {
                state.currentPage = state.totalPages;
            }
    
            const { currentPage, itemsPerPage, totalRecords, totalPages } = state;
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const pageData = allInvoices.slice(startIndex, endIndex);
    
            const userRole = appState.currentUser?.Quyen;
            const canDelete = userRole === 'Quản trị' || userRole === 'Admin';
    
            const tableRows = pageData.map(inv => `
                <tr data-ma-hd="${inv.MaHoaDon}">
                    <td>${inv.MaHoaDon}</td>
                    <td>${inv.MaKhachHang}</td>
                    <td>${(inv.ThanhTien || 0).toLocaleString('vi-VN')}đ</td>
                    <td>${new Date(inv.NgayBan).toLocaleString('vi-VN')}</td>
                    <td>${nhanSuMap.get(inv.NguoiBan) || inv.NguoiBan}</td>
                    <td>${inv.TrangThaiThanhToan || 'N/A'}</td>
                    <td class="action-cell">
                        <div class="action-menu">
                            <button class="btn-actions"><span class="material-symbols-outlined">more_vert</span></button>
                            <div class="action-menu-dropdown">
                                <a href="#" class="action-item" data-action="view"><span class="material-symbols-outlined">visibility</span>Xem chi tiết</a>
                                <a href="#" class="action-item" data-action="print"><span class="material-symbols-outlined">print</span>In phiếu</a>
                                ${canDelete ? `<a href="#" class="action-item" data-action="delete"><span class="material-symbols-outlined">delete</span>Xóa phiếu</a>` : ''}
                            </div>
                        </div>
                    </td>
                </tr>
            `).join('');
    
            mainContent.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <h3>Danh sách hóa đơn</h3>
                        <div style="display: flex; gap: 10px;">
                            <input type="search" id="invoice-search" placeholder="Tìm kiếm hóa đơn..." disabled>
                            <button id="refresh-invoices-btn" class="btn btn-secondary"><span class="material-symbols-outlined">refresh</span></button>
                        </div>
                    </div>
                    <div class="card-body table-wrapper">
                        <table>
                            <thead><tr><th>Mã HĐ</th><th>Khách hàng</th><th>Thành tiền</th><th>Ngày bán</th><th>Người bán</th><th>Trạng thái</th><th class="action-cell">Hành động</th></tr></thead>
                            <tbody id="hoa-don-tbody">${tableRows}</tbody>
                        </table>
                    </div>
                    <div class="pagination-controls">
                        <div class="page-size">
                            <label for="items-per-page-select">Số dòng:</label>
                            <select id="items-per-page-select">
                                <option value="12" ${itemsPerPage === 12 ? 'selected' : ''}>12</option>
                                <option value="24" ${itemsPerPage === 24 ? 'selected' : ''}>24</option>
                                <option value="60" ${itemsPerPage === 60 ? 'selected' : ''}>60</option>
                            </select>
                        </div>
                        <div class="page-info">
                            <span>Hiển thị ${totalRecords > 0 ? startIndex + 1 : 0}-${Math.min(endIndex, totalRecords)} của ${totalRecords}</span>
                        </div>
                        <div class="page-nav">
                             <button class="btn btn-secondary" id="prev-page" ${currentPage === 1 ? 'disabled' : ''}>Trước</button>
                             <span style="margin: 0 10px;">Trang ${currentPage} / ${totalPages}</span>
                             <button class="btn btn-secondary" id="next-page" ${currentPage >= totalPages ? 'disabled' : ''}>Sau</button>
                        </div>
                    </div>
                </div>
            `;
    
            const changePage = (newPage) => {
                if (newPage < 1 || newPage > state.totalPages) return;
                state.currentPage = newPage;
                render();
            };
    
            document.getElementById('hoa-don-tbody').addEventListener('click', e => {
                const actionItem = e.target.closest('.action-item');
                if (actionItem) {
                    e.preventDefault();
                    const action = actionItem.dataset.action;
                    const maHD = actionItem.closest('tr').dataset.maHd;
                    handleHoaDonAction(action, maHD, render);
                }
            });
    
            document.getElementById('refresh-invoices-btn').addEventListener('click', async () => {
                showToast('Đang làm mới danh sách hóa đơn...', 'info');
                await getCachedDanhMuc('HoaDon', true);
                state.currentPage = 1;
                render();
                showToast('Làm mới thành công!', 'success');
            });
            document.getElementById('prev-page').addEventListener('click', () => changePage(state.currentPage - 1));
            document.getElementById('next-page').addEventListener('click', () => changePage(state.currentPage + 1));
            document.getElementById('items-per-page-select').addEventListener('change', (e) => {
                state.itemsPerPage = parseInt(e.target.value, 10);
                state.currentPage = 1;
                render();
            });
        };
    
        mainContent.innerHTML = `<div class="card"><p>Đang tải danh sách hóa đơn...</p></div>`;
    
        if (appState.cache.HoaDon) {
            render();
        } else {
            showToast('Đang tải dữ liệu hóa đơn lần đầu...', 'info');
            await getCachedDanhMuc('HoaDon', true);
            render();
        }
    }


    const handleHoaDonAction = async (action, maHD, onActionSuccess) => {
        let appSettings = appState.cache['appSettings'] || {};
        switch(action) {
            case 'view':
                const modalContent = await renderHoaDonDetailForModal(maHD);
                showModal(`Chi tiết hóa đơn ${maHD}`, modalContent, { size: '800px' });
                break;
            case 'print':
                try {
                    showToast(`Đang chuẩn bị in hóa đơn ${maHD}...`, 'info');
                    const [detail, allThuoc] = await Promise.all([
                        callAppsScript('getHoaDonDetail', { maHoaDon: maHD }),
                        getCachedDanhMuc('DanhMucThuoc')
                    ]);
                    const thuocMap = new Map(allThuoc.map(t => [t.MaThuoc, t]));
                    
                    const printData = {
                        hoaDon: detail.hoaDon,
                        chiTiet: detail.chiTiet.map(item => ({
                            tenThuoc: item.TenThuoc,
                            donViTinh: thuocMap.get(item.MaThuoc)?.DonViCoSo || '', // Lấy ĐV cơ sở làm đơn vị bán
                            soLuong: item.SoLuong,
                            donGia: item.DonGia,
                            thanhTien: item.ThanhTien
                        })),
                        tenKhachHang: detail.hoaDon.TenKhachHang,
                        tenNguoiBan: detail.hoaDon.TenNguoiBan
                    };
                    await printReceipt(printData, appSettings);
                } catch(e) {
                    showToast(`Lỗi khi in: ${e.message}`, 'error');
                }
                break;
            case 'delete':
                if (confirm(`Bạn có chắc chắn muốn xóa hóa đơn ${maHD}? Thao tác này sẽ hoàn trả thuốc vào kho và không thể hoàn tác.`)) {
                    showToast(`Đang xóa hóa đơn ${maHD}...`, 'info');
                    try {
                        const result = await callAppsScript('deleteHoaDon', { maHoaDon: maHD });
                        showToast(result.message, 'success');
                        if (onActionSuccess) onActionSuccess();
                    } catch (e) {
                        showToast(`Lỗi khi xóa: ${e.message}`, 'error');
                    }
                }
                break;
        }
    };
    
    async function renderHoaDonDetailForModal(maHD) {
        try {
            const { hoaDon, chiTiet } = await callAppsScript('getHoaDonDetail', { maHoaDon: maHD });
             return `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 15px;">
                    <p><strong>Mã hóa đơn:</strong> ${hoaDon.MaHoaDon}</p>
                    <p><strong>Khách hàng:</strong> ${hoaDon.TenKhachHang || hoaDon.MaKhachHang}</p>
                    <p><strong>Ngày bán:</strong> ${new Date(hoaDon.NgayBan).toLocaleString('vi-VN')}</p>
                    <p><strong>Người bán:</strong> ${hoaDon.TenNguoiBan}</p>
                    <p><strong>Tổng tiền:</strong> ${hoaDon.TongTien.toLocaleString('vi-VN')}đ</p>
                    <p><strong>Giảm giá:</strong> ${hoaDon.GiamGia.toLocaleString('vi-VN')}đ</p>
                    <p><strong>Thành tiền:</strong> ${hoaDon.ThanhTien.toLocaleString('vi-VN')}đ</p>
                    <p><strong>Trạng thái:</strong> ${hoaDon.TrangThaiThanhToan || 'N/A'}</p>
                    <p><strong>Đã trả:</strong> ${(hoaDon.SoTienDaTra || 0).toLocaleString('vi-VN')}đ</p>
                </div>
                <h4>Chi tiết hàng hóa:</h4>
                <div class="table-wrapper">
                    <table>
                        <thead><tr><th>Tên thuốc</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
                        <tbody>
                        ${chiTiet.map(item => `
                            <tr>
                                <td>${item.TenThuoc}</td>
                                <td>${item.SoLuong}</td>
                                <td>${item.DonGia.toLocaleString('vi-VN')}đ</td>
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

    return {
        banhang: renderPOS,
        hoadon: renderInvoices,
    }
}
