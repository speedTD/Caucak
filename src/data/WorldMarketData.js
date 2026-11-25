// HỆ THỐNG CHỢ THẾ GIỚI (WORLD MARKET) & KHẾ ƯỚC CHỦ HỒ CÂU ĐÀI
// Mua bán cần/phao/mồi/phụ kiện của cần thủ khác + Mua Khế Ước làm Chủ Hồ thu chi thực tế!

export const LAKE_DEEDS = [
    {
        lakeId: 'lake_duy_nguyen',
        lakeName: 'Hồ Câu Duy Nguyên',
        price: 3500000,
        baseTicket: 250000,
        baseAnglersPerHour: 6,
        stockCost: 450000,
        desc: 'Hồ thể thao đông khách bậc nhất Thanh Trì, doanh thu vé đều đặn mỗi giờ.'
    },
    {
        lakeId: 'lake_bao_minh',
        lakeName: 'Hồ Câu Bảo Minh',
        price: 4200000,
        baseTicket: 250000,
        baseAnglersPerHour: 7,
        stockCost: 480000,
        desc: 'Hồ sinh thái xanh mát Đông Anh, khách gia đình và đài thủ ngồi kín bến.'
    },
    {
        lakeId: 'lake_dai_yen',
        lakeName: 'Hồ Câu Đại Yên',
        price: 5800000,
        baseTicket: 300000,
        baseAnglersPerHour: 7,
        stockCost: 600000,
        desc: 'Thánh địa Trắm Đen rãnh sâu Chương Mỹ, vé ca 300k, lãi rất đậm.'
    },
    {
        lakeId: 'lake_thuy_huong',
        lakeName: 'Hồ Thụy Hương',
        price: 6500000,
        baseTicket: 300000,
        baseAnglersPerHour: 8,
        stockCost: 650000,
        desc: 'Đầm rộng tự nhiên nhiều quái vật Trắm Đen & Chép Củ, khách săn hàng cực mê.'
    },
    {
        lakeId: 'lake_cu_gau',
        lakeName: 'Hồ Câu Củ Gấu',
        price: 8200000,
        baseTicket: 350000,
        baseAnglersPerHour: 9,
        stockCost: 750000,
        desc: 'Thương hiệu săn chép củ lừng danh, vé 350k/ca, doanh thu cao ngất ngưởng.'
    },
    {
        lakeId: 'lake_hoan_boss',
        lakeName: 'Hồ Câu Hoàn Boss (VIP)',
        price: 12000000,
        baseTicket: 500000,
        baseAnglersPerHour: 10,
        stockCost: 950000,
        desc: 'Hồ VIP đại khai trương vé 500k/5h — mỏ vàng thực sự cho Đại Gia Chủ Hồ!'
    }
];

export const INITIAL_WORLD_MARKET_LISTINGS = [
    // Cần & Phao cần thủ khác rao bán lại (giá hời hơn nâng cấp trực tiếp!)
    {
        id: 'wm_rod_1',
        tab: 'gear',
        seller: 'Hoàng Đài Thủ 6H',
        name: 'Cần Handing La Văn Cương Gen 3 (5.4m • 5H)',
        condition: 'Mới 96% • Ký gửi',
        price: 310000,
        icon: '🎣',
        rewardType: 'UPGRADE_LEVEL',
        equipKey: 'rod',
        targetLevel: 2,
        desc: 'Lên đời cần 6H nên để lại cây La Văn Cương 5H zin chưa gãy lóng nào.'
    },
    {
        id: 'wm_rod_2',
        tab: 'gear',
        seller: 'Lâm Lục Hương',
        name: 'Cần Kaiwo Kiếm Vũ Lý Chiến (5.4m • LRC Nhật)',
        condition: 'Mới 98% • Hàng Tuyển',
        price: 620000,
        icon: '🎣',
        rewardType: 'UPGRADE_LEVEL',
        equipKey: 'rod',
        targetLevel: 3,
        desc: 'Vợ gọi về trông con cần pass nhanh cây Kaiwo xanh ngọc bích siêu nhẹ!'
    },
    {
        id: 'wm_rod_3',
        tab: 'gear',
        seller: 'Đức Vua Câu',
        name: 'Cần GUF Hắc Bạch Gen 2 (6.3m • 5.5H)',
        condition: 'Mới 95% • Full Bao',
        price: 990000,
        icon: '🎣',
        rewardType: 'UPGRADE_LEVEL',
        equipKey: 'rod',
        targetLevel: 4,
        desc: 'Hàng săn chép củ cực nảy, bao test cong chữ C tại hồ!'
    },
    {
        id: 'wm_float_1',
        tab: 'gear',
        seller: 'Bác Năm Chương Mỹ',
        name: 'Phao Cỏ Sậy Tự Nhiên 13 Nấc (Chuyên Cá Nhát)',
        condition: 'Mới 99%',
        price: 420000,
        icon: '📍',
        rewardType: 'UPGRADE_LEVEL',
        equipKey: 'float',
        targetLevel: 3,
        desc: 'Phao cỏ thửa riêng đánh mùa cá nhát, bắt nhịp 0.5 nấc chuẩn đét.'
    },
    {
        id: 'wm_float_2',
        tab: 'gear',
        seller: 'Tuấn Củ Gấu',
        name: 'Phao Lông Công Đấu Giải Tăm Rỗng Mập',
        condition: 'Mới 97%',
        price: 750000,
        icon: '📍',
        rewardType: 'UPGRADE_LEVEL',
        equipKey: 'float',
        targetLevel: 4,
        desc: 'Tăm rỗng to sáng rõ ngồi xa nhìn nét căng, chống sóng tốt.'
    },
    {
        id: 'wm_pad_1',
        tab: 'gear',
        seller: 'Hùng Béo Thanh Trì',
        name: 'Pad Inox 3 Tầng Vuốt Mồi Pro',
        condition: 'Mới 95%',
        price: 560000,
        icon: '🍽️',
        rewardType: 'UPGRADE_LEVEL',
        equipKey: 'baitPad',
        targetLevel: 3,
        desc: 'Pass lại bộ pad 3 tầng inox nam châm hút cực mạnh, kèm khăn lau.'
    },
    {
        id: 'wm_umb_1',
        tab: 'gear',
        seller: 'Minh Râu Đông Anh',
        name: 'Ô Câu Đài 2 Tầng Thoáng Gió 2.4m Chống UV',
        condition: 'Mới 96%',
        price: 640000,
        icon: '⛱️',
        rewardType: 'UPGRADE_LEVEL',
        equipKey: 'umbrella',
        targetLevel: 3,
        desc: 'Ô 2 tầng không sợ gió lật, che mưa rào ngồi câu cực chill.'
    },
    // Tab Mồi & Trục Thẻo Chợ Thế Giới
    {
        id: 'wm_bait_1',
        tab: 'bait',
        seller: 'Đại Lý Sa Phạm HN',
        name: 'Combo 5 Gói Cám Chép Phú Thành + 2 Chai Lục Hương',
        condition: 'Mới 100%',
        price: 290000,
        icon: '🥣',
        rewardType: 'BAIT_PACK',
        items: { pt_moi_chep_so_1: 5, sp_luc_huong: 2 },
        desc: 'Combo giá sỉ Chợ Thế Giới, tiết kiệm hơn mua lẻ ngoài tiệm!'
    },
    {
        id: 'wm_bait_2',
        tab: 'bait',
        seller: 'Xưởng Ốc Ngâm Đại Yên',
        name: 'Combo Săn Trắm Đen (4 Gói Ốc Ngâm + 3 Gói Ngô Ủ Men)',
        condition: 'Ủ Chín Đều',
        price: 260000,
        icon: '🐌',
        rewardType: 'BAIT_PACK',
        items: { base_oc_ngam: 4, base_ngo_u_men: 3 },
        desc: 'Mồi thửa chuyên săn cụ Trắm Đen & Chép Củ rãnh sâu.'
    },
    {
        id: 'wm_line_1',
        tab: 'bait',
        seller: 'Tiệm Cước Nhật 247',
        name: 'Combo Săn Hàng (2 Bộ Trục 5.0 + 10 Thẻo 4.0)',
        condition: 'Mới 100%',
        price: 165000,
        icon: '🧵',
        rewardType: 'RIG_PACK',
        mainLineSize: 5,
        mainLineQty: 2,
        leaderSize: 4,
        leaderQty: 10,
        desc: 'Trục 5.0 tải cá 25kg + 10 thẻo 4.0 tải cá 20kg — giá ưu đãi Chợ Thế Giới!'
    },
    {
        id: 'wm_line_2',
        tab: 'bait',
        seller: 'Thủy Quái Fishing',
        name: 'Combo Thủy Quái (2 Bộ Trục 8.0 + 10 Thẻo 7.0)',
        condition: 'Mới 100%',
        price: 175000,
        icon: '🧵',
        rewardType: 'RIG_PACK',
        mainLineSize: 8,
        mainLineQty: 2,
        leaderSize: 7,
        leaderQty: 10,
        desc: 'Trục 8.0 tải cá 40kg + 10 thẻo 7.0 tải cá 35kg, cân mọi cụ cá Boss!'
    }
];

export function getDefaultOwnedLakesState() {
    // { [lakeId]: { ticketPrice, vaultMoney, totalIncome, totalExpense, anglersCount, stockBoostTimer } }
    return {};
}
