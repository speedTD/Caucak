// Dữ liệu Cửa hàng Đồ Câu Đài & Hương Liệu Chuẩn Việt Nam

export const BRANDS = {
    KIM_LONG: 'Kim Long',
    SA_PHAM: 'Sa Phạm',
    VUA_CAU: 'Vua Câu',
    GUF: 'Gấu Vương (GUF)',
    PHU_THANH: 'Phú Thành',
    EQUIPMENT: 'Thiết Bị Đài Thủ'
};

export const BAIT_SHOP_ITEMS = [
    // ==================== KIM LONG ====================
    {
        id: 'kl_sua_ngo',
        name: 'Sữa Ngô Ngọt Kim Long',
        brand: BRANDS.KIM_LONG,
        category: 'flavor',
        flavorType: 'sweet_corn',
        price: 85000,
        volume: '150ml',
        icon: '🌽',
        description: 'Vị ngô ngọt sữa đậm đặc, làm dậy mùi thơm ngào ngạt cả một vùng nước, chuyên kích thích cá chép mới thả và chép ta đói mồi.',
        attraction: { carp: 88, bigCarp: 75, grassCarp: 85 },
        diffusion: 85, // Độ lan tỏa mùi (mét)
        suggestedDrops: 5
    },
    {
        id: 'kl_mat_khoai',
        name: 'Mật Khoai Ngọt Kim Long',
        brand: BRANDS.KIM_LONG,
        category: 'flavor',
        flavorType: 'sweet_potato',
        price: 90000,
        volume: '120ml',
        icon: '🍠',
        description: 'Chiết xuất mật khoai dẻo ngọt cô đặc, lưu giữ hương thơm ở tầng đáy hồ, sát thủ số 1 của các cụ chép củ ranh ma.',
        attraction: { carp: 90, bigCarp: 96, grassCarp: 70 },
        diffusion: 70,
        suggestedDrops: 4
    },
    {
        id: 'kl_tuong_sua',
        name: 'Tương Sữa Thơm Kim Long',
        brand: BRANDS.KIM_LONG,
        category: 'flavor',
        flavorType: 'milky',
        price: 85000,
        volume: '150ml',
        icon: '🥛',
        description: 'Vị tương sữa béo ngậy, tạo màng mây sữa khuếch tán dẫn dụ chép từ xa bơi vào ổ xả.',
        attraction: { carp: 82, bigCarp: 85, grassCarp: 78 },
        diffusion: 92,
        suggestedDrops: 5
    },
    {
        id: 'kl_chep_hoa_qua',
        name: 'Chép Hoa Quả Thơm Kim Long',
        brand: BRANDS.KIM_LONG,
        category: 'flavor',
        flavorType: 'fruity',
        price: 80000,
        volume: '150ml',
        icon: '🍎',
        description: 'Vị trái cây chín nhiệt đới thanh mát, giải độc ổ câu khi hồ bị đặc cặn bùn, hiệu quả cực cao vào ngày nắng gắt oi bức.',
        attraction: { carp: 86, bigCarp: 80, grassCarp: 88 },
        diffusion: 88,
        suggestedDrops: 4
    },
    {
        id: 'kl_sua_non',
        name: 'Sữa Non Kim Long',
        brand: BRANDS.KIM_LONG,
        category: 'flavor',
        flavorType: 'colostrum',
        price: 75000,
        volume: '100ml',
        icon: '🍼',
        description: 'Hương sữa non đục sữa tinh khiết, cung cấp vị đạm tự nhiên khiến chép không ngần ngại hút mồi sâu.',
        attraction: { carp: 84, bigCarp: 86, grassCarp: 75 },
        diffusion: 80,
        suggestedDrops: 6
    },
    {
        id: 'kl_gao_ruou',
        name: 'Gạo Rượu Kim Long',
        brand: BRANDS.KIM_LONG,
        category: 'flavor',
        flavorType: 'wine_rice',
        price: 65000,
        volume: '200g',
        icon: '🍶',
        description: 'Men gạo rượu lên men tự nhiên, hương nồng ấm kích thích tiêu hóa và kích phát bản năng lục lọi kiếm mồi của chép đáy.',
        attraction: { carp: 92, bigCarp: 94, grassCarp: 80 },
        diffusion: 82,
        suggestedDrops: 5
    },

    // ==================== SA PHẠM ====================
    {
        id: 'sp_luc_huong',
        name: 'Lục Hương Sa Phạm',
        brand: BRANDS.SA_PHAM,
        category: 'flavor',
        flavorType: 'six_flavor',
        price: 110000,
        volume: '100ml',
        icon: '🌟',
        description: 'Bộ công thức 6 loại tinh chất bí truyền của đại sư Sa Phạm, cân bằng tuyệt hảo giữa vị thơm, ngọt, chua nhẹ và thảo mộc.',
        attraction: { carp: 95, bigCarp: 92, grassCarp: 88 },
        diffusion: 95,
        suggestedDrops: 4
    },
    {
        id: 'sp_sua_non',
        name: 'Sữa Non Sa Phạm',
        brand: BRANDS.SA_PHAM,
        category: 'flavor',
        flavorType: 'colostrum',
        price: 85000,
        volume: '120ml',
        icon: '🥛',
        description: 'Hương sữa bột non nhập khẩu, mùi thơm dịu nhẹ thoang thoảng không bị gắt, giữ ổ cá cực kỳ lâu tàn.',
        attraction: { carp: 85, bigCarp: 88, grassCarp: 75 },
        diffusion: 86,
        suggestedDrops: 5
    },
    {
        id: 'sp_tinh_khoai_lang',
        name: 'Tinh Chất Khoai Lang Sa Phạm',
        brand: BRANDS.SA_PHAM,
        category: 'flavor',
        flavorType: 'sweet_potato',
        price: 95000,
        volume: '100ml',
        icon: '🍠',
        description: 'Khoai mật nướng xông khói kết hợp acid amin dẫn dụ cá chép sục bùn liên tục, tạo nên những chùm tăm đùn ngùn ngụt.',
        attraction: { carp: 94, bigCarp: 97, grassCarp: 82 },
        diffusion: 80,
        suggestedDrops: 4
    },
    {
        id: 'sp_gao_ruou',
        name: 'Gạo Rượu Sa Phạm',
        brand: BRANDS.SA_PHAM,
        category: 'flavor',
        flavorType: 'wine_rice',
        price: 70000,
        volume: '250g',
        icon: '🍶',
        description: 'Hạt gạo xốp đượm men rượu gia truyền Sa Phạm, giữ cá nán lại sục mồi dưới đáy suốt nhiều giờ liền.',
        attraction: { carp: 91, bigCarp: 93, grassCarp: 85 },
        diffusion: 84,
        suggestedDrops: 5
    },

    // ==================== VUA CÂU ====================
    {
        id: 'vc_khoai',
        name: 'Hương Liệu Khoai Vua Câu',
        brand: BRANDS.VUA_CAU,
        category: 'flavor',
        flavorType: 'sweet_potato',
        price: 80000,
        volume: '100ml',
        icon: '🍠',
        description: 'Dòng hương liệu 5 vị Vua Câu: Vị khoai thơm thanh khiết, chuyên dùng phối cùng cám nền câu đài thi đấu.',
        attraction: { carp: 89, bigCarp: 90, grassCarp: 76 },
        diffusion: 82,
        suggestedDrops: 5
    },
    {
        id: 'vc_dau',
        name: 'Hương Liệu Dâu Vua Câu',
        brand: BRANDS.VUA_CAU,
        category: 'flavor',
        flavorType: 'strawberry',
        price: 80000,
        volume: '100ml',
        icon: '🍓',
        description: 'Dòng hương liệu 5 vị Vua Câu: Vị dâu tươi chua ngọt kích thích vị giác của chép đỏ và chép lai tốc độ cao.',
        attraction: { carp: 88, bigCarp: 78, grassCarp: 82 },
        diffusion: 90,
        suggestedDrops: 5
    },
    {
        id: 'vc_tao_do',
        name: 'Hương Liệu Táo Đỏ Vua Câu',
        brand: BRANDS.VUA_CAU,
        category: 'flavor',
        flavorType: 'red_apple',
        price: 80000,
        volume: '100ml',
        icon: '🍎',
        description: 'Dòng hương liệu 5 vị Vua Câu: Vị táo đỏ ngọt thanh nhã, làm dịu vị tanh của bùn rãnh sâu.',
        attraction: { carp: 85, bigCarp: 84, grassCarp: 86 },
        diffusion: 85,
        suggestedDrops: 4
    },
    {
        id: 'vc_trung_sua',
        name: 'Hương Liệu Trứng Sữa Vua Câu',
        brand: BRANDS.VUA_CAU,
        category: 'flavor',
        flavorType: 'egg_milk',
        price: 85000,
        volume: '100ml',
        icon: '🥚',
        description: 'Dòng hương liệu 5 vị Vua Câu: Trứng gà tươi phối sữa đặc giàu lipid béo ngậy, cá chép háu ăn cắn dập dềnh.',
        attraction: { carp: 90, bigCarp: 89, grassCarp: 79 },
        diffusion: 88,
        suggestedDrops: 6
    },
    {
        id: 'vc_hoa_qua_chua',
        name: 'Hương Hoa Quả Chua Vua Câu',
        brand: BRANDS.VUA_CAU,
        category: 'flavor',
        flavorType: 'sour_fruit',
        price: 80000,
        volume: '100ml',
        icon: '🍋',
        description: 'Dòng hương liệu 5 vị Vua Câu: Vị hoa quả lên men chua nhẹ, đặc trị ngày thời tiết thay đổi, áp suất giảm, cá ngộp thiếu oxy.',
        attraction: { carp: 92, bigCarp: 85, grassCarp: 92 },
        diffusion: 94,
        suggestedDrops: 4
    },

    // ==================== GẤU VƯƠNG (GUF) ====================
    {
        id: 'guf_bo_ba_san_hang',
        name: 'Bộ 3 Hương Liệu GUF Săn Hàng',
        brand: BRANDS.GUF,
        category: 'flavor',
        flavorType: 'guf_trio',
        price: 240000,
        volume: 'Bộ 3 chai x 100ml',
        icon: '🐻',
        description: 'Vũ khí tối thượng của thương hiệu GUF: Kết hợp Sữa non tinh khiết + Tinh chất Khoai mật + Tinh mùi Thảo dược Săn Hàng, bắt trọn chép củ 8kg - 20kg.',
        attraction: { carp: 92, bigCarp: 99, grassCarp: 90 },
        diffusion: 96,
        suggestedDrops: 7
    },
    {
        id: 'guf_tinh_mui_chep_cu',
        name: 'Tinh Mùi Chép Củ Gấu Vương',
        brand: BRANDS.GUF,
        category: 'flavor',
        flavorType: 'guf_monster',
        price: 135000,
        volume: '120ml',
        icon: '🏆',
        description: 'Tinh chất chuyên biệt của GUF nhắm vào thói quen ăn mồi của chép lâu năm ranh ma, ép cá mở miệng hút mồi.',
        attraction: { carp: 89, bigCarp: 98, grassCarp: 84 },
        diffusion: 88,
        suggestedDrops: 5
    },

    // ==================== PHÚ THÀNH ====================
    {
        id: 'pt_moi_chep_so_1',
        name: 'Cám Chép Phú Thành Số 1',
        brand: BRANDS.PHU_THANH,
        category: 'base_bait',
        flavorType: 'cereal',
        price: 35000,
        volume: '500g',
        icon: '🌾',
        description: 'Cám nền chép quốc dân tại Việt Nam, hạt mồi tơi xốp, màu vàng nâu tự nhiên, tỏa tầng đáy cực đều.',
        attraction: { carp: 85, bigCarp: 82, grassCarp: 80 },
        waterRatio: 0.8
    },
    {
        id: 'pt_sua_non',
        name: 'Sữa Non Phú Thành',
        brand: BRANDS.PHU_THANH,
        category: 'flavor',
        flavorType: 'colostrum',
        price: 55000,
        volume: '100g bột',
        icon: '🥛',
        description: 'Sữa non dạng bột mịn nguyên chất của Phú Thành, tạo độ ngậy béo tự nhiên cho cám nền.',
        attraction: { carp: 83, bigCarp: 84, grassCarp: 75 },
        diffusion: 82,
        suggestedDrops: 4
    },
    {
        id: 'pt_chep_oc',
        name: 'Mồi Chép Ốc Phú Thành Đặc Biệt',
        brand: BRANDS.PHU_THANH,
        category: 'base_bait',
        flavorType: 'snail_protein',
        price: 45000,
        volume: '500g',
        icon: '🐚',
        description: 'Cám nền bổ sung bột thịt ốc bươu sấy khô và đạm nhuyễn thể, chép củ và trắm đen đặc biệt thích sục ổ.',
        attraction: { carp: 87, bigCarp: 94, grassCarp: 72 },
        waterRatio: 0.85
    },

    // ==================== NGÔ Ủ & ỐC NGÂM (MỒI THỰC PHẨM) ====================
    {
        id: 'base_ngo_u_men',
        name: 'Ngô Hạt Ủ Men Hương Liệu',
        brand: 'Cơ Bản',
        category: 'base_bait',
        flavorType: 'fermented_corn',
        price: 40000,
        volume: '1000g',
        icon: '🌽',
        description: 'Ngô nếp hạt ủ men chua ngọt nở bung. Trắm cỏ mê ngô, ăn rất nhanh; chép củ thích ngô ủ hương liệu hơn cám; trắm đen ít để ý.',
        attraction: { carp: 86, bigCarp: 90, grassCarp: 96 },
        waterRatio: 0.7
    },
    {
        id: 'base_oc_ngam',
        name: 'Ốc Bươu Ngâm Hương Liệu',
        brand: 'Cơ Bản',
        category: 'base_bait',
        flavorType: 'snail_protein',
        price: 55000,
        volume: '500g',
        icon: '🐌',
        description: 'Ốc bươu đập dập ngâm hương liệu đậm. Trắm đen và chép củ cực mê, cá lớn dễ sục ổ; rô phi và trắm cỏ ít ăn.',
        attraction: { carp: 88, bigCarp: 97, grassCarp: 60 },
        waterRatio: 0.8
    },

    // ==================== CÁM NỀN THÊM ====================
    {
        id: 'base_cargill_dam',
        name: 'Cám Nền Cargill Cao Đạm 40%',
        brand: 'Cơ Bản',
        category: 'base_bait',
        flavorType: 'fishmeal',
        price: 30000,
        volume: '1000g',
        icon: '🥜',
        description: 'Cám cá xay mịn hàm lượng đạm cao, mồi xả bung tỏa thu hút đàn cá tụ lại nhanh chóng.',
        attraction: { carp: 80, bigCarp: 85, grassCarp: 78 },
        waterRatio: 0.75
    },

    // ==================== CẦN ĐÀI & THIẾT BỊ ====================
    {
        id: 'rod_handing_54',
        name: 'Cần Handing Long Vân 5.4m (4H)',
        brand: BRANDS.EQUIPMENT,
        category: 'rod',
        length: 5.4,
        hardness: '4H',
        price: 650000,
        icon: '🎣',
        description: 'Độ nảy dẻo 4H, cảm giác dòng cá uốn cong tuyệt hảo, chuyên đánh cá chép từ 1kg - 5kg nhạy bén.',
        maxFishWeight: 8
    },
    {
        id: 'rod_handing_63',
        name: 'Cần Handing Nhất Hào Chuẩn 6.3m (5H)',
        brand: BRANDS.EQUIPMENT,
        category: 'rod',
        length: 6.3,
        hardness: '5H',
        price: 950000,
        icon: '🎣',
        description: 'Cần đài quốc dân 5H cân bằng hoàn hảo, công thủ toàn diện, bắt chép củ 3kg - 10kg chắc nịch.',
        maxFishWeight: 14
    },
    {
        id: 'rod_huyen_vu_72',
        name: 'Cần Huyền Vũ Khắc Kỷ 7.2m (6H)',
        brand: BRANDS.EQUIPMENT,
        category: 'rod',
        length: 7.2,
        hardness: '6H',
        price: 1450000,
        icon: '🎣',
        description: 'Cần tầm xa 7.2m vươn tới các ổ sâu giữa hồ, tải tĩnh 3.5kg, đánh chép củ rãnh bùn hồ dịch vụ.',
        maxFishWeight: 20
    },
    {
        id: 'rod_guf_81',
        name: 'Cần Hắc Long Săn Hàng GUF 8.1m (8H)',
        brand: BRANDS.EQUIPMENT,
        category: 'rod',
        length: 8.1,
        hardness: '8H',
        price: 2200000,
        icon: '🎣',
        description: 'Bảo kiếm săn thủy quái 8H siêu bạo lực, bắt sống cụ chép củ gấu 10kg - 25kg không ngán một ai.',
        maxFishWeight: 35
    },

    // ==================== PHAO ĐÀI CHUYÊN CHÉP ====================
    {
        id: 'float_kl_co',
        name: 'Phao Cỏ Chép Củ Kim Long',
        brand: BRANDS.EQUIPMENT,
        category: 'float',
        price: 120000,
        icon: '🪶',
        description: 'Làm từ cỏ sậy tự nhiên, ngọn phao 13 nấc to rõ nét, chống sóng gió hồ lớn, tín hiệu thụt lút và nhấc vạch cực êm.',
        sensitivity: 90,
        visibleMarks: 13
    },
    {
        id: 'float_sp_nano',
        name: 'Phao Nano Sa Phạm Siêu Nhạy',
        brand: BRANDS.EQUIPMENT,
        category: 'float',
        price: 140000,
        icon: '🎯',
        description: 'Chất liệu Nano sơn phản quang thế hệ mới, bắt trọn từng nhịp nháy đè 0.5s và phao dập dềnh của chép nhát mồi.',
        sensitivity: 98,
        visibleMarks: 11
    },
    {
        id: 'float_led_night',
        name: 'Phao Đèn Săn Đêm Đổi Màu',
        brand: BRANDS.EQUIPMENT,
        category: 'float',
        price: 180000,
        icon: '💡',
        description: 'Phao LED quang học: Khi cá cắn phao tự động chuyển từ xanh sang đỏ rực, chuyên câu đêm săn chép củ.',
        sensitivity: 92,
        visibleMarks: 9
    }
];
