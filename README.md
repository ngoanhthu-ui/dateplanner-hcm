# dateplanner-hcm
DatePlanner  - Hẹn hò &amp; Đi chơi hội nhóm
 Date Planner - Nền Tảng Thiết Lập Kế Hoạch Hẹn Hò Trọn Gói Sài Gòn

Date Planner là một nền tảng Thương mại điện tử B2B2C vận hành theo mô hình O2O (Online-to-Offline) kết hợp Đẩy Lead nhận E-Voucher (Lead Generation Marketplace). Dự án được thiết kế chuyên biệt nhằm giải quyết triệt để hội chứng FOBO (Fear of Better Options) và nỗi đau "Đi đâu cũng được" của giới trẻ (Gen Z) tại TP.HCM khi lên kế hoạch đi chơi, hẹn hò.

 Môi trường chạy Live: https://dateplanner-hcm.netlify.app/

 Cổng quản trị đối tác B2B: https://dateplanner-hcm.netlify.app/admin.html (Mã PIN : DP2026B2B!)

 Tính Năng Cốt Lõi (Core Features)

1. Phân Hệ Khách Hàng (C-Side Experience)

- Bắt mạch cảm xúc (Mood Quiz): Sử dụng thuật toán thông minh để phân tích trạng thái tâm lý thời gian thực (Chill, Năng động, Lãng mạn, Vui nhộn), từ đó đề xuất lộ trình combo phù hợp nhất từ kho dữ liệu.

- Vòng quay nhân phẩm (Randomizer): Cơ chế ra quyết định ngẫu nhiên đầy thú vị cho những cặp đôi phân vân không biết đi đâu.

- Tạo thiệp mời hẹn hò (E-Invite Creator): Công cụ đắc lực hỗ trợ người dùng tạo các thiệp mời số hóa mang cá tính riêng gửi cho đối phương qua Zalo/Messenger. Đây là kênh tiếp thị truyền thống mang tính đột phá với hệ số lan truyền tự nhiên đạt mức $K$-factor = 1.2, giúp tối ưu hóa chi phí thu hút khách hàng (CAC ~ 2.100đ).

- Trình phát nhạc lofi tương tác: Tích hợp bộ phát nhạc du dương trực tiếp trên Web, tối ưu hóa thời gian giữ chân người dùng (Time-on-site) và tăng tỷ lệ chuyển đổi (Conversion Rate).

- Bảo mật dữ liệu cá nhân (PDPA): Tuân thủ chặt chẽ Nghị định 13/2023/NĐ-CP của Chính phủ Việt Nam về bảo vệ dữ liệu cá nhân của người dùng.

2. Phân Hệ Đối Tác B2B (Merchant Portal)

 Đồng bộ thời gian thực (Cloud Real-time Sync): Tự động nhận dữ liệu khách hàng (Leads) đăng ký từ trang chủ về bảng quản trị Admin thông qua cổng kết nối Google Firebase Cloud Firestore mà không cần tải lại trang (No F5).

 Mô hình hoa hồng CPA động (Cost Per Sale): Nền tảng tự động nhận diện phân khúc giá combo (Bình dân 5k, Tiêu chuẩn 15k, Cao cấp 30k) để tính toán chính xác dòng tiền hoa hồng thu về từ các lượt mã Voucher đã sử dụng.

 Trích xuất dữ liệu đối soát (.csv): Hỗ trợ xuất dữ liệu báo cáo tài chính trực quan ra định dạng Excel hỗ trợ Tiếng Việt (BOM UTF-8) để chốt sổ tài chính cuối tháng với các đối tác.

 Công Nghệ Sử Dụng (Tech Stack)

Hệ thống được thiết kế theo kiến trúc Serverless hiện đại, tối giản chi phí tài nguyên phần cứng nhưng đảm bảo tính ổn định tối đa:

Frontend UI/UX: HTML5, Tailwind CSS (JIT Engine), FontAwesome v6, Google Font Inter.

Database & Cloud Logic: Google Firebase NoSQL Firestore (SDK v10 Module).

Email Gateway: EmailJS API (Tự động gửi email thông báo lộ trình chi tiết và mã code về hòm thư khách hàng).

 Cấu Trúc Mã Nguồn (Repository Directory)

dateplanner-hcm/
│
├── index.html          # Trang chủ chính thức dành cho khách hàng trải nghiệm
├── admin.html          # Cổng thông tin đăng nhập và quản lý dành cho Đối tác B2B
├── app.js              # "Bộ não" xử lý Logic, Firebase SDK và kết nối API đám mây
├── data.js             # Kho dữ liệu danh mục 19 combo lộ trình hẹn hò demo chính thức
├── favicon.png         # Logo favicon định dạng PNG chất lượng cao của website
├── logodateplanner.jpg # Ảnh Logo đại diện chính thức của Date Planner Sài Gòn
├── concept_analysis.md # Tài liệu đặc tả học thuật về Mô hình Kinh doanh O2O
└── [assets]            # Các hình ảnh lộ trình thực tế tại TP.HCM (acoustic.jpg, sup,...)


 Hướng Dẫn Cấu Hình Và Chạy Thử (Installation Guide)

1. Yêu cầu hệ thống

Đã cài đặt VS Code (Visual Studio Code).

Đã cài đặt Extension Live Server trên VS Code.

2. Các bước triển khai dưới Local máy tính

Tải mã nguồn: Clone repository này về máy tính cá nhân hoặc tải file .zip và giải nén.

git clone [https://github.com/ngoanhthu-ui/dateplanner-hcm.git](https://github.com/ngoanhthu-ui/dateplanner-hcm.git)


Mở dự án: Khởi động VS Code, chọn File -> Open Folder và tìm tới thư mục vừa giải nén.


Kích hoạt Live Server: Click chuột phải vào file index.html -> Chọn Open with Live Server (hoặc bấm nút Go Live ở góc dưới cùng bên phải VS Code). Trình duyệt sẽ tự động mở trang web ở địa chỉ mặc định http://127.0.0.1:5500.

 Ban Quản Trị Dự Án (Project Contributors)

Dự án được lên kế hoạch, giám sát và vận hành thực tế bởi nhóm sinh viên bộ môn Quản lý Dự án Thương mại Điện tử:

Ngô Anh Thư : Trưởng nhóm / Giám đốc Sản phẩm (Project Manager & Tech Leader) - Thiết lập cấu trúc hệ thống, phát triển cốt lõi logic mã nguồn và cấu hình Firebase Cloud.

Đinh Thị Quỳnh Thư: Giám đốc Tài chính (CFO) - Phụ trách xây dựng Project Charter, tính toán dòng tiền, dự toán bài toán kinh tế khả thi (NPV, ROI).

Nguyễn Ngô Gia Hân: Giám đốc Vận hành & QC (COO) - Thiết lập cấu trúc phân rã công việc WBS, Sơ đồ mạng AON, Quản trị rủi ro hệ thống và QA/QC dữ liệu.

Đào Phương Hiền: Giám đốc Marketing (CMO) - Xây dựng kế hoạch tiếp cận thị trường SOSTAC, thiết lập bộ khung Canvas (BMC) và viết kịch bản Lời nhắn thả thính (E-Card).

 Giấy Phép & Cam Kết Bản Quyền

Dự án được xây dựng phục vụ cho mục đích nghiên cứu học tập và phát triển ứng dụng khởi nghiệp công nghệ. Vui lòng ghi rõ nguồn Date Planner Project - Team Ngô Anh Thư khi sử dụng lại tài nguyên hoặc phát triển các nhánh mã nguồn kế thừa.
