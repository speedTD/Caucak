// Dữ liệu 6 Hồ Câu Đài Dịch Vụ Nổi Tiếng Việt Nam
// Mỗi hồ có Map riêng biệt (kích thước, độ sâu, màu nước, phong cảnh, cá chủ lực)
// và Chủ Hồ có tính cách, khẩu khí, trang phục, phong cách mở cổng riêng!

export const LAKES_DATA = [
    {
        id: 'lake_dai_yen',
        name: 'Hồ Câu Đại Yên',
        location: 'Chương Mỹ, Hà Nội',
        tagline: 'Thánh Địa Trắm Đen Khủng & Rãnh Sâu Đáy Bùn',
        description: 'Hồ nước sâu bán tự nhiên nổi tiếng với những luồng rãnh bùn dẻo sâu 3.8m. Nơi quy tụ những cụ Trắm Đen khổng lồ từ 8kg đến trên 18kg và Chép sông gù lưng. Nước sâu áp lực lớn, cá ăn cực đầm tay!',
        halfW: 85,
        halfD: 22, // 170m x 44m (Hình chữ nhật dài chuẩn hồ đài thi đấu VN, ngồi bờ này thấy bờ đối diện)
        depth: 3.8,
        waterColor: 0x1b4332, // Xanh rêu đầm sâu
        rainyWaterColor: 0x4a3b22,
        skyColor: 0x7dd3fc,
        fogDensity: 0.0024,
        ticketPrice: 300000,
        ticketPrice5h: 300000,
        stockEveryDays: 2,
        difficulty: 'Chuyên Gia (Nước rất sâu 3.8m, cá to ăn tinh tế)',
        features: 'Rãnh đáy sâu 3.8m, hàng bạch đàn cổ thụ soi bóng, cầu gỗ lim kiên cố, gió mát Chương Mỹ',
        fishSpecies: [
            { name: 'Cụ Trắm Đen Đại Yên', weightRange: [8.0, 18.5], rarity: 'Cực Hiếm', icon: '🖤', color: '#1e293b' },
            { name: 'Cá Chép Sông Gù Lưng', weightRange: [4.0, 11.0], rarity: 'Hiếm', icon: '🐟', color: '#f59e0b' },
            { name: 'Cá Trắm Cỏ Củ', weightRange: [4.5, 12.5], rarity: 'Hiếm', icon: '🌿', color: '#65a30d' },
            { name: 'Cá Rô Phi Bàn Tay', weightRange: [1.2, 2.8], rarity: 'Phổ Biến', icon: '🐠', color: '#0284c7' }
        ],
        owner: {
            name: 'Bác Năm Đại Yên',
            title: 'Chủ Hồ Đại Yên',
            avatar: '👴',
            personality: 'Nghiêm nghị, chuẩn chỉ, am hiểu kỹ thuật đài rãnh sâu đáy, quý cần thủ biết giữ gìn vệ sinh hồ',
            quote: 'Hồ nước sâu rãnh cá đáy, anh em xả mồi vừa tay thôi kẻo đè ổ! Câu đúng bài ốc ngâm men là trắm đen củ 15kg vào việc ngay.',
            gateGreeting: '06:00 rồi, bác Năm mở cổng đây! Anh em vào bến trật tự, nhớ không quăng mồi đè ổ nhau nhé!',
            shirtColor: 0x1e3a5f, // Xanh than nghiêm trang
            pantsColor: 0x334155,
            hatColor: 0x475569,
            hasVest: true
        }
    },
    {
        id: 'lake_duy_nguyen',
        name: 'Hồ Câu Duy Nguyên',
        location: 'Thanh Trì, Hà Nội',
        tagline: 'Đấu Trường Đài Thể Thao - Nhịp Phao Nhộn Nhịp Tốc Độ',
        description: 'Hồ đài thi đấu phong trào được thiết kế chuẩn mực. Mật độ cá cực dày với Chép Đỏ, Chép Vàng, Rô Phi Củ. Nước nông 2.4m trong xanh, nhịp phao dồn dập, giã gạo liên tục, đòi hỏi tốc độ giật nhanh chuẩn xác!',
        halfW: 80,
        halfD: 20, // 160m x 40m (Hình chữ nhật dài chuẩn thi đấu, nhìn rõ bờ đối diện)
        depth: 2.4,
        waterColor: 0x0e7490, // Xanh ngọc thể thao lấp lánh
        rainyWaterColor: 0x5c4928,
        skyColor: 0x38bdf8,
        fogDensity: 0.0018,
        ticketPrice: 250000,
        ticketPrice5h: 250000,
        stockEveryDays: 1, // Bồi cá 1 ngày/lần
        difficulty: 'Trung Bình (Tốc độ cá ăn cao, phao giã gạo liên tục)',
        features: 'Cầu gỗ thẳng tắp, ô che thể thao rực rỡ, bến phẳng lỳ, cá rô phi củ và chép đỏ dày đặc',
        fishSpecies: [
            { name: 'Cá Rô Phi Củ Duy Nguyên', weightRange: [1.5, 3.8], rarity: 'Phổ Biến', icon: '🐠', color: '#0ea5e9' },
            { name: 'Cá Chép Đỏ May Mắn', weightRange: [2.0, 5.2], rarity: 'Đặc Biệt', icon: '🏮', color: '#ef4444' },
            { name: 'Cá Chép Vàng Óng', weightRange: [1.8, 5.5], rarity: 'Phổ Biến', icon: '✨', color: '#facc15' },
            { name: 'Cá Diếc Hoa Đài Loan', weightRange: [0.6, 1.4], rarity: 'Nhiều', icon: '🐟', color: '#94a3b8' }
        ],
        owner: {
            name: 'Anh Duy Nguyên',
            title: 'Chủ Hồ Duy Nguyên',
            avatar: '🧢',
            personality: 'Trẻ trung, xởi lởi, nhiệt tình, mê thể thao câu đài, hay tặng nước ngọt và tổ chức mini game',
            quote: 'Cá hồ em mới về ăn tơi bời anh em ơi! Cứ cám bùi thơm nhuyễn là phao giã gạo liên tục, lên cá là em livestream khoe bến liền!',
            gateGreeting: 'Cổng mở rồi anh em ùa vào thôi! Bến đầu gió hôm nay tăm sủi như sôi, vào việc thôi nào!',
            shirtColor: 0xd97706, // Cam thể thao năng động
            pantsColor: 0x1e293b,
            hatColor: 0xef4444,
            hasVest: false
        }
    },
    {
        id: 'lake_bao_minh',
        name: 'Hồ Câu Bảo Minh',
        location: 'Đông Anh, Hà Nội',
        tagline: 'Không Gian Xanh Mát - Chuyên Chép Giòn & Chép Củ',
        description: 'Hồ câu sinh thái cảnh quan đẹp như công viên, bờ kè thoải cỏ xanh mướt và giàn hoa giấy rực rỡ. Chuyên thả Chép Giòn thơm thịt và Chép Củ Ta. Nước lắng trong mát mẻ, không khí trong lành thư thái.',
        halfW: 85,
        halfD: 21, // 170m x 42m (Hình chữ nhật dài, nhìn thấy bờ đối diện)
        depth: 2.8,
        waterColor: 0x047857, // Xanh lục bảo sinh thái
        rainyWaterColor: 0x574625,
        skyColor: 0x67e8f9,
        fogDensity: 0.0020,
        ticketPrice: 250000,
        ticketPrice5h: 250000,
        stockEveryDays: 1,
        difficulty: 'Dễ - Trung Bình (Cảnh quan thư thái, cá chép giòn háu ăn)',
        features: 'Bờ kè cỏ nhật xanh mượt, giàn hoa giấy rực rỡ, chòi câu sinh thái lợp ngói mát lạnh',
        fishSpecies: [
            { name: 'Cá Chép Giòn Bảo Minh', weightRange: [2.5, 6.8], rarity: 'Hiếm', icon: '🐡', color: '#f97316' },
            { name: 'Cá Chép Củ Ta Vàng Óng', weightRange: [3.5, 9.5], rarity: 'Hiếm', icon: '🐟', color: '#eab308' },
            { name: 'Cá Trắm Cỏ Đầm', weightRange: [3.0, 8.5], rarity: 'Phổ Biến', icon: '🌿', color: '#84cc16' }
        ],
        owner: {
            name: 'Chú Minh Bảo Minh',
            title: 'Chủ Hồ Bảo Minh',
            avatar: '🧔',
            personality: 'Hòa nhã, điềm đạm, yêu thiên nhiên, luôn chăm chút từng bến câu sạch đẹp thoáng đãng',
            quote: 'Bảo Minh đón anh em bằng sự chân tình. Cứ ngồi bến gió mát, nhâm nhi chén trà, phao bềnh nhịp 2 là vào việc cá chép củ!',
            gateGreeting: 'Chào các bác cần thủ! Cổng đã mở, chúc mọi người một ngày rực rỡ cần cong vút!',
            shirtColor: 0x059669, // Xanh lá sinh thái
            pantsColor: 0xd97706,
            hatColor: 0xfef08a,
            hasVest: true
        }
    },
    {
        id: 'lake_thuy_huong',
        name: 'Hồ Thụy Hương',
        location: 'Chương Mỹ, Hà Nội',
        tagline: 'Đầm Nước Rộng Tự Nhiên - Quái Vật Trắm Đen Vùng Ngoại Thành',
        description: 'Đầm nước tự nhiên rộng lớn bậc nhất vùng ven đô (200m x 120m), nước sâu tới 4.2m. Nơi ẩn mình của những con cá Trắm Đen quái vật trên 15kg - 20kg. Không gian hoang sơ, đầm sen ngát hương, cá dòng cực kỳ dũng mãnh!',
        halfW: 95,
        halfD: 24, // 190m x 48m (Đầm nước dài hẹp tự nhiên)
        depth: 4.2,
        waterColor: 0x1e3a8a, // Xanh thẳm đầm sâu
        rainyWaterColor: 0x47391b,
        skyColor: 0x60a5fa,
        fogDensity: 0.0028,
        ticketPrice: 300000,
        ticketPrice5h: 300000,
        stockEveryDays: 2,
        difficulty: 'Khó (Đầm rộng bao la, nước sâu 4.2m cần ghì cá dẻo tay)',
        features: 'Đầm sen thơm ngát ven bờ, rặng tre ken dày, bãi cỏ hoang sơ, sóng nước mênh mông',
        fishSpecies: [
            { name: 'Trắm Đen Quái Vật Thụy Hương', weightRange: [9.0, 21.0], rarity: 'Huyền Thoại', icon: '👑', color: '#0f172a' },
            { name: 'Cá Trắm Cỏ Đầm Cụ', weightRange: [5.0, 14.0], rarity: 'Hiếm', icon: '🌿', color: '#4d7c0f' },
            { name: 'Cá Chép Sông Hoang Dã', weightRange: [3.0, 8.5], rarity: 'Phổ Biến', icon: '🐟', color: '#ca8a04' }
        ],
        owner: {
            name: 'Bác Thụy',
            title: 'Chủ Hồ Thụy Hương',
            avatar: '🤠',
            personality: 'Chân chất, tếu táo, hào sảng đậm chất nông dân Chương Mỹ, thích uống trà đá chém gió',
            quote: 'Hồ tao đầm rộng nước sâu, dưới đáy toàn mấy cụ trắm đen bằng bắp đùi! Anh em dòng cá nhớ thủ dây bảo hiểm không nó lôi cả người xuống tắm đấy!',
            gateGreeting: 'Mở cổng rồi tụi bay ơi! Chạy bến nhanh kẻo thằng khác nó chiếm mất ổ đầu cống bây giờ!',
            shirtColor: 0x854d0e, // Áo nâu dân tộc giản dị
            pantsColor: 0x1f2937,
            hatColor: 0xca8a04,
            hasVest: false
        }
    },
    {
        id: 'lake_cu_gau',
        name: 'Hồ Câu Củ Gấu',
        location: 'Đan Phượng, Hà Nội',
        tagline: 'Thánh Địa Chép Củ & Săn Hàng Khủng Miền Bắc',
        description: 'Hồ nước sâu bán tự nhiên nổi tiếng miền Bắc, đáy hồ có bùn dẻo và rãnh sâu 3.2m. Nơi quy tụ những cụ chép củ từ 5kg đến trên 16kg. Cá ở đây rất khôn, hay ăn 2 nhịp hoặc bấm giữ 1 nấc!',
        halfW: 85,
        halfD: 22, // 170m x 44m (Hình chữ nhật dài chuẩn hồ đài Củ Gấu, nhìn rõ bờ đối diện)
        depth: 3.2,
        waterColor: 0x155e75, // Xanh lam ngọc đậm
        rainyWaterColor: 0x544322,
        skyColor: 0x38bdf8,
        fogDensity: 0.0022,
        ticketPrice: 350000,
        ticketPrice5h: 350000,
        stockEveryDays: 1,
        difficulty: 'Khó (Cá củ khôn ranh, đòi hỏi bài mồi chuẩn và kiên nhẫn)',
        features: 'Rặng tre xanh ngát ven bờ, chòi câu lá cọ, bến gỗ mộc mạc, rãnh cá bùn dẻo',
        fishSpecies: [
            { name: 'Cá Chép Củ Gấu', weightRange: [5.0, 16.5], rarity: 'Cực Hiếm', icon: '👑', color: '#ffd700' },
            { name: 'Cá Chép Sông Hồng', weightRange: [3.5, 9.5], rarity: 'Hiếm', icon: '🐟', color: '#ff9900' },
            { name: 'Cá Chép Ta Gù Lưng', weightRange: [2.0, 5.5], rarity: 'Phổ Biến', icon: '🐠', color: '#e6c300' },
            { name: 'Cá Trắm Cỏ Củ', weightRange: [4.0, 12.0], rarity: 'Hiếm', icon: '🌿', color: '#88bb44' }
        ],
        owner: {
            name: 'Bác Tuấn Củ Gấu',
            title: 'Chủ Hồ Củ Gấu',
            avatar: '👨‍🌾',
            personality: 'Sòng phẳng, bộc trực, đam mê cá củ, bồi cá đúng hẹn tăm nổi tơi bời',
            quote: 'Củ Gấu bồi cá đúng hẹn, cá lên bến nào cũng có quà, anh em cứ đúng bài mồi đài ủ men mà chiến là rọng đầy cá!',
            gateGreeting: 'Đúng 6h mở cổng! Anh em chạy chỗ cẩn thận kẻo trượt chân, chúc cả hồ hôm nay nổ rọng!',
            shirtColor: 0x0284c7, // Xanh da trời cần thủ
            pantsColor: 0x475569,
            hatColor: 0xfbbf24,
            hasVest: true
        }
    },
    {
        id: 'lake_hoan_boss',
        name: 'Hồ Câu Hoàn Boss (Đại Khai Trương)',
        location: 'Gia Lâm, Hà Nội',
        isOpening: true,
        tagline: '🔥 ĐẠI KHAI TRƯƠNG BÃOCÁ - 500k/5h - Săn Giải Boss Khuyên Vàng Tiền Triệu',
        description: 'Hồ VIP đang trong tuần lễ ĐẠI KHAI TRƯƠNG bão cá 3 tấn! Giá vé khai trương 500,000đ/5h với mật độ cá củ dày đặc và 8 cụ cá Boss đeo khuyên vàng thưởng nóng 500,000đ tiền tươi tại chỗ!',
        halfW: 90,
        halfD: 22, // 180m x 44m (Hồ VIP chữ nhật dài)
        depth: 3.0,
        waterColor: 0x115e59, // Xanh ngọc lục bảo VIP
        rainyWaterColor: 0x5a4827,
        skyColor: 0x0284c7,
        fogDensity: 0.0020,
        ticketPrice: 500000,
        ticketPrice5h: 500000,
        stockEveryDays: 1,
        difficulty: 'VIP Khai Trương (Mật độ cá cực dày, cá Boss đeo khuyên vàng 500k)',
        features: 'Cờ hoa khai trương rực rỡ, bến câu kè đá hoa cương, cọc tiêu giải thưởng VIP, đèn cao áp ban đêm',
        fishSpecies: [
            { name: 'Chép Boss Đeo Khuyên Vàng (+500k Thưởng)', weightRange: [8.0, 18.0], rarity: 'Huyền Thoại', icon: '🏆', color: '#ff0055' },
            { name: 'Cá Trắm Đen Cụ Hoàn Boss', weightRange: [7.0, 16.5], rarity: 'Cực Hiếm', icon: '🖤', color: '#18181b' },
            { name: 'Cá Chép Cụ Đầm Cát', weightRange: [4.5, 11.5], rarity: 'Hiếm', icon: '🐟', color: '#cca010' }
        ],
        owner: {
            name: 'Anh Hoàn Boss',
            title: 'Chủ Hồ Hoàn Boss',
            avatar: '🕶️',
            personality: 'Đại gia chịu chơi, sang trọng, phong cách VIP, đeo kính đen, chi thưởng tiền mặt cực sòng phẳng',
            quote: 'Hôm nay Hoàn Boss ĐẠI KHAI TRƯƠNG bão cá 3 tấn, giá vé 500k/5h! Em thả 8 cụ Boss đeo khuyên vàng thưởng nóng 500k tiền tươi, anh em câu lên cứ mang thẳng vào nhà lán nhận tiền tươi tại chỗ!',
            gateGreeting: 'Chào mừng toàn thể anh em đến với NGÀY HỘI ĐẠI KHAI TRƯƠNG Hoàn Boss! Cổng mở rồi, vào việc săn giải thôi các đại ca!',
            shirtColor: 0x0f172a, // Áo đen VIP sang trọng
            pantsColor: 0xe2e8f0,
            hatColor: 0x1e293b,
            hasVest: true
        }
    }
];


// ==================== 5 ĐỊA HÌNH MAP 3D RIÊNG BIỆT (RANDOM VÀO CÁC HỒ) ====================
export const MAP_TERRAINS = [
    {
        id: 'ISLAND_LAGOON',
        name: '🏝️ Đảo Giữa Hồ & Cầu Gỗ',
        shortName: '🏝️ Đảo Giữa Hồ',
        desc: 'Hòn đảo cỏ xanh giữa lòng hồ với chòi vọng cảnh, cầu gỗ nối bờ và rặng liễu rủ.'
    },
    {
        id: 'LOTUS_VILLAGE',
        name: '🪷 Đầm Sen Làng Quê & Lũy Tre',
        shortName: '🪷 Đầm Sen Lũy Tre',
        desc: 'Đầm sen hồng nở rộ hai đầu hồ, bụi lau sậy và lũy tre làng mộc mạc ven bờ.'
    },
    {
        id: 'COMPETITION_ARENA',
        name: '🏟️ Đấu Trường Bê Tông VIP',
        shortName: '🏟️ Đấu Trường VIP',
        desc: 'Hồ đấu giải chuẩn chuyên nghiệp với cột đèn cao áp, băng-rôn giải thưởng & phao phân làn.'
    },
    {
        id: 'HILL_VALLEY',
        name: '⛰️ Thung Lũng Đồi Núi Tự Nhiên',
        shortName: '⛰️ Thung Lũng Núi',
        desc: 'Bao quanh là dãy đồi núi 3D nhiều tầng, tảng đá tự nhiên ven bờ kè và rừng thông.'
    },
    {
        id: 'NIGHT_CANAL_LANTERN',
        name: '🏮 Kênh Dài Lán Tôn & Đèn Lồng',
        shortName: '🏮 Lán Tôn Đèn Lồng',
        desc: 'Dãy lán tôn che mưa nắng dọc hai bờ kè cùng dây đèn lồng đỏ vàng phản chiếu mặt nước.'
    }
];

export function assignRandomTerrainsToLakes() {
    const pool = [...MAP_TERRAINS];
    // Fisher-Yates shuffle đảm bảo 5 địa hình khác nhau được phân ngẫu nhiên
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    LAKES_DATA.forEach((lake, idx) => {
        const terrain = idx < pool.length
            ? pool[idx]
            : pool[Math.floor(Math.random() * pool.length)];
        lake.terrainId = terrain.id;
        lake.terrainName = terrain.name;
        lake.terrainShortName = terrain.shortName;
        lake.terrainDesc = terrain.desc;
    });
}

// Tự động random 5 địa hình map vào các hồ khi khởi chạy
assignRandomTerrainsToLakes();
